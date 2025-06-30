// ===== FILE: Utama.gs =====

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) return HtmlService.createHtmlOutput("Bad Request");
  
  try {
    const config = bacaKonfigurasi();
    const update = JSON.parse(e.postData.contents);
    
    let userId, fromChatId, text, firstName, isCallback = false, username;

    if (update.callback_query) {
      isCallback = true;
      userId = update.callback_query.from.id;
      fromChatId = update.callback_query.message.chat.id;
      text = update.callback_query.data;
      firstName = update.callback_query.from.first_name;
      username = update.callback_query.from.username;
    } else if (update.message && update.message.text) {
      userId = update.message.from.id;
      fromChatId = update.message.chat.id;
      text = update.message.text;
      firstName = update.message.from.first_name;
      username = update.message.from.username;
    } else {
      return HtmlService.createHtmlOutput("OK");
    }
    
    if (String(fromChatId) !== String(config.TELEGRAM_CHAT_ID)) {
      return HtmlService.createHtmlOutput("OK");
    }

    if (!isCallback && text && !text.startsWith('/')) {
        return HtmlService.createHtmlOutput("OK");
    }

    const commandParts = text.split(' ');
    let command = commandParts[0].toLowerCase();
    if (command.includes('@')) command = command.split('@')[0];

    if (command === '/daftar') {
      const existingUserData = getUserData(userId);
      if (existingUserData && existingUserData.email) {
        kirimPesanTelegram(`Halo ${escapeHtml(firstName)}, Anda sudah terdaftar di sistem. Tidak perlu mendaftar lagi.`, config, 'HTML');
        return HtmlService.createHtmlOutput("OK");
      }
      const email = commandParts[1];
      if (!email || !email.includes('@') || !email.includes('.')) {
        kirimPesanTelegram(`Format perintah salah, ${escapeHtml(firstName)}.\n\nGunakan format:\n<code>/daftar email.anda@domain.com</code>`, config, 'HTML');
        return HtmlService.createHtmlOutput("OK");
      }
      let notifPesan = "<b>🔔 Permintaan Pendaftaran Baru</b>\n\n";
      notifPesan += "Admin, mohon verifikasi dan tambahkan pengguna berikut ke sheet 'Hak Akses':\n\n";
      notifPesan += `<b>Nama:</b> ${escapeHtml(firstName)}\n`;
      notifPesan += `<b>Username:</b> ${username ? '@' + username : 'N/A'}\n`;
      notifPesan += `<b>User ID:</b> <code>${userId}</code>\n`;
      notifPesan += `<b>Email:</b> <code>${escapeHtml(email)}</code>`;
      kirimPesanTelegram(notifPesan, config, 'HTML');
      kirimPesanTelegram(`Terima kasih, ${escapeHtml(firstName)}. Permintaan Anda telah diteruskan kepada admin untuk persetujuan.`, config, 'HTML', null, fromChatId);
      return HtmlService.createHtmlOutput("OK");
    }

    const userData = getUserData(userId);
    if (!userData || !userData.email) {
      const userMention = `<a href="tg://user?id=${userId}">${escapeHtml(firstName || userId)}</a>`;
      kirimPesanTelegram(`❌ Maaf ${userMention}, Anda tidak terdaftar untuk menggunakan bot ini.\n\nSilakan gunakan perintah <code>/daftar [email_anda]</code> untuk meminta akses.`, config, 'HTML'); 
      return HtmlService.createHtmlOutput("Unauthorized"); 
    }
    
    userData.firstName = firstName;
    userData.userId = userId;

    if (isCallback) {
      const callbackQueryId = update.callback_query.id;
      
      if (text.startsWith(KONSTANTA.CALLBACK_TIKET.PREFIX)) {
        handleTicketInteraction(update);
      }
      else if (text.startsWith("history_") || text.startsWith("cekvm_")) {
        const pk = text.split("_")[1];
        if (text.startsWith("history_")) getVmHistory(pk, config, userData);
        else findVmAndGetInfo(pk, config, userData);
      } 
      else if (text.startsWith("run_export_log_") || text.startsWith("export_")) {
        handleExportRequest(text, config, userData);
      }
      
      answerCallbackQuery(callbackQueryId, config);

    } else { 
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
        
        // Alur /cektiket yang sudah diperbaiki
        case '/cektiket':
          kirimPesanTelegram("⏳ Sedang menyinkronkan data tiket terbaru...", config, 'HTML');
          // Jalankan sinkronisasi terlebih dahulu. Jika ini gagal, blok catch utama akan menangani error.
          syncTiketDataForTrigger();
          // Jika sinkronisasi berhasil, baru panggil fungsi untuk menampilkan laporan.
          handleTicketInteraction(update);
          break;
          
        case '/migrasicheck':
          kirimPesanTelegram("🔬 Menganalisis rekomendasi migrasi datastore...", config, 'HTML');
          jalankanRekomendasiMigrasi();
          break;
        case '/export':
          kirimMenuEkspor(config);
          break;
        case '/cekvm':
          if (commandParts.length > 1) findVmAndGetInfo(commandParts.slice(1).join(' '), config, userData);
          else kirimPesanTelegram(`Gunakan format: <code>/cekvm [IP / Nama / PK]</code>`, config, 'HTML');
          break;
        case '/history':
          if (commandParts.length > 1) getVmHistory(commandParts[1].trim(), config, userData);
          else kirimPesanTelegram(`Gunakan format: <code>/history [PK]</code>`, config, 'HTML');
          break;
        case '/cekhistory':
          getTodaysHistory(config, userData);
          break;
        case '/arsipkanlog':
          kirimPesanTelegram("⚙️ Menerima perintah arsip. Memeriksa jumlah log...", config);
          cekDanArsipkanLogJikaPenuh(config);
          break;
        case '/clearcache':
          const isCleared = clearUserAccessCache();
          kirimPesanTelegram(isCleared ? "✅ Cache hak akses telah berhasil dibersihkan." : "❌ Gagal membersihkan cache.", config);
          break;
        
        case '/info':
          const infoPesan = "<b>Daftar Perintah Bot Laporan VM</b>\n" +
                            "------------------------------------\n\n" +
                            "<code>/daftar [email]</code>\n" +
                            "Meminta hak akses untuk menggunakan bot.\n\n" +
                            "<code>/laporan</code>\n" +
                            "(Cepat) Membuat laporan instan.\n\n" +
                            "<code>/sync_laporan</code>\n" +
                            "(Lengkap) Menyalin data terbaru, lalu membuat laporan.\n\n" +
                            "<code>/provisioning</code>\n" +
                            "Menampilkan laporan analisis alokasi resource.\n\n" +
                            "<code>/cektiket</code>\n" +
                            "Menampilkan laporan monitoring tiket utilisasi interaktif.\n\n" +
                            "<code>/migrasicheck</code>\n" +
                            "Menjalankan analisis & rekomendasi migrasi datastore.\n\n" +
                            "<code>/export</code>\n" +
                            "Menampilkan menu untuk mengunduh laporan.\n\n" +
                            "<code>/cekvm [IP/Nama/PK]</code>\n" +
                            "Mencari detail sebuah VM.\n\n" +
                            "<code>/history [PK]</code>\n" +
                            "Menampilkan riwayat perubahan VM.\n\n" +
                            "<code>/cekhistory</code>\n" +
                            "Menampilkan semua log perubahan hari ini.\n\n" +
                            "<code>/arsipkanlog</code>\n" +
                            "Memeriksa & menjalankan pengarsipan log.\n\n" +
                            "<code>/clearcache</code>\n" +
                            "Membersihkan cache hak akses.\n\n" +
                            "<code>/info</code>\n" +
                            "Menampilkan daftar perintah ini.";
          kirimPesanTelegram(infoPesan, config, 'HTML');
          break;
        default:
          kirimPesanTelegram(`❌ Perintah <code>${escapeHtml(commandParts[0])}</code> tidak dikenal.\n\nGunakan /info untuk melihat daftar perintah.`, config, 'HTML');
          break;
      }
    }
  } catch (err) {
    console.error(`Error di doPost: ${err.message}\nStack: ${err.stack}`);
    kirimPesanTelegram(`<b>⚠️ Terjadi Error pada Bot</b>\n\n<code>${escapeHtml(err.message)}</code>`, bacaKonfigurasi(), 'HTML');
  }
  return HtmlService.createHtmlOutput("OK");
}

function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('⚙️ Menu Otomatis')
      .addItem('1. SINKRONISASI & BUAT LAPORAN', 'syncDanBuatLaporanHarian')
      .addItem('2. BUAT LAPORAN DARI DATA SAAT INI', 'buatLaporanHarianVM')
      .addSeparator()
      .addItem('3. REKOMENDASI MIGRASI DATASTORE', 'runDailyMigrationCheck')
      .addItem('4. PERIKSA AMBANG BATAS (WARNING)', 'runDailyWarningCheck')
      .addSeparator()
      .addItem('5. Tes Koneksi Telegram', 'tesKoneksiTelegram')
      .addSeparator()
      .addItem('SETUP: Set Webhook (Jalankan 1x)', 'setWebhook')
      .addToUi();
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