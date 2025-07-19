// ===== FILE: AntreanTugas.gs =====

/**
 * [REFACTORED v2.1.0] Fungsi terpusat yang dirancang untuk dijalankan oleh trigger setiap menit.
 * Kini menangani semua jenis pekerjaan, termasuk ekspor dari menu utama.
 */
function prosesAntreanTugas() {
    const properties = PropertiesService.getUserProperties();
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
                  executeContextualExportJob(jobData); // Nama fungsi diubah agar lebih jelas
                  break;
              case 'export_menu': // <<< BLOK BARU UNTUK MENANGANI /export
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
   * Fungsi ini berisi semua logika untuk mengumpulkan data berdasarkan jenis
   * ekspor yang dipilih dan memanggil fungsi pembuat sheet.
   */
  function executeMenuExportJob(jobData) {
      try {
          const { config, userData, chatId, context } = jobData;
          const { exportType } = context;
          
          let headers, data, title, highlightColumn = null;
          const ss = SpreadsheetApp.getActiveSpreadsheet();
          const K = KONSTANTA.KUNCI_KONFIG;
  
          // Logika utama untuk menentukan data apa yang akan diekspor
          switch (exportType) {
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
  
              case KONSTANTA.CALLBACK.EXPORT_ALL_VMS:
              case KONSTANTA.CALLBACK.EXPORT_VC01_VMS:
              case KONSTANTA.CALLBACK.EXPORT_VC02_VMS: {
                  const vmSheet = ss.getSheetByName(config[K.SHEET_VM]);
                  if (!vmSheet) throw new Error(`Sheet data utama '${config[K.SHEET_VM]}' tidak ditemukan.`);
  
                  headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
                  const allVmData = vmSheet.getLastRow() > 1 ? vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues() : [];
  
                  if (exportType === KONSTANTA.CALLBACK.EXPORT_ALL_VMS) {
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
                      highlightColumn = config[K.HEADER_VM_UPTIME];
                  }
                  break;
              }
              default:
                  throw new Error(`Tipe ekspor menu tidak dikenal: ${exportType}`);
          }
          
          // Setelah data terkumpul, kirim untuk dibuatkan file
          if (data && headers && headers.length > 0) {
              if (data.length > 0) {
                  exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
              } else {
                  kirimPesanTelegram(`ℹ️ Tidak ada data yang dapat diekspor untuk kategori "<b>${title}</b>".`, config, "HTML", null, chatId);
              }
          } else {
              kirimPesanTelegram(`⚠️ Gagal memproses permintaan: Tidak dapat menemukan data atau header yang diperlukan untuk ekspor ini.`, config, "HTML", null, chatId);
          }
  
      } catch(e) {
          handleCentralizedError(e, `executeMenuExportJob`, jobData.config, userData || null);
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