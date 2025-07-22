/**
 * @file StateMachine.js
 * @author Djanoer Team
 * @date 2023-09-05
 *
 * @description
 * Mengelola alur interaksi pengguna yang kompleks dan multi-langkah melalui
 * implementasi "Mesin Keadaan" (State Machines). File ini merutekan callback
 * dari tombol inline ke fungsi yang tepat berdasarkan konteks dan aksi.
 *
 * @section FUNGSI UTAMA
 * - searchMachine(...): Menangani semua interaksi terkait pencarian, detail, dan daftar VM.
 * - noteMachine(...): Mengelola alur untuk menambah, mengedit, dan menghapus catatan VM.
 * - rekomendasiMachine(...): Menavigasi alur percakapan terpandu untuk rekomendasi setup VM.
 * - ticketMachine(...): Mengendalikan interaksi untuk menu monitoring tiket utilisasi.
 */

/**
 * [FINAL] Mesin Keadaan untuk semua interaksi yang berhubungan dengan pencarian,
 * detail, dan daftar VM (baik dari hasil pencarian maupun dari cluster/datastore).
 * Versi ini telah disederhanakan dan tidak lagi menggunakan PAGINATION_ACTIONS.
 */
function searchMachine(update, action, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;

  // Logika Router yang sudah disederhanakan
  if (action === "show_list" || action === "navigate_list" || action === "export_list") {
    const explicitAction = action === "export_list" ? "export" : "navigate";
    handlePaginatedVmList(update, explicitAction, config, userData);
  } else if (action === "navigate_search_results" || action === "export_search_results") {
    const explicitAction = action === "export_search_results" ? "export" : "navigate";
    handleVmSearchResults(update, explicitAction, config, userData);
  } else if (action === "back_to_detail") {
    const pk = sessionData.pk;
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
  } else {
    console.warn("Aksi tidak dikenal di searchMachine:", action);
  }
}

/**
 * [BARU] Mesin Keadaan untuk semua interaksi yang berhubungan dengan catatan VM.
 */
function noteMachine(update, action, config) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;
  const userId = String(userEvent.from.id);
  const pk = sessionData.pk;

  if (action === "prompt_add") {
    // Simpan state pengguna, menandakan bot sedang menunggu input teks untuk catatan
    setUserState(userId, { action: "AWAITING_NOTE_INPUT", pk: pk, messageId: messageId });

    const promptMessage = `✏️ Silakan kirimkan teks catatan untuk VM dengan PK: <code>${escapeHtml(
      pk
    )}</code>.\n\nKirim "batal" untuk membatalkan.`;
    editMessageText(promptMessage, null, chatId, messageId, config);
  } else if (action === "prompt_delete") {
    const confirmationText = `❓ Yakin ingin menghapus catatan untuk VM <code>${escapeHtml(pk)}</code>?`;
    const confirmationSessionId = createCallbackSession({ pk: pk }, config);
    const confirmationKeyboard = {
      inline_keyboard: [
        [
          { text: "✅ Ya, Hapus", callback_data: `note_machine:confirm_delete:${confirmationSessionId}` },
          { text: "❌ Batal", callback_data: `search_machine:back_to_detail:${confirmationSessionId}` },
        ],
      ],
    };
    editMessageText(confirmationText, confirmationKeyboard, chatId, messageId, config);
  } else if (action === "confirm_delete") {
    if (deleteVmNote(pk)) {
      // Refresh tampilan detail VM setelah berhasil hapus
      const { headers, results } = searchVmOnSheet(pk, config);
      if (results.length > 0) {
        const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
        editMessageText("✅ Catatan berhasil dihapus.\n\n" + pesan, keyboard, chatId, messageId, config);
      } else {
        editMessageText(`✅ Catatan berhasil dihapus.`, null, chatId, messageId, config);
      }
    } else {
      editMessageText(`❌ Gagal menghapus catatan.`, null, chatId, messageId, config);
    }
  } else {
    console.warn("Aksi tidak dikenal di noteMachine:", action);
  }
}

function mulaiPercakapanRekomendasi(chatId, userId, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const kritikalitasOptions = (config[K.KATEGORI_KRITIKALITAS] || "Critical,High,Medium,Low")
    .split(",")
    .map((item) => item.trim());

  const keyboardRows = kritikalitasOptions.map((opt) => {
    const sessionData = { step: "io", requirements: { kritikalitas: opt } };
    return [
      {
        text: opt,
        callback_data: CallbackHelper.build("rekomendasi_machine", "handle_step", sessionData, config),
      },
    ];
  });

  keyboardRows.push([
    {
      text: "❌ Batal",
      callback_data: CallbackHelper.cancel("rekomendasi_machine", config),
    },
  ]);

  const pesan = "<b>Langkah 1 dari 3:</b> Silakan pilih tingkat kritikalitas VM:";
  const sentMessage = kirimPesanTelegram(pesan, config, "HTML", { inline_keyboard: keyboardRows }, chatId);

  if (sentMessage && sentMessage.ok) {
    setUserState(userId, {
      action: "AWAITING_REKOMENDASI_KRITIKALITAS",
      messageId: sentMessage.result.message_id,
      chatId: chatId,
      requirements: {},
    });
  }
}

function tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements) {
  const ioOptions = ["High", "Normal"];

  const keyboardRows = ioOptions.map((opt) => {
    const sessionData = { step: "spek", requirements: { ...requirements, io: opt.toLowerCase() } };
    return [
      {
        text: opt,
        callback_data: CallbackHelper.build("rekomendasi_machine", "handle_step", sessionData, config),
      },
    ];
  });

  keyboardRows.push([
    {
      text: "❌ Batal",
      callback_data: CallbackHelper.cancel("rekomendasi_machine", config),
    },
  ]);

  const pesan = `✅ Kritikalitas: <b>${escapeHtml(
    requirements.kritikalitas
  )}</b>\n\n<b>Langkah 2 dari 3:</b> Sekarang, pilih profil I/O:`;
  editMessageText(pesan, { inline_keyboard: keyboardRows }, chatId, messageId, config);

  setUserState(userId, {
    action: "AWAITING_REKOMENDASI_IO",
    messageId: messageId,
    chatId: chatId,
    requirements: requirements,
  });
}

function tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements) {
  const keyboard = {
    inline_keyboard: [
      [
        {
          text: "❌ Batal",
          callback_data: CallbackHelper.cancel("rekomendasi_machine", config),
        },
      ],
    ],
  };

  const pesan =
    `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n` +
    `✅ Profil I/O: <b>${escapeHtml(requirements.io)}</b>\n\n` +
    `<b>Langkah 3 dari 3:</b> Terakhir, silakan masukkan kebutuhan CPU, RAM (GB), dan Disk (GB) dalam format:\n\n` +
    `<code>CPU RAM DISK</code>\n\n` +
    `Contoh: <code>8 16 100</code>`;
  editMessageText(pesan, keyboard, chatId, messageId, config);

  setUserState(userId, {
    action: "AWAITING_REKOMENDASI_SPEK",
    messageId: messageId,
    chatId: chatId,
    requirements: requirements,
  });
}

/**
 * [BARU] Mesin Keadaan untuk semua interaksi yang berhubungan dengan tiket.
 */
function ticketMachine(update, action, config) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;

  if (action === "show_summary") {
    const { text, keyboard } = generateSummaryView(config);
    editMessageText(text, keyboard, chatId, messageId, config);
  } else if (action === "show_list") {
    const { category } = sessionData;
    const { text, keyboard } = generateTicketListView(category, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  } else if (action === "show_detail") {
    const { ticketId, fromCategory } = sessionData;
    const { text, keyboard } = generateDetailView(ticketId, fromCategory, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }
}

/**
 * [BARU] Mesin Keadaan untuk alur percakapan rekomendasi setup VM.
 */
function rekomendasiMachine(update, action, config) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;
  const userId = String(userEvent.from.id);

  if (action === "cancel") {
    editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
    clearUserState(userId); // Hapus state jika ada
    return;
  }

  if (action === "handle_step") {
    const { step, requirements } = sessionData;
    if (step === "io") {
      // Pastikan 'config' diteruskan ke fungsi berikutnya
      tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
    } else if (step === "spek") {
      // Pastikan 'config' diteruskan ke fungsi berikutnya
      tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements);
    }
    return;
  }
}

/**
 * [BARU] Router utama untuk pesan teks yang merupakan bagian dari percakapan.
 * Menerima update dan state, lalu mendelegasikannya ke handler yang tepat.
 */
function routeToStateMachineByState(update, userState, config, userAccessMap) {
  const action = userState.action;

  if (action.startsWith("AWAITING_REKOMENDASI_")) {
    handleRekomendasiTextInput(update, userState, config);
  } else if (action === "AWAITING_NOTE_INPUT") {
    handleNoteTextInput(update, userState, config, userAccessMap);
  } else if (action === "AWAITING_CONFIG_INPUT") {
    // <-- TAMBAHKAN INI
    handleConfigTextInput(update, userState, config, userAccessMap);
  }
  // Tambahkan 'else if' lain di sini jika ada alur percakapan baru di masa depan
}

/**
 * [PINDAHAN DARI doPost] Menangani semua input teks untuk alur rekomendasi setup.
 * Logika untuk semua langkah, termasuk KRITIKALITAS, telah dipulihkan sepenuhnya.
 */
function handleRekomendasiTextInput(update, userState, config) {
  const userEvent = update.message;
  const text = userEvent.text;
  const userId = String(userEvent.from.id);
  const { messageId, chatId, requirements } = userState;

  if (text.toLowerCase() === "batal") {
    editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
    clearUserState(userId);
    return;
  }

  // --- LOGIKA YANG DIPULIHKAN ---
  if (userState.action === "AWAITING_REKOMENDASI_KRITIKALITAS") {
    requirements.kritikalitas = text;
    tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
    return; // Selesai untuk langkah ini
  }
  // --- AKHIR LOGIKA YANG DIPULIHKAN ---

  if (userState.action === "AWAITING_REKOMENDASI_SPEK") {
    const specs = text.split(/\s+/);
    if (specs.length !== 3 || isNaN(parseInt(specs[0])) || isNaN(parseInt(specs[1])) || isNaN(parseInt(specs[2]))) {
      const errorMessage =
        'Format spesifikasi tidak valid. Harap masukkan lagi dalam format: `CPU RAM DISK` (contoh: `8 16 100`).\n\nKirim "batal" untuk membatalkan.';
      kirimPesanTelegram(errorMessage, config, "HTML", null, chatId);
      setUserState(userId, userState);
    } else {
      requirements.cpu = parseInt(specs[0], 10);
      requirements.memory = parseInt(specs[1], 10);
      requirements.disk = parseInt(specs[2], 10);
      clearUserState(userId);
      const resultMessage = dapatkanRekomendasiPenempatan(requirements, config);
      editMessageText(resultMessage, null, chatId, messageId, config);
    }
  }
}

/**
 * [PINDAHAN DARI doPost] Menangani semua input teks untuk alur penambahan catatan.
 */
function handleNoteTextInput(update, userState, config, userAccessMap) {
  const userEvent = update.message;
  const text = userEvent.text;
  const userId = String(userEvent.from.id);
  const { pk, messageId: originalMessageId } = userState;

  if (text.toLowerCase() === "batal") {
    const { headers, results } = searchVmOnSheet(pk, config);
    if (results.length > 0) {
      const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
      editMessageText(pesan, keyboard, userEvent.chat.id, originalMessageId, config);
    } else {
      editMessageText(`✅ Aksi dibatalkan.`, null, userEvent.chat.id, originalMessageId, config);
    }
    clearUserState(userId);
    return;
  }

  if (!text || text.trim().length === 0 || text.length > 100) {
    const reason = !text || text.trim().length === 0 ? "tidak boleh kosong" : "terlalu panjang (maks 100 karakter)";
    const errorMessage = `❌ Catatan ${reason}. Silakan coba lagi.\n\nKirim "batal" untuk membatalkan.`;
    kirimPesanTelegram(errorMessage, config, "HTML", null, userEvent.chat.id);
    setUserState(userId, userState);
    return;
  }

  const userData = userAccessMap.get(userId) || {};
  userData.firstName = userEvent.from.first_name;

  if (saveOrUpdateVmNote(pk, text, userData)) {
    const { headers, results } = searchVmOnSheet(pk, config);
    if (results.length > 0) {
      const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
      const successMessage = "✅ Catatan berhasil disimpan.\n\n" + pesan;
      editMessageText(successMessage, keyboard, userEvent.chat.id, originalMessageId, config);
    } else {
      editMessageText(`✅ Catatan berhasil disimpan.`, null, userEvent.chat.id, originalMessageId, config);
    }
  } else {
    editMessageText(
      `❌ Gagal menyimpan catatan karena terjadi kesalahan internal.`,
      null,
      userEvent.chat.id,
      originalMessageId,
      config
    );
  }

  clearUserState(userId);
}

/**
 * [BARU - FASE 4] Menangani input teks untuk alur manajemen konfigurasi.
 */
function handleConfigTextInput(update, userState, config, userAccessMap) {
  const userEvent = update.message;
  const text = userEvent.text;
  const userId = String(userEvent.from.id);
  const { key, category, originalMessageId } = userState;

  // Bersihkan state pengguna terlebih dahulu agar tidak terjebak dalam loop
  clearUserState(userId);

  if (text.toLowerCase() === "batal") {
    // Kembalikan pengguna ke sub-menu sebelumnya
    const mockUpdate = {
      callback_query: {
        ...userEvent,
        message: { ...userEvent, message_id: originalMessageId },
        sessionData: { category: category },
      },
    };
    handleConfigManager(mockUpdate, "show_category", config, userAccessMap.get(userId));
    return;
  }

  const adminUserData = userAccessMap.get(userId);
  const result = updateConfiguration(key, text, adminUserData);

  if (result.success) {
    kirimPesanTelegram(
      `✅ Konfigurasi <code>${key}</code> berhasil diperbarui.`,
      config,
      "HTML",
      null,
      userEvent.chat.id
    );

    // Muat ulang (refresh) tampilan sub-menu untuk menunjukkan nilai yang baru
    const refreshedConfig = getBotState(true).config; // Paksa baca ulang dari sheet
    const mockUpdate = {
      callback_query: {
        ...userEvent,
        message: { ...userEvent, message_id: originalMessageId },
        sessionData: { category: category },
      },
    };
    handleConfigManager(mockUpdate, "show_category", refreshedConfig, adminUserData);
  } else {
    kirimPesanTelegram(
      `❌ Gagal memperbarui konfigurasi. Silakan periksa log untuk detail.`,
      config,
      "HTML",
      null,
      userEvent.chat.id
    );
  }
}
