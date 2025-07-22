/**
 * @file Analisis.js
 * @author Djanoer Team
 * @date 2023-05-10
 * @version 4.7.0
 *
 * @description
 * Berisi fungsi-fungsi analitis tingkat tinggi yang kompleks. File ini bertanggung jawab
 * untuk menjalankan analisis mendalam terhadap data infrastruktur, seperti rekomendasi
 * migrasi datastore, analisis kesehatan cluster, dan diagnosis masalah.
 *
 * @section FUNGSI UTAMA
 * - jalankanRekomendasiMigrasi(...): Orkestrator utama untuk analisis & rekomendasi migrasi datastore.
 * - generateClusterAnalysis(clusterName, config): Menganalisis dan meringkas metrik kesehatan sebuah cluster.
 * - diagnoseOverprovisioningCause(dsName, config): Mendiagnosis kemungkinan penyebab datastore over-provisioned.
 * - findBestDestination(...): Menemukan datastore tujuan terbaik untuk migrasi VM berdasarkan aturan.
 */

/**
 * [REFACTOR v4.7.0 - READ ONCE & PROACTIVE VALIDATION] Menjalankan alur kerja analisis migrasi.
 * Fungsi ini sekarang menerima semua data yang diperlukan sebagai parameter untuk performa optimal.
 */
function jalankanRekomendasiMigrasi(config, allDatastores, allVms, vmHeaders, migrationConfig) {
  console.log("Memulai analisis penyeimbangan cluster...");

  try {
    let finalMessage = `⚖️ <b>Analisis & Rekomendasi Migrasi Datastore</b>\n`;
    finalMessage += `<i>Analisis dijalankan pada: ${new Date().toLocaleString("id-ID")}</i>`;

    const uniqueDsTypes = [...new Set(allDatastores.map((ds) => ds.type).filter(Boolean))];
    const unconfiguredTypes = [];

    uniqueDsTypes.forEach((type) => {
      const rule = migrationConfig.get(type) || Array.from(migrationConfig.values()).find((r) => r.alias === type);
      if (!rule) {
        unconfiguredTypes.push(type);
      }
    });

    if (unconfiguredTypes.length > 0) {
      finalMessage += `\n\n⚠️ <b>Peringatan Konfigurasi</b>\n`;
      finalMessage += `Ditemukan tipe datastore berikut yang belum memiliki aturan di sheet "Logika Migrasi":\n`;
      unconfiguredTypes.forEach((type) => {
        finalMessage += ` • <code>${escapeHtml(type)}</code>\n`;
      });
      finalMessage += `<i>Rekomendasi untuk tipe ini mungkin tidak optimal. Harap perbarui konfigurasi.</i>`;
    }

    const overProvisionedDsList = allDatastores.filter((ds) => ds.provisionedGb > ds.capacityGb);
    if (overProvisionedDsList.length === 0) {
      finalMessage += "\n\n✅ Semua datastore dalam kondisi provisioning yang aman (1:1).";
      // Langsung kirim pesan karena proses selesai di sini
      kirimPesanTelegram(finalMessage, config, "HTML");
      return; // Keluar dari fungsi
    }

    overProvisionedDsList.forEach((dsInfo) => {
      finalMessage += KONSTANTA.UI_STRINGS.SEPARATOR;
      const migrationTargetGb = dsInfo.provisionedGb - dsInfo.capacityGb;
      const provisionedTb = dsInfo.provisionedGb / 1024;
      const capacityTb = dsInfo.capacityGb / 1024;
      const migrationTargetTb = migrationTargetGb / 1024;

      finalMessage += `❗️ <b>Datastore Over-Provisioned:</b> <code>${dsInfo.name}</code>\n`;
      finalMessage += `• <b>Status:</b> Provisioned ${dsInfo.provisionedGb.toFixed(2)} GB (${provisionedTb.toFixed(
        2
      )} TB) / ${dsInfo.capacityGb.toFixed(2)} GB (${capacityTb.toFixed(2)} TB) (<b>${dsInfo.utilization.toFixed(
        1
      )}%</b>)\n`;

      const diagnosis = diagnoseOverprovisioningCause(dsInfo.name, config);
      if (diagnosis) finalMessage += `• <b>Indikasi Penyebab:</b> ${diagnosis}\n`;
      finalMessage += `• <b>Target Migrasi:</b> ${migrationTargetGb.toFixed(2)} GB (~${migrationTargetTb.toFixed(
        2
      )} TB)\n`;

      const migrationPlan = _buildMigrationPlan(dsInfo, allDatastores, allVms, vmHeaders, migrationConfig, config);

      finalMessage += `\n🔮 <b>Rencana Migrasi Cerdas:</b>\n`;
      if (migrationPlan.size > 0) {
        migrationPlan.forEach((vms, destDsName) => {
          const totalSizeToDest = vms.reduce((sum, vm) => sum + vm.provisionedGb, 0);
          finalMessage += `\n➡️ <b>Tujuan:</b> <code>${destDsName}</code> (~${totalSizeToDest.toFixed(2)} GB)\n`;
          vms.forEach((vm) => {
            const stateIcon = String(vm.state || "")
              .toLowerCase()
              .includes("on")
              ? "🟢"
              : "🔴";
            finalMessage += ` • <b>Pindahkan VM:</b> <code>${escapeHtml(vm.name)}</code> (${vm.provisionedGb.toFixed(
              2
            )} GB)\n`;
            // --- BARIS BARU DITAMBAHKAN DI SINI ---
            finalMessage += `   └ Info: ${stateIcon} ${escapeHtml(vm.state)} | Kritikalitas: ${escapeHtml(
              vm.criticality || "N/A"
            )}\n`;
            finalMessage += `   └ <b>Skor Kelayakan: ${vm.migrationScore}/100</b> | <i>${escapeHtml(
              vm.justification
            )}</i>\n`;
          });
        });
      } else {
        finalMessage += "<i>Tidak ditemukan datastore tujuan yang cocok di dalam cluster ini.</i>\n\n";
        finalMessage += "💡 <b>Rekomendasi:</b>\n";
        finalMessage += `Buat Datastore baru pada <b>Cluster ${dsInfo.cluster}</b> dengan tipe <code>${
          dsInfo.type || "Sesuai standar"
        }</code> dan kapasitas > <code>${migrationTargetGb.toFixed(2)} GB</code>.\n`;
      }
    });

    kirimPesanTelegram(finalMessage, config, "HTML");
  } catch (e) {
    console.error(`Gagal menjalankan analisis migrasi: ${e.message}\nStack: ${e.stack}`);
    // Melemparkan kembali error agar bisa ditangkap oleh handler perintah
    throw new Error(`Gagal Menjalankan Analisis Migrasi. Penyebab: ${e.message}`);
  }
}

function _gatherMigrationDataSource(config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Mengambil Data Datastore
  const dsSheet = ss.getSheetByName(config[K.SHEET_DS]);
  if (!dsSheet) throw new Error(`Sheet datastore '${config[K.SHEET_DS]}' tidak ditemukan.`);
  const dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
  const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
  const dsCapGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
  const dsProvGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_PROV_DS_GB]);
  const dsCapTbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_TB]);
  const dsProvTbIndex = dsHeaders.indexOf(config[K.HEADER_DS_PROV_DS_TB]);

  if ([dsNameIndex, dsCapGbIndex, dsProvGbIndex, dsCapTbIndex, dsProvTbIndex].includes(-1)) {
    throw new Error(
      "Satu atau lebih header penting (Name, Capacity/Provisioned GB/TB) tidak ditemukan di sheet Datastore."
    );
  }
  const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();

  // 2. Mengambil Logika Migrasi
  const migrationConfig = getMigrationConfig(ss.getSheetByName(config[K.SHEET_LOGIKA_MIGRASI]));

  // 3. Memproses Data Datastore
  const allDatastores = dsData.map((row) => {
    const dsName = row[dsNameIndex];
    const capacityGb = parseLocaleNumber(row[dsCapGbIndex]);
    const provisionedGb = parseLocaleNumber(row[dsProvGbIndex]);
    const capacityTb = parseLocaleNumber(row[dsCapTbIndex]);
    const provisionedTb = parseLocaleNumber(row[dsProvTbIndex]);
    const dsInfo = getDsInfo(dsName, migrationConfig);
    return {
      name: dsName,
      capacityGb,
      provisionedGb,
      capacityTb,
      provisionedTb,
      freeSpace: capacityGb - provisionedGb,
      utilization: capacityGb > 0 ? (provisionedGb / capacityGb) * 100 : 0,
      cluster: dsInfo.cluster,
      type: dsInfo.type,
      environment: getEnvironmentFromDsName(dsName, config[K.MAP_ENV]),
    };
  });

  // 4. Mengambil Data VM
  const vmSheet = ss.getSheetByName(config[K.SHEET_VM]);
  if (!vmSheet) throw new Error(`Sheet VM '${config[K.SHEET_VM]}' tidak ditemukan.`);
  const vmHeaders = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
  const allVms = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();

  return { allDatastores, allVms, vmHeaders, migrationConfig };
}

function _buildMigrationPlan(sourceDsInfo, allDatastores, allVms, vmHeaders, migrationConfig, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const migrationTargetGb = sourceDsInfo.provisionedGb - sourceDsInfo.capacityGb;

  // 1. Siapkan kandidat VM lengkap dengan skor risiko
  const vmNameIndex = vmHeaders.indexOf(config[K.HEADER_VM_NAME]);
  const vmProvGbIndex = vmHeaders.indexOf(config[K.HEADER_VM_PROV_GB]);
  const vmStateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
  const vmCritIndex = vmHeaders.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
  const vmDsColumnIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);

  let candidatePool = allVms
    .filter((row) => row[vmDsColumnIndex] === sourceDsInfo.name)
    .map((row) => {
      const vm = {
        name: row[vmNameIndex],
        provisionedGb: parseLocaleNumber(row[vmProvGbIndex]),
        state: row[vmStateIndex],
        criticality: row[vmCritIndex],
      };
      vm.migrationScore = calculateMigrationScore(vm, config);
      return vm;
    });

  // 2. Logika "Best Fit": Cari kombinasi paling efisien
  let bestCombination = [];
  let smallestOvershoot = Infinity;

  // Urutkan berdasarkan skor keamanan untuk memulai pencarian dari kandidat terbaik
  candidatePool.sort((a, b) => b.migrationScore - a.migrationScore);

  // Algoritma greedy untuk menemukan subset yang "cukup"
  let currentCombination = [];
  let currentSize = 0;
  for (const vm of candidatePool) {
    currentCombination.push(vm);
    currentSize += vm.provisionedGb;
    if (currentSize >= migrationTargetGb) {
      // Kita menemukan solusi pertama yang memenuhi syarat.
      // Karena sudah diurutkan berdasarkan keamanan, ini adalah solusi teraman.
      // Logika ini secara inheren mencari solusi yang "pas" karena berhenti
      // segera setelah target terpenuhi.
      bestCombination = currentCombination;
      break;
    }
  }

  // 3. Bangun rencana migrasi HANYA dari kombinasi terbaik
  const migrationPlan = new Map();
  let availableDestinations = allDatastores.filter(
    (ds) => ds.cluster === sourceDsInfo.cluster && ds.name !== sourceDsInfo.name
  );

  for (const vmToMove of bestCombination) {
    const bestDest = findBestDestination(
      sourceDsInfo,
      vmToMove.provisionedGb,
      availableDestinations,
      migrationConfig,
      config
    );
    if (bestDest && !bestDest.error) {
      if (!migrationPlan.has(bestDest.name)) {
        migrationPlan.set(bestDest.name, []);
      }
      vmToMove.justification = getMigrationJustification(vmToMove);
      migrationPlan.get(bestDest.name).push(vmToMove);

      const destDsInPool = availableDestinations.find((ds) => ds.name === bestDest.name);
      if (destDsInPool) {
        destDsInPool.freeSpace -= vmToMove.provisionedGb;
      }
    }
  }
  return migrationPlan;
}

/**
 * [BARU - FASE 2] Memberikan justifikasi teks berdasarkan properti VM.
 * @param {object} vm - Objek VM yang akan dianalisis.
 * @returns {string} Justifikasi dalam bentuk teks.
 */
function getMigrationJustification(vm) {
  if (
    String(vm.state || "")
      .toLowerCase()
      .includes("off")
  ) {
    return "Risiko Sangat Rendah (VM berstatus poweredOff).";
  }
  if (
    String(vm.name || "")
      .toLowerCase()
      .includes("unused") ||
    String(vm.name || "")
      .toLowerCase()
      .includes("decom")
  ) {
    return "Risiko Sangat Rendah (VM terindikasi tidak terpakai).";
  }
  const lowRiskCrits = ["LOW", "MEDIUM", "NON-CRITICAL", ""];
  if (
    lowRiskCrits.includes(
      String(vm.criticality || "")
        .toUpperCase()
        .trim()
    )
  ) {
    return "Risiko Rendah (VM non-produksi/non-kritis).";
  }
  return "Risiko Moderat (VM produksi aktif).";
}

/**
 * [REVISI FINAL - FASE 2] Menghitung skor kelayakan migrasi untuk sebuah VM
 * dengan skala kepercayaan tinggi (90-100).
 * @param {object} vm - Objek yang berisi detail VM.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {number} Skor kelayakan migrasi antara 0 dan 100.
 */
function calculateMigrationScore(vm, config) {
  // Mulai dengan skor kepercayaan maksimal.
  let score = 100;
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};

  // Jika VM mati atau tidak terpakai, risikonya hampir nol. Skor tetap sangat tinggi.
  const isOff = String(vm.state || "")
    .toLowerCase()
    .includes("off");
  const isUnused =
    String(vm.name || "")
      .toLowerCase()
      .includes("unused") ||
    String(vm.name || "")
      .toLowerCase()
      .includes("decom");

  if (isOff || isUnused) {
    return 99; // Beri skor nyaris sempurna untuk kandidat ideal.
  }

  // --- Terapkan Penalti HANYA untuk VM yang Aktif ---

  // 1. Penalti dasar karena VM aktif (ada risiko downtime minimal saat vMotion)
  score -= 5; // Skor sekarang: 95

  // 2. Penalti tambahan berdasarkan risiko bisnis (kritikalitas)
  const criticality = String(vm.criticality || "")
    .toUpperCase()
    .trim();
  // Skor dari 0 (tdk diketahui) hingga 5 (sangat kritis)
  const criticalityScoreValue = skorKritikalitas[criticality] || 2; // Anggap 'unknown' sebagai risiko sedang

  // Penalti kecil yang presisi untuk setiap tingkat kritikalitas
  const penalty = criticalityScoreValue;
  score -= penalty;

  // Hasil akhir akan berada di rentang ~90-95 untuk VM aktif
  return Math.max(0, Math.round(score));
}

/**
 * [REVISI - FASE 3] Menganalisis dan meringkas metrik kesehatan sebuah cluster
 * berdasarkan data yang sudah disaring. Menambahkan analisis vs kebijakan overcommit.
 * @param {string} clusterName - Nama cluster yang dianalisis.
 * @param {Array<Array<any>>} vmsInCluster - Baris data untuk VM yang HANYA ada di cluster ini.
 * @param {Array<string>} vmHeaders - Array header dari sheet VM.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object} Objek hasil analisis yang terstruktur.
 */
function generateClusterAnalysis(clusterName, vmsInCluster, vmHeaders, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const analysis = {
    clusterName: clusterName,
    totalVms: vmsInCluster.length,
    on: 0,
    off: 0,
    totalCpu: 0,
    totalMemoryGb: 0,
    totalDiskTb: 0,
    policy: null,
    cpuUtilEffective: 0,
    memUtilEffective: 0,
  };

  const stateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
  const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
  const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);
  const provTbIndex = vmHeaders.indexOf(config[K.HEADER_VM_PROV_TB]);

  vmsInCluster.forEach((row) => {
    const state = String(row[stateIndex] || "").toLowerCase();
    if (state.includes("on")) {
      analysis.on++;
      analysis.totalCpu += parseInt(row[cpuIndex], 10) || 0;
      analysis.totalMemoryGb += parseFloat(row[memoryIndex]) || 0;
    } else {
      analysis.off++;
    }
    analysis.totalDiskTb += parseLocaleNumber(row[provTbIndex]);
  });

  // Analisis Cerdas vs Kebijakan Overcommit
  const clusterPolicies = bacaKebijakanCluster();
  const policy = clusterPolicies.get(clusterName);
  if (policy) {
    analysis.policy = policy;
    const maxCpu = (policy["physicalcpucores"] || 0) * (policy["cpuovercommitratio"] || 1);
    const maxMemory = (policy["physicalmemorytb"] || 0) * 1024 * (policy["memoryovercommitratio"] || 1);
    if (maxCpu > 0) {
      analysis.cpuUtilEffective = (analysis.totalCpu / maxCpu) * 100;
    }
    if (maxMemory > 0) {
      analysis.memUtilEffective = (analysis.totalMemoryGb / maxMemory) * 100;
    }
  }

  return analysis;
}

function diagnoseOverprovisioningCause(dsName, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { headers, data: allRecentLogs } = getCombinedLogs(thirtyDaysAgo, config);
  if (allRecentLogs.length === 0) return null;

  const typeLogHeader = config[K.HEADER_LOG_TIPE_LOG];
  const typeLogIndex = headers.indexOf(typeLogHeader);

  if (typeLogIndex === -1) {
    console.warn(
      `Kolom 'Tipe Log' dengan header '${typeLogHeader}' tidak ditemukan, analisis penyebab mungkin tidak akurat.`
    );
    return null;
  }

  const recentLogs = allRecentLogs.filter((log) => log[typeLogIndex] === KONSTANTA.NAMA_ENTITAS.VM);
  if (recentLogs.length === 0) return null;

  const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
  const actionIndex = headers.indexOf(config[K.HEADER_LOG_ACTION]);
  const detailIndex = headers.indexOf(config[K.HEADER_LOG_DETAIL]);

  let newVmCount = 0;
  let diskModCount = 0;

  const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_VM]);
  const vmData = vmSheet.getDataRange().getValues();
  const vmHeaders = vmData.shift();
  const vmPkIndex = vmHeaders.indexOf(config[K.HEADER_VM_PK]);
  const vmDsIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
  const vmProvGbHeader = config[K.HEADER_VM_PROV_GB];

  if (vmPkIndex === -1 || vmDsIndex === -1) {
    console.warn("Header PK atau DS tidak ditemukan di sheet VM, analisis penyebab dibatalkan.");
    return null;
  }

  const vmsOnThisDs = new Set(
    vmData.filter((row) => row[vmDsIndex] === dsName).map((row) => normalizePrimaryKey(row[vmPkIndex]))
  );

  recentLogs.forEach((log) => {
    const pk = normalizePrimaryKey(log[pkIndex]);
    if (vmsOnThisDs.has(pk)) {
      const action = log[actionIndex];
      if (action === "PENAMBAHAN") {
        newVmCount++;
      } else if (action === "MODIFIKASI" && log[detailIndex].includes(vmProvGbHeader)) {
        diskModCount++;
      }
    }
  });

  if (newVmCount > 0 || diskModCount > 0) {
    let diagnosis = "Kondisi ini kemungkinan disebabkan oleh ";
    const causes = [];
    if (newVmCount > 0) causes.push(`<b>${newVmCount} penambahan VM baru</b>`);
    if (diskModCount > 0) causes.push(`<b>${diskModCount} modifikasi ukuran disk</b>`);
    diagnosis += causes.join(" dan ") + " dalam 30 hari terakhir.";
    return diagnosis;
  }

  return null;
}

/**
 * [MODIFIKASI v3.1] Fungsi pengurutan kini disederhanakan. Ia hanya memanggil
 * calculateMigrationScore untuk setiap VM dan mengurutkannya dari skor tertinggi ke terendah.
 */
function sortVmForMigration(a, b, config) {
  const scoreA = calculateMigrationScore(a, config);
  const scoreB = calculateMigrationScore(b, config);

  // Mengurutkan secara menurun (descending), dari skor tertinggi ke terendah.
  return scoreB - scoreA;
}

/**
 * [REFACTORED v4.2.5 - BULLETPROOF LOGIC] Mencari datastore tujuan terbaik.
 * Versi ini memiliki benteng pertahanan yang diperkuat untuk secara definitif
 * menangani kasus di mana sebuah tipe datastore tidak memiliki aturan migrasi sama sekali,
 * sehingga menyelesaikan error 'Cannot read properties of undefined'.
 */
function findBestDestination(sourceDs, requiredGb, availableDestinations, migrationConfig, config) {
  const sourceType = sourceDs.type;
  const excludedKeywords = (config[KONSTANTA.KUNCI_KONFIG.DS_KECUALI] || []).map((k) => k.toUpperCase());

  let candidates = availableDestinations.filter((destDs) => {
    const destDsNameUpper = destDs.name.toUpperCase();
    return (
      destDs.cluster === sourceDs.cluster &&
      destDs.environment === sourceDs.environment &&
      destDs.name !== sourceDs.name &&
      destDs.freeSpace > requiredGb &&
      !excludedKeywords.some((exc) => destDsNameUpper.includes(exc))
    );
  });

  if (candidates.length === 0) {
    const initialCandidates = availableDestinations.filter((d) => d.name !== sourceDs.name);
    if (initialCandidates.filter((d) => d.cluster !== sourceDs.cluster).length === initialCandidates.length)
      return { error: true, reason: `Tidak ada kandidat di Cluster ${sourceDs.cluster}.` };
    if (initialCandidates.filter((d) => d.environment !== sourceDs.environment).length === initialCandidates.length)
      return { error: true, reason: `Tidak ada kandidat di Environment ${sourceDs.environment}.` };
    if (initialCandidates.filter((d) => d.freeSpace <= requiredGb).length === initialCandidates.length)
      return {
        error: true,
        reason: `Tidak ada kandidat dengan ruang kosong yang cukup (> ${requiredGb.toFixed(1)} GB).`,
      };
    return { error: true, reason: `Semua kandidat datastore termasuk dalam daftar pengecualian.` };
  }

  const sourceRule =
    migrationConfig.get(sourceType) ||
    Array.from(migrationConfig.values()).find((rule) => rule && rule.alias === sourceType);

  // ==================== PERUBAHAN UTAMA DI SINI ====================
  // "Benteng pertahanan" yang lebih kuat.
  // Pertama, pastikan 'sourceRule' ada.
  if (sourceRule) {
    // Kedua, setelah yakin 'sourceRule' ada, baru periksa properti 'destinations'.
    if (Array.isArray(sourceRule.destinations) && sourceRule.destinations.length > 0) {
      const priorityTypes = sourceRule.destinations;

      for (const priorityType of priorityTypes) {
        const found = candidates.find((d) => d.type === priorityType);
        if (found) {
          return candidates.filter((c) => c.type === priorityType).sort((a, b) => b.freeSpace - a.freeSpace)[0];
        }
      }
      return { error: true, reason: `Tidak ditemukan datastore tujuan yang memenuhi syarat migrasi.` };
    }
  }
  // ==================== AKHIR PERUBAHAN ====================

  // Jika tidak ada aturan migrasi yang cocok, atau jika aturan ada tapi tujuannya kosong,
  // maka lanjutkan ke logika fallback.
  candidates.sort((a, b) => b.freeSpace - a.freeSpace);

  return candidates.length > 0 ? candidates[0] : { error: true, reason: `Tidak ditemukan datastore yang cocok.` };
}

/**
 * [FUNGSI BARU v3.1] Menganalisis semua datastore dalam sebuah cluster untuk
 * menghitung metrik kesehatan dan target ekuilibrium.
 * @param {Array<object>} datastoresInCluster - Array objek datastore dalam satu cluster.
 * @returns {object} Objek yang berisi { totalCapacity, totalProvisioned, averageUtilization }.
 */
function getClusterEquilibriumStatus(datastoresInCluster) {
  let totalCapacity = 0;
  let totalProvisioned = 0;

  datastoresInCluster.forEach((ds) => {
    totalCapacity += ds.capacity;
    totalProvisioned += ds.provisioned;
  });

  const averageUtilization = totalCapacity > 0 ? (totalProvisioned / totalCapacity) * 100 : 0;

  return {
    totalCapacity: totalCapacity,
    totalProvisioned: totalProvisioned,
    averageUtilization: averageUtilization,
  };
}
