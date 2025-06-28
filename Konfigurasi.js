// ===== FILE: Konfigurasi.gs =====

function bacaKonfigurasi() {
    console.log("Membaca konfigurasi dari spreadsheet...");
    try {
      const config = {};
      const properties = PropertiesService.getScriptProperties();
      config.TELEGRAM_BOT_TOKEN = properties.getProperty('TELEGRAM_BOT_TOKEN');
      config.WEBHOOK_BOT_TOKEN = properties.getProperty('WEBHOOK_BOT_TOKEN');
  
      if (!config.TELEGRAM_BOT_TOKEN || !config.WEBHOOK_BOT_TOKEN) {
        throw new Error("Token bot tidak ditemukan di PropertiesService. Harap jalankan fungsi 'setupSimpanToken' terlebih dahulu.");
      }
  
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(KONSTANTA.NAMA_SHEET.KONFIGURASI);
      if (!sheet) throw new Error(`Sheet "${KONSTANTA.NAMA_SHEET.KONFIGURASI}" tidak ditemukan.`);
      
      const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues();
      data.forEach(row => {
        const key = row[0];
        const value = row[1];
        if (key) {
          if (key === KONSTANTA.KUNCI_KONFIG.KOLOM_PANTAU || key === KONSTANTA.KUNCI_KONFIG.MAP_ENV) {
            try { config[key] = JSON.parse(value); } 
            catch (e) { throw new Error(`Gagal parse JSON untuk ${key}: ${e.message}.`); }
          } else if (key === KONSTANTA.KUNCI_KONFIG.DS_KECUALI || key === KONSTANTA.KUNCI_KONFIG.DS_UTAMA) {
            config[key] = value ? value.toString().toUpperCase().split(',').map(k => k.trim()).filter(Boolean) : [];
          } else {
            if (key !== 'TELEGRAM_BOT_TOKEN' && key !== 'WEBHOOK_BOT_TOKEN') {
              config[key] = value;
            }
          }
        }
      });
      return config;
    } catch (e) {
      console.error(`Gagal membaca konfigurasi. Error: ${e.message}`);
      throw new Error(`Gagal membaca konfigurasi: ${e.message}`);
    }
  }
  
  function getUserData(userId) {
    const cache = CacheService.getScriptCache();
    const cacheKey = 'USER_ACCESS_MAP';
    let userMap = new Map();
  
    const cachedUsers = cache.get(cacheKey);
    if (cachedUsers) {
      userMap = new Map(JSON.parse(cachedUsers));
    } else {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(KONSTANTA.NAMA_SHEET.HAK_AKSES);
      if (sheet && sheet.getLastRow() > 1) {
        const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();
        data.forEach(row => {
          const currentUserId = String(row[0]);
          const email = row[2];
          if (currentUserId && email) {
            userMap.set(currentUserId, { email: email });
          }
        });
        cache.put(cacheKey, JSON.stringify(Array.from(userMap.entries())), 3600);
      }
    }
    return userMap.get(String(userId)) || null;
  }
  
  function getMigrationConfig(migrationLogicSheet) {
    const migrationConfig = new Map();
    if (migrationLogicSheet && migrationLogicSheet.getLastRow() > 1) {
      // Membaca 5 kolom: Tipe Dikenali, Prioritas 1, 2, 3, dan Alias
      const rulesData = migrationLogicSheet.getRange(2, 1, migrationLogicSheet.getLastRow() - 1, 5).getValues();
      rulesData.forEach(row => {
        const recognizedType = row[0]; // Kolom A
        const priorityDest = [row[1], row[2], row[3]].filter(Boolean); // Kolom B, C, D
        const alias = row[4]; // Kolom E
        if (recognizedType) {
          migrationConfig.set(recognizedType, { alias: alias || null, destinations: priorityDest });
        }
      });
    }
    return migrationConfig;
  }
  
  function setupSimpanToken() {
    // --- ISI TOKEN ANDA DI BAWAH INI ---
    const tokenTelegram = 'ISI_TOKEN_TELEGRAM_BOT_ANDA_DI_SINI';
    const tokenWebhook = 'ISI_TOKEN_RAHASIA_WEBHOOK_ANDA_DI_SINI';
    // ------------------------------------
  
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
  
  function tesKoneksiTelegram() {
      try {
        const config = bacaKonfigurasi();
        const pesanTes = "<b>Tes Koneksi Bot Laporan VM</b>\n\nJika Anda menerima pesan ini, maka konfigurasi bot sudah benar.";
        kirimPesanTelegram(pesanTes, config);
        showUiFeedback("Terkirim!", "Pesan tes telah dikirim ke Telegram. Silakan periksa grup/chat Anda.");
      } catch (e) {
        console.error("Gagal menjalankan tes koneksi Telegram: " + e.message);
        showUiFeedback("Gagal", `Gagal mengirim pesan tes. Error: ${e.message}`);
      }
  }