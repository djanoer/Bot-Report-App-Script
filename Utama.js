// ===== FILE: Utama.gs (VERSI FINAL) =====

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return HtmlService.createHtmlOutput("Bad Request");
  try {
    const config = bacaKonfigurasi();
    const update = JSON.parse(e.postData.contents);
    let userId, fromChatId, text, isCallback = false, firstName;

    if (update.callback_query) {
      isCallback = true;
      userId = update.callback_query.from.id;
      fromChatId = update.callback_query.message.chat.id;
      text = update.callback_query.data;
    } else if (update.message && update.message.text) {
      userId = update.message.from.id;
      fromChatId = update.message.chat.id;
      text = update.message.text;
    } else { return HtmlService.createHtmlOutput("OK"); }
    
    if (String(fromChatId) !== String(config.TELEGRAM_CHAT_ID)) return HtmlService.createHtmlOutput("OK");
    
    const userData = getUserData(userId);
    if (!userData) {
      const userMention = `<a href="tg://user?id=${userId}">${escapeHtml(update.message.from.first_name || userId)}</a>`;
      kirimPesanTelegram(`❌ ${userMention}, akses Anda ditolak.`, config, 'HTML'); 
      return HtmlService.createHtmlOutput("Unauthorized"); 
    }
    
    if (isCallback) {
      const callbackQueryId = update.callback_query.id;
      
      // [LOGIKA BARU] Routing yang lebih spesifik
      if (text.startsWith("history_") || text.startsWith("cekvm_")) {
        const pk = text.split("_")[1];
        if (text.startsWith("history_")) getVmHistory(pk, config, userData);
        else findVmAndGetInfo(pk, config, userData);
      } else if (text.startsWith("export_log_")) {
        handleLogExport(text, config, userData);
      } else if (text.startsWith("export_vms_")) {
        handleVmsExport(text, config, userData);
      } else if (text.startsWith("export_uptime_")) {
        handleUptimeExport(text, config, userData);
      }
      
      answerCallbackQuery(callbackQueryId, config);
    } else {
      const commandParts = text.split(' ');
      let command = commandParts[0].toLowerCase();
      if (command.includes('@')) command = command.split('@')[0];
      
      switch (command) {
        case '/laporan':
          buatLaporanHarianVM();
          break;
        case '/sync_laporan':
          syncDanBuatLaporanHarian(false);
          break;
        case '/provisioning':
          generateProvisioningReport(config);
          break;
        case '/export':
          kirimMenuEkspor(config);
          break;
        case '/cekvm':
          if (commandParts.length > 1) findVmAndGetInfo(commandParts.slice(1).join(' '), config, userData);
          else kirimPesanTelegram(`Gunakan format: <code>/cekvm [IP / Nama / PK]</code>`, config);
          break;
        case '/history':
          if (commandParts.length > 1) getVmHistory(commandParts[1].trim(), config, userData);
          else kirimPesanTelegram(`Gunakan format: <code>/history [PK]</code>`, config, 'HTML');
          break;
        case '/cekhistory':
          getTodaysHistory(config, userData);
          break;
        case '/info':
          const infoPesan = "<b>Daftar Perintah Bot</b>\n\n" +
                            "<code>/laporan</code> - Laporan cepat dari data terakhir.\n\n" +
                            "<code>/sync_laporan</code> - Sinkronisasi data & buat laporan lengkap.\n\n" +
                            "<code>/provisioning</code> - Laporan analisis resource.\n\n" +
                            "<code>/export</code> - Menu unduh laporan detail.\n\n" +
                            "<code>/cekvm [kriteria]</code> - Cari detail VM.\n\n" +
                            "<code>/history [PK]</code> - Lihat riwayat perubahan VM.\n\n" +
                            "<code>/cekhistory</code> - Lihat semua perubahan hari ini.";
          kirimPesanTelegram(infoPesan, config);
          break;
        default:
          kirimPesanTelegram(`❌ Perintah <code>${escapeHtml(commandParts[0])}</code> tidak dikenal.`, config);
          break;
      }
    }
  } catch (err) {
    console.error(`Error di doPost: ${err.message}\nStack: ${err.stack}`);
    kirimPesanTelegram(`<b>⚠️ Terjadi Error pada Bot</b>\n\n<code>${escapeHtml(err.message)}</code>`, bacaKonfigurasi());
  }
  return HtmlService.createHtmlOutput("OK");
}

function kirimMenuEkspor(config) {
    const message = "<b>Pusat Laporan Ekspor</b>\n\nSilakan pilih data yang ingin Anda ekspor ke dalam file Google Sheet.";
    const keyboard = {
        inline_keyboard: [
            [{ text: "--- Laporan Log Perubahan ---", callback_data: "ignore" }],
            [
                { text: "📄 Log Hari Ini", callback_data: KONSTANTA.CALLBACK.EXPORT_LOG_TODAY },
                { text: "📅 Log 7 Hari", callback_data: KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS }
            ],
            [{ text: "🗓️ Log 30 Hari", callback_data: KONSTANTA.CALLBACK.EXPORT_LOG_30_DAYS }],
            [{ text: "--- Laporan VM berdasarkan Uptime ---", callback_data: "ignore" }],
            [
                { text: "⚙️ < 1 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_1 },
                { text: "⚙️ 1-2 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_2 },
                { text: "⚙️ 2-3 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_3 }
            ],
            [
                { text: "⚙️ > 3 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_4 },
                { text: "❓ Uptime Tdk Valid", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_INVALID }
            ],
            [{ text: "--- Laporan Data Master VM ---", callback_data: "ignore" }],
            [
                { text: "📄 Semua VM", callback_data: KONSTANTA.CALLBACK.EXPORT_ALL_VMS },
                { text: "🏢 VM di VC01", callback_data: KONSTANTA.CALLBACK.EXPORT_VC01_VMS },
                { text: "🏢 VM di VC02", callback_data: KONSTANTA.CALLBACK.EXPORT_VC02_VMS }
            ]
        ]
    };
    kirimPesanTelegram(message, config, 'HTML', keyboard);
}

function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('⚙️ Menu Otomatis')
      .addItem('1. SINKRONISASI & BUAT LAPORAN', 'syncDanBuatLaporanHarian')
      .addItem('2. BUAT LAPORAN DARI DATA SAAT INI', 'buatLaporanHarianVM')
      .addSeparator()
      .addItem('3. REKOMENDASI MIGRASI DATASTORE', 'runDailyMigrationCheck')
      .addItem('4. PERIKSA AMBANG BATAS (WARNING)', 'runDailyWarningCheck') // [BARU] Menu untuk testing
      .addSeparator()
      .addItem('5. Tes Koneksi Telegram', 'tesKoneksiTelegram')
      .addSeparator()
      .addItem('SETUP: Set Webhook (Jalankan 1x)', 'setWebhook')
      .addToUi();
}

function runDailySyncReportForTrigger() {
  console.log("runDailySyncReportForTrigger dipanggil oleh pemicu waktu.");
  syncDanBuatLaporanHarian(false); 
}

function runDailyMigrationCheck() {
  console.log("runDailyMigrationCheck dipanggil oleh pemicu waktu.");
  jalankanRekomendasiMigrasi();
}

function kirimLaporanMingguan() {
  buatLaporanPeriodik('mingguan');
}

function kirimLaporanBulanan() {
  buatLaporanPeriodik('bulanan');
}

function runDailyWarningCheck() {
    console.log("runDailyWarningCheck dipanggil oleh pemicu waktu.");
    jalankanPemeriksaanAmbangBatas();
}
