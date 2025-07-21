// ===== FILE: StateMachine.gs =====

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
    if (action === 'show_list' || action === 'navigate_list' || action === 'export_list') {
        const explicitAction = action === 'export_list' ? 'export' : 'navigate';
        handlePaginatedVmList(update, explicitAction, config, userData);

    } else if (action === 'navigate_search_results' || action === 'export_search_results') {
        const explicitAction = action === 'export_search_results' ? 'export' : 'navigate';
        handleVmSearchResults(update, explicitAction, config, userData);

    } else if (action === 'back_to_detail') {
        const pk = sessionData.pk;
        const { headers, results } = searchVmOnSheet(pk, config);
        if (results.length > 0) {
            const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
            editMessageText(pesan, keyboard, chatId, messageId, config);
        } else {
            editMessageText(`❌ VM dengan PK <code>${escapeHtml(pk)}</code> tidak lagi ditemukan.`, null, chatId, messageId, config);
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
  
  if (action === 'prompt_add') {
    // Simpan state pengguna, menandakan bot sedang menunggu input teks untuk catatan
    setUserState(userId, { action: "AWAITING_NOTE_INPUT", pk: pk, messageId: messageId });
    
    const promptMessage = `✏️ Silakan kirimkan teks catatan untuk VM dengan PK: <code>${escapeHtml(pk)}</code>.\n\nKirim "batal" untuk membatalkan.`;
    editMessageText(promptMessage, null, chatId, messageId, config);

  } else if (action === 'prompt_delete') {
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

  } else if (action === 'confirm_delete') {
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
  const kritikalitasOptions = (config[K.KATEGORI_KRITIKALITAS] || "Critical,High,Medium,Low").split(",").map(item => item.trim());

  const keyboardRows = kritikalitasOptions.map(opt => {
    const sessionData = { step: 'io', requirements: { kritikalitas: opt } };
    return [{ 
      text: opt, 
      callback_data: CallbackHelper.build('rekomendasi_machine', 'handle_step', sessionData, config) 
    }];
  });

  keyboardRows.push([{ 
    text: "❌ Batal", 
    callback_data: CallbackHelper.cancel('rekomendasi_machine', config) 
  }]);

  const pesan = "<b>Langkah 1 dari 3:</b> Silakan pilih tingkat kritikalitas VM:";
  const sentMessage = kirimPesanTelegram(pesan, config, "HTML", { inline_keyboard: keyboardRows }, chatId);

  if (sentMessage && sentMessage.ok) {
    setUserState(userId, { 
        action: "AWAITING_REKOMENDASI_KRITIKALITAS", 
        messageId: sentMessage.result.message_id, 
        chatId: chatId, 
        requirements: {} 
    });
  }
}

function tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements) {
  const ioOptions = ["High", "Normal"];

  const keyboardRows = ioOptions.map(opt => {
      const sessionData = { step: 'spek', requirements: { ...requirements, io: opt.toLowerCase() } };
      return [{ 
        text: opt, 
        callback_data: CallbackHelper.build('rekomendasi_machine', 'handle_step', sessionData, config) 
      }];
  });

  keyboardRows.push([{ 
    text: "❌ Batal", 
    callback_data: CallbackHelper.cancel('rekomendasi_machine', config) 
  }]);

  const pesan = `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n\n<b>Langkah 2 dari 3:</b> Sekarang, pilih profil I/O:`;
  editMessageText(pesan, { inline_keyboard: keyboardRows }, chatId, messageId, config);

  setUserState(userId, { 
      action: "AWAITING_REKOMENDASI_IO", 
      messageId: messageId, 
      chatId: chatId, 
      requirements: requirements 
  });
}

function tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements) {
  const keyboard = { 
    inline_keyboard: [[{ 
      text: "❌ Batal", 
      callback_data: CallbackHelper.cancel('rekomendasi_machine', config) 
    }]] 
  };

  const pesan = `✅ Kritikalitas: <b>${escapeHtml(requirements.kritikalitas)}</b>\n` +
                `✅ Profil I/O: <b>${escapeHtml(requirements.io)}</b>\n\n` +
                "<b>Langkah 3 dari 3:</b> Terakhir, silakan masukkan kebutuhan CPU, RAM (GB), dan Disk (GB) dalam format:\n\n" +
                "<code>CPU RAM DISK</code>\n\n" +
                "Contoh: <code>8 16 100</code>";
  editMessageText(pesan, keyboard, chatId, messageId, config);

  setUserState(userId, { 
      action: "AWAITING_REKOMENDASI_SPEK", 
      messageId: messageId, 
      chatId: chatId, 
      requirements: requirements 
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

    if (action === 'show_summary') {
        const { text, keyboard } = generateSummaryView(config);
        editMessageText(text, keyboard, chatId, messageId, config);
    } else if (action === 'show_list') {
        const { category } = sessionData;
        const { text, keyboard } = generateTicketListView(category, config);
        editMessageText(text, keyboard, chatId, messageId, config);
    } else if (action === 'show_detail') {
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

    if (action === 'cancel') {
        editMessageText("ℹ️ Proses rekomendasi setup telah dibatalkan.", null, chatId, messageId, config);
        clearUserState(userId); // Hapus state jika ada
        return;
    }

    if (action === 'handle_step') {
        const { step, requirements } = sessionData;
        if (step === 'io') {
            // Pastikan 'config' diteruskan ke fungsi berikutnya
            tampilkanPertanyaanIo(userId, messageId, chatId, config, requirements);
        } else if (step === 'spek') {
            // Pastikan 'config' diteruskan ke fungsi berikutnya
            tampilkanPertanyaanSpek(userId, messageId, chatId, config, requirements);
        }
        return;
    }
}
