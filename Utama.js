/**
 * @file Utama.js
 * @author Djanoer Team
 * @date 2023-01-01
 *
 * @description
 * Merupakan titik masuk (entry point) utama untuk semua interaksi dengan bot.
 * Berisi fungsi `doPost(e)` yang menangani semua permintaan masuk dari webhook
 * Telegram, serta `commandHandlers` yang merutekan perintah berbasis teks.
 *
 * @section FUNGSI UTAMA
 * - doPost(e): Fungsi webhook utama yang menerima dan memproses semua update dari Telegram.
 * - commandHandlers: Objek yang memetakan perintah teks (misal: /laporanharian) ke fungsi yang sesuai.
 * - onOpen(): Membuat menu kustom di antarmuka Google Sheet.
 */

/**
 * [REFACTORED v4.3.1] Handler untuk semua perintah bot.
 * Memperbaiki alur untuk /history, /cekhistory, dan /distribusi_vm.
 */
const commandHandlers = {
  [KONSTANTA.PERINTAH_BOT.LAPORAN]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("⏳ Membuat laporan harian...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const pesanLaporan = buatLaporanHarianVM(config);
      editMessageText(pesanLaporan, null, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: /laporan-harian`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan harian.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.SYNC_LAPORAN]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;

    // 1. Kirim pesan status awal
    const timestamp = new Date().toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" });
    let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp} (dari Perintah /syncdata)</b>\n\n⏳ Sinkronisasi penuh & pembuatan laporan telah ditambahkan ke antrean...`;
    const sentMessage = kirimPesanTelegram(pesanAwal, config, "HTML", null, chatId);
    let statusMessageId = null;
    if (sentMessage && sentMessage.ok) {
      statusMessageId = sentMessage.result.message_id;
    }

    // 2. Buat tiket pekerjaan (job)
    const jobData = {
      jobType: "sync_and_report",
      config: config,
      chatId: chatId,
      statusMessageId: statusMessageId,
      userData: userDataAuth, // Sertakan info pengguna
    };

    // 3. Tambahkan pekerjaan ke antrean
    const jobKey = `job_manual_sync_${Date.now()}`;
    PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));
  },
  [KONSTANTA.PERINTAH_BOT.PROVISIONING]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("📊 Menganalisis laporan provisioning...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // Memanggil fungsi baru yang cepat dan berbasis cache
      const { headers, dataRows } = getVmData(config);
      // Menyalurkan data yang sudah siap ke fungsi laporan
      const laporan = generateProvisioningReport(config, dataRows, headers);

      editMessageText(laporan, null, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, "Perintah: /laporan-provisioning", config, userDataAuth);
      if (statusMessageId) {
        editMessageText(
          `❌ Gagal membuat laporan provisioning.\n\n<b>Penyebab:</b>\n<pre>${escapeHtml(e.message)}</pre>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_TIKET]: (update, config, userDataAuth) => {
    // --- PERBAIKAN DIMULAI DI SINI ---
    // 1. Ambil ID chat yang benar dari pesan masuk
    const chatId = update.message.chat.id;
    let statusMessageId = null;

    try {
      // 2. Kirim pesan "tunggu" ke chat yang benar
      const sentMessage = kirimPesanTelegram("⏳ Menyiapkan laporan tiket...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      } else {
        throw new Error("Gagal mengirim pesan awal ke chat target.");
      }

      // 3. Buat tampilan ringkasan (logika ini tidak berubah)
      const { text, keyboard } = generateSummaryView(config);

      // 4. Edit pesan di chat yang benar
      editMessageText(text, keyboard, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, "Perintah: /cektiket", config, userDataAuth);
      if (statusMessageId) {
        // Edit pesan error di chat yang benar
        editMessageText("❌ Gagal membuat laporan tiket.", null, chatId, statusMessageId, config);
      }
    }
    // --- AKHIR PERBAIKAN ---
  },
  [KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK]: (update, config, userDataAuth) => {
    const userId = String(update.message.from.id);
    const cacheKey = `rate_limit_migrasi_${userId}`;
    const cache = CacheService.getUserCache();

    if (cache.get(cacheKey)) {
      kirimPesanTelegram(
        "⏳ Perintah ini baru saja dijalankan. Harap tunggu beberapa saat sebelum mencoba lagi.",
        config,
        "HTML",
        null,
        update.message.chat.id
      );
      return;
    }

    // Set batasan untuk 2 menit (120 detik)
    cache.put(cacheKey, "true", 120);

    let statusMessageId = null;
    const chatId = update.message.chat.id;
    try {
      const sentMessage = kirimPesanTelegram(
        "🔬 Menganalisis rekomendasi migrasi datastore...",
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // 1. Kumpulkan semua data yang diperlukan sekali. Fungsi ini sekarang ada di Analisis.js
      const { allDatastores, allVms, vmHeaders, migrationConfig } = _gatherMigrationDataSource(config);

      // 2. Suntikkan semua data ke dalam fungsi. Fungsi ini sekarang tidak mengembalikan apa-apa,
      // karena pengiriman pesan sudah ditangani di dalamnya.
      jalankanRekomendasiMigrasi(config, allDatastores, allVms, vmHeaders, migrationConfig);

      // Pesan "selesai" tidak lagi diperlukan karena pesan laporan sudah langsung dikirim.
      // Kita bisa langsung menghapus pesan "tunggu" jika mau.
      if (statusMessageId) {
        callTelegramApi("deleteMessage", { chat_id: chatId, message_id: statusMessageId }, config);
      }
    } catch (e) {
      handleCentralizedError(e, "Perintah: /migrasicheck", config, userDataAuth, userDataAuth);
      if (statusMessageId) {
        editMessageText(
          `❌ Gagal menjalankan analisis migrasi.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.EXPORT]: (update, config) => {
    if (update.message.text.split(" ").length > 1) {
      kirimPesanTelegram(
        `❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.EXPORT}</code> tanpa argumen tambahan.`,
        config,
        "HTML"
      );
    } else {
      kirimMenuEkspor(config);
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_VM]: (update, config, userData) => {
    // Memanggil handler baru yang benar
    handleVmSearch(update, config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_CLUSTER]: (update, config, userData) => {
    const chatId = update.message.chat.id;
    const clusterName = update.message.text.split(" ").slice(1).join(" ");

    if (!clusterName) {
      kirimPesanTelegram(`Gunakan format: <code>/cekcluster [nama_cluster]</code>`, config, "HTML", null, chatId);
      return;
    }

    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram(
        `⏳ Menganalisis cluster <b>${escapeHtml(clusterName)}</b>...`,
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // 1. Ambil data sekali dari cache/sheet
      const { headers: vmHeaders, dataRows: allVmData } = getVmData(config);

      // 2. Saring data di memori
      const clusterHeader = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_CLUSTER];
      const clusterIndex = vmHeaders.indexOf(clusterHeader);
      const vmsInCluster = allVmData.filter(
        (row) => String(row[clusterIndex] || "").toLowerCase() === clusterName.toLowerCase()
      );

      if (vmsInCluster.length === 0) {
        editMessageText(
          `ℹ️ Tidak ditemukan VM di cluster "<b>${escapeHtml(clusterName)}</b>".`,
          null,
          chatId,
          statusMessageId,
          config
        );
        return;
      }

      // 3. Delegasikan analisis dan pemformatan
      const analysisResult = generateClusterAnalysis(clusterName, vmsInCluster, vmHeaders, config);
      const { pesan, keyboard } = formatClusterDetail(analysisResult, vmsInCluster, vmHeaders, config);

      // 4. Tampilkan hasil akhir
      editMessageText(pesan, keyboard, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: /cekcluster`, config, userData);
      if (statusMessageId) {
        editMessageText(
          `❌ Gagal menganalisis cluster.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.HISTORY]: (update, config, userDataAuth) => {
    const pk = update.message.text.split(" ")[1] ? update.message.text.split(" ")[1].trim() : null;
    if (!pk) {
      kirimPesanTelegram(
        `Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.HISTORY} [PK]</code>`,
        config,
        "HTML",
        null,
        update.message.chat.id
      );
      return;
    }
    const mockUpdate = {
      callback_query: {
        from: update.message.from,
        message: update.message,
        sessionData: { pk: pk, page: 1 },
      },
    };
    handleHistoryInteraction(mockUpdate, "show", config, userDataAuth);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_HISTORY]: (update, config, userDataAuth) => {
    const mockUpdate = {
      callback_query: {
        from: update.message.from,
        message: update.message,
        sessionData: { timeframe: "today", page: 1 },
      },
    };
    handleHistoryInteraction(mockUpdate, "show", config, userDataAuth);
  },
  [KONSTANTA.PERINTAH_BOT.ARSIPKAN_LOG]: (update, config) => {
    let statusMessageId = null;
    const chatId = update.message.chat.id;

    try {
      // 1. Kirim pesan "sedang bekerja" dan simpan ID pesannya
      const sentMessage = kirimPesanTelegram(
        "⏳ Memulai proses pengarsipan... Ini mungkin memerlukan beberapa saat.",
        config,
        "HTML",
        null,
        chatId
      );

      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // 2. Jalankan pekerjaan beratnya secara langsung
      const resultLogPerubahan = cekDanArsipkanLogJikaPenuh(config);
      const resultLogStorage = cekDanArsipkanLogStorageJikaPenuh(config);

      // 3. Susun laporan hasil akhir
      let finalReport = "<b>Laporan Hasil Pengarsipan Manual</b>\n\n";
      finalReport += `• <b>Log Perubahan VM & DS:</b>\n  └ <i>${resultLogPerubahan}</i>\n\n`;
      finalReport += `• <b>Log Storage Historis:</b>\n  └ <i>${resultLogStorage}</i>`;

      // 4. Edit pesan awal dengan laporan hasil akhir
      if (statusMessageId) {
        editMessageText(finalReport, null, chatId, statusMessageId, config);
      } else {
        // Fallback jika pengiriman pesan awal gagal, kirim sebagai pesan baru
        kirimPesanTelegram(finalReport, config, "HTML", null, chatId);
      }
    } catch (e) {
      const errorMessage = `🔴 Terjadi kesalahan kritis saat menjalankan pengarsipan: ${e.message}`;
      // Jika terjadi error, edit pesan status untuk menampilkan error
      if (statusMessageId) {
        editMessageText(errorMessage, null, chatId, statusMessageId, config);
      } else {
        handleCentralizedError(e, `Perintah: /arsipkanlog`, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CLEAR_CACHE]: (update, config) => {
    const isCleared = clearBotStateCache();
    kirimPesanTelegram(
      isCleared
        ? "✅ Cache state bot (konfigurasi & hak akses) telah berhasil dibersihkan."
        : "❌ Gagal membersihkan cache.",
      config
    );
  },
  [KONSTANTA.PERINTAH_BOT.DISTRIBUSI_VM]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram(
        "📊 Menganalisis laporan distribusi aset...",
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      // Memanggil fungsi baru yang cepat dan berbasis cache
      const { headers, dataRows } = getVmData(config);
      // Menyalurkan data yang sudah siap ke fungsi laporan
      const laporan = generateAssetDistributionReport(config, dataRows, headers);
      editMessageText(laporan, null, chatId, statusMessageId, config);
    } catch (e) {
      handleCentralizedError(e, `Perintah: /laporan-aset`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan distribusi.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_KONDISI]: (update, config) => {
    let statusMessageId = null;
    const chatId = update.message.chat.id;
    try {
      const sentMessage = kirimPesanTelegram("🔬 Memulai pemeriksaan kondisi sistem...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // Panggil fungsi analisis yang sekarang mengembalikan objek {pesan, keyboard}
      const { pesan, keyboard } = jalankanPemeriksaanAmbangBatas(config);

      // Edit pesan "tunggu" dengan laporan akhir dan tombolnya
      if (statusMessageId) {
        editMessageText(pesan, keyboard, chatId, statusMessageId, config);
      } else {
        kirimPesanTelegram(pesan, config, "HTML", keyboard, chatId);
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah: ${KONSTANTA.PERINTAH_BOT.CEK_KONDISI}`, config);
      if (statusMessageId) {
        editMessageText("❌ Gagal menjalankan pemeriksaan kondisi.", null, chatId, statusMessageId, config);
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.INFO]: (update, config, userDataAuth) => {
    kirimPesanInfo(update, config, userDataAuth);
  },
  [KONSTANTA.PERINTAH_BOT.SIMULASI]: (update, config) => {
    const args = update.message.text.split(" ");
    const subCommand = (args[1] || "").toLowerCase();
    const parameter = args.slice(2).join(" ");

    if (!subCommand || !parameter || (subCommand !== "cleanup" && subCommand !== "migrasi")) {
      kirimPesanTelegram(
        "Format perintah tidak valid. Gunakan:\n" +
          "<code>/simulasi cleanup [nama_cluster]</code>\n" +
          "<code>/simulasi migrasi [nama_host_sumber]</code>",
        config,
        "HTML"
      );
      return;
    }

    try {
      // Membuat "tiket tugas" untuk simulasi
      const properties = PropertiesService.getScriptProperties();
      const jobData = {
        chatId: update.message.chat.id,
        userId: update.message.from.id,
        subCommand: subCommand,
        parameter: parameter,
        triggerTime: new Date().toISOString(),
      };

      // Simpan tugas dengan kunci unik. Kita bisa menumpuk beberapa tugas.
      const newJobKey = `PENDING_SIMULATION_JOB_${Date.now()}`;
      properties.setProperty(newJobKey, JSON.stringify(jobData));

      // Kirim respons instan ke pengguna
      kirimPesanTelegram(
        `✅ Permintaan simulasi <b>${subCommand}</b> diterima.\n\n` +
          "Proses kalkulasi berjalan di latar belakang. Anda akan menerima hasilnya dalam pesan terpisah sesaat lagi.",
        config,
        "HTML"
      );
    } catch (e) {
      handleCentralizedError(e, `Perintah /simulasi (Membuat Tugas)`, config);
    }
  },
  [KONSTANTA.PERINTAH_BOT.GRAFIK]: (update, config, userDataAuth) => {
    const chatId = update.message.chat.id;
    const args = update.message.text.split(" ");
    const tipeGrafik = (args[1] || "").toLowerCase();

    if (!tipeGrafik || (tipeGrafik !== "kritikalitas" && tipeGrafik !== "environment")) {
      kirimPesanTelegram(
        "Format perintah tidak valid. Gunakan:\n" +
          "<code>/grafik kritikalitas</code>\n" +
          "<code>/grafik environment</code>",
        config,
        "HTML",
        null,
        chatId
      );
      return;
    }

    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("🎨 Membuat grafik, harap tunggu...", config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const chartBlob = buatGrafikDistribusi(tipeGrafik, config);
      const caption = `Berikut adalah grafik distribusi VM berdasarkan <b>${tipeGrafik}</b>.`;

      const photoSent = kirimFotoTelegram(chartBlob, caption, config, chatId);

      // --- PERBAIKAN UTAMA DI SINI ---
      // Hapus pesan "tunggu" setelah foto berhasil terkirim
      if (photoSent && photoSent.ok) {
        if (statusMessageId) {
          callTelegramApi("deleteMessage", { chat_id: chatId, message_id: statusMessageId }, config);
        }
      } else {
        throw new Error("Gagal mengirim gambar grafik ke Telegram.");
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah /grafik`, config, userDataAuth);
      if (statusMessageId) {
        editMessageText(
          `❌ <b>Gagal membuat grafik.</b>\n\n<b>Penyebab:</b>\n<pre>${escapeHtml(e.message)}</pre>`,
          null,
          chatId,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.LOG_REPORT]: (update, config) => {
    const repliedToMessage = update.message.reply_to_message;
    if (!repliedToMessage || !repliedToMessage.text) {
      kirimPesanTelegram(
        "❌ Perintah ini harus digunakan dengan cara me-reply (membalas) pesan laporan storage yang ingin Anda catat.",
        config,
        "HTML"
      );
      return;
    }

    const textBlock = repliedToMessage.text;
    try {
      // 1. Jalankan prosesnya terlebih dahulu
      const result = processAndLogReport(textBlock, config);

      if (result.success) {
        const successMessage = `✅ Data untuk storage <b>${escapeHtml(result.storageName)}</b> telah berhasil dicatat.`;
        // 2. Kirim satu pesan konfirmasi setelah berhasil
        kirimPesanTelegram(successMessage, config, "HTML", null, update.message.chat.id);
      }
    } catch (e) {
      // Penanganan error sekarang mengirim pesan error langsung
      handleCentralizedError(e, `Perintah /catatlaporanstorage`, config);
      kirimPesanTelegram(
        `⚠️ Gagal memproses laporan.\n\nPenyebab: <i>${e.message}</i>`,
        config,
        "HTML",
        null,
        update.message.chat.id
      );
    }
  },
  [KONSTANTA.PERINTAH_BOT.REKOMENDASI_SETUP]: (update, config, userDataAuth) => {
    mulaiPercakapanRekomendasi(update.message.chat.id, String(update.message.from.id), config);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_STORAGE]: (update, config, userData) => {
    const chatId = update.message.chat.id;
    const storageType = update.message.text.split(" ").slice(1).join(" ");

    // Jika TIDAK ada argumen, jalankan perilaku lama (laporan ringkasan)
    if (!storageType) {
      let statusMessageId = null;
      try {
        const sentMessage = kirimPesanTelegram("📊 Menganalisis utilisasi storage...", config, "HTML", null, chatId);
        if (sentMessage && sentMessage.ok) {
          statusMessageId = sentMessage.result.message_id;
        }
        const report = generateStorageUtilizationReport(config); // Memanggil fungsi lama
        editMessageText(report, null, chatId, statusMessageId, config);
      } catch (e) {
        handleCentralizedError(e, `Perintah /cekstorage (ringkasan)`, config, userData);
        if (statusMessageId) {
          editMessageText(
            `❌ Gagal membuat laporan utilisasi storage.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
            null,
            chatId,
            statusMessageId,
            config
          );
        }
      }
      return;
    }

    // Jika ADA argumen, mulai alur kerja interaktif yang baru
    handleStorageExplorer(update, "start", config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.STATUS]: (update, config) => {
    // Tambahkan blok ini
    const pesanStatus = jalankanPemeriksaanKesehatan();
    kirimPesanTelegram(pesanStatus, config, "HTML");
  },
  [KONSTANTA.PERINTAH_BOT.MANAGE_CONFIG]: (update, config, userData) => {
    // Memulai alur kerja interaktif untuk manajemen konfigurasi
    handleConfigManager(update, "start", config, userData);
  },
};

/**
 * [REVISI ARSITEKTURAL FINAL] Fungsi utama yang menangani semua permintaan dari Telegram.
 * Logika pemrosesan teks stateful telah dipindahkan ke StateMachine.js untuk
 * menjaga fungsi ini tetap bersih sebagai router.
 */
function doPost(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return HtmlService.createHtmlOutput("Bad Request");
  }

  let state = null;
  let contextForError = "Inisialisasi Awal";

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
      // --- BLOK PENANGANAN CALLBACK QUERY (TIDAK BERUBAH) ---
      contextForError = "Pemrosesan Callback Query";
      const userEvent = update.callback_query;
      const callbackData = userEvent.data;
      const callbackQueryId = userEvent.id;

      if (!userEvent.message) {
        console.warn("Diterima callback query tanpa objek 'message'. Mengabaikan.");
        answerCallbackQuery(callbackQueryId, config);
        return HtmlService.createHtmlOutput("OK");
      }

      const userData = userAccessMap.get(String(userEvent.from.id));
      if (!userData) {
        const userMention = `<a href="tg://user?id=${userEvent.from.id}">${escapeHtml(
          userEvent.from.first_name || userEvent.from.id
        )}</a>`;
        kirimPesanTelegram(
          `❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`,
          config,
          "HTML",
          null,
          userEvent.message.chat.id
        );
        answerCallbackQuery(callbackQueryId, config);
        return HtmlService.createHtmlOutput("Unauthorized");
      }
      userData.firstName = userEvent.from.first_name;
      userData.userId = String(userEvent.from.id);

      const parts = callbackData.split(":");
      const machineName = parts[0];
      const action = parts[1];
      const sessionId = parts[2];

      if (machineName && action && sessionId) {
        const sessionData = getCallbackSession(sessionId, config);
        if (sessionData) {
          userEvent.sessionData = sessionData;

          switch (machineName) {
            case "search_machine":
              searchMachine(update, action, config, userData);
              break;
            case "history_machine":
              handleHistoryInteraction(update, action, config, userData);
              break;
            case "note_machine":
              noteMachine(update, action, config);
              break;
            case "export_machine":
              exportMachine(update, config, userData);
              break;
            case "rekomendasi_machine":
              rekomendasiMachine(update, action, config);
              break;
            case "ticket_machine":
              ticketMachine(update, action, config);
              break;
            case "registration_machine":
              registrationMachine(update, action, config);
              break;
            case "storage_explorer_machine":
              handleStorageExplorer(update, action, config, userData);
              break;
            case "config_machine":
              handleConfigManager(update, action, config, userData);
              break;
            default:
              console.warn(`Mesin tidak dikenal: ${machineName}`);
          }
        } else {
          console.warn(`Sesi tidak valid atau sudah digunakan: ${sessionId}. Permintaan diabaikan.`);
          answerCallbackQuery(callbackQueryId, config, "Sesi telah kedaluwarsa. Harap mulai ulang perintah.");
        }
      } else {
        console.warn("Menerima callback dengan format yang tidak dikenal:", callbackData);
        answerCallbackQuery(callbackQueryId, config, "Aksi ini menggunakan format lama dan tidak didukung.");
      }

      if (!callbackData.includes("export_machine")) {
        answerCallbackQuery(callbackQueryId, config);
      }
    } else if (update.message && update.message.text) {
      // --- BLOK PENANGANAN PESAN TEKS (TELAH DIREFAKTOR) ---
      contextForError = "Pemrosesan Perintah Teks";
      const userEvent = update.message;
      const text = userEvent.text;
      const userId = String(userEvent.from.id);

      const userState = getUserState(userId);

      if (userState && userState.action) {
        // Jika pengguna dalam percakapan, delegasikan ke state machine dan selesai.
        routeToStateMachineByState(update, userState, config, userAccessMap);
        return HtmlService.createHtmlOutput("OK");
      }

      // Jika tidak ada state, proses sebagai perintah baru.
      if (!text.startsWith("/")) {
        return HtmlService.createHtmlOutput("OK");
      }

      const commandParts = text.split(" ");
      const command = commandParts[0].toLowerCase().split("@")[0];

      if (command === KONSTANTA.PERINTAH_BOT.DAFTAR) {
        const existingUserData = userAccessMap.get(String(userEvent.from.id));
        if (existingUserData && existingUserData.email) {
          kirimPesanTelegram(
            `Halo ${escapeHtml(userEvent.from.first_name)}, Anda sudah terdaftar.`,
            config,
            "HTML",
            null,
            userEvent.chat.id
          );
          return HtmlService.createHtmlOutput("OK");
        }
        const email = commandParts[1];
        if (!email || !email.includes("@") || !email.includes(".")) {
          kirimPesanTelegram(
            `Format salah. Gunakan:\n<code>/daftar email.anda@domain.com</code>`,
            config,
            "HTML",
            null,
            userEvent.chat.id
          );
          return HtmlService.createHtmlOutput("OK");
        }
        const sessionData = {
          userId: userEvent.from.id,
          firstName: userEvent.from.first_name,
          username: userEvent.from.username || "N/A",
          email: email,
        };
        const keyboard = {
          inline_keyboard: [
            [
              {
                text: "✅ Setujui User",
                callback_data: CallbackHelper.build("registration_machine", "approve_user", sessionData, config),
              },
              {
                text: "👑 Jadikan Admin",
                callback_data: CallbackHelper.build("registration_machine", "approve_admin", sessionData, config),
              },
            ],
            [
              {
                text: "❌ Tolak",
                callback_data: CallbackHelper.build("registration_machine", "reject", sessionData, config),
              },
            ],
          ],
        };
        let notifPesan = `<b>🔔 Permintaan Pendaftaran Baru</b>\n\n`;
        notifPesan += `<b>Nama:</b> ${escapeHtml(sessionData.firstName)}\n`;
        notifPesan += `<b>Username:</b> @${sessionData.username}\n`;
        notifPesan += `<b>User ID:</b> <code>${sessionData.userId}</code>\n`;
        notifPesan += `<b>Email:</b> <code>${escapeHtml(sessionData.email)}</code>`;
        kirimPesanTelegram(notifPesan, config, "HTML", keyboard);
        kirimPesanTelegram(
          `Terima kasih, ${escapeHtml(sessionData.firstName)}. Permintaan Anda telah diteruskan...`,
          config,
          "HTML",
          null,
          userEvent.chat.id
        );
        return HtmlService.createHtmlOutput("OK");
      }

      const userDataAuth = userAccessMap.get(userId);
      if (!userDataAuth || !userDataAuth.email) {
        const userMention = `<a href="tg://user?id=${userEvent.from.id}">${escapeHtml(
          userEvent.from.first_name || userEvent.from.id
        )}</a>`;
        kirimPesanTelegram(`❌ Maaf ${userMention}, Anda tidak terdaftar...`, config, "HTML");
        return HtmlService.createHtmlOutput("Unauthorized");
      }
      userDataAuth.firstName = userEvent.from.first_name;
      userDataAuth.userId = userEvent.from.id;

      const commandFunction = commandHandlers[command];
      if (commandFunction) {
        const isAdminCommand = (KONSTANTA.PERINTAH_ADMIN || []).includes(command);
        const userRole = userDataAuth.role || "User";
        if (isAdminCommand && userRole.toLowerCase() !== "admin") {
          kirimPesanTelegram(
            `❌ Maaf, perintah <code>${escapeHtml(command)}</code> hanya dapat diakses oleh Admin.`,
            config,
            "HTML"
          );
        } else {
          commandFunction(update, config, userDataAuth);
        }
      } else {
        const closestCommand = findClosestCommand(command);
        let errorMessage = `❓ Perintah <code>${escapeHtml(command)}</code> tidak ditemukan.`;
        if (closestCommand) {
          errorMessage += `\n\nMungkin maksud Anda: <b>${closestCommand}</b>`;
        } else {
          errorMessage += `\n\nGunakan ${KONSTANTA.PERINTAH_BOT.INFO} untuk melihat daftar perintah yang valid.`;
        }
        kirimPesanTelegram(errorMessage, config, "HTML");
      }
    }
  } catch (err) {
    const errorOrigin = update.message
      ? update.message.from
      : update.callback_query
      ? update.callback_query.from
      : null;
    handleCentralizedError(err, `doPost (${contextForError})`, state ? state.config : null, errorOrigin);
  } finally {
    return HtmlService.createHtmlOutput("OK");
  }
}

/**
 * [REVISI FINAL] Mengirim pesan bantuan (/info) yang dinamis dan sadar peran.
 * Versi ini sekarang menerima objek 'update' untuk memastikan pengiriman ke chat yang benar.
 */
function kirimPesanInfo(update, config, userData) {
  const K = KONSTANTA.PERINTAH_BOT;
  const chatId = update.message.chat.id; // <-- Ambil chat ID yang benar

  let infoPesan =
    "<b>Bot Laporan Infrastruktur</b>\n\n" +
    "Berikut adalah daftar perintah yang tersedia:\n\n" +
    "📊 <b>Laporan & Analisis</b>\n" +
    `<code>${K.LAPORAN}</code> - Laporan operasional harian instan.\n` +
    `<code>${K.PROVISIONING}</code> - Laporan detail alokasi sumber daya.\n` +
    `<code>${K.DISTRIBUSI_VM}</code> - Laporan distribusi aset VM.\n` +
    `<code>${K.CEK_KONDISI}</code> - Analisis kondisi & anomali sistem.\n` +
    `<code>${K.MIGRASI_CHECK}</code> - Analisis & rekomendasi migrasi.\n\n` +
    `<code>${K.CEK_CLUSTER} [nama]</code> - Analisis mendalam sebuah cluster.\n` +
    `<code>${K.CEK_STORAGE}</code> - Ringkasan utilisasi storage.\n` +
    `<code>${K.CEK_STORAGE} [tipe]</code> - Jelajahi storage secara interaktif.\n\n` +
    "🔍 <b>Pencarian & Riwayat</b>\n" +
    `<code>${K.CEK_VM} [Nama/IP/PK]</code> - Cari detail VM.\n` +
    `<code>${K.HISTORY} [PK]</code> - Lacak riwayat lengkap sebuah VM.\n` +
    `<code>${K.CEK_HISTORY}</code> - Riwayat perubahan data hari ini.\n\n` +
    "⚙️ <b>Interaktif & Aksi</b>\n" +
    `<code>${K.REKOMENDASI_SETUP}</code> - Buka panduan untuk rekomendasi setup VM baru.\n` +
    `<code>${K.CEK_TIKET}</code> - Buka menu monitoring tiket.\n` +
    `<code>${K.GRAFIK}</code> - Tampilkan grafik visual (misal: /grafik kritikalitas).\n` +
    `<code>${K.SIMULASI} [cleanup/migrasi]</code> - Jalankan skenario perencanaan.\n` +
    `<code>${K.LOG_REPORT}</code> - (Reply) Catat laporan storage manual.\n\n` +
    "🛠️ <b>Utilitas</b>\n" +
    `<code>${K.EXPORT}</code> - Buka menu ekspor data ke Google Sheet.\n` +
    `<code>${K.STATUS}</code> - Pemeriksaan kesehatan sistem bot.\n` +
    `<code>${K.DAFTAR}</code> - Minta hak akses untuk menggunakan bot.\n` +
    `<code>${K.INFO}</code> - Tampilkan pesan bantuan ini.`;

  const userRole = userData && userData.role ? userData.role.toLowerCase() : "user";
  if (userRole === "admin") {
    infoPesan +=
      "\n\n" +
      "🛡️ <b>Perintah Administratif</b>\n" +
      `<code>${K.SYNC_LAPORAN}</code> - Sinkronisasi data & laporan lengkap.\n` +
      `<code>${K.ARSIPKAN_LOG}</code> - Jalankan pengarsipan semua log manual.\n` +
      `<code>${K.CLEAR_CACHE}</code> - Bersihkan cache hak akses & konfigurasi.` +
      `<code>${K.MANAGE_CONFIG}</code> - Kelola konfigurasi bot secara interaktif.`;
  }

  // Kirim pesan ke chat ID yang benar
  kirimPesanTelegram(infoPesan, config, "HTML", null, chatId);
}

/**
 * [FINAL v1.3.1] Membuat menu kustom di UI Spreadsheet saat dibuka.
 * Versi ini menambahkan sub-menu khusus "Menu Admin" untuk perintah-perintah
 * yang bersifat administratif dan pemeliharaan.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("⚙️ Menu Bot")
    // Menu untuk pengguna umum atau tes cepat
    .addItem("1. Jalankan Laporan Migrasi Saja", "jalankanLaporanMigrasiDariMenu")
    .addSeparator()

    // Sub-menu khusus untuk Administrator Bot
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu("⚙️ Menu Admin")
        .addItem("Jalankan Sinkronisasi & Laporan Penuh", "runDailyJobsWithUiFeedback")
        .addItem("Jalankan Pengarsipan Log Perubahan VM & DS", "runChangeLogArchivingWithUiFeedback")
        .addItem("Jalankan Pengarsipan Log Storage", "runStorageLogArchivingWithUiFeedback")
        .addItem("Bersihkan Cache Bot (State & Akses)", "clearBotStateCacheWithUiFeedback")
    )
    .addSeparator()

    // Sub-menu untuk setup dan diagnostik
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu("🛠️ Setup & Diagnostik")
        .addItem("Tes Koneksi ke Telegram", "tesKoneksiTelegram")
        .addItem("SETUP: Set Token (Interaktif)", "setupSimpanTokenInteraktif")
        .addItem("Hapus Webhook Saat Ini", "hapusWebhook")
        .addSeparator() // Tambahkan pemisah agar rapi
        .addItem("Jalankan Pengujian Unit", "jalankanSemuaTes")
    )
    .addToUi();
}

// === FUNGSI-FUNGSI WRAPPER UNTUK UI FEEDBACK ===

/**
 * [REFACTORED V.1.1] Mendelegasikan pekerjaan sinkronisasi penuh ke antrean
 * untuk menghindari timeout saat dijalankan dari menu.
 */
function runDailyJobsWithUiFeedback() {
  const { config, userDataMap } = getBotState(); // Menggunakan getBotState untuk efisiensi

  // Memberi notifikasi ke UI Spreadsheet
  SpreadsheetApp.getUi().alert(
    "Permintaan Diterima",
    "Sinkronisasi penuh dan pembuatan laporan telah ditambahkan ke antrean dan akan diproses di latar belakang. Anda akan menerima laporan di Telegram setelah selesai.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  // Mengirim pesan status awal ke Telegram
  const timestamp = new Date().toLocaleString("id-ID", { hour: "2-digit", minute: "2-digit" });
  let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp} (dari Menu)</b>\n\n⏳ Sinkronisasi penuh & pembuatan laporan telah ditambahkan ke antrean...`;
  const sentMessage = kirimPesanTelegram(pesanAwal, config, "HTML");
  let statusMessageId = null;
  if (sentMessage && sentMessage.ok) {
    statusMessageId = sentMessage.result.message_id;
  }

  // Membuat tiket pekerjaan (job)
  const jobData = {
    jobType: "sync_and_report",
    config: config,
    chatId: config.TELEGRAM_CHAT_ID, // Menggunakan chat ID utama
    statusMessageId: statusMessageId, // Menyertakan ID pesan status
  };

  // Menambahkan pekerjaan ke antrean
  const jobKey = `job_manual_sync_${Date.now()}`;
  PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));
}

/**
 * [WRAPPER] Mengganti nama agar lebih spesifik untuk Log Perubahan.
 */
function runChangeLogArchivingWithUiFeedback() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Pengecekan dan pengarsipan Log Perubahan sedang berjalan...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const resultMessage = cekDanArsipkanLogJikaPenuh(); // Fungsi lama
    SpreadsheetApp.getUi().alert("Proses Selesai", resultMessage, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Gagal!", `Terjadi kesalahan: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * [WRAPPER BARU v1.6.0] Menjalankan pengarsipan Log Storage dan memberikan feedback ke UI.
 */
function runStorageLogArchivingWithUiFeedback() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Pengecekan dan pengarsipan Log Storage sedang berjalan...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const resultMessage = cekDanArsipkanLogStorageJikaPenuh();
    SpreadsheetApp.getUi().alert("Proses Selesai", resultMessage, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    SpreadsheetApp.getUi().alert("Gagal!", `Terjadi kesalahan: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
}

/**
 * [WRAPPER] Menjalankan clearBotStateCache dan memberikan feedback ke UI.
 */
function clearBotStateCacheWithUiFeedback() {
  const isCleared = clearBotStateCache();
  if (isCleared) {
    SpreadsheetApp.getUi().alert(
      "Sukses!",
      "Cache state bot (konfigurasi & hak akses) telah berhasil dibersihkan.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } else {
    SpreadsheetApp.getUi().alert(
      "Gagal!",
      "Gagal membersihkan cache. Periksa log untuk detail.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * [WRAPPER] Menjalankan laporan migrasi dan memberikan feedback ke UI.
 * (Fungsi ini sudah ada sebelumnya, hanya dipindahkan agar berkelompok)
 */
function jalankanLaporanMigrasiDariMenu() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Analisis rekomendasi migrasi sedang berjalan di latar belakang...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const laporan = jalankanRekomendasiMigrasi();
    kirimPesanTelegram(laporan, getBotState().config, "HTML");
    SpreadsheetApp.getUi().alert(
      "Terkirim!",
      "Laporan analisis migrasi telah dikirim ke Telegram.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert(
      "Gagal!",
      `Gagal membuat laporan migrasi. Error: ${e.message}`,
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  }
}

function kirimMenuEkspor(config) {
  const message = "<b>Pusat Laporan Ekspor</b>\n\nSilakan pilih data yang ingin Anda ekspor:";

  const createExportCallback = (exportType) => {
    // Menggunakan CallbackHelper untuk membuat callback yang stateful
    return CallbackHelper.build("export_machine", "run", { type: exportType }, config);
  };

  const keyboard = {
    inline_keyboard: [
      [{ text: "--- Log Perubahan ---", callback_data: "ignore" }],
      [
        { text: "📄 Log Hari Ini", callback_data: createExportCallback("log_today") },
        { text: "📅 Log 7 Hari", callback_data: createExportCallback("log_7_days") },
      ],
      [{ text: "🗓️ Log 30 Hari", callback_data: createExportCallback("log_30_days") }],
      [{ text: "--- VM berdasarkan Uptime ---", callback_data: "ignore" }],
      [
        { text: "⚙️ < 1 Thn", callback_data: createExportCallback("uptime_cat_1") },
        { text: "⚙️ 1-2 Thn", callback_data: createExportCallback("uptime_cat_2") },
      ],
      [
        { text: "⚙️ 2-3 Thn", callback_data: createExportCallback("uptime_cat_3") },
        { text: "⚙️ > 3 Thn", callback_data: createExportCallback("uptime_cat_4") },
      ],
      [{ text: "❓ Uptime Tdk Valid", callback_data: createExportCallback("uptime_invalid") }],
      [{ text: "--- Data Master VM ---", callback_data: "ignore" }],
      [
        { text: "📄 Semua VM", callback_data: createExportCallback("all_vms") },
        { text: "🏢 VM di VC01", callback_data: createExportCallback("vms_vc01") },
        { text: "🏢 VM di VC02", callback_data: createExportCallback("vms_vc02") },
      ],
    ],
  };
  kirimPesanTelegram(message, config, "HTML", keyboard);
}
