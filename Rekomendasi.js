// ===== FILE: Rekomendasi.gs =====

/**
 * [FINAL v3.0.3] Fungsi orkestrator utama untuk mendapatkan rekomendasi penempatan VM.
 * Arsitektur dirombak total untuk menggunakan sumber kebenaran yang tepat (peta Datastore -> Cluster)
 * dan memastikan logika penyaringan berjalan dengan akurat.
 */
function dapatkanRekomendasiPenempatan(requirements, config) {
  try {
    const { headers: vmHeaders, dataRows: allVmData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    const { headers: dsHeaders, dataRows: allDsData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
    const allRules = bacaAturanPenempatan();
    const clusterPolicies = bacaKebijakanCluster();

    const applicableRule = findApplicableRule(requirements, allRules);
    if (!applicableRule) {
      return `ℹ️ Tidak ditemukan aturan penempatan yang cocok untuk Kritikalitas "${requirements.kritikalitas}".`;
    }

    // === INTI PERBAIKAN: Buat peta hubungan Datastore ke Cluster ===
    const dsToClusterMap = buildDatastoreToClusterMap(allVmData, vmHeaders, config);

    const { validCandidates, rejected } = filterLokasiByPolicy(
      requirements,
      applicableRule,
      config,
      allVmData,
      allDsData,
      dsHeaders,
      vmHeaders,
      clusterPolicies,
      dsToClusterMap
    );

    if (validCandidates.length === 0) {
      return formatPesanGagal(requirements, rejected, applicableRule);
    }

    const kandidatDenganSkor = skorLokasiKandidat(validCandidates, config, allVmData, vmHeaders);
    kandidatDenganSkor.sort((a, b) => b.skor.total - a.skor.total);

    return formatPesanRekomendasi(kandidatDenganSkor.slice(0, 3), requirements, rejected, applicableRule);
  } catch (e) {
    console.error(`Gagal mendapatkan rekomendasi: ${e.message}\nStack: ${e.stack}`);
    return `❌ Gagal memproses permintaan rekomendasi. Penyebab: ${e.message}`;
  }
}

/**
 * [BARU v3.0.3] Membangun peta hubungan antara Datastore dan Cluster dari sheet Data VM.
 * @returns {Map<string, string>} Peta di mana kuncinya adalah nama Datastore dan nilainya adalah nama Cluster.
 */
function buildDatastoreToClusterMap(allVmData, vmHeaders, config) {
  const dsToClusterMap = new Map();
  const K = KONSTANTA.KUNCI_KONFIG;
  const dsIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);

  if (dsIndex === -1 || clusterIndex === -1) {
    console.error("Header untuk Datastore atau Cluster tidak ditemukan di sheet Data VM.");
    return dsToClusterMap;
  }

  allVmData.forEach((row) => {
    const dsName = row[dsIndex];
    const clusterName = row[clusterIndex];
    if (dsName && clusterName && !dsToClusterMap.has(dsName)) {
      dsToClusterMap.set(dsName, clusterName);
    }
  });
  return dsToClusterMap;
}

/**
 * [HELPER v3.0.2] Mencari aturan yang berlaku dengan logika fallback yang "tahan banting".
 */
function findApplicableRule(req, allRules) {
  const reqKritikalitasLower = req.kritikalitas.toLowerCase();
  const reqIoLower = req.io.toLowerCase();

  const findMatch = (rule, checkIo) => {
    const ruleKritikalitasLower = (String(rule["kritikalitas"]) || "").toLowerCase();
    if (!ruleKritikalitasLower) return false;

    const kritikalitasMatch = ruleKritikalitasLower.startsWith(reqKritikalitasLower);
    if (!kritikalitasMatch) return false;

    if (checkIo) {
      const ruleIoLower = (String(rule["ioprofile"]) || "").toLowerCase();
      return ruleIoLower.startsWith(reqIoLower);
    }
    return String(rule["ioprofile"]) === "*";
  };

  let applicableRule = allRules.find((rule) => findMatch(rule, true));

  if (!applicableRule) {
    console.log(
      `Aturan spesifik untuk IO '${reqIoLower}' tidak ditemukan. Mencari aturan fallback dengan IO Profile '*'.`
    );
    applicableRule = allRules.find((rule) => findMatch(rule, false));
  }

  if (!applicableRule) {
    console.log(`Aturan untuk kritikalitas '${reqKritikalitasLower}' tidak ditemukan. Mencari aturan 'default'.`);
    applicableRule = allRules.find((rule) => (String(rule["kritikalitas"]) || "").toLowerCase() === "default");
  }

  return applicableRule;
}

/**
 * [HELPER v3.0.2] Menghitung total beban alokasi di setiap cluster.
 */
function calculateClusterLoad(allVmData, vmHeaders, config) {
  const clusterLoad = new Map();
  const K = KONSTANTA.KUNCI_KONFIG;
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
  const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);

  allVmData.forEach((vmRow) => {
    const clusterName = vmRow[clusterIndex];
    if (clusterName) {
      if (!clusterLoad.has(clusterName)) {
        clusterLoad.set(clusterName, { cpu: 0, memory: 0 });
      }
      const load = clusterLoad.get(clusterName);
      load.cpu += parseInt(vmRow[cpuIndex], 10) || 0;
      load.memory += parseFloat(vmRow[memoryIndex]) || 0;
    }
  });
  return clusterLoad;
}

/**
 * [REFACTOR v3.0.3] Menyaring lokasi berdasarkan kebijakan overcommit.
 * Kini menggunakan dsToClusterMap untuk validasi yang akurat.
 */
function filterLokasiByPolicy(
  req,
  rule,
  config,
  allVmData,
  allDsData,
  dsHeaders,
  vmHeaders,
  clusterPolicies,
  dsToClusterMap
) {
  const clusterLoad = calculateClusterLoad(allVmData, vmHeaders, config);
  const validCandidates = [];
  const rejected = [];

  const allTargetClusters = getAllTargetClusters(rule, allVmData, vmHeaders, config);

  for (const clusterName of allTargetClusters) {
    const policy = clusterPolicies.get(clusterName);

    if (!policy) {
      rejected.push({ cluster: clusterName, reason: "kebijakan_tidak_ada" });
      continue;
    }

    const physicalCpu = policy["physicalcpucores"];
    const cpuRatio = policy["cpuovercommitratio"];
    const physicalMemory = (policy["physicalmemorytb"] || 0) * 1024;
    const memoryRatio = policy["memoryovercommitratio"];

    const currentLoad = clusterLoad.get(clusterName) || { cpu: 0, memory: 0 };
    const maxCpu = physicalCpu * cpuRatio;
    const maxMemory = physicalMemory * memoryRatio;

    if (currentLoad.cpu + req.cpu > maxCpu) {
      rejected.push({
        cluster: clusterName,
        reason: "overcommit_cpu",
        current: currentLoad.cpu,
        max: maxCpu,
        ratio: `${cpuRatio}:1`,
      });
      continue;
    }
    if (currentLoad.memory + req.memory > maxMemory) {
      rejected.push({
        cluster: clusterName,
        reason: "overcommit_memori",
        current: currentLoad.memory,
        max: maxMemory,
        ratio: `${memoryRatio}:1`,
      });
      continue;
    }

    const datastoresInCluster = findDatastoresInCluster(
      clusterName,
      req,
      rule,
      config,
      allDsData,
      dsHeaders,
      dsToClusterMap
    );
    if (datastoresInCluster.length > 0) {
      validCandidates.push(...datastoresInCluster);
    } else {
      rejected.push({ cluster: clusterName, reason: "kapasitas_disk_tidak_cukup" });
    }
  }

  return { validCandidates, rejected };
}

/**
 * [HELPER v3.0.2] Mendapatkan semua cluster target berdasarkan aturan prioritas.
 */
function getAllTargetClusters(rule, allVmData, vmHeaders, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const vcenterTarget = rule["vcentertarget"];
  const vmClusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const vmVCenterIndex = vmHeaders.indexOf(config[K.HEADER_VM_VCENTER]);
  const allClustersInVCenter = [
    ...new Set(
      allVmData
        .filter((vm) => vm[vmVCenterIndex] === vcenterTarget)
        .map((vm) => vm[vmClusterIndex])
        .filter(Boolean)
    ),
  ];

  const p1 = getRuleAsArray(rule, "prioritas1(cluster)");
  const p2 = getRuleAsArray(rule, "prioritas2(cluster)");
  const p3 = getRuleAsArray(rule, "prioritas3(cluster)");

  if (p1.includes("all_others")) {
    const otherPriorityClusters = [...p2, ...p3];
    const exceptionClusters = getRuleAsArray(rule, "clusterdikecualikan");
    return allClustersInVCenter.filter((c) => !otherPriorityClusters.includes(c) && !exceptionClusters.includes(c));
  }

  return [...new Set([...p1, ...p2, ...p3])];
}

/**
 * [HELPER v3.0.2] Helper untuk membaca aturan sebagai array yang aman.
 */
function getRuleAsArray(rule, ruleName) {
  const value = rule[ruleName];
  if (!value) return [];
  return Array.isArray(value)
    ? value
    : String(value)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/**
 * [REFACTOR v3.0.3] Mencari datastore di dalam cluster yang lolos.
 * Kini menggunakan dsToClusterMap untuk mencocokkan cluster dengan benar.
 */
function findDatastoresInCluster(clusterName, req, rule, config, allDsData, dsHeaders, dsToClusterMap) {
  const aliasMap = config[KONSTANTA.KUNCI_KONFIG.MAP_ALIAS_STORAGE] || {};
  const dsNameIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
  const dsCapGbIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_CAPACITY_GB]);
  const dsProvGbIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_PROV_DS_GB]);

  const p1Storage = getRuleAsArray(rule, "storageprioritas1");
  const p2Storage = getRuleAsArray(rule, "storageprioritas2");

  const filterByStorageTier = (dsName, tiers) => {
    if (!tiers || tiers.length === 0 || tiers.includes("*")) return true;
    const { storageType } = getStorageInfoFromDsName(dsName, aliasMap);
    return storageType && tiers.some((tier) => storageType.toUpperCase().includes(tier.toUpperCase()));
  };

  const checkCapacity = (dsRow) => {
    const freeSpace = (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0);
    return freeSpace >= req.disk;
  };

  const getValidDatastores = (dsPool, tiers) => {
    return dsPool
      .filter((dsRow) => {
        const dsName = dsRow[dsNameIndex];
        // Menggunakan peta untuk mendapatkan nama cluster yang benar
        const actualCluster = dsToClusterMap.get(dsName);
        return actualCluster === clusterName && filterByStorageTier(dsName, tiers) && checkCapacity(dsRow);
      })
      .map((dsRow) => ({
        vcenter: rule["vcentertarget"],
        clusterName: clusterName,
        dsName: dsRow[dsNameIndex],
        freeSpaceGB: (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0),
      }));
  };

  let kandidat = getValidDatastores(allDsData, p1Storage);
  if (kandidat.length === 0 && p2Storage.length > 0) {
    kandidat = getValidDatastores(allDsData, p2Storage);
  }

  return kandidat;
}

/**
 * [FINAL v3.0.2] Memberikan skor pada kandidat yang lolos.
 */
function skorLokasiKandidat(kandidat, config, allVmData, vmHeaders) {
  const clusterLoad = calculateClusterLoad(allVmData, vmHeaders, config);
  const preferredDsKeywords = config["KATA_KUNCI_DS_DIUTAMAKAN"] || [];

  return kandidat.map((lokasi) => {
    const skorDatastore = Math.min(Math.log10(lokasi.freeSpaceGB + 1) * 12, 40);
    const totalCpu = clusterLoad.get(lokasi.clusterName)?.cpu || 0;
    const skorCluster = Math.max(40 - totalCpu / 50, 0);

    const isPreferred = preferredDsKeywords.some((kw) => lokasi.dsName.toLowerCase().includes(kw.toLowerCase()));
    const skorPrioritasNama = isPreferred ? 20 : 0;

    lokasi.skor = { total: parseFloat((skorDatastore + skorCluster + skorPrioritasNama).toFixed(1)) };
    lokasi.alasan = isPreferred
      ? "Datastore prioritas, ruang lega & beban cluster rendah."
      : "Ruang lega & beban cluster rendah.";
    return lokasi;
  });
}

/**
 * [FINAL v3.0.2] Memformat pesan rekomendasi sukses.
 */
function formatPesanRekomendasi(kandidatTerbaik, req, rejected, rule) {
  const kritikalitasTampil = rule["kritikalitas"] || req.kritikalitas;
  const ioProfileTampil = rule["ioprofile"] === "*" ? req.io : rule["ioprofile"] || req.io;

  let pesan = `💡 <b>Rekomendasi Penempatan VM Baru</b>\n\n`;
  pesan += `Berdasarkan spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n`;
  pesan += ` • Kritikalitas: ${escapeHtml(kritikalitasTampil)}, Profil I/O: ${escapeHtml(ioProfileTampil)}\n\n`;

  pesan += `Berikut adalah <b>${kandidatTerbaik.length} lokasi terbaik</b> yang direkomendasikan:\n`;

  kandidatTerbaik.forEach((lokasi, index) => {
    pesan += `\n<b>${index + 1}. ${lokasi.vcenter} > Cluster: <code>${lokasi.clusterName}</code></b>\n`;
    pesan += `   • <b>Datastore:</b> <code>${lokasi.dsName}</code>\n`;
    pesan += `   • <b>Skor Kelayakan:</b> ${lokasi.skor.total} / 100\n`;
    if (lokasi.alasan) {
      pesan += `   • <i>Alasan: ${lokasi.alasan}</i>\n`;
    }
  });

  if (rejected && rejected.length > 0) {
    pesan += `\n<i>Catatan: Cluster berikut telah dievaluasi namun diabaikan karena tidak memenuhi kebijakan: ${rejected
      .map((c) => `<code>${c.cluster}</code>`)
      .join(", ")}.</i>`;
  }

  return pesan;
}

/**
 * [FINAL v3.0.2] Memformat pesan saat tidak ada kandidat yang ditemukan.
 */
function formatPesanGagal(req, rejected, rule) {
  let pesan = `ℹ️ <b>Analisis Penempatan Tidak Berhasil</b>\n\n`;
  pesan += `Tidak ditemukan lokasi yang memenuhi syarat untuk spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n`;
  pesan += ` • Kritikalitas: ${req.kritikalitas}, Profil I/O: ${req.io}\n\n`;

  if (rejected && rejected.length > 0) {
    pesan += `<b>Alasan Penolakan Cluster yang Dievaluasi:</b>\n`;
    const recommendations = new Set();

    rejected.forEach((c) => {
      let reasonText = getReasonText(c);
      pesan += ` • <code>${c.cluster}</code>: <i>${reasonText}</i>\n`;

      let recommendationText = getRecommendationText(c, rule);
      if (recommendationText) {
        recommendations.add(recommendationText);
      }
    });

    if (recommendations.size > 0) {
      pesan += `\n<b>Rekomendasi Tindak Lanjut:</b>\n`;
      recommendations.forEach((rec) => {
        pesan += ` • ${rec}\n`;
      });
    }
  } else {
    pesan += `Tidak ada cluster yang cocok dengan aturan penempatan awal yang ditemukan.`;
  }
  return pesan;
}

/**
 * [BARU v3.0.2] Helper untuk menerjemahkan kode alasan menjadi teks yang kaya.
 */
function getReasonText(rejection) {
  switch (rejection.reason) {
    case "kebijakan_tidak_ada":
      return "Tidak memiliki kebijakan overcommit yang terdefinisi.";
    case "overcommit_cpu":
      return `Akan melanggar kebijakan overcommit CPU (${rejection.ratio}). Alokasi saat ini: ${rejection.current} dari maks. ${rejection.max} vCPU.`;
    case "overcommit_memori":
      return `Akan melanggar kebijakan overcommit Memori (${
        rejection.ratio
      }). Alokasi saat ini: ${rejection.current.toFixed(0)} dari maks. ${rejection.max.toFixed(0)} GB.`;
    case "kapasitas_disk_tidak_cukup":
      return "Tidak ada datastore yang memenuhi syarat kapasitas atau tipe storage.";
    default:
      return "Alasan tidak diketahui.";
  }
}

/**
 * [BARU v3.0.2] Helper untuk membuat teks rekomendasi yang cerdas.
 */
function getRecommendationText(rejection, rule) {
  switch (rejection.reason) {
    case "kebijakan_tidak_ada":
      return `Tambahkan entri untuk <code>${rejection.cluster}</code> di sheet "Kebijakan Overcommit Cluster".`;
    case "overcommit_cpu":
    case "overcommit_memori":
      return `Lakukan peninjauan pada cluster <code>${rejection.cluster}</code> atau jalankan <code>/simulasi cleanup ${rejection.cluster}</code> untuk membebaskan sumber daya.`;
    case "kapasitas_disk_tidak_cukup":
      const p1Storage = getRuleAsArray(rule, "storageprioritas1");
      const p2Storage = getRuleAsArray(rule, "storageprioritas2");
      let allAllowedStorage = [];
      if (p1Storage.length > 0 && p1Storage[0] !== "*") allAllowedStorage = allAllowedStorage.concat(p1Storage);
      if (p2Storage.length > 0 && p2Storage[0] !== "*") allAllowedStorage = allAllowedStorage.concat(p2Storage);
      const uniqueAllowedStorage = [...new Set(allAllowedStorage)];
      const storageTypeSuggestion =
        uniqueAllowedStorage.length > 0
          ? uniqueAllowedStorage.map((s) => `<code>${s}</code>`).join(" atau ")
          : "yang sesuai aturan";
      return `Buat datastore baru di <code>${rejection.cluster}</code> dengan tipe storage ${storageTypeSuggestion}.`;
    default:
      return null;
  }
}
