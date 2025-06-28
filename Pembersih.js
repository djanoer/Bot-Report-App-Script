// ===== FILE: Pembersih.gs =====

function bersihkanFileEksporTua() {
    console.log("Memulai proses pembersihan file ekspor lama...");
    try {
      const config = bacaKonfigurasi();
      if (!config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR]) {
        console.warn(`Proses pembersihan dibatalkan: ${KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR} tidak diatur di Konfigurasi.`);
        return;
      }
  
      const folder = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR]);
      const files = folder.getFiles();
      const oneDayAgo = new Date(new Date().getTime() - (1 * 24 * 60 * 60 * 1000));
  
      let deleteCount = 0;
      while (files.hasNext()) {
        const file = files.next();
        if (file.getDateCreated() < oneDayAgo) {
          console.log(`File "${file.getName()}" akan dihapus karena sudah tua.`);
          file.setTrashed(true);
          deleteCount++;
        }
      }
      
      if (deleteCount > 0) {
        console.log(`Pembersihan selesai. ${deleteCount} file telah dipindahkan ke sampah.`);
      } else {
        console.log("Pembersihan selesai. Tidak ada file lama yang perlu dihapus.");
      }
    } catch(e) {
      console.error(`Gagal menjalankan pembersihan file lama. Error: ${e.message}`);
    }
  }