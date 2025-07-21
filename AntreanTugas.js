/**
 * @file AntreanTugas.js
 * @author Djanoer Team
 * @date 2023-06-20
 * @version 2.1.0
 *
 * @description
 * Mengelola sistem antrean tugas (job queue) asinkron menggunakan PropertiesService.
 * Didesain untuk menangani tugas-tugas yang memakan waktu lama (seperti ekspor & simulasi)
 * agar tidak melebihi batas waktu eksekusi Apps Script.
 *
 * @section FUNGSI UTAMA
 * - prosesAntreanTugas(): Fungsi utama yang dipanggil oleh trigger, memproses satu tugas dari antrean.
 *
 * @section FUNGSI PEMBANTU (Internal)
 * - executeMenuExportJob(jobData): Mengeksekusi tugas ekspor yang berasal dari menu interaktif.
 * - executeSimulationJob(jobData): Mengeksekusi tugas simulasi.
 * - executeSyncAndReportJob(jobData): Mengeksekusi tugas sinkronisasi penuh.
 */

function prosesAntreanTugas() {
    const properties = PropertiesService.getScriptProperties(); 
    const allKeys = properties.getKeys();
    const jobKeys = allKeys.filter((key) => key.startsWith("job_"));

    if (jobKeys.length === 0) return;

    console.log(`Ditemukan ${jobKeys.length} pekerjaan dalam antrean. Memproses satu...`);
    const currentJobKey = jobKeys[0];
    const jobDataString = properties.getProperty(currentJobKey);
    properties.deleteProperty(currentJobKey);

    if (jobDataString) {
      try {
          const jobData = JSON.parse(jobDataString);
          switch(jobData.jobType) {
              case 'export':
                  // Memanggil fungsi yang benar dari file Ekspor.js
                  executeExportJob(jobData);
                  break;
              case 'export_menu':
                  executeMenuExportJob(jobData);
                  break;
              case 'simulation':
                  executeSimulationJob(jobData);
                  break;
              case 'sync_and_report':
                  executeSyncAndReportJob(jobData);
                  break;
              default:
                  console.warn(`Jenis pekerjaan tidak dikenal: ${jobData.jobType}`);
          }
      } catch (e) {
        console.error(`Gagal memproses pekerjaan ${currentJobKey}. Error: ${e.message}`);
      }
    }
}
  
/**
 * [HELPER] Mengeksekusi pekerjaan ekspor yang berasal dari menu /export.
 * Versi ini telah diperbaiki untuk menggunakan 'exportType' string yang benar.
 */
function executeMenuExportJob(jobData) {
    const { config, userData, chatId, context, statusMessageId } = jobData;
    const { exportType } = context;
    let title = exportType.replace(/_/g, " ").toUpperCase(); // Judul default

    try {
        let headers, data, highlightColumn = null;
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const K = KONSTANTA.KUNCI_KONFIG;

        switch (exportType) {
            // ... (semua case dari 'log_today' hingga 'uptime_invalid' tetap sama) ...
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
                throw new Error(`Tipe ekspor menu tidak dikenal: ${exportType}`);
        }

        if (data && headers && headers.length > 0) {
            if (data.length > 0) {
                exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
                // Edit pesan "tunggu" menjadi pesan sukses
                if (statusMessageId) {
                    const successMessage = `✅ Laporan "<b>${title}</b>" telah berhasil dibuat dan dikirimkan.`;
                    editMessageText(successMessage, null, chatId, statusMessageId, config);
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
            throw new Error("Gagal mengumpulkan data atau header untuk ekspor.");
        }

    } catch(e) {
        handleCentralizedError(e, `executeMenuExportJob`, config, userData);
        // Jika terjadi error, edit pesan "tunggu" menjadi pesan gagal
        if (statusMessageId) {
            const errorMessage = `❌ Gagal memproses ekspor "<b>${title}</b>".\n\n<i>Penyebab: ${e.message}</i>`;
            editMessageText(errorMessage, null, chatId, statusMessageId, config);
        }
    }
}

/**
 * [HELPER] Mengeksekusi pekerjaan simulasi.
 */
function executeSimulationJob(jobData) {
    try {
        const { config, context, chatId } = jobData;
        let resultMessage = "";

        if (context.subCommand === "cleanup") {
            resultMessage = jalankanSimulasiCleanup(context.parameter, config);
        } else if (context.subCommand === "migrasi") {
            resultMessage = jalankanSimulasiMigrasi(context.parameter, config);
        }
        
        kirimPesanTelegram(resultMessage, config, "HTML", null, chatId);
    } catch (e) {
        handleCentralizedError(e, `executeSimulationJob`, jobData.config, userData || null);
    }
}

/**
 * [HELPER BARU] Mengeksekusi pekerjaan sinkronisasi penuh.
 */
function executeSyncAndReportJob(jobData) {
    try {
        const { config, chatId, userData } = jobData;
        syncDanBuatLaporanHarian(false, `MANUAL by ${userData.firstName}`);
        kirimPesanTelegram(`✅ Laporan sinkronisasi penuh telah selesai dibuat dan dikirim.`, config, "HTML", null, chatId);
    } catch (e) {
        handleCentralizedError(e, `executeSyncAndReportJob`, jobData.config, userData || null);
    }
}