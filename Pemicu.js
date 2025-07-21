/**
 * @file Pemicu.js
 * @author Djanoer Team
 * @date 2023-02-15
 *
 * @description
 * Pusat untuk semua fungsi yang dirancang untuk dieksekusi oleh pemicu (trigger)
 * berbasis waktu. File ini mengorganisir pekerjaan terjadwal seperti laporan
 * harian, pembersihan, dan pemrosesan antrean.
 */

/**
 * [PINDAH] Menjalankan semua pekerjaan harian: sinkronisasi, laporan, dan pemeriksaan kondisi.
 */
function runDailyJobs() {
  console.log("Memulai pekerjaan harian via trigger...");
  const { config } = getBotState();
  
  syncDanBuatLaporanHarian(false, "TRIGGER HARIAN", config);

  const dsSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
  const vmSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  jalankanPemeriksaanAmbangBatas(config, true, dsSheetData, vmSheetData);
  
  console.log("Pekerjaan harian via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan pembuatan laporan tren mingguan.
 */
function runWeeklyReport() {
  console.log("Memulai laporan mingguan via trigger...");
  buatLaporanPeriodik("mingguan");
  console.log("Laporan mingguan via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan pembuatan laporan tren bulanan.
 */
function runMonthlyReport() {
  console.log("Memulai laporan bulanan via trigger...");
  buatLaporanPeriodik("bulanan");
  console.log("Laporan bulanan via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan semua pekerjaan pembersihan dan pengarsipan.
 */
function runCleanupAndArchivingJobs() {
  console.log("Memulai pekerjaan pembersihan dan arsip via trigger...");
  const { config } = getBotState();
  bersihkanFileEksporTua(config);
  cekDanArsipkanLogJikaPenuh(config);
  cekDanArsipkanLogStorageJikaPenuh(config);
  console.log("Pekerjaan pembersihan dan arsip via trigger selesai.");
}

/**
 * [PINDAH] Menjalankan sinkronisasi data tiket.
 */
function runTicketSync() {
  console.log("Memulai sinkronisasi data tiket via trigger...");
  try {
    syncTiketDataForTrigger();
  } catch (e) {
    console.error(`Sinkronisasi tiket via trigger gagal: ${e.message}`);
  }
}

/**
 * [REFACTOR FINAL] Memproses SATU tugas simulasi dari antrean.
 * Dijalankan setiap menit untuk stabilitas dan ketahanan terhadap error.
 */
function prosesTugasSimulasi() {
  const properties = PropertiesService.getScriptProperties();
  const jobKeys = properties.getKeys().filter((key) => key.startsWith("PENDING_SIMULATION_JOB_"));

  if (jobKeys.length === 0) return; // Tidak ada pekerjaan, keluar.

  const currentJobKey = jobKeys[0]; // Ambil pekerjaan pertama saja
  const jobDataString = properties.getProperty(currentJobKey);
  
  // Hapus pekerjaan dari antrean SEBELUM dieksekusi
  properties.deleteProperty(currentJobKey);

  if (jobDataString) {
    console.log(`Memproses tugas simulasi: ${currentJobKey}`);
    try {
      const { config } = getBotState();
      const jobData = JSON.parse(jobDataString);
      let resultMessage = "";
      if (jobData.subCommand === "cleanup") {
        resultMessage = jalankanSimulasiCleanup(jobData.parameter, config);
      } else if (jobData.subCommand === "migrasi") {
        resultMessage = jalankanSimulasiMigrasi(jobData.parameter, config);
      }
      kirimPesanTelegram(resultMessage, config, "HTML", null, jobData.chatId);
    } catch (e) {
      console.error(`Gagal memproses tugas simulasi ${currentJobKey}. Error: ${e.message}. Tugas ini telah dihapus.`);
    }
  }
}

/**
 * [BARU] Menjalankan proses 'cache warming' secara berkala.
 * Tugasnya hanya menyinkronkan data dan menyimpannya ke cache tanpa mengirim laporan.
 */
function runCacheWarming() {
  console.log("Memulai pekerjaan 'Cache Warming' via trigger...");
  try {
    const { config } = getBotState();
    const sumberId = config[KONSTANTA.KUNCI_KONFIG.ID_SUMBER];
    const sheetVmName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
    
    // 1. Salin data terbaru dari sumber
    salinDataSheet(sheetVmName, sumberId);
    
    // 2. Baca data yang sudah disalin dan simpan ke cache
    const { headers, dataRows } = _getSheetData(sheetVmName);
    if (dataRows.length > 0) {
      saveLargeDataToCache("vm_data", [headers, ...dataRows], 21600); // Simpan selama 6 jam
      console.log("Cache Warming berhasil: Data VM telah diperbarui di cache.");
    }
  } catch (e) {
    console.error(`Pekerjaan 'Cache Warming' gagal: ${e.message}`);
  }
}
