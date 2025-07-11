// ===== FILE: Konfigurasi.gs =====

/**
 * [REFACTORED v3.5.0 - FINAL & KONSISTEN] Membaca dan mem-parsing seluruh konfigurasi.
 * Kini secara benar memproses SEMUA kunci yang relevan sebagai array.
 */
function bacaKonfigurasi() {
  try {
    const K = KONSTANTA.KUNCI_KONFIG; // Standarisasi menggunakan alias 'K'
    const config = {};
    const properties = PropertiesService.getScriptProperties();
    config.TELEGRAM_BOT_TOKEN = properties.getProperty("TELEGRAM_BOT_TOKEN");
    config.WEBHOOK_BOT_TOKEN = properties.getProperty("WEBHOOK_BOT_TOKEN");

    if (!config.TELEGRAM_BOT_TOKEN || !config.WEBHOOK_BOT_TOKEN) {
      throw new Error("Token bot tidak ditemukan di PropertiesService.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(KONSTANTA.NAMA_SHEET.KONFIGURASI);
    if (!sheet) throw new Error(`Sheet "Konfigurasi" tidak ditemukan.`);

    const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();

    // Definisikan semua kunci yang nilainya harus diubah menjadi Array.
    const arrayKeys = [
      K.KOLOM_PANTAU,
      K.KOLOM_PANTAU_DS,
      K.DS_KECUALI,
      K.STATUS_TIKET_AKTIF,
      "KATA_KUNCI_DS_DIUTAMAKAN",
      K.KRITIKALITAS_PANTAU,
    ];

    const jsonKeys = [K.MAP_ENV, K.SKOR_KRITIKALITAS];

    data.forEach((row) => {
      const key = row[0];
      const value = row[1];
      if (key) {
        if (jsonKeys.includes(key)) {
          try {
            config[key] = JSON.parse(value);
          } catch (e) {
            throw new Error(`Gagal parse JSON untuk ${key}: ${e.message}. Periksa format di sheet Konfigurasi.`);
          }
        } else if (arrayKeys.includes(key)) {
          // Logika ini sekarang akan berlaku untuk semua kunci di dalam arrayKeys.
          config[key] = value
            ? String(value)
                .split(",")
                .map((k) => k.trim())
                .filter(Boolean)
            : [];
        } else {
          config[key] = value;
        }
      }
    });

    const requiredKeys = [K.ID_SUMBER, K.SHEET_VM, K.FOLDER_ARSIP];
    for (const key of requiredKeys) {
      if (!config[key]) {
        throw new Error(`Kunci konfigurasi wajib "${key}" tidak ditemukan atau kosong di sheet "Konfigurasi".`);
      }
    }

    const kritikalitasString = config[K.KATEGORI_KRITIKALITAS] || "";
    const environmentString = config[K.KATEGORI_ENVIRONMENT] || "";

    config.LIST_KRITIKALITAS = kritikalitasString
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    config.LIST_ENVIRONMENT = environmentString
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    return config;
  } catch (e) {
    throw new Error(`Gagal membaca konfigurasi: ${e.message}`);
  }
}

function getMigrationConfig(migrationLogicSheet) {
  const migrationConfig = new Map();
  if (migrationLogicSheet && migrationLogicSheet.getLastRow() > 1) {
    const rulesData = migrationLogicSheet.getRange(2, 1, migrationLogicSheet.getLastRow() - 1, 5).getValues();
    rulesData.forEach((row) => {
      const recognizedType = row[0];
      const priorityDest = [row[1], row[2], row[3]].filter(Boolean);
      const alias = row[4];
      if (recognizedType) {
        migrationConfig.set(recognizedType, { alias: alias || null, destinations: priorityDest });
      }
    });
  }
  return migrationConfig;
}

/**
function setupSimpanToken() {
  const tokenTelegram = 'ISI_TOKEN_TELEGRAM_BOT_ANDA_DI_SINI';
  const tokenWebhook = 'ISI_TOKEN_RAHASIA_WEBHOOK_ANDA_DI_SINI';

  if (tokenTelegram.includes('ISI_TOKEN') || tokenWebhook.includes('ISI_TOKEN')) {
    console.error('GAGAL: Harap isi nilai token yang sebenarnya di dalam fungsi setupSimpanToken sebelum menjalankannya.');
    return;
  }

  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    'TELEGRAM_BOT_TOKEN': tokenTelegram,
    'WEBHOOK_BOT_TOKEN': tokenWebhook
  });

  console.log('BERHASIL: Token Anda telah disimpan dengan aman di PropertiesService.');
}
*/

/**
 * [IMPLEMENTASI] Meminta token secara interaktif dari pengguna melalui UI
 * dan menyimpannya ke PropertiesService. Ini lebih aman dan ramah pengguna.
 */
function setupSimpanTokenInteraktif() {
  const ui = SpreadsheetApp.getUi();

  // Meminta Token Telegram Bot
  const responseTelegram = ui.prompt(
    "Langkah 1/2: Setup Token Telegram",
    "Salin-tempel token untuk Telegram Bot Anda dari BotFather:",
    ui.ButtonSet.OK_CANCEL
  );

  if (responseTelegram.getSelectedButton() !== ui.Button.OK || !responseTelegram.getResponseText()) {
    ui.alert("Setup dibatalkan oleh pengguna.");
    return;
  }
  const tokenTelegram = responseTelegram.getResponseText().trim();

  // Meminta Token Rahasia Webhook
  const responseWebhook = ui.prompt(
    "Langkah 2/2: Setup Token Webhook",
    "Sekarang, masukkan token rahasia untuk webhook Anda (ini adalah teks rahasia yang Anda buat sendiri untuk mengamankan webhook):",
    ui.ButtonSet.OK_CANCEL
  );

  if (responseWebhook.getSelectedButton() !== ui.Button.OK || !responseWebhook.getResponseText()) {
    ui.alert("Setup dibatalkan oleh pengguna.");
    return;
  }
  const tokenWebhook = responseWebhook.getResponseText().trim();

  // Menyimpan token ke tempat yang aman (logika penyimpanan tidak berubah)
  const properties = PropertiesService.getScriptProperties();
  properties.setProperties({
    TELEGRAM_BOT_TOKEN: tokenTelegram,
    WEBHOOK_BOT_TOKEN: tokenWebhook,
  });

  ui.alert("✅ BERHASIL!", "Semua token telah disimpan dengan aman di PropertiesService.", ui.ButtonSet.OK);
}

function tesKoneksiTelegram() {
  try {
    const config = bacaKonfigurasi();
    const pesanTes =
      "<b>Tes Koneksi Bot Laporan VM</b>\n\nJika Anda menerima pesan ini, maka konfigurasi bot sudah benar.";
    kirimPesanTelegram(pesanTes, config);
    showUiFeedback("Terkirim!", "Pesan tes telah dikirim ke Telegram. Silakan periksa grup/chat Anda.");
  } catch (e) {
    console.error("Gagal menjalankan tes koneksi Telegram: " + e.message);
    showUiFeedback("Gagal", `Gagal mengirim pesan tes. Error: ${e.message}`);
  }
}

/**
 * FUNGSI DIAGNOSTIK: Menjalankan bacaKonfigurasi dan mencatat hasilnya ke log.
 * Ini membantu kita melihat persis apa yang dimuat oleh skrip dari sheet "Konfigurasi".
 */
function tesKonfigurasi() {
  try {
    console.log("Memulai tes pembacaan konfigurasi...");
    const config = bacaKonfigurasi();
    console.log("Konfigurasi berhasil dimuat. Isinya adalah:");
    console.log(JSON.stringify(config, null, 2)); // Mencatat objek config dengan format yang rapi
    SpreadsheetApp.getUi().alert(
      "Tes Konfigurasi Berhasil!",
      "Silakan periksa Log Eksekusi untuk melihat isi dari objek konfigurasi."
    );
  } catch (e) {
    console.error(e);
    SpreadsheetApp.getUi().alert(
      "Tes Konfigurasi Gagal!",
      `Terjadi error: ${e.message}. Silakan periksa Log Eksekusi untuk detail.`
    );
  }
}
