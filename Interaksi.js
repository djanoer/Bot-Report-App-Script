// ===== FILE: Interaksi.gs =====

/**
 * [FINAL] Mesin Keadaan untuk semua interaksi yang berhubungan dengan pencarian,
 * detail, dan daftar VM (baik dari hasil pencarian maupun dari cluster/datastore).
 */
function searchMachine(update, action, config, userData) {
    const userEvent = update.callback_query;
    const sessionData = userEvent.sessionData;
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;

    if (action === 'show_list' || action === 'navigate_list' || action === 'export_list') {
        if (action === 'export_list') { userEvent.action = KONSTANTA.PAGINATION_ACTIONS.EXPORT; }
        else { userEvent.action = KONSTANTA.PAGINATION_ACTIONS.NAVIGATE; }
        handlePaginatedVmList(update, config, userData);

    } else if (action === 'navigate_search_results' || action === 'export_search_results') {
        if (action === 'export_search_results') { userEvent.action = KONSTANTA.PAGINATION_ACTIONS.EXPORT; }
        else { userEvent.action = KONSTANTA.PAGINATION_ACTIONS.NAVIGATE; }
        // --- PERBAIKAN UTAMA DI SINI ---
        // Teruskan seluruh objek 'update' ke handler yang benar
        handleVmSearchResults(update, config, userData);

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
 * [FINAL & LENGKAP] Handler khusus untuk interaksi lanjutan (paginasi/ekspor) dari HASIL PENCARIAN.
 */
function handleVmSearchResults(update, config, userData) {
    const userEvent = update.callback_query;
    const sessionData = userEvent.sessionData;
    const { searchTerm, page = 1 } = sessionData;
    
    try {
        if (userEvent.action === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
            answerCallbackQuery(userEvent.id, config, "Menambahkan ke antrean...");
            const jobData = { jobType: "search", searchTerm, config, userData, chatId: userEvent.message.chat.id };
            const jobKey = `export_job_${userEvent.from.id}_${Date.now()}`;
            PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(jobData));
            kirimPesanTelegram(`✅ Permintaan ekspor Anda untuk "<b>${escapeHtml(searchTerm)}</b>" telah ditambahkan ke antrean.`, config, "HTML", null, userEvent.message.chat.id);
            return;
        }

        const { headers, results } = searchVmOnSheet(searchTerm, config);
        if (results.length === 0) {
            editMessageText(`❌ Hasil untuk "<b>${escapeHtml(searchTerm)}</b>" tidak lagi ditemukan.`, null, userEvent.message.chat.id, userEvent.message.message_id, config);
            return;
        }

        const formatVmEntry = (row) => {
            const K = KONSTANTA.KUNCI_KONFIG;
            const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
            const ipIndex = headers.indexOf(config[K.HEADER_VM_IP]);
            const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
            return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(normalizePrimaryKey(row[pkIndex]))}</code>)`;
        };

        const callbackInfo = {
            navPrefix: 'search_machine:navigate_search_results:',
            exportPrefix: 'search_machine:export_search_results:',
            context: { searchTerm: searchTerm },
        };

        const { text, keyboard } = createPaginatedView({
            allItems: results,
            page: page,
            title: `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
            formatEntryCallback: formatVmEntry,
            callbackInfo: callbackInfo,
            config: config,
        });

        if (userEvent.message.text !== text || JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(keyboard)) {
            editMessageText(text, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config);
        }
    } catch (err) {
        handleCentralizedError(err, "[handleVmSearchResults]", config, userData);
    }
}

/**
 * [FINAL-FIX-3] Mengendalikan tampilan daftar VM untuk Cluster/Datastore.
 * Memperbaiki bug '[object Object]' dengan memanggil fungsi formatter header.
 */
function handlePaginatedVmList(update, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;

  try {
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;

    if (!sessionData) {
      editMessageText("Sesi telah kedaluwarsa. Silakan mulai lagi perintah awal.", null, chatId, messageId, config);
      return;
    }

    const { listType, itemName, originPk, page = 1 } = sessionData;

    if (!listType) {
        throw new Error("Tipe daftar (listType) tidak ditemukan di dalam data sesi.");
    }

    if (userEvent.action === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
      answerCallbackQuery(userEvent.id, config, "Menambahkan ke antrean...");
      const jobData = { jobType: "list", listType, itemName, config, userData, chatId };
      const jobKey = `export_job_${userEvent.from.id}_${Date.now()}`;
      PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(jobData));
      const friendlyListType = listType === "cluster" ? "Cluster" : "Datastore";
      kirimPesanTelegram(`✅ Permintaan ekspor Anda untuk VM di <b>${friendlyListType} "${escapeHtml(itemName)}"</b> telah ditambahkan ke antrean.`, config, "HTML", null, chatId);
      return;
    }

    let searchFunction, titlePrefix, navPrefix, exportPrefix, headerContent = "";
    
    if (listType === "cluster") {
        searchFunction = searchVmsByCluster;
        titlePrefix = "VM di Cluster";
        navPrefix = 'search_machine:navigate_list:';
        exportPrefix = 'search_machine:export_list:';
        
        // --- PERBAIKAN UTAMA DI SINI ---
        const analysis = generateClusterAnalysis(itemName, config);
        // Panggil fungsi formatter untuk mengubah objek menjadi string HTML
        headerContent = formatClusterAnalysisHeader(analysis, itemName);
        // --- AKHIR PERBAIKAN ---

    } else if (listType === "datastore") {
        searchFunction = searchVmsByDatastore;
        titlePrefix = "VM di Datastore";
        navPrefix = 'search_machine:navigate_list:';
        exportPrefix = 'search_machine:export_list:';
        
        // --- PERBAIKAN DI SINI ---
        const analysis = generateDatastoreAnalysis(itemName, config);
        headerContent = formatDatastoreAnalysisHeader(analysis, itemName);
        // --- AKHIR PERBAIKAN ---
    } else {
      throw new Error("Tipe daftar tidak valid: " + listType);
    }

    const { headers, results } = searchFunction(itemName, config);

    const formatVmEntry = (row) => {
        const K_CONFIG = KONSTANTA.KUNCI_KONFIG;
        const state = String(row[headers.indexOf(config[K_CONFIG.HEADER_VM_STATE])] || "").toLowerCase();
        const statusIcon = state.includes("on") ? "🟢" : "🔴";
        const vmName = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_NAME])]);
        const criticality = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_KRITIKALITAS])] || "");
        const criticalityLabel = criticality ? `<code>[${criticality.toUpperCase()}]</code>` : "";
        const cpu = row[headers.indexOf(config[K_CONFIG.HEADER_VM_CPU])] || "N/A";
        const memory = row[headers.indexOf(config[K_CONFIG.HEADER_VM_MEMORY])] || "N/A";
        const disk = row[headers.indexOf(config[K_CONFIG.HEADER_VM_PROV_TB])] || "N/A";
        return `${statusIcon} <b>${vmName}</b> ${criticalityLabel}\n     <code>${cpu} vCPU</code> | <code>${memory} GB RAM</code> | <code>${disk} TB Disk</code>`;
    };

    const callbackInfo = {
      navPrefix: navPrefix,
      exportPrefix: exportPrefix,
      context: { listType, itemName, originPk },
    };

    const paginatedView = createPaginatedView({
      allItems: results,
      page: page,
      title: `${titlePrefix} "${escapeHtml(itemName)}"`,
      headerContent: headerContent,
      formatEntryCallback: formatVmEntry,
      callbackInfo: callbackInfo,
      config: config,
    });

    if (originPk && paginatedView.keyboard) {
        const backSessionId = createCallbackSession({ pk: originPk }, config);
        paginatedView.keyboard.inline_keyboard.push([
            { text: `⬅️ Kembali ke Detail VM`, callback_data: `search_machine:back_to_detail:${backSessionId}` },
        ]);
    }
    
    if (userEvent.message.text !== paginatedView.text || JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(paginatedView.keyboard)) {
      editMessageText(paginatedView.text, paginatedView.keyboard, chatId, messageId, config);
    }
  } catch (err) {
    handleCentralizedError(err, `Daftar VM Paginasi`, config, userData);
  }
}

/**
 * [REFACTOR FINAL] Menangani semua interaksi untuk riwayat VM.
 * Versi ini sepenuhnya terintegrasi dengan arsitektur state-driven.
 */
function handleHistoryInteraction(update, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const isCallback = !!userEvent.id;

  try {
    // Suntikkan aksi (navigate atau export) berdasarkan callback data jika ada
    if (userEvent.data && userEvent.data.includes(':export:')) {
      userEvent.action = KONSTANTA.PAGINATION_ACTIONS.EXPORT;
    } else {
      userEvent.action = KONSTANTA.PAGINATION_ACTIONS.NAVIGATE;
    }

    if (userEvent.action === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
      answerCallbackQuery(userEvent.id, config, "Menambahkan ke antrean...");
      const jobData = { jobType: "history", context: sessionData, config: config, userData: userData, chatId: userEvent.message.chat.id };
      const jobKey = `export_job_${userEvent.from.id}_${Date.now()}`;
      PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(jobData));
      const title = sessionData.pk ? `Riwayat untuk PK ${sessionData.pk}` : "Riwayat Hari Ini";
      kirimPesanTelegram(`✅ Permintaan ekspor Anda untuk "<b>${escapeHtml(title)}</b>" telah ditambahkan ke antrean.`, config, "HTML", null, userEvent.message.chat.id);
      return;
    }

    const page = sessionData.page || 1;
    let logsToShow, logHeaders, title, headerContent;

    if (sessionData.pk) {
      const result = getVmHistory(sessionData.pk, config);
      logsToShow = result.history;
      logHeaders = result.headers;
      title = `Riwayat Perubahan untuk ${escapeHtml(sessionData.pk)}`;
      headerContent = `<b>📜 Riwayat Perubahan untuk VM</b>\n` + `<b>Nama:</b> ${escapeHtml(result.vmName)}\n` + `<b>PK:</b> <code>${escapeHtml(sessionData.pk)}</code>\n\n` + analyzeVmProfile(logsToShow, logHeaders, config);
    } else { // Untuk /cekhistory
      const todayStartDate = new Date(); todayStartDate.setHours(0, 0, 0, 0);
      const result = getCombinedLogs(todayStartDate, config);
      logsToShow = result.data;
      logHeaders = result.headers;
      title = "Log Perubahan Hari Ini";
      headerContent = `<b>📜 Log Perubahan Hari Ini</b>\n<i>(Termasuk dari arsip jika relevan)</i>`;
    }

    if (logsToShow.length === 0) {
      let message; let keyboard = null;
      if (sessionData.pk) {
        message = `ℹ️ Tidak ada aktivitas perubahan yang tercatat untuk VM dengan PK: <code>${escapeHtml(sessionData.pk)}</code>`;
        const backSessionId = createCallbackSession({ pk: sessionData.pk }, config);
        keyboard = { inline_keyboard: [[{ text: "⬅️ Kembali ke Detail VM", callback_data: `search_machine:back_to_detail:${backSessionId}` }]] };
      } else {
        message = `✅ Tidak ada aktivitas perubahan data yang tercatat hari ini.`;
      }
      // Kirim pesan jika ini panggilan awal, edit jika dari callback
      isCallback ? editMessageText(message, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config) : kirimPesanTelegram(message, config, "HTML", keyboard, userEvent.chat.id);
      return;
    }

    // --- PERBAIKAN UTAMA DI SINI ---
    // Definisikan callback prefix yang baru untuk 'history_machine'
    const callbackInfo = {
      navPrefix: 'history_machine:navigate:',
      exportPrefix: 'history_machine:export:',
      context: sessionData.pk ? { pk: sessionData.pk } : { timeframe: "today" },
    };

    const { text, keyboard } = createPaginatedView({
      allItems: logsToShow, page: page, title: title, headerContent: headerContent,
      formatEntryCallback: (row) => formatHistoryEntry(row, logHeaders, config),
      callbackInfo: callbackInfo, config: config,
    });

    if (sessionData.pk && keyboard) {
      const backSessionId = createCallbackSession({ pk: sessionData.pk }, config);
      keyboard.inline_keyboard.push([{ text: "⬅️ Kembali ke Detail VM", callback_data: `search_machine:back_to_detail:${backSessionId}` }]);
    }

    // Kirim pesan baru jika ini panggilan awal (bukan dari callback)
    // Edit pesan jika ini adalah panggilan dari tombol paginasi
    if (isCallback) {
      if (userEvent.message.text !== text || JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(keyboard)) {
        editMessageText(text, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config);
      }
    } else {
      kirimPesanTelegram(text, config, "HTML", keyboard, userEvent.chat.id);
    }
  } catch (err) {
    const context = sessionData.pk ? `PK: ${sessionData.pk}` : "Today";
    handleCentralizedError(err, `[handleHistoryInteraction for ${context}]`, config, userData);
  }
}

/**
 * [FINAL] Handler utama yang menangani panggilan awal dari perintah teks /cekvm.
 */
function handleVmSearch(update, config, userData) {
  const userEvent = update.message;
  const chatId = userEvent.chat.id;

  try {
    const searchTerm = userEvent.text.split(" ").slice(1).join(" ");
    if (!searchTerm) {
      kirimPesanTelegram(`Gunakan format: <code>/cekvm [IP / Nama / PK]</code>`, config, "HTML", null, chatId);
      return;
    }

    const { headers, results } = searchVmOnSheet(searchTerm, config);

    if (results.length === 0) {
      const message = `❌ VM dengan kriteria "<b>${escapeHtml(searchTerm)}</b>" tidak ditemukan.`;
      kirimPesanTelegram(message, config, "HTML", null, chatId);
      return;
    }

    if (results.length === 1) {
      const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
      const fullMessage = `✅ Ditemukan 1 hasil untuk "<b>${escapeHtml(searchTerm)}</b>":\n\n${pesan}`;
      kirimPesanTelegram(fullMessage, config, "HTML", keyboard, chatId);
      return;
    }

    const formatVmEntry = (row) => {
      const K = KONSTANTA.KUNCI_KONFIG;
      const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
      const ipIndex = headers.indexOf(config[K.HEADER_VM_IP]);
      const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
      return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(normalizePrimaryKey(row[pkIndex]))}</code>)`;
    };

    const callbackInfo = {
      navPrefix: 'search_machine:navigate_search_results:',
      exportPrefix: 'search_machine:export_search_results:',
      context: { searchTerm: searchTerm },
    };

    const { text, keyboard } = createPaginatedView({
      allItems: results,
      page: 1,
      title: `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
      formatEntryCallback: formatVmEntry,
      callbackInfo: callbackInfo,
      config: config,
    });

    kirimPesanTelegram(text, config, "HTML", keyboard, chatId);

  } catch (err) {
    handleCentralizedError(err, "[handleVmSearch]", config, userData);
  }
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
