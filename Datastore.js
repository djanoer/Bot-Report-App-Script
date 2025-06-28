// ===== FILE: Datastore.gs =====

function jalankanPemeriksaanDatastore() {
  console.log("Memulai pemeriksaan perubahan datastore...");
  try {
    const config = bacaKonfigurasi();
    if (!config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]) {
      console.warn("Pemeriksaan datastore dibatalkan: NAMA_SHEET_DATASTORE tidak diatur.");
      return;
    }

    // [OPTIMALISASI] Definisikan parameter untuk fungsi generik
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_DS];
    const archiveFileName = KONSTANTA.NAMA_FILE.ARSIP_DS;
    const primaryKeyHeader = config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER];
    // Untuk Datastore, kita hanya memantau perubahan kapasitas
    const columnsToTrack = [{nama: KONSTANTA.HEADER_DS.CAPACITY_TB}];

    // [OPTIMALISASI] Panggil fungsi generik untuk proses deteksi perubahan
    const logEntriesToAdd = processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, 'Datastore');

    if (logEntriesToAdd.length > 0) {
      kirimPesanTelegram(`🔔 Terdeteksi ${logEntriesToAdd.length} perubahan pada infrastruktur datastore. Silakan cek /cekhistory untuk detail.`, config);
    } else {
      console.log("Tidak ada perubahan pada data datastore.");
    }
     console.log("Pemeriksaan perubahan datastore selesai.");

  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan datastore: ${e.message}`);
    kirimPesanTelegram(`<b>⚠️ Gagal Menjalankan Pemeriksaan Datastore!</b>\n\n<code>${escapeHtml(e.message)}</code>`, bacaKonfigurasi(), 'HTML');
  }
}