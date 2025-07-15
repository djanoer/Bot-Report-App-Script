// ===== FILE: Pemeriksaan.gs =====

/**
 * Menjalankan serangkaian pemeriksaan pada komponen inti bot untuk memastikan
 * semuanya operasional.
 * @returns {string} Pesan laporan kesehatan yang sudah diformat HTML.
 */
function jalankanPemeriksaanKesehatan() {
  const status = {
    konfigurasi: { ok: false, detail: "Gagal membaca konfigurasi." },
    telegramApi: { ok: false, detail: "Gagal menghubungi API Telegram." },
    sheetData: { ok: false, detail: "Gagal mengakses sheet data utama." },
    sumberData: { ok: false, detail: "Gagal mengakses sheet sumber data mentah." },
  };
  let config;

  // Tes 1: Baca Konfigurasi Lokal
  try {
    config = bacaKonfigurasi();
    status.konfigurasi.ok = true;
    status.konfigurasi.detail = `Berhasil dimuat (Lingkungan: ${config.ENVIRONMENT}).`;
  } catch (e) {
    status.konfigurasi.detail = e.message;
  }

  // Hanya lanjut jika konfigurasi berhasil dibaca
  if (status.konfigurasi.ok) {
    // Tes 2: Koneksi API Telegram
    try {
      const response = callTelegramApi("getMe", {}, config);
      if (response && response.ok) {
        status.telegramApi.ok = true;
        status.telegramApi.detail = "Koneksi berhasil.";
      }
    } catch (e) {
      status.telegramApi.detail = e.message;
    }

    // Tes 3: Akses Google Sheet Operasional
    try {
      const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
      if (sheet) {
        status.sheetData.ok = true;
        status.sheetData.detail = "Sheet operasional berhasil diakses.";
      }
    } catch (e) {
      status.sheetData.detail = e.message;
    }

    // Tes 4: Akses Google Sheet Sumber Data Mentah
    try {
      const sumberSheet = SpreadsheetApp.openById(config[KONSTANTA.KUNCI_KONFIG.ID_SUMBER]);
      if (sumberSheet) {
        status.sumberData.ok = true;
        status.sumberData.detail = "Sheet sumber data mentah berhasil diakses.";
      }
    } catch (e) {
      status.sumberData.detail = e.message;
    }
  }

  let pesan = "<b>🩺 Laporan Status Kesehatan Bot</b>\n\n";
  pesan += `• Konfigurasi Bot: ${status.konfigurasi.ok ? "✅" : "❌"} <i>${escapeHtml(
    status.konfigurasi.detail
  )}</i>\n`;
  pesan += `• API Telegram: ${status.telegramApi.ok ? "✅" : "❌"} <i>${escapeHtml(status.telegramApi.detail)}</i>\n`;
  pesan += `• Sheet Operasional: ${status.sheetData.ok ? "✅" : "❌"} <i>${escapeHtml(status.sheetData.detail)}</i>\n`;
  pesan += `• Sheet Sumber Data: ${status.sumberData.ok ? "✅" : "❌"} <i>${escapeHtml(
    status.sumberData.detail
  )}</i>\n\n`;

  if (status.konfigurasi.ok && status.telegramApi.ok && status.sheetData.ok && status.sumberData.ok) {
    pesan += "<b>Kesimpulan: Semua sistem operasional.</b>";
  } else {
    pesan += "<b>Kesimpulan: Terdeteksi masalah pada salah satu komponen.</b>";
  }

  return pesan;
}
