// ===== FILE: ManajemenData.gs =====

/**
 * [MODIFIKASI FINAL] Menghapus pemanggilan ke jalankanPemeriksaanAmbangBatas.
 * Fungsi ini kini hanya bertanggung jawab untuk sinkronisasi dan laporan operasional.
 */
function syncDanBuatLaporanHarian(showUiAlert = true, triggerSource = "TIDAK DIKETAHUI", config = null) {
  const activeConfig = config || bacaKonfigurasi();
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(KONSTANTA.LIMIT.LOCK_TIMEOUT_MS); 

  if (!lockAcquired) {
    console.log("Proses sinkronisasi sudah berjalan, permintaan saat ini dibatalkan.");
    return;
  }
  
  let statusMessageId = null;
  try {
    const startTime = new Date();
    const timestamp = startTime.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp}</b>\n\n⏳ Memulai sinkronisasi penuh & pembuatan laporan operasional...`;
    
    const sentMessage = kirimPesanTelegram(pesanAwal, activeConfig, 'HTML');
    if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
    }

    const KUNCI = KONSTANTA.KUNCI_KONFIG;
    const sumberId = activeConfig[KUNCI.ID_SUMBER];
    const sheetVmName = activeConfig[KUNCI.SHEET_VM];
    const sheetDsName = activeConfig[KUNCI.SHEET_DS];

    // --- Proses Sinkronisasi dan Log ---
    console.log("Memulai sinkronisasi dan pemeriksaan perubahan VM...");
    salinDataSheet(sheetVmName, sumberId, activeConfig);
    try {
      const kolomVmUntukDipantau = activeConfig[KUNCI.KOLOM_PANTAU] || [];
      const columnsToTrackVm = kolomVmUntukDipantau.map(namaKolom => ({ nama: namaKolom }));
      if (columnsToTrackVm.length > 0) {
        processDataChanges(activeConfig, sheetVmName, KONSTANTA.NAMA_FILE.ARSIP_VM, KONSTANTA.HEADER_VM.PK, columnsToTrackVm, KONSTANTA.NAMA_ENTITAS.VM);
      }
    } catch(e) {
      console.error(`Gagal Menjalankan Pemeriksaan Perubahan VM. Penyebab: ${e.message}`);
    }

    if (sheetDsName) {
      console.log("Memulai sinkronisasi dan pemeriksaan perubahan Datastore...");
      salinDataSheet(sheetDsName, sumberId, activeConfig);
      try {
        const kolomDsUntukDipantau = activeConfig[KUNCI.KOLOM_PANTAU_DS] || [];
        const columnsToTrackDs = kolomDsUntukDipantau.map(namaKolom => ({ nama: namaKolom }));
        if (columnsToTrackDs.length > 0) {
          processDataChanges(activeConfig, sheetDsName, KONSTANTA.NAMA_FILE.ARSIP_DS, activeConfig['HEADER_DATASTORE_NAME'], columnsToTrackDs, KONSTANTA.NAMA_ENTITAS.DATASTORE);
        }
      } catch(e) {
        console.error(`Gagal Menjalankan Pemeriksaan Perubahan Datastore. Penyebab: ${e.message}`);
      }
    }
    
    // --- Langkah Pembuatan Laporan ---
    const pesanLaporanOperasional = buatLaporanHarianVM(activeConfig);
    kirimPesanTelegram(pesanLaporanOperasional, activeConfig, 'HTML');
    
    // --- AWAL MODIFIKASI: Pemanggilan ke jalankanPemeriksaanAmbangBatas dihapus dari sini ---
    // jalankanPemeriksaanAmbangBatas(activeConfig); // Baris ini telah dihapus.
    // --- AKHIR MODIFIKASI ---

    const pesanKonfirmasi = `<b>✅ Proses Selesai</b>\n\nLaporan operasional telah dikirimkan.`;
    if (statusMessageId) {
        editMessageText(pesanKonfirmasi, null, activeConfig.TELEGRAM_CHAT_ID, statusMessageId, activeConfig);
    }

  } catch (e) {
    handleCentralizedError(e, "syncDanBuatLaporanHarian", activeConfig);
    const pesanError = `<b>❌ Proses Gagal</b>\n\nTerjadi kesalahan kritis saat menjalankan sinkronisasi.`;
    if (statusMessageId) {
        editMessageText(pesanError, null, activeConfig.TELEGRAM_CHAT_ID, statusMessageId, activeConfig);
    }
  } finally {
    lock.releaseLock();
    console.log("Proses selesai dan kunci dilepaskan.");
  }
}

/**
 * Fungsi untuk menjalankan sinkronisasi data tiket secara berkala.
 * Fungsi ini dimaksudkan untuk dipanggil oleh pemicu waktu (trigger)
 * atau saat perintah /cektiket dijalankan.
 * [DIPERBARUI] Menggunakan nama sheet sumber sebagai nama sheet tujuan secara otomatis.
 */
function syncTiketDataForTrigger() {
  console.log("Memulai sinkronisasi data tiket...");
  try {
    const config = bacaKonfigurasi();
    const sumberId = config[KONSTANTA.KUNCI_KONFIG.TIKET_SPREADSHEET_ID];
    const namaSheet = config[KONSTANTA.KUNCI_KONFIG.NAMA_SHEET_TIKET];

    if (!sumberId || !namaSheet) {
      // Melemparkan error agar bisa ditangkap di level yang lebih tinggi
      throw new Error("Konfigurasi TIKET_SPREADSHEET_ID atau NAMA_SHEET_TIKET tidak lengkap.");
    }
    
    // salinDataSheet sudah melemparkan error jika gagal, jadi kita tidak perlu mengulanginya.
    salinDataSheet(namaSheet, sumberId);
    
    console.log("Sinkronisasi data tiket berhasil diselesaikan.");
    
  } catch (e) {
    console.error(`Gagal menjalankan sinkronisasi tiket: ${e.message}`);
    // Melemparkan error kembali agar bisa ditangani oleh fungsi pemanggil (/cektiket)
    throw new Error(`Gagal sinkronisasi data tiket. Penyebab: ${e.message}`);
  }
}

/**
 * Helper untuk menyalin konten sebuah sheet dari spreadsheet sumber ke tujuan.
 */
function salinDataSheet(namaSheet, sumberId) {
  try {
    if (!sumberId) throw new Error("ID Spreadsheet Sumber belum diisi di sheet Konfigurasi.");
    if (!namaSheet) {
      console.warn("Nama sheet untuk disalin tidak disediakan. Proses dilewati.");
      return;
    }
    const sumberSpreadsheet = SpreadsheetApp.openById(sumberId);
    const sumberSheet = sumberSpreadsheet.getSheetByName(namaSheet);
    if (!sumberSheet) throw new Error(`Sheet "${namaSheet}" tidak ditemukan di file SUMBER.`);
    
    const dataSumber = sumberSheet.getDataRange().getValues();
    if (dataSumber.length === 0) {
        console.warn(`Sheet sumber "${namaSheet}" kosong. Tidak ada data untuk diimpor.`);
        return;
    };

    const tujuanSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let tujuanSheet = tujuanSpreadsheet.getSheetByName(namaSheet);
    if (!tujuanSheet) {
      tujuanSheet = tujuanSpreadsheet.insertSheet(namaSheet);
      console.log(`Sheet tujuan "${namaSheet}" tidak ditemukan, sheet baru telah dibuat.`);
    }

    tujuanSheet.clearContents();
    tujuanSheet.getRange(1, 1, dataSumber.length, dataSumber[0].length).setValues(dataSumber);
    console.log(`Data untuk sheet "${namaSheet}" berhasil disalin.`);
  } catch (e) {
    throw new Error(`Gagal memproses impor sheet "${namaSheet}". Penyebab: ${e.message}`);
  }
}

/**
 * [FINAL & MULTI-PK SUPPORT] Mencari VM di sheet.
 * Fungsi ini sekarang dapat mencari satu istilah (untuk pencarian awal)
 * atau banyak Primary Key yang dipisahkan oleh '|' (untuk menampilkan halaman dari cache).
 */
function searchVmOnSheet(searchTerm, config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
  const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
  const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);

  if (pkIndex === -1 || nameIndex === -1 || ipIndex === -1) {
    throw new Error(`Satu atau lebih kolom header penting (PK, Nama, IP) tidak ditemukan di sheet "${sheetName}".`);
  }

  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  let results = [];

  // --- [MODIFIKASI UTAMA DIMULAI DI SINI] ---
  // Cek apakah searchTerm adalah untuk multi-PK atau pencarian biasa
  if (searchTerm.includes('|')) {
    // Mode Multi-PK: Buat Set untuk pencarian yang sangat cepat
    const searchPks = new Set(searchTerm.split('|').map(pk => normalizePrimaryKey(pk.trim())));
    results = allData.filter(row => {
      const vmPk = normalizePrimaryKey(String(row[pkIndex] || '').trim());
      return searchPks.has(vmPk);
    });
  } else {
    // Mode Pencarian Biasa (logika yang sudah ada)
    const searchLower = searchTerm.toLowerCase().trim();
    const normalizedSearchTerm = normalizePrimaryKey(searchLower);
    
    results = allData.filter(row => {
      const vmPk = normalizePrimaryKey(String(row[pkIndex] || '').trim()).toLowerCase();
      const vmName = String(row[nameIndex] || '').trim().toLowerCase();
      const vmIp = String(row[ipIndex] || '').trim().toLowerCase();
      
      return vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower);
    });
  }
  // --- [AKHIR MODIFIKASI] ---

  return { headers, results };
}

/**
 * [MODIFIKASI FITUR 2] Memformat satu baris data VM dan menambahkan keyboard kontekstual.
 * Fungsi ini sekarang bisa menerima 'origin' untuk membuat tombol kembali yang cerdas.
 *
 * @param {Array} row - Array yang berisi data untuk satu baris VM.
 * @param {Array<string>} headers - Array header dari sheet VM.
 * @param {object} config - Objek konfigurasi bot yang aktif.
 * @param {object|null} origin - Objek berisi info asal { searchTerm: '...', page: '...' }
 * @returns {object} Objek berisi { pesan: string, keyboard: object }.
 */
function formatVmDetail(row, headers, config) {
  const indices = {
    vmName: headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME),
    pk: headers.indexOf(KONSTANTA.HEADER_VM.PK),
    ip: headers.indexOf(KONSTANTA.HEADER_VM.IP),
    state: headers.indexOf(KONSTANTA.HEADER_VM.STATE),
    uptime: headers.indexOf(KONSTANTA.HEADER_VM.UPTIME),
    cpu: headers.indexOf(KONSTANTA.HEADER_VM.CPU),
    memory: headers.indexOf(KONSTANTA.HEADER_VM.MEMORY),
    provGb: headers.indexOf(KONSTANTA.HEADER_VM.PROV_GB),
    cluster: headers.indexOf(KONSTANTA.HEADER_VM.CLUSTER),
    datastore: headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER]),
    kritikalitas: headers.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS),
    kelompokApp: headers.indexOf(KONSTANTA.HEADER_VM.KELOMPOK_APP),
    devOps: headers.indexOf(KONSTANTA.HEADER_VM.DEV_OPS),
    guestOs: headers.indexOf(KONSTANTA.HEADER_VM.GUEST_OS),
    vcenter: headers.indexOf(KONSTANTA.HEADER_VM.VCENTER)
  };

  const addDetail = (value, icon, label, isCode = false) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const formattedValue = isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
      return `•  ${icon} <b>${label}:</b> ${formattedValue}\n`;
    }
    return '';
  };
  
  let pesan = "🖥️  <b>Detail Virtual Machine</b>\n\n";
  pesan += "<b>Informasi Umum</b>\n";
  pesan += addDetail(row[indices.vmName], '🏷️', 'Nama VM', true);
  const rawPk = row[indices.pk];
  const normalizedPk = normalizePrimaryKey(rawPk);
  pesan += addDetail(normalizedPk, '🔑', 'Primary Key', true);
  pesan += addDetail(row[indices.ip], '🌐', 'IP Address', true);
  const stateValue = row[indices.state] || '';
  const stateIcon = stateValue.toLowerCase().includes('on') ? '🟢' : '🔴';
  pesan += addDetail(stateValue, stateIcon, 'Status');
  pesan += addDetail(`${row[indices.uptime]} hari`, '⏳', 'Uptime');

  pesan += "\n<b>Sumber Daya & Kapasitas</b>\n";
  pesan += addDetail(`${row[indices.cpu]} vCPU`, '⚙️', 'CPU');
  pesan += addDetail(`${row[indices.memory]} GB`, '🧠', 'Memory');
  pesan += addDetail(`${row[indices.provGb]} GB`, '💽', 'Provisioned');
  
  const clusterName = row[indices.cluster];
  const datastoreName = row[indices.datastore];
  pesan += addDetail(clusterName, '☁️', 'Cluster');
  pesan += addDetail(datastoreName, '🗄️', 'Datastore');

  const environment = getEnvironmentFromDsName(datastoreName || '', config[KONSTANTA.KUNCI_KONFIG.MAP_ENV]) || 'N/A';
  
  pesan += "\n<b>Konfigurasi & Manajemen</b>\n";
  pesan += addDetail(environment, '🌍', 'Environment');
  pesan += addDetail(row[indices.kritikalitas], '🔥', 'Kritikalitas BIA');
  pesan += addDetail(row[indices.kelompokApp], '📦', 'Aplikasi BIA');
  pesan += addDetail(row[indices.devOps], '👥', 'DEV/OPS');
  pesan += addDetail(row[indices.guestOs], '🐧', 'Guest OS');
  pesan += addDetail(row[indices.vcenter], '🏢', 'vCenter');

  const keyboardRows = [];

  if (normalizedPk) {
    keyboardRows.push([{ text: `📜 Lihat Riwayat VM (${normalizedPk})`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.HISTORY_PREFIX}${normalizedPk}` }]);
  }

  const secondRowButtons = [];
  if (clusterName) {
    secondRowButtons.push({ text: `⚙️ VM di Cluster ${clusterName}`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.CLUSTER_PREFIX}${clusterName}` });
  }
  if (datastoreName) {
    secondRowButtons.push({ text: `🗄️ Detail DS ${datastoreName}`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_PREFIX}${datastoreName}` });
  }

  if (secondRowButtons.length > 0) {
    keyboardRows.push(secondRowButtons);
  }

  const keyboard = keyboardRows.length > 0 ? { inline_keyboard: keyboardRows } : null;
  return { pesan, keyboard };
}

/**
 * [FINAL & STABIL] Memformat detail datastore. Tombol "Lihat Daftar VM" membawa PK asal
 * dan ada tombol "Kembali" jika ada PK asal.
 */
function formatDatastoreDetail(details, originPk = null) {
  if (!details) {
    return { pesan: "❌ Detail untuk datastore tersebut tidak dapat ditemukan.", keyboard: null };
  }
  
  let message = `🗄️  <b>Detail Datastore</b>\n`;
  message += `------------------------------------\n`;
  message += `<b>Informasi Umum</b>\n`;
  message += `• 🏷️ <b>Nama:</b> <code>${escapeHtml(details.name)}</code>\n`;
  message += `• ☁️ <b>Cluster:</b> ${details.cluster || 'N/A'}\n`;
  message += `• 🌍 <b>Environment:</b> ${details.environment || 'N/A'}\n`;
  message += `• ⚙️ <b>Tipe:</b> ${details.type || 'N/A'}\n`;
  
  message += `\n<b>Status Kapasitas</b>\n`;
  message += `• 📦 <b>Kapasitas:</b> ${details.capacityGb.toFixed(2)} GB <i>(${details.capacityTb.toFixed(2)} TB)</i>\n`;
  message += `• 📥 <b>Terpakai (Provisioned):</b> ${details.provisionedGb.toFixed(2)} GB <i>(${details.provisionedTb.toFixed(2)} TB)</i>\n`;
  message += `• 📤 <b>Tersedia:</b> ${details.freeGb.toFixed(2)} GB <i>(${details.freeTb.toFixed(2)} TB)</i>\n`;
  
  const usage = details.usagePercent;
  const barLength = 12;
  const filledLength = Math.round((usage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  
  message += `\n• 📊 <b>Alokasi Terpakai:</b> ${usage.toFixed(1)}% [ <code>${progressBar}</code> ]\n`;
  
  message += `\n<b>Beban Kerja (Workload)</b>\n`;
  message += `• 🖥️ <b>Jumlah VM:</b> ${details.vmCount} VM\n`;

  const keyboardRows = [];
  const FROM_PK_SUFFIX = originPk ? `${KONSTANTA.CALLBACK_CEKVM.ORIGIN_PK_MARKER}${originPk}` : '';
  
  if (details.vmCount > 0) {
    const actionButtons = [
        { text: `📄 Lihat Daftar VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_LIST_VMS_PREFIX}${details.name}${FROM_PK_SUFFIX}` },
        { text: `📥 Ekspor Daftar VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_EXPORT_PREFIX}${details.name}${FROM_PK_SUFFIX}` }
    ];
    keyboardRows.push(actionButtons);
  }

  if (originPk) {
    keyboardRows.push([{ text: `⬅️ Kembali ke Detail VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.BACK_TO_DETAIL_PREFIX}${originPk}` }]);
  }
  return { pesan: message, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * [v1.1-stabil] Handler /cekvm yang sudah di-harden.
 * Versi ini menangani error dari fungsi pencarian dan memberikan feedback yang jelas.
 */
function handleVmSearchInteraction(update, config, userData) {
  const isCallback = !!update.callback_query;
  const userEvent = isCallback ? update.callback_query : update.message;

  try {
    if (userData) {
      userData.userId = userEvent.from.id;
      userData.firstName = userEvent.from.first_name;
    }

    let searchTerm;
    let page = 1;

    if (isCallback) {
      const callbackData = userEvent.data;
      const parts = callbackData.split('_');
      page = parseInt(parts.pop(), 10) || 1;
      searchTerm = decodeURIComponent(parts.slice(2).join('_'));
      
      if (parts[1] === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
        try {
          const { headers, results } = searchVmOnSheet(searchTerm, config);
          exportResultsToSheet(headers, results, `Pencarian VM '${searchTerm}'`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
          answerCallbackQuery(userEvent.id, config, "Membuat file ekspor...");
        } catch (exportError) {
          kirimPesanTelegram(`⚠️ Gagal membuat file ekspor.\n<b>Detail:</b> ${escapeHtml(exportError.message)}`, config, 'HTML');
        }
        return;
      }
    } else {
      searchTerm = userEvent.text.split(' ').slice(1).join(' ');
      if (!searchTerm) {
        kirimPesanTelegram(`Gunakan format: <code>/cekvm [IP / Nama / PK]</code>`, config, 'HTML');
        return;
      }
    }

    const { headers, results } = searchVmOnSheet(searchTerm, config);

    if (results.length === 0) {
      kirimPesanTelegram(`❌ VM dengan kriteria "<b>${escapeHtml(searchTerm)}</b>" tidak ditemukan.`, config, 'HTML');
      return;
    }

    if (results.length === 1 && !isCallback) {
        const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
        let fullMessage = `✅ Ditemukan 1 hasil untuk "<b>${escapeHtml(searchTerm)}</b>":\n\n`;
        fullMessage += pesan;
        kirimPesanTelegram(fullMessage, config, 'HTML', keyboard);
        return;
    }

    const formatVmEntry = (row) => {
      const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
      const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);
      const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
      return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(normalizePrimaryKey(row[pkIndex]))}</code>)`;
    };
    
    const safeSearchTerm = encodeURIComponent(searchTerm);
    const { text, keyboard } = createPaginatedView({
      allItems: results,
      page: page,
      title: `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
      formatEntryCallback: formatVmEntry,
      navCallbackPrefix: `cekvm_${KONSTANTA.PAGINATION_ACTIONS.NAVIGATE}_${safeSearchTerm}`,
      exportCallbackData: `cekvm_${KONSTANTA.PAGINATION_ACTIONS.EXPORT}_${safeSearchTerm}`
    });
    
    if (isCallback) {
      if(userEvent.message.text !== text) {
        editMessageText(text, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config);
      }
    } else {
      kirimPesanTelegram(text, config, 'HTML', keyboard, userEvent.chat.id);
    }
  } catch (err) {
    console.error(`[handleVmSearchInteraction] Gagal total: ${err.message}\nStack: ${err.stack}`);
    kirimPesanTelegram(`🔴 Terjadi kesalahan saat memproses pencarian.\n\n<b>Penyebab:</b>\n<code>${escapeHtml(err.message)}</code>`, config, 'HTML');
  }
}

/**
 * [FINAL - PAGINATION LENGKAP] Mengendalikan interaksi untuk /cekhistory menggunakan fungsi generik 'createPaginatedView'.
 * [DIPERBAIKI] Fungsi ini tidak lagi memanggil getUserData, tetapi menerimanya dari pemanggil.
 */
function handleHistoryInteraction(update, config, userData) {
  const isCallback = !!update.callback_query;
  const userEvent = isCallback ? update.callback_query : update.message;
  if (userData) {
      userData.userId = userEvent.from.id;
      userData.firstName = userEvent.from.first_name;
  }
  let page = 1, chatId, messageId;
  if (isCallback) {
    chatId = userEvent.message.chat.id;
    messageId = userEvent.message.message_id;
    const callbackData = userEvent.data;
    const parts = callbackData.split('_');
    const action = parts[1];
    const P_ACTIONS = KONSTANTA.PAGINATION_ACTIONS;
    if (action === P_ACTIONS.NAVIGATE) {
      page = parseInt(parts[parts.length - 1], 10);
    } else if (action === P_ACTIONS.EXPORT) {
      const todayStartDate = new Date();
      todayStartDate.setHours(0, 0, 0, 0);
      const { headers, data } = getCombinedLogs(todayStartDate, config);
      exportResultsToSheet(headers, data, "Log Perubahan Hari Ini", config, userData, KONSTANTA.HEADER_LOG.ACTION);
      answerCallbackQuery(userEvent.id, config, "Membuat file ekspor...");
      return;
    }
  } else {
    chatId = userEvent.chat.id;
  }
  const todayStartDate = new Date();
  todayStartDate.setHours(0, 0, 0, 0);
  const { headers: logHeaders, data: logsToShow } = getCombinedLogs(todayStartDate, config);
  const title = "Log Perubahan Hari Ini";
  const formatLogEntry = (row) => {
      return formatHistoryEntry(row, logHeaders);
  };
  const { text, keyboard } = createPaginatedView({
      allItems: logsToShow,
      page: page,
      title: title,
      formatEntryCallback: formatLogEntry,
      navCallbackPrefix: `history_${KONSTANTA.PAGINATION_ACTIONS.NAVIGATE}`,
      exportCallbackData: `history_${KONSTANTA.PAGINATION_ACTIONS.EXPORT}`
  });
  if (isCallback) {
    if (userEvent.message.text !== text) {
      editMessageText(text, keyboard, chatId, messageId, config);
    }
    answerCallbackQuery(userEvent.id, config);
  } else {
    kirimPesanTelegram(text, config, 'HTML', keyboard, chatId);
  }
}

/**
 * [MODIFIKASI v2.5 - FIX] Mengekspor data ke Google Sheet dengan logika pengurutan
 * otomatis berdasarkan kolom "Kritikalitas", kini dengan pembersihan spasi (trim).
 */
function exportResultsToSheet(headers, dataRows, title, config, userData, highlightColumnName = null) {
  const folderId = config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR];
  if (!folderId) {
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor: Konfigurasi FOLDER_ID_HASIL_EKSPOR tidak ditemukan.`, config);
    return;
  }
  
  if (userData && !userData.email) {
    kirimPesanTelegram(`⚠️ Gagal membagikan file: Email untuk pengguna dengan ID ${userData.userId || 'tidak dikenal'} tidak ditemukan di sheet 'Hak Akses'.`, config);
    return;
  }

  try {
    const critHeaderName = KONSTANTA.HEADER_VM.KRITIKALITAS;
    const critIndex = headers.indexOf(critHeaderName);
    
    if (critIndex !== -1 && dataRows.length > 0) {
      console.log(`Kolom '${critHeaderName}' ditemukan. Melakukan pengurutan otomatis...`);
      const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
      
      dataRows.sort((a, b) => {
        // --- AWAL PERBAIKAN: Menambahkan .trim() ---
        const critA = String(a[critIndex] || '').toUpperCase().trim();
        const critB = String(b[critIndex] || '').toUpperCase().trim();
        // --- AKHIR PERBAIKAN ---
        
        const scoreA = skorKritikalitas[critA] || -1;
        const scoreB = skorKritikalitas[critB] || -1;
        
        return scoreB - scoreA;
      });
    }

    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const fileName = `Laporan - ${title.replace(/<|>/g, '')} - ${timestamp}`;
    const newSs = SpreadsheetApp.create(fileName);
    const sheet = newSs.getSheets()[0];
    sheet.setName(title.substring(0, 100));

    sheet.getRange("A1").setValue(title).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
    sheet.getRange(1, 1, 1, headers.length).merge();
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (dataRows.length > 0) {
      sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
    }
    
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() > 2 ? sheet.getLastRow() - 1 : 1, headers.length);
    if (highlightColumnName) {
      const highlightColIndex = headers.indexOf(highlightColumnName) + 1;
      if (highlightColIndex > 0) {
        sheet.getRange(2, highlightColIndex, dataRange.getNumRows()).setBackground("#FFF2CC");
      }
    }
    dataRange.createFilter();
    headers.forEach((_, i) => sheet.autoResizeColumn(i + 1));
    
    const file = DriveApp.getFileById(newSs.getId());
    const folder = DriveApp.getFolderById(folderId);
    file.moveTo(folder);
    const fileUrl = file.getUrl();
    
    let pesanFile;

    if (userData && userData.email) {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      file.addViewer(userData.email);
      console.log(`Hasil ekspor berhasil dibuat dan dibagikan secara pribadi ke ${userData.email}: ${fileUrl}`);
      const userMention = `<a href="tg://user?id=${userData.userId}">${escapeHtml(userData.firstName || 'Pengguna')}</a>`;
      pesanFile = `${userMention}, file ekspor Anda untuk "<b>${escapeHtml(title)}</b>" sudah siap.\n\nFile ini telah dibagikan secara pribadi ke email Anda.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    
    } else {
      console.log("Proses sistem terdeteksi. Membagikan file ke siapa saja dengan tautan.");
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      console.log(`Hasil ekspor sistem berhasil dibuat dan dibagikan secara publik: ${fileUrl}`);
      pesanFile = `📄 Laporan sistem "<b>${escapeHtml(title)}</b>" telah dibuat.\n\nSilakan akses file melalui tautan di bawah ini.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    }

    kirimPesanTelegram(pesanFile, config, 'HTML');

  } catch (e) {
    console.error(`Gagal mengekspor hasil ke sheet: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor. Error: ${e.message}`, config);
  }
}

/**
 * [REVISI UX KONSISTEN] Mencari riwayat lengkap sebuah VM dan MENGEMBALIKAN hasilnya dalam bentuk objek.
 * Fungsi ini tidak lagi mengirim pesan langsung ke Telegram, memungkinkan kontrol UX terpusat.
 * @param {string} pk - Primary Key dari VM yang akan dicari.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object} Objek yang berisi hasil pencarian dengan format: 
 * { success: boolean, message: string, data: Array|null, headers: Array|null }
 */
function getVmHistory(pk, config) {
  // Validasi input awal
  if (!pk) {
    return { success: false, message: "❌ Terjadi kesalahan: Primary Key untuk melihat riwayat tidak valid." };
  }

  try {
    const pkToDisplay = normalizePrimaryKey(pk);
    const allTimeStartDate = new Date('2020-01-01'); // Tanggal lampau untuk memastikan semua arsip terbaca
    const { headers: logHeaders, data: allLogs } = getCombinedLogs(allTimeStartDate, config);

    // Validasi data log
    if (logHeaders.length === 0) {
      return { success: false, message: "❌ Gagal memproses: Tidak dapat menemukan header di sheet 'Log Perubahan'." };
    }

    const pkIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.PK);
    if (pkIndex === -1) {
      return { success: false, message: `❌ Gagal memproses: Kolom krusial '${KONSTANTA.HEADER_VM.PK}' tidak ditemukan di dalam log.` };
    }

    // Proses pencarian
    const pkTrimmed = normalizePrimaryKey(pk.trim()).toLowerCase();
    const historyEntries = allLogs.filter(row => 
      row[pkIndex] && normalizePrimaryKey(String(row[pkIndex])).toLowerCase() === pkTrimmed
    );

    // Jika tidak ada hasil
    if (historyEntries.length === 0) {
      return { success: true, message: `ℹ️ Tidak ada riwayat perubahan ditemukan untuk Primary Key <code>${escapeHtml(pkToDisplay)}</code>.`, data: null, headers: null };
    }

    // Urutkan hasil dan siapkan pesan
    const timestampIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP);
    historyEntries.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));
    const vmNameIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const currentVmName = historyEntries[0][vmNameIndex] || pk;
    
    let message = `<b>📜 Riwayat Lengkap untuk VM</b>\n`;
    message += `<b>${KONSTANTA.HEADER_VM.VM_NAME}:</b> ${escapeHtml(currentVmName)}\n`;
    message += `<b>${KONSTANTA.HEADER_VM.PK}:</b> <code>${escapeHtml(pkToDisplay)}</code>\n`;
    message += `<i>Total ditemukan ${historyEntries.length} entri riwayat.</i>`;
    message += KONSTANTA.UI_STRINGS.SEPARATOR;
    message += `\n`;

    // Logika untuk menampilkan ringkasan atau laporan lengkap
    if (historyEntries.length > 8) {
      // Jika hasil terlalu banyak, tampilkan ringkasan dan siapkan data untuk ekspor
      message += `Menampilkan 5 dari ${historyEntries.length} perubahan terakhir:\n\n`;
      historyEntries.slice(0, 5).forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });
      message += KONSTANTA.UI_STRINGS.SEPARATOR;
      message += `<i>Riwayat terlalu panjang. Laporan lengkap sedang dibuat dalam file Google Sheet...</i>`;
      return { success: true, message: message, data: historyEntries, headers: logHeaders };
    } else {
      // Jika hasil cukup singkat, tampilkan semuanya
      historyEntries.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });
      return { success: true, message: message, data: null, headers: null };
    }

  } catch (e) {
    console.error(`Gagal total saat menjalankan getVmHistory: ${e.message}\nStack: ${e.stack}`);
    return { success: false, message: `❌ Terjadi kesalahan teknis saat mengambil riwayat.\n<b>Error:</b> ${e.message}`};
  }
}

/**
 * [HELPER/PEMBANTU]
 * Memformat satu baris entri log menjadi teks yang rapi.
 * Pastikan fungsi ini ada di ManajemenData.js atau Utilitas.js
 */
function formatHistoryEntry(entry, headers) {
  let formattedText = "";
  const timestamp = new Date(entry[headers.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP)]).toLocaleString('id-ID', { 
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit' 
  });
  const action = entry[headers.indexOf(KONSTANTA.HEADER_LOG.ACTION)];
  const oldValue = entry[headers.indexOf(KONSTANTA.HEADER_LOG.OLD_VAL)];
  const newValue = entry[headers.indexOf(KONSTANTA.HEADER_LOG.NEW_VAL)];
  const detail = entry[headers.indexOf(KONSTANTA.HEADER_LOG.DETAIL)];

  formattedText += `<b>🗓️ ${escapeHtml(timestamp)}</b>\n`;
  formattedText += `<b>Aksi:</b> ${escapeHtml(action)}\n`;
  if (action === 'MODIFIKASI') {
    const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
    formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
    formattedText += `   - <code>${escapeHtml(oldValue || 'Kosong')}</code> ➔ <code>${escapeHtml(newValue || 'Kosong')}</code>\n\n`;
  } else {
    // Untuk aksi lain (PENAMBAHAN/PENGHAPUSAN), cukup tampilkan detailnya
    formattedText += `<b>Detail:</b> ${escapeHtml(detail)}\n\n`;
  }
  return formattedText;
}

/**
 * [FUNGSI BARU v3.1] Menghitung skor kelayakan migrasi untuk sebuah VM
 * berdasarkan kombinasi status, nama, kritikalitas, dan ukuran.
 * Semakin tinggi skor, semakin tinggi prioritas untuk dimigrasi.
 * @param {object} vm - Objek VM yang berisi { name, state, criticality, provisionedGb }.
 * @param {object} config - Objek konfigurasi yang aktif.
 * @returns {number} Skor kelayakan migrasi.
 */
function calculateMigrationScore(vm, config) {
  let score = 0;
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};

  // 1. Bobot Status (Paling Penting)
  const isOff = String(vm.state || '').toLowerCase().includes('off');
  if (isOff) {
    score += 1000000; // Bobot sangat besar untuk VM yang mati
  }

  // 2. Bobot Nama "unused"
  const isUnused = String(vm.name || '').toLowerCase().includes('unused');
  if (isUnused) {
    score += 500000; // Bobot besar untuk VM yang tidak terpakai
  }

  // 3. Bobot Kritikalitas (Terbalik)
  const criticalityScore = skorKritikalitas[String(vm.criticality || '').toUpperCase().trim()] || 0;
  // Bobot tertinggi untuk yang tidak terdefinisi (skor 0), terendah untuk CRITICAL (skor 5)
  score += (10 - criticalityScore) * 1000;

  // 4. Bobot Ukuran (Terbalik)
  // Memberi skor lebih tinggi pada VM yang lebih kecil.
  // Angka 10000 digunakan sebagai basis maksimum agar perhitungannya signifikan.
  const size = vm.provisionedGb || 0;
  if (size > 0) {
    score += (10000 - size);
  }

  return score;
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
 * [LOGIKA FINAL & BENAR] Mencari datastore tujuan terbaik dengan memastikan
 * aturan dari 'Logika Migrasi' diterapkan sebagai prioritas utama.
 * @returns {object|null} Objek datastore tujuan jika berhasil, atau objek error dengan alasan jika gagal.
 * [MODIFIKASI v2.1] Memperbaiki logika pengecualian datastore agar case-insensitive.
 */
function findBestDestination(sourceDs, requiredGb, availableDestinations, migrationConfig, config) {
    const sourceType = sourceDs.type;
    // Mengubah daftar kata kunci menjadi huruf besar sekali saja di awal
    const excludedKeywords = (config[KONSTANTA.KUNCI_KONFIG.DS_KECUALI] || []).map(k => k.toUpperCase());

    // --- Filter Tahap 1: Syarat Mutlak ---
    let candidates = availableDestinations.filter(destDs => {
        // Mengubah nama datastore menjadi huruf besar saat pengecekan
        const destDsNameUpper = destDs.name.toUpperCase();
        return destDs.cluster === sourceDs.cluster && 
               destDs.environment === sourceDs.environment &&
               destDs.name !== sourceDs.name &&
               destDs.freeSpace > requiredGb &&
               !excludedKeywords.some(exc => destDsNameUpper.includes(exc));
    });

    if (candidates.length === 0) {
        const initialCandidates = availableDestinations.filter(d => d.name !== sourceDs.name);
        if(initialCandidates.filter(d => d.cluster !== sourceDs.cluster).length === initialCandidates.length) return {error: true, reason: `Tidak ada kandidat di Cluster ${sourceDs.cluster}.`};
        if(initialCandidates.filter(d => d.environment !== sourceDs.environment).length === initialCandidates.length) return {error: true, reason: `Tidak ada kandidat di Environment ${sourceDs.environment}.`};
        if(initialCandidates.filter(d => d.freeSpace <= requiredGb).length === initialCandidates.length) return {error: true, reason: `Tidak ada kandidat dengan ruang kosong yang cukup (> ${requiredGb.toFixed(1)} GB).`};
        return { error: true, reason: `Semua kandidat datastore termasuk dalam daftar pengecualian.` };
    }
    
    // --- Filter Tahap 2: Aturan Prioritas dari 'Logika Migrasi' ---
    const sourceRule = migrationConfig.get(sourceType) || Array.from(migrationConfig.values()).find(rule => rule.alias === sourceType);
    
    if (sourceType && sourceRule && sourceRule.destinations.length > 0) {
        const priorityTypes = sourceRule.destinations;
        
        for (const priorityType of priorityTypes) {
            const found = candidates.find(d => d.type === priorityType);
            if (found) {
                return candidates
                    .filter(c => c.type === priorityType)
                    .sort((a,b) => b.freeSpace - a.freeSpace)[0];
            }
        }
        return { error: true, reason: `Tidak ditemukan datastore tujuan yang memenuhi syarat migrasi.` };
    }

    // --- Tahap 3: Logika Fallback (Jika TIDAK ADA Aturan Migrasi) ---
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

  datastoresInCluster.forEach(ds => {
    totalCapacity += ds.capacity;
    totalProvisioned += ds.provisioned;
  });

  const averageUtilization = (totalCapacity > 0) ? (totalProvisioned / totalCapacity * 100) : 0;

  return {
    totalCapacity: totalCapacity,
    totalProvisioned: totalProvisioned,
    averageUtilization: averageUtilization
  };
}

/**
 * [MODIFIKASI v3.2 - FINAL & HOLISTIC] Mengimplementasikan "Algoritma Rekomendasi Cerdas Holistik".
 * Fungsi ini secara terintegrasi mencari paket VM dan datastore tujuan terbaik
 * untuk menghasilkan satu rencana migrasi yang paling efisien.
 */
function jalankanRekomendasiMigrasi() {
    const config = bacaKonfigurasi();
    console.log("Memulai analisis penyeimbangan cluster...");
    try {
        // --- Tahap 1: Pengumpulan Data ---
        const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
        if (!dsSheet) throw new Error(`Sheet datastore '${config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]}' tidak ditemukan.`);
        
        const dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
        const dsNameIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
        const dsCapGbIndex = dsHeaders.indexOf(KONSTANTA.HEADER_DS.CAPACITY_GB);
        const dsProvGbIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_PROV_GB_HEADER]);

        if ([dsNameIndex, dsCapGbIndex, dsProvGbIndex].includes(-1)) {
            throw new Error("Header penting (Name, Capacity, Provisioned) tidak ditemukan di sheet Datastore.");
        }

        const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
        const migrationConfig = getMigrationConfig(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_LOGIKA_MIGRASI]));
        const allDatastores = dsData.map(row => {
            const dsName = row[dsNameIndex];
            const capacity = parseLocaleNumber(row[dsCapGbIndex]);
            const provisioned = parseLocaleNumber(row[dsProvGbIndex]);
            const dsInfo = getDsInfo(dsName, migrationConfig);
            return {
                name: dsName, capacity: capacity, provisioned: provisioned, freeSpace: capacity - provisioned,
                utilization: capacity > 0 ? (provisioned / capacity * 100) : 0, cluster: dsInfo.cluster,
                type: dsInfo.type, environment: getEnvironmentFromDsName(dsName, config[KONSTANTA.KUNCI_KONFIG.MAP_ENV])
            };
        });

        const overProvisionedDsList = allDatastores.filter(ds => ds.provisioned > ds.capacity);
        if (overProvisionedDsList.length === 0) {
            return "✅ Semua datastore dalam kondisi provisioning yang aman (1:1).";
        }

        const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
        if (!vmSheet) throw new Error(`Sheet VM '${config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]}' tidak ditemukan.`);
        const vmHeaders = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
        const allVmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();
        const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};

        let finalMessage = `⚖️ <b>Analisis & Rekomendasi Migrasi Datastore</b>\n`;
        finalMessage += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID')}</i>`;

        // --- AWAL PEROMBAKAN LOGIKA ---
        overProvisionedDsList.forEach(dsInfo => {
            finalMessage += KONSTANTA.UI_STRINGS.SEPARATOR;
            const migrationTarget = dsInfo.provisioned - dsInfo.capacity;
            finalMessage += `❗️ <b>Datastore Teridentifikasi Over-Provisioned:</b> <code>${dsInfo.name}</code>\n`;
            finalMessage += `• <b>Status:</b> Provisioned ${dsInfo.provisioned.toFixed(2)} / ${dsInfo.capacity.toFixed(2)} GB (<b>${dsInfo.utilization.toFixed(1)}%</b>)\n`;
            
            const diagnosis = diagnoseOverprovisioningCause(dsInfo.name, config);
            if (diagnosis) {
                finalMessage += `• <b>Indikasi Penyebab:</b> ${diagnosis}\n`;
            }
            finalMessage += `• <b>Target Migrasi:</b> ${migrationTarget.toFixed(2)} GB\n`;

            let datastoresInCluster = JSON.parse(JSON.stringify(allDatastores.filter(ds => ds.cluster === dsInfo.cluster)));

            let candidatePool = allVmData
                .filter(row => row[vmHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER])] === dsInfo.name)
                .map(row => ({
                    name: row[vmHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME)],
                    provisionedGb: parseLocaleNumber(row[vmHeaders.indexOf(KONSTANTA.HEADER_VM.PROV_GB)]),
                    state: row[vmHeaders.indexOf(KONSTANTA.HEADER_VM.STATE)],
                    criticality: row[vmHeaders.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS)],
                }));

            const migrationPlan = new Map();
            let totalMigrated = 0;
            const MAX_MIGRATION_LOOPS = 50;
            let loopCount = 0;
            
            while (totalMigrated < migrationTarget && candidatePool.length > 0 && loopCount < MAX_MIGRATION_LOOPS) {
                loopCount++;
                let bestMove = {
                    vmIndex: -1,
                    destDsName: null,
                    efficiencyScore: -Infinity
                };

                for (let i = 0; i < candidatePool.length; i++) {
                    const vm = candidatePool[i];
                    const sourceDs = datastoresInCluster.find(ds => ds.name === dsInfo.name);
                    const recipients = datastoresInCluster.filter(ds => ds.name !== sourceDs.name && vm.provisionedGb <= ds.freeSpace);

                    if (recipients.length === 0) continue;
                    
                    for (const destDs of recipients) {
                        const isValidMove = findBestDestination(sourceDs, vm.provisionedGb, [destDs], migrationConfig, config);
                        if (!isValidMove || isValidMove.error) continue;

                        let benefitScore = 1;
                        if (String(vm.state || '').toLowerCase().includes('off')) benefitScore += 10000;
                        if (String(vm.name || '').toLowerCase().includes('unused')) benefitScore += 5000;
                        const critScore = skorKritikalitas[String(vm.criticality || '').toUpperCase().trim()] || 0;
                        benefitScore += (10 - critScore) * 100;

                        const sizeDifference = Math.abs(vm.provisionedGb - (migrationTarget - totalMigrated));
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
                    
                    const destDs = datastoresInCluster.find(ds => ds.name === bestMove.destDsName);
                    destDs.freeSpace -= vmToMove.provisionedGb;
                    
                    candidatePool.splice(bestMove.vmIndex, 1);
                } else {
                    break;
                }
            }

            finalMessage += `\n✅ <b>Rencana Tindak Lanjut:</b>\n`;
            if (migrationPlan.size > 0) {
                migrationPlan.forEach((vms, destDsName) => {
                    const totalSizeToDest = vms.reduce((sum, vm) => sum + vm.provisionedGb, 0);
                    finalMessage += `\n➡️ Migrasi ke <code>${destDsName}</code> (~${totalSizeToDest.toFixed(2)} GB):\n`;
                    vms.forEach(vm => {
                        finalMessage += ` • <code>${escapeHtml(vm.name)}</code> (${vm.provisionedGb.toFixed(2)} GB) | ${escapeHtml(vm.criticality)} | ${escapeHtml(vm.state)}\n`;
                    });
                });
            } else {
                finalMessage += "<i>Tidak ditemukan rencana migrasi yang efisien.</i>\n";
            }
        });
        
        return finalMessage;
    } catch (e) {
      console.error(`Gagal menjalankan analisis migrasi: ${e.message}\nStack: ${e.stack}`);
      throw new Error(`Gagal Menjalankan Analisis Migrasi. Penyebab: ${e.message}`);
    }
}

/**
 * Fungsi spesialis untuk menangani semua permintaan ekspor kategori Uptime.
 */
function processUptimeExport(exportType, config) {
    let categoryName, minDays, maxDays, isInvalidCheck = false, sortAscending = true;
    switch (exportType) {
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_1: minDays = 0; maxDays = 365; categoryName = "Uptime < 1 Tahun"; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_2: minDays = 366; maxDays = 730; categoryName = "Uptime 1-2 Tahun"; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_3: minDays = 731; maxDays = 1095; categoryName = "Uptime 2-3 Tahun"; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_4: minDays = 1096; maxDays = Infinity; categoryName = "Uptime > 3 Tahun"; sortAscending = false; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_INVALID: isInvalidCheck = true; categoryName = "Data Uptime Tidak Valid"; break;
        default: return null;
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (!sheet) throw new Error("Sheet Data Utama tidak ditemukan.");
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const uptimeIndex = headers.indexOf(KONSTANTA.HEADER_VM.UPTIME);
    if (uptimeIndex === -1) throw new Error(`Kolom '${KONSTANTA.HEADER_VM.UPTIME}' tidak ditemukan.`);

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    let filteredData = allData.filter(row => {
        const uptimeValue = row[uptimeIndex];
        const uptimeDays = parseInt(uptimeValue, 10);
        if (isInvalidCheck) return uptimeValue === '' || uptimeValue === '-' || isNaN(uptimeDays);
        else return !isNaN(uptimeDays) && uptimeDays >= minDays && uptimeDays <= maxDays;
    });

    if (filteredData.length > 0 && !isInvalidCheck) {
        filteredData.sort((a, b) => {
            const uptimeA = parseInt(a[uptimeIndex], 10) || 0;
            const uptimeB = parseInt(b[uptimeIndex], 10) || 0;
            return sortAscending ? uptimeA - uptimeB : uptimeB - uptimeA;
        });
    }

    const reportDate = new Date().toLocaleDateString('id-ID');
    const dynamicTitle = `Laporan VM - ${categoryName} per ${reportDate}`;
    
    return { headers: headers, data: filteredData, title: dynamicTitle };
}

/**
 * [FUNGSI HELPER BARU]
 * Mengumpulkan entri log dari sheet aktif DAN semua file arsip JSON berdasarkan rentang tanggal.
 * @param {Date} startDate - Tanggal mulai untuk filter log.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {{headers: Array<string>, data: Array<Array<any>>}} Objek berisi header dan data log gabungan.
 */
function getCombinedLogs(startDate, config) {
  let combinedLogEntries = [];
  let logHeaders = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  // --- 1. Ambil Log dari Sheet Aktif ---
  if (sheetLog && sheetLog.getLastRow() > 1) {
    const allLogData = sheetLog.getDataRange().getValues();
    logHeaders = allLogData.shift(); // Ambil header
    
    const activeLogs = allLogData.filter(row => {
      // Pastikan baris memiliki data dan kolom timestamp valid
      return row.length > 0 && row[0] && new Date(row[0]) >= startDate;
    });
    combinedLogEntries.push(...activeLogs);
  } else if (sheetLog) {
    // Jika sheet ada tapi kosong, tetap ambil headernya
    logHeaders = sheetLog.getRange(1, 1, 1, sheetLog.getLastColumn()).getValues()[0];
  }

  // --- 2. Ambil Log dari Arsip JSON ---
  const FOLDER_ARSIP_ID = config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP_LOG];
  if (FOLDER_ARSIP_ID && logHeaders.length > 0) {
    try {
      const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);
      const arsipFiles = folderArsip.getFilesByType(MimeType.PLAIN_TEXT); // Lebih spesifik

      while (arsipFiles.hasNext()) {
        const file = arsipFiles.next();
        if (file.getName().startsWith('Arsip Log -') && file.getName().endsWith('.json')) {
          console.log(`Membaca file arsip untuk ekspor: ${file.getName()}`);
          const jsonContent = file.getBlob().getDataAsString();
          const archivedLogs = JSON.parse(jsonContent);

          // Filter log dari arsip berdasarkan tanggal
          const relevantLogs = archivedLogs.filter(logObject => 
            logObject[KONSTANTA.HEADER_LOG.TIMESTAMP] && new Date(logObject[KONSTANTA.HEADER_LOG.TIMESTAMP]) >= startDate
          );

          // Ubah kembali dari objek ke array agar formatnya sama
          const relevantLogsAsArray = relevantLogs.map(logObject => logHeaders.map(header => logObject[header] || ''));
          combinedLogEntries.push(...relevantLogsAsArray);
        }
      }
    } catch(e) {
      console.error(`Gagal membaca file arsip log: ${e.message}`);
      // Proses tetap lanjut dengan data yang sudah ada
    }
  }

  // --- 3. Urutkan semua hasil dari yang terbaru ke terlama ---
  if (combinedLogEntries.length > 0) {
    const timestampIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP);
    if (timestampIndex !== -1) {
      combinedLogEntries.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));
    }
  }

  return { headers: logHeaders, data: combinedLogEntries };
}

/**
 * [FUNGSI PUSAT] Mengendalikan semua permintaan ekspor dari menu interaktif.
 * Versi ini telah diperbarui untuk mengambil data dari log aktif dan arsip.
 */
function handleExportRequest(exportType, config, userData) {
  try {
    kirimPesanTelegram(`⚙️ Permintaan ekspor diterima. Mengumpulkan data dari log aktif dan arsip...`, config, 'HTML');

    let headers, data, title, highlightColumn = null;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Menggunakan switch-case untuk mencocokkan nilai callback yang pasti
    switch (exportType) {
      // --- Kasus untuk Log ---
      case KONSTANTA.CALLBACK.EXPORT_LOG_TODAY:
      case KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS:
      case KONSTANTA.CALLBACK.EXPORT_LOG_30_DAYS: {
        const now = new Date();
        let startDate = new Date();
        
        if (exportType === KONSTANTA.CALLBACK.EXPORT_LOG_TODAY) {
            startDate.setHours(0, 0, 0, 0);
            title = "Log Perubahan Hari Ini (Termasuk Arsip)";
        } else if (exportType === KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS) {
            startDate.setDate(now.getDate() - 7);
            title = "Log Perubahan 7 Hari Terakhir (Termasuk Arsip)";
        } else { // 30 hari
            startDate.setDate(now.getDate() - 30);
            title = "Log Perubahan 30 Hari Terakhir (Termasuk Arsip)";
        }

        // Panggil fungsi baru untuk mendapatkan data gabungan
        const combinedLogResult = getCombinedLogs(startDate, config);
        headers = combinedLogResult.headers;
        data = combinedLogResult.data;
        highlightColumn = KONSTANTA.HEADER_LOG.ACTION;
        
        break;
      }
        
      // --- Kasus untuk VM ---
      case KONSTANTA.CALLBACK.EXPORT_ALL_VMS:
      case KONSTANTA.CALLBACK.EXPORT_VC01_VMS:
      case KONSTANTA.CALLBACK.EXPORT_VC02_VMS: {
        const vmSheet = ss.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
        if (!vmSheet) throw new Error(`Sheet data utama '${config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]}' tidak ditemukan.`);

        headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
        const allVmData = vmSheet.getLastRow() > 1 ? vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues() : [];
        
        if (exportType === KONSTANTA.CALLBACK.EXPORT_ALL_VMS) {
            data = allVmData;
            title = "Semua Data VM";
        } else {
            const vcenterIndex = headers.indexOf(KONSTANTA.HEADER_VM.VCENTER);
            if (vcenterIndex === -1) throw new Error(`Kolom '${KONSTANTA.HEADER_VM.VCENTER}' tidak ditemukan.`);
            const vcenter = exportType.split('_').pop().toUpperCase();
            data = allVmData.filter(row => String(row[vcenterIndex]).toUpperCase() === vcenter);
            title = `Data VM di ${vcenter}`;
        }
        highlightColumn = KONSTANTA.HEADER_VM.VCENTER;
        break;
      }

      // --- Kasus untuk Uptime ---
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_1:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_2:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_3:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_4:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_INVALID: {
        const result = processUptimeExport(exportType, config);
        if (result) {
            headers = result.headers;
            data = result.data;
            title = result.title;
            highlightColumn = KONSTANTA.HEADER_VM.UPTIME;
        }
        break;
      }
    }

    // --- Logika Pengiriman Hasil ---
    if (data && headers && headers.length > 0) {
        if (data.length > 0) {
            // Fungsi exportResultsToSheet akan menangani pembuatan file dan pengiriman notifikasi
            exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
        } else {
            kirimPesanTelegram(`ℹ️ Tidak ada data yang dapat diekspor untuk kategori "<b>${title}</b>".`, config, 'HTML');
        }
    } else if (exportType.includes('LOG')) {
        // Kondisi khusus jika header log tidak ditemukan
        console.warn(`Tidak ada header yang dihasilkan untuk tipe ekspor: ${exportType}`);
        kirimPesanTelegram(`⚠️ Gagal memproses permintaan: Tidak dapat menemukan header log. Pastikan sheet 'Log Perubahan' memiliki header.`, config);
    } else {
        console.warn(`Tidak ada data atau header yang dihasilkan untuk tipe ekspor: ${exportType}`);
    }

  } catch (e) {
      console.error(`Gagal menangani permintaan ekspor: ${e.message}\nStack: ${e.stack}`);
      kirimPesanTelegram(`⚠️ Terjadi kesalahan saat memproses permintaan ekspor Anda.\n<code>${escapeHtml(e.message)}</code>`, config, 'HTML');
  }
}

/**
 * FUNGSI UTAMA PENGARSIPAN
 * Tugasnya adalah memindahkan log lama ke file JSON dan membersihkan sheet.
 * Fungsi ini dipanggil oleh fungsi cekDanArsipkanLogJikaPenuh().
 */
function jalankanPengarsipanLogKeJson(config) { // [DIUBAH] Tambahkan parameter
  // [DIUBAH] activeConfig sekarang diambil dari parameter
  const activeConfig = config || bacaKonfigurasi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    console.log("Tidak ada log untuk diarsipkan.");
    // Kirim pesan juga ke Telegram jika ada config (dipanggil manual)
    if (config) kirimPesanTelegram("ℹ️ Tidak ada data log yang bisa diarsipkan saat ini.", activeConfig);
    return;
  }

  const FOLDER_ARSIP_ID = activeConfig[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP_LOG];
  if (!FOLDER_ARSIP_ID) {
    throw new Error("Folder ID untuk arsip log (FOLDER_ID_ARSIP_LOG) belum diatur di Konfigurasi.");
  }
  const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);

  const dataRange = sheetLog.getDataRange();
  const allLogData = dataRange.getValues();
  const headers = allLogData.shift(); // Ambil header
  
  // Ubah data array menjadi format JSON
  const jsonData = allLogData.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  try {
    // [PERBAIKAN] Ganti "GMT+7" dengan zona waktu dari Spreadsheet
    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const namaFileArsip = `Arsip Log - ${timestamp}.json`;
    
    // Stringify dengan spasi agar mudah dibaca manusia
    const jsonString = JSON.stringify(jsonData, null, 2); 
    
    // Simpan file JSON ke Google Drive
    folderArsip.createFile(namaFileArsip, jsonString, MimeType.PLAIN_TEXT);
    console.log(`${allLogData.length} baris log telah ditulis ke file JSON: ${namaFileArsip}`);

    // Bersihkan sheet log utama, sisakan hanya header
    sheetLog.getRange(2, 1, sheetLog.getLastRow(), sheetLog.getLastColumn()).clearContent();

    // [PERBAIKAN] Pesan dibuat lebih generik agar cocok untuk manual & otomatis
    const pesanSukses = `✅ Pengarsipan log berhasil.\n\nSebanyak ${allLogData.length} baris log telah dipindahkan ke file "${namaFileArsip}".`;
    kirimPesanTelegram(pesanSukses, activeConfig);
    console.log(pesanSukses);

    // Bersihkan sheet log utama, sisakan hanya header
    sheetLog.getRange(2, 1, sheetLog.getLastRow(), sheetLog.getLastColumn()).clearContent();

  } catch (e) {
    const pesanGagal = `❌ Gagal melakukan pengarsipan log. Error: ${e.message}\nStack: ${e.stack}`;
    kirimPesanTelegram(pesanGagal, activeConfig);
    console.error(pesanGagal);
  }
}

/**
 * FUNGSI PENGECЕK
 * Fungsi ini akan dijalankan oleh pemicu harian atau perintah manual.
 * Tugasnya adalah memeriksa jumlah baris dan memanggil fungsi pengarsipan jika perlu.
 * [PERBAIKAN] Menambahkan parameter 'config' dan logika feedback ke Telegram.
 */
function cekDanArsipkanLogJikaPenuh(config = null) { // [DIUBAH] Tambahkan parameter
  const BATAS_BARIS = KONSTANTA.LIMIT.LOG_ARCHIVE_THRESHOLD;

  // Jika dipanggil dari trigger, config null. Jika dari perintah, config ada.
  const activeConfig = config || bacaKonfigurasi();

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

    if (!sheetLog) {
      const errorMsg = "Sheet 'Log Perubahan' tidak ditemukan. Pengecekan dibatalkan.";
      console.error(errorMsg);
      if (config) kirimPesanTelegram(`❌ Gagal: ${errorMsg}`, activeConfig);
      return;
    }

    const jumlahBaris = sheetLog.getLastRow();
    console.log(`Pengecekan jumlah baris log: ${jumlahBaris} baris.`);

    if (jumlahBaris > BATAS_BARIS) {
      console.log(`Jumlah baris (${jumlahBaris}) melebihi batas (${BATAS_BARIS}). Memulai proses pengarsipan...`);
      // Teruskan config ke fungsi pengarsipan
      jalankanPengarsipanLogKeJson(activeConfig);
    } else {
      const feedbackMsg = `ℹ️ Pengarsipan belum diperlukan. Jumlah baris log saat ini adalah ${jumlahBaris}, masih di bawah ambang batas ${BATAS_BARIS} baris.`;
      console.log(feedbackMsg);
      // [LOGIKA BARU] Kirim feedback ke Telegram jika dipanggil manual
      if (config) {
        kirimPesanTelegram(feedbackMsg, activeConfig);
      }
    }
  } catch(e) {
      const errorMsg = `❌ Gagal saat memeriksa log untuk pengarsipan: ${e.message}`;
      console.error(errorMsg);
      if (config) kirimPesanTelegram(errorMsg, activeConfig, 'HTML');
  }
}

/**
 * [MODIFIKASI v4.0] Menambahkan logika toleransi saat memeriksa perubahan
 * pada kolom 'Provisioned Space (GB)'.
 */
function processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, entityName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  
  const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  if (!sheetLog) throw new Error(`Sheet Log Perubahan tidak ditemukan.`);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(primaryKeyHeader);
  if (pkIndex === -1) throw new Error(`Kolom Primary Key "${primaryKeyHeader}" tidak ditemukan di sheet "${sheetName}".`);

  const folderArsip = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP]);
  const files = folderArsip.getFilesByName(archiveFileName);
  let mapDataKemarin = new Map();
  let fileArsip;
  if (files.hasNext()) {
    fileArsip = files.next();
    try {
      const archivedData = JSON.parse(fileArsip.getBlob().getDataAsString());
      const normalizedArchivedData = archivedData.map(([pk, data]) => [normalizePrimaryKey(pk), data]);
      mapDataKemarin = new Map(normalizedArchivedData);
    } catch (e) {
      console.warn(`Gagal parse arsip "${archiveFileName}": ${e.message}`);
    }
  }

  const dataHariIni = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const mapDataHariIni = new Map();
  
  columnsToTrack.forEach(kolom => {
    kolom.index = headers.indexOf(kolom.nama);
  });
  
  const buatObjekData = (row) => {
    const data = {};
    columnsToTrack.forEach(kolom => {
      if (kolom.index !== -1) data[kolom.nama] = row[kolom.index];
    });
    return data;
  };

  dataHariIni.forEach(row => {
    const pk = row[pkIndex];
    if (pk) {
      const pkNormalized = normalizePrimaryKey(pk);
      const rowData = buatObjekData(row);
      rowData[primaryKeyHeader] = pk; 
      mapDataHariIni.set(pkNormalized, { data: rowData, hash: computeVmHash(rowData) });
    }
  });

  let logEntriesToAdd = [];
  const timestamp = new Date();
  const nameHeaderForLog = entityName === 'VM' ? KONSTANTA.HEADER_VM.VM_NAME : primaryKeyHeader;
  
  // Ambil nilai toleransi dari konfigurasi
  const tolerance = parseFloat(config[KONSTANTA.KUNCI_KONFIG.LOG_TOLERANCE_PROV_GB]) || 0;
  const provisionedGbHeader = KONSTANTA.HEADER_VM.PROV_GB;

  for (const [id, dataBaru] of mapDataHariIni.entries()) {
    const dataLama = mapDataKemarin.get(id);
    const entityDisplayName = dataBaru.data[nameHeaderForLog] || id;
    const pkRawForLog = dataBaru.data[primaryKeyHeader];

    if (!dataLama) {
      const detail = `${entityName} baru dibuat/ditemukan.`;
      const logEntry = [timestamp, 'PENAMBAHAN', pkRawForLog, entityDisplayName, sheetName, '', '', detail, entityName];
      logEntriesToAdd.push(logEntry);
    } else if (dataBaru.hash !== dataLama.hash) {
      if (dataLama && dataLama.data) {
        for (const key in dataBaru.data) {
          if(key === primaryKeyHeader) continue; 
          
          const oldValue = dataLama.data[key] || '';
          const newValue = dataBaru.data[key] || '';
          let hasChanged = false;

          // --- AWAL MODIFIKASI: Logika Toleransi ---
          if (key === provisionedGbHeader && entityName === KONSTANTA.NAMA_ENTITAS.VM) {
            const oldNum = parseLocaleNumber(oldValue);
            const newNum = parseLocaleNumber(newValue);
            // Hanya anggap berubah jika selisihnya lebih besar dari toleransi
            if (Math.abs(newNum - oldNum) > tolerance) {
              hasChanged = true;
            }
          } else {
            // Gunakan perbandingan string biasa untuk kolom lain
            if (String(newValue) !== String(oldValue)) {
              hasChanged = true;
            }
          }
          // --- AKHIR MODIFIKASI ---

          if (hasChanged) {
            const detail = `Kolom '${key}' diubah`;
            const logEntry = [timestamp, 'MODIFIKASI', pkRawForLog, entityDisplayName, sheetName, oldValue, newValue, detail, entityName];
            logEntriesToAdd.push(logEntry);
          }
        }
      }
    }
    mapDataKemarin.delete(id);
  }

  for (const [id, dataLama] of mapDataKemarin.entries()) {
    const entityDisplayName = (dataLama.data && dataLama.data[nameHeaderForLog]) || id;
    const pkRawForLog = (dataLama.data && dataLama.data[primaryKeyHeader]) || id;
    const detail = `${entityName} telah dihapus.`;
    const logEntry = [timestamp, 'PENGHAPUSAN', pkRawForLog, entityDisplayName, sheetName, '', '', detail, entityName];
    logEntriesToAdd.push(logEntry);
  }

  if (logEntriesToAdd.length > 0) {
    sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logEntriesToAdd.length, 9).setValues(logEntriesToAdd);
    console.log(`${logEntriesToAdd.length} log perubahan untuk ${entityName} telah ditambahkan.`);
  }

  const dataUntukArsip = JSON.stringify(Array.from(mapDataHariIni.entries()));
  if (fileArsip) {
    fileArsip.setContent(dataUntukArsip);
  } else {
    folderArsip.createFile(archiveFileName, dataUntukArsip, MimeType.PLAIN_TEXT);
  }
  console.log(`Pengarsipan ${entityName} selesai.`);
  
  return logEntriesToAdd;
}

/**
 * [MODIFIKASI v3.1] Menambahkan filter untuk memastikan hanya log tipe 'VM'
 * yang dianalisis sebagai penyebab over-provisioning.
 */
function diagnoseOverprovisioningCause(dsName, config) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { headers, data: allRecentLogs } = getCombinedLogs(thirtyDaysAgo, config);
    if(allRecentLogs.length === 0) return null;
    
    // --- AWAL MODIFIKASI: Filter log berdasarkan Tipe Log ---
    const typeLogIndex = headers.indexOf(KONSTANTA.HEADER_LOG.TIPE_LOG);
    if (typeLogIndex === -1) {
        console.warn("Kolom 'Tipe Log' tidak ditemukan, analisis penyebab mungkin tidak akurat.");
        return null;
    }
    
    const recentLogs = allRecentLogs.filter(log => log[typeLogIndex] === 'VM');
    if(recentLogs.length === 0) return null;
    // --- AKHIR MODIFIKASI ---

    const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
    const actionIndex = headers.indexOf(KONSTANTA.HEADER_LOG.ACTION);
    const detailIndex = headers.indexOf(KONSTANTA.HEADER_LOG.DETAIL);
    const newValueIndex = headers.indexOf(KONSTANTA.HEADER_LOG.NEW_VAL);

    let newVmCount = 0;
    let diskModCount = 0;

    const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    const vmData = vmSheet.getDataRange().getValues();
    const vmHeaders = vmData.shift();
    const vmPkIndex = vmHeaders.indexOf(KONSTANTA.HEADER_VM.PK);
    const vmDsIndex = vmHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER]);

    const vmsOnThisDs = new Set(vmData.filter(row => row[vmDsIndex] === dsName).map(row => row[vmPkIndex]));

    recentLogs.forEach(log => {
        const pk = log[pkIndex];
        if (vmsOnThisDs.has(pk)) {
            const action = log[actionIndex];
            if (action === 'PENAMBAHAN') {
                newVmCount++;
            } else if (action === 'MODIFIKASI' && log[detailIndex].includes(KONSTANTA.HEADER_VM.PROV_GB)) {
                diskModCount++;
            }
        }
    });

    if (newVmCount > 0 || diskModCount > 0) {
        let diagnosis = "Kondisi ini kemungkinan disebabkan oleh ";
        const causes = [];
        if (newVmCount > 0) causes.push(`<b>${newVmCount} penambahan VM baru</b>`);
        if (diskModCount > 0) causes.push(`<b>${diskModCount} modifikasi ukuran disk</b>`);
        diagnosis += causes.join(' dan ') + " dalam 30 hari terakhir.";
        return diagnosis;
    }

    return null;
}

/**
 * [FUNGSI BARU] Mencari semua VM yang berada di dalam cluster tertentu.
 * @param {string} clusterName - Nama cluster yang akan dicari.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {{headers: Array<string>, results: Array<Array<any>>}} Objek berisi header dan baris data VM yang cocok.
 */
function searchVmsByCluster(clusterName, config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const clusterIndex = headers.indexOf(KONSTANTA.HEADER_VM.CLUSTER);

  if (clusterIndex === -1) {
    throw new Error(`Kolom header penting "${KONSTANTA.HEADER_VM.CLUSTER}" tidak ditemukan di sheet "${sheetName}".`);
  }

  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  // Filter data berdasarkan nama cluster yang sama persis (case-insensitive)
  const results = allData.filter(row => 
    String(row[clusterIndex] || '').toLowerCase() === clusterName.toLowerCase()
  );

  return { headers, results };
}

/**
 * [FUNGSI BARU] Mencari semua VM yang berada di dalam datastore tertentu.
 * @param {string} datastoreName - Nama datastore yang akan dicari.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {{headers: Array<string>, results: Array<Array<any>>}} Objek berisi header dan baris data VM yang cocok.
 */
function searchVmsByDatastore(datastoreName, config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const datastoreColumn = config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER];
  const datastoreIndex = headers.indexOf(datastoreColumn);

  if (datastoreIndex === -1) {
    throw new Error(`Kolom header untuk datastore ("${datastoreColumn}") tidak ditemukan di sheet "${sheetName}".`);
  }

  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  const results = allData.filter(row => 
    String(row[datastoreIndex] || '').toLowerCase() === datastoreName.toLowerCase()
  );

  return { headers, results };
}

/**
 * @param {object} update - Objek update dari Telegram (khususnya callback_query).
 * @param {object} config - Objek konfigurasi bot.
 * @param {string} listType - Tipe daftar, 'cluster' atau 'datastore'.
 * @param {string} itemName - Nama spesifik dari cluster atau datastore.
 * @param {boolean} isInitialRequest - True jika ini adalah permintaan pertama, false jika ini navigasi.
*/
function handlePaginatedVmList(update, config, listType, itemName, isInitialRequest) {
  try {
    const userEvent = update.callback_query;
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;

    let searchFunction, titlePrefix, navPrefix, exportPrefix;
    const K = KONSTANTA.CALLBACK_CEKVM;

    if (listType === 'cluster') {
      searchFunction = searchVmsByCluster;
      titlePrefix = 'VM di Cluster';
      navPrefix = K.CLUSTER_NAV_PREFIX;
      exportPrefix = K.CLUSTER_EXPORT_PREFIX;
    } else if (listType === 'datastore') {
      searchFunction = searchVmsByDatastore;
      titlePrefix = 'VM di Datastore';
      navPrefix = K.DATASTORE_NAV_PREFIX;
      exportPrefix = K.DATASTORE_EXPORT_PREFIX;
    } else {
      throw new Error("Tipe daftar tidak valid: " + listType);
    }

    const { headers, results } = searchFunction(itemName, config);
    const formatVmEntry = (row) => {
      const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
      const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);
      const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
      return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(normalizePrimaryKey(row[pkIndex]))}</code>)`;
    };

    let page = 1;
    if (!isInitialRequest) {
      const parts = userEvent.data.split('_');
      page = parseInt(parts.pop(), 10) || 1;
    }
    
    // PERBAIKAN: Menggunakan encodeURIComponent untuk memastikan nama item tidak terpotong
    const safeItemName = encodeURIComponent(itemName);
    
    const paginatedView = createPaginatedView({
      allItems: results,
      page: page,
      title: `${titlePrefix} "${escapeHtml(itemName)}"`,
      formatEntryCallback: formatVmEntry,
      navCallbackPrefix: `${navPrefix}${safeItemName}`, // Menggunakan nama item yang aman
      exportCallbackData: `${exportPrefix}${safeItemName}`
    });

    if (isInitialRequest) {
      kirimPesanTelegram(paginatedView.text, config, 'HTML', paginatedView.keyboard, chatId);
    } else {
      if (userEvent.message.text !== paginatedView.text) {
        editMessageText(paginatedView.text, paginatedView.keyboard, chatId, messageId, config);
      }
    }
  } catch (err) {
    handleCentralizedError(err, `Daftar VM Paginasi (${listType}: ${itemName})`, config);
  }
}
