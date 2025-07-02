// ===== FILE: Utama.gs =====

// [OPTIMALISASI] Definisikan objek handler untuk semua perintah bot.
const commandHandlers = {
  [KONSTANTA.PERINTAH_BOT.LAPORAN]: (update, config) => {
    if (update.message.text.split(' ').length > 1) {
      kirimPesanTelegram(`❌ Perintah tidak valid.`, config, 'HTML');
    } else {
      // [PERBAIKAN] Terima teks laporan, lalu kirim.
      const pesan = buatLaporanHarianVM(config);
      kirimPesanTelegram(pesan, config, 'HTML');
    }
  },
  [KONSTANTA.PERINTAH_BOT.SYNC_LAPORAN]: () => syncDanBuatLaporanHarian(false, "PERINTAH MANUAL"),
  [KONSTANTA.PERINTAH_BOT.PROVISIONING]: (update, config) => {
    let statusMessageId = null;
    try {
      // 1. Kirim pesan status awal
      const sentMessage = kirimPesanTelegram("📊 Menganalisis laporan provisioning... Ini mungkin memakan waktu.", config, 'HTML');
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      
      // 2. Jalankan fungsi dan dapatkan hasilnya
      const laporan = generateProvisioningReport(config);

      // 3. Kirim hasil sebagai pesan baru
      kirimPesanTelegram(laporan, config, 'HTML');

      // 4. Edit pesan status menjadi konfirmasi
      if (statusMessageId) {
        editMessageText("✅ Laporan provisioning selesai.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    } catch (e) {
      handleCentralizedError(e, "Perintah: /provisioning", config);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan provisioning.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_TIKET]: (update, config) => {
     if (update.message.text.split(' ').length > 1) {
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
  },
  [KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK]: (update, config) => {
    let statusMessageId = null;
    try {
      // 1. Kirim pesan status awal
      const sentMessage = kirimPesanTelegram("🔬 Menganalisis rekomendasi migrasi datastore...", config, 'HTML');
       if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      
      // 2. Jalankan fungsi dan dapatkan hasilnya
      const laporan = jalankanRekomendasiMigrasi(config);

      // 3. Kirim hasil sebagai pesan baru
      kirimPesanTelegram(laporan, config, 'HTML');

      // 4. Edit pesan status menjadi konfirmasi
      if (statusMessageId) {
        editMessageText("✅ Analisis migrasi selesai.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    } catch(e) {
       handleCentralizedError(e, "Perintah: /migrasicheck", config);
       if (statusMessageId) {
        editMessageText("❌ Gagal menjalankan analisis migrasi.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.EXPORT]: (update, config) => {
     if (update.message.text.split(' ').length > 1) {
        kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.EXPORT}</code> tanpa argumen tambahan.`, config, 'HTML');
    } else {
        kirimMenuEkspor(config);
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_VM]: (update, config) => {
    if (update.message.text.split(' ').length > 1) {
        handleVmSearchInteraction(update, config);
    } else {
        kirimPesanTelegram(`Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.CEK_VM} [IP / Nama / PK]</code>`, config, 'HTML');
    }
  },
  [KONSTANTA.PERINTAH_BOT.HISTORY]: (update, config, userData) => {
    const parts = update.message.text.split(' ');
    if (parts.length > 1) {
        getVmHistory(parts[1].trim(), config, userData);
    } else {
        kirimPesanTelegram(`Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.HISTORY} [PK]</code>`, config, 'HTML');
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_HISTORY]: (update, config) => {
      if (update.message.text.split(' ').length > 1) {
        kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.CEK_HISTORY}</code> tanpa argumen tambahan.`, config, 'HTML');
    } else {
        handleHistoryInteraction(update, config);
    }
  },
  [KONSTANTA.PERINTAH_BOT.ARSIPKAN_LOG]: (update, config) => {
    kirimPesanTelegram("⚙️ Menerima perintah arsip. Memeriksa jumlah log...", config);
    cekDanArsipkanLogJikaPenuh(config);
  },
  [KONSTANTA.PERINTAH_BOT.CLEAR_CACHE]: (update, config) => {
    const isCleared = clearUserAccessCache();
    kirimPesanTelegram(isCleared ? "✅ Cache hak akses telah berhasil dibersihkan." : "❌ Gagal membersihkan cache.", config);
  },
  [KONSTANTA.PERINTAH_BOT.INFO]: (update, config) => kirimPesanInfo(config),
};

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

    const commandParts = text.split(' ');
    let command = commandParts[0].toLowerCase().split('@')[0];

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

    const userData = getUserData(userId);
    if (!userData || !userData.email) {
      const userMention = `<a href="tg://user?id=${userId}">${escapeHtml(firstName || userId)}</a>`;
      kirimPesanTelegram(`❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`, config, 'HTML'); 
      return HtmlService.createHtmlOutput("Unauthorized"); 
    }
    
    userData.firstName = firstName;
    userData.userId = userId;

    if (isCallback) {
      const callbackQueryId = update.callback_query.id;
      
      if (text.startsWith(KONSTANTA.CALLBACK_TIKET.PREFIX)) {
        handleTicketInteraction(update, config);
      }
      else if (text.startsWith(KONSTANTA.CALLBACK_HISTORY.PREFIX + "get_")) { 
        const pk = text.split("_")[2];
        getVmHistory(pk, config, userData);
      }
      else if (text.startsWith(KONSTANTA.CALLBACK_HISTORY.NAVIGATE)) {
        handleHistoryInteraction(update, config);
      }
      else if (text.startsWith(KONSTANTA.CALLBACK_CEKVM.PREFIX)) {
        handleVmSearchInteraction(update, config);
      } 
      else if (text.startsWith("run_export_log_") || text.startsWith("export_")) {
        handleExportRequest(text, config, userData);
      }
      
      answerCallbackQuery(callbackQueryId, config);

    } else { 
      const commandFunction = commandHandlers[command];
      
      if (commandFunction) {
        try {
          commandFunction(update, config, userData);
        } catch (err) {
          handleCentralizedError(err, `Perintah: ${command}`, config);
        }
      } else {
        kirimPesanTelegram(`❌ Perintah <code>${escapeHtml(commandParts[0])}</code> tidak dikenal.\n\nGunakan ${KONSTANTA.PERINTAH_BOT.INFO} untuk melihat daftar perintah.`, config, 'HTML');
      }
    }
  } catch (err) {
    handleCentralizedError(err, "doPost (utama)", config);
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

/**
 * [OPTIMALISASI FINAL] Membuat menu kustom yang lebih sederhana dan relevan.
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('⚙️ Menu Bot')
      .addItem('1. Jalankan Pekerjaan Harian Sekarang', 'runDailyJobs')
      .addItem('2. Jalankan Laporan Migrasi Saja', 'jalankanRekomendasiMigrasi')
      .addSeparator()
      .addItem('3. Hapus Cache Konfigurasi & Akses', 'clearUserAccessCache')
      .addItem('4. Tes Koneksi ke Telegram', 'tesKoneksiTelegram')
      .addSeparator()
      .addItem('SETUP: Set Webhook (Jalankan 1x saat awal)', 'setWebhook')
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

// =====================================================================
// [OPTIMALISASI] KUMPULAN FUNGSI UNTUK PEMICU (TRIGGER)
// =====================================================================

function runDailyJobs() {
  console.log("Memulai pekerjaan harian via trigger...");
  syncDanBuatLaporanHarian(false, "TRIGGER HARIAN");
  jalankanPemeriksaanAmbangBatas();
  jalankanPemeriksaanDatastore();
  console.log("Pekerjaan harian via trigger selesai.");
}

function runWeeklyReport() {
  console.log("Memulai laporan mingguan via trigger...");
  buatLaporanPeriodik('mingguan');
  console.log("Laporan mingguan via trigger selesai.");
}

function runMonthlyReport() {
  console.log("Memulai laporan bulanan via trigger...");
  buatLaporanPeriodik('bulanan');
  console.log("Laporan bulanan via trigger selesai.");
}

function runCleanupAndArchivingJobs() {
  console.log("Memulai pekerjaan pembersihan dan arsip via trigger...");
  bersihkanFileEksporTua();
  cekDanArsipkanLogJikaPenuh();
  console.log("Pekerjaan pembersihan dan arsip via trigger selesai.");
}

function runTicketSync() {
    console.log("Memulai sinkronisasi data tiket via trigger...");
    try {
        syncTiketDataForTrigger();
    } catch (e) {
        console.error(`Sinkronisasi tiket via trigger gagal: ${e.message}`);
    }
}