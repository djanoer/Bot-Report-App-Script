// ===== FILE: Datastore.gs =====

function jalankanPemeriksaanDatastore() {
  console.log("Memulai pemeriksaan perubahan datastore...");
  try {
    const config = bacaKonfigurasi();
    
    // Memastikan kunci konfigurasi untuk nama sheet Datastore ada
    if (!config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]) {
      const pesanError = "Pemeriksaan datastore dibatalkan: Kunci 'NAMA_SHEET_DATASTORE' tidak diatur di sheet Konfigurasi.";
      console.warn(pesanError);
      // Anda bisa mengirim notifikasi jika proses penting ini gagal karena konfigurasi
      // kirimPesanTelegram(`⚠️ ${pesanError}`, config);
      return;
    }

    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_DS];
    const archiveFileName = KONSTANTA.NAMA_FILE.ARSIP_DS;
    const primaryKeyHeader = config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER];
    
    // [PERBAIKAN EKSPLISIT]
    // Secara spesifik menargetkan kolom 'Capacity (TB)' untuk dipantau perubahannya.
    const kolomUntukDipantau = KONSTANTA.HEADER_DS.CAPACITY_TB; 
    const columnsToTrack = [{nama: kolomUntukDipantau}];

    // Menambahkan log untuk memastikan sheet dan kolom yang dipantau sudah benar
    console.log(`Memantau perubahan pada sheet: '${sheetName}'`);
    console.log(`Kolom yang dipantau untuk perubahan: '${kolomUntukDipantau}'`);

    // Memanggil fungsi generik untuk proses deteksi perubahan
    const logEntriesToAdd = processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, 'Datastore');

    if (logEntriesToAdd.length > 0) {
      // Mengirim notifikasi yang lebih spesifik
      const pesanNotifikasi = `🔔 Terdeteksi ${logEntriesToAdd.length} perubahan kapasitas pada infrastruktur datastore. Silakan cek /cekhistory untuk detail.`;
      kirimPesanTelegram(pesanNotifikasi, config);
      console.log(pesanNotifikasi);
    } else {
      console.log("Tidak ada perubahan pada data kapasitas datastore yang terdeteksi.");
    }
     console.log("Pemeriksaan perubahan datastore selesai.");

  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan datastore: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`<b>⚠️ Gagal Menjalankan Pemeriksaan Datastore!</b>\n\n<code>${escapeHtml(e.message)}</code>`, bacaKonfigurasi(), 'HTML');
  }
}