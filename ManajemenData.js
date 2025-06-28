// ===== FILE: ManajemenData.gs =====

/**
 * Menjalankan alur kerja sinkronisasi penuh: menyalin data VM dan Datastore,
 * lalu menjalankan laporan perubahan harian dan pemeriksaan datastore.
 * [PERBAIKAN] Menambahkan pesan awal yang informatif untuk membedakan dari /laporan.
 */
function syncDanBuatLaporanHarian(showUiAlert = true) {
  const config = bacaKonfigurasi(); // Baca config di awal untuk mengirim pesan

  // Kirim pesan konfirmasi awal yang informatif ke Telegram
  try {
    const startTime = new Date();
    const timestamp = startTime.toLocaleString('id-ID', { timeZone: "Asia/Jakarta", hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp}</b>\n\n`;
    pesanAwal += `⚙️ Memulai sinkronisasi penuh & pembuatan laporan...\n`;
    pesanAwal += `<i>Proses ini akan menyalin data terbaru dari sumber sebelum membuat laporan dan mungkin memerlukan waktu beberapa menit.</i>`;
    
    kirimPesanTelegram(pesanAwal, config, 'HTML');

  } catch (e) {
    console.error(`Gagal mengirim pesan awal untuk /sync_laporan: ${e.message}`);
    // Jangan hentikan proses utama jika hanya pengiriman pesan awal yang gagal
  }

  // Lanjutkan dengan proses utama
  if (showUiAlert && SpreadsheetApp.getActiveSpreadsheet().getUi()) {
    showUiFeedback("Proses Dimulai", "Mengimpor semua data dan membuat laporan. Proses ini bisa memakan waktu beberapa menit...");
  }

  try {
    // Gunakan konstanta dari file Anda
    const sumberIdKey = KONSTANTA.KUNCI_KONFIG.ID_SUMBER; 
    const sheetVmKey = KONSTANTA.KUNCI_KONFIG.SHEET_VM;
    const sheetDsKey = KONSTANTA.KUNCI_KONFIG.SHEET_DS;
    
    // Pastikan kunci konfigurasi ada sebelum digunakan
    if (!config[sumberIdKey]) throw new Error("Konfigurasi SUMBER_SPREADSHEET_ID tidak ditemukan.");
    if (!config[sheetVmKey]) throw new Error("Konfigurasi NAMA_SHEET_DATA_UTAMA tidak ditemukan.");

    console.log(`Memulai sinkronisasi untuk sheet: ${config[sheetVmKey]}`);
    salinDataSheet(config[sheetVmKey], config[sumberIdKey]);

    if (config[sheetDsKey]) {
      console.log(`Memulai sinkronisasi untuk sheet: ${config[sheetDsKey]}`);
      salinDataSheet(config[sheetDsKey], config[sumberIdKey]);
    }
    
    // Memastikan pemanggilan fungsi ini benar
    buatLaporanHarianVM();
    jalankanPemeriksaanDatastore();
    
    if (showUiAlert) {
      showUiFeedback("Sukses!", "Semua data telah diimpor dan semua laporan telah diproses.");
    }
  } catch (e) {
    console.error(`ERROR UTAMA di syncDanBuatLaporanHarian: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`<b>❌ Proses /sync_laporan Gagal</b>\n\nTerjadi kesalahan saat sinkronisasi data atau pembuatan laporan.\n<code>${escapeHtml(e.message)}</code>`, config, 'HTML');
    if (showUiAlert) {
      showUiFeedback("Terjadi Error", `Proses dihentikan. Error: ${e.message}`);
    }
    // Lemparkan error kembali agar bisa ditangkap oleh log eksekusi Apps Script
    throw new Error(`Error saat menjalankan syncDanBuatLaporanHarian: ${e.message}`);
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
 * Mencari informasi VM berdasarkan kata kunci dan mengirimkan hasilnya.
 * [DIREFACTOR] Mencari informasi VM, kini sepenuhnya menggunakan konstanta.
 * [PERBAIKAN] Memperbaiki logika pengiriman pesan ganda dan error ekspor.
*/
function findVmAndGetInfo(searchTerm, config, userData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  if (!sheet || sheet.getLastRow() <= 1) {
    kirimPesanTelegram('❌ Data VM tidak ditemukan atau sheet kosong.', config);
    return;
  }
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
  const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
  const ipIndex = headers.indexOf(KONSTANTA.HEADER_VM.IP);

  if (pkIndex === -1 || nameIndex === -1 || ipIndex === -1) {
    let missingCols = [];
    if(pkIndex === -1) missingCols.push(`'${KONSTANTA.HEADER_VM.PK}'`);
    if(nameIndex === -1) missingCols.push(`'${KONSTANTA.HEADER_VM.VM_NAME}'`);
    if(ipIndex === -1) missingCols.push(`'${KONSTANTA.HEADER_VM.IP}'`);
    kirimPesanTelegram(`❌ Konfigurasi error: Kolom ${missingCols.join(', ')} tidak ditemukan di header.`, config);
    return;
  }

  const allData = sheet.getDataRange().getValues();
  const searchLower = searchTerm.toLowerCase();
  let results = [];

  for (let i = 1; i < allData.length; i++) {
    const row = allData[i];
    const vmPk = String(row[pkIndex] || '').toLowerCase();
    const vmName = String(row[nameIndex] || '').toLowerCase();
    const vmIp = String(row[ipIndex] || '').toLowerCase();

    if (vmPk.includes(searchLower) || vmName.includes(searchLower) || vmIp.includes(searchLower)) {
      results.push(row);
    }
  }
  
  if (results.length === 1) {
    const rowData = results[0];
    const vmData = {};
    headers.forEach((header, index) => vmData[header] = rowData[index]);

    const pk = vmData[KONSTANTA.HEADER_VM.PK];
    let info = `✅ Data ditemukan untuk "<b>${escapeHtml(searchTerm)}</b>"\n`;
    info += `------------------------------------\n`;
    
    const orderedLabels = [
        KONSTANTA.HEADER_VM.VM_NAME, KONSTANTA.HEADER_VM.PK, KONSTANTA.HEADER_VM.IP, 
        KONSTANTA.HEADER_VM.STATE, KONSTANTA.HEADER_VM.UPTIME, KONSTANTA.HEADER_VM.VCENTER, 
        KONSTANTA.HEADER_VM.CLUSTER, KONSTANTA.HEADER_VM.CPU, KONSTANTA.HEADER_VM.MEMORY, 
        KONSTANTA.HEADER_VM.PROV_GB, KONSTANTA.HEADER_VM.PROV_TB,
        KONSTANTA.HEADER_VM.KRITIKALITAS, KONSTANTA.HEADER_VM.KELOMPOK_APP, KONSTANTA.HEADER_VM.DEV_OPS
    ];
    orderedLabels.forEach(label => {
      if (vmData.hasOwnProperty(label)) {
        let value = vmData[label] || 'N/A';
        
        if (label === KONSTANTA.HEADER_VM.UPTIME && value && !isNaN(value)) value = `${value} hari`;
        if (label === KONSTANTA.HEADER_VM.CPU && value && !isNaN(value)) value = `${value} vCPU`;
        if (label === KONSTANTA.HEADER_VM.MEMORY && value && !isNaN(value)) value = `${value} GB`;

        if (label === KONSTANTA.HEADER_VM.PK || label === KONSTANTA.HEADER_VM.IP) {
          info += `<b>${label}:</b> <code>${escapeHtml(value)}</code>\n`;
        } else {
          info += `<b>${label}:</b> ${escapeHtml(value)}\n`;
        }
      }
    });
    const inlineKeyboard = { inline_keyboard: [[{ text: "📜 Lihat Histori Perubahan", callback_data: `history_${pk}` }]] };
    kirimPesanTelegram(info, config, 'HTML', inlineKeyboard);

  } else if (results.length > 1) {
    let info = `✅ Ditemukan <b>${results.length}</b> hasil untuk "<b>${escapeHtml(searchTerm)}</b>".\n`;
    info += `------------------------------------\n`;
    
    // Tampilkan hingga 15 hasil teratas di pesan
    results.slice(0, 15).forEach((row, i) => { 
      const vmName = escapeHtml(row[nameIndex]);
      const vmIp = escapeHtml(row[ipIndex]);
      const vmPk = escapeHtml(row[pkIndex]);
      info += `${i + 1}. <b>${vmName}</b>\n   (<code>${vmIp}</code> | <code>${vmPk}</code>)\n`;
    });
    
    // Kirim pesan ringkasan terlebih dahulu
    kirimPesanTelegram(info, config, 'HTML');

    // Jika lebih dari 15, panggil fungsi ekspor yang sekarang akan otomatis mengirim pesan file
    if (results.length > 15) {
      // Kirim pesan bahwa proses ekspor sedang berjalan
      kirimPesanTelegram(`<i>Membuat file ekspor untuk ${results.length - 15} hasil lainnya...</i>`, config, 'HTML');
      exportResultsToSheet(headers, results, `Pencarian '${searchTerm}'`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
    }
    
  } else {
    // [PERBAIKAN] Pesan 'tidak ditemukan' menggunakan format HTML agar konsisten
    kirimPesanTelegram(`❌ VM dengan nama/IP/Primary Key yang mengandung "<b>${escapeHtml(searchTerm)}</b>" tidak ditemukan.`, config, 'HTML');
  }
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
 * [FUNGSI YANG DIPERBARUI SECARA TOTAL]
 * Mencari riwayat lengkap sebuah VM dengan mencari di sheet 'Log Perubahan' aktif
 * DAN di semua file arsip log JSON di Google Drive.
 */
function getVmHistory(pk, config, userData) {
  if (!pk) {
    kirimPesanTelegram("❌ Terjadi kesalahan: ID untuk melihat riwayat tidak valid atau kosong.", config);
    return;
  }

  try {
    kirimPesanTelegram(`🔍 Mencari riwayat lengkap untuk PK: <code>${escapeHtml(pk)}</code>...\n<i>Proses ini mungkin memerlukan beberapa saat jika riwayatnya panjang.</i>`, config, 'HTML');

    let combinedHistoryEntries = [];
    const pkTrimmed = pk.trim().toLowerCase();

    // --- 1. Cari di Sheet Log Aktif ---
    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
    let logHeaders = [];

    if (sheetLog && sheetLog.getLastRow() > 1) {
      const dataLog = sheetLog.getDataRange().getValues();
      logHeaders = dataLog.shift(); // Ambil header dan simpan
      const pkIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.PK);

      if (pkIndex !== -1) {
        dataLog.forEach(row => {
          if (row[pkIndex] && String(row[pkIndex]).trim().toLowerCase() === pkTrimmed) {
            combinedHistoryEntries.push(row);
          }
        });
      }
    } else if (sheetLog) {
      logHeaders = sheetLog.getRange(1, 1, 1, sheetLog.getLastColumn()).getValues()[0];
    }

    // --- 2. Cari di File Arsip JSON ---
    const FOLDER_ARSIP_ID = config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP];
    if (FOLDER_ARSIP_ID) {
      const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);
      const arsipFiles = folderArsip.getFiles();
      
      while (arsipFiles.hasNext()) {
        const file = arsipFiles.next();
        if (file.getName().startsWith('Arsip Log -') && file.getName().endsWith('.json')) {
          console.log(`Membaca file arsip: ${file.getName()}`);
          const jsonContent = file.getBlob().getDataAsString();
          const archivedLogs = JSON.parse(jsonContent);

          // Filter log dari file arsip ini
          const relevantLogs = archivedLogs.filter(log => 
            log[KONSTANTA.HEADER_VM.PK] && String(log[KONSTANTA.HEADER_VM.PK]).trim().toLowerCase() === pkTrimmed
          );

          // Ubah kembali dari objek ke array agar formatnya sama
          const relevantLogsAsArray = relevantLogs.map(logObject => logHeaders.map(header => logObject[header]));
          combinedHistoryEntries.push(...relevantLogsAsArray);
        }
      }
    }

    // --- 3. Proses dan Tampilkan Hasil Gabungan ---
    if (combinedHistoryEntries.length === 0) {
      kirimPesanTelegram(`ℹ️ Tidak ada riwayat perubahan ditemukan untuk Primary Key <code>${escapeHtml(pk)}</code> baik di log aktif maupun di arsip.`, config, 'HTML');
      return;
    }

    // Urutkan semua hasil berdasarkan timestamp dari yang terbaru ke terlama
    combinedHistoryEntries.sort((a, b) => new Date(b[0]) - new Date(a[0]));

    const totalEntries = combinedHistoryEntries.length;
    const vmNameIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const currentVmName = combinedHistoryEntries[0][vmNameIndex] || 'Nama Tidak Ditemukan';
    
    let message = `<b>📜 Riwayat Lengkap untuk VM</b>\n`;
    message += `<b>${KONSTANTA.HEADER_VM.VM_NAME}:</b> ${escapeHtml(currentVmName)}\n`;
    message += `<b>${KONSTANTA.HEADER_VM.PK}:</b> <code>${escapeHtml(pk)}</code>\n`;
    message += `<i>Total ditemukan ${totalEntries} entri riwayat.</i>\n`;
    message += `------------------------------------\n\n`;

    // Jika hasil terlalu banyak, tampilkan ringkasan dan ekspor sisanya
    if (totalEntries > 8) {
      message += `Menampilkan 5 dari ${totalEntries} perubahan terakhir:\n\n`;
      const entriesToShow = combinedHistoryEntries.slice(0, 5);
      
      entriesToShow.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });

      message += `\n------------------------------------\n`;
      message += `<i>Riwayat terlalu panjang. Laporan lengkap sedang dibuat dalam file Google Sheet...</i>`;
      kirimPesanTelegram(message, config, 'HTML');

      // Panggil fungsi ekspor untuk membuat laporan lengkap
      exportResultsToSheet(logHeaders, combinedHistoryEntries, `Riwayat Lengkap - ${pk}`, config, userData, KONSTANTA.HEADER_LOG.ACTION);

    } else {
      // Jika hasil cukup sedikit, tampilkan semua
      combinedHistoryEntries.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });
      kirimPesanTelegram(message, config, 'HTML');
    }

  } catch (e) {
    console.error(`Gagal total saat getVmHistory: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`❌ Terjadi kesalahan teknis saat mencoba mengambil riwayat lengkap. Silakan coba lagi.\nError: ${e.message}`, config);
  }
}

/**
 * [FUNGSI HELPER BARU]
 * Memformat satu baris entri log menjadi teks yang rapi.
 */
function formatHistoryEntry(entry, headers) {
  let formattedText = "";
  const timestamp = new Date(entry[headers.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP)]).toLocaleString('id-ID', { timeZone: "Asia/Jakarta", day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const action = entry[headers.indexOf(KONSTANTA.HEADER_LOG.ACTION)];
  const oldValue = entry[headers.indexOf(KONSTANTA.HEADER_LOG.OLD_VAL)];
  const newValue = entry[headers.indexOf(KONSTANTA.HEADER_LOG.NEW_VAL)];
  const detail = entry[headers.indexOf(KONSTANTA.HEADER_LOG.DETAIL)];

  formattedText += `<b>🗓️ ${escapeHtml(timestamp)}</b>\n`;
  formattedText += `<b>Aksi:</b> ${escapeHtml(action)}\n`;
  if (action === 'MODIFIKASI') {
    const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
    formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
    formattedText += `   - Lama: <code>${escapeHtml(oldValue || 'Kosong')}</code>\n`;
    formattedText += `   - Baru: <code>${escapeHtml(newValue || 'Kosong')}</code>\n\n`;
  } else {
    formattedText += `   <i>Detail: ${escapeHtml(detail)}</i>\n\n`;
  }
  return formattedText;
}

/**
 * Mengambil semua log perubahan yang terjadi pada hari ini.
 */
function getTodaysHistory(config, userData) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    kirimPesanTelegram("ℹ️ Tidak ada data log perubahan yang ditemukan sama sekali.", config);
    return;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0); 
  
  const allLogData = sheetLog.getDataRange().getValues();
  const todaysLogEntries = allLogData.filter((row, index) => {
    if (index === 0) return false; // Lewati baris header
    return new Date(row[0]) >= todayStart;
  });

  const todayStr = now.toLocaleDateString('id-ID', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});

  if (todaysLogEntries.length === 0) {
    kirimPesanTelegram(`✅ Tidak ada perubahan yang tercatat pada hari ini, ${todayStr}.`, config);
    return;
  }
  
  let message = `<b>📜 Log Perubahan Hari Ini</b>\n<i>${todayStr}</i>\nTotal Entri: ${todaysLogEntries.length}\n`;
  message += `------------------------------------\n\n`;
  
  let inlineKeyboard = null;
  const logHeaders = allLogData[0];

  if (todaysLogEntries.length > 15) {
    message += "Ditemukan lebih dari 15 entri perubahan hari ini. Untuk detail lengkap, silakan unduh file terlampir.";
    const fileUrl = exportResultsToSheet(logHeaders, todaysLogEntries, `Log Harian`, config, userData);
    if (fileUrl) {
      inlineKeyboard = { inline_keyboard: [[{ text: `📄 Lihat Semua ${todaysLogEntries.length} Log di Sheet`, url: fileUrl }]] };
    }
  } else {
    // [REFACTOR] Menggunakan konstanta untuk mencari indeks header
    const timestampIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP);
    const actionIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.ACTION);
    const vmNameIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const oldValueIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.OLD_VAL);
    const newValueIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.NEW_VAL);
    const detailIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.DETAIL);

    todaysLogEntries.forEach(entry => {
      const timestamp = new Date(entry[timestampIndex]).toLocaleTimeString('id-ID', {timeZone: "Asia/Jakarta"});
      const action = entry[actionIndex];
      const vmName = entry[vmNameIndex];
      const oldValue = entry[oldValueIndex];
      const newValue = entry[newValueIndex];
      const detail = entry[detailIndex];
      
      let icon = '⚙️';
      if (action.includes('PENAMBAHAN') || action.includes('BARU')) icon = '✅';
      else if (action.includes('PENGHAPUSAN') || action.includes('DIHAPUS')) icon = '❌';
      else if (action.includes('MODIFIKASI') || action.includes('DIUBAH')) icon = '✏️';

      message += `<b>${icon} [${timestamp}]</b> - <b>${escapeHtml(vmName)}</b>\n`;
      message += `   <i>Aksi: ${escapeHtml(action)}</i>\n`;

      if (action.includes('MODIFIKASI') || action.includes('DIUBAH')) {
          message += `   <b>Detail:</b> ${escapeHtml(detail)}\n`;
          message += `   - Lama: <code>${escapeHtml(oldValue || 'N/A')}</code>\n`;
          message += `   - Baru: <code>${escapeHtml(newValue || 'N/A')}</code>\n\n`;
      } else {
          message += `   <i>Detail: ${escapeHtml(detail)}</i>\n\n`;
      }
    });
  }
  kirimPesanTelegram(message, config, 'HTML', inlineKeyboard);
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
      finalMessage += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>`;
  
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
 * [FUNGSI PUSAT BARU] Mengendalikan semua permintaan ekspor dari menu interaktif.
 */
function handleExportRequest(exportType, config, userData) {
  try {
    kirimPesanTelegram(`⚙️ Permintaan ekspor diterima. Sedang memproses data...`, config);

    let headers, data, title, highlightColumn = null;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Menggunakan switch-case untuk mencocokkan nilai callback yang pasti
    switch (exportType) {
      // --- Kasus untuk Log ---
      case KONSTANTA.CALLBACK.EXPORT_LOG_TODAY:
      case KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS:
      case KONSTANTA.CALLBACK.EXPORT_LOG_30_DAYS: {
        const logSheet = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
        if (!logSheet) throw new Error(`Sheet '${KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN}' tidak ditemukan.`);
        
        headers = logSheet.getRange(1, 1, 1, logSheet.getLastColumn()).getValues()[0];
        const allLogData = logSheet.getLastRow() > 1 ? logSheet.getRange(2, 1, logSheet.getLastRow() - 1, logSheet.getLastColumn()).getValues() : [];
        const now = new Date();
        let startDate = new Date();
        
        if (exportType === KONSTANTA.CALLBACK.EXPORT_LOG_TODAY) {
            startDate.setHours(0, 0, 0, 0);
            title = "Log Perubahan Hari Ini";
        } else if (exportType === KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS) {
            startDate.setDate(now.getDate() - 7);
            title = "Log Perubahan 7 Hari Terakhir";
        } else {
            startDate.setDate(now.getDate() - 30);
            title = "Log Perubahan 30 Hari Terakhir";
        }
        data = allLogData.filter(row => row.length > 0 && new Date(row[0]) >= startDate);
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

    if (data && headers) {
        if (data.length > 0) {
            const fileUrl = exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
            if (fileUrl) {
                const userMention = `<a href="tg://user?id=${userData.userId}">${escapeHtml(userData.firstName || 'Pengguna')}</a>`;
                kirimPesanTelegram(`${userMention}, file ekspor Anda untuk "<b>${title}</b>" sudah siap.\n\nFile ini telah dibagikan secara pribadi ke email Anda yang terdaftar.\n\n<a href="${fileUrl}">Buka File Laporan</a>`, config, 'HTML');
            }
        } else {
            kirimPesanTelegram(`ℹ️ Tidak ada data yang dapat diekspor untuk kategori "<b>${title}</b>".`, config);
        }
    } else {
        console.warn(`Tidak ada data atau header yang dihasilkan untuk tipe ekspor: ${exportType}`);
    }

  } catch (e) {
      console.error(`Gagal menangani permintaan ekspor: ${e.message}\nStack: ${e.stack}`);
      kirimPesanTelegram(`⚠️ Terjadi kesalahan saat memproses permintaan ekspor Anda.\n<code>${escapeHtml(e.message)}</code>`, config);
  }
}

/**
 * FUNGSI UTAMA PENGARSIPAN
 * Tugasnya adalah memindahkan log lama ke file JSON dan membersihkan sheet.
 * Fungsi ini dipanggil oleh fungsi cekDanArsipkanLogJikaPenuh().
 */
function jalankanPengarsipanLogKeJson() {
  const config = bacaKonfigurasi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    console.log("Tidak ada log untuk diarsipkan.");
    return;
  }

  const FOLDER_ARSIP_ID = config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP];
  if (!FOLDER_ARSIP_ID) {
    throw new Error("Folder ID untuk arsip belum diatur di Konfigurasi.");
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

    const pesanSukses = `✅ Pengarsipan log otomatis berhasil.\n\nSebanyak ${allLogData.length} baris log telah dipindahkan ke file "${namaFileArsip}" karena telah melebihi ambang batas.`;
    kirimPesanTelegram(pesanSukses, config);
    console.log(pesanSukses);

  } catch (e) {
    const pesanGagal = `❌ Gagal melakukan pengarsipan log otomatis. Error: ${e.message}\nStack: ${e.stack}`;
    kirimPesanTelegram(pesanGagal, config);
    console.error(pesanGagal);
  }
}

/**
 * FUNGSI PENGECЕK
 * Fungsi ini akan dijalankan oleh pemicu harian.
 * Tugasnya adalah memeriksa jumlah baris dan memanggil fungsi pengarsipan jika perlu.
 */
function cekDanArsipkanLogJikaPenuh() {
  const BATAS_BARIS = 5000; // Arsipkan jika baris sudah lebih dari 5000

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (!sheetLog) {
    console.error("Sheet 'Log Perubahan' tidak ditemukan. Pengecekan dibatalkan.");
    return;
  }

  const jumlahBaris = sheetLog.getLastRow();
  console.log(`Pengecekan jumlah baris log: ${jumlahBaris} baris.`);

  if (jumlahBaris > BATAS_BARIS) {
    console.log(`Jumlah baris (${jumlahBaris}) melebihi batas (${BATAS_BARIS}). Memulai proses pengarsipan...`);
    // Panggil fungsi pengarsipan utama
    jalankanPengarsipanLogKeJson(); 
  } else {
    console.log("Jumlah baris masih di bawah ambang batas. Tidak ada tindakan yang diambil.");
  }
}
