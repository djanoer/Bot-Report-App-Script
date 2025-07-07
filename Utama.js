// ===== FILE: Utama.gs =====

// [FINAL & STABIL] Definisikan objek handler untuk semua perintah bot.
const commandHandlers = {
  [KONSTANTA.PERINTAH_BOT.LAPORAN]: (update, config) => {
    if (update.message.text.split(' ').length > 1) {
        kirimPesanTelegram(`❌ Perintah tidak valid.`, config, 'HTML');
        return;
    }
    let statusMessageId = null;
    try {
        const sentMessage = kirimPesanTelegram("⏳ Membuat laporan instan...", config, 'HTML');
        if (sentMessage && sentMessage.ok) {
            statusMessageId = sentMessage.result.message_id;
        }
        const pesanLaporan = buatLaporanHarianVM(config);
        kirimPesanTelegram(pesanLaporan, config, 'HTML');
        if (statusMessageId) {
            editMessageText("✅ Laporan harian selesai dibuat.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
        }
    } catch(e) {
        handleCentralizedError(e, `Perintah: /laporan`, config);
        if (statusMessageId) {
            editMessageText("❌ Gagal membuat laporan.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
        }
    }
  },
  [KONSTANTA.PERINTAH_BOT.SYNC_LAPORAN]: () => syncDanBuatLaporanHarian(false, "PERINTAH MANUAL"),
  [KONSTANTA.PERINTAH_BOT.PROVISIONING]: (update, config) => {
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("📊 Menganalisis laporan provisioning... Ini mungkin memakan waktu.", config, 'HTML');
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const laporan = generateProvisioningReport(config);
      kirimPesanTelegram(laporan, config, 'HTML');
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
        return;
    }
    let statusMessageId = null;
    try {
        const sentMessage = kirimPesanTelegram("⏳ Menyiapkan laporan tiket...", config, 'HTML');
        if (sentMessage && sentMessage.ok) {
            statusMessageId = sentMessage.result.message_id;
        }
        handleTicketInteraction(update, config);
        if (statusMessageId) {
            editMessageText("✅ Laporan tiket interaktif telah dikirim.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
        }
    } catch (e) {
        console.error(`Gagal memproses /cektiket (interaktif): ${e.message}\nStack: ${e.stack}`);
        const errorMessage = `❌ Gagal membuat laporan tiket interaktif.\n\n<b>Detail Error:</b>\n<code>${escapeHtml(e.message)}</code>`;
        kirimPesanTelegram(errorMessage, config, 'HTML');
        if (statusMessageId) {
            editMessageText("❌ Terjadi kesalahan saat menyiapkan laporan tiket.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
        }
    }
  },
  [KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK]: (update, config) => {
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("🔬 Menganalisis rekomendasi migrasi datastore...", config, 'HTML');
       if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const laporan = jalankanRekomendasiMigrasi(config);
      kirimPesanTelegram(laporan, config, 'HTML');
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
  // Handler untuk /cekvm yang langsung mendelegasikan ke fungsi utama
  [KONSTANTA.PERINTAH_BOT.CEK_VM]: (update, config, userData) => {
    // Langsung dan hanya panggil handler utama.
    handleVmSearchInteraction(update, config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.HISTORY]: (update, config, userData) => {
    const parts = update.message.text.split(' ');
    const pk = parts[1] ? parts[1].trim() : null;

    if (!pk) {
        kirimPesanTelegram(`Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.HISTORY} [PK]</code>`, config, 'HTML');
        return;
    }
    let statusMessageId = null;
    try {
        const pkToDisplay = normalizePrimaryKey(pk);
        const sentMessage = kirimPesanTelegram(`🔍 Mencari riwayat lengkap untuk PK: <code>${escapeHtml(pkToDisplay)}</code>...\n<i>Ini mungkin memerlukan beberapa saat...</i>`, config, 'HTML');
        if (sentMessage && sentMessage.ok) {
            statusMessageId = sentMessage.result.message_id;
        }
        const result = getVmHistory(pk, config);
        if (result.success) {
            kirimPesanTelegram(result.message, config, 'HTML');
            if (result.data) {
                exportResultsToSheet(result.headers, result.data, `Riwayat Lengkap - ${pk}`, config, userData, KONSTANTA.HEADER_LOG.ACTION);
            }
            if (statusMessageId) {
                editMessageText("✅ Pencarian riwayat selesai.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
            }
        } else {
            kirimPesanTelegram(result.message, config, 'HTML');
            if (statusMessageId) {
                editMessageText("❌ Gagal mencari riwayat.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
            }
        }
    } catch (e) {
        handleCentralizedError(e, `Perintah: /history`, config);
        if (statusMessageId) {
            editMessageText("❌ Terjadi kesalahan kritis.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
        }
    }
  },
  // Handler untuk /cekhistory yang sekarang menerima userData
  [KONSTANTA.PERINTAH_BOT.CEK_HISTORY]: (update, config, userData) => {
      if (update.message.text.split(' ').length > 1) {
        kirimPesanTelegram(`❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.CEK_HISTORY}</code> tanpa argumen tambahan.`, config, 'HTML');
    } else {
        handleHistoryInteraction(update, config, userData);
    }
  },
  [KONSTANTA.PERINTAH_BOT.ARSIPKAN_LOG]: (update, config) => {
    kirimPesanTelegram("⚙️ Menerima perintah arsip. Memeriksa jumlah log...", config);
    cekDanArsipkanLogJikaPenuh(config);
  },
  [KONSTANTA.PERINTAH_BOT.CLEAR_CACHE]: (update, config) => {
    const isCleared = clearBotStateCache();
    kirimPesanTelegram(isCleared ? "✅ Cache state bot (konfigurasi & hak akses) telah berhasil dibersihkan." : "❌ Gagal membersihkan cache.", config);
  },
  [KONSTANTA.PERINTAH_BOT.DISTRIBUSI_VM]: (update, config) => {
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("📊 Menganalisis dan menyusun laporan distribusi aset...", config, 'HTML');
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const laporan = generateAssetDistributionReport(config);
      kirimPesanTelegram(laporan, config, 'HTML');
      if (statusMessageId) {
        editMessageText("✅ Laporan distribusi aset VM selesai dibuat.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah: ${KONSTANTA.PERINTAH_BOT.DISTRIBUSI_VM}`, config);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan distribusi.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.INFO]: (update, config) => kirimPesanInfo(config),
};

/**
 * [HARDENED] Fungsi utama untuk menangani semua permintaan dari Telegram.
 * Logika error diperbaiki untuk memberikan konteks yang lebih spesifik.
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) { return HtmlService.createHtmlOutput("Bad Request"); }
  
  let state = null;
  let contextForError = "Inisialisasi Awal"; // Konteks error default

  try {
    state = getBotState();
    const config = state.config;
    const userAccessMap = state.userAccessMap;

    if (!e.parameter.token || e.parameter.token !== config.WEBHOOK_BOT_TOKEN) {
      console.error("PERINGATAN KEAMANAN: Permintaan ke webhook ditolak karena token tidak valid.");
      return HtmlService.createHtmlOutput("Invalid Token").setStatusCode(401);
    }

    const update = JSON.parse(e.postData.contents);
    const isCallback = !!update.callback_query;

    if (isCallback) {
      // --- [MODIFIKASI UTAMA 1: BLOK TRY-CATCH SPESIFIK] ---
      contextForError = "Pemrosesan Callback Query";
      try {
        const callbackQueryId = update.callback_query.id;
        const callbackData = update.callback_query.data;
        const userEvent = update.callback_query;
        const chatId = userEvent.message.chat.id;
        const messageId = userEvent.message.message_id;

        const userData = userAccessMap.get(String(userEvent.from.id));
        if (!userData || !userData.email) {
          const userMention = `<a href="tg://user?id=${userEvent.from.id}">${escapeHtml(userEvent.from.first_name || userEvent.from.id)}</a>`;
          kirimPesanTelegram(`❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`, config, 'HTML');
          answerCallbackQuery(callbackQueryId, config);
          return HtmlService.createHtmlOutput("Unauthorized");
        }
        userData.firstName = userEvent.from.first_name;
        userData.userId = userEvent.from.id;

        const K = KONSTANTA.CALLBACK_CEKVM;

        // ======================================================
        // ===== ROUTER CALLBACK DENGAN LOGIKA PARSING BARU =====
        // ======================================================
        
        // Handler untuk semua callback yang berhubungan dengan daftar VM di Cluster
        if (callbackData.startsWith(K.CLUSTER_PREFIX)) {
          const isInitial = !callbackData.startsWith(K.CLUSTER_NAV_PREFIX);
          const prefixToRemove = isInitial ? K.CLUSTER_PREFIX : K.CLUSTER_NAV_PREFIX;
          const data = callbackData.replace(prefixToRemove, '');
          
          let itemName = data;
          // Hanya pisahkan nomor halaman jika ini adalah navigasi
          if (!isInitial) {
              const lastUnderscoreIndex = data.lastIndexOf('_');
              if (lastUnderscoreIndex > -1) {
                  itemName = data.substring(0, lastUnderscoreIndex);
              }
          }
          
          handlePaginatedVmList(update, config, 'cluster', itemName, isInitial);
        }
        // Handler untuk semua callback yang berhubungan dengan daftar VM di Datastore
        else if (callbackData.startsWith(K.DATASTORE_LIST_VMS_PREFIX) || callbackData.startsWith(K.DATASTORE_NAV_PREFIX)) {
          const isInitial = callbackData.startsWith(K.DATASTORE_LIST_VMS_PREFIX);
          const prefixToRemove = isInitial ? K.DATASTORE_LIST_VMS_PREFIX : K.DATASTORE_NAV_PREFIX;
          const data = callbackData.replace(prefixToRemove, '');

          let itemName = data;
          // Hanya pisahkan nomor halaman jika ini adalah navigasi
          if (!isInitial) {
              const lastUnderscoreIndex = data.lastIndexOf('_');
              if (lastUnderscoreIndex > -1) {
                  itemName = data.substring(0, lastUnderscoreIndex);
              }
          }
          
          handlePaginatedVmList(update, config, 'datastore', itemName, isInitial);
        }
        // Handler untuk aksi-aksi spesifik lainnya
        else if (callbackData.startsWith(K.HISTORY_PREFIX)) {
          const pk = callbackData.replace(K.HISTORY_PREFIX, '');
          const result = getVmHistory(pk, config);
          kirimPesanTelegram(result.message, config, 'HTML', null, chatId);
          if (result.success && result.data) {
            exportResultsToSheet(result.headers, result.data, `Riwayat Lengkap - ${pk}`, config, userData, KONSTANTA.HEADER_LOG.ACTION);
          }
        } 
        else if (callbackData.startsWith(K.CLUSTER_EXPORT_PREFIX)) {
          const clusterName = callbackData.replace(K.CLUSTER_EXPORT_PREFIX, '');
          const { headers, results } = searchVmsByCluster(clusterName, config);
          exportResultsToSheet(headers, results, `Daftar VM di Cluster ${clusterName}`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
        }
        else if (callbackData.startsWith(K.DATASTORE_EXPORT_PREFIX)) {
          const datastoreName = callbackData.replace(K.DATASTORE_EXPORT_PREFIX, '');
          const { headers, results } = searchVmsByDatastore(datastoreName, config);
          exportResultsToSheet(headers, results, `Daftar VM di Datastore ${datastoreName}`, config, userData, KONSTANTA.HEADER_VM.VM_NAME);
        }
        else if (callbackData.startsWith(K.DATASTORE_PREFIX)) {
          const dsName = callbackData.replace(K.DATASTORE_PREFIX, '');
          try {
            const details = getDatastoreDetails(dsName, config);
            const { pesan, keyboard } = formatDatastoreDetail(details);
            editMessageText(pesan, keyboard, chatId, messageId, config);
          } catch (err) { handleCentralizedError(err, `Detail Datastore: ${dsName}`, config); }
        }
        else if (callbackData.startsWith(KONSTANTA.CALLBACK_TIKET.PREFIX)) {
          handleTicketInteraction(update, config);
        } 
        else if (callbackData.startsWith(KONSTANTA.CALLBACK_HISTORY.PREFIX)) {
          handleHistoryInteraction(update, config, userData);
        } 
        else if (callbackData.startsWith("run_export_log_") || callbackData.startsWith("export_")) {
          handleExportRequest(callbackData, config, userData);
        }
        else {
          // Fallback untuk callback /cekvm (paginasi hasil pencarian)
          handleVmSearchInteraction(update, config, userData);
        }

        answerCallbackQuery(callbackQueryId, config);

      } catch (err) {
        // Tangkap error spesifik dari blok callback dan lempar kembali dengan konteks
        throw new Error(`[${contextForError}] ${err.message}`);
      }
      // --- [AKHIR MODIFIKASI 1] ---

    } else if (update.message && update.message.text) {
      // --- [MODIFIKASI UTAMA 2: BLOK TRY-CATCH SPESIFIK] ---
      contextForError = "Pemrosesan Perintah Teks";
      try {
        const userEvent = update.message;
        const text = userEvent.text;
        if (!text.startsWith('/')) { return HtmlService.createHtmlOutput("OK"); }
        const commandParts = text.split(' ');
        const command = commandParts[0].toLowerCase().split('@')[0];

        if (command === KONSTANTA.PERINTAH_BOT.DAFTAR) {
          const existingUserData = userAccessMap.get(String(userEvent.from.id));
          if (existingUserData && existingUserData.email) {
              kirimPesanTelegram(`Halo ${escapeHtml(userEvent.from.first_name)}, Anda sudah terdaftar.`, config, 'HTML');
          } else {
              const email = commandParts[1];
              if (!email || !email.includes('@') || !email.includes('.')) {
                  kirimPesanTelegram(`Format salah. Gunakan:\n<code>/daftar email.anda@domain.com</code>`, config, 'HTML');
              } else {
                  let notifPesan = `<b>🔔 Permintaan Pendaftaran Baru</b>\n\n<b>Nama:</b> ${escapeHtml(userEvent.from.first_name)}\n<b>Username:</b> ${userEvent.from.username ? '@' + userEvent.from.username : 'N/A'}\n<b>User ID:</b> <code>${userEvent.from.id}</code>\n<b>Email:</b> <code>${escapeHtml(email)}</code>`;
                  kirimPesanTelegram(notifPesan, config, 'HTML');
                  kirimPesanTelegram(`Terima kasih, ${escapeHtml(userEvent.from.first_name)}. Permintaan Anda telah diteruskan.`, config, 'HTML', null, userEvent.chat.id);
              }
          }
          return HtmlService.createHtmlOutput("OK");
        }
        
        const userData = userAccessMap.get(String(userEvent.from.id));
        if (!userData || !userData.email) {
          const userMention = `<a href="tg://user?id=${userEvent.from.id}">${escapeHtml(userEvent.from.first_name || userEvent.from.id)}</a>`;
          kirimPesanTelegram(`❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`, config, 'HTML');
          return HtmlService.createHtmlOutput("Unauthorized");
        }
        userData.firstName = userEvent.from.first_name;
        userData.userId = userEvent.from.id;

        const commandFunction = commandHandlers[command];
        if (commandFunction) {
            commandFunction(update, config, userData);
        } else {
          kirimPesanTelegram(`❌ Perintah <code>${escapeHtml(commandParts[0])}</code> tidak dikenal.\n\nGunakan ${KONSTANTA.PERINTAH_BOT.INFO} untuk melihat daftar perintah.`, config, 'HTML');
        }
      } catch (err) {
        // Tangkap error spesifik dari blok perintah dan lempar kembali dengan konteks
        throw new Error(`[${contextForError}] ${err.message}`);
      }
      // --- [AKHIR MODIFIKASI 2] ---
    }
    
  } catch (err) {
    // Blok catch utama sekarang akan menerima error dengan konteks yang lebih baik
    handleCentralizedError(err, `doPost (${contextForError})`, state ? state.config : null);
  } finally {
    return HtmlService.createHtmlOutput("OK");
  }
}

/**
 * [FUNGSI BARU]
 * Mengirim pesan bantuan (/info) yang dinamis menggunakan konstanta.
 */
function kirimPesanInfo(config) {
  const K = KONSTANTA.PERINTAH_BOT;
  const infoPesan = "<b>Bot Laporan Infrastruktur</b>\n\n" +
                    "Berikut adalah daftar perintah yang tersedia:\n\n" +

                    "📊 <b>Laporan & Analisis</b>\n" +
                    `<code>${K.LAPORAN}</code> - Membuat laporan harian (tanpa sinkronisasi).\n` +
                    `<code>${K.SYNC_LAPORAN}</code> - Sinkronisasi data & buat laporan.\n` +
                    `<code>${K.DISTRIBUSI_VM}</code> - Laporan VM per kritikalitas & environment.\n` +
                    `<code>${K.PROVISIONING}</code> - Laporan alokasi resource infrastruktur.\n` +
                    `<code>${K.MIGRASI_CHECK}</code> - Analisis dan rekomendasi migrasi.\n` +
                    `<code>${K.CEK_TIKET}</code> - Buka laporan monitoring tiket.\n\n` +

                    "🔍 <b>Pencarian & Riwayat</b>\n" +
                    `<code>${K.CEK_VM} [IP/Nama/UUID]</code> - Cari VM berdasarkan IP/Nama/UUID.\n` +
                    `<code>${K.CEK_HISTORY}</code> - Tampilkan log perubahan hari ini.\n` +
                    `<code>${K.HISTORY} [PK]</code> - Tampilkan riwayat lengkap sebuah VM.\n\n` +

                    "🛠️ <b>Utilitas & Bantuan</b>\n" +
                    `<code>${K.EXPORT}</code> - Menu ekspor data ke Sheet.\n` +
                    `<code>${K.DAFTAR} [email]</code> - Registrasi atau minta hak akses.\n` +
                    `<code>${K.ARSIPKAN_LOG}</code> - Jalankan pengarsipan log manual.\n` +
                    `<code>${K.CLEAR_CACHE}</code> - Bersihkan cache hak akses pengguna.\n` +
                    `<code>${K.INFO}</code> - Tampilkan pesan bantuan ini.`;
  kirimPesanTelegram(infoPesan, config, 'HTML');
}

// ===== FILE: Utama.js =====

/**
 * [PERBAIKAN DX] Membuat menu kustom yang lebih terstruktur dan menyertakan setup interaktif.
 */
function onOpen() {
  SpreadsheetApp.getUi()
      .createMenu('⚙️ Menu Bot')
      .addItem('1. Jalankan Pekerjaan Harian Sekarang', 'runDailyJobs')
      .addItem('2. Jalankan Laporan Migrasi Saja', 'jalankanRekomendasiMigrasi')
      .addSeparator()
      // ===== PERUBAHAN DI SINI =====
      .addItem('3. Hapus Cache Bot (State)', 'clearBotStateCache') // Menggunakan nama fungsi baru
      // =============================
      .addItem('4. Tes Koneksi ke Telegram', 'tesKoneksiTelegram')
      .addSeparator()
      .addSubMenu(SpreadsheetApp.getUi().createMenu('🛠️ Setup Awal')
          .addItem('SETUP: Set Token (Interaktif)', 'setupSimpanTokenInteraktif')
          .addItem('SETUP: Set Webhook (Jalankan setelah token di-set)', 'setWebhook'))
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
  
  // Baca konfigurasi sekali di awal
  const config = bacaKonfigurasi();

  // Berikan objek 'config' ke semua fungsi yang membutuhkannya
  syncDanBuatLaporanHarian(false, "TRIGGER HARIAN", config); 
  jalankanPemeriksaanAmbangBatas(config);
  jalankanPemeriksaanDatastore(config);
  
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