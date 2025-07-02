// ===== FILE: Datastore.gs =====

/**
 * [PERBAIKAN] Menjalankan pemeriksaan perubahan datastore dan MENCATATNYA ke log.
 * Fungsi ini sekarang memanggil processDataChanges untuk memastikan semua perubahan
 * kapasitas datastore tercatat di sheet "Log Perubahan".
 * @param {object} config - Objek konfigurasi yang diteruskan dari fungsi pemanggil.
 */
function jalankanPemeriksaanDatastore(config) {
  console.log("Memulai pemeriksaan perubahan datastore...");
  try {
    // [PERBAIKAN] Menggunakan nilai kunci langsung dari objek config.
    const sheetName = config['NAMA_SHEET_DATASTORE'];
    if (!sheetName) {
      console.warn("Pemeriksaan datastore dibatalkan: 'NAMA_SHEET_DATASTORE' tidak diatur di Konfigurasi.");
      return; // Berhenti dengan tenang jika tidak ada sheet datastore.
    }

    const archiveFileName = 'archive_datastore.json';
    const primaryKeyHeader = config['HEADER_DATASTORE_NAME'];
    
    // Secara spesifik menargetkan kolom 'Capacity (TB)' untuk dipantau perubahannya.
    const kolomUntukDipantau = 'Capacity (TB)'; 
    const columnsToTrack = [{nama: kolomUntukDipantau}];

    console.log(`Memantau perubahan pada sheet: '${sheetName}'`);
    console.log(`Kolom yang dipantau untuk perubahan: '${kolomUntukDipantau}'`);

    // [PERBAIKAN KUNCI] Memanggil fungsi generik untuk proses deteksi dan pencatatan perubahan.
    const logEntriesToAdd = processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, 'Datastore');

    if (logEntriesToAdd.length > 0) {
      // Mengirim notifikasi yang lebih spesifik.
      const pesanNotifikasi = `🔔 Terdeteksi ${logEntriesToAdd.length} perubahan kapasitas pada infrastruktur datastore. Silakan cek /cekhistory untuk detail.`;
      kirimPesanTelegram(pesanNotifikasi, config);
      console.log(pesanNotifikasi);
    } else {
      console.log("Tidak ada perubahan pada data kapasitas datastore yang terdeteksi.");
    }
     console.log("Pemeriksaan perubahan datastore selesai.");

  } catch (e) {
    // Melempar error kembali agar bisa ditangkap oleh fungsi pemanggil (misal: syncDanBuatLaporanHarian).
    throw new Error(`Gagal Menjalankan Pemeriksaan Datastore. Penyebab: ${e.message}`);
  }
}