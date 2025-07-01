// ===== FILE: ManajemenData.gs =====

/**
 * [PERBAIKAN FINAL & ANTI-SPAM]
 * Menjalankan alur kerja sinkronisasi penuh dengan mekanisme penguncian (LockService)
 * untuk secara total mencegah eksekusi ganda dan spam laporan.
 */
function syncDanBuatLaporanHarian(showUiAlert = true) {
  // 1. Minta "kunci" untuk menjalankan fungsi ini.
  const lock = LockService.getScriptLock();
  
  // 2. Coba dapatkan kunci. Jika gagal (karena fungsi lain sedang berjalan),
  //    maka hentikan eksekusi ini. Waktu tunggu 10 detik.
  const lockAcquired = lock.tryLock(10000); 

  if (!lockAcquired) {
    console.log("Proses sinkronisasi sudah berjalan. Eksekusi duplikat dibatalkan untuk mencegah spam.");
    return; // <-- INI BAGIAN PENTING: Fungsi berhenti di sini jika ada duplikat.
  }
  
  // 3. Jika berhasil dapat kunci, jalankan semua proses seperti biasa.
  try {
    const config = bacaKonfigurasi();

    // Pesan "Permintaan diterima..." HANYA akan dikirim jika proses ini berhasil mendapatkan kunci.
    try {
      const startTime = new Date();
      // [PERBAIKAN] Hapus timeZone eksplisit untuk menggunakan waktu sistem
      const timestamp = startTime.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      
      let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp}</b>\n\n`;
      pesanAwal += `⚙️ Memulai sinkronisasi penuh & pembuatan laporan...\n`;
      pesanAwal += `<i>Proses ini akan menyalin data terbaru dari sumber sebelum membuat laporan dan mungkin memerlukan waktu beberapa menit.</i>`;
      
      kirimPesanTelegram(pesanAwal, config, 'HTML');

    } catch (e) {
      console.error(`Gagal mengirim pesan awal untuk /sync_laporan: ${e.message}`);
    }

    if (showUiAlert && SpreadsheetApp.getActiveSpreadsheet().getUi()) {
      showUiFeedback("Proses Dimulai", "Mengimpor semua data dan membuat laporan...");
    }

    const sumberIdKey = KONSTANTA.KUNCI_KONFIG.ID_SUMBER; 
    const sheetVmKey = KONSTANTA.KUNCI_KONFIG.SHEET_VM;
    const sheetDsKey = KONSTANTA.KUNCI_KONFIG.SHEET_DS;
    
    if (!config[sumberIdKey]) throw new Error("Konfigurasi SUMBER_SPREADSHEET_ID tidak ditemukan.");
    if (!config[sheetVmKey]) throw new Error("Konfigurasi NAMA_SHEET_DATA_UTAMA tidak ditemukan.");

    console.log(`Memulai sinkronisasi untuk sheet: ${config[sheetVmKey]}`);
    salinDataSheet(config[sheetVmKey], config[sumberIdKey]);

    if (config[sheetDsKey]) {
      console.log(`Memulai sinkronisasi untuk sheet: ${config[sheetDsKey]}`);
      salinDataSheet(config[sheetDsKey], config[sumberIdKey]);
    }
    
    // Panggil fungsi laporan hanya satu kali.
    buatLaporanHarianVM();
    jalankanPemeriksaanDatastore();
    
    if (showUiAlert) {
      showUiFeedback("Sukses!", "Semua data telah diimpor dan semua laporan telah diproses.");
    }
  } catch (e) {
    console.error(`ERROR UTAMA di syncDanBuatLaporanHarian: ${e.message}\nStack: ${e.stack}`);
    const errorConfig = bacaKonfigurasi(); 
    kirimPesanTelegram(`<b>❌ Proses /sync_laporan Gagal</b>\n\nTerjadi kesalahan...\n<code>${escapeHtml(e.message)}</code>`, errorConfig, 'HTML');
    if (showUiAlert) {
      showUiFeedback("Terjadi Error", `Proses dihentikan. Error: ${e.message}`);
    }
    throw new Error(`Error saat menjalankan syncDanBuatLaporanHarian: ${e.message}`);
  } finally {
    // 4. WAJIB: Lepaskan kunci setelah semua proses selesai.
    lock.releaseLock();
    console.log("Kunci (Lock) telah dilepaskan.");
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
 * [FUNGSI BARU - PENGGANTI findVmAndGetInfo]
 * Mengendalikan seluruh alur pencarian VM, baik interaktif maupun tidak.
 */
function handleVmSearchInteraction(update, config) {
  const isCallback = !!update.callback_query;
  // [PERBAIKAN MENTION] Ambil detail pengguna dari objek 'update'
  const userEvent = isCallback ? update.callback_query : update.message;
  const userId = userEvent.from.id;
  const firstName = userEvent.from.first_name;

  // [PERBAIKAN MENTION] Ambil data dasar dan lengkapi objek userData
  const userData = getUserData(userId);
  if (userData) {
    userData.userId = userId;
    userData.firstName = firstName;
  }
  
  let page = 1;
  let searchTerm;
  let chatId, messageId;

  if (isCallback) {
    chatId = update.callback_query.message.chat.id;
    messageId = update.callback_query.message.message_id;
    const callbackData = update.callback_query.data;
    
    if (callbackData.startsWith(KONSTANTA.CALLBACK_CEKVM.NAVIGATE)) {
        const parts = callbackData.split('_');
        page = parseInt(parts[2], 10);
        searchTerm = parts.slice(3).join('_');
        const { text, keyboard } = generateVmSearchView(searchTerm, page, config, userData);
        if (update.callback_query.message.text !== text) {
            editMessageText(text, keyboard, chatId, messageId, config);
        }
    } else if (callbackData.startsWith(KONSTANTA.CALLBACK_CEKVM.EXPORT)) {
        searchTerm = callbackData.replace(KONSTANTA.CALLBACK_CEKVM.EXPORT, '');
        const { headers, results } = searchVmOnSheet(searchTerm, config);
        exportResultsToSheet(headers, results, `Pencarian VM '${searchTerm}'`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
    }

  } else {
    chatId = update.message.chat.id;
    searchTerm = update.message.text.split(' ').slice(1).join(' ');
    
    const { headers, results } = searchVmOnSheet(searchTerm, config);

    if (results.length === 0) {
        kirimPesanTelegram(`❌ VM dengan nama/IP/Primary Key yang mengandung "<b>${escapeHtml(searchTerm)}</b>" tidak ditemukan.`, config, 'HTML');
    } else if (results.length === 1) {
        const rowData = results[0];
        const vmData = {};
        headers.forEach((header, i) => vmData[header] = rowData[i] || 'N/A');

        let info = `🖥️  <b>Detail Virtual Machine</b>\n\n`;

        // Fungsi helper untuk menambahkan baris info
        const addInfo = (label, value, isCode = false) => {
            if (value && value !== 'N/A') {
                if (isCode) {
                    info += `•  <b>${label}:</b> <code>${escapeHtml(value)}</code>\n`;
                } else {
                    info += `•  <b>${label}:</b> ${escapeHtml(value)}\n`;
                }
            }
        };

        info += `<b><u>Informasi Umum</u></b>\n`;
        addInfo('Nama VM', vmData[KONSTANTA.HEADER_VM.VM_NAME]);
        addInfo('Primary Key', normalizePrimaryKey(vmData[KONSTANTA.HEADER_VM.PK]), true);
        addInfo('IP Address', vmData[KONSTANTA.HEADER_VM.IP], true);
        const status = vmData[KONSTANTA.HEADER_VM.STATE].toLowerCase().includes('on') ? '🟢 Powered On' : '🔴 Powered Off';
        addInfo('Status', status);
        addInfo('Uptime', `${vmData[KONSTANTA.HEADER_VM.UPTIME]} hari`);

        info += `\n<b><u>Sumber Daya & Kapasitas</u></b>\n`;
        addInfo('CPU', `${vmData[KONSTANTA.HEADER_VM.CPU]} vCPU`);
        addInfo('Memory', `${vmData[KONSTANTA.HEADER_VM.MEMORY]} GB`);
        addInfo('Provisioned', `${vmData[KONSTANTA.HEADER_VM.PROV_GB]} GB`);
        addInfo('Cluster', vmData[KONSTANTA.HEADER_VM.CLUSTER]);
        addInfo('Datastore', vmData['DS']);

        info += `\n<b><u>Konfigurasi & Manajemen</u></b>\n`;
        addInfo('Environment', vmData['Environment']);
        addInfo('Kritikalitas BIA', vmData[KONSTANTA.HEADER_VM.KRITIKALITAS]);
        addInfo('Aplikasi BIA', vmData[KONSTANTA.HEADER_VM.KELOMPOK_APP]);
        addInfo('DEV/OPS', vmData[KONSTANTA.HEADER_VM.DEV_OPS]);
        addInfo('Guest OS', vmData[KONSTANTA.HEADER_VM.GUEST_OS]);
        addInfo('vCenter', vmData[KONSTANTA.HEADER_VM.VCENTER]);

        const pk_raw = vmData[KONSTANTA.HEADER_VM.PK];
        const inlineKeyboard = { inline_keyboard: [[{ text: "📜 Lihat Histori Perubahan", callback_data: `history_get_${pk_raw}` }]] };
        kirimPesanTelegram(info, config, 'HTML', inlineKeyboard);
    }
  }
}

/**
 * [FUNGSI HELPER BARU] Melakukan pencarian mentah di sheet dan mengembalikan hasilnya.
 */
function searchVmOnSheet(searchTerm, config) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
  const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
  const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);

  const allData = sheet.getDataRange().getValues();
  const searchLower = searchTerm.toLowerCase();
  const normalizedSearchTerm = normalizePrimaryKey(searchLower);
  let results = [];

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    const vmPk = normalizePrimaryKey(String(row[pkIndex] || '')).toLowerCase();
    const vmName = String(row[nameIndex] || '').toLowerCase();
    const vmIp = String(row[ipIndex] || '').toLowerCase();
    if (vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower)) {
      results.push(row);
    }
  }
  return { headers, results };
}


/**
 * [FUNGSI BARU] Membuat tampilan per halaman untuk hasil pencarian VM.
 */
function generateVmSearchView(searchTerm, page, config, userData) {
  const ENTRIES_PER_PAGE = 15; // Sesuai permintaan
  
  // Kita tidak memakai cache di sini agar data selalu baru setiap kali pencarian
  const { headers, results } = searchVmOnSheet(searchTerm, config);
  const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
  const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
  const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);

  const totalEntries = results.length;
  const totalPages = Math.ceil(totalEntries / ENTRIES_PER_PAGE);
  page = Math.max(1, Math.min(page, totalPages));
  
  const startIndex = (page - 1) * ENTRIES_PER_PAGE;
  const endIndex = startIndex + ENTRIES_PER_PAGE;
  const pageEntries = results.slice(startIndex, endIndex);

  let text = `✅ Ditemukan <b>${totalEntries}</b> hasil untuk "<b>${escapeHtml(searchTerm)}</b>"\n`;
  text += `<i>Menampilkan halaman ${page} dari ${totalPages}</i>\n------------------------------------\n\n`;
  
  pageEntries.forEach((row, i) => {
    const vmName = escapeHtml(row[nameIndex]);
    const vmIp = escapeHtml(row[ipIndex]);
    const vmPk = escapeHtml(normalizePrimaryKey(row[pkIndex]));
    text += `${startIndex + i + 1}. <b>${vmName}</b>\n   (<code>${vmIp}</code> | <code>${vmPk}</code>)\n`;
  });

  const keyboardRows = [];
  const navigationButtons = [];
  const searchTermSafe = searchTerm.replace(/ /g, '_'); // Ganti spasi untuk callback

  if (page > 1) {
    navigationButtons.push({ text: '⬅️ Halaman Sblm', callback_data: `${KONSTANTA.CALLBACK_CEKVM.NAVIGATE}${page - 1}_${searchTermSafe}` });
  }
  if (totalPages > 1) {
      navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'ignore' });
  }
  if (page < totalPages) {
    navigationButtons.push({ text: 'Halaman Brkt ➡️', callback_data: `${KONSTANTA.CALLBACK_CEKVM.NAVIGATE}${page + 1}_${searchTermSafe}` });
  }
  
  if(navigationButtons.length > 0) keyboardRows.push(navigationButtons);
  
  // Tombol Ekspor
  keyboardRows.push([{ text: `📄 Ekspor Semua ${totalEntries} Hasil`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.EXPORT}${searchTermSafe}` }]);
  
  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * [FUNGSI BARU - PENGGANTI getTodaysHistory]
 * Mengendalikan interaksi untuk /cekhistory yang sekarang interaktif.
 */
function handleHistoryInteraction(update, config) {
  const isCallback = !!update.callback_query;
  // [PERBAIKAN MENTION] Ambil detail pengguna dari objek 'update'
  const userEvent = isCallback ? update.callback_query : update.message;
  const userId = userEvent.from.id;
  const firstName = userEvent.from.first_name;

  // [PERBAIKAN MENTION] Ambil data dasar dan lengkapi objek userData
  const userData = getUserData(userId);
  if (userData) {
    userData.userId = userId;
    userData.firstName = firstName;
  }
  
  let page = 1;
  let chatId, messageId;

  if (isCallback) {
    chatId = update.callback_query.message.chat.id;
    messageId = update.callback_query.message.message_id;
    page = parseInt(update.callback_query.data.split('_').pop(), 10);
  } else {
    chatId = update.message.chat.id;
  }
  
  const { text, keyboard } = generateHistoryView(page, config, userData);
  
  if (isCallback) {
    if (update.callback_query.message.text !== text) {
      editMessageText(text, keyboard, chatId, messageId, config);
    }
  } else {
    kirimPesanTelegram(text, config, 'HTML', keyboard, chatId);
  }
}

/**
 * [FUNGSI BARU] Membuat tampilan per halaman untuk riwayat log.
 */
function generateHistoryView(page, config, userData) {
  const ENTRIES_PER_PAGE = 15; // Limit 15 entri sesuai permintaan
  const cache = CacheService.getScriptCache();
  // Gunakan cache yang spesifik per pengguna untuk menghindari data tercampur
  const cacheKey = `history_log_${userData.userId}`;
  
  let cachedLogs = cache.get(cacheKey);
  let allLogs = [];
  
  if (cachedLogs) {
    allLogs = JSON.parse(cachedLogs);
  } else {
    kirimPesanTelegram("🔍 Mengambil dan mengurutkan data log untuk pertama kali... Mohon tunggu sebentar.", config);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const logResult = getCombinedLogs(todayStart, config);
    allLogs = logResult.data;
    cache.put(cacheKey, JSON.stringify(allLogs), 600); 
  }
  
  const totalEntries = allLogs.length;
  if (totalEntries === 0) {
    return { text: "✅ Tidak ada perubahan yang tercatat pada hari ini.", keyboard: null };
  }

  const totalPages = Math.ceil(totalEntries / ENTRIES_PER_PAGE);
  page = Math.max(1, Math.min(page, totalPages)); 
  
  const startIndex = (page - 1) * ENTRIES_PER_PAGE;
  const endIndex = startIndex + ENTRIES_PER_PAGE;
  const pageEntries = allLogs.slice(startIndex, endIndex);

  const logSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  const logHeaders = logSheet ? logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0] : ['Timestamp', 'Action/Tipe perubahan', 'Primary Key', 'Nama Entitas', 'Sheet Sumber', 'Old Value', 'New Value', 'Detail Perubahan'];
  
  let text = `<b>📜 Log Perubahan Hari Ini (Halaman ${page}/${totalPages})</b>\n`;
  text += `<i>Total Entri: ${totalEntries}</i>\n------------------------------------\n\n`;
  
  pageEntries.forEach(entry => {
    text += formatHistoryEntry(entry, logHeaders);
  });

  const keyboardRows = [];
  const navigationButtons = [];
  
  if (page > 1) {
    navigationButtons.push({ text: '⬅️ Halaman Sblm', callback_data: KONSTANTA.CALLBACK_HISTORY.NAVIGATE + (page - 1) });
  }
  if (totalPages > 1) {
    navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'ignore' });
  }
  if (page < totalPages) {
    navigationButtons.push({ text: 'Halaman Brkt ➡️', callback_data: KONSTANTA.CALLBACK_HISTORY.NAVIGATE + (page + 1) });
  }
  
  if(navigationButtons.length > 0) keyboardRows.push(navigationButtons);
  
  return { text: text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * [FUNGSI VERSI FINAL YANG DISEMPURNAKAN]
 * Mengekspor data ke Google Sheet baru dengan logika pembagian yang jelas:
 * 1. Jika dijalankan oleh PENGGUNA via Telegram, file akan dibagikan secara PRIBADI ke email pengguna.
 * 2. Jika dijalankan oleh SISTEM (trigger/manual dari editor), file akan dibagikan secara PUBLIK
 * (siapa saja yang memiliki link) untuk menjamin kelancaran proses.
 */
function exportResultsToSheet(headers, dataRows, title, config, userData, highlightColumnName = null) {
  const folderId = config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR];
  if (!folderId) {
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor: Konfigurasi FOLDER_ID_HASIL_EKSPOR tidak ditemukan.`, config);
    return;
  }
  
  // Validasi email HANYA jika dieksekusi oleh pengguna spesifik
  if (userData && !userData.email) {
    kirimPesanTelegram(`⚠️ Gagal membagikan file: Email untuk pengguna dengan ID ${userData.userId || 'tidak dikenal'} tidak ditemukan di sheet 'Hak Akses'.`, config);
    return;
  }

  try {
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd HH.mm.ss");
    const fileName = `Laporan - ${title.replace(/<|>/g, '')} - ${timestamp}`;
    const newSs = SpreadsheetApp.create(fileName);
    const sheet = newSs.getSheets()[0];
    sheet.setName(title.substring(0, 100));

    // Pengaturan Header dan Data
    sheet.getRange("A1").setValue(title).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
    sheet.getRange(1, 1, 1, headers.length).merge();
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (dataRows.length > 0) {
      sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
    }
    
    // Pemformatan
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() > 2 ? sheet.getLastRow() - 1 : 1, headers.length);
    if (highlightColumnName) {
      const highlightColIndex = headers.indexOf(highlightColumnName) + 1;
      if (highlightColIndex > 0) {
        sheet.getRange(2, highlightColIndex, dataRange.getNumRows()).setBackground("#FFF2CC");
      }
    }
    dataRange.createFilter();
    headers.forEach((_, i) => sheet.autoResizeColumn(i + 1));
    
    // Memindahkan file dan mengatur hak akses
    const file = DriveApp.getFileById(newSs.getId());
    const folder = DriveApp.getFolderById(folderId);
    file.moveTo(folder);
    const fileUrl = file.getUrl();
    
    let pesanFile;

    // Logika pembagian hak akses dan pembuatan pesan
    if (userData && userData.email) {
      // Skenario 1: Permintaan dari PENGGUNA -> Bagikan secara PRIBADI
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      file.addViewer(userData.email);
      console.log(`Hasil ekspor berhasil dibuat dan dibagikan secara pribadi ke ${userData.email}: ${fileUrl}`);
      const userMention = `<a href="tg://user?id=${userData.userId}">${escapeHtml(userData.firstName || 'Pengguna')}</a>`;
      pesanFile = `${userMention}, file ekspor Anda untuk "<b>${escapeHtml(title)}</b>" sudah siap.\n\nFile ini telah dibagikan secara pribadi ke email Anda.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    
    } else {
      // Skenario 2: Dijalankan oleh SISTEM -> Bagikan secara PUBLIK
      console.log("Proses sistem terdeteksi. Membagikan file ke siapa saja dengan tautan.");
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      console.log(`Hasil ekspor sistem berhasil dibuat dan dibagikan secara publik: ${fileUrl}`);
      pesanFile = `📄 Laporan sistem "<b>${escapeHtml(title)}</b>" telah dibuat.\n\nSilakan akses file melalui tautan di bawah ini.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    }

    // Kirim pesan ke Telegram
    kirimPesanTelegram(pesanFile, config, 'HTML');

  } catch (e) {
    console.error(`Gagal mengekspor hasil ke sheet: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor. Error: ${e.message}`, config);
  }
}

/**
 * [VERSI FINAL DIPERBAIKI]
 * Mencari riwayat lengkap sebuah VM dengan mencari di log aktif DAN semua file arsip.
 * Menggunakan helper getCombinedLogs untuk efisiensi dan konsistensi.
 */
function getVmHistory(pk, config, userData) {
  if (!pk) {
    kirimPesanTelegram("❌ Terjadi kesalahan: ID untuk melihat riwayat tidak valid.", config);
    return;
  }

  try {
    // ===== [PERBAIKAN PESAN] =====
    // Terapkan normalisasi pada PK yang ditampilkan di pesan "sedang mencari".
    const pkToDisplay = normalizePrimaryKey(pk);
    kirimPesanTelegram(`🔍 Mencari riwayat lengkap untuk PK: <code>${escapeHtml(pkToDisplay)}</code>...\n<i>Ini mungkin memerlukan beberapa saat...</i>`, config, 'HTML');
    // =============================

    const allTimeStartDate = new Date('2020-01-01'); 
    const { headers: logHeaders, data: allLogs } = getCombinedLogs(allTimeStartDate, config);

    if (logHeaders.length === 0) {
      kirimPesanTelegram("❌ Gagal memproses: Tidak dapat menemukan header log. Pastikan sheet 'Log Perubahan' ada.", config);
      return;
    }

    const pkIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.PK);
    if (pkIndex === -1) {
      kirimPesanTelegram(`❌ Gagal memproses: Kolom '${KONSTANTA.HEADER_VM.PK}' tidak ditemukan di log.`, config);
      return;
    }

    const pkTrimmed = normalizePrimaryKey(pk.trim()).toLowerCase();
    const historyEntries = allLogs.filter(row => 
      row[pkIndex] && normalizePrimaryKey(String(row[pkIndex])).toLowerCase() === pkTrimmed
    );

    if (historyEntries.length === 0) {
      kirimPesanTelegram(`ℹ️ Tidak ada riwayat perubahan ditemukan untuk Primary Key <code>${escapeHtml(normalizePrimaryKey(pk))}</code>.`, config, 'HTML');
      return;
    }

    const timestampIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP);
    historyEntries.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));

    const totalEntries = historyEntries.length;
    const vmNameIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const currentVmName = historyEntries[0][vmNameIndex] || pk;
    
    let message = `<b>📜 Riwayat Lengkap untuk VM</b>\n`;
    message += `<b>${KONSTANTA.HEADER_VM.VM_NAME}:</b> ${escapeHtml(currentVmName)}\n`;
    // ===== [PERUBAHAN TAMPILAN] =====
    // Tampilkan PK yang sudah dinormalisasi di judul laporan.
    message += `<b>${KONSTANTA.HEADER_VM.PK}:</b> <code>${escapeHtml(normalizePrimaryKey(pk))}</code>\n`;
    // =================================
    message += `<i>Total ditemukan ${totalEntries} entri riwayat.</i>\n`;
    message += `------------------------------------\n\n`;

    if (totalEntries > 8) {
      message += `Menampilkan 5 dari ${totalEntries} perubahan terakhir:\n\n`;
      const entriesToShow = historyEntries.slice(0, 5);
      
      entriesToShow.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });

      message += `\n------------------------------------\n`;
      message += `<i>Riwayat terlalu panjang. Laporan lengkap sedang dibuat dalam file Google Sheet...</i>`;
      kirimPesanTelegram(message, config, 'HTML');

      exportResultsToSheet(logHeaders, historyEntries, `Riwayat Lengkap - ${pk}`, config, userData, KONSTANTA.HEADER_LOG.ACTION);

    } else {
      historyEntries.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });
      kirimPesanTelegram(message, config, 'HTML');
    }

  } catch (e) {
    console.error(`Gagal total saat getVmHistory: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`❌ Terjadi kesalahan teknis saat mengambil riwayat.\nError: ${e.message}`, config);
  }
}

/**
 * [FUNGSI HELPER BARU]
 * Memformat satu baris entri log menjadi teks yang rapi.
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
 * [HELPER] Mengurutkan kandidat VM migrasi.
 */
function sortVmForMigration(a, b) {
  // Prioritas 1: VM yang mati (poweredOff) didahulukan
  const isAOff = String(a.state || '').toLowerCase().includes('off');
  const isBOff = String(b.state || '').toLowerCase().includes('off');
  if (isAOff && !isBOff) return -1;
  if (!isAOff && isBOff) return 1;

  // [PERBAIKAN] Prioritas 2: Kritikalitas berdasarkan daftar pantauan
  const config = bacaKonfigurasi(); // Perlu baca config untuk dapat daftar pantauan
  const monitoredCrit = config[KONSTANTA.KUNCI_KONFIG.KRITIKALITAS_PANTAU] || [];
  
  const isACritical = monitoredCrit.includes(String(a.criticality || '').toUpperCase());
  const isBCritical = monitoredCrit.includes(String(b.criticality || '').toUpperCase());

  if (isACritical && !isBCritical) return 1;  // VM non-kritis (other) didahulukan
  if (!isACritical && isBCritical) return -1; // VM non-kritis (other) didahulukan

  // Prioritas 3: Ukuran provisioned terkecil didahulukan
  return a.provisionedGb - b.provisionedGb;
}

/**
 * [HELPER] Mencari datastore tujuan terbaik dengan logika filter yang lengkap.
 * [DIPERBAIKI] Mencari datastore tujuan terbaik dengan logika filter yang lebih ketat,
 * di mana aturan pengecualian menjadi prioritas utama.
 */
function findBestDestination(sourceDs, requiredGb, availableDestinations, migrationConfig, config) {
  const sourceType = sourceDs.type;
  
  // Hanya gunakan daftar pengecualian.
  const excludedKeywords = config[KONSTANTA.KUNCI_KONFIG.DS_KECUALI] || [];

  // 1. Filter kandidat awal berdasarkan cluster, ruang, nama, dan lingkungan
  let potentialDestinations = availableDestinations.filter(destDs => {
    return destDs.freeSpace > requiredGb && 
           destDs.environment === sourceDs.environment &&
           destDs.cluster === sourceDs.cluster && 
           destDs.name !== sourceDs.name;
  });
  
  // 2. [LOGIKA BARU] Terapkan filter pengecualian yang ketat
  potentialDestinations = potentialDestinations.filter(destDs => {
    const dsNameUpper = destDs.name.toUpperCase();
    
    // Jika nama mengandung salah satu kata kunci terlarang, langsung gugurkan.
    if (excludedKeywords.some(exc => dsNameUpper.includes(exc))) {
      return false;
    }
    
    // Jika lolos dari semua pengecualian, maka ia adalah kandidat valid.
    return true;
  });

  if (potentialDestinations.length === 0) return null;

  // 3. Terapkan aturan prioritas dari Logika Migrasi pada kandidat yang tersisa
  const sourceRule = migrationConfig.get(sourceType) || Array.from(migrationConfig.values()).find(rule => rule.alias === sourceType);

  if (sourceType && sourceRule && sourceRule.destinations.length > 0) {
    const priorityTypes = sourceRule.destinations;
    for (const priorityType of priorityTypes) {
      const found = potentialDestinations.find(d => d.type === priorityType);
      if (found) {
        return found; 
      }
    }
    return null; 
  }
  
  // 4. Logika fallback
  potentialDestinations.sort((a, b) => b.freeSpace - a.freeSpace);
  return potentialDestinations.length > 0 ? potentialDestinations[0] : null;
}

/**
 * Fungsi utama untuk analisis dan rekomendasi migrasi datastore.
 */
function jalankanRekomendasiMigrasi() {
    console.log("Memulai pengecekan rekomendasi migrasi datastore...");
    try {
      const config = bacaKonfigurasi();
      
      const requiredKeys = [
        KONSTANTA.KUNCI_KONFIG.SHEET_DS, KONSTANTA.KUNCI_KONFIG.SHEET_VM, 
        KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER, KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER, 
        KONSTANTA.KUNCI_KONFIG.DS_PROV_GB_HEADER, KONSTANTA.KUNCI_KONFIG.VM_PROV_GB_HEADER, 
        KONSTANTA.KUNCI_KONFIG.SHEET_LOGIKA_MIGRASI
      ];
      for (const key of requiredKeys) {
        if (!config[key]) {
          throw new Error(`Konfigurasi Migrasi Tidak Lengkap! Kunci yang hilang: ${key}`);
        }
      }
  
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const dsSheet = ss.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
      const vmSheet = ss.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
      const migrationLogicSheet = ss.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_LOGIKA_MIGRASI]);
  
      if (!dsSheet || !vmSheet || !migrationLogicSheet) {
        throw new Error("Satu atau lebih sheet penting tidak ditemukan (Datastore, VM, atau Logika Migrasi).");
      }
  
      const migrationConfig = getMigrationConfig(migrationLogicSheet);
      
      const dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
      const dsNameIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
      const dsCapGbIndex = dsHeaders.indexOf(KONSTANTA.HEADER_DS.CAPACITY_GB);
      const dsProvGbIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_PROV_GB_HEADER]);
      if ([dsNameIndex, dsCapGbIndex, dsProvGbIndex].includes(-1)) throw new Error("Header penting di sheet Datastore tidak ditemukan.");
  
      const allDsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
      const allDatastores = new Map();
      const overProvisionedDs = [];
  
      allDsData.forEach(row => {
        const name = row[dsNameIndex];
        const capacity = parseFloat(String(row[dsCapGbIndex]).replace(/,/g, '')) || 0;
        const provisioned = parseFloat(String(row[dsProvGbIndex]).replace(/,/g, '')) || 0;
        const dsInfoParsed = getDsInfo(name, migrationConfig);
        
        const dsInfo = { 
          name: name, capacity: capacity, provisioned: provisioned, 
          freeSpace: capacity - provisioned, 
          cluster: dsInfoParsed.cluster, 
          type: dsInfoParsed.type,
          environment: getEnvironmentFromDsName(name, config[KONSTANTA.KUNCI_KONFIG.MAP_ENV])
        };
        allDatastores.set(name, dsInfo);
        if (provisioned > capacity) {
          overProvisionedDs.push({ ...dsInfo, overageGb: provisioned - capacity });
        }
      });
  
      if (overProvisionedDs.length === 0) {
        kirimPesanTelegram("✅ Semua datastore dalam kondisi provisioning yang aman (1:1).", config);
        return;
      }
      
      const vmHeaders = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
      const vmPkIndex = vmHeaders.indexOf(KONSTANTA.HEADER_VM.PK);
      const vmDsIndex = vmHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER]);
      const vmProvGbIndex = vmHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_PROV_GB_HEADER]);
      const vmNameIndex = vmHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
      const vmStateIndex = vmHeaders.indexOf(KONSTANTA.HEADER_VM.STATE);
      const vmCritIndex = vmHeaders.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS);
      if ([vmPkIndex, vmDsIndex, vmProvGbIndex, vmNameIndex, vmStateIndex, vmCritIndex].includes(-1)) throw new Error("Header penting di sheet VM tidak ditemukan.");
      
      const vmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();
      const vmByDatastore = new Map();
      vmData.forEach(row => {
        const dsName = row[vmDsIndex];
        if (!vmByDatastore.has(dsName)) vmByDatastore.set(dsName, []);
        vmByDatastore.get(dsName).push({
          pk: row[vmPkIndex], name: row[vmNameIndex], provisionedGb: parseFloat(row[vmProvGbIndex]) || 0,
          state: row[vmStateIndex], criticality: row[vmCritIndex]
        });
      });
      
      let finalMessage = `🚨 <b>Laporan Rekomendasi Migrasi Datastore</b>\n`;
      // [PERBAIKAN] Hapus timeZone eksplisit untuk menggunakan waktu sistem
      finalMessage += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID')}</i>`;
  
      overProvisionedDs.forEach(ds => {
        finalMessage += `\n\n------------------------------------\n`;
        finalMessage += `❗️ <b>Datastore Over-Provisioned:</b> <code>${escapeHtml(ds.name)}</code>\n`;
        finalMessage += `• <b>Status:</b> Provisioned <b>${ds.provisioned.toFixed(2)} / ${ds.capacity.toFixed(2)} GB (${(ds.provisioned/ds.capacity*100).toFixed(1)}%)</b>\n`;
        finalMessage += `• <b>Target Migrasi:</b> <code>${ds.overageGb.toFixed(2)} GB</code>`;
  
        const candidateVms = vmByDatastore.get(ds.name) || [];
        if (candidateVms.length === 0) {
          finalMessage += `\n\n<i>Tidak ditemukan VM pada datastore ini untuk dimigrasi.</i>`;
          return; 
        }
        
        candidateVms.sort(sortVmForMigration);
  
        let totalGbToMigrate = 0;
        let vmsToMigrate = [];
        for (const vm of candidateVms) {
          if (totalGbToMigrate < ds.overageGb) {
            vmsToMigrate.push(vm);
            totalGbToMigrate += vm.provisionedGb;
          } else { break; }
        }
        
        let migrationPlan = new Map();
        let vmsNeedingNewDs = [];
        
        // [OPTIMALISASI] Melakukan pra-penyaringan sebelum deep copy untuk efisiensi
        let availableDestinations = JSON.parse(JSON.stringify(
            Array.from(allDatastores.values()).filter(destDs => destDs.cluster === ds.cluster && destDs.name !== ds.name)
        ));
  
        vmsToMigrate.sort((a,b) => b.provisionedGb - a.provisionedGb);
  
        vmsToMigrate.forEach(vm => {
          let destinationForThisVm = findBestDestination(ds, vm.provisionedGb, availableDestinations, migrationConfig, config);
          
          if (destinationForThisVm) {
            const destName = destinationForThisVm.name;
            if (!migrationPlan.has(destName)) {
              migrationPlan.set(destName, []);
            }
            migrationPlan.get(destName).push(vm);
  
            const destIndex = availableDestinations.findIndex(d => d.name === destName);
            if (destIndex !== -1) {
              availableDestinations[destIndex].freeSpace -= vm.provisionedGb;
            }
          } else {
            vmsNeedingNewDs.push(vm);
          }
        });
        
        finalMessage += `\n\n✅ <b>Rencana Aksi:</b>`;
        
        if (migrationPlan.size > 0) {
          migrationPlan.forEach((vms, destDsName) => {
            const totalSizeForThisDest = vms.reduce((sum, vm) => sum + vm.provisionedGb, 0);
            finalMessage += `\n\n➡️ <b>Migrasi ke \`${escapeHtml(destDsName)}\`</b> (~${totalSizeForThisDest.toFixed(2)} GB):\n`;
            vms.forEach(vm => {
              finalMessage += ` • <code>${escapeHtml(vm.name)}</code> (${vm.provisionedGb.toFixed(2)} GB) | Kritikalitas: ${vm.criticality} | Status: ${vm.state}\n`;
            });
          });
        }
  
        if (vmsNeedingNewDs.length > 0) {
          finalMessage += `\n\n❌ <b>Tindakan Lanjutan Diperlukan:</b>`;
          finalMessage += `\nTidak ditemukan tujuan yang cocok. Perlu datastore baru di <b>Cluster ${ds.cluster || 'yg sama'}</b> & <b>Environment ${ds.environment || 'yg sama'}</b> dengan tipe <b>${ds.type || 'serupa'}</b> untuk VM berikut:\n`;
          vmsNeedingNewDs.forEach(vm => {
            finalMessage += `- <code>${escapeHtml(vm.name)}</code> (${vm.provisionedGb.toFixed(2)} GB) | Kritikalitas: ${vm.criticality} | Status: ${vm.state}\n`;
          });
        }
      });
      
      // Kirim satu pesan tunggal setelah semua analisis selesai
      kirimPesanTelegram(finalMessage, config, 'HTML');
  
    } catch (e) {
      console.error(`Gagal menjalankan rekomendasi migrasi: ${e.message}\nStack: ${e.stack}`);
      kirimPesanTelegram(`<b>⚠️ Gagal Menjalankan Analisis Migrasi Datastore!</b>\n\n<code>${escapeHtml(e.message)}</code>`, bacaKonfigurasi());
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
    // Buat nama file arsip yang unik berdasarkan tanggal dan waktu
    const timestamp = Utilities.formatDate(new Date(), "GMT+7", "yyyy-MM-dd_HH-mm-ss");
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
  const BATAS_BARIS = 5000;

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
 * [FUNGSI OPTIMALISASI BARU - VERSI FINAL DIPERBARUI]
 * Fungsi generik untuk mendeteksi perubahan antara data lama (arsip) dan data baru (sheet),
 * kemudian mencatat perbedaan ke dalam Log Perubahan.
 * Fungsi ini sekarang menggunakan Primary Key yang sudah dinormalisasi untuk perbandingan.
 *
 * @param {object} config - Objek konfigurasi utama.
 * @param {string} sheetName - Nama sheet sumber data baru.
 * @param {string} archiveFileName - Nama file arsip .json di Google Drive.
 * @param {string} primaryKeyHeader - Nama kolom yang menjadi kunci unik (e.g., 'Primary Key').
 * @param {Array<object>} columnsToTrack - Array objek kolom yg dipantau, format: [{nama: 'HeaderName', index: 0}].
 * @param {string} entityName - Nama entitas untuk pesan log (e.g., 'VM' atau 'Datastore').
 * @returns {Array<Array<any>>} Array berisi entri log yang baru ditambahkan.
 */
function processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, entityName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  }

  const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  if (!sheetLog) {
    throw new Error(`Sheet Log Perubahan tidak ditemukan.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(primaryKeyHeader);
  if (pkIndex === -1) {
    throw new Error(`Kolom Primary Key "${primaryKeyHeader}" tidak ditemukan di sheet "${sheetName}".`);
  }

  // ===== [LANGKAH 1: PERUBAHAN] =====
  // Baca Arsip Lama dan langsung normalisasi kuncinya untuk perbandingan.
  const folderArsip = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP]);
  const files = folderArsip.getFilesByName(archiveFileName);
  let mapDataKemarin = new Map();
  let fileArsip;
  if (files.hasNext()) {
    fileArsip = files.next();
    try {
      const archivedData = JSON.parse(fileArsip.getBlob().getDataAsString());
      // Normalisasi kunci dari data arsip lama untuk kompatibilitas mundur.
      const normalizedArchivedData = archivedData.map(([pk, data]) => [normalizePrimaryKey(pk), data]);
      mapDataKemarin = new Map(normalizedArchivedData);
    } catch (e) {
      console.warn(`Gagal parse arsip "${archiveFileName}": ${e.message}`);
    }
  }

  // ===== [LANGKAH 2: PERUBAHAN] =====
  // Baca Data Baru dan buat Map dengan kunci yang sudah dinormalisasi.
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
      // Gunakan PK yang sudah dinormalisasi sebagai kunci Map.
      const pkNormalized = normalizePrimaryKey(pk);
      const rowData = buatObjekData(row);
      // Penting: Simpan juga PK asli di dalam data untuk keperluan logging.
      rowData[primaryKeyHeader] = pk; 
      mapDataHariIni.set(pkNormalized, { data: rowData, hash: computeVmHash(rowData) });
    }
  });

  // ===== [LANGKAH 3: PERUBAHAN] =====
  // Bandingkan Data dan Siapkan Log menggunakan kunci yang sudah bersih.
  let logEntriesToAdd = [];
  const timestamp = new Date();
  const nameHeaderForLog = entityName === 'VM' ? KONSTANTA.HEADER_VM.VM_NAME : primaryKeyHeader;

  for (const [id, dataBaru] of mapDataHariIni.entries()) { // `id` di sini sudah dinormalisasi
    const dataLama = mapDataKemarin.get(id); // Cari di data lama menggunakan `id` yang sudah dinormalisasi
    const entityDisplayName = dataBaru.data[nameHeaderForLog] || id;
    const pkRawForLog = dataBaru.data[primaryKeyHeader]; // Ambil PK asli dari objek data untuk ditulis ke log

    if (!dataLama) {
      // PENAMBAHAN
      const detail = `${entityName} baru dibuat/ditemukan.`;
      // Gunakan PK asli (pkRawForLog) saat mencatat ke log.
      const logEntry = [timestamp, 'PENAMBAHAN', pkRawForLog, entityDisplayName, sheetName, '', '', detail];
      logEntriesToAdd.push(logEntry);
    } else if (dataBaru.hash !== dataLama.hash) {
      // MODIFIKASI
      if (dataLama && dataLama.data) {
        for (const key in dataBaru.data) {
          // Jangan catat perubahan pada kolom PK itu sendiri sebagai modifikasi.
          if(key === primaryKeyHeader) continue; 
          
          const oldValue = dataLama.data[key] || '';
          const newValue = dataBaru.data[key] || '';

          if (String(newValue) !== String(oldValue)) {
            const detail = `Kolom '${key}' diubah`;
            // Gunakan PK asli (pkRawForLog) saat mencatat ke log.
            const logEntry = [timestamp, 'MODIFIKASI', pkRawForLog, entityDisplayName, sheetName, oldValue, newValue, detail];
            logEntriesToAdd.push(logEntry);
          }
        }
      }
    }
    mapDataKemarin.delete(id); // Hapus dari map lama agar sisanya adalah data yang dihapus.
  }

  for (const [id, dataLama] of mapDataKemarin.entries()) { // `id` di sini sudah dinormalisasi
    // PENGHAPUSAN
    const entityDisplayName = (dataLama.data && dataLama.data[nameHeaderForLog]) || id;
    // Ambil PK asli dari data lama untuk dicatat di log.
    const pkRawForLog = (dataLama.data && dataLama.data[primaryKeyHeader]) || id;
    const detail = `${entityName} telah dihapus.`;
    const logEntry = [timestamp, 'PENGHAPUSAN', pkRawForLog, entityDisplayName, sheetName, '', '', detail];
    logEntriesToAdd.push(logEntry);
  }

  // 4. Catat Perubahan ke Log (Tidak ada perubahan di sini)
  if (logEntriesToAdd.length > 0) {
    sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logEntriesToAdd.length, 8).setValues(logEntriesToAdd);
    console.log(`${logEntriesToAdd.length} log perubahan untuk ${entityName} telah ditambahkan.`);
  }

  // ===== [LANGKAH 5: PERUBAHAN] =====
  // Simpan Arsip Baru dengan kunci yang sudah dinormalisasi.
  const dataUntukArsip = JSON.stringify(Array.from(mapDataHariIni.entries()));
  if (fileArsip) {
    fileArsip.setContent(dataUntukArsip);
  } else {
    folderArsip.createFile(archiveFileName, dataUntukArsip, MimeType.PLAIN_TEXT);
  }
  console.log(`Pengarsipan ${entityName} selesai.`);
  
  return logEntriesToAdd;
}
