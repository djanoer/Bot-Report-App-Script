/**
 * @file Ekspor.js
 * @author Djanoer Team
 * @date 2023-08-11
 *
 * @description
 * Mengelola semua logika yang berkaitan dengan ekspor data ke Google Sheets.
 * File ini menangani permintaan ekspor, memproses data, dan membuat file
 * laporan di Google Drive.
 */

/**
 * [PINDAH] Mengekspor data ke Google Sheet dengan logika pengurutan otomatis.
 */
function exportResultsToSheet(headers, dataRows, title, config, userData, highlightColumnName = null) {
  const folderId = config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR];
  if (!folderId) {
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor: Konfigurasi FOLDER_ID_HASIL_EKSPOR tidak ditemukan.`, config);
    return;
  }

  if (userData && !userData.email) {
    kirimPesanTelegram(`⚠️ Gagal membagikan file: Email untuk pengguna dengan ID ${userData.userId || "tidak dikenal"} tidak ditemukan di sheet 'Hak Akses'.`, config);
    return;
  }

  try {
    const critHeaderName = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_KRITIKALITAS];
    const critIndex = headers.indexOf(critHeaderName);

    if (critIndex !== -1 && dataRows.length > 0) {
      const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
      dataRows.sort((a, b) => {
        const critA = String(a[critIndex] || "").toUpperCase().trim();
        const critB = String(b[critIndex] || "").toUpperCase().trim();
        const scoreA = skorKritikalitas[critA] || -1;
        const scoreB = skorKritikalitas[critB] || -1;
        return scoreB - scoreA;
      });
    }

    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const fileName = `Laporan - ${title.replace(/<|>/g, "")} - ${timestamp}`;
    const newSs = SpreadsheetApp.create(fileName);
    const sheet = newSs.getSheets()[0];
    sheet.setName(title.substring(0, 100));

    sheet.getRange("A1").setValue(title).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
    sheet.getRange(1, 1, 1, headers.length).merge();
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    if (dataRows.length > 0) {
      sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
    }

    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() > 2 ? sheet.getLastRow() - 1 : 1, headers.length);
    if (highlightColumnName) {
      const highlightColIndex = headers.indexOf(highlightColumnName) + 1;
      if (highlightColIndex > 0) {
        sheet.getRange(2, highlightColIndex, dataRange.getNumRows()).setBackground("#FFF2CC");
      }
    }
    dataRange.createFilter();
    headers.forEach((_, i) => sheet.autoResizeColumn(i + 1));

    const file = DriveApp.getFileById(newSs.getId());
    const folder = DriveApp.getFolderById(folderId);
    file.moveTo(folder);
    const fileUrl = file.getUrl();

    let pesanFile;
    if (userData && userData.email) {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      file.addViewer(userData.email);
      const userMention = `<a href="tg://user?id=${userData.userId}">${escapeHtml(userData.firstName || "Pengguna")}</a>`;
      pesanFile = `${userMention}, file ekspor Anda untuk "<b>${escapeHtml(title)}</b>" sudah siap.\n\nFile ini telah dibagikan secara pribadi ke email Anda.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    } else {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      pesanFile = `📄 Laporan sistem "<b>${escapeHtml(title)}</b>" telah dibuat.\n\nSilakan akses file melalui tautan di bawah ini.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    }

    kirimPesanTelegram(pesanFile, config, "HTML");
  } catch (e) {
    console.error(`Gagal mengekspor hasil ke sheet: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor. Error: ${e.message}`, config);
  }
}

/**
* [REFACTOR FINAL] Fungsi spesialis untuk menangani semua permintaan ekspor kategori Uptime.
* Versi ini menggunakan tipe ekspor dari sesi secara langsung.
*/
function processUptimeExport(exportType, config) {
  let categoryName, minDays, maxDays, isInvalidCheck = false, sortAscending = true;

  // --- PERBAIKAN UTAMA: Menggunakan 'exportType' secara langsung di switch ---
  switch (exportType) {
    case "uptime_cat_1": 
        minDays = 0; maxDays = 365; categoryName = "Uptime < 1 Tahun"; 
        break;
    case "uptime_cat_2": 
        minDays = 366; maxDays = 730; categoryName = "Uptime 1-2 Tahun"; 
        break;
    case "uptime_cat_3": 
        minDays = 731; maxDays = 1095; categoryName = "Uptime 2-3 Tahun"; 
        break;
    case "uptime_cat_4": 
        minDays = 1096; maxDays = Infinity; categoryName = "Uptime > 3 Tahun"; sortAscending = false; 
        break;
    case "uptime_invalid": 
        isInvalidCheck = true; categoryName = "Data Uptime Tidak Valid"; 
        break;
    default: 
        // Mengembalikan null jika tipe tidak cocok, untuk penanganan error yang lebih baik
        return null;
  }

  const { headers, dataRows } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  const uptimeHeaderName = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_UPTIME];
  const uptimeIndex = headers.indexOf(uptimeHeaderName);
  if (uptimeIndex === -1) throw new Error(`Kolom '${uptimeHeaderName}' tidak ditemukan.`);

  let filteredData = dataRows.filter((row) => {
    const uptimeValue = row[uptimeIndex];
    const uptimeDays = parseInt(uptimeValue, 10);
    if (isInvalidCheck) return uptimeValue === "" || uptimeValue === "-" || isNaN(uptimeDays);
    return !isNaN(uptimeDays) && uptimeDays >= minDays && uptimeDays <= maxDays;
  });

  if (filteredData.length > 0 && !isInvalidCheck) {
    filteredData.sort((a, b) => {
      const uptimeA = parseInt(a[uptimeIndex], 10) || 0;
      const uptimeB = parseInt(b[uptimeIndex], 10) || 0;
      return sortAscending ? uptimeA - uptimeB : uptimeB - uptimeA;
    });
  }

  const reportDate = new Date().toLocaleDateString("id-ID");
  const dynamicTitle = `Laporan VM - ${categoryName} per ${reportDate}`;

  return { headers: headers, data: filteredData, title: dynamicTitle };
}  

function exportMachine(update, config, userData) {
const callbackQuery = update.callback_query;
const sessionData = callbackQuery.sessionData;
const exportType = sessionData.type;
const chatId = callbackQuery.message.chat.id;

let statusMessageId = null;

try {
  // Beri notifikasi singkat bahwa tombol sudah ditekan
  answerCallbackQuery(callbackQuery.id, config, `Memproses permintaan...`);

  // Gunakan helper baru untuk mendapatkan judul yang profesional
  const friendlyTitle = _getFriendlyExportTitle(exportType);
  const waitMessage = `⏳ Harap tunggu, sedang memproses permintaan ekspor Anda untuk "<b>${friendlyTitle}</b>"...`;

  const sentMessage = kirimPesanTelegram(waitMessage, config, "HTML", null, chatId);
  if (sentMessage && sentMessage.ok) {
    statusMessageId = sentMessage.result.message_id;
  }

  // Buat tiket tugas dan sertakan ID pesan "tunggu"
  const jobData = {
    jobType: 'export_menu',
    context: { exportType: exportType },
    config: config,
    userData: userData,
    chatId: chatId,
    statusMessageId: statusMessageId // Sertakan ID pesan di sini
  };

  const jobKey = `job_${callbackQuery.from.id}_${Date.now()}`;
  PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));

} catch (e) {
  handleCentralizedError(e, `Permintaan Ekspor (Gagal Antre) (${exportType})`, config, userData);
  if (statusMessageId) {
    editMessageText(`⚠️ Terjadi kesalahan saat menambahkan tugas ke antrean.`, null, chatId, statusMessageId, config);
  }
}
}

/**
* [HELPER BARU] Menerjemahkan exportType internal menjadi judul yang ramah pengguna.
* @param {string} exportType - Tipe ekspor internal (mis. "log_7_days").
* @returns {string} Judul yang sudah diformat untuk ditampilkan ke pengguna.
*/
function _getFriendlyExportTitle(exportType) {
switch (exportType) {
  case "log_today": return "Log Hari Ini";
  case "log_7_days": return "Log 7 Hari Terakhir";
  case "log_30_days": return "Log 30 Hari Terakhir";
  case "uptime_cat_1": return "VM Uptime < 1 Tahun";
  case "uptime_cat_2": return "VM Uptime 1-2 Tahun";
  case "uptime_cat_3": return "VM Uptime 2-3 Tahun";
  case "uptime_cat_4": return "VM Uptime > 3 Tahun";
  case "uptime_invalid": return "VM dengan Uptime Tidak Valid";
  case "all_vms": return "Semua Data VM";
  case "vms_vc01": return "Data VM di VC01";
  case "vms_vc02": return "Data VM di VC02";
  default: return "Laporan Kustom";
}
}

/**
* [PINDAH & REFACTOR] Mengeksekusi satu pekerjaan ekspor dari antrean.
* Versi ini telah diperbaiki untuk menangani semua jenis ekspor kontekstual.
*/
function executeExportJob(jobData) {
const { config, userData, chatId, statusMessageId, context } = jobData;
let title = "Laporan Kontekstual"; // Judul default

try {
  let headers, results;

  // --- LOGIKA BARU YANG LEBIH CERDAS ---
  // Periksa isi dari 'context' untuk menentukan jenis ekspor
  if (context.pk || context.timeframe) {
    // Ini adalah permintaan ekspor RIWAYAT
    const searchResults = context.pk ? getVmHistory(context.pk, config) : getCombinedLogs(new Date(0), config);
    title = context.pk ? `Laporan Riwayat - PK ${context.pk}` : `Laporan Riwayat Perubahan Hari Ini`;
    headers = searchResults.headers;
    results = searchResults.history || searchResults.data;
  } 
  else if (context.listType) {
    // Ini adalah permintaan ekspor DAFTAR VM (Cluster/Datastore)
    const { listType, itemName } = context;
    const searchFunction = listType === "cluster" ? searchVmsByCluster : searchVmsByDatastore;
    const searchResults = searchFunction(itemName, config);
    const friendlyListType = listType.charAt(0).toUpperCase() + listType.slice(1);
    title = `Laporan VM di ${friendlyListType} - ${itemName}`;
    headers = searchResults.headers;
    results = searchResults.results;
  } else if (context.searchTerm) {
    // Ini adalah permintaan ekspor HASIL PENCARIAN
    const { searchTerm } = context;
    const searchResults = searchVmOnSheet(searchTerm, config);
    title = `Laporan Hasil Pencarian - '${searchTerm}'`;
    headers = searchResults.headers;
    results = searchResults.results;
  } else {
    // Jika tidak ada konteks yang cocok, baru lempar error
    throw new Error("Data pekerjaan ekspor tidak valid atau konteks tidak dikenali.");
  }

  if (!results || results.length === 0) {
    const noDataMessage = `ℹ️ Tidak ada data untuk diekspor untuk permintaan: "<b>${title}</b>".`;
    if (statusMessageId) {
      editMessageText(noDataMessage, null, chatId, statusMessageId, config);
    } else {
      kirimPesanTelegram(noDataMessage, config, "HTML", null, chatId);
    }
    return;
  }

  exportResultsToSheet(headers, results, title, config, userData);
  if (statusMessageId) {
    const successMessage = `✅ Laporan "<b>${title}</b>" telah berhasil dibuat dan dikirimkan.`;
    editMessageText(successMessage, null, chatId, statusMessageId, config);
  }

} catch (e) {
  console.error(`Gagal mengeksekusi pekerjaan ekspor: ${JSON.stringify(jobData)}. Error: ${e.message}`);
  if (statusMessageId) {
      const errorMessage = `❌ Gagal memproses ekspor "<b>${title}</b>".\n\n<i>Penyebab: ${e.message}</i>`;
      editMessageText(errorMessage, null, chatId, statusMessageId, config);
  } else if (config && chatId) {
      kirimPesanTelegram(`🔴 Gagal memproses file ekspor Anda.\n<code>Penyebab: ${escapeHtml(e.message)}</code>`, config, "HTML", null, chatId);
  }
}
}
