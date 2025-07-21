/**
 * @file ProsesData.js
 * @author Djanoer Team
 * @date 2023-03-01
 *
 * @description
 * Bertindak sebagai orkestrator untuk proses pengolahan data inti.
 * Fungsi utama di sini adalah jantung dari pekerjaan sinkronisasi yang menyalin data,
 * mendeteksi perubahan, dan memicu pembuatan laporan.
 *
 * @section FUNGSI UTAMA
 * - jalankanAlurSinkronisasiPenuh(config, triggerSource): Menjalankan alur kerja sinkronisasi dan pelaporan secara lengkap.
 * - processDataChanges(...): Mendeteksi perubahan (penambahan, modifikasi, penghapusan) pada data.
 * - getCombinedLogs(...): Menggabungkan log dari sheet aktif dan file arsip.
 * - salinDataSheet(...): Menyalin konten sheet dari spreadsheet sumber.
 */


/**
 * [ORKESTRATOR BARU] Menjalankan alur kerja sinkronisasi dan pelaporan secara lengkap.
 * Fungsi ini menggabungkan logika yang sebelumnya ada di AntreanTugas.js.
 */
function jalankanAlurSinkronisasiPenuh(config, triggerSource) {
  console.log(`Memulai proses sinkronisasi dari sumber: ${triggerSource}`);
  const KUNCI = KONSTANTA.KUNCI_KONFIG;

  // 1. Validasi konfigurasi penting
  const sumberId = config[KUNCI.ID_SUMBER];
  const sheetVmName = config[KUNCI.SHEET_VM];
  if (!sumberId || !sheetVmName) {
    throw new Error(`Konfigurasi kritis hilang: SUMBER_SPREADSHEET_ID atau NAMA_SHEET_DATA_UTAMA kosong.`);
  }

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(300000)) { // Coba kunci selama 5 menit
    throw new Error("Proses sinkronisasi lain sedang berjalan. Permintaan dilewati.");
  }

  try {
    // 2. Jalankan proses penyalinan dan deteksi perubahan
    salinDataSheet(sheetVmName, sumberId);
    processDataChanges(config, sheetVmName, KONSTANTA.NAMA_FILE.ARSIP_VM, config[KUNCI.HEADER_VM_PK], (config[KUNCI.KOLOM_PANTAU] || []).map(n => ({nama: n})), KONSTANTA.NAMA_ENTITAS.VM);

    const sheetDsName = config[KUNCI.SHEET_DS];
    if (sheetDsName) {
      salinDataSheet(sheetDsName, sumberId);
      processDataChanges(config, sheetDsName, KONSTANTA.NAMA_FILE.ARSIP_DS, config[KUNCI.DS_NAME_HEADER], (config[KUNCI.KOLOM_PANTAU_DS] || []).map(n => ({nama: n})), KONSTANTA.NAMA_ENTITAS.DATASTORE);
    }

    // 3. Buat laporan
    console.log("Sinkronisasi selesai. Membuat laporan...");
    const pesanLaporan = buatLaporanHarianVM(config);
    console.log("Pembuatan laporan selesai.");
    return pesanLaporan; // Kembalikan string laporan

  } finally {
    lock.releaseLock();
  }
}

/**
 * [REFACTORED V.1.3 - DEFINITIVE] Menjalankan proses inti sinkronisasi dengan
 * validasi konfigurasi yang tangguh sebelum eksekusi.
 */
function syncDanBuatLaporanHarian(triggerSource = "TIDAK DIKETAHUI", config) {
  // --- BLOK VALIDASI BARU ---
  // 1. Periksa kunci-kunci konfigurasi yang paling penting sebelum melakukan apa pun.
  const KUNCI = KONSTANTA.KUNCI_KONFIG;
  const requiredKeys = [KUNCI.ID_SUMBER, KUNCI.SHEET_VM];
  const missingKeys = requiredKeys.filter(key => !config[key]);

  // 2. Jika ada kunci yang hilang, lemparkan error yang sangat spesifik.
  if (missingKeys.length > 0) {
    throw new Error(`Konfigurasi tidak valid. Kunci berikut hilang atau kosong di sheet "Konfigurasi": ${missingKeys.join(', ')}. Harap periksa kembali sheet Anda.`);
  }
  // --- AKHIR BLOK VALIDASI ---

  const lock = LockService.getScriptLock();
  const lockTimeout = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.LOCK_TIMEOUT_MS) || 10000;

  if (!lock.tryLock(lockTimeout)) {
    console.log("Proses sinkronisasi sudah berjalan, permintaan saat ini dibatalkan.");
    throw new Error("Proses sinkronisasi lain sedang berjalan. Permintaan Anda dilewati.");
  }

  try {
    console.log(`Memulai sinkronisasi dari sumber: ${triggerSource}`);
    const sumberId = config[KUNCI.ID_SUMBER];
    const sheetVmName = config[KUNCI.SHEET_VM];
    const sheetDsName = config[KUNCI.SHEET_DS];

    // Proses Sinkronisasi Data VM
    salinDataSheet(sheetVmName, sumberId);
    const kolomVmUntukDipantau = config[KUNCI.KOLOM_PANTAU] || [];
    if (kolomVmUntukDipantau.length > 0) {
      processDataChanges(config, sheetVmName, KONSTANTA.NAMA_FILE.ARSIP_VM, config[KUNCI.HEADER_VM_PK], kolomVmUntukDipantau.map(n => ({nama: n})), KONSTANTA.NAMA_ENTITAS.VM);
    }

    // Proses Sinkronisasi Data Datastore (jika ada)
    if (sheetDsName) {
      salinDataSheet(sheetDsName, sumberId);
      const kolomDsUntukDipantau = config[KUNCI.KOLOM_PANTAU_DS] || [];
      if (kolomDsUntukDipantau.length > 0) {
        processDataChanges(config, sheetDsName, KONSTANTA.NAMA_FILE.ARSIP_DS, config[KUNCI.DS_NAME_HEADER], kolomDsUntukDipantau.map(n => ({nama: n})), KONSTANTA.NAMA_ENTITAS.DATASTORE);
      }
    }

    // Membuat laporan dan mengembalikan hasilnya
    const pesanLaporanOperasional = buatLaporanHarianVM(config);
    return pesanLaporanOperasional;

  } catch (e) {
    // Salurkan error ke tingkat yang lebih tinggi untuk dilaporkan
    throw new Error(`Gagal saat sinkronisasi: ${e.message}`);
  } finally {
    lock.releaseLock();
  }
}

/**
 * [PINDAH] Helper untuk menyalin konten sebuah sheet dari spreadsheet sumber ke tujuan.
 */
function salinDataSheet(namaSheet, sumberId) {
  try {
    if (!sumberId) throw new Error("ID Spreadsheet Sumber belum diisi.");
    if (!namaSheet) return;

    const sumberSpreadsheet = SpreadsheetApp.openById(sumberId);
    const sumberSheet = sumberSpreadsheet.getSheetByName(namaSheet);
    if (!sumberSheet) throw new Error(`Sheet "${namaSheet}" tidak ditemukan di file SUMBER.`);

    const dataSumber = sumberSheet.getDataRange().getValues();
    if (dataSumber.length === 0) return;

    const tujuanSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let tujuanSheet = tujuanSpreadsheet.getSheetByName(namaSheet);
    if (!tujuanSheet) tujuanSheet = tujuanSpreadsheet.insertSheet(namaSheet);

    tujuanSheet.clearContents();
    tujuanSheet.getRange(1, 1, dataSumber.length, dataSumber[0].length).setValues(dataSumber);
  } catch (e) {
    throw new Error(`Gagal impor sheet "${namaSheet}": ${e.message}`);
  }
}

/**
 * [PINDAH] Memproses perubahan data untuk VM atau Datastore.
 */
function processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, entityName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);

  const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  if (!sheetLog) throw new Error(`Sheet Log Perubahan tidak ditemukan.`);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(primaryKeyHeader);
  if (pkIndex === -1) throw new Error(`Kolom PK "${primaryKeyHeader}" tidak ditemukan di "${sheetName}".`);

  const folderArsip = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP]);
  const files = folderArsip.getFilesByName(archiveFileName);
  let mapDataKemarin = new Map();
  let fileArsip;

  if (files.hasNext()) {
    fileArsip = files.next();
    try {
      const archivedData = JSON.parse(fileArsip.getBlob().getDataAsString());
      mapDataKemarin = new Map(archivedData.map(([pk, data]) => [normalizePrimaryKey(pk), data]));
    } catch (e) { console.warn(`Gagal parse arsip "${archiveFileName}": ${e.message}`); }
  }

  const dataHariIni = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const mapDataHariIni = new Map();

  columnsToTrack.forEach((kolom) => { kolom.index = headers.indexOf(kolom.nama); });

  const buatObjekData = (row) => {
    const data = {};
    columnsToTrack.forEach((kolom) => {
      if (kolom.index !== -1) data[kolom.nama] = row[kolom.index];
    });
    return data;
  };

  dataHariIni.forEach((row) => {
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
  const K = KONSTANTA.KUNCI_KONFIG;
  const nameHeaderForLog = entityName === "VM" ? config[K.HEADER_VM_NAME] : primaryKeyHeader;
  const tolerance = parseFloat(config[K.LOG_TOLERANCE_PROV_GB]) || 0;
  const provisionedGbHeader = config[K.HEADER_VM_PROV_GB];

  for (const [id, dataBaru] of mapDataHariIni.entries()) {
    const dataLama = mapDataKemarin.get(id);
    const entityDisplayName = dataBaru.data[nameHeaderForLog] || id;
    const pkRawForLog = dataBaru.data[primaryKeyHeader];

    if (!dataLama) {
      logEntriesToAdd.push([timestamp, "PENAMBAHAN", pkRawForLog, entityDisplayName, sheetName, "", "", `${entityName} baru.`, entityName]);
    } else if (dataBaru.hash !== dataLama.hash) {
      if (dataLama && dataLama.data) {
        for (const key in dataBaru.data) {
          if (key === primaryKeyHeader) continue;
          const oldValue = dataLama.data[key] || "";
          const newValue = dataBaru.data[key] || "";
          let hasChanged = false;

          if (key === provisionedGbHeader && entityName === KONSTANTA.NAMA_ENTITAS.VM) {
            if (Math.abs(parseLocaleNumber(newValue) - parseLocaleNumber(oldValue)) > tolerance) hasChanged = true;
          } else {
            if (String(newValue) !== String(oldValue)) hasChanged = true;
          }
          if (hasChanged) {
            logEntriesToAdd.push([timestamp, "MODIFIKASI", pkRawForLog, entityDisplayName, sheetName, oldValue, newValue, `Kolom '${key}' diubah`, entityName]);
          }
        }
      }
    }
    mapDataKemarin.delete(id);
  }

  for (const [id, dataLama] of mapDataKemarin.entries()) {
    const entityDisplayName = (dataLama.data && dataLama.data[nameHeaderForLog]) || id;
    const pkRawForLog = (dataLama.data && dataLama.data[primaryKeyHeader]) || id;
    logEntriesToAdd.push([timestamp, "PENGHAPUSAN", pkRawForLog, entityDisplayName, sheetName, "", "", `${entityName} dihapus.`, entityName]);
  }

  if (logEntriesToAdd.length > 0) {
    sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logEntriesToAdd.length, 9).setValues(logEntriesToAdd);
  }

  const dataUntukArsip = JSON.stringify(Array.from(mapDataHariIni.entries()));
  if (fileArsip) fileArsip.setContent(dataUntukArsip);
  else folderArsip.createFile(archiveFileName, dataUntukArsip, MimeType.PLAIN_TEXT);

  return logEntriesToAdd;
}


/**
 * [PINDAH] Mengumpulkan entri log dari sheet aktif DAN arsip JSON.
 */
function getCombinedLogs(startDate, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  let combinedLogEntries = [];
  let logHeaders = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (sheetLog && sheetLog.getLastRow() > 1) {
    const allLogData = sheetLog.getDataRange().getValues();
    logHeaders = allLogData.shift();
    const timestampIndex = logHeaders.indexOf(config[K.HEADER_LOG_TIMESTAMP]);
    if (timestampIndex === -1) throw new Error(`Kolom '${config[K.HEADER_LOG_TIMESTAMP]}' tidak ditemukan.`);
    const activeLogs = allLogData.filter((row) => row.length > 0 && row[timestampIndex] && new Date(row[timestampIndex]) >= startDate);
    combinedLogEntries.push(...activeLogs);
  } else if (sheetLog) {
    logHeaders = sheetLog.getRange(1, 1, 1, sheetLog.getLastColumn()).getValues()[0];
  }

  const FOLDER_ARSIP_ID = config[K.FOLDER_ARSIP_LOG];
  if (FOLDER_ARSIP_ID && logHeaders.length > 0) {
    try {
      const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);
      const indexFiles = folderArsip.getFilesByName("archive_log_index.json");
      if (indexFiles.hasNext()) {
        const indexFile = indexFiles.next();
        const indexData = JSON.parse(indexFile.getBlob().getDataAsString());
        const timestampHeader = config[K.HEADER_LOG_TIMESTAMP];

        for (const indexEntry of indexData) {
          if (new Date(indexEntry.endDate) >= startDate) {
            const archiveFiles = folderArsip.getFilesByName(indexEntry.fileName);
            if (archiveFiles.hasNext()) {
              const file = archiveFiles.next();
              const archivedLogs = JSON.parse(file.getBlob().getDataAsString());
              const relevantLogs = archivedLogs.filter((log) => log[timestampHeader] && new Date(log[timestampHeader]) >= startDate);
              const relevantLogsAsArray = relevantLogs.map((log) => logHeaders.map((header) => log[header] || ""));
              combinedLogEntries.push(...relevantLogsAsArray);
            }
          }
        }
      }
    } catch (e) { console.error(`Gagal membaca arsip log: ${e.message}`); }
  }

  if (combinedLogEntries.length > 0) {
    const timestampIndex = logHeaders.indexOf(config[K.HEADER_LOG_TIMESTAMP]);
    if (timestampIndex !== -1) {
      combinedLogEntries.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));
    }
  }

  return { headers: logHeaders, data: combinedLogEntries };
}