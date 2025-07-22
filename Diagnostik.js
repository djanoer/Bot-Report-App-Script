/**
 * @file Diagnostik.js
 * @author Djanoer Team
 * @date 2023-02-01
 *
 * @description
 * Menyediakan fungsi diagnostik sederhana untuk memeriksa konfigurasi dasar
 * dari lingkungan eksekusi skrip (DEV/PROD) langsung dari UI Spreadsheet.
 */

function tesLingkunganDanKonfigurasi() {
  try {
    const config = bacaKonfigurasi(); // Memanggil fungsi konfigurasi utama
    const environment = config.ENVIRONMENT || "TIDAK DITEMUKAN";
    const chatID = config.TELEGRAM_CHAT_ID;
    const devChatID = config.TELEGRAM_CHAT_ID_DEV;

    let pesan = `HASIL PEMERIKSAAN KONFIGURASI:\n\n`;
    pesan += `Lingkungan Terdeteksi: ${environment}\n\n`;
    pesan += `ID Chat PROD: ${chatID}\n`;
    pesan += `ID Chat DEV: ${devChatID}\n\n`;

    if (environment === "DEV") {
      pesan += "✅ Verifikasi Berhasil! Skrip ini berjalan sebagai lingkungan DEV.";
    } else {
      pesan += "❌ Verifikasi Gagal! Skrip ini tidak terdeteksi sebagai DEV. Periksa Properti Skrip Anda.";
    }

    SpreadsheetApp.getUi().alert("Hasil Tes Lingkungan", pesan, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Error", e.message);
  }
}
