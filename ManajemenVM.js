/**
 * @file ManajemenVM.js
 * @author Djanoer Team
 * @date 2023-01-15
 *
 * @description
 * Mengelola semua logika bisnis inti yang berkaitan dengan entitas Virtual Machine (VM).
 * Tanggung jawab utama file ini mencakup pencarian, pengambilan data (Cache-First),
 * pelacakan riwayat perubahan, dan analisis profil VM.
 *
 * @section FUNGSI UTAMA
 * - getVmData(config): Mengambil data VM dari cache atau spreadsheet. PENGGANTI _getSheetData.
 * - searchVmOnSheet(searchTerm, config): Mencari VM berdasarkan nama, IP, atau PK.
 * - searchVmsByColumn(columnName, searchValue, config): Fungsi pencarian generik berdasarkan kolom.
 * - getVmHistory(pk, config): Mengambil riwayat lengkap sebuah VM dari log aktif dan arsip.
 */

/**
 * [FUNGSI BARU & SUPERIOR] Mengambil data VM dengan strategi Cache-First.
 * Ini akan menjadi PENGGANTI UTAMA untuk panggilan _getSheetData untuk data VM.
 * @param {object} config - Objek konfigurasi.
 * @returns {{headers: Array<string>, dataRows: Array<Array<any>>}}
 */
function getVmData(config) {
  // 1. Coba baca dari cache terlebih dahulu untuk performa maksimal
  let allDataWithHeaders = readLargeDataFromCache("vm_data");

  if (allDataWithHeaders) {
    console.log("Data VM berhasil diambil dari cache.");
    const headers = allDataWithHeaders.shift(); // Pisahkan header dari data
    return { headers: headers, dataRows: allDataWithHeaders };
  }

  // 2. Jika cache kosong, baru baca dari Spreadsheet
  console.log("Cache VM kosong, membaca dari Spreadsheet...");
  const { headers, dataRows } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);

  if (dataRows.length > 0) {
    // 3. Lakukan "cache warming" agar panggilan berikutnya lebih cepat
    saveLargeDataToCache("vm_data", [headers, ...dataRows], 21600); // Simpan kembali dengan header
  }

  return { headers, dataRows };
}

/**
 * [FINAL-FIX] Menyimpan data besar ke cache dengan teknik chunking.
 * Memperbaiki bug dengan menggunakan cache.put() di dalam perulangan, bukan cache.putAll().
 */
function saveLargeDataToCache(keyPrefix, data, durationInSeconds) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${keyPrefix}_manifest`;

  // Hapus cache lama terlebih dahulu
  const oldManifestJSON = cache.get(manifestKey);
  if (oldManifestJSON) {
    try {
      const oldManifest = JSON.parse(oldManifestJSON);
      if (oldManifest && oldManifest.totalChunks) {
        const keysToRemove = [manifestKey];
        for (let i = 0; i < oldManifest.totalChunks; i++) {
          keysToRemove.push(`${keyPrefix}_chunk_${i}`);
        }
        cache.removeAll(keysToRemove);
      }
    } catch (e) {
      console.warn(`Gagal parse manifest cache lama untuk ${keyPrefix}: ${e.message}`);
    }
  }

  const dataString = JSON.stringify(data);
  const maxChunkSize = 95 * 1024; // 95KB
  const chunks = [];
  for (let i = 0; i < dataString.length; i += maxChunkSize) {
    chunks.push(dataString.substring(i, i + maxChunkSize));
  }

  const manifest = { totalChunks: chunks.length };

  try {
    // --- PERBAIKAN UTAMA DI SINI ---
    // Simpan manifest terlebih dahulu
    cache.put(manifestKey, JSON.stringify(manifest), durationInSeconds);
    // Simpan setiap potongan data secara individual menggunakan perulangan
    chunks.forEach((chunk, index) => {
      cache.put(`${keyPrefix}_chunk_${index}`, chunk, durationInSeconds);
    });
    console.log(`Data berhasil disimpan ke cache dengan prefix "${keyPrefix}" dalam ${chunks.length} potongan.`);
    // --- AKHIR PERBAIKAN ---
  } catch (e) {
    console.error(`Gagal menyimpan data cache dengan teknik chunking untuk prefix "${keyPrefix}". Error: ${e.message}`);
  }
}

/**
 * [FUNGSI BARU v3.4.0] Membaca data besar dari cache yang disimpan dengan teknik chunking.
 * Dilengkapi dengan validasi integritas untuk memastikan data tidak rusak.
 * @param {string} keyPrefix - Awalan unik untuk kunci cache.
 * @returns {object|null} Data yang telah direkonstruksi, atau null jika cache tidak lengkap atau tidak ada.
 */
function readLargeDataFromCache(keyPrefix) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${keyPrefix}_manifest`;
  try {
    const manifestJSON = cache.get(manifestKey);
    if (!manifestJSON) return null;
    const manifest = JSON.parse(manifestJSON);
    const totalChunks = manifest.totalChunks;
    const chunkKeys = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkKeys.push(`${keyPrefix}_chunk_${i}`);
    }
    const cachedChunks = cache.getAll(chunkKeys);
    let reconstructedString = "";
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `${keyPrefix}_chunk_${i}`;
      if (!cachedChunks[chunkKey]) {
        console.error(`Integritas cache rusak: Potongan "${chunkKey}" hilang.`);
        return null;
      }
      reconstructedString += cachedChunks[chunkKey];
    }
    return JSON.parse(reconstructedString);
  } catch (e) {
    console.error(`Gagal membaca data cache dengan prefix "${keyPrefix}". Error: ${e.message}`);
    return null;
  }
}

/**
 * [FUNGSI BARU & GENERIK] Mencari VM berdasarkan kriteria kolom tertentu.
 * Menggunakan data yang sudah di-cache dari getVmData untuk performa tinggi.
 * @param {string} columnName - Nama header kolom yang akan dicari.
 * @param {string} searchValue - Nilai yang ingin dicocokkan di dalam kolom.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {{headers: Array, results: Array}}
 */
function searchVmsByColumn(columnName, searchValue, config) {
  const { headers, dataRows } = getVmData(config); // Menggunakan fungsi superior kita

  const columnIndex = headers.indexOf(columnName);
  if (columnIndex === -1) {
    throw new Error(`Kolom header "${columnName}" tidak dapat ditemukan di sheet "Data VM".`);
  }

  const searchLower = searchValue.toLowerCase();
  const results = dataRows.filter((row) => String(row[columnIndex] || "").toLowerCase() === searchLower);

  return { headers, results };
}

/**
 * [FINAL & BULLETPROOF] Mencari VM dengan strategi Cache-First dan pelaporan error yang sangat detail.
 * Fungsi ini akan melaporkan dengan presisi jika ada ketidakcocokan antara konfigurasi dan header sheet.
 */
function searchVmOnSheet(searchTerm, config) {
  let allDataWithHeaders = readLargeDataFromCache("vm_data");

  if (!allDataWithHeaders) {
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet || sheet.getLastRow() < 2) {
      throw new Error(`Sheet data VM "${sheetName}" tidak dapat ditemukan atau kosong.`);
    }
    allDataWithHeaders = sheet.getDataRange().getValues();
    saveLargeDataToCache("vm_data", allDataWithHeaders, 21600);
  }

  const headers = allDataWithHeaders.shift();
  const allData = allDataWithHeaders;

  const KUNCI = KONSTANTA.KUNCI_KONFIG;

  // --- PERBAIKAN UTAMA: VALIDASI DENGAN PESAN ERROR DETAIL ---
  const headerKeys = {
    pk: KUNCI.HEADER_VM_PK,
    name: KUNCI.HEADER_VM_NAME,
    ip: KUNCI.HEADER_VM_IP,
  };

  const indices = {};

  for (const key in headerKeys) {
    const configKey = headerKeys[key];
    const headerNameFromConfig = config[configKey];

    if (!headerNameFromConfig) {
      throw new Error(`Kunci konfigurasi '${configKey}' tidak ditemukan atau nilainya kosong di sheet "Konfigurasi".`);
    }

    const foundIndex = headers.indexOf(headerNameFromConfig);
    if (foundIndex === -1) {
      // Membuat pesan error yang sangat spesifik dan solutif
      let errorMessage = `❌ **Error Konfigurasi Terdeteksi**\n\n`;
      errorMessage += `Gagal menjalankan pencarian karena header yang didefinisikan di konfigurasi tidak cocok dengan file data.\n\n`;
      errorMessage += `• **Header Dicari:** \`${headerNameFromConfig}\`\n`;
      errorMessage += `• **Kunci Konfigurasi:** \`${configKey}\`\n\n`;
      errorMessage += `**Saran Perbaikan:**\nPastikan nilai untuk kunci \`${configKey}\` di sheet "Konfigurasi" sama persis dengan nama kolom di sheet "Data VM".`;

      // Melemparkan error dengan pesan yang sudah diformat
      throw new Error(errorMessage);
    }
    indices[key + "Index"] = foundIndex;
  }

  const { pkIndex, nameIndex, ipIndex } = indices;
  // --- AKHIR VALIDASI ---

  let results = [];

  if (searchTerm.includes("|")) {
    const searchPks = new Set(searchTerm.split("|").map((pk) => normalizePrimaryKey(pk.trim())));
    results = allData.filter((row) => {
      const vmPk = normalizePrimaryKey(String(row[pkIndex] || "").trim());
      return searchPks.has(vmPk);
    });
  } else {
    const searchLower = searchTerm.toLowerCase().trim();
    const normalizedSearchTerm = normalizePrimaryKey(searchLower);

    results = allData.filter((row) => {
      const vmPk = normalizePrimaryKey(String(row[pkIndex] || "").trim()).toLowerCase();
      const vmName = String(row[nameIndex] || "")
        .trim()
        .toLowerCase();
      const vmIp = String(row[ipIndex] || "")
        .trim()
        .toLowerCase();
      return vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower);
    });
  }

  return { headers, results };
}

function searchVmsByCluster(clusterName, config) {
  const clusterHeader = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_CLUSTER];
  return searchVmsByColumn(clusterHeader, clusterName, config);
}

function searchVmsByDatastore(datastoreName, config) {
  const datastoreHeader = config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER];
  return searchVmsByColumn(datastoreHeader, datastoreName, config);
}

function getVmHistory(pk, config) {
  const allHistory = [];
  const K = KONSTANTA.KUNCI_KONFIG;

  const logSheetName = KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN;
  const archiveFolderId = config[K.FOLDER_ARSIP_LOG];

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(logSheetName);
  if (!sheet) throw new Error(`Sheet log dengan nama "${logSheetName}" tidak ditemukan.`);

  let headers = [];
  let pkIndex = -1;
  let vmNameIndex = -1;
  let lastKnownVmName = pk;

  if (sheet.getLastRow() > 0) {
    const data = sheet.getDataRange().getValues();
    headers = data.shift() || [];
    pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
    vmNameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);

    if (pkIndex === -1 && data.length > 0) {
      throw new Error(`Kolom Primary Key ('${config[K.HEADER_VM_PK]}') tidak ditemukan di header sheet log.`);
    }

    if (pkIndex !== -1) {
      for (const row of data) {
        if (normalizePrimaryKey(row[pkIndex]) === normalizePrimaryKey(pk)) {
          allHistory.push(row);
        }
      }
    }
  }

  if (archiveFolderId && headers.length > 0 && pkIndex !== -1) {
    try {
      const archiveFolder = DriveApp.getFolderById(archiveFolderId);
      const files = archiveFolder.getFilesByName("archive_log_index.json");

      if (files.hasNext()) {
        const indexFile = files.next();
        const indexData = JSON.parse(indexFile.getBlob().getDataAsString());

        for (const indexEntry of indexData) {
          const archiveFiles = archiveFolder.getFilesByName(indexEntry.fileName);
          if (archiveFiles.hasNext()) {
            const file = archiveFiles.next();
            const archivedRows = JSON.parse(file.getBlob().getDataAsString());
            if (Array.isArray(archivedRows)) {
              for (const rowObj of archivedRows) {
                if (
                  rowObj[config[K.HEADER_VM_PK]] &&
                  normalizePrimaryKey(rowObj[config[K.HEADER_VM_PK]]) === normalizePrimaryKey(pk)
                ) {
                  const rowArray = headers.map((header) => rowObj[header] || "");
                  allHistory.push(rowArray);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`Gagal memproses arsip log: ${e.message}`);
    }
  }

  const timestampIndex = headers.indexOf(config[K.HEADER_LOG_TIMESTAMP]);
  if (timestampIndex !== -1 && allHistory.length > 0) {
    allHistory.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));
    if (vmNameIndex !== -1 && allHistory[0][vmNameIndex]) {
      lastKnownVmName = allHistory[0][vmNameIndex];
    }
  }

  return { history: allHistory, headers: headers, vmName: lastKnownVmName };
}

function analyzeVmProfile(history, headers, config) {
  if (!history || history.length === 0) {
    return "";
  }

  const K = KONSTANTA.KUNCI_KONFIG;
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const actionIndex = headers.indexOf(config[K.HEADER_LOG_ACTION]);
  const detailIndex = headers.indexOf(config[K.HEADER_LOG_DETAIL]);
  const timestampIndex = headers.indexOf(config[K.HEADER_LOG_TIMESTAMP]);

  let modificationCount = 0;
  let recentModificationCount = 0;
  const modifiedColumns = {};

  history.forEach((log) => {
    const action = log[actionIndex];
    const timestamp = new Date(log[timestampIndex]);

    if (action === "MODIFIKASI") {
      modificationCount++;
      if (timestamp > ninetyDaysAgo) {
        recentModificationCount++;
      }

      const detail = log[detailIndex] || "";
      const columnNameMatch = detail.match(/'([^']+)'/);
      if (columnNameMatch) {
        const columnName = columnNameMatch[1];
        modifiedColumns[columnName] = (modifiedColumns[columnName] || 0) + 1;
      }
    }
  });

  let mostModifiedColumn = null;
  let maxMods = 0;
  for (const col in modifiedColumns) {
    if (modifiedColumns[col] > maxMods) {
      maxMods = modifiedColumns[col];
      mostModifiedColumn = col;
    }
  }

  let profileMessage = "<b>Analisis Profil VM:</b>\n";
  profileMessage += `• <b>Frekuensi Perubahan:</b> Total <code>${modificationCount}</code> modifikasi tercatat.\n`;
  if (modificationCount > 0) {
    profileMessage += `  └ <code>${recentModificationCount}</code> di antaranya terjadi dalam 90 hari terakhir.\n`;
  }

  if (mostModifiedColumn) {
    profileMessage += `• <b>Stabilitas Konfigurasi:</b> Kolom '<code>${mostModifiedColumn}</code>' adalah yang paling sering diubah (${maxMods} kali).\n`;
  } else {
    profileMessage += `• <b>Stabilitas Konfigurasi:</b> Konfigurasi terpantau stabil.\n`;
  }

  return profileMessage + "\n";
}
