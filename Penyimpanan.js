/**
 * @file Penyimpanan.js
 * @author Djanoer Team
 * @date 2023-06-16
 *
 * @description
 * Mengelola proses pengolahan dan penyimpanan data historis untuk metrik storage.
 * File ini mengambil data yang sudah di-parsing, melakukan standarisasi,
 * dan menyimpannya ke sheet 'Log Storage Historis'.
 */

/**
 * [FINAL v1.5.0] Fungsi orkestrator utama yang melakukan seluruh proses:
 * Parsing, Pengayaan, Standarisasi, dan Penyimpanan.
 * @param {string} textBlock - Teks laporan yang akan diproses.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object} Objek berisi status keberhasilan dan nama storage.
 */
function processAndLogReport(textBlock, config) {
  // 1. PARSING MENTAH
  const parsedData = parseForwardedMessage(textBlock);
  if (!parsedData || !parsedData.storageName) {
    throw new Error("Gagal mem-parsing data. Format laporan tidak dikenal atau nama storage tidak ditemukan.");
  }

  // 2. PENGAYAAN & STANDARISASI
  const K = KONSTANTA.KUNCI_KONFIG;
  const aliasMap = config[K.MAP_ALIAS_STORAGE] || {};
  const capacityMap = config[K.MAP_KAPASITAS_STORAGE] || {};

  // Cari alias yang cocok
  const reportKey = Object.keys(aliasMap).find((key) =>
    parsedData.storageName.toLowerCase().includes(key.toLowerCase())
  );
  const storageAliases = reportKey ? aliasMap[reportKey] : [];
  const mainAlias = storageAliases[0] || "N/A";

  // Tentukan Total Kapasitas
  let totalCapacityTb = 0;
  if (parsedData.totalCapacity) {
    totalCapacityTb = convertUnit(parsedData.totalCapacity.value, parsedData.totalCapacity.unit, "TB");
  } else if (capacityMap[mainAlias]) {
    totalCapacityTb = capacityMap[mainAlias];
  }

  // Hitung Jumlah Datastore
  const datastoreCount = countDatastoresForStorage(parsedData.storageName, config);

  // Konversi semua nilai ke satuan standar
  const usageTb = convertUnit(parsedData.usage?.value, parsedData.usage?.unit, "TB");
  const snapshotTb = convertUnit(parsedData.snapshot?.value, parsedData.snapshot?.unit, "TB");
  const latencyMs = parsedData.latency?.value || 0;
  const iops = parsedData.iops?.unit.toLowerCase() === "k" ? parsedData.iops.value * 1000 : parsedData.iops?.value || 0;
  const throughputMbs = convertUnit(parsedData.throughput?.value, parsedData.throughput?.unit, "MB/s");
  const cpuPercent = parsedData.cpu?.value || 0;
  const reductionRatio = parsedData.reduction?.value || 0;

  // 3. PERSIAPAN DATA FINAL
  const finalDataRow = [
    new Date(),
    parsedData.storageName,
    storageAliases.join(", "),
    usageTb.toFixed(2),
    totalCapacityTb.toFixed(2),
    snapshotTb.toFixed(2),
    latencyMs.toFixed(2),
    Math.round(iops),
    throughputMbs.toFixed(2),
    cpuPercent,
    reductionRatio.toFixed(2),
    datastoreCount,
  ];

  // 4. PENYIMPANAN
  saveRowToSheet("Log Storage Historis", finalDataRow);

  return { success: true, storageName: parsedData.storageName };
}

/**
 * [FINAL v1.5.0] Fungsi generik untuk menyimpan satu baris ke sheet manapun.
 */
function saveRowToSheet(sheetName, rowData) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Jika sheet baru, asumsikan rowData[0] adalah header. Ini perlu disempurnakan jika perlu.
    const headers = [
      "Timestamp",
      "Storage Name",
      "Storage Alias",
      "Usage (TB)",
      "Total Capacity (TB)",
      "Snapshot (TB)",
      "Latency (ms)",
      "IOPS",
      "Throughput (MB/s)",
      "Controller CPU (%)",
      "Data Reduction Ratio",
      "Datastore Count",
    ];
    sheet.appendRow(headers);
  }
  sheet.appendRow(rowData);
}

/**
 * [FINAL v1.5.2] "Mesin Konversi Cerdas" yang sadar-satuan.
 * Hanya melakukan konversi jika satuan sumber dan target berbeda.
 * @param {number} value - Nilai angka yang akan dikonversi.
 * @param {string} fromUnit - Satuan asal dari data mentah (misal: "TiB", "GiB", "MiB/s").
 * @param {string} toUnit - Satuan target yang diinginkan (misal: "TB", "GB", "MB/s").
 * @returns {number} Nilai yang sudah dikonversi atau nilai asli jika tidak ada konversi yang diperlukan.
 */
function convertUnit(value, fromUnit, toUnit) {
  // Jika tidak ada data input, kembalikan 0 untuk keamanan
  if (!value || !fromUnit || !toUnit) return 0;

  const val = parseFloat(value);
  if (isNaN(val)) return 0;

  const from = fromUnit.toLowerCase();
  const to = toUnit.toLowerCase();

  // Jika satuan sudah sama, tidak perlu konversi. Langsung kembalikan nilai asli.
  if (
    from.startsWith(to) ||
    (from.includes("mib") && to.includes("mb/s")) ||
    (from.includes("gib") && to.includes("gb"))
  ) {
    return val;
  }

  // --- Hanya jalankan logika di bawah ini jika konversi diperlukan ---

  // Ke Terabyte (TB)
  if (to === "tb") {
    if (from.includes("tib")) return val * 1.09951;
    if (from.includes("gib")) return val / 931.323;
  }
  // Ke Gigabyte (GB)
  if (to === "gb") {
    if (from.includes("tib")) return val * 1099.51;
    if (from.includes("gib")) return val * 1.07374;
  }
  // Ke Megabyte/s (MB/s)
  if (to === "mb/s") {
    if (from.includes("mib/s")) return val * 1.04858;
    if (from.includes("gib/s")) return val * 1024 * 1.04858; // Konversi GiB/s -> MiB/s -> MB/s
  }

  // Jika tidak ada aturan konversi yang cocok, kembalikan nilai asli
  return val;
}

// Fungsi countDatastoresForStorage tidak perlu diubah dari versi sebelumnya.
function countDatastoresForStorage(storageReportName, config) {
  // ... kode yang sama persis dari v1.4.1 ...
  const K = KONSTANTA.KUNCI_KONFIG;
  const aliasMap = config[K.MAP_ALIAS_STORAGE] || {};
  const reportKey = Object.keys(aliasMap).find((key) => storageReportName.toLowerCase().includes(key.toLowerCase()));

  const aliases = reportKey ? aliasMap[reportKey] : [];

  if (aliases.length === 0) {
    console.warn(`Tidak ditemukan alias untuk storage: "${storageReportName}"`);
    return 0;
  }

  const { headers, dataRows: allDatastoreData } = _getSheetData(config[K.SHEET_DS]);
  const dsNameIndex = headers.indexOf(config[K.DS_NAME_HEADER]);
  if (dsNameIndex === -1) {
    console.error("Header untuk Nama Datastore tidak ditemukan. Perhitungan datastore dilewati.");
    return 0;
  }

  let matchCount = 0;

  allDatastoreData.forEach((row) => {
    const dsName = String(row[dsNameIndex] || "").toUpperCase();
    const isMatch = aliases.some((alias) => dsName.includes(alias.toUpperCase()));
    if (isMatch) {
      matchCount++;
    }
  });

  console.log(`Ditemukan ${matchCount} datastore untuk alias [${aliases.join(", ")}]`);
  return matchCount;
}

/**
 * [REVISI v3.3.0 - DENGAN INDEXING] Menggabungkan data dari sheet "Log Storage Historis" aktif
 * dengan file arsip JSON yang relevan menggunakan file index untuk efisiensi.
 * @param {object} config - Objek konfigurasi bot.
 * @param {number} days - Jumlah hari ke belakang untuk diambil datanya.
 * @returns {object} Objek berisi { headers: Array, data: Array }.
 */
function getCombinedStorageLogs(config, days = 30) {
  const allLogs = [];
  const K = KONSTANTA.KUNCI_KONFIG;
  const sheetName = "Log Storage Historis";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  let headers = [];

  // Tentukan rentang tanggal pencarian
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // 1. Baca data dari sheet aktif yang pasti relevan
  if (sheet && sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues();
    headers = data.shift();
    allLogs.push(...data);
  } else if (sheet) {
    headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  }

  const timestampIndex = headers.indexOf("Timestamp");
  if (timestampIndex === -1 && allLogs.length === 0) {
    console.error("Header 'Timestamp' tidak ditemukan dan tidak ada data aktif. Proses ambil log dihentikan.");
    return { headers: headers, data: [] };
  }

  // 2. Baca data dari file arsip menggunakan index
  const folderId = config[K.FOLDER_ID_ARSIP_LOG_STORAGE];
  if (folderId && headers.length > 0) {
    try {
      const folder = DriveApp.getFolderById(folderId);
      const indexFiles = folder.getFilesByName("archive_log_storage_index.json");

      if (indexFiles.hasNext()) {
        const indexFile = indexFiles.next();
        const indexData = JSON.parse(indexFile.getBlob().getDataAsString());

        // Filter index untuk menemukan file arsip yang relevan
        for (const indexEntry of indexData) {
          const archiveEndDate = new Date(indexEntry.endDate);
          // Hanya buka file jika rentang waktunya bersinggungan dengan yang kita cari
          if (archiveEndDate >= startDate) {
            const archiveFiles = folder.getFilesByName(indexEntry.fileName);
            if (archiveFiles.hasNext()) {
              const file = archiveFiles.next();
              const content = file.getBlob().getDataAsString();
              const archivedData = JSON.parse(content);
              // Ubah dari array objek menjadi array array
              const dataAsArray = archivedData.map((obj) => headers.map((header) => obj[header]));
              allLogs.push(...dataAsArray);
            }
          }
        }
      }
    } catch (e) {
      console.error(`Gagal membaca arsip log storage menggunakan index: ${e.message}`);
    }
  }

  // 3. Filter semua data gabungan berdasarkan rentang tanggal yang tepat
  const filteredLogs = allLogs.filter((row) => {
    const timestamp = new Date(row[timestampIndex]);
    return timestamp >= startDate;
  });

  return { headers: headers, data: filteredLogs };
}
