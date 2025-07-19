// ===== FILE: Rekomendasi.gs =====

// ====================================================================
// BAGIAN 1: FUNGSI UNTUK ALUR PERCAKAPAN TERPANDU
// ====================================================================

/**
 * [FINAL v3.1.3] Memulai alur percakapan terpandu untuk rekomendasi setup.
 * @param {string} chatId - ID chat tempat percakapan dimulai.
 * @param {string} userId - ID pengguna yang memulai percakapan.
 * @param {object} config - Objek konfigurasi bot.
 */

/**
 * [REFACTOR STATE-DRIVEN] Memulai alur percakapan terpandu untuk rekomendasi setup.
 */
function mulaiPercakapanRekomendasi(chatId, userId, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const kritikalitasOptions = (config[K.KATEGORI_KRITIKALITAS] || "Critical,High,Medium,Low").split(",").map(item => item.trim());

  // Membuat tombol dengan format callback baru
  const keyboardRows = kritikalitasOptions.map(opt => {
    // Sesi ini berisi data untuk langkah berikutnya (yaitu, menampilkan pertanyaan I/O)
    const sessionId = createCallbackSession({ step: 'io', requirements: { kritikalitas: opt } }, config);
    return [{ text: opt, callback_data: `rekomendasi_machine:handle_step:${sessionId}` }];
  });
  
  const cancelSessionId = createCallbackSession({}, config);
  keyboardRows.push([{ text: "❌ Batal", callback_data: `rekomendasi_machine:cancel:${cancelSessionId}` }]);

  const pesan = "<b>Langkah 1 dari 3:</b> Silakan pilih tingkat kritikalitas VM:";
  const sentMessage = kirimPesanTelegram(pesan, config, "HTML", { inline_keyboard: keyboardRows }, chatId);

  // Tetap gunakan setUserState untuk menangani input teks manual sebagai fallback
  if (sentMessage && sentMessage.ok) {
    setUserState(userId, { 
        action: "AWAITING_REKOMENDASI_KRITIKALITAS", 
        messageId: sentMessage.result.message_id, 
        chatId: chatId, 
        requirements: {} 
    });
  }
}

/**
 * [REFACTOR STATE-DRIVEN] Menampilkan pertanyaan kedua (Profil I/O).
 */
function tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements) {
  const ioOptions = ["High", "Normal"];
  
  // Membuat tombol dengan format callback baru
  const keyboardRows = ioOptions.map(opt => {
      // Sesi ini berisi data untuk langkah berikutnya (yaitu, menampilkan pertanyaan Spek)
      const sessionId = createCallbackSession({ step: 'spek', requirements: { ...requirements, io: opt.toLowerCase() } }, config);
      return [{ text: opt, callback_data: `rekomendasi_machine:handle_step:${sessionId}` }];
  });

  const cancelSessionId = createCallbackSession({}, config);
  keyboardRows.push([{ text: "❌ Batal", callback_data: `rekomendasi_machine:cancel:${cancelSessionId}` }]);
  
  const pesan = `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n\n<b>Langkah 2 dari 3:</b> Sekarang, pilih profil I/O:`;
  editMessageText(pesan, { inline_keyboard: keyboardRows }, chatId, messageId, config);

  // Tetap gunakan setUserState untuk menangani input teks manual sebagai fallback
  setUserState(userId, { 
      action: "AWAITING_REKOMENDASI_IO", 
      messageId: messageId, 
      chatId: chatId, 
      requirements: requirements 
  });
}

/**
 * [REFACTOR STATE-DRIVEN] Menampilkan pertanyaan terakhir (Spesifikasi Teknis).
 */
function tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements) {
  const cancelSessionId = createCallbackSession({}, config);
  const keyboard = { inline_keyboard: [[{ text: "❌ Batal", callback_data: `rekomendasi_machine:cancel:${cancelSessionId}` }]] };

  const pesan = `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n` +
                `✅ Profil I/O: <b>${escapeHtml(requirements.io)}</b>\n\n` +
                "<b>Langkah 3 dari 3:</b> Terakhir, silakan masukkan kebutuhan CPU, RAM (GB), dan Disk (GB) dalam format:\n\n" +
                "<code>CPU RAM DISK</code>\n\n" +
                "Contoh: <code>8 16 100</code>";
  editMessageText(pesan, keyboard, chatId, messageId, config);

  // Tetap gunakan setUserState untuk menangani input teks dari pengguna
  setUserState(userId, { 
      action: "AWAITING_REKOMENDASI_SPEK", 
      messageId: messageId, 
      chatId: chatId, 
      requirements: requirements 
  });
}

// ====================================================================
// BAGIAN 2: FUNGSI UNTUK MESIN REKOMENDASI
// ====================================================================

/**
 * [FINAL v4.0.0 - ADAPTIVE] Fungsi orkestrator utama untuk mendapatkan rekomendasi penempatan VM.
 * Kini menggunakan perhitungan beban aktif dan menyuntikkan data kebijakan ke dalam hasil.
 */
function dapatkanRekomendasiPenempatan(requirements, config) {
  try {
    const { headers: vmHeaders, dataRows: allVmData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    const { headers: dsHeaders, dataRows: allDsData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
    const allRules = bacaAturanPenempatan();
    const clusterPolicies = bacaKebijakanCluster();
    const clusterLoadData = calculateClusterLoad(allVmData, vmHeaders, config);

    const applicableRule = findApplicableRule(requirements, allRules);
    if (!applicableRule) {
      return `ℹ️ Tidak ditemukan aturan penempatan yang cocok untuk Kritikalitas "${requirements.kritikalitas}".`;
    }

    const dsToClusterMap = buildDatastoreToClusterMap(allVmData, vmHeaders, config);
    const { validCandidates, rejected } = filterLokasiByPolicy(
      requirements, applicableRule, config, allVmData, allDsData, dsHeaders,
      vmHeaders, clusterPolicies, dsToClusterMap, clusterLoadData
    );

    if (validCandidates.length === 0) {
      return formatPesanGagal(requirements, rejected, applicableRule);
    }

    const kandidatDenganSkor = skorLokasiKandidat(validCandidates, config, allVmData, vmHeaders);
    kandidatDenganSkor.sort((a, b) => b.skor.total - a.skor.total);

    return formatPesanRekomendasi(
        kandidatDenganSkor.slice(0, 3), requirements, rejected,
        applicableRule, clusterPolicies, clusterLoadData
    );
  } catch (e) {
    console.error(`Gagal mendapatkan rekomendasi: ${e.message}\nStack: ${e.stack}`);
    return `❌ Gagal memproses permintaan rekomendasi. Penyebab: ${e.message}`;
  }
}

/**
 * [HELPER v3.1.3] Membangun peta hubungan antara Datastore dan Cluster.
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

    allVmData.forEach(row => {
        const dsName = row[dsIndex];
        const clusterName = row[clusterIndex];
        if (dsName && clusterName && !dsToClusterMap.has(dsName)) {
            dsToClusterMap.set(dsName, clusterName);
        }
    });
    return dsToClusterMap;
}

/**
 * [REVISI FINAL] Menghitung total beban alokasi AKTIF di setiap cluster.
 * Fungsi ini sekarang MENGECUALIKAN VM 'Power Off' DAN VM bernama 'unused'.
 */
function calculateClusterLoad(allVmData, vmHeaders, config) {
  const clusterLoad = new Map();
  const K = KONSTANTA.KUNCI_KONFIG;
  const clusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
  const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
  const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);
  const stateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
  const nameIndex = vmHeaders.indexOf(config[K.HEADER_VM_NAME]); // <-- Tambahkan ini

  allVmData.forEach((vmRow) => {
    const clusterName = vmRow[clusterIndex];
    const state = String(vmRow[stateIndex] || "").toLowerCase();
    const vmName = String(vmRow[nameIndex] || "").toLowerCase(); // <-- Tambahkan ini

    // --- PERUBAHAN UTAMA DI SINI ---
    // Buat kondisi pengecualian
    const isExcluded = state.includes("off") || vmName.includes("unused");

    // Hanya proses VM jika nama cluster ada DAN TIDAK termasuk yang dikecualikan
    if (clusterName && !isExcluded) {
      if (!clusterLoad.has(clusterName)) {
        clusterLoad.set(clusterName, { cpu: 0, memory: 0 });
      }
      const load = clusterLoad.get(clusterName);
      load.cpu += parseInt(vmRow[cpuIndex], 10) || 0;
      load.memory += parseFloat(vmRow[memoryIndex]) || 0;
    }
    // --- AKHIR PERUBAHAN ---
  });
  return clusterLoad;
}

/**
 * [HELPER v4.0.0 - ADAPTIVE] Menyaring lokasi berdasarkan kebijakan overcommit menggunakan beban aktif.
 */
function filterLokasiByPolicy(
  req, rule, config, allVmData, allDsData, dsHeaders, vmHeaders,
  clusterPolicies, dsToClusterMap, clusterLoadData
) {
  const validCandidates = [];
  const rejected = [];
  const allTargetClusters = getAllTargetClusters(rule, allVmData, vmHeaders, config);

  for (const clusterName of allTargetClusters) {
    const policy = clusterPolicies.get(clusterName);
    if (!policy) {
      rejected.push({ cluster: clusterName, reason: "kebijakan_tidak_ada" });
      continue;
    }
    
    const physicalMemoryGb = (policy["physicalmemorytb"] || 0) * 1024;
    const memoryRatio = policy["memoryovercommitratio"];
    const maxMemory = physicalMemoryGb * memoryRatio;
    
    const physicalCpu = policy["physicalcpucores"];
    const cpuRatio = policy["cpuovercommitratio"];
    const maxCpu = physicalCpu * cpuRatio;

    const currentLoad = clusterLoadData.get(clusterName)?.activeLoad || { cpu: 0, memory: 0 };

    if (currentLoad.cpu + req.cpu > maxCpu) {
      rejected.push({ cluster: clusterName, reason: "overcommit_cpu", current: currentLoad.cpu, max: maxCpu, ratio: `${cpuRatio}:1` });
      continue;
    }
    if (currentLoad.memory + req.memory > maxMemory) {
      rejected.push({ cluster: clusterName, reason: "overcommit_memori", current: currentLoad.memory, max: maxMemory, ratio: `${memoryRatio}:1` });
      continue;
    }

    const datastoresInCluster = findDatastoresInCluster(
      clusterName, req, rule, config, allDsData, dsHeaders, dsToClusterMap
    );

    if (datastoresInCluster.length > 0) {
      validCandidates.push(...datastoresInCluster.map(ds => ({...ds, clusterName: clusterName})));
    } else {
      rejected.push({ cluster: clusterName, reason: "kapasitas_disk_tidak_cukup" });
    }
  }

  return { validCandidates, rejected };
}

/**
 * [HELPER v3.1.3] Mencari datastore di dalam cluster yang lolos.
 */
function findDatastoresInCluster(clusterName, req, rule, config, allDsData, dsHeaders, dsToClusterMap) {
    const aliasMap = config[KONSTANTA.KUNCI_KONFIG.MAP_ALIAS_STORAGE] || {};
    const dsNameIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
    const dsCapGbIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_CAPACITY_GB]);
    const dsProvGbIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_PROV_DS_GB]);
    
    const p1Storage = getRuleAsArray(rule, 'storageprioritas1');
    const p2Storage = getRuleAsArray(rule, 'storageprioritas2');
    
    const filterByStorageTier = (dsName, tiers) => {
        if (!tiers || tiers.length === 0 || tiers.includes('*')) return true;
        const { storageType } = getStorageInfoFromDsName(dsName, aliasMap);
        return storageType && tiers.some(tier => storageType.toUpperCase().includes(tier.toUpperCase()));
    };

    const checkCapacity = (dsRow) => {
        const freeSpace = (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0);
        return freeSpace >= req.disk;
    };

    const getValidDatastores = (dsPool, tiers) => {
        return dsPool.filter(dsRow => {
            const dsName = dsRow[dsNameIndex];
            const actualCluster = dsToClusterMap.get(dsName);
            return actualCluster === clusterName && filterByStorageTier(dsName, tiers) && checkCapacity(dsRow);
        }).map(dsRow => ({
            vcenter: rule['vcentertarget'],
            clusterName: clusterName,
            dsName: dsRow[dsNameIndex],
            freeSpaceGB: (parseFloat(dsRow[dsCapGbIndex]) || 0) - (parseFloat(dsRow[dsProvGbIndex]) || 0)
        }));
    };

    let kandidat = getValidDatastores(allDsData, p1Storage);
    if (kandidat.length === 0 && p2Storage.length > 0) {
        kandidat = getValidDatastores(allDsData, p2Storage);
    }
    
    return kandidat;
}

/**
 * [HELPER v3.1.3] Mencari aturan yang berlaku dengan logika fallback.
 */
function findApplicableRule(req, allRules) {
    const reqKritikalitasLower = req.kritikalitas.toLowerCase();
    let rule = allRules.find(r => String(r['kritikalitas']).toLowerCase().startsWith(reqKritikalitasLower));
    if (!rule) {
        rule = allRules.find(r => String(r['kritikalitas']).toLowerCase() === 'default');
    }
    return rule;
}

/**
 * [HELPER v3.1.3] Mendapatkan semua cluster target berdasarkan aturan prioritas.
 */
function getAllTargetClusters(rule, allVmData, vmHeaders, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const vcenterTarget = rule['vcentertarget'];
    const vmClusterIndex = vmHeaders.indexOf(config[K.HEADER_VM_CLUSTER]);
    const vmVCenterIndex = vmHeaders.indexOf(config[K.HEADER_VM_VCENTER]);
    const allClustersInVCenter = [...new Set(allVmData.filter(vm => vm[vmVCenterIndex] === vcenterTarget).map(vm => vm[vmClusterIndex]).filter(Boolean))];

    const p1 = getRuleAsArray(rule, 'prioritas1(cluster)');
    const p2 = getRuleAsArray(rule, 'prioritas2(cluster)');
    const p3 = getRuleAsArray(rule, 'prioritas3(cluster)');
    
    if (p1.includes('all_others')) {
        const otherPriorityClusters = [...p2, ...p3];
        const exceptionClusters = getRuleAsArray(rule, 'clusterdikecualikan');
        return allClustersInVCenter.filter(c => !otherPriorityClusters.includes(c) && !exceptionClusters.includes(c));
    }
    
    return [...new Set([...p1, ...p2, ...p3])];
}

/**
 * [HELPER v3.1.3] Helper untuk membaca aturan sebagai array yang aman.
 */
function getRuleAsArray(rule, ruleName) {
    const value = rule[ruleName];
    if (!value) return [];
    return Array.isArray(value) ? value : String(value).split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * [HELPER v3.1.3] Memberikan skor pada kandidat yang lolos.
 */
function skorLokasiKandidat(kandidat, config, allVmData, vmHeaders) {
    const clusterLoad = calculateClusterLoad(allVmData, vmHeaders, config);
    const preferredDsKeywords = config['KATA_KUNCI_DS_DIUTAMAKAN'] || [];
    
    return kandidat.map(lokasi => {
        const skorDatastore = Math.min(Math.log10(lokasi.freeSpaceGB + 1) * 12, 40);
        const totalCpu = clusterLoad.get(lokasi.clusterName)?.cpu || 0;
        const skorCluster = Math.max(40 - (totalCpu / 50), 0);

        const isPreferred = preferredDsKeywords.some(kw => lokasi.dsName.toLowerCase().includes(kw.toLowerCase()));
        const skorPrioritasNama = isPreferred ? 20 : 0;
        
        lokasi.skor = { total: parseFloat((skorDatastore + skorCluster + skorPrioritasNama).toFixed(1)) };
        lokasi.alasan = isPreferred ? "Datastore prioritas, ruang lega & beban cluster rendah." : "Ruang lega & beban cluster rendah.";
        return lokasi;
    });
}

/**
 * [HELPER v3.1.3] Memformat pesan rekomendasi sukses.
 */
function formatPesanRekomendasi(kandidatTerbaik, req, rejected, rule) {
    const kritikalitasTampil = rule['kritikalitas'] || req.kritikalitas;
    const ioProfileTampil = rule['ioprofile'] === '*' ? req.io : (rule['ioprofile'] || req.io);

    let pesan = `💡 <b>Rekomendasi Penempatan VM Baru</b>\n\n`;
  pesan += `Berdasarkan spesifikasi:\n`;
  pesan += ` • CPU: ${req.cpu}, Memori: ${req.memory} GB, Disk: ${req.disk} GB\n`;
  pesan += ` • Kritikalitas: ${escapeHtml(rule["kritikalitas"] || req.kritikalitas)}, Profil I/O: ${escapeHtml(rule["ioprofile"] === "*" ? req.io : rule["ioprofile"] || req.io)}\n\n`;
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
    pesan += `\n<i>Catatan: Cluster berikut telah dievaluasi namun diabaikan karena tidak memenuhi kebijakan: ${rejected.map((c) => `<code>${c.cluster}</code>`).join(", ")}.</i>`;
  }

  // --- PERUBAHAN UTAMA DI SINI ---
  pesan += `\n\n<i>*Catatan: Perhitungan alokasi sumber daya <b>tidak termasuk</b> VM dengan status 'Power Off' atau bernama 'unused'.</i>`;
  // --- AKHIR PERUBAHAN ---

  return pesan;
}

/**
 * [REVISI] Memformat pesan saat tidak ada kandidat yang ditemukan.
 * Menambahkan catatan kaki untuk menjelaskan bahwa VM yang mati tidak dihitung.
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
      pesan += ` • <code>${c.cluster}</code>: <i>${getReasonText(c)}</i>\n`;
      const recommendationText = getRecommendationText(c, rule);
      if (recommendationText) recommendations.add(recommendationText);
    });
    if (recommendations.size > 0) {
      pesan += `\n<b>Rekomendasi Tindak Lanjut:</b>\n`;
      recommendations.forEach((rec) => { pesan += ` • ${rec}\n`; });
    }
  } else {
    pesan += `Tidak ada cluster yang cocok dengan aturan penempatan awal yang ditemukan.`;
  }

  // --- PERUBAHAN UTAMA DI SINI ---
  pesan += `\n\n<i>*Catatan: Perhitungan alokasi sumber daya <b>tidak termasuk</b> VM dengan status 'Power Off' atau bernama 'unused'.</i>`;
  // --- AKHIR PERUBAHAN ---

  return pesan;
}

/**
 * [HELPER v3.1.3] Menerjemahkan kode alasan menjadi teks yang kaya.
 */
function getReasonText(rejection) {
    switch (rejection.reason) {
        case "kebijakan_tidak_ada": return "Tidak memiliki kebijakan overcommit yang terdefinisi.";
        case "overcommit_cpu": return `Akan melanggar kebijakan overcommit CPU (${rejection.ratio}). Alokasi saat ini: ${rejection.current} dari maks. ${rejection.max} vCPU.`;
        case "overcommit_memori": return `Akan melanggar kebijakan overcommit Memori (${rejection.ratio}). Alokasi saat ini: ${rejection.current.toFixed(0)} dari maks. ${rejection.max.toFixed(0)} GB.`;
        case "kapasitas_disk_tidak_cukup": return "Tidak ada datastore yang memenuhi syarat kapasitas atau tipe storage.";
        default: return "Alasan tidak diketahui.";
    }
}

/**
 * [HELPER v3.1.3] Membuat teks rekomendasi yang cerdas.
 */
function getRecommendationText(rejection, rule) {
    switch (rejection.reason) {
        case "kebijakan_tidak_ada": return `Tambahkan entri untuk <code>${rejection.cluster}</code> di sheet "Kebijakan Overcommit Cluster".`;
        case "overcommit_cpu": case "overcommit_memori": return `Lakukan peninjauan pada cluster <code>${rejection.cluster}</code> atau jalankan <code>/simulasi cleanup ${rejection.cluster}</code> untuk membebaskan sumber daya.`;
        case "kapasitas_disk_tidak_cukup":
            const p1Storage = getRuleAsArray(rule, 'storageprioritas1');
            const p2Storage = getRuleAsArray(rule, 'storageprioritas2');
            let allAllowedStorage = [];
            if (p1Storage.length > 0 && p1Storage[0] !== '*') allAllowedStorage = allAllowedStorage.concat(p1Storage);
            if (p2Storage.length > 0 && p2Storage[0] !== '*') allAllowedStorage = allAllowedStorage.concat(p2Storage);
            const uniqueAllowedStorage = [...new Set(allAllowedStorage)];
            const storageTypeSuggestion = (uniqueAllowedStorage.length > 0) ? uniqueAllowedStorage.map(s => `<code>${s}</code>`).join(' atau ') : 'yang sesuai aturan';
            return `Buat datastore baru di <code>${rejection.cluster}</code> dengan tipe storage ${storageTypeSuggestion}.`;
        default: return null;
    }
}
