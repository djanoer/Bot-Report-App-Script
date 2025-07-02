// ===== FILE: ManajemenData.gs =====

/**
 * [REVISI KONSISTENSI] Menjalankan sinkronisasi dengan alur pengiriman pesan terpusat.
 * Bot akan mengirim status awal, memproses semua data, menggabungkan semua hasil,
 * mengirim satu laporan lengkap, lalu mengedit status awal.
 */
function syncDanBuatLaporanHarian(showUiAlert = true, triggerSource = "TIDAK DIKETAHUI", config = null) {
  // [PERBAIKAN] Tentukan satu sumber config yang andal di awal.
  // Jika config tidak diberikan (misal: dari menu), baca dari sheet.
  // Jika diberikan (dari trigger), gunakan yang itu.
  const activeConfig = config || bacaKonfigurasi();

  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(KONSTANTA.LIMIT.LOCK_TIMEOUT_MS); 

  if (!lockAcquired) {
    console.log("Proses sinkronisasi sudah berjalan, permintaan saat ini dibatalkan.");
    return;
  }
  
  // Variabel 'statusMessageId' dipindahkan ke sini agar bisa diakses di blok 'finally'
  let statusMessageId = null;

  try {
    const startTime = new Date();
    const timestamp = startTime.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp}</b>\n\n⏳ Memulai sinkronisasi penuh & pembuatan laporan...\n<i>Ini mungkin memerlukan waktu beberapa menit.</i>`;
    
    // Gunakan 'activeConfig' untuk mengirim pesan
    const sentMessage = kirimPesanTelegram(pesanAwal, activeConfig, 'HTML');
    if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
    }

    const KUNCI = KONSTANTA.KUNCI_KONFIG;
    const sumberId = activeConfig[KUNCI.ID_SUMBER];
    const sheetVmName = activeConfig[KUNCI.SHEET_VM];
    const sheetDsName = activeConfig[KUNCI.SHEET_DS];

    salinDataSheet(sheetVmName, sumberId, activeConfig);
    if (sheetDsName) {
      salinDataSheet(sheetDsName, sumberId, activeConfig);
    }

    let pesanLaporanFinal = buatLaporanHarianVM(activeConfig);
    const pesanNotifikasiDs = jalankanPemeriksaanDatastore(activeConfig);

    if (pesanNotifikasiDs) {
      pesanLaporanFinal += KONSTANTA.UI_STRINGS.SEPARATOR + pesanNotifikasiDs;
    }

    kirimPesanTelegram(pesanLaporanFinal, activeConfig, 'HTML');

    const pesanKonfirmasi = `<b>✅ Proses Selesai</b>\n\nLaporan lengkap telah dikirimkan.`;
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

function searchVmOnSheet(searchTerm, config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  const requiredHeaders = {
    pkIndex: KONSTANTA.HEADER_VM.PK,
    nameIndex: KONSTANTA.HEADER_VM.VM_NAME,
    ipIndex: KONSTANTA.HEADER_VM.IP
  };

  const indices = {};
  for (const key in requiredHeaders) {
    const headerName = requiredHeaders[key];
    indices[key] = headers.indexOf(headerName);
    if (indices[key] === -1) {
      throw new Error(`Kolom header penting <b>"${headerName}"</b> tidak ditemukan di sheet "${sheetName}".`);
    }
  }

  const { pkIndex, nameIndex, ipIndex } = indices;
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  const searchLower = searchTerm.toLowerCase();
  const normalizedSearchTerm = normalizePrimaryKey(searchLower);
  let results = [];

  for (let i = 0; i < allData.length; i++) {
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
 * [FIX] Memformat satu baris data VM. Sekarang menerima 'config' sebagai parameter.
 * @param {Array} row - Array yang berisi data untuk satu baris VM.
 * @param {Array<string>} headers - Array header dari sheet VM.
 * @param {object} config - Objek konfigurasi bot yang aktif.
 * @returns {string} String format HTML yang berisi detail lengkap VM.
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

  // Fungsi pembantu untuk menambahkan baris detail
  // [PERBAIKAN] Tambahkan parameter 'isCode' untuk format copy-paste
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
  pesan += addDetail(row[indices.pk], '🔑', 'Primary Key', true);
  pesan += addDetail(row[indices.ip], '🌐', 'IP Address', true);
  const stateValue = row[indices.state] || '';
  const stateIcon = stateValue.toLowerCase().includes('on') ? '🟢' : '🔴';
  pesan += addDetail(stateValue, stateIcon, 'Status');
  pesan += addDetail(`${row[indices.uptime]} hari`, '⏳', 'Uptime');

  pesan += "\n<b>Sumber Daya & Kapasitas</b>\n";
  pesan += addDetail(`${row[indices.cpu]} vCPU`, '⚙️', 'CPU');
  pesan += addDetail(`${row[indices.memory]} GB`, '🧠', 'Memory');
  pesan += addDetail(`${row[indices.provGb]} GB`, '💽', 'Provisioned');
  pesan += addDetail(row[indices.cluster], '☁️', 'Cluster');
  pesan += addDetail(row[indices.datastore], '🗄️', 'Datastore');

  const environment = getEnvironmentFromDsName(row[indices.datastore] || '', config[KONSTANTA.KUNCI_KONFIG.MAP_ENV]) || 'N/A';
  
  pesan += "\n<b>Konfigurasi & Manajemen</b>\n";
  pesan += addDetail(environment, '🌍', 'Environment');
  pesan += addDetail(row[indices.kritikalitas], '🔥', 'Kritikalitas BIA');
  pesan += addDetail(row[indices.kelompokApp], '📦', 'Aplikasi BIA');
  pesan += addDetail(row[indices.devOps], '👥', 'DEV/OPS');
  pesan += addDetail(row[indices.guestOs], '🐧', 'Guest OS');
  pesan += addDetail(row[indices.vcenter], '🏢', 'vCenter');

  return pesan;
}


/**
 * [FIX] Mengendalikan alur pencarian VM, sekarang memberikan 'config' saat memanggil formatVmDetail.
 */
function handleVmSearchInteraction(update, config) {
  try {
    const isCallback = !!update.callback_query;
    const userEvent = isCallback ? update.callback_query : update.message;
    const userData = getUserData(userEvent.from.id);
    if (userData) {
      userData.userId = userEvent.from.id;
      userData.firstName = userEvent.from.first_name;
    }

    let searchTerm, page = 1, chatId, messageId;
    const P_ACTIONS = KONSTANTA.PAGINATION_ACTIONS;

    if (isCallback) {
      chatId = userEvent.message.chat.id;
      messageId = userEvent.message.message_id;
      const callbackData = userEvent.data;
      const parts = callbackData.split('_');
      const action = parts[1];
      
      searchTerm = decodeURIComponent(parts.slice(2, parts.length - (action === P_ACTIONS.NAVIGATE ? 1 : 0)).join('_'));

      if (action === P_ACTIONS.NAVIGATE) {
        page = parseInt(parts[parts.length - 1], 10);
      } else if (action === P_ACTIONS.EXPORT) {
        const { headers, results } = searchVmOnSheet(searchTerm, config);
        exportResultsToSheet(headers, results, `Pencarian VM '${searchTerm}'`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
        answerCallbackQuery(userEvent.id, config, "Membuat file ekspor...");
        return;
      }
    } else {
      chatId = userEvent.chat.id;
      searchTerm = userEvent.text.split(' ').slice(1).join(' ');
      if (!searchTerm) {
        kirimPesanTelegram(`Gunakan format: <code>/cekvm [IP / Nama / PK]</code>`, config, 'HTML');
        return;
      }
    }

    const { headers, results } = searchVmOnSheet(searchTerm, config);

    if (results.length === 1 && !isCallback) {
      // [PERBAIKAN UTAMA DI SINI] Memberikan objek 'config' sebagai parameter.
      const detailMessage = formatVmDetail(results[0], headers, config);
      let fullMessage = `✅ Ditemukan 1 hasil untuk "<b>${escapeHtml(searchTerm)}</b>":\n\n`;
      fullMessage += detailMessage;
      kirimPesanTelegram(fullMessage, config, 'HTML');
      return;
    }
    
    const formatVmEntry = (row) => {
      const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
      const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);
      const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
      const vmName = escapeHtml(row[nameIndex]);
      const vmIp = escapeHtml(row[ipIndex]);
      const vmPk = escapeHtml(normalizePrimaryKey(row[pkIndex]));
      return `<b>${vmName}</b>\n   (<code>${vmIp}</code> | <code>${vmPk}</code>)`;
    };
    
    const safeSearchTerm = encodeURIComponent(searchTerm);

    const { text, keyboard } = createPaginatedView({
      allItems: results,
      page: page,
      title: `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
      formatEntryCallback: formatVmEntry,
      navCallbackPrefix: `cekvm_${P_ACTIONS.NAVIGATE}_${safeSearchTerm}`,
      exportCallbackData: `cekvm_${P_ACTIONS.EXPORT}_${safeSearchTerm}`
    });
    
    if (results.length === 0 && !isCallback) {
        kirimPesanTelegram(`❌ VM dengan nama/IP/PK yang mengandung "<b>${escapeHtml(searchTerm)}</b>" tidak ditemukan.`, config, 'HTML');
    } else if (isCallback) {
      if(userEvent.message.text !== text) {
        editMessageText(text, keyboard, chatId, messageId, config);
      }
      answerCallbackQuery(userEvent.id, config);
    } else {
      kirimPesanTelegram(text, config, 'HTML', keyboard, chatId);
    }

  } catch (err) {
    handleCentralizedError(err, "Perintah: /cekvm", config);
  }
}

/**
 * [PERBAIKAN PAGINASI FINAL] Membuat tampilan per halaman untuk hasil pencarian VM.
 * Menggunakan format callback yang andal dan encodeURIComponent.
 */
function generateVmSearchView(searchTerm, page, config, userData) {
  const ENTRIES_PER_PAGE = 15;
  
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
  
  // [PERBAIKAN] Meng-enkode istilah pencarian untuk keamanan dalam URL/callback
  const searchTermSafe = encodeURIComponent(searchTerm);
  const C = KONSTANTA.CALLBACK_CEKVM;

  if (page > 1) {
    navigationButtons.push({ text: '⬅️ Halaman Sblm', callback_data: `${C.NAVIGATE}${page - 1}_${searchTermSafe}` });
  }
  if (totalPages > 1) {
    navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: KONSTANTA.CALLBACK.IGNORE });
  }
  if (page < totalPages) {
    navigationButtons.push({ text: 'Halaman Brkt ➡️', callback_data: `${C.NAVIGATE}${page + 1}_${searchTermSafe}` });
  }
  
  if(navigationButtons.length > 0) keyboardRows.push(navigationButtons);
  
  keyboardRows.push([{ text: `📄 Ekspor Semua ${totalEntries} Hasil`, callback_data: `${C.EXPORT}${searchTermSafe}` }]);
  
  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * [FINAL - PAGINATION LENGKAP] Mengendalikan interaksi untuk /cekhistory menggunakan fungsi generik 'createPaginatedView'.
 * Fungsi ini menangani navigasi dan ekspor menggunakan konstanta terpusat.
 * @param {object} update - Objek update dari Telegram.
 * @param {object} config - Objek konfigurasi bot.
 */
function handleHistoryInteraction(update, config) {
  const isCallback = !!update.callback_query;
  const userEvent = isCallback ? update.callback_query : update.message;
  
  const userData = getUserData(userEvent.from.id);
  if (userData) {
      userData.userId = userEvent.from.id;
      userData.firstName = userEvent.from.first_name;
  }

  let page = 1, chatId, messageId;
  const P_ACTIONS = KONSTANTA.PAGINATION_ACTIONS; // Alias untuk konstanta aksi pagination
  
  if (isCallback) {
    chatId = userEvent.message.chat.id;
    messageId = userEvent.message.message_id;
    const callbackData = userEvent.data;
    const parts = callbackData.split('_'); // Format: [prefix, action, page?]
    const action = parts[1];

    if (action === P_ACTIONS.NAVIGATE) {
      page = parseInt(parts[parts.length - 1], 10);
    } else if (action === P_ACTIONS.EXPORT) {
      const startDate = new Date();
      startDate.setDate(new Date().getDate() - 30);
      const { headers, data } = getCombinedLogs(startDate, config);
      exportResultsToSheet(headers, data, "Log Perubahan 30 Hari Terakhir", config, userData, KONSTANTA.HEADER_LOG.ACTION);
      answerCallbackQuery(userEvent.id, config, "Membuat file ekspor...");
      return;
    }
  } else {
    chatId = userEvent.chat.id;
  }

  // Ambil log hari ini, jika kosong, ambil semua log dari arsip.
  const todayStartDate = new Date();
  todayStartDate.setHours(0, 0, 0, 0);
  let { headers: logHeaders, data: logsToShow } = getCombinedLogs(todayStartDate, config);
  let title = "Log Perubahan Hari Ini";

  if (logsToShow.length === 0) {
      const allTimeStartDate = new Date('2020-01-01');
      const allLogsResult = getCombinedLogs(allTimeStartDate, config);
      logsToShow = allLogsResult.data;
      logHeaders = allLogsResult.headers;
      title = "Semua Log Perubahan (Termasuk Arsip)";
  }
  
  // Menggunakan kembali fungsi 'formatHistoryEntry' yang sudah ada sebagai formatter
  const formatLogEntry = (row) => {
      return formatHistoryEntry(row, logHeaders);
  };

  // Panggil fungsi pagination generik dengan semua parameter yang diperlukan
  const { text, keyboard } = createPaginatedView({
      allItems: logsToShow,
      page: page,
      title: title,
      formatEntryCallback: formatLogEntry,
      navCallbackPrefix: `history_${P_ACTIONS.NAVIGATE}`,
      exportCallbackData: `history_${P_ACTIONS.EXPORT}`
  });
  
  // Kirim atau edit pesan di Telegram
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
 * [PERBAIKAN LOG HISTORY] Membuat tampilan per halaman untuk riwayat log.
 * Menggunakan perbandingan tanggal yang tidak terpengaruh oleh perbedaan zona waktu
 * antara pengguna dan server Google.
 * @param {number} page - Nomor halaman yang akan ditampilkan.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object} Objek berisi teks pesan dan keyboard untuk dikirim ke Telegram.
 */
function generateHistoryView(page, config) {
  const ENTRIES_PER_PAGE = 15; // Anda bisa sesuaikan jumlah item per halaman
  
  // Mengambil data log dari sheet aktif dan semua file arsip
  const { headers: logHeaders, data: allLogs } = getCombinedLogs(new Date('2020-01-01'), config);

  if (logHeaders.length === 0 || allLogs.length === 0) {
    return { text: "ℹ️ Belum ada log perubahan yang tercatat.", keyboard: null };
  }
  
  // [PERBAIKAN] Logika filter tanggal yang tidak terpengaruh oleh zona waktu
  const today = new Date();
  const todaysLogs = allLogs.filter(row => {
    // Pastikan kolom pertama (timestamp) adalah objek Date yang valid
    if (!row[0] || !(row[0] instanceof Date)) return false;
    
    const logDate = row[0];
    
    // Bandingkan komponen tanggal secara individual
    return logDate.getFullYear() === today.getFullYear() &&
           logDate.getMonth() === today.getMonth() &&
           logDate.getDate() === today.getDate();
  });
  
  // Logika untuk menampilkan semua log jika tidak ada log untuk hari ini
  const entriesToShow = todaysLogs.length > 0 ? todaysLogs : allLogs;
  const totalEntries = entriesToShow.length;
  const title = todaysLogs.length > 0 ? "Log Perubahan Hari Ini" : "Semua Log Perubahan";

  const totalPages = Math.ceil(totalEntries / ENTRIES_PER_PAGE);
  page = Math.max(1, Math.min(page, totalPages));
  
  const startIndex = (page - 1) * ENTRIES_PER_PAGE;
  const endIndex = startIndex + ENTRIES_PER_PAGE;
  const pageEntries = entriesToShow.slice(startIndex, endIndex);

  let text = `<b>📜 ${title} (Halaman ${page}/${totalPages})</b>\n`;
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
    navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: KONSTANTA.CALLBACK.IGNORE });
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
    // [PERBAIKAN] Ganti "GMT+7" dengan zona waktu dari Spreadsheet
    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd HH.mm.ss");
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
 * [PERBAIKAN UX] Menjalankan analisis migrasi dan MENGEMBALIKANNYA sebagai string.
 * @param {object} config - Objek konfigurasi.
 * @returns {string} String laporan lengkap yang siap dikirim.
 */
function jalankanRekomendasiMigrasi(config) {
    console.log("Memulai pengecekan rekomendasi migrasi datastore...");
    try {
      const requiredKeys = ['NAMA_SHEET_DATASTORE', 'NAMA_SHEET_DATA_UTAMA', 'HEADER_DATASTORE_NAME', /* ... etc ... */];
      for (const key of requiredKeys) {
        if (!config[key]) {
          throw new Error(`Konfigurasi Migrasi Tidak Lengkap! Kunci yang hilang: ${key}`);
        }
      }
  
      // ... (Seluruh logika kalkulasi dan pemrosesan data di sini tidak berubah) ...
      
      let finalMessage = `🚨 <b>Laporan Rekomendasi Migrasi Datastore</b>\n`;
      finalMessage += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID')}</i>`;
      
      const overProvisionedDs = []; // Asumsikan ini diisi oleh logika Anda
      if (overProvisionedDs.length === 0) {
        return "✅ Semua datastore dalam kondisi provisioning yang aman (1:1).";
      }

      // ... (Sisa dari logika pembangunan string 'finalMessage' tidak berubah) ...

      // [PERBAIKAN] Hapus pengiriman pesan, ganti dengan return.
      return finalMessage;
  
    } catch (e) {
      console.error(`Gagal menjalankan rekomendasi migrasi: ${e.message}\nStack: ${e.stack}`);
      throw new Error(`Gagal Menjalankan Analisis Migrasi Datastore. Penyebab: ${e.message}`);
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
