// ===== FILE: PengujianFungsional.gs =====

/**
 * FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk menguji fungsionalitas
 * yang bergantung pada data live dan konfigurasi Anda.
 */
function jalankanTesFungsional() {
    console.log("🚀 Memulai Pengujian Fungsional...");
    
    ujiFungsi_generateProvisioningReport();
    ujiFungsi_generateStorageUtilizationReport();
    
    console.log("✅ Pengujian Fungsional Selesai. Periksa log di atas untuk hasilnya.");
  }
  
  
  /**
   * Menguji coba fungsi generateProvisioningReport secara terisolasi.
   */
  function ujiFungsi_generateProvisioningReport() {
    console.log("\n🧪 MENGUJI: generateProvisioningReport");
    try {
      const { config } = getBotState();
      const { headers, dataRows } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
      
      if (dataRows.length === 0) {
        console.warn("   -> 🟡 PERINGATAN: Sheet 'Data VM' kosong. Pengujian dilewati.");
        return;
      }
      
      const hasil = generateProvisioningReport(config, dataRows, headers);
      
      console.log("   -> ✅ LULUS: Fungsi berhasil dieksekusi tanpa error.");
      console.log("   -> 📄 Contoh Hasil (500 karakter pertama):\n" + hasil.substring(0, 500) + "...");
    } catch (e) {
      console.error(`   -> ❌ GAGAL: Terjadi error saat menjalankan fungsi.`);
      console.error(`   -> 💬 Pesan Error: ${e.message}`);
      console.error(`   -> 📍 Lokasi: ${e.stack}`);
    }
  }
  
  /**
   * Menguji coba fungsi generateStorageUtilizationReport secara terisolasi.
   */
  function ujiFungsi_generateStorageUtilizationReport() {
    console.log("\n🧪 MENGUJI: generateStorageUtilizationReport");
    try {
      const { config } = getBotState();
      const hasil = generateStorageUtilizationReport(config);
      
      console.log("   -> ✅ LULUS: Fungsi berhasil dieksekusi tanpa error.");
      console.log("   -> 📄 Hasil:\n" + hasil);
    } catch (e) {
      console.error(`   -> ❌ GAGAL: Terjadi error saat menjalankan fungsi.`);
      console.error(`   -> 💬 Pesan Error: ${e.message}`);
      console.error(`   -> 📍 Lokasi: ${e.stack}`);
    }
  }
  
  /**
   * Menguji coba fungsi buatGrafikDistribusi dan logika pengirimannya.
   * CATATAN: Tes ini tidak akan benar-benar mengirim foto, tetapi akan memverifikasi
   * bahwa semua langkah sebelum pengiriman berjalan dengan sukses.
   */
  function ujiFungsi_buatGrafikDistribusi() {
    console.log("\n🧪 MENGUJI: buatGrafikDistribusi");
    try {
      const { config } = getBotState();
      
      // Uji coba untuk 'kritikalitas'
      console.log("   -> Menguji tipe: kritikalitas...");
      const blobKritikalitas = buatGrafikDistribusi("kritikalitas", config);
      if (blobKritikalitas && blobKritikalitas.getContentType() === 'image/png') {
        console.log("     -> ✅ LULUS: Berhasil membuat blob gambar untuk kritikalitas.");
      } else {
        throw new Error("Gagal membuat blob gambar untuk kritikalitas. Hasilnya null atau tipe salah.");
      }
      
      // Uji coba untuk 'environment'
      console.log("   -> Menguji tipe: environment...");
      const blobEnvironment = buatGrafikDistribusi("environment", config);
      if (blobEnvironment && blobEnvironment.getContentType() === 'image/png') {
        console.log("     -> ✅ LULUS: Berhasil membuat blob gambar untuk environment.");
      } else {
        throw new Error("Gagal membuat blob gambar untuk environment. Hasilnya null atau tipe salah.");
      }
  
    } catch (e) {
      console.error(`   -> ❌ GAGAL: Terjadi error saat menjalankan fungsi.`);
      console.error(`   -> 💬 Pesan Error: ${e.message}`);
      console.error(`   -> 📍 Lokasi: ${e.stack}`);
    }
  }