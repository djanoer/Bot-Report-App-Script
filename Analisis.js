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
      finalMessage += `• <b>Status:</b> Provisioned ${dsInfo.provisionedGb.toFixed(2)} GB (${provisionedTb.toFixed(2)} TB) / ${dsInfo.capacityGb.toFixed(2)} GB (${capacityTb.toFixed(2)} TB) (<b>${dsInfo.utilization.toFixed(1)}%</b>)\n`;

      const diagnosis = diagnoseOverprovisioningCause(dsInfo.name, config);
      if (diagnosis) finalMessage += `• <b>Indikasi Penyebab:</b> ${diagnosis}\n`;
      finalMessage += `• <b>Target Migrasi:</b> ${migrationTargetGb.toFixed(2)} GB (~${migrationTargetTb.toFixed(2)} TB)\n`;

      const migrationPlan = _buildMigrationPlan(dsInfo, allDatastores, allVms, vmHeaders, migrationConfig, config);

      finalMessage += `\n✅ <b>Rencana Tindak Lanjut:</b>\n`;
      if (migrationPlan.size > 0) {
        migrationPlan.forEach((vms, destDsName) => {
          const totalSizeToDest = vms.reduce((sum, vm) => sum + vm.provisionedGb, 0);
          finalMessage += `\n➡️ Migrasi ke <code>${destDsName}</code> (~${totalSizeToDest.toFixed(2)} GB):\n`;
          vms.forEach((vm) => {
            finalMessage += ` • <code>${escapeHtml(vm.name)}</code> (${vm.provisionedGb.toFixed(2)} GB) | ${escapeHtml(vm.criticality)} | ${escapeHtml(vm.state)}\n`;
          });
        });
      } else {
        finalMessage += "<i>Tidak ditemukan datastore tujuan yang cocok di dalam cluster ini.</i>\n\n";
        finalMessage += "💡 <b>Rekomendasi:</b>\n";
        finalMessage += `Buat Datastore baru pada <b>Cluster ${dsInfo.cluster}</b> dengan tipe <code>${dsInfo.type || "Sesuai standar"}</code> dan kapasitas > <code>${migrationTargetGb.toFixed(2)} GB</code>.\n`;
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

    // Indeks header VM
    const vmNameIndex = vmHeaders.indexOf(config[K.HEADER_VM_NAME]);
    const vmProvGbIndex = vmHeaders.indexOf(config[K.HEADER_VM_PROV_GB]);
    const vmStateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
    const vmCritIndex = vmHeaders.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
    const vmDsColumnIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
    const skorKritikalitas = config[K.SKOR_KRITIKALITAS] || {};

    let datastoresInCluster = JSON.parse(
        JSON.stringify(allDatastores.filter((ds) => ds.cluster === sourceDsInfo.cluster))
    );

    let candidatePool = allVms
        .filter((row) => row[vmDsColumnIndex] === sourceDsInfo.name)
        .map((row) => ({
        name: row[vmNameIndex],
        provisionedGb: parseLocaleNumber(row[vmProvGbIndex]),
        state: row[vmStateIndex],
        criticality: row[vmCritIndex],
        }));

    const migrationPlan = new Map();
    let totalMigrated = 0;
    const MAX_MIGRATION_LOOPS = 50;
    let loopCount = 0;

    while (totalMigrated < migrationTargetGb && candidatePool.length > 0 && loopCount < MAX_MIGRATION_LOOPS) {
        loopCount++;
        let bestMove = { vmIndex: -1, destDsName: null, efficiencyScore: -Infinity };

        for (let i = 0; i < candidatePool.length; i++) {
        const vm = candidatePool[i];
        const sourceDs = datastoresInCluster.find((ds) => ds.name === sourceDsInfo.name);
        const recipients = datastoresInCluster.filter(
            (ds) => ds.name !== sourceDs.name && vm.provisionedGb <= ds.freeSpace
        );
        if (recipients.length === 0) continue;

        for (const destDs of recipients) {
            const isValidMove = findBestDestination(sourceDs, vm.provisionedGb, [destDs], migrationConfig, config);
            if (!isValidMove || isValidMove.error) continue;

            let benefitScore = 1;
            if (
            String(vm.state || "")
                .toLowerCase()
                .includes("off")
            )
            benefitScore += 10000;
            if (
            String(vm.name || "")
                .toLowerCase()
                .includes("unused")
            )
            benefitScore += 5000;
            const critScore =
            skorKritikalitas[
                String(vm.criticality || "")
                .toUpperCase()
                .trim()
            ] || 0;
            benefitScore += (10 - critScore) * 100;

            const sizeDifference = Math.abs(vm.provisionedGb - (migrationTargetGb - totalMigrated));
            const cost = 1 + sizeDifference;
            const efficiencyScore = benefitScore / cost;

            if (efficiencyScore > bestMove.efficiencyScore) {
            bestMove = { vmIndex: i, destDsName: destDs.name, efficiencyScore: efficiencyScore };
            }
        }
        }

        if (bestMove.vmIndex !== -1) {
        const vmToMove = candidatePool[bestMove.vmIndex];
        if (!migrationPlan.has(bestMove.destDsName)) {
            migrationPlan.set(bestMove.destDsName, []);
        }
        migrationPlan.get(bestMove.destDsName).push(vmToMove);
        totalMigrated += vmToMove.provisionedGb;
        const destDs = datastoresInCluster.find((ds) => ds.name === bestMove.destDsName);
        destDs.freeSpace -= vmToMove.provisionedGb;
        candidatePool.splice(bestMove.vmIndex, 1);
        } else {
        break;
        }
    }
    return migrationPlan;
}

function calculateMigrationScore(vm, config) {
    let score = 0;
    const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};

    // 1. Bobot Status (Paling Penting)
    const isOff = String(vm.state || "")
        .toLowerCase()
        .includes("off");
    if (isOff) {
        score += 1000000; // Bobot sangat besar untuk VM yang mati
    }

    // 2. Bobot Nama "unused"
    const isUnused = String(vm.name || "")
        .toLowerCase()
        .includes("unused");
    if (isUnused) {
        score += 500000; // Bobot besar untuk VM yang tidak terpakai
    }

    // 3. Bobot Kritikalitas (Terbalik)
    const criticalityScore =
        skorKritikalitas[
        String(vm.criticality || "")
            .toUpperCase()
            .trim()
        ] || 0;
    // Bobot tertinggi untuk yang tidak terdefinisi (skor 0), terendah untuk CRITICAL (skor 5)
    score += (10 - criticalityScore) * 1000;

    // 4. Bobot Ukuran (Terbalik)
    // Memberi skor lebih tinggi pada VM yang lebih kecil.
    // Angka 10000 digunakan sebagai basis maksimum agar perhitungannya signifikan.
    const size = vm.provisionedGb || 0;
    if (size > 0) {
        score += 10000 - size;
    }

    return score;
}

function generateClusterAnalysis(clusterName, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const analysis = {
        totalVms: 0,
        on: 0,
        off: 0,
        totalCpu: 0,
        totalMemory: 0,
        totalVmProvisionedTb: 0,
        totalDsCapacityTb: 0,
        diskUtilizationPercent: 0,
        criticalVmOffCount: 0,
        criticalVmOffDetails: {},
    };

    try {
        // 1. Analisis VM (Tidak ada perubahan di blok ini)
        const { headers: vmHeaders, results: vmsInCluster } = searchVmsByCluster(clusterName, config);
        if (vmsInCluster.length > 0) {
        analysis.totalVms = vmsInCluster.length;
        const stateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
        const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
        const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);
        const critIndex = vmHeaders.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
        const provTbIndex = vmHeaders.indexOf(config[K.HEADER_VM_PROV_TB]);
        const monitoredCritLevels = Object.keys(config[K.SKOR_KRITIKALITAS] || {});

        vmsInCluster.forEach((row) => {
            const state = String(row[stateIndex] || "").toLowerCase();
            if (state.includes("on")) analysis.on++;
            else analysis.off++;
            analysis.totalCpu += parseInt(row[cpuIndex], 10) || 0;
            analysis.totalMemory += parseFloat(row[memoryIndex]) || 0;
            analysis.totalVmProvisionedTb += parseLocaleNumber(row[provTbIndex]);

            const criticality = String(row[critIndex] || "")
            .toUpperCase()
            .trim();
            if (monitoredCritLevels.includes(criticality) && !state.includes("on")) {
            analysis.criticalVmOffCount++;
            analysis.criticalVmOffDetails[criticality] = (analysis.criticalVmOffDetails[criticality] || 0) + 1;
            }
        });
        }

        // 2. Analisis Datastore dengan Logika Parsing Baru
        const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_DS]);
        if (dsSheet && dsSheet.getLastRow() > 1) {
        const dsData = dsSheet.getDataRange().getValues();
        const dsHeaders = dsData.shift();
        const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
        const dsCapTbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_TB]);

        const includedKeywords = (config.KATA_KUNCI_DS_DIUTAMAKAN || []).map((k) => k.toLowerCase());
        const excludedKeywords = (config[K.DS_KECUALI] || []).map((k) => k.toLowerCase());

        // Ekstrak pola inti cluster (CLxx) dari nama cluster lengkap yang dicari.
        const clusterPatternMatch = clusterName.match(/CL\d+/i);
        const coreClusterPattern = clusterPatternMatch ? clusterPatternMatch[0].toLowerCase() : null;

        if (coreClusterPattern && dsNameIndex !== -1 && dsCapTbIndex !== -1) {
            dsData.forEach((row) => {
            const dsName = String(row[dsNameIndex] || "");
            const dsNameLower = dsName.toLowerCase();

            // Periksa apakah nama DS mengandung pola inti cluster (cth: 'cl01').
            if (!dsNameLower.includes(coreClusterPattern)) {
                return; // Lanjut ke datastore berikutnya jika tidak cocok
            }

            const isIncluded =
                includedKeywords.length === 0 || includedKeywords.some((keyword) => dsNameLower.includes(keyword));
            if (!isIncluded) {
                return;
            }

            const isExcluded = excludedKeywords.some((keyword) => dsNameLower.includes(keyword));
            if (isExcluded) {
                return;
            }

            analysis.totalDsCapacityTb += parseLocaleNumber(row[dsCapTbIndex]);
            });
        }
        }

        // 3. Hitung utilisasi
        if (analysis.totalDsCapacityTb > 0) {
        analysis.diskUtilizationPercent = (analysis.totalVmProvisionedTb / analysis.totalDsCapacityTb) * 100;
        }

        return analysis;
    } catch (e) {
        console.error(`Gagal melakukan analisis untuk cluster "${clusterName}". Error: ${e.message}`);
        return analysis;
    }
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
