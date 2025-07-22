/**
 * @file Pemicu.js
 * @author Djanoer Team
 * @date 2023-02-15
 *
 * @description
 * Pusat untuk semua fungsi yang dirancang untuk dieksekusi oleh pemicu (trigger)
 * berbasis waktu. File ini mengorganisir pekerjaan terjadwal seperti laporan
 * harian, pembersihan, dan pemrosesan antrean.
 *
 * @section FUNGSI UTAMA
 * - runDailyJobs(): Pemicu utama harian, mendelegasikan sinkronisasi ke antrean.
 * - runWeeklyReport(): Menjalankan pembuatan laporan tren mingguan.
 * - runMonthlyReport(): Menjalankan pembuatan laporan tren bulanan.
 * - prosesAntreanTugas(): (Meskipun di file lain) Fungsi ini dipanggil oleh pemicu dari file ini.
 */

/**
 * [REFACTORED V.1.2] Menjalankan semua pekerjaan harian dengan mendelegasikannya
 * ke sistem antrean untuk memastikan eksekusi yang andal dan asinkron.
 */
function runDailyJobs() {
  console.log("Memulai pendelegasian pekerjaan harian via trigger...");
  const { config } = getBotState();

  // 1. Buat tiket pekerjaan (job) untuk sinkronisasi dan laporan harian
  const targetChatId = config.ENVIRONMENT === "DEV" ? config.TELEGRAM_CHAT_ID_DEV : config.TELEGRAM_CHAT_ID;

  // 2. Buat tiket pekerjaan dengan Chat ID yang sudah benar.
  const jobData = {
    jobType: "sync_and_report",
    chatId: targetChatId, // Menggunakan ID yang sudah dinamis
    statusMessageId: null, // Tidak ada pesan untuk diperbarui karena ini otomatis
    userData: { firstName: "Trigger Harian" },
  };

  // 2. Tambahkan pekerjaan ke antrean
  const jobKey = `job_daily_sync_${Date.now()}`;
  PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));

  console.log(`Pekerjaan sinkronisasi harian '${jobKey}' berhasil ditambahkan ke antrean.`);

  // Catatan: Pemeriksaan ambang batas (jalankanPemeriksaanAmbangBatas) dapat tetap di sini
  // jika prosesnya ringan, atau dapat juga dijadikan job terpisah jika berat.
  // Untuk saat ini, kita biarkan di sini demi kesederhanaan.
  try {
    const { pesan, keyboard } = jalankanPemeriksaanAmbangBatas(config);
    if (keyboard) {
      // Hanya kirim jika ada peringatan
      kirimPesanTelegram(pesan, config, "HTML", keyboard);
    }
  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan ambang batas saat pemicu harian: ${e.message}`);
  }
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
