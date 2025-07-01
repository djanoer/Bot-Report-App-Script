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
 * Mencari informasi VM berdasarkan kata kunci dan mengirimkan hasilnya.
 * [DIREFACTOR] Mencari informasi VM, kini sepenuhnya menggunakan konstanta.
 * [PERBAIKAN] Memperbaiki logika pengiriman pesan ganda dan error ekspor.
 * [DIPERBARUI] Menambahkan informasi Guest OS ke dalam detail VM.
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

  // Periksa kolom esensial
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
    
    // [PERUBAHAN] Menambahkan GUEST_OS ke dalam urutan tampilan
    const orderedLabels = [
        KONSTANTA.HEADER_VM.VM_NAME, KONSTANTA.HEADER_VM.PK, KONSTANTA.HEADER_VM.IP, 
        KONSTANTA.HEADER_VM.GUEST_OS,
        KONSTANTA.HEADER_VM.STATE, KONSTANTA.HEADER_VM.UPTIME, KONSTANTA.HEADER_VM.VCENTER, 
        KONSTANTA.HEADER_VM.CLUSTER, KONSTANTA.HEADER_VM.CPU, KONSTANTA.HEADER_VM.MEMORY, 
        KONSTANTA.HEADER_VM.PROV_GB, KONSTANTA.HEADER_VM.PROV_TB,
        KONSTANTA.HEADER_VM.KRITIKALITAS, KONSTANTA.HEADER_VM.KELOMPOK_APP, KONSTANTA.HEADER_VM.DEV_OPS
    ];

    orderedLabels.forEach(label => {
      // Pastikan untuk memeriksa apakah kolom Guest OS ada di header sebelum mencoba menampilkannya
      if (vmData.hasOwnProperty(label)) {
        let value = vmData[label] || 'N/A';
        
        // Logika format tambahan
        if (label === KONSTANTA.HEADER_VM.UPTIME && value && !isNaN(value)) value = `${value} hari`;
        if (label === KONSTANTA.HEADER_VM.CPU && value && !isNaN(value)) value = `${value} vCPU`;
        if (label === KONSTANTA.HEADER_VM.MEMORY && value && !isNaN(value)) value = `${value} GB`;

        // Logika format pesan
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
    
    results.slice(0, 15).forEach((row, i) => { 
      const vmName = escapeHtml(row[nameIndex]);
      const vmIp = escapeHtml(row[ipIndex]);
      const vmPk = escapeHtml(row[pkIndex]);
      info += `${i + 1}. <b>${vmName}</b>\n   (<code>${vmIp}</code> | <code>${vmPk}</code>)\n`;
    });
    
    kirimPesanTelegram(info, config, 'HTML');

    if (results.length > 15) {
      kirimPesanTelegram(`<i>Membuat file ekspor untuk ${results.length - 15} hasil lainnya...</i>`, config, 'HTML');
      exportResultsToSheet(headers, results, `Pencarian '${searchTerm}'`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
    }
    
  } else {
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
    kirimPesanTelegram(`🔍 Mencari riwayat lengkap untuk PK: <code>${escapeHtml(pk)}</code>...\n<i>Ini mungkin memerlukan beberapa saat...</i>`, config, 'HTML');

    // Gunakan tanggal yang sangat lampau untuk mengambil SEMUA log
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

    // Filter semua log yang terkumpul berdasarkan PK yang dicari
    const pkTrimmed = pk.trim().toLowerCase();
    const historyEntries = allLogs.filter(row => 
      row[pkIndex] && String(row[pkIndex]).trim().toLowerCase() === pkTrimmed
    );

    if (historyEntries.length === 0) {
      kirimPesanTelegram(`ℹ️ Tidak ada riwayat perubahan ditemukan untuk Primary Key <code>${escapeHtml(pk)}</code>.`, config, 'HTML');
      return;
    }

    // Urutkan kembali berdasarkan tanggal dari yang terbaru (getCombinedLogs sudah mengurutkan, tapi ini untuk keamanan)
    const timestampIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP);
    historyEntries.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));

    const totalEntries = historyEntries.length;
    const vmNameIndex = logHeaders.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const currentVmName = historyEntries[0][vmNameIndex] || pk;
    
    let message = `<b>📜 Riwayat Lengkap untuk VM</b>\n`;
    message += `<b>${KONSTANTA.HEADER_VM.VM_NAME}:</b> ${escapeHtml(currentVmName)}\n`;
    message += `<b>${KONSTANTA.HEADER_VM.PK}:</b> <code>${escapeHtml(pk)}</code>\n`;
    message += `<i>Total ditemukan ${totalEntries} entri riwayat.</i>\n`;
    message += `------------------------------------\n\n`;

    // Jika hasil terlalu banyak, tampilkan ringkasan dan ekspor sisanya
    if (totalEntries > 8) {
      message += `Menampilkan 5 dari ${totalEntries} perubahan terakhir:\n\n`;
      const entriesToShow = historyEntries.slice(0, 5);
      
      entriesToShow.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });

      message += `\n------------------------------------\n`;
      message += `<i>Riwayat terlalu panjang. Laporan lengkap sedang dibuat dalam file Google Sheet...</i>`;
      kirimPesanTelegram(message, config, 'HTML');

      // Panggil fungsi ekspor untuk membuat laporan lengkap
      exportResultsToSheet(logHeaders, historyEntries, `Riwayat Lengkap - ${pk}`, config, userData, KONSTANTA.HEADER_LOG.ACTION);

    } else {
      // Jika hasil cukup sedikit, tampilkan semua
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
 * [VERSI FINAL DIPERBAIKI]
 * Mengambil semua log perubahan hari ini dari sheet aktif DAN semua file arsip.
 */
function getTodaysHistory(config, userData) {
  try {
    const now = new Date();
    // Setel waktu ke awal hari ini (00:00:00)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0); 
    
    // Panggil helper untuk mendapatkan semua log dari awal hari ini
    const { headers: logHeaders, data: todaysLogEntries } = getCombinedLogs(todayStart, config);

    const todayStr = now.toLocaleDateString('id-ID', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});

    if (todaysLogEntries.length === 0) {
      kirimPesanTelegram(`✅ Tidak ada perubahan yang tercatat pada hari ini, ${todayStr}.`, config);
      return;
    }
    
    let message = `<b>📜 Log Perubahan Hari Ini (Termasuk Arsip)</b>\n<i>${todayStr}</i>\nTotal Entri: ${todaysLogEntries.length}\n`;
    message += `------------------------------------\n\n`;
    
    // Jika hasil terlalu banyak, langsung ekspor.
    if (todaysLogEntries.length > 15) {
      message += `Ditemukan lebih dari 15 entri perubahan. Untuk detail lengkap, laporan telah diekspor ke Google Sheet.`;
      kirimPesanTelegram(message, config, 'HTML');
      exportResultsToSheet(logHeaders, todaysLogEntries, `Log Harian`, config, userData, KONSTANTA.HEADER_LOG.ACTION);
    } else {
      // Jika cukup sedikit, tampilkan langsung di pesan.
      todaysLogEntries.forEach(entry => {
        message += formatHistoryEntry(entry, logHeaders);
      });
      kirimPesanTelegram(message, config, 'HTML');
    }

  } catch (e) {
    console.error(`Gagal saat getTodaysHistory: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`❌ Terjadi kesalahan teknis saat mengambil riwayat hari ini.\nError: ${e.message}`, config);
  }
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
  const FOLDER_ARSIP_ID = config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP];
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

  const FOLDER_ARSIP_ID = activeConfig[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP];
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
 * [FUNGSI OPTIMALISASI BARU]
 * Fungsi generik untuk mendeteksi perubahan antara data lama (arsip) dan data baru (sheet),
 * kemudian mencatat perbedaan ke dalam Log Perubahan.
 *
 * @param {object} config - Objek konfigurasi utama.
 * @param {string} sheetName - Nama sheet sumber data baru.
 * @param {string} archiveFileName - Nama file arsip .json di Google Drive.
 * @param {string} primaryKeyHeader - Nama kolom yang menjadi kunci unik (e.g., 'Primary Key' atau 'Name').
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

  // 1. Baca Arsip Lama
  const folderArsip = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP]);
  const files = folderArsip.getFilesByName(archiveFileName);
  let mapDataKemarin = new Map();
  let fileArsip;
  if (files.hasNext()) {
    fileArsip = files.next();
    try {
      mapDataKemarin = new Map(JSON.parse(fileArsip.getBlob().getDataAsString()));
    } catch (e) {
      console.warn(`Gagal parse arsip "${archiveFileName}": ${e.message}`);
    }
  }

  // 2. Baca Data Baru dan buat Map
  const dataHariIni = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const mapDataHariIni = new Map();
  
  // Update indeks kolom yang dipantau berdasarkan header terbaru
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
      const rowData = buatObjekData(row);
      // Menggunakan fungsi hash yang sudah ada
      mapDataHariIni.set(pk, { data: rowData, hash: computeVmHash(rowData) });
    }
  });

  // 3. Bandingkan Data dan Siapkan Log
  let logEntriesToAdd = [];
  const timestamp = new Date();
  const nameHeaderForLog = entityName === 'VM' ? KONSTANTA.HEADER_VM.VM_NAME : primaryKeyHeader;

  for (const [id, dataBaru] of mapDataHariIni.entries()) {
    const dataLama = mapDataKemarin.get(id);
    const entityDisplayName = dataBaru.data[nameHeaderForLog] || id;

    if (!dataLama) {
      // PENAMBAHAN
      const detail = `${entityName} baru dibuat/ditemukan.`;
      const logEntry = [timestamp, 'PENAMBAHAN', id, entityDisplayName, sheetName, '', '', detail];
      logEntriesToAdd.push(logEntry);
    } else if (dataBaru.hash !== dataLama.hash) {
      // MODIFIKASI
        // ===== [PERBAIKAN ERROR] =====
        // Menambahkan pengecekan untuk memastikan dataLama.data ada sebelum membandingkan propertinya.
        // Ini mencegah error "Cannot read properties of undefined" jika struktur arsip tidak lengkap.
        if (dataLama && dataLama.data) {
          for (const key in dataBaru.data) {
            // Bandingkan nilai lama dan baru. Gunakan '' sebagai default jika nilai tidak ada.
            const oldValue = dataLama.data[key] || '';
            const newValue = dataBaru.data[key] || '';
  
            if (String(newValue) !== String(oldValue)) {
              const detail = `Kolom '${key}' diubah`;
              const logEntry = [timestamp, 'MODIFIKASI', id, entityDisplayName, sheetName, oldValue, newValue, detail];
              logEntriesToAdd.push(logEntry);
            }
          }
        }
        // ===== [AKHIR PERBAIKAN] =====
      }
      mapDataKemarin.delete(id); // Hapus dari map lama agar sisanya adalah data yang dihapus
  }

  for (const [id, dataLama] of mapDataKemarin.entries()) {
    // PENGHAPUSAN
    const entityDisplayName = (dataLama.data && dataLama.data[nameHeaderForLog]) || id;
    const detail = `${entityName} telah dihapus.`;
    const logEntry = [timestamp, 'PENGHAPUSAN', id, entityDisplayName, sheetName, '', '', detail];
    logEntriesToAdd.push(logEntry);
  }

  // 4. Catat Perubahan ke Log
  if (logEntriesToAdd.length > 0) {
    sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logEntriesToAdd.length, 8).setValues(logEntriesToAdd);
    console.log(`${logEntriesToAdd.length} log perubahan untuk ${entityName} telah ditambahkan.`);
  }

  // 5. Simpan Arsip Baru
  const dataUntukArsip = JSON.stringify(Array.from(mapDataHariIni.entries()));
  if (fileArsip) {
    fileArsip.setContent(dataUntukArsip);
  } else {
    folderArsip.createFile(archiveFileName, dataUntukArsip, MimeType.PLAIN_TEXT);
  }
  console.log(`Pengarsipan ${entityName} selesai.`);
  
  return logEntriesToAdd;
}
