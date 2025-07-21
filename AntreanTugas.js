/**
 * @file AntreanTugas.js
 * @author Djanoer Team
 * @date 2023-06-20
 * @version 2.1.0
 *
 * @description
 * Mengelola sistem antrean tugas (job queue) asinkron menggunakan PropertiesService.
 * Didesain untuk menangani tugas-tugas yang memakan waktu lama (seperti ekspor & sinkronisasi)
 * agar tidak melebihi batas waktu eksekusi Apps Script.
 *
 * @section FUNGSI UTAMA
 * - prosesAntreanTugas(): Fungsi utama yang dipanggil oleh trigger, memproses satu tugas dari antrean.
 * - executeSyncAndReportJob(jobData): Mengeksekusi pekerjaan sinkronisasi penuh dan pelaporan.
 * - executeExportJob(jobData): Mengeksekusi berbagai jenis pekerjaan ekspor data.
 */


/**
 * [REFACTORED V.1.1 - DENGAN DLQ] Memproses SATU tugas dari antrean.
 * Jika terjadi error, pekerjaan akan dipindahkan ke Dead Letter Queue (DLQ)
 * dengan nama 'failed_job_...' untuk diagnosis lebih lanjut.
 */
function prosesAntreanTugas() {
    const properties = PropertiesService.getScriptProperties(); 
    const allKeys = properties.getKeys();
    const jobKeys = allKeys.filter((key) => key.startsWith("job_"));
  
    if (jobKeys.length === 0) return; // Tidak ada pekerjaan, keluar.
  
    console.log(`Ditemukan ${jobKeys.length} pekerjaan dalam antrean. Memproses satu...`);
    const currentJobKey = jobKeys[0];
    const jobDataString = properties.getProperty(currentJobKey);
  
    // Hapus pekerjaan dari antrean SEBELUM dieksekusi untuk mencegah loop tak terbatas
    properties.deleteProperty(currentJobKey);
  
    if (jobDataString) {
      try {
          const jobData = JSON.parse(jobDataString);
          switch(jobData.jobType) {
              case 'export':
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
        // --- BLOK DEAD LETTER QUEUE (DLQ) ---
        console.error(`Gagal memproses pekerjaan ${currentJobKey}. Error: ${e.message}. Memindahkan ke DLQ.`);
  
        // Alih-alih menghapus, simpan kembali dengan nama baru
        const failedJobKey = `failed_${currentJobKey}`;
        properties.setProperty(failedJobKey, jobDataString);
  
        // Kirim notifikasi error ke admin jika memungkinkan
        try {
          const config = bacaKonfigurasi(); // Coba baca config untuk notifikasi
          const errorMessage = `🔴 **Peringatan Sistem** 🔴\n\nSebuah pekerjaan di latar belakang gagal dieksekusi dan telah dipindahkan ke *Dead Letter Queue*.\n\n<b>Kunci Pekerjaan:</b>\n<code>${failedJobKey}</code>\n\n<b>Penyebab Kegagalan:</b>\n<pre>${e.message}</pre>\n\nMohon periksa *PropertiesService* di proyek Apps Script untuk diagnosis lebih lanjut.`;
          kirimPesanTelegram(errorMessage, config, "HTML");
        } catch (notificationError) {
          console.error(`Gagal mengirim notifikasi DLQ: ${notificationError.message}`);
        }
        // --- AKHIR BLOK DLQ ---
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
   * [REFACTORED FINAL] Hanya bertindak sebagai jembatan yang memanggil orkestrator utama.
   */
  function executeSyncAndReportJob(jobData) {
    let config;
    try {
      config = bacaKonfigurasi(); // Baca config terbaru
      const { chatId, statusMessageId, userData } = jobData;
      const triggerSource = `ANTREAN by ${userData ? userData.firstName : 'Trigger'}`;
  
      // Memanggil orkestrator utama di ProsesData.js
      const pesanLaporan = jalankanAlurSinkronisasiPenuh(config, triggerSource);
  
      // Mengirim laporan hasil
      kirimPesanTelegram(pesanLaporan, config, "HTML", null, chatId);
  
      if (statusMessageId) {
        editMessageText(`<b>✅ Proses Selesai</b>`, null, chatId, statusMessageId, config);
      }
    } catch (e) {
      handleCentralizedError(e, `executeSyncAndReportJob`, config, jobData.userData);
      if (jobData.statusMessageId) {
         const errorMessage = `❌ Gagal memproses sinkronisasi.\n\n<i>Penyebab: ${e.message}</i>`;
         if (!config) { try { config = bacaKonfigurasi(); } catch (err) { return; } }
         editMessageText(errorMessage, null, jobData.chatId, jobData.statusMessageId, config);
      }
    }
  }
  