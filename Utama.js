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
    try {
      const sentMessage = kirimPesanTelegram(
        "🔬 Menganalisis rekomendasi migrasi datastore... Ini mungkin memerlukan beberapa saat.",
        config,
        "HTML"
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      // Menangkap hasil laporan yang dikembalikan oleh fungsi
      const laporanMigrasi = jalankanRekomendasiMigrasi();

      // Mengirim laporan yang sebenarnya
      kirimPesanTelegram(laporanMigrasi, config, "HTML");

      if (statusMessageId) {
        // Hapus pesan "Menganalisis..." karena laporan sudah dikirim
        // Note: hapusPesanTelegram perlu dibuat jika belum ada, atau gunakan editMessageText
        editMessageText(
          "✅ Laporan analisis migrasi telah dikirimkan.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    } catch (e) {
      handleCentralizedError(e, "Perintah: /migrasicheck", config);
      if (statusMessageId) {
        editMessageText(
          "❌ Gagal menjalankan analisis migrasi.",
          null,
          config.TELEGRAM_CHAT_ID,
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
    try {
      const sentMessage = kirimPesanTelegram("⏳ Memeriksa kondisi log untuk pengarsipan...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const resultMessage = cekDanArsipkanLogJikaPenuh(config);

      if (statusMessageId) {
        editMessageText(resultMessage, null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      } else {
        kirimPesanTelegram(resultMessage, config, "HTML");
      }
    } catch (e) {
      const errorMessage = `🔴 Terjadi kesalahan kritis saat menjalankan pengarsipan: ${e.message}`;
      if (statusMessageId) {
        editMessageText(errorMessage, null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      } else {
        kirimPesanTelegram(errorMessage, config, "HTML");
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
    try {
      const sentMessage = kirimPesanTelegram("🔬 Memulai pemeriksaan kondisi sistem...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      jalankanPemeriksaanAmbangBatas(config);

      if (statusMessageId) {
        editMessageText(
          "✅ Pemeriksaan kondisi sistem selesai.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah: ${KONSTANTA.PERINTAH_BOT.CEK_KONDISI}`, config);
      if (statusMessageId) {
        editMessageText(
          "❌ Gagal menjalankan pemeriksaan kondisi.",
          null,
          config.TELEGRAM_CHAT_ID,
          statusMessageId,
          config
        );
      }
    }
  },
  [KONSTANTA.PERINTAH_BOT.INFO]: (update, config) => kirimPesanInfo(config),
  [KONSTANTA.PERINTAH_BOT.SIMULASI]: (update, config) => {
    // Asumsikan kita akan menambahkannya di Konstanta.js
    const args = update.message.text.split(" ");
    const subCommand = (args[1] || "").toLowerCase();
    const parameter = args.slice(2).join(" ");

    if (!subCommand || !parameter) {
      kirimPesanTelegram(
        "Format perintah tidak valid. Gunakan:\n" +
          "<code>/simulasi cleanup [nama_cluster]</code>\n" +
          "<code>/simulasi migrasi [nama_host_sumber]</code>",
        config,
        "HTML"
      );
      return;
    }

    let statusMessageId = null;
    let resultMessage = "";
    try {
      const sentMessage = kirimPesanTelegram("⏳ Menjalankan simulasi, harap tunggu...", config, "HTML");
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      if (subCommand === "cleanup") {
        resultMessage = jalankanSimulasiCleanup(parameter, config);
      } else if (subCommand === "migrasi") {
        resultMessage = jalankanSimulasiMigrasi(parameter, config);
      } else {
        resultMessage = "Sub-perintah tidak dikenal. Gunakan `cleanup` atau `migrasi`.";
      }

      if (statusMessageId) {
        editMessageText(resultMessage, null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      } else {
        kirimPesanTelegram(resultMessage, config, "HTML");
      }
    } catch (e) {
      handleCentralizedError(e, `Perintah /simulasi`, config);
      if (statusMessageId) {
        editMessageText("❌ Gagal menjalankan simulasi.", null, config.TELEGRAM_CHAT_ID, statusMessageId, config);
      }
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
};

/**
 * [REFACTORED v4.3.3 - DEFINITIVE HISTORY ROUTER] Fungsi utama yang menangani semua permintaan dari Telegram.
 * Memperbaiki bug paginasi pada halaman riwayat dengan menerapkan metode pengecekan
 * prefix 'startsWith' yang lebih kuat dan tidak rapuh.
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

        const userData = userAccessMap.get(String(userEvent.from.id));
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
        userData.userId = userEvent.from.id;

        const K_CEKVM = KONSTANTA.CALLBACK_CEKVM;
        const K_NOTE = KONSTANTA.CALLBACK_CATATAN;
        const K_HISTORY = KONSTANTA.CALLBACK_HISTORY;
        const K_PAGINATE = KONSTANTA.PAGINATION_ACTIONS;

        const sessionCallbackRegex = /^([a-z_]+_)([a-zA-Z0-9]{8})$/;
        const match = callbackData.match(sessionCallbackRegex);

        if (match) {
          const prefix = match[1];
          const sessionId = match[2];
          const sessionData = getCallbackSession(sessionId);

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

            if (prefix === `cekvm_${K_PAGINATE.NAVIGATE}_` || prefix === `cekvm_${K_PAGINATE.EXPORT}_`) {
              userEvent.action = prefix.includes(K_PAGINATE.EXPORT) ? K_PAGINATE.EXPORT : K_PAGINATE.NAVIGATE;
              handleVmSearchInteraction(update, config, userData);
            } else if (
              prefix === K_CEKVM.CLUSTER_PREFIX ||
              prefix === K_CEKVM.CLUSTER_NAV_PREFIX ||
              prefix === K_CEKVM.CLUSTER_EXPORT_PREFIX
            ) {
              userEvent.action = prefix.includes(K_PAGINATE.EXPORT) ? K_PAGINATE.EXPORT : K_PAGINATE.NAVIGATE;
              userEvent.sessionData.listType = "cluster";
              handlePaginatedVmList(update, config, userData);
            } else if (
              prefix === K_CEKVM.DATASTORE_PREFIX ||
              prefix === K_CEKVM.DATASTORE_NAV_PREFIX ||
              prefix === K_CEKVM.DATASTORE_EXPORT_PREFIX
            ) {
              userEvent.action = prefix.includes(K_PAGINATE.EXPORT) ? K_PAGINATE.EXPORT : K_PAGINATE.NAVIGATE;
              userEvent.sessionData.listType = "datastore";
              handlePaginatedVmList(update, config, userData);
            } else if (
              prefix === K_HISTORY.PREFIX ||
              prefix === K_HISTORY.NAVIGATE_PREFIX ||
              prefix === K_HISTORY.EXPORT_PREFIX
            ) {
              userEvent.action = prefix.includes(K_PAGINATE.EXPORT) ? K_PAGINATE.EXPORT : K_PAGINATE.NAVIGATE;
              handleHistoryInteraction(update, config, userData);
            } else {
              console.warn(`Prefix callback sesi tidak dikenal: ${prefix}`);
            }
          }
        } else if (callbackData.startsWith(K_NOTE.PREFIX)) {
          if (callbackData.startsWith(K_NOTE.EDIT_ADD)) {
            const pk = callbackData.replace(K_NOTE.EDIT_ADD, "");
            setUserState(userEvent.from.id, { action: "AWAITING_NOTE_INPUT", pk: pk, messageId: messageId });
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
        if (userState && userState.action === "AWAITING_NOTE_INPUT") {
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
          return HtmlService.createHtmlOutput("OK");
        }

        if (!text.startsWith("/")) {
          return HtmlService.createHtmlOutput("OK");
        }
        const commandParts = text.split(" ");
        const command = commandParts[0].toLowerCase().split("@")[0];

        if (command === KONSTANTA.PERINTAH_BOT.DAFTAR) {
          const existingUserData = userAccessMap.get(String(userEvent.from.id));
          if (existingUserData && existingUserData.email) {
            kirimPesanTelegram(`Halo ${escapeHtml(userEvent.from.first_name)}, Anda sudah terdaftar.`, config, "HTML");
          } else {
            const email = commandParts[1];
            if (!email || !email.includes("@") || !email.includes(".")) {
              kirimPesanTelegram(`Format salah. Gunakan:\n<code>/daftar email.anda@domain.com</code>`, config, "HTML");
            } else {
              let notifPesan = `<b>🔔 Permintaan Pendaftaran Baru</b>\n\n<b>Nama:</b> ${escapeHtml(
                userEvent.from.first_name
              )}\n<b>Username:</b> ${
                userEvent.from.username ? "@" + userEvent.from.username : "N/A"
              }\n<b>User ID:</b> <code>${userEvent.from.id}</code>\n<b>Email:</b> <code>${escapeHtml(email)}</code>`;
              kirimPesanTelegram(notifPesan, config, "HTML");
              kirimPesanTelegram(
                `Terima kasih, ${escapeHtml(userEvent.from.first_name)}. Permintaan Anda telah diteruskan.`,
                config,
                "HTML",
                null,
                userEvent.chat.id
              );
            }
          }
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
          commandFunction(update, config, userDataAuth);
        } else {
          // === AWAL BLOK PERBAIKAN PENGALAMAN PENGGUNA ===
          const closestCommand = findClosestCommand(command);
          let errorMessage = `❓ Perintah <code>${escapeHtml(command)}</code> tidak ditemukan.`;

          if (closestCommand) {
            errorMessage += `\n\nMungkin maksud Anda: <b>${closestCommand}</b>`;
          } else {
            errorMessage += `\n\nGunakan ${KONSTANTA.PERINTAH_BOT.INFO} untuk melihat daftar perintah yang valid.`;
          }
          kirimPesanTelegram(errorMessage, config, "HTML");
          // === AKHIR BLOK PERBAIKAN PENGALAMAN PENGGUNA ===
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
 * [FINAL v1.3.1] Mengirim pesan bantuan (/info) yang dinamis dan lengkap.
 * Versi ini mencakup semua perintah baru yang telah diimplementasikan.
 */
function kirimPesanInfo(config) {
  const K = KONSTANTA.PERINTAH_BOT;
  const infoPesan =
    "<b>Bot Laporan Infrastruktur</b>\n\n" +
    "Berikut adalah daftar perintah yang tersedia:\n\n" +
    "📊 <b>Laporan & Analisis</b>\n" +
    `<code>${K.LAPORAN}</code> - Laporan operasional harian instan.\n` +
    `<code>${K.CEK_KONDISI}</code> - Analisis kondisi & anomali sistem.\n` +
    `<code>${K.DISTRIBUSI_VM}</code> - Laporan distribusi aset VM.\n` +
    `<code>${K.PROVISIONING}</code> - Laporan detail alokasi sumber daya.\n` +
    `<code>${K.GRAFIK} [environment/kritikalitas]</code> - Tampilkan grafik visual distribusi aset.\n\n` +
    "🔍 <b>Investigasi & Riwayat</b>\n" +
    `<code>${K.CEK_VM} [Nama/IP/PK]</code> - Cari detail VM.\n` +
    `<code>${K.CEK_HISTORY}</code> - Riwayat perubahan data hari ini.\n` +
    `<code>${K.HISTORY} [PK]</code> - Lacak riwayat lengkap sebuah VM.\n\n` +
    "🛠️ <b>Perencanaan & Operasional</b>\n" +
    `<code>${K.SIMULASI} [cleanup/migrasi]</code> - Jalankan skenario perencanaan.\n` +
    `<code>${K.CEK_TIKET}</code> - Buka menu monitoring tiket.\n` +
    `<code>${K.MIGRASI_CHECK}</code> - Analisis & rekomendasi migrasi.\n\n` +
    "⚙️ <b>Utilitas & Bantuan</b>\n" +
    `<code>${K.EXPORT}</code> - Buka menu ekspor data ke Google Sheet.\n` +
    `<code>${K.DAFTAR} [email]</code> - Minta hak akses untuk menggunakan bot.\n` +
    `<code>${K.INFO}</code> - Tampilkan pesan bantuan ini.`;

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
        .addItem("Jalankan Sinkronisasi & Laporan Penuh", "runDailyJobsWithUiFeedback") // Menggunakan fungsi wrapper
        .addItem("Jalankan Pengarsipan Log Manual", "runArchivingWithUiFeedback") // Menggunakan fungsi wrapper
        .addItem("Bersihkan Cache Bot (State & Akses)", "clearBotStateCacheWithUiFeedback")
    ) // Menggunakan fungsi wrapper
    .addSeparator()

    // Sub-menu untuk setup dan diagnostik
    .addSubMenu(
      SpreadsheetApp.getUi()
        .createMenu("🛠️ Setup & Diagnostik")
        .addItem("Tes Koneksi ke Telegram", "tesKoneksiTelegram")
        .addItem("SETUP: Set Token (Interaktif)", "setupSimpanTokenInteraktif")
        .addItem("SETUP: Set Webhook", "setWebhook")
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
 * [WRAPPER] Menjalankan cekDanArsipkanLogJikaPenuh dan memberikan feedback ke UI.
 */
function runArchivingWithUiFeedback() {
  SpreadsheetApp.getUi().alert(
    "Memulai Proses...",
    "Pengecekan dan pengarsipan log sedang berjalan...",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  try {
    const resultMessage = cekDanArsipkanLogJikaPenuh();
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

function runCleanupAndArchivingJobs() {
  console.log("Memulai pekerjaan pembersihan dan arsip via trigger...");

  // Membaca state sekali di awal menggunakan metode terpusat
  const { config } = getBotState();

  bersihkanFileEksporTua(config);
  cekDanArsipkanLogJikaPenuh(config);

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
