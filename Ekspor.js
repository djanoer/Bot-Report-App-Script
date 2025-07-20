// ===== FILE: Ekspor.gs =====

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

/**
* [REFACTOR FINAL] Mengendalikan semua permintaan ekspor dari menu interaktif.
* Fungsi ini sekarang menggunakan tipe ekspor dari data sesi secara langsung.
*/
function handleExportRequest(update, config, userData) {
  const callbackQuery = update.callback_query;
  const sessionData = callbackQuery.sessionData;
  const exportType = sessionData.type; // Mengambil tipe dari sesi
  
  const chatId = callbackQuery.message.chat.id;
  
  let statusMessageId = null;
  try {
    const titleForStatus = exportType.replace(/_/g, " ").toUpperCase();
    const sentMessage = kirimPesanTelegram(
      `⏳ Memulai proses ekspor untuk <b>${titleForStatus}</b>... Harap tunggu.`,
      config, "HTML", null, chatId
    );
    if (sentMessage && sentMessage.ok) {
      statusMessageId = sentMessage.result.message_id;
    }
  } catch (e) {
    console.warn(`Gagal mengirim pesan status awal untuk ekspor: ${e.message}`);
  }

  try {
    let headers, data, title, highlightColumn = null;
    const K = KONSTANTA.KUNCI_KONFIG;

    // --- PERBAIKAN UTAMA: Menggunakan 'exportType' secara langsung di switch ---
    switch (exportType) {
      case "log_today":
      case "log_7_days":
      case "log_30_days": {
        const now = new Date();
        let startDate = new Date();
        if (exportType === "log_today") {
          startDate.setHours(0, 0, 0, 0);
          title = "Log Perubahan Hari Ini (Termasuk Arsip)";
        } else if (exportType === "log_7_days") {
          startDate.setDate(now.getDate() - 7);
          title = "Log Perubahan 7 Hari Terakhir (Termasuk Arsip)";
        } else {
          startDate.setDate(now.getDate() - 30);
          title = "Log Perubahan 30 Hari Terakhir (Termasuk Arsip)";
        }
        const combinedLogResult = getCombinedLogs(startDate, config);
        headers = combinedLogResult.headers;
        data = combinedLogResult.data;
        highlightColumn = config[K.HEADER_LOG_ACTION];
        break;
      }

      case "all_vms":
      case "vms_vc01":
      case "vms_vc02": {
        const { headers: vmHeaders, dataRows: allVmData } = _getSheetData(config[K.SHEET_VM]);
        headers = vmHeaders;

        if (exportType === "all_vms") {
          data = allVmData;
          title = "Semua Data VM";
        } else {
          const vcenterHeaderName = config[K.HEADER_VM_VCENTER];
          const vcenterIndex = headers.indexOf(vcenterHeaderName);
          if (vcenterIndex === -1) throw new Error(`Kolom '${vcenterHeaderName}' tidak ditemukan.`);
          
          const vcenter = exportType.split("_").pop().toUpperCase();
          data = allVmData.filter((row) => String(row[vcenterIndex]).toUpperCase() === vcenter);
          title = `Data VM di ${vcenter}`;
        }
        highlightColumn = config[K.HEADER_VM_VCENTER];
        break;
      }

      case "uptime_cat_1":
      case "uptime_cat_2":
      case "uptime_cat_3":
      case "uptime_cat_4":
      case "uptime_invalid": {
        // Fungsi processUptimeExport perlu sedikit penyesuaian
        const result = processUptimeExport(exportType, config);
        if (result) {
          headers = result.headers;
          data = result.data;
          title = result.title;
          highlightColumn = config[K.HEADER_VM_UPTIME];
        }
        break;
      }
      
      default:
        // Menambahkan default case untuk menangani tipe yang tidak dikenal
        throw new Error(`Tipe ekspor tidak dikenal: ${exportType}`);
    }

    if (data && headers && headers.length > 0) {
      if (data.length > 0) {
        exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
        if (statusMessageId) {
          editMessageText(`✅ Proses ekspor untuk <b>${title}</b> telah selesai. Hasilnya telah dikirimkan.`, null, chatId, statusMessageId, config);
        }
      } else {
        const noDataMessage = `ℹ️ Tidak ada data yang dapat diekspor untuk kategori "<b>${title}</b>".`;
        if (statusMessageId) {
          editMessageText(noDataMessage, null, chatId, statusMessageId, config);
        } else {
          kirimPesanTelegram(noDataMessage, config, "HTML", null, chatId);
        }
      }
    } else {
      const failMessage = `⚠️ Gagal memproses permintaan: Tidak dapat menemukan data untuk ekspor "${exportType}".`;
      if (statusMessageId) {
        editMessageText(failMessage, null, chatId, statusMessageId, config);
      } else {
        kirimPesanTelegram(failMessage, config, "HTML", null, chatId);
      }
    }
  } catch (e) {
    handleCentralizedError(e, `Permintaan Ekspor (${exportType})`, config, userData);
    const errorMessage = `⚠️ Terjadi kesalahan saat memproses ekspor Anda.\n<code>${escapeHtml(e.message)}</code>`;
    if (statusMessageId) {
      editMessageText(errorMessage, null, chatId, statusMessageId, config);
    } else {
      kirimPesanTelegram(errorMessage, config, "HTML", null, chatId);
    }
  }
}

/**
 * [PINDAH] Mengeksekusi satu pekerjaan ekspor dari antrean.
 */
function executeExportJob(jobData) {
  try {
    const { config, userData, chatId } = jobData;
    let searchResults;
    let title, headers, results;

    if (jobData.jobType === "history") {
      const context = jobData.context;
      searchResults = context.pk ? getVmHistory(context.pk, config) : getCombinedLogs(new Date(0), config);
      title = context.pk ? `Laporan Riwayat - PK ${context.pk}` : `Laporan Riwayat Perubahan Hari Ini`;
      headers = searchResults.headers;
      results = searchResults.history || searchResults.data;
    } else {
      if (jobData.listType) {
        const { listType, itemName } = jobData;
        const searchFunction = listType === "cluster" ? searchVmsByCluster : searchVmsByDatastore;
        searchResults = searchFunction(itemName, config);
        const friendlyListType = listType.charAt(0).toUpperCase() + listType.slice(1);
        title = `Laporan VM di ${friendlyListType} - ${itemName}`;
      } else if (jobData.searchTerm) {
        const { searchTerm } = jobData;
        searchResults = searchVmOnSheet(searchTerm, config);
        title = `Laporan Hasil Pencarian - '${searchTerm}'`;
      } else {
        throw new Error("Data pekerjaan ekspor tidak valid.");
      }
      headers = searchResults.headers;
      results = searchResults.results;
    }

    if (!results || results.length === 0) {
      kirimPesanTelegram(`ℹ️ Tidak ada data untuk diekspor untuk permintaan: "${title}".`, config, "HTML", null, chatId);
      return;
    }
    exportResultsToSheet(headers, results, title, config, userData);
  } catch (e) {
    console.error(`Gagal mengeksekusi pekerjaan ekspor: ${JSON.stringify(jobData)}. Error: ${e.message}`);
    if (jobData.config && jobData.chatId) {
      kirimPesanTelegram(`🔴 Gagal memproses file ekspor Anda.\n<code>Penyebab: ${escapeHtml(e.message)}</code>`, jobData.config, "HTML", null, jobData.chatId);
    }
  }
}
