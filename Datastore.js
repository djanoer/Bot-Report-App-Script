// ===== FILE: Datastore.gs =====

function jalankanPemeriksaanDatastore() {
    console.log("Memulai pemeriksaan perubahan datastore...");
    try {
      const config = bacaKonfigurasi();
      if (!config.NAMA_SHEET_DATASTORE) {
        console.warn("Pemeriksaan datastore dibatalkan: NAMA_SHEET_DATASTORE tidak diatur.");
        return;
      }
  
      const NAMA_FILE_ARSIP_DS = "archive_datastore.json";
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const sheetLog = spreadsheet.getSheetByName("Log Perubahan");
      const sheetDs = spreadsheet.getSheetByName(config.NAMA_SHEET_DATASTORE);
      
      if (!sheetDs) {
        console.error(`Sheet datastore "${config.NAMA_SHEET_DATASTORE}" tidak ditemukan.`);
        return;
      }
  
      const dsHeaders = sheetDs.getRange(1, 1, 1, sheetDs.getLastColumn()).getValues()[0];
      const nameIndex = dsHeaders.indexOf(config.HEADER_DATASTORE_NAME);
      const capacityIndex = dsHeaders.indexOf('Capacity (TB)');
      if (nameIndex === -1 || capacityIndex === -1) {
        throw new Error("Header 'Name' atau 'Capacity (TB)' tidak ditemukan di sheet datastore.");
      }
  
      const folderArsip = DriveApp.getFolderById(config.FOLDER_ID_ARSIP);
      const files = folderArsip.getFilesByName(NAMA_FILE_ARSIP_DS);
      let mapDsKemarin = new Map();
      let fileArsip;
      if (files.hasNext()) {
        fileArsip = files.next();
        try { mapDsKemarin = new Map(JSON.parse(fileArsip.getBlob().getDataAsString())); }
        catch (e) { console.warn(`Gagal parse arsip datastore: ${e.message}`); }
      }
      
      const dataDsHariIni = sheetDs.getLastRow() > 1 ? sheetDs.getRange(2, 1, sheetDs.getLastRow() - 1, sheetDs.getLastColumn()).getValues() : [];
      const mapDsHariIni = new Map();
      dataDsHariIni.forEach(row => {
        const name = row[nameIndex];
        const capacity = row[capacityIndex];
        if (name) {
          mapDsHariIni.set(name, { capacity: capacity });
        }
      });
  
      let logEntriesToAdd = [];
      const timestamp = new Date();
  
      for (const [name, dsHariIni] of mapDsHariIni.entries()) {
        const dsKemarin = mapDsKemarin.get(name);
        if (!dsKemarin) {
          const logEntry = [timestamp, 'DATASTORE BARU', name, `DS: ${name}`, sheetDs.getName(), '', dsHariIni.capacity, `Datastore baru ditambahkan dengan kapasitas ${dsHariIni.capacity} TB`];
          logEntriesToAdd.push(logEntry);
        } else if (String(dsHariIni.capacity) !== String(dsKemarin.capacity)) {
          const logEntry = [timestamp, 'KAPASITAS DS DIUBAH', name, `DS: ${name}`, sheetDs.getName(), dsKemarin.capacity, dsHariIni.capacity, `Kapasitas datastore '${name}' diubah`];
          logEntriesToAdd.push(logEntry);
        }
        mapDsKemarin.delete(name);
      }
  
      for (const [name, dsKemarin] of mapDsKemarin.entries()) {
        const logEntry = [timestamp, 'DATASTORE DIHAPUS', name, `DS: ${name}`, sheetDs.getName(), dsKemarin.capacity, '', `Datastore '${name}' telah dihapus.`];
        logEntriesToAdd.push(logEntry);
      }
      
      if (logEntriesToAdd.length > 0) {
        const lastRow = sheetLog.getLastRow();
        sheetLog.getRange(lastRow + 1, 1, logEntriesToAdd.length, 8).setValues(logEntriesToAdd);
        console.log(`${logEntriesToAdd.length} log perubahan datastore telah ditambahkan.`);
        kirimPesanTelegram(`🔔 Terdeteksi ${logEntriesToAdd.length} perubahan pada infrastruktur datastore. Silakan cek /cekhistory untuk detail.`, config);
      } else {
        console.log("Tidak ada perubahan pada data datastore.");
      }
  
      const dataUntukArsip = JSON.stringify(Array.from(mapDsHariIni.entries()));
      if (fileArsip) {
        fileArsip.setContent(dataUntukArsip);
      } else {
        folderArsip.createFile(NAMA_FILE_ARSIP_DS, dataUntukArsip, MimeType.PLAIN_TEXT);
      }
       console.log("Pemeriksaan perubahan datastore selesai.");
  
    } catch (e) {
      console.error(`Gagal menjalankan pemeriksaan datastore: ${e.message}`);
      kirimPesanTelegram(`<b>⚠️ Gagal Menjalankan Pemeriksaan Datastore!</b>\n\n<code>${escapeHtml(e.message)}</code>`, bacaKonfigurasi());
    }
  }