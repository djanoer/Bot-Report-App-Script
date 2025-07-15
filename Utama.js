// ===== FILE: Utama.gs =====

/**
 * [REFACTORED v4.3.1] Handler untuk semua perintah bot.
 * Memperbaiki alur untuk /history, /cekhistory, dan /distribusi_vm.
 */
const commandHandlers = {
  [KONSTANTA.PERINTAH_BOT.LAPORAN]: (update, config) => {
    if (update.message.text.split(" ").length > 1) {
      kirimPesanTelegram(`❌ Perintah tidak valid.`, config, "HTML");
      return;
    }
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("⏳ Membuat laporan instan...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const pesanLaporan = buatLaporanHarianVM(config);
      kirimPesanTelegram(pesanLaporan, config, "HTML");
      if (statusMessageId) {
        editMessageText("✅ Laporan harian selesai dibuat.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    } catch (e) {
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
      const sentMessage = kirimPesanTelegram(
        "📊 Menganalisis laporan provisioning... Ini mungkin memakan waktu.",
        config,
        "HTML"
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const laporan = generateProvisioningReport(config);
      kirimPesanTelegram(laporan, config, "HTML");
      if (statusMessageId) {
        editMessageText("✅ Laporan provisioning selesai.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    } catch (e) {
      handleCentralizedError(e, "Perintah: /provisioning", config);
      if (statusMessageId) {
        editMessageText(
          "❌ Gagal membuat laporan provisioning.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.CEK_TIKET]: (update, config) => {
    if (update.message.text.split(" ").length > 1) {
      kirimPesanTelegram(
        `❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.CEK_TIKET}</code> tanpa argumen tambahan.`,
        config,
        "HTML"
      );
      return;
    }
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("⏳ Menyiapkan laporan tiket...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      handleTicketInteraction(update, config);
      if (statusMessageId) {
        editMessageText(
          "✅ Laporan tiket interaktif telah dikirim.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    } catch (e) {
      console.error(`Gagal memproses /cektiket (interaktif): ${e.message}\nStack: ${e.stack}`);
      const errorMessage = `❌ Gagal membuat laporan tiket interaktif.\n\n<b>Detail Error:</b>\n<code>${escapeHtml(
        e.message
      )}</code>`;
      kirimPesanTelegram(errorMessage, config, "HTML");
      if (statusMessageId) {
        editMessageText(
          "❌ Terjadi kesalahan saat menyiapkan laporan tiket.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK]: (update, config) => {
    let statusMessageId = null;
    const chatId = update.message.chat.id;

    try {
      // Kirim pesan "tunggu" awal dan simpan ID-nya
      const sentMessage = kirimPesanTelegram(
        "🔬 Menganalisis rekomendasi migrasi datastore... Ini mungkin memerlukan beberapa saat.",
        config,
        "HTML",
        null,
        chatId
      );

      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // Jalankan pekerjaan beratnya
      const laporanMigrasi = jalankanRekomendasiMigrasi();

      // Edit pesan "tunggu" dengan hasil akhir
      if (statusMessageId) {
        editMessageText(laporanMigrasi, null, chatId, statusMessageId, config);
      } else {
        // Fallback jika pengiriman pesan awal gagal
        kirimPesanTelegram(laporanMigrasi, config, "HTML", null, chatId);
      }
    } catch (e) {
      handleCentralizedError(e, "Perintah: /migrasicheck", config);
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
    handleVmSearchInteraction(update, config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.HISTORY]: (update, config, userData) => {
    const parts = update.message.text.split(" ");
    const pk = parts[1] ? parts[1].trim() : null;

    if (!pk) {
      kirimPesanTelegram(`Gunakan format: <code>${KONSTANTA.PERINTAH_BOT.HISTORY} [PK]</code>`, config, "HTML");
      return;
    }

    // Membuat 'update' tiruan untuk memulai alur riwayat
    const mockUpdate = {
      callback_query: {
        ...update.message,
        message: update.message,
        sessionData: { pk: pk, page: 1 },
      },
    };
    handleHistoryInteraction(mockUpdate, config, userData);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_HISTORY]: (update, config, userData) => {
    if (update.message.text.split(" ").length > 1) {
      kirimPesanTelegram(
        `❌ Perintah tidak valid. Gunakan <code>${KONSTANTA.PERINTAH_BOT.CEK_HISTORY}</code> tanpa argumen tambahan.`,
        config,
        "HTML"
      );
      return;
    }
    // Membuat 'update' tiruan untuk memulai alur riwayat hari ini
    const mockUpdate = {
      callback_query: {
        ...update.message,
        message: update.message,
        sessionData: { timeframe: "today", page: 1 },
      },
    };
    handleHistoryInteraction(mockUpdate, config, userData);
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
  [KONSTANTA.PERINTAH_BOT.DISTRIBUSI_VM]: (update, config) => {
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("📊 Menganalisis dan menyusun laporan distribusi aset...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const laporan = generateAssetDistributionReport(config);
      kirimPesanTelegram(laporan, config, "HTML");
      if (statusMessageId) {
        editMessageText(
          "✅ Laporan distribusi aset VM selesai dibuat.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah: ${KONSTANTA.PERINTAH_BOT.DISTRIBUSI_VM}`, config);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat laporan distribusi.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
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
  [KONSTANTA.PERINTAH_BOT.INFO]: (update, config, userDataAuth) => kirimPesanInfo(config, userDataAuth),
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
  [KONSTANTA.PERINTAH_BOT.GRAFIK]: (update, config) => {
    const args = update.message.text.split(" ");
    const tipeGrafik = (args[1] || "").toLowerCase();

    if (!tipeGrafik || (tipeGrafik !== "kritikalitas" && tipeGrafik !== "environment")) {
      kirimPesanTelegram(
        "Format perintah tidak valid. Gunakan:\n" +
          "<code>/grafik kritikalitas</code>\n" +
          "<code>/grafik environment</code>",
        config,
        "HTML"
      );
      return;
    }

    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("🎨 Membuat grafik, harap tunggu...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const chartBlob = buatGrafikDistribusi(tipeGrafik, config);

      if (chartBlob) {
        const caption = `Berikut adalah grafik distribusi VM berdasarkan <b>${tipeGrafik}</b>.`;
        kirimFotoTelegram(chartBlob, caption, config);
        // Hapus pesan "membuat grafik..." setelah berhasil
        if (statusMessageId) {
          callTelegramApi("deleteMessage", { chat_id: config.TELEGRAM_CHAT_ID, message_id: statusMessageId }, config);
        }
      } else {
        throw new Error("Gagal membuat objek gambar grafik.");
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah /grafik`, config);
      if (statusMessageId) {
        editMessageText("❌ Gagal membuat grafik.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
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
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("🧠 Menganalisis & menyimpan data, harap tunggu...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const result = processAndLogReport(textBlock, config);

      if (result.success) {
        const successMessage = `✅ Data untuk storage <b>${escapeHtml(result.storageName)}</b> telah berhasil dicatat.`;
        editMessageText(successMessage, null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah /log_report`, config);
      if (statusMessageId) {
        editMessageText(
          `⚠️ Gagal memproses laporan.\n\nPenyebab: <i>${e.message}</i>`,
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.REKOMENDASI_SETUP]: (update, config) => {
    // Kita sekarang meneruskan ID pengguna (from.id) ke fungsi yang memulai percakapan.
    mulaiPercakapanRekomendasi(update.message.chat.id, String(update.message.from.id), config);
  },
  [KONSTANTA.PERINTAH_BOT.CEK_STORAGE]: (update, config) => {
    let statusMessageId = null;
    try {
      const sentMessage = kirimPesanTelegram("📊 Menganalisis utilisasi storage...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const report = generateStorageUtilizationReport(config);

      if (statusMessageId) {
        editMessageText(report, null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      } else {
        kirimPesanTelegram(report, config, "HTML");
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah /cek_storage`, config);
      if (statusMessageId) {
        editMessageText(
          "❌ Gagal membuat laporan utilisasi storage.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.STATUS]: (update, config) => {
    // Tambahkan blok ini
    const pesanStatus = jalankanPemeriksaanKesehatan();
    kirimPesanTelegram(pesanStatus, config, "HTML");
  },
};

/**
 * [FINAL v3.1.3] Fungsi utama yang menangani semua permintaan dari Telegram.
 * Memperbaiki bug kritis dengan memastikan urutan argumen yang benar saat memanggil
 * fungsi percakapan (tampilkanPertanyaanIo, tampilkanPertanyaanSpek),
 * sehingga sesi pengguna selalu diperbarui dengan ID yang benar.
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
      contextForError = "Pemrosesan Callback Query";
      try {
        if (!update.callback_query.message) {
          console.warn("Diterima callback query tanpa objek 'message'. Mengabaikan.");
          answerCallbackQuery(update.callback_query.id, config);
          return HtmlService.createHtmlOutput("OK");
        }

        const callbackQueryId = update.callback_query.id;
        const callbackData = update.callback_query.data;
        const userEvent = update.callback_query;
        const chatId = userEvent.message.chat.id;
        const messageId = userEvent.message.message_id;
        const userId = String(userEvent.from.id);

        const userData = userAccessMap.get(userId);
        if (!userData || !userData.email) {
          const userMention = `<a href="tg://user?id=${userEvent.from.id}">${escapeHtml(
            userEvent.from.first_name || userEvent.from.id
          )}</a>`;
          kirimPesanTelegram(
            `❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`,
            config,
            "HTML"
          );
          answerCallbackQuery(callbackQueryId, config);
          return HtmlService.createHtmlOutput("Unauthorized");
        }
        userData.firstName = userEvent.from.first_name;
        userData.userId = userId;

        const K_CEKVM = KONSTANTA.CALLBACK_CEKVM;
        const K_NOTE = KONSTANTA.CALLBACK_CATATAN;
        const K_HISTORY = KONSTANTA.CALLBACK_HISTORY;
        const K_DAFTAR = KONSTANTA.CALLBACK_DAFTAR;
        const K_REKOMENDASI = KONSTANTA.CALLBACK_REKOMENDASI;

        const sessionCallbackRegex = /^([a-z_]+_)([a-zA-Z0-9]{8})$/;
        const match = callbackData.match(sessionCallbackRegex);

        // Prioritaskan callback yang lebih spesifik terlebih dahulu
        if (callbackData.startsWith(K_DAFTAR.PREFIX)) {
          const adminData = userAccessMap.get(String(userEvent.from.id));
          if (!adminData || (adminData.role || "User").toLowerCase() !== "admin") {
            answerCallbackQuery(callbackQueryId, config, "Hanya Admin yang dapat melakukan aksi ini.");
          } else {
            let action = "";
            let sessionId = "";
            if (callbackData.startsWith(K_DAFTAR.APPROVE_USER)) {
              action = "approve_user";
              sessionId = callbackData.replace(K_DAFTAR.APPROVE_USER, "");
            } else if (callbackData.startsWith(K_DAFTAR.APPROVE_ADMIN)) {
              action = "approve_admin";
              sessionId = callbackData.replace(K_DAFTAR.APPROVE_ADMIN, "");
            } else if (callbackData.startsWith(K_DAFTAR.REJECT)) {
              action = "reject";
              sessionId = callbackData.replace(K_DAFTAR.REJECT, "");
            }
            const sessionData = getCallbackSession(sessionId, config);
            if (sessionData) {
              const resultMessage = handleUserApproval(sessionData, action, adminData, config);
              editMessageText(
                userEvent.message.text + `\n\n------------------------------------\n${resultMessage}`,
                null,
                chatId,
                messageId,
                config
              );
            } else {
              editMessageText(
                userEvent.message.text + "\n\n⚠️ Sesi persetujuan ini telah kedaluwarsa atau tidak valid.",
                null,
                chatId,
                messageId,
                config
              );
            }
          }
        } else if (callbackData.startsWith(K_REKOMENDASI.PREFIX)) {
          const userState = getUserState(userId) || {};
          const requirements = userState.requirements || {};
          if (callbackData === K_REKOMENDASI.BATAL) {
            editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
            clearUserState(userId);
          } else if (callbackData.startsWith(K_REKOMENDASI.PILIH_KRITIKALITAS)) {
            requirements.kritikalitas = callbackData.replace(K_REKOMENDASI.PILIH_KRITIKALITAS, "");
            // === PERBAIKAN URUTAN ARGUMEN ===
            tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
          } else if (callbackData.startsWith(K_REKOMENDASI.PILIH_IO)) {
            requirements.io = callbackData.replace(K_REKOMENDASI.PILIH_IO, "");
            // === PERBAIKAN URUTAN ARGUMEN ===
            tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements);
          }
        } else if (callbackData.startsWith(KONSTANTA.CALLBACK_KONDISI.PREFIX)) {
          const sessionId = callbackData.replace(KONSTANTA.CALLBACK_KONDISI.EXPORT_VM, "");
          const sessionData = getCallbackSession(sessionId, config);

          if (sessionData && sessionData.exportType === "all_vm_alerts") {
            answerCallbackQuery(callbackQueryId, config, "Memproses ekspor... Ini mungkin perlu waktu.");

            // --- LOGIKA EKSPOR BARU ---
            // Jalankan ulang pemeriksaan untuk mendapatkan data VM yang segar
            const vmSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
            const uptimeAlerts = cekUptimeVmKritis(config, vmSheetData.headers, vmSheetData.dataRows);
            const vmMatiAlerts = cekVmKritisMati(config, vmSheetData.headers, vmSheetData.dataRows);
            const vmAlertsToExport = [...uptimeAlerts, ...vmMatiAlerts];

            if (vmAlertsToExport.length > 0) {
              const dataToExport = vmAlertsToExport.map((a) => [a.tipe, a.item, a.detailRaw, a.kritikalitas || "N/A"]);
              exportResultsToSheet(
                ["Tipe Peringatan", "Item", "Detail", "Kritikalitas"],
                dataToExport,
                "Laporan Detail Peringatan VM",
                config,
                userData, // Menggunakan data pengguna yang menekan tombol
                "Kritikalitas"
              );
            } else {
              kirimPesanTelegram(
                "ℹ️ Tidak ada data peringatan VM untuk diekspor saat ini.",
                config,
                "HTML",
                null,
                chatId
              );
            }
            // --- AKHIR LOGIKA EKSPOR BARU ---
          } else {
            answerCallbackQuery(callbackQueryId, config, "Sesi ekspor tidak valid atau telah kedaluwarsa.");
          }
        } else if (match) {
          const prefix = match[1];
          const sessionId = match[2];
          const sessionData = getCallbackSession(sessionId, config);
          if (!sessionData) {
            editMessageText(
              "Sesi telah kedaluwarsa atau tidak valid. Silakan mulai lagi perintah awal.",
              null,
              chatId,
              messageId,
              config
            );
          } else {
            userEvent.sessionData = sessionData;
            if (prefix.startsWith("cekvm_")) {
              handleVmSearchInteraction(update, config, userData);
            } else if (prefix.startsWith("history_")) {
              handleHistoryInteraction(update, config, userData);
            } else {
              console.warn(`Prefix callback sesi tidak dikenal: ${prefix}`);
            }
          }
        } else if (callbackData.startsWith(K_NOTE.PREFIX)) {
          if (callbackData.startsWith(K_NOTE.EDIT_ADD)) {
            const pk = callbackData.replace(K_NOTE.EDIT_ADD, "");
            setUserState(userId, { action: "AWAITING_NOTE_INPUT", pk: pk, messageId: messageId });
            const promptMessage = `✏️ Silakan kirimkan teks catatan yang baru untuk VM dengan PK: <code>${escapeHtml(
              pk
            )}</code>.\n\nKirim "batal" untuk membatalkan.`;
            editMessageText(promptMessage, null, chatId, messageId, config);
          } else if (callbackData.startsWith(K_NOTE.DELETE_CONFIRM)) {
            const pk = callbackData.replace(K_NOTE.DELETE_CONFIRM, "");
            if (deleteVmNote(pk)) {
              const { headers, results } = searchVmOnSheet(pk, config);
              if (results.length > 0) {
                const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
                editMessageText(pesan, keyboard, chatId, messageId, config);
              } else {
                editMessageText(
                  `✅ Catatan berhasil dihapus, namun VM dengan PK <code>${escapeHtml(
                    pk
                  )}</code> tidak lagi ditemukan.`,
                  null,
                  chatId,
                  messageId,
                  config
                );
              }
            } else {
              editMessageText(`❌ Gagal menghapus catatan.`, null, chatId, messageId, config);
            }
          } else if (callbackData.startsWith(K_NOTE.DELETE)) {
            const pk = callbackData.replace(K_NOTE.DELETE, "");
            const confirmationText = `❓Apakah Anda yakin ingin menghapus catatan untuk VM <code>${escapeHtml(
              pk
            )}</code>?`;
            const confirmationKeyboard = {
              inline_keyboard: [
                [
                  { text: "✅ Ya, Hapus", callback_data: `${K_NOTE.DELETE_CONFIRM}${pk}` },
                  { text: "❌ Batal", callback_data: `${K_CEKVM.BACK_TO_DETAIL_PREFIX}${pk}` },
                ],
              ],
            };
            editMessageText(confirmationText, confirmationKeyboard, chatId, messageId, config);
          }
        } else if (callbackData.startsWith(K_CEKVM.BACK_TO_DETAIL_PREFIX)) {
          const pk = callbackData.replace(K_CEKVM.BACK_TO_DETAIL_PREFIX, "");
          const { headers, results } = searchVmOnSheet(pk, config);
          if (results.length > 0) {
            const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
            editMessageText(pesan, keyboard, chatId, messageId, config);
          } else {
            editMessageText(
              `❌ VM dengan PK <code>${escapeHtml(pk)}</code> tidak lagi ditemukan.`,
              null,
              chatId,
              messageId,
              config
            );
          }
        } else if (callbackData.startsWith(KONSTANTA.CALLBACK_TIKET.PREFIX)) {
          handleTicketInteraction(update, config);
        } else if (callbackData.startsWith("run_export_") || callbackData.startsWith("export_")) {
          handleExportRequest(update, config, userData);
        }

        answerCallbackQuery(callbackQueryId, config);
      } catch (err) {
        throw new Error(`[${contextForError}] ${err.message}`);
      }
    } else if (update.message && update.message.text) {
      contextForError = "Pemrosesan Perintah Teks";
      try {
        const userEvent = update.message;
        const text = userEvent.text;
        const userId = String(userEvent.from.id);
        const userState = getUserState(userId);

        if (userState && userState.action) {
          if (userState.action.startsWith("AWAITING_REKOMENDASI_")) {
            const messageId = userState.messageId;
            const chatId = userState.chatId;
            const requirements = userState.requirements;
            if (text.toLowerCase() === "batal") {
              editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
              clearUserState(userId);
              return HtmlService.createHtmlOutput("OK");
            }
            if (userState.action === "AWAITING_REKOMENDASI_KRITIKALITAS") {
              requirements.kritikalitas = text;
              // === PERBAIKAN URUTAN ARGUMEN ===
              tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
            } else if (userState.action === "AWAITING_REKOMENDASI_SPEK") {
              const specs = text.split(/\s+/);
              if (
                specs.length !== 3 ||
                isNaN(parseInt(specs[0])) ||
                isNaN(parseInt(specs[1])) ||
                isNaN(parseInt(specs[2]))
              ) {
                kirimPesanTelegram(
                  "Format spesifikasi tidak valid. Harap masukkan 3 angka yang dipisahkan spasi (CPU RAM DISK). Contoh: <code>8 16 100</code>",
                  config,
                  "HTML",
                  null,
                  userEvent.chat.id
                );
              } else {
                requirements.cpu = parseInt(specs[0], 10);
                requirements.memory = parseInt(specs[1], 10);
                requirements.disk = parseInt(specs[2], 10);
                clearUserState(userId);
                const resultMessage = dapatkanRekomendasiPenempatan(requirements, config);
                editMessageText(resultMessage, null, chatId, messageId, config);
              }
            }
            return HtmlService.createHtmlOutput("OK");
          } else if (userState.action === "AWAITING_NOTE_INPUT") {
            const pk = userState.pk;
            const originalMessageId = userState.messageId;

            if (text.toLowerCase() === "batal") {
              const { headers, results } = searchVmOnSheet(pk, config);
              if (results.length > 0) {
                const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
                editMessageText(pesan, keyboard, userEvent.chat.id, originalMessageId, config);
              } else {
                editMessageText(
                  `✅ Aksi dibatalkan. VM dengan PK <code>${escapeHtml(pk)}</code> tidak lagi ditemukan.`,
                  null,
                  userEvent.chat.id,
                  originalMessageId,
                  config
                );
              }
              clearUserState(userId);
              return HtmlService.createHtmlOutput("OK");
            }

            const userData = userAccessMap.get(userId) || {};
            userData.firstName = userEvent.from.first_name;

            if (saveOrUpdateVmNote(pk, text, userData)) {
              const { headers, results } = searchVmOnSheet(pk, config);
              if (results.length > 0) {
                const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
                editMessageText(pesan, keyboard, userEvent.chat.id, originalMessageId, config);
              } else {
                editMessageText(
                  `✅ Catatan berhasil disimpan, namun VM dengan PK <code>${escapeHtml(pk)}</code> tidak ditemukan.`,
                  null,
                  userEvent.chat.id,
                  originalMessageId,
                  config
                );
              }
            } else {
              editMessageText(
                `❌ Gagal menyimpan catatan. Silakan coba lagi.`,
                null,
                userEvent.chat.id,
                originalMessageId,
                config
              );
            }
            clearUserState(userId);
            return HtmlService.createHtmlOutput("OK");
          }
        }

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
          const sessionId = createCallbackSession(sessionData, config);

          const K_DAFTAR = KONSTANTA.CALLBACK_DAFTAR;
          const keyboard = {
            inline_keyboard: [
              [
                { text: "✅ Setujui sebagai User", callback_data: `${K_DAFTAR.APPROVE_USER}${sessionId}` },
                { text: "👑 Jadikan Admin", callback_data: `${K_DAFTAR.APPROVE_ADMIN}${sessionId}` },
              ],
              [{ text: "❌ Tolak Pendaftaran", callback_data: `${K_DAFTAR.REJECT}${sessionId}` }],
            ],
          };

          let notifPesan = `<b>🔔 Permintaan Pendaftaran Baru</b>\n\n`;
          notifPesan += `<b>Nama:</b> ${escapeHtml(sessionData.firstName)}\n`;
          notifPesan += `<b>Username:</b> @${sessionData.username}\n`;
          notifPesan += `<b>User ID:</b> <code>${sessionData.userId}</code>\n`;
          notifPesan += `<b>Email:</b> <code>${escapeHtml(sessionData.email)}</code>`;
          kirimPesanTelegram(notifPesan, config, "HTML", keyboard);

          kirimPesanTelegram(
            `Terima kasih, ${escapeHtml(
              sessionData.firstName
            )}. Permintaan Anda telah diteruskan ke administrator untuk persetujuan.`,
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
          kirimPesanTelegram(
            `❌ Maaf ${userMention}, Anda tidak terdaftar.\n\nGunakan <code>/daftar [email_anda]</code> untuk meminta akses.`,
            config,
            "HTML"
          );
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
      } catch (err) {
        throw new Error(`[${contextForError}] ${err.message}`);
      }
    }
  } catch (err) {
    handleCentralizedError(err, `doPost (${contextForError})`, state ? state.config : null);
  } finally {
    return HtmlService.createHtmlOutput("OK");
  }
}

/**
 * [FINAL v3.3.0] Mengirim pesan bantuan (/info) yang dinamis dan sadar peran.
 * Versi ini menambahkan perintah /cek_storage.
 * @param {object} config - Objek konfigurasi bot.
 * @param {object} userData - Objek data pengguna yang menjalankan perintah, berisi info peran.
 */
function kirimPesanInfo(config, userData) {
  const K = KONSTANTA.PERINTAH_BOT;
  let infoPesan =
    "<b>Bot Laporan Infrastruktur</b>\n\n" +
    "Berikut adalah daftar perintah yang tersedia:\n\n" +
    "📊 <b>Laporan & Analisis</b>\n" +
    `<code>${K.LAPORAN}</code> - Laporan operasional harian instan.\n` +
    `<code>${K.CEK_KONDISI}</code> - Analisis kondisi & anomali sistem.\n` +
    `<code>${K.CEK_STORAGE}</code> - Ringkasan utilisasi storage (visual).\n` +
    `<code>${K.DISTRIBUSI_VM}</code> - Laporan distribusi aset VM.\n` +
    `<code>${K.PROVISIONING}</code> - Laporan detail alokasi sumber daya.\n` +
    `<code>${K.GRAFIK}</code> - Tampilkan grafik visual distribusi aset.\n\n` +
    "🔍 <b>Investigasi & Riwayat</b>\n" +
    `<code>${K.CEK_VM} [Nama/IP/PK]</code> - Cari detail VM.\n` +
    `<code>${K.CEK_HISTORY}</code> - Riwayat perubahan data hari ini.\n` +
    `<code>${K.HISTORY} [PK]</code> - Lacak riwayat lengkap sebuah VM.\n\n` +
    "🛠️ <b>Perencanaan & Operasional</b>\n" +
    `<code>${K.REKOMENDASI_SETUP}</code> - Rekomendasi penempatan VM baru (terpandu).\n` +
    `<code>${K.SIMULASI} [cleanup/migrasi]</code> - Jalankan skenario perencanaan.\n` +
    `<code>${K.CEK_TIKET}</code> - Buka menu monitoring tiket.\n` +
    `<code>${K.MIGRASI_CHECK}</code> - Analisis & rekomendasi migrasi.\n` +
    `<code>${K.LOG_REPORT}</code> - (Reply) Catat laporan storage manual.\n\n` +
    "⚙️ <b>Utilitas & Bantuan</b>\n" +
    `<code>${K.EXPORT}</code> - Buka menu ekspor data ke Google Sheet.\n` +
    `<code>${K.DAFTAR} [email]</code> - Minta hak akses untuk menggunakan bot.\n` +
    `<code>${K.STATUS}</code> - Pemeriksaan kesehatan sistem bot.\n` +
    `<code>${K.INFO}</code> - Tampilkan pesan bantuan ini.`;

  const userRole = userData && userData.role ? userData.role.toLowerCase() : "user";
  if (userRole === "admin") {
    infoPesan +=
      "\n\n" +
      "🛡️ <b>Perintah Administratif</b>\n" +
      `<code>${K.SYNC_LAPORAN}</code> - Sinkronisasi data & laporan lengkap.\n` +
      `<code>${K.ARSIPKAN_LOG}</code> - Jalankan pengarsipan semua log manual.\n` +
      `<code>${K.CLEAR_CACHE}</code> - Bersihkan cache hak akses & konfigurasi.`;
  }

  kirimPesanTelegram(infoPesan, config, "HTML");
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
 * [WRAPPER] Menjalankan runDailyJobs dan memberikan feedback ke UI Spreadsheet.
 */
function runDailyJobsWithUiFeedback() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Sinkronisasi penuh dan pembuatan laporan sedang berjalan di latar belakang. Proses ini mungkin memakan waktu beberapa menit.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    syncDanBuatLaporanHarian(false, "MANUAL_DARI_MENU");
    SpreadsheetApp.getUi().alert(
      "Sukses!",
      "Proses sinkronisasi dan laporan penuh telah berhasil dijalankan.",
      SpreadsheetApp.getUi().ButtonSet.OK
    );
  } catch (e) {
    SpreadsheetApp.getUi().alert("Gagal!", `Terjadi kesalahan: ${e.message}`, SpreadsheetApp.getUi().ButtonSet.OK);
  }
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
    kirimPesanTelegram(laporan, bacaKonfigurasi(), "HTML");
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
  const message =
    "<b>Pusat Laporan Ekspor</b>\n\nSilakan pilih data yang ingin Anda ekspor ke dalam file Google Sheet.";
  const keyboard = {
    inline_keyboard: [
      [{ text: "--- Laporan Log Perubahan ---", callback_data: "ignore" }],
      [
        { text: "📄 Log Hari Ini", callback_data: KONSTANTA.CALLBACK.EXPORT_LOG_TODAY },
        { text: "📅 Log 7 Hari", callback_data: KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS },
      ],
      [{ text: "🗓️ Log 30 Hari", callback_data: KONSTANTA.CALLBACK.EXPORT_LOG_30_DAYS }],
      [{ text: "--- Laporan VM berdasarkan Uptime ---", callback_data: "ignore" }],
      [
        { text: "⚙️ < 1 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_1 },
        { text: "⚙️ 1-2 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_2 },
        { text: "⚙️ 2-3 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_3 },
      ],
      [
        { text: "⚙️ > 3 Thn", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_4 },
        { text: "❓ Uptime Tdk Valid", callback_data: KONSTANTA.CALLBACK.EXPORT_UPTIME_INVALID },
      ],
      [{ text: "--- Laporan Data Master VM ---", callback_data: "ignore" }],
      [
        { text: "📄 Semua VM", callback_data: KONSTANTA.CALLBACK.EXPORT_ALL_VMS },
        { text: "🏢 VM di VC01", callback_data: KONSTANTA.CALLBACK.EXPORT_VC01_VMS },
        { text: "🏢 VM di VC02", callback_data: KONSTANTA.CALLBACK.EXPORT_VC02_VMS },
      ],
    ],
  };
  kirimPesanTelegram(message, config, "HTML", keyboard);
}

// =====================================================================
// [OPTIMALISASI] KUMPULAN FUNGSI UNTUK PEMICU (TRIGGER)
// =====================================================================

/**
 * [REFACTOR v1.1.0] Fungsi kini menjadi pusat untuk semua pekerjaan harian
 * dengan alur yang bersih dan efisien melalui Data Dependency Injection.
 */
function runDailyJobs() {
  console.log("Memulai pekerjaan harian via trigger...");

  // Membaca state sekali di awal menggunakan metode terpusat
  const { config } = getBotState();

  // Langkah 1: Jalankan sinkronisasi dan kirim laporan operasional.
  // Fungsi ini sudah menangani sinkronisasi data terbaru.
  syncDanBuatLaporanHarian(false, "TRIGGER HARIAN", config);

  console.log("Mengambil data terpusat untuk proses pemeriksaan...");
  // Ambil data VM dan Datastore HANYA SEKALI setelah sinkronisasi selesai.
  const dsSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
  const vmSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);

  // Langkah 2: Jalankan pemeriksaan kondisi dengan menyuntikkan data yang sudah diambil.
  // Parameter kedua (kirimNotifikasi) tetap true, dan kita tambahkan dua parameter data.
  jalankanPemeriksaanAmbangBatas(config, true, dsSheetData, vmSheetData);

  console.log("Pekerjaan harian via trigger selesai.");
}

function runWeeklyReport() {
  console.log("Memulai laporan mingguan via trigger...");
  buatLaporanPeriodik("mingguan");
  console.log("Laporan mingguan via trigger selesai.");
}

function runMonthlyReport() {
  console.log("Memulai laporan bulanan via trigger...");
  buatLaporanPeriodik("bulanan");
  console.log("Laporan bulanan via trigger selesai.");
}

/**
 * [FINAL v1.6.0] Menjalankan semua pekerjaan pembersihan dan pengarsipan.
 * Versi ini menambahkan panggilan untuk mengarsipkan "Log Storage Historis"
 * secara otomatis.
 */
function runCleanupAndArchivingJobs() {
  console.log("Memulai pekerjaan pembersihan dan arsip via trigger...");

  // Membaca state sekali di awal menggunakan metode terpusat
  const { config } = getBotState();

  // Tugas 1: Membersihkan file ekspor yang sudah tua
  bersihkanFileEksporTua(config);

  // Tugas 2: Memeriksa dan mengarsipkan Log Perubahan VM jika penuh
  cekDanArsipkanLogJikaPenuh(config);

  // Tugas 3: Memeriksa dan mengarsipkan Log Storage Historis jika penuh
  cekDanArsipkanLogStorageJikaPenuh(config);

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
