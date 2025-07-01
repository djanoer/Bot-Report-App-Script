// ===== FILE: Utama.gs =====

function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return HtmlService.createHtmlOutput("Bad Request");
  }

  let config;
  try {
    config = bacaKonfigurasi();
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

    // --- PERBAIKAN KRITIS PADA PEMROSESAN PERINTAH ---
    const commandParts = text.split(' ');
    // Ambil bagian pertama (perintah), ubah ke huruf kecil, dan hapus nama bot jika ada.
    let command = commandParts[0].toLowerCase().split('@')[0];

    // --- ALUR PENDAFTARAN ---
    if (command === KONSTANTA.PERINTAH_BOT.DAFTAR) {
      const existingUserData = getUserData(userId);
      if (existingUserData && existingUserData.email) {
        kirimPesanTelegram(`Halo ${escapeHtml(firstName)}, Anda sudah terdaftar.`, config, 'HTML');
        return HtmlService.createHtmlOutput("OK");
      }
      const email = commandParts[1];
      if (!email || !email.includes('@') || !email.includes('.')) {
        kirimPesanTelegram(`Format salah. Gunakan:\n<code>/daftar email.anda@domain.com</code>`, config, 'HTML');
        return HtmlService.createHtmlOutput("OK");
      }
      let notifPesan = `<b>🔔 Permintaan Pendaftaran Baru</b>\n\n<b>Nama:</b> ${escapeHtml(firstName)}\n<b>Username:</b> ${username ? '@' + username : 'N/A'}\n<b>User ID:</b> <code>${userId}</code>\n<b>Email:</b> <code>${escapeHtml(email)}</code>`;
      kirimPesanTelegram(notifPesan, config, 'HTML');
      kirimPesanTelegram(`Terima kasih, ${escapeHtml(firstName)}. Permintaan Anda telah diteruskan.`, config, 'HTML', null, fromChatId);
      return HtmlService.createHtmlOutput("OK");
    }

    // --- PEMBATASAN AKSES ---
    const userData = getUserData(userId);
    if (!userData || !userData.email) {
      const userMention = `<a href="tg://user?id=${userId}">${escapeHtml(firstName || userId)}</a>`;
      kirimPesanTelegram(`❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`, config, 'HTML'); 
      return HtmlService.createHtmlOutput("Unauthorized"); 
    }
    
    userData.firstName = firstName;
    userData.userId = userId;

    // --- PENGENDALI INTERAKSI ---
    if (isCallback) {
      const callbackQueryId = update.callback_query.id;
      
      if (text.startsWith(KONSTANTA.CALLBACK_TIKET.PREFIX)) {
        handleTicketInteraction(update, config);
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
      // Menggunakan konstanta untuk semua case
      switch (command) {
        case KONSTANTA.PERINTAH_BOT.LAPORAN:
          // --- VALIDASI BARU ---
          if (commandParts.length > 1) {
            kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.LAPORAN}</code> tanpa argumen tambahan.`, config, 'HTML');
          } else {
            buatLaporanHarianVM();
          }
          break;
        case KONSTANTA.PERINTAH_BOT.SYNC_LAPORAN:
          syncDanBuatLaporanHarian(false, "PERINTAH MANUAL"); 
          break;
        case KONSTANTA.PERINTAH_BOT.PROVISIONING:
          generateProvisioningReport(config);
          break;
        case KONSTANTA.PERINTAH_BOT.CEK_TIKET:
          // --- VALIDASI BARU ---
          if (commandParts.length > 1) {
            kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.CEK_TIKET}</code> tanpa argumen tambahan.`, config, 'HTML');
          } else {
              try {
              kirimPesanTelegram("⏳ Menyiapkan laporan tiket...", config, 'HTML');
              handleTicketInteraction(update, config);
            } catch (e) {
              console.error(`Gagal memproses /cektiket (interaktif): ${e.message}\nStack: ${e.stack}`);
              kirimPesanTelegram(`❌ Gagal membuat laporan tiket interaktif.\n\n<b>Detail Error:</b>\n<code>${escapeHtml(e.message)}</code>`, config, 'HTML');
            }
          }
          break;
        case KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK:
          kirimPesanTelegram("🔬 Menganalisis rekomendasi migrasi datastore...", config, 'HTML');
          jalankanRekomendasiMigrasi();
          break;
        case KONSTANTA.PERINTAH_BOT.EXPORT:
          // --- VALIDASI BARU ---
          if (commandParts.length > 1) {
            kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.EXPORT}</code> tanpa argumen tambahan.`, config, 'HTML');
          } else {
            kirimMenuEkspor(config);
          }
          break;
        case KONSTANTA.PERINTAH_BOT.CEK_VM:
          // --- VALIDASI YANG DISEMPURNAKAN ---
          if (commandParts.length > 1) {
            findVmAndGetInfo(commandParts.slice(1).join(' '), config, userData);
          } else {
            // Memberikan pesan kesalahan jika argumen hilang
            kirimPesanTelegram(`Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.CEK_VM} [IP / Nama / PK]</code>`, config, 'HTML');
          }
          break;
        case KONSTANTA.PERINTAH_BOT.HISTORY:
          // --- VALIDASI YANG DISEMPURNAKAN ---
          if (commandParts.length > 1) {
            getVmHistory(commandParts[1].trim(), config, userData);
          } else {
            // Memberikan pesan kesalahan jika argumen hilang
            kirimPesanTelegram(`Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.HISTORY} [PK]</code>`, config, 'HTML');
          }
          break;
        case KONSTANTA.PERINTAH_BOT.CEK_HISTORY:
          // --- VALIDASI BARU ---
          if (commandParts.length > 1) {
            kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.CEK_HISTORY}</code> tanpa argumen tambahan.`, config, 'HTML');
          } else {
            getTodaysHistory(config, userData);
          }
          break;
        case KONSTANTA.PERINTAH_BOT.ARSIPKAN_LOG:
          kirimPesanTelegram("⚙️ Menerima perintah arsip. Memeriksa jumlah log...", config);
          cekDanArsipkanLogJikaPenuh(config);
          break;
        case KONSTANTA.PERINTAH_BOT.CLEAR_CACHE:
          const isCleared = clearUserAccessCache();
          kirimPesanTelegram(isCleared ? "✅ Cache hak akses telah berhasil dibersihkan." : "❌ Gagal membersihkan cache.", config);
          break;
        // ===== [PERBAIKAN ADA DI SINI] =====
        // Pastikan case untuk INFO ada dan bisa dijangkau.
        case KONSTANTA.PERINTAH_BOT.INFO:
          // Panggil fungsi terpisah untuk mengirim pesan info
          kirimPesanInfo(config);
          break;
        // ===================================
        default:
          kirimPesanTelegram(`❌ Perintah <code>${escapeHtml(commandParts[0])}</code> tidak dikenal.\n\nGunakan ${KONSTANTA.PERINTAH_BOT.INFO} untuk melihat daftar perintah.`, config, 'HTML');
          break;
      }
    }
  } catch (err) {
    console.error(`Error di doPost: ${err.message}\nStack: ${err.stack}`);
    const errorConfig = config || bacaKonfigurasi();
    kirimPesanTelegram(`<b>⚠️ Terjadi Error pada Bot</b>\n\n<code>${escapeHtml(err.message)}</code>`, errorConfig, 'HTML');
  }
  return HtmlService.createHtmlOutput("OK");
}

/**
 * [FUNGSI BARU]
 * Mengirim pesan bantuan (/info) yang dinamis menggunakan konstanta.
 */
function kirimPesanInfo(config) {
  const K = KONSTANTA.PERINTAH_BOT; // Alias untuk kemudahan
  const infoPesan = "<b>Daftar Perintah Bot Laporan VM</b>\n" +
                    "------------------------------------\n\n" +
                    `<code>${K.DAFTAR} [email]</code>\nMeminta hak akses untuk menggunakan bot.\n\n` +
                    `<code>${K.LAPORAN}</code>\n(Cepat) Membuat laporan instan.\n\n` +
                    `<code>${K.SYNC_LAPORAN}</code>\n(Lengkap) Menyalin data terbaru, lalu membuat laporan.\n\n` +
                    `<code>${K.PROVISIONING}</code>\nMenampilkan laporan analisis alokasi resource.\n\n` +
                    `<code>${K.CEK_TIKET}</code>\nMenampilkan laporan monitoring tiket interaktif.\n\n` +
                    `<code>${K.MIGRASI_CHECK}</code>\nMenjalankan analisis & rekomendasi migrasi datastore.\n\n` +
                    `<code>${K.EXPORT}</code>\nMenampilkan menu untuk mengunduh laporan.\n\n` +
                    `<code>${K.CEK_VM} [IP/Nama/PK]</code>\nMencari detail sebuah VM.\n\n` +
                    `<code>${K.HISTORY} [PK]</code>\nMenampilkan riwayat perubahan VM.\n\n` +
                    `<code>${K.CEK_HISTORY}</code>\nMenampilkan semua log perubahan hari ini.\n\n` +
                    `<code>${K.ARSIPKAN_LOG}</code>\nMemeriksa & menjalankan pengarsipan log.\n\n` +
                    `<code>${K.CLEAR_CACHE}</code>\nMembersihkan cache hak akses.\n\n` +
                    `<code>${K.INFO}</code>\nMenampilkan daftar perintah ini.`;
  kirimPesanTelegram(infoPesan, config, 'HTML');
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
  // Perbaikan: Tambahkan argumen kedua untuk menandai sumber eksekusi.
  syncDanBuatLaporanHarian(false, "TRIGGER OTOMATIS"); 
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