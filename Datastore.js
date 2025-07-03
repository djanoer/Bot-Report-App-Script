// ===== FILE: Datastore.gs =====

/**
 * [REVISI KONSISTENSI] Menjalankan pemeriksaan perubahan datastore, mencatatnya ke log,
 * dan MENGEMBALIKAN pesan notifikasi jika ada perubahan.
 * @param {object} config - Objek konfigurasi yang diteruskan dari fungsi pemanggil.
 * @returns {string|null} String pesan notifikasi jika ada perubahan, atau null jika tidak ada.
 */
function jalankanPemeriksaanDatastore(config) {
  console.log("Memulai pemeriksaan perubahan datastore...");
  try {
    const sheetName = config['NAMA_SHEET_DATASTORE'];
    if (!sheetName) {
      console.warn("Pemeriksaan datastore dibatalkan: 'NAMA_SHEET_DATASTORE' tidak diatur di Konfigurasi.");
      return null;
    }

    const archiveFileName = KONSTANTA.NAMA_FILE.ARSIP_DS;
    const primaryKeyHeader = config['HEADER_DATASTORE_NAME'];
    const kolomUntukDipantau = 'Capacity (TB)'; 
    const columnsToTrack = [{nama: kolomUntukDipantau}];

    console.log(`Memantau perubahan pada sheet: '${sheetName}'`);
    console.log(`Kolom yang dipantau untuk perubahan: '${kolomUntukDipantau}'`);

    const logEntriesToAdd = processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, KONSTANTA.NAMA_ENTITAS.DATASTORE);

    if (logEntriesToAdd.length > 0) {
      const pesanNotifikasi = `🔔 Terdeteksi ${logEntriesToAdd.length} perubahan kapasitas pada infrastruktur ${KONSTANTA.NAMA_ENTITAS.DATASTORE}. Silakan cek /cekhistory untuk detail.`;
      console.log(pesanNotifikasi);
      // [PERUBAHAN UTAMA] Kembalikan pesan sebagai string, jangan kirim.
      return pesanNotifikasi;
    } else {
      console.log("Tidak ada perubahan pada data kapasitas datastore yang terdeteksi.");
      return null;
    }
  } catch (e) {
    throw new Error(`Gagal Menjalankan Pemeriksaan Datastore. Penyebab: ${e.message}`);
  }
}