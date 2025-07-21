/**
 * @file Pembersih.js
 * @author Djanoer Team
 * @date 2023-04-05
 *
 * @description
 * Berisi fungsi-fungsi yang berhubungan dengan pemeliharaan dan pembersihan.
 * Tanggung jawab utamanya adalah mengelola siklus hidup data log dan file
 * sementara, seperti mengarsipkan log dan menghapus file ekspor yang sudah tua.
 */

/**
 * [FINAL v1.8.1] Membersihkan file ekspor lama.
 * Logika tidak berubah, disertakan untuk kelengkapan file.
 */
function bersihkanFileEksporTua(config) {
  console.log("Memulai proses pembersihan file ekspor lama...");
  try {
    if (!config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR]) {
      console.warn(`Proses pembersihan dibatalkan: ${KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR} tidak diatur di Konfigurasi.`);
      return;
    }

    const folder = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR]);
    const files = folder.getFiles();
    const oneDayAgo = new Date(new Date().getTime() - (1 * 24 * 60 * 60 * 1000));

    let deleteCount = 0;
    while (files.hasNext()) {
      const file = files.next();
      if (file.getDateCreated() < oneDayAgo) {
        console.log(`File "${file.getName()}" akan dihapus karena sudah tua.`);
        file.setTrashed(true);
        deleteCount++;
      }
    }
    
    if (deleteCount > 0) {
      console.log(`Pembersihan selesai. ${deleteCount} file telah dipindahkan ke sampah.`);
    } else {
      console.log("Pembersihan selesai. Tidak ada file lama yang perlu dihapus.");
    }
  } catch(e) {
    console.error(`Gagal menjalankan pembersihan file lama. Error: ${e.message}`);
  }
}

/**
 * [FUNGSI BARU v1.7.0 - DENGAN INDEXING] Mengarsipkan log storage ke file JSON
 * dan mengelola file indeks untuk pencarian yang efisien.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {string} Pesan hasil proses pengarsipan.
 */
function jalankanPengarsipanLogStorageKeJson(config) {
  const sheetName = "Log Storage Historis";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(sheetName);

  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    return `ℹ️ Tidak ada data di "${sheetName}" yang bisa diarsipkan.`;
  }

  const FOLDER_ARSIP_ID = config[KONSTANTA.KUNCI_KONFIG.FOLDER_ID_ARSIP_LOG_STORAGE];
  if (!FOLDER_ARSIP_ID) {
    throw new Error("Folder ID untuk arsip log storage (FOLDER_ID_ARSIP_LOG_STORAGE) belum diatur di Konfigurasi.");
  }
  const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);

  const dataRange = sheetLog.getDataRange();
  const allLogData = dataRange.getValues();
  const headers = allLogData.shift(); // Ambil header

  if (allLogData.length === 0) {
    return `ℹ️ Tidak ada baris data di "${sheetName}" untuk diarsipkan.`;
  }

  // --- LOGIKA INDEXING BARU DIMULAI DI SINI ---
  const timestampIndex = headers.indexOf("Timestamp");
  if (timestampIndex === -1) {
    throw new Error("Kolom 'Timestamp' tidak ditemukan di header log storage. Tidak dapat melanjutkan pengarsipan.");
  }

  // Tentukan rentang tanggal dari data yang akan diarsipkan
  const timestamps = allLogData.map(row => new Date(row[timestampIndex])).filter(d => !isNaN(d.getTime()));
  const logStartDate = new Date(Math.min.apply(null, timestamps));
  const logEndDate = new Date(Math.max.apply(null, timestamps));
  // --- AKHIR LOGIKA INDEXING BARU ---

  const jsonData = allLogData.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  try {
    const timezone = ss.getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const namaFileArsip = `Arsip_Log_Storage - ${timestamp}.json`;
    const jsonString = JSON.stringify(jsonData, null, 2);

    folderArsip.createFile(namaFileArsip, jsonString, MimeType.PLAIN_TEXT);

    // --- MANAJEMEN FILE INDEX BARU ---
    const indexFileName = "archive_log_storage_index.json";
    let indexData = [];
    const indexFiles = folderArsip.getFilesByName(indexFileName);

    if (indexFiles.hasNext()) {
      const indexFile = indexFiles.next();
      try {
        indexData = JSON.parse(indexFile.getBlob().getDataAsString());
      } catch (e) {
        console.warn(`Gagal parse file indeks storage, akan membuat yang baru. Error: ${e.message}`);
        indexData = [];
      }
      indexFile.setTrashed(true); // Hapus file index lama
    }

    // Tambahkan entri baru ke data index
    indexData.push({
      fileName: namaFileArsip,
      startDate: logStartDate.toISOString(),
      endDate: logEndDate.toISOString(),
      recordCount: allLogData.length
    });

    // Buat file index yang baru dengan data yang sudah diperbarui
    folderArsip.createFile(indexFileName, JSON.stringify(indexData, null, 2), MimeType.PLAIN_TEXT);
    console.log(`File indeks "${indexFileName}" telah diperbarui.`);
    // --- AKHIR MANAJEMEN FILE INDEX ---

    // Hapus semua data kecuali baris header
    sheetLog.getRange(2, 1, sheetLog.getLastRow() - 1, sheetLog.getLastColumn()).clearContent();

    const pesanSukses = `✅ Pengarsipan log storage berhasil.\n\nSebanyak ${allLogData.length} baris telah dipindahkan ke file "${namaFileArsip}".`;
    console.log(pesanSukses);
    return pesanSukses;

  } catch (e) {
    const pesanGagal = `❌ Gagal melakukan pengarsipan log storage. Error: ${e.message}`;
    console.error(pesanGagal + `\nStack: ${e.stack}`);
    throw new Error(pesanGagal);
  }
}

/**
 * [PINDAH & REFACTOR v1.8.1] Memeriksa Log Perubahan dan memicu pengarsipan jika perlu.
 * Menggunakan ambang batas dari konfigurasi terpusat.
 */
function cekDanArsipkanLogJikaPenuh(config = null) {
  const activeConfig = config || bacaKonfigurasi();
  const BATAS_BARIS = (activeConfig.SYSTEM_LIMITS && activeConfig.SYSTEM_LIMITS.LOG_CHANGE_ARCHIVE_THRESHOLD) || 2000;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

    if (!sheetLog) {
      const errorMsg = "Sheet 'Log Perubahan' tidak ditemukan. Pengecekan dibatalkan.";
      console.error(errorMsg);
      return `❌ Gagal: ${errorMsg}`;
    }

    const jumlahBaris = sheetLog.getLastRow();
    console.log(`Pengecekan jumlah baris log perubahan: ${jumlahBaris} baris.`);

    if (jumlahBaris > BATAS_BARIS) {
      console.log(`Jumlah baris (${jumlahBaris}) melebihi batas (${BATAS_BARIS}). Memulai proses pengarsipan...`);
      return jalankanPengarsipanLogKeJson(activeConfig);
    } else {
      const feedbackMsg = `ℹ️ Pengarsipan log perubahan belum diperlukan. Jumlah baris saat ini adalah ${jumlahBaris}, masih di bawah ambang batas ${BATAS_BARIS} baris.`;
      console.log(feedbackMsg);
      return feedbackMsg;
    }
  } catch(e) {
      const errorMsg = `❌ Gagal saat memeriksa log perubahan untuk pengarsipan: ${e.message}`;
      console.error(errorMsg);
      return errorMsg;
  }
}

/**
 * [FINAL v1.8.1] Memeriksa Log Storage dan memicu pengarsipan jika perlu.
 * Menggunakan ambang batas dari konfigurasi terpusat.
 */
function cekDanArsipkanLogStorageJikaPenuh(config = null) {
  const activeConfig = config || bacaKonfigurasi();
  const BATAS_BARIS = (activeConfig.SYSTEM_LIMITS && activeConfig.SYSTEM_LIMITS.LOG_STORAGE_ARCHIVE_THRESHOLD) || 2000;

  try {
    const sheetName = "Log Storage Historis";
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLog = ss.getSheetByName(sheetName);

    if (!sheetLog) {
      const errorMsg = `Sheet "${sheetName}" tidak ditemukan. Pengecekan dibatalkan.`;
      console.error(errorMsg);
      return `❌ Gagal: ${errorMsg}`;
    }

    const jumlahBaris = sheetLog.getLastRow();
    console.log(`Pengecekan jumlah baris log storage: ${jumlahBaris} baris.`);

    if (jumlahBaris > BATAS_BARIS) {
      console.log(`Jumlah baris (${jumlahBaris}) melebihi batas (${BATAS_BARIS}). Memulai proses pengarsipan log storage...`);
      return jalankanPengarsipanLogStorageKeJson(activeConfig);
    } else {
      const feedbackMsg = `ℹ️ Pengarsipan log storage belum diperlukan. Jumlah baris saat ini adalah ${jumlahBaris}, masih di bawah ambang batas ${BATAS_BARIS} baris.`;
      console.log(feedbackMsg);
      return feedbackMsg;
    }
  } catch(e) {
      const errorMsg = `❌ Gagal saat memeriksa log storage untuk pengarsipan: ${e.message}`;
      console.error(errorMsg);
      return errorMsg;
  }
}

/**
 * FUNGSI UTAMA PENGARSIPAN (DENGAN LOGIKA INDEKS & RETURN VALUE FINAL)
 * Tugasnya adalah memindahkan log lama ke file JSON, membersihkan sheet,
 * dan HANYA mengembalikan pesan hasilnya.
 */
function jalankanPengarsipanLogKeJson(config) {
  const activeConfig = config;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    console.log("Tidak ada log untuk diarsipkan.");
    return "ℹ️ Tidak ada data log yang bisa diarsipkan saat ini.";
  }

  const FOLDER_ARSIP_ID = activeConfig[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP_LOG];
  if (!FOLDER_ARSIP_ID) {
    throw new Error("Folder ID untuk arsip log (FOLDER_ID_ARSIP_LOG) belum diatur di Konfigurasi.");
  }
  const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);

  const dataRange = sheetLog.getDataRange();
  const allLogData = dataRange.getValues();
  const headers = allLogData.shift();

  if (allLogData.length === 0) {
    console.log("Tidak ada baris data log setelah header. Pengarsipan dibatalkan.");
    return "ℹ️ Tidak ada baris data log setelah header. Pengarsipan dibatalkan.";
  }

  const timestampIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_LOG_TIMESTAMP]);
  if (timestampIndex === -1) {
    throw new Error("Kolom 'Timestamp' tidak ditemukan di header log. Tidak dapat melanjutkan pengarsipan.");
  }

  const timestamps = allLogData.map((row) => new Date(row[timestampIndex])).filter((d) => !isNaN(d.getTime()));
  const logStartDate = new Date(Math.min.apply(null, timestamps));
  const logEndDate = new Date(Math.max.apply(null, timestamps));

  const jsonData = allLogData.map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  try {
    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const namaFileArsip = `Arsip Log - ${timestamp}.json`;
    const jsonString = JSON.stringify(jsonData, null, 2);

    folderArsip.createFile(namaFileArsip, jsonString, MimeType.PLAIN_TEXT);
    console.log(`${allLogData.length} baris log telah ditulis ke file JSON: ${namaFileArsip}`);

    const indexFileName = "archive_log_index.json";
    let indexData = [];
    const indexFiles = folderArsip.getFilesByName(indexFileName);

    if (indexFiles.hasNext()) {
      const indexFile = indexFiles.next();
      try {
        indexData = JSON.parse(indexFile.getBlob().getDataAsString());
      } catch (e) {
        console.warn(`Gagal parse file indeks, akan membuat yang baru. Error: ${e.message}`);
        indexData = [];
      }
      indexFile.setTrashed(true);
    }

    indexData.push({
      fileName: namaFileArsip,
      startDate: logStartDate.toISOString(),
      endDate: logEndDate.toISOString(),
    });

    folderArsip.createFile(indexFileName, JSON.stringify(indexData, null, 2), MimeType.PLAIN_TEXT);
    console.log(`File indeks "${indexFileName}" telah diperbarui.`);

    sheetLog.getRange(2, 1, sheetLog.getLastRow(), sheetLog.getLastColumn()).clearContent();

    const pesanSukses = `✅ Pengarsipan log berhasil.\n\nSebanyak ${allLogData.length} baris log telah dipindahkan ke file "${namaFileArsip}".`;
    console.log(pesanSukses);
    return pesanSukses;
  } catch (e) {
    const pesanGagal = `❌ Gagal melakukan pengarsipan log. Error: ${e.message}\nStack: ${e.stack}`;
    console.error(pesanGagal);
    return pesanGagal;
  }
}
