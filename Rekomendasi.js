// ===== FILE: Rekomendasi.gs =====

/**
 * [FINAL v2.2.2] Fungsi orkestrator utama untuk mendapatkan rekomendasi penempatan VM.
 * Versi ini menggabungkan semua perbaikan:
 * - Logika fallback ke aturan "default".
 * - Logika prioritas datastore yang ketat.
 * - Saran pembuatan datastore baru yang lebih spesifik.
 * - Penampilan vCenter dan nama kritikalitas formal di hasil akhir.
 */
function dapatkanRekomendasiPenempatan(requirements, config) {
  try {
    const { headers: vmHeaders, dataRows: allVmData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    const { headers: dsHeaders, dataRows: allDsData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
    const allRules = bacaAturanPenempatan();

    const reqKritikalitasLower = requirements.kritikalitas.toLowerCase();
    const reqIoLower = requirements.io.toLowerCase();

    // Langkah 1: Cari aturan yang paling spesifik (cocok kritikalitas & IO)
    let applicableRule = allRules.find((rule) => {
      const ruleKritikalitasLower = String(rule["kritikalitas"]).toLowerCase();
      const ruleIoLower = String(rule["io profile"]).toLowerCase();
      return ruleKritikalitasLower.startsWith(reqKritikalitasLower) && ruleIoLower.startsWith(reqIoLower);
    });

    // Langkah 2: Jika tidak ada, cari aturan fallback dengan IO Profile wildcard '*'
    if (!applicableRule) {
      applicableRule = allRules.find((rule) => {
        const ruleKritikalitasLower = String(rule["kritikalitas"]).toLowerCase();
        return ruleKritikalitasLower.startsWith(reqKritikalitasLower) && String(rule["io profile"]) === "*";
      });
    }

    // Langkah 3: Jika MASIH tidak ditemukan, cari aturan "default"
    let isDefaultRule = false;
    if (!applicableRule) {
      console.log(`Aturan untuk kritikalitas '${reqKritikalitasLower}' tidak ditemukan. Mencari aturan 'default'.`);
      applicableRule = allRules.find((rule) => String(rule["kritikalitas"]).toLowerCase() === "default");
      if (applicableRule) {
        isDefaultRule = true;
      }
    }

    if (!applicableRule) {
      return `ℹ️ Tidak ditemukan aturan penempatan yang cocok untuk Kritikalitas "${requirements.kritikalitas}".`;
    }

    let kandidat = [];
    let clusterValidTapiPenuh = null;
    const priorityLevels = ["prioritas 1 (cluster)", "prioritas 2 (cluster)", "prioritas 3 (cluster)"];

    for (const level of priorityLevels) {
      const targetClusters = applicableRule[level];
      if (targetClusters && String(targetClusters).trim() !== "") {
        // Dapatkan SEMUA lokasi yang valid secara aturan, abaikan kapasitas disk dulu
        const potentialLocations = filterLokasiKandidat(
          { ...requirements, disk: 0 },
          applicableRule,
          targetClusters,
          config,
          allVmData,
          allDsData,
          dsHeaders,
          vmHeaders
        );

        if (potentialLocations.length > 0) {
          const preferredDsKeywords = config["KATA_KUNCI_DS_DIUTAMAKAN"] || [];

          // Pisahkan menjadi dua kelompok: prioritas dan non-prioritas
          const preferredPool = potentialLocations.filter((loc) =>
            preferredDsKeywords.some((kw) => loc.dsName.toLowerCase().includes(kw.toLowerCase()))
          );
          const nonPreferredPool = potentialLocations.filter(
            (loc) => !preferredDsKeywords.some((kw) => loc.dsName.toLowerCase().includes(kw.toLowerCase()))
          );

          // Cek kapasitas HANYA di kelompok prioritas terlebih dahulu
          kandidat = preferredPool.filter((loc) => loc.freeSpaceGB >= requirements.disk);

          // Jika tidak ada di kelompok prioritas, baru cek di kelompok non-prioritas
          if (kandidat.length === 0) {
            kandidat = nonPreferredPool.filter((loc) => loc.freeSpaceGB >= requirements.disk);
          }
        }

        if (kandidat.length > 0) {
          console.log(`Kandidat ditemukan pada Prioritas Level: ${level}`);
          break;
        } else {
          if (!clusterValidTapiPenuh && potentialLocations.length > 0) {
            clusterValidTapiPenuh = potentialLocations[0];
          }
        }
      }
    }

    if (kandidat.length === 0) {
      if (clusterValidTapiPenuh) {
        const p1Storage = applicableRule["storage prioritas 1"];
        const p2Storage = applicableRule["storage prioritas 2"];
        let allAllowedStorage = [];
        if (p1Storage && p1Storage !== "*")
          allAllowedStorage = allAllowedStorage.concat(Array.isArray(p1Storage) ? p1Storage : [p1Storage]);
        if (p2Storage && p2Storage !== "*")
          allAllowedStorage = allAllowedStorage.concat(Array.isArray(p2Storage) ? p2Storage : [p2Storage]);
        const uniqueAllowedStorage = [...new Set(allAllowedStorage)];

        return formatPesanSaranDatastoreBaru(clusterValidTapiPenuh, requirements, uniqueAllowedStorage);
      }
      return "ℹ️ Tidak ditemukan lokasi (Cluster/Datastore) yang memenuhi semua kriteria yang Anda berikan.";
    }

    const kandidatDenganSkor = skorLokasiKandidat(kandidat, config, allVmData, vmHeaders);
    kandidatDenganSkor.sort((a, b) => b.skor.total - a.skor.total);
    return formatPesanRekomendasi(kandidatDenganSkor.slice(0, 3), requirements, applicableRule, isDefaultRule);
  } catch (e) {
    console.error(`Gagal mendapatkan rekomendasi: ${e.message}\nStack: ${e.stack}`);
    return `❌ Gagal memproses permintaan rekomendasi. Penyebab: ${e.message}`;
  }
}

/**
 * [FINAL v2.2.2] Menyaring semua datastore untuk menemukan kandidat yang valid.
 */
function filterLokasiKandidat(req, rule, targetClusters, config, allVmData, allDsData, dsHeaders, vmHeaders) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const aliasMap = config[K.MAP_ALIAS_STORAGE] || {};

  const vcenterTarget = rule["vcenter target"];
  const clusterExceptions = Array.isArray(rule["cluster dikecualikan"])
    ? rule["cluster dikecualikan"]
    : rule["cluster dikecualikan"]
    ? [rule["cluster dikecualikan"]]
    : [];

  // Menggunakan prioritas storage dari aturan
  const p1Storage = rule["storage prioritas 1"];
  const p2Storage = rule["storage prioritas 2"];
  let allowedStorageTypes = [];
  if (p1Storage && p1Storage !== "*")
    allowedStorageTypes = allowedStorageTypes.concat(Array.isArray(p1Storage) ? p1Storage : [p1Storage]);
  if (p2Storage && p2Storage !== "*")
    allowedStorageTypes = allowedStorageTypes.concat(Array.isArray(p2Storage) ? p2Storage : [p2Storage]);
  if (allowedStorageTypes.length === 0) allowedStorageTypes = ["*"]; // Jika tidak ada, izinkan semua

  const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
  const dsCapGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
  const dsProvGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_PROV_DS_GB]);

  const vmClusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const vmVCenterIndex = vmHeaders.indexOf(config[K.HEADER_VM_VCENTER]);

  const allClustersInVCenter = [
    ...new Set(allVmData.filter((vm) => vm[vmVCenterIndex] === vcenterTarget).map((vm) => vm[vmClusterIndex])),
  ];

  let effectiveTargetClusters;
  const targetClustersArray = Array.isArray(targetClusters) ? targetClusters : [targetClusters];

  if (targetClustersArray.includes("all_others")) {
    const otherPriorityClusters = [
      ...(Array.isArray(rule["prioritas 2 (cluster)"]) ? rule["prioritas 2 (cluster)"] : []),
      ...(Array.isArray(rule["prioritas 3 (cluster)"]) ? rule["prioritas 3 (cluster)"] : []),
    ];
    effectiveTargetClusters = allClustersInVCenter.filter(
      (c) => !otherPriorityClusters.includes(c) && !clusterExceptions.includes(c)
    );
  } else {
    effectiveTargetClusters = targetClustersArray;
  }

  const kandidat = [];

  allDsData.forEach((dsRow) => {
    const dsName = dsRow[dsNameIndex];
    const { cluster: clusterName, storageType } = getStorageInfoFromDsName(dsName, aliasMap);

    if (!clusterName || !effectiveTargetClusters.includes(clusterName) || clusterExceptions.includes(clusterName))
      return;
    if (
      allowedStorageTypes[0] !== "*" &&
      (!storageType || !allowedStorageTypes.some((type) => storageType.toUpperCase().includes(type.toUpperCase())))
    )
      return;

    const freeSpace = (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0);

    // Pengecekan disk dipindahkan ke orkestrator, fungsi ini hanya mengumpulkan lokasi valid dan kapasitasnya
    kandidat.push({ vcenter: vcenterTarget, clusterName, dsName, freeSpaceGB: freeSpace });
  });

  return kandidat;
}

/**
 * [FINAL v2.2.2] Memberikan skor pada setiap lokasi kandidat.
 */
function skorLokasiKandidat(kandidat, config, allVmData, vmHeaders) {
  const K = KONSTANTA.KUNCI_KONFIG;

  const preferredDsKeywords = config["KATA_KUNCI_DS_DIUTAMAKAN"] || [];

  const clusterLoad = {};
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
  const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);

  allVmData.forEach((vmRow) => {
    const clusterName = vmRow[clusterIndex];
    if (clusterName) {
      if (!clusterLoad[clusterName]) clusterLoad[clusterName] = { cpu: 0, memory: 0 };
      clusterLoad[clusterName].cpu += parseInt(vmRow[cpuIndex], 10) || 0;
      clusterLoad[clusterName].memory += parseFloat(vmRow[memoryIndex]) || 0;
    }
  });

  return kandidat.map((lokasi) => {
    const skorDatastore = Math.min(Math.log10(lokasi.freeSpaceGB + 1) * 12, 40);
    const totalCpu = clusterLoad[lokasi.clusterName]?.cpu || 0;
    const skorCluster = Math.max(40 - totalCpu / 50, 0);

    const dsNameLower = lokasi.dsName.toLowerCase();
    const isPreferred = preferredDsKeywords.some((keyword) => dsNameLower.includes(keyword.toLowerCase()));
    const skorPrioritasNama = isPreferred ? 20 : 0;

    const skorTotal = skorDatastore + skorCluster + skorPrioritasNama;

    lokasi.skor = { total: parseFloat(skorTotal.toFixed(1)) };

    if (isPreferred) {
      lokasi.alasan = "Datastore prioritas, ruang lega & beban cluster rendah.";
    } else {
      lokasi.alasan = "Ruang lega & beban cluster rendah.";
    }
    return lokasi;
  });
}

/**
 * [FINAL v2.2.2] Memformat pesan rekomendasi menjadi teks HTML.
 */
function formatPesanRekomendasi(kandidatTerbaik, req, applicableRule, isDefaultRule) {
  const kritikalitasTampil = applicableRule["kritikalitas"] || req.kritikalitas;
  const ioProfileTampil = applicableRule["io profile"] === "*" ? req.io : applicableRule["io profile"] || req.io;

  let pesan = `💡 <b>Rekomendasi Penempatan VM Baru</b>\n\n`;
  pesan += `Berdasarkan spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n`;
  pesan += ` • Kritikalitas: ${escapeHtml(kritikalitasTampil)}, Profil I/O: ${escapeHtml(ioProfileTampil)}\n\n`;

  if (isDefaultRule) {
    pesan += `<i>(Aturan spesifik tidak ditemukan, menggunakan aturan <b>default</b>.)</i>\n\n`;
  }

  pesan += `Berikut adalah <b>${kandidatTerbaik.length} lokasi terbaik</b> yang direkomendasikan:\n`;

  kandidatTerbaik.forEach((lokasi, index) => {
    pesan += `\n<b>${index + 1}. ${lokasi.vcenter} > Cluster: <code>${lokasi.clusterName}</code></b>\n`;
    pesan += `   • <b>Datastore:</b> <code>${lokasi.dsName}</code>\n`;
    pesan += `   • <b>Skor Kelayakan:</b> ${lokasi.skor.total} / 100\n`;
    if (lokasi.alasan) {
      pesan += `   • <i>Alasan: ${lokasi.alasan}</i>\n`;
    }
  });

  return pesan;
}

/**
 * [FINAL v2.2.2] Memformat pesan saran untuk membuat datastore baru.
 */
function formatPesanSaranDatastoreBaru(lokasi, req, allowedStorageTypes) {
  let pesan = `💡 <b>Analisis Penempatan VM</b>\n\n`;
  pesan += `Berdasarkan spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n`;
  pesan += ` • Kritikalitas: ${req.kritikalitas}, Profil I/O: ${req.io}\n\n`;
  pesan += `✅ Cluster yang sesuai telah ditemukan di <b>${lokasi.vcenter} > <code>${lokasi.clusterName}</code></b>.\n\n`;
  pesan += `⚠️ Namun, tidak ada datastore yang memenuhi syarat yang memiliki ruang kosong yang cukup (membutuhkan > ${req.disk} GB).\n\n`;
  pesan += `<b>Rekomendasi:</b>\n`;

  const storageTypeSuggestion =
    allowedStorageTypes && allowedStorageTypes.length > 0
      ? allowedStorageTypes.join("</code> atau <code>")
      : "yang sesuai aturan";
  pesan += `Buat datastore baru pada cluster tersebut dengan tipe storage <code>${storageTypeSuggestion}</code> dan kapasitas yang memadai.`;

  return pesan;
}
