/**
 * @file ManajemenVM.js
 * @author Djanoer Team
 * @date 2023-01-15
 *
 * @description
 * Mengelola semua logika bisnis inti yang berkaitan dengan entitas Virtual Machine (VM).
 * Tanggung jawab utama file ini mencakup pencarian VM, pengambilan detail,
 * pelacakan riwayat perubahan, dan analisis profil VM.
 */

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
      // Ini akan memberikan pesan error yang sangat spesifik
      throw new Error(
        `Header '${headerNameFromConfig}' (dari kunci '${configKey}') tidak dapat ditemukan di sheet "Data VM".\n\n` +
        `Pastikan tidak ada salah ketik atau spasi ekstra.\n` +
        `Header yang tersedia: [${headers.join(", ")}]`
      );
    }
    indices[key + 'Index'] = foundIndex;
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
      const vmName = String(row[nameIndex] || "").trim().toLowerCase();
      const vmIp = String(row[ipIndex] || "").trim().toLowerCase();
      return vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower);
    });
  }

  return { headers, results };
}

function searchVmsByCluster(clusterName, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const sheetName = config[K.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  // 1. Baca SELURUH data dari sheet dalam SATU KALI panggilan.
  const allDataWithHeaders = sheet.getDataRange().getValues();
  const headers = allDataWithHeaders.shift();
  const allData = allDataWithHeaders;

  const clusterHeaderName = config[K.HEADER_VM_CLUSTER];
  const clusterIndex = headers.indexOf(clusterHeaderName);

  if (clusterIndex === -1) {
    throw new Error(`Kolom header untuk cluster ("${clusterHeaderName}") tidak ditemukan di sheet "${sheetName}".`);
  }

  // 2. Lakukan penyaringan di dalam memori, yang sangat cepat.
  const results = allData.filter((row) => {
    // Memastikan perbandingan case-insensitive untuk hasil yang lebih andal
    return String(row[clusterIndex] || "").toLowerCase() === clusterName.toLowerCase();
  });

  return { headers, results };
}

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

  const results = allData.filter(
    (row) => String(row[datastoreIndex] || "").toLowerCase() === datastoreName.toLowerCase()
  );

  return { headers, results };
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
