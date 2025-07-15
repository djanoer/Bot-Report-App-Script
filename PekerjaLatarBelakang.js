// ===== FILE: PekerjaLatarBelakang.gs =====

/**
 * Fungsi ini dirancang untuk dijalankan oleh trigger setiap menit.
 * Ia memeriksa apakah ada tugas simulasi yang tertunda dan menjalankannya.
 */
function prosesTugasSimulasi() {
  const properties = PropertiesService.getScriptProperties();
  const allKeys = properties.getKeys();
  const jobKeys = allKeys.filter((key) => key.startsWith("PENDING_SIMULATION_JOB_"));

  // Jika tidak ada tugas, hentikan eksekusi
  if (jobKeys.length === 0) {
    return;
  }

  console.log(`Ditemukan ${jobKeys.length} tugas simulasi. Memproses satu per satu...`);
  const { config } = getBotState();

  // Proses satu tugas per eksekusi untuk menghindari timeout
  const currentJobKey = jobKeys[0];
  const jobDataString = properties.getProperty(currentJobKey);

  // Hapus tugas dari antrean SEGERA agar tidak dieksekusi ganda
  properties.deleteProperty(currentJobKey);

  if (jobDataString) {
    try {
      const jobData = JSON.parse(jobDataString);
      let resultMessage = "";

      // Jalankan fungsi simulasi yang sesuai
      if (jobData.subCommand === "cleanup") {
        resultMessage = jalankanSimulasiCleanup(jobData.parameter, config);
      } else if (jobData.subCommand === "migrasi") {
        resultMessage = jalankanSimulasiMigrasi(jobData.parameter, config);
      }

      // Kirim hasil akhir sebagai pesan BARU ke chat asal
      kirimPesanTelegram(resultMessage, config, "HTML", null, jobData.chatId);
    } catch (e) {
      console.error(`Gagal memproses tugas simulasi ${currentJobKey}. Error: ${e.message}`);
    }
  }
}
