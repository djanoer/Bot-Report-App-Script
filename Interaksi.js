/**
 * @file Interaksi.js
 * @author Djanoer Team
 * @date 2023-09-05
 *
 * @description
 * Bertindak sebagai pusat kendali untuk interaksi pengguna yang kompleks (multi-langkah).
 * File ini berisi implementasi "Mesin Keadaan" (State Machines) untuk alur
 * seperti pencarian, navigasi paginasi, dan detail tiket.
 */

/**
 * [FINAL & LENGKAP] Handler untuk interaksi dari HASIL PENCARIAN.
 * Versi ini telah disempurnakan untuk alur pesan ekspor "tunggu -> sukses".
 */
function handleVmSearchResults(update, action, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;
  const { searchTerm, page = 1 } = sessionData;

  try {
    if (action === "export") {
      answerCallbackQuery(userEvent.id, config, `Memproses permintaan...`);

      const title = `Hasil Pencarian - '${searchTerm}'`;
      const waitMessage = `⏳ Harap tunggu, sedang memproses permintaan ekspor Anda untuk "<b>${title}</b>"...`;
      let statusMessageId = null;

      const sentMessage = kirimPesanTelegram(waitMessage, config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const jobData = {
        jobType: "export",
        context: { searchTerm },
        config,
        userData,
        chatId,
        statusMessageId, // Sertakan ID pesan "tunggu"
      };
      const jobKey = `job_${userEvent.from.id}_${Date.now()}`;
      PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));
      return;
    }

    const { headers, results } = searchVmOnSheet(searchTerm, config);
    if (results.length === 0) {
      editMessageText(
        `❌ Hasil untuk "<b>${escapeHtml(searchTerm)}</b>" tidak lagi ditemukan.`,
        null,
        chatId,
        messageId,
        config
      );
      return;
    }

    const formatVmEntry = (row) => {
      const K = KONSTANTA.KUNCI_KONFIG;
      const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
      const ipIndex = headers.indexOf(config[K.HEADER_VM_IP]);
      const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
      return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(
        normalizePrimaryKey(row[pkIndex])
      )}</code>)`;
    };

    const callbackInfo = {
      machine: "search_machine",
      action: "navigate_search_results",
      exportAction: "export_search_results",
      context: { searchTerm: searchTerm },
    };

    const { text, keyboard } = createPaginatedView(
      results,
      page,
      `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
      `✅ Ditemukan <b>${results.length} hasil</b> untuk "<b>${escapeHtml(searchTerm)}</b>":`,
      formatVmEntry,
      callbackInfo,
      config
    );

    if (
      userEvent.message.text !== text ||
      JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(keyboard)
    ) {
      editMessageText(text, keyboard, chatId, messageId, config);
    }
  } catch (err) {
    handleCentralizedError(err, "[handleVmSearchResults]", config, userData);
  }
}

/**
 * [REVISI FINAL & ARSITEKTURAL - FASE 3] Mengendalikan tampilan daftar VM.
 * Memperbaiki bug paginasi dengan merestrukturisasi alur data dan memastikan
 * pemanggilan fungsi presentasi yang konsisten.
 */
function handlePaginatedVmList(update, action, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const chatId = userEvent.message.chat.id;
  const messageId = userEvent.message.message_id;

  try {
    if (!sessionData) {
      editMessageText("Sesi telah kedaluwarsa. Silakan mulai lagi perintah awal.", null, chatId, messageId, config);
      return;
    }

    const { listType, itemName, originPk, page = 1 } = sessionData;

    if (action === "export") {
      const friendlyListType = listType === "cluster" ? "Cluster" : "Datastore";
      const title = `Laporan VM di ${friendlyListType} - ${itemName}`;
      const waitMessage = `⏳ Harap tunggu, sedang memproses permintaan ekspor Anda untuk "<b>${title}</b>"...`;
      let statusMessageId = null;
      const sentMessage = kirimPesanTelegram(waitMessage, config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
      const jobData = {
        jobType: "export",
        context: { listType, itemName },
        config,
        userData,
        chatId,
        statusMessageId,
      };
      const jobKey = `job_${userEvent.from.id}_${Date.now()}`;
      PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));
      return;
    }

    // --- ALUR LOGIKA YANG BARU DAN AMAN ---

    // Langkah 1: Fetch Data
    let searchResult;
    if (listType === "cluster") {
      searchResult = searchVmsByCluster(itemName, config);
    } else if (listType === "datastore") {
      searchResult = searchVmsByDatastore(itemName, config);
    } else {
      throw new Error("Tipe daftar tidak valid: " + listType);
    }

    const { headers, results } = searchResult;

    let headerContent;
    if (listType === "cluster") {
      const analysis = generateClusterAnalysis(itemName, results, headers, config);
      headerContent = formatClusterAnalysisHeader(analysis, itemName);
    } else {
      // datastore
      const analysis = generateDatastoreAnalysis(itemName, config);
      headerContent = formatDatastoreAnalysisHeader(analysis, itemName);
    }

    const formatVmEntry = (row) => {
      const K_CONFIG = KONSTANTA.KUNCI_KONFIG;
      const state = String(row[headers.indexOf(config[K_CONFIG.HEADER_VM_STATE])] || "").toLowerCase();
      const statusIcon = state.includes("on") ? "🟢" : "🔴";
      const vmName = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_NAME])]);
      const criticality = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_KRITIKALITAS])] || "");
      const cpu = row[headers.indexOf(config[K_CONFIG.HEADER_VM_CPU])] || "N/A";
      const memory = row[headers.indexOf(config[K_CONFIG.HEADER_VM_MEMORY])] || "N/A";
      const disk = row[headers.indexOf(config[K_CONFIG.HEADER_VM_PROV_TB])] || "N/A";
      return `${statusIcon} <b>${vmName}</b> ${
        criticality ? `<code>[${criticality.toUpperCase()}]</code>` : ""
      }\n     <code>${cpu} vCPU</code> | <code>${memory} GB RAM</code> | <code>${disk} TB Disk</code>`;
    };

    const callbackInfo = {
      machine: "search_machine",
      action: "navigate_list",
      exportAction: "export_list",
      context: { listType, itemName, originPk, originContext },
    };

    const fullHeader = formatReportHeader(`Daftar VM di ${listType} ${itemName}`) + headerContent;

    const paginatedView = createPaginatedView(
      results,
      page,
      `Daftar VM`,
      fullHeader,
      formatVmEntry,
      callbackInfo,
      config
    );

    // --- LOGIKA TOMBOL "KEMBALI" YANG BARU ---
    if (originContext && paginatedView.keyboard) {
      const { machine, action, storageType } = originContext;
      paginatedView.keyboard.inline_keyboard.push([
        {
          text: `⬅️ Kembali ke Daftar Datastore`,
          callback_data: CallbackHelper.build(machine, action, { storageType: storageType, page: 1 }, config),
        },
      ]);
    } else if (originPk && paginatedView.keyboard) {
      paginatedView.keyboard.inline_keyboard.push([
        {
          text: `⬅️ Kembali ke Detail VM`,
          callback_data: CallbackHelper.build("search_machine", "back_to_detail", { pk: originPk }, config),
        },
      ]);
    }
    // --- AKHIR LOGIKA BARU ---

    if (
      userEvent.message.text !== paginatedView.text ||
      JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(paginatedView.keyboard)
    ) {
      editMessageText(paginatedView.text, paginatedView.keyboard, chatId, messageId, config);
    }
  } catch (err) {
    handleCentralizedError(err, `Daftar VM Paginasi`, config, userData);
  }
}

/**
 * [REFACTOR FINAL v2.2] Mengadopsi alur pesan "tunggu->sukses" untuk ekspor.
 */
function handleHistoryInteraction(update, action, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const isCallback = !!userEvent.id;
  const chatId = userEvent.message ? userEvent.message.chat.id : userEvent.chat.id;
  const messageId = userEvent.message ? userEvent.message.message_id : null;

  try {
    if (action === "export") {
      answerCallbackQuery(userEvent.id, config, `Memproses permintaan...`);

      const title = sessionData.pk ? `Riwayat untuk PK ${sessionData.pk}` : "Riwayat Hari Ini";
      const waitMessage = `⏳ Harap tunggu, sedang memproses permintaan ekspor Anda untuk "<b>${title}</b>"...`;
      let statusMessageId = null;

      const sentMessage = kirimPesanTelegram(waitMessage, config, "HTML", null, chatId);
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }

      const jobData = {
        jobType: "export",
        context: sessionData,
        config: config,
        userData: userData,
        chatId: chatId,
        statusMessageId: statusMessageId, // Sertakan ID pesan "tunggu"
      };
      const jobKey = `job_${userEvent.from.id}_${Date.now()}`;
      PropertiesService.getScriptProperties().setProperty(jobKey, JSON.stringify(jobData));

      return;
    }

    const { pk, timeframe, page = 1 } = sessionData;
    let logsToShow, logHeaders, title, headerContent, callbackContext;

    if (pk) {
      const result = getVmHistory(pk, config);
      logsToShow = result.history;
      logHeaders = result.headers;
      title = `Riwayat Perubahan untuk ${escapeHtml(pk)}`;
      headerContent =
        `<b>📜 Riwayat Perubahan untuk VM</b>\n` +
        `<b>Nama:</b> ${escapeHtml(result.vmName)}\n` +
        `<b>PK:</b> <code>${escapeHtml(pk)}</code>\n\n` +
        analyzeVmProfile(logsToShow, logHeaders, config);
      callbackContext = { pk: pk };
    } else if (timeframe === "today") {
      const todayStartDate = new Date();
      todayStartDate.setHours(0, 0, 0, 0);
      const result = getCombinedLogs(todayStartDate, config);
      logsToShow = result.data;
      logHeaders = result.headers;
      title = "Log Perubahan Hari Ini";
      headerContent = `<b>📜 Log Perubahan Hari Ini</b>\n<i>(Termasuk dari arsip jika relevan)</i>`;
      callbackContext = { timeframe: "today" };
    } else {
      throw new Error("Konteks riwayat tidak valid di sessionData.");
    }

    if (logsToShow.length === 0) {
      let message;
      let keyboard = null;
      if (pk) {
        message = `ℹ️ Tidak ada aktivitas perubahan yang tercatat untuk VM dengan PK: <code>${escapeHtml(pk)}</code>`;
        keyboard = {
          inline_keyboard: [
            [
              {
                text: "⬅️ Kembali ke Detail VM",
                callback_data: CallbackHelper.build("search_machine", "back_to_detail", { pk: pk }, config),
              },
            ],
          ],
        };
      } else {
        message = `✅ Tidak ada aktivitas perubahan data yang tercatat hari ini.`;
      }
      isCallback
        ? editMessageText(message, keyboard, chatId, messageId, config)
        : kirimPesanTelegram(message, config, "HTML", keyboard, chatId);
      return;
    }

    const callbackInfo = {
      machine: "history_machine",
      action: "navigate",
      exportAction: "export",
      context: callbackContext,
    };

    const { text, keyboard } = createPaginatedView(
      logsToShow,
      page,
      title,
      headerContent,
      (row) => formatHistoryEntry(row, logHeaders, config),
      callbackInfo,
      config
    );

    if (pk && keyboard) {
      keyboard.inline_keyboard.push([
        {
          text: "⬅️ Kembali ke Detail VM",
          callback_data: CallbackHelper.build("search_machine", "back_to_detail", { pk: pk }, config),
        },
      ]);
    }

    if (isCallback) {
      if (
        userEvent.message.text !== text ||
        JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(keyboard)
      ) {
        editMessageText(text, keyboard, chatId, messageId, config);
      }
    } else {
      kirimPesanTelegram(text, config, "HTML", keyboard, chatId);
    }
  } catch (err) {
    const context = sessionData.pk ? `PK: ${sessionData.pk}` : "Today";
    handleCentralizedError(err, `[handleHistoryInteraction for ${context}]`, config, userData);
  }
}

/**
 * [FINAL] Handler utama yang menangani panggilan awal dari perintah teks /cekvm.
 * Versi ini telah diperbaiki untuk menampilkan daftar paginasi multi-hasil dengan benar.
 */
function handleVmSearch(update, config, userData) {
  const userEvent = update.message;
  const chatId = userEvent.chat.id;

  try {
    const searchTerm = userEvent.text.split(" ").slice(1).join(" ");
    if (!searchTerm) {
      kirimPesanTelegram(`Gunakan format: <code>/cari-vm [IP / Nama / PK]</code>`, config, "HTML", null, chatId);
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

    // --- BLOK PERBAIKAN UTAMA ---
    const formatVmEntry = (row) => {
      const K = KONSTANTA.KUNCI_KONFIG;
      const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
      const ipIndex = headers.indexOf(config[K.HEADER_VM_IP]);
      const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
      return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(
        normalizePrimaryKey(row[pkIndex])
      )}</code>)`;
    };

    const callbackInfo = {
      machine: "search_machine",
      action: "navigate_search_results",
      exportAction: "export_search_results",
      context: { searchTerm: searchTerm },
    };

    const { text, keyboard } = createPaginatedView(
      results,
      1,
      `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
      `✅ Ditemukan <b>${results.length} hasil</b> untuk "<b>${escapeHtml(searchTerm)}</b>":`,
      formatVmEntry,
      callbackInfo,
      config
    );

    kirimPesanTelegram(text, config, "HTML", keyboard, chatId);
  } catch (err) {
    handleCentralizedError(err, "[handleVmSearch]", config, userData);
  }
}

/**
 * [REVISI FINAL & ARSITEKTURAL - FASE 4] State machine untuk alur kerja penjelajahan storage.
 * Mengimplementasikan UI "Tampilan & Aksi Terpisah" dan memperbaiki bug paginasi secara tuntas.
 */
function handleStorageExplorer(update, action, config, userData) {
  const isInitialCall = action === "start";
  const userEvent = isInitialCall ? update.message : update.callback_query;
  const chatId = userEvent.chat.id;
  let statusMessageId = isInitialCall ? null : userEvent.message.message_id;
  const sessionData = isInitialCall ? {} : userEvent.sessionData;

  try {
    const storageType = isInitialCall ? userEvent.text.split(" ").slice(1).join(" ") : sessionData.storageType;
    const page = sessionData.page || 1;

    if (isInitialCall) {
      const sentMessage = kirimPesanTelegram(
        `⏳ Mencari datastore dengan tipe <b>${escapeHtml(storageType)}</b>...`,
        config,
        "HTML",
        null,
        chatId
      );
      if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
      }
    }

    if (action === "start" || action === "show_ds_list") {
      const { headers, results: datastores } = searchDatastoresByType(storageType, config);
      if (datastores.length === 0) {
        editMessageText(
          `ℹ️ Tidak ditemukan datastore dengan tipe "<b>${escapeHtml(storageType)}</b>".`,
          null,
          chatId,
          statusMessageId,
          config
        );
        return;
      }

      const headerContent = formatReportHeader(`Hasil Pencarian Tipe Storage: ${storageType}`);

      // Format entri sebagai daftar teks yang bersih
      const formatDsEntry = (row) => {
        const dsName = row[headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER])];
        const usedPercent = parseLocaleNumber(
          row[headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_DS_USED_PERCENT])]
        );
        return `🗄️ <b>${escapeHtml(dsName)}</b>\n     └ Utilisasi: ${usedPercent.toFixed(1)}% ${createProgressBar(
          usedPercent
        )}`;
      };

      // CallbackInfo untuk menghubungkan tombol paginasi ke state machine ini
      const callbackInfo = {
        machine: "storage_explorer_machine",
        action: "show_ds_list",
        context: { storageType: storageType },
      };

      // Gunakan createPaginatedView untuk menghasilkan teks daftar dan tombol navigasi
      const paginatedView = createPaginatedView(
        datastores,
        page,
        `Datastore Tipe ${storageType}`,
        headerContent,
        formatDsEntry,
        callbackInfo,
        config
      );

      // --- PEMBUATAN KEYBOARD ELEGAN BARU ---
      const entriesPerPage = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.PAGINATION_ENTRIES) || 15;
      const pageEntries = datastores.slice((page - 1) * entriesPerPage, page * entriesPerPage);
      const dsNameIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);

      // Buat tombol aksi HANYA untuk item di halaman saat ini
      const actionButtons = pageEntries.map((row) => {
        const dsName = row[dsNameIndex];
        return {
          text: `Telusuri VM di ${dsName.substring(0, 25)}...`,
          callback_data: CallbackHelper.build(
            "storage_explorer_machine",
            "show_vm_list",
            {
              storageType: storageType,
              dsName: dsName,
            },
            config
          ),
        };
      });

      // Gabungkan tombol aksi dengan tombol navigasi dari paginatedView
      // Tombol aksi di atas, tombol navigasi di bawah
      paginatedView.keyboard.inline_keyboard = actionButtons
        .map((btn) => [btn])
        .concat(paginatedView.keyboard.inline_keyboard);
      // --- AKHIR PEMBUATAN KEYBOARD ---

      editMessageText(paginatedView.text, paginatedView.keyboard, chatId, statusMessageId, config);
    } else if (action === "show_vm_list") {
      const { dsName } = sessionData;

      // Panggil handler VM list yang sudah di-upgrade
      const mockUpdate = {
        callback_query: {
          ...userEvent,
          message: {
            ...userEvent.message,
            chat: { id: chatId },
            message_id: statusMessageId,
          },
          sessionData: {
            listType: "datastore",
            itemName: dsName,
            page: 1,
            // Berikan konteks untuk tombol "Kembali" agar bisa kembali ke daftar datastore
            originContext: { machine: "storage_explorer_machine", action: "show_ds_list", storageType: storageType },
          },
        },
      };
      handlePaginatedVmList(mockUpdate, "navigate", config, userData);
    }
  } catch (e) {
    handleCentralizedError(e, `Perintah: /cekstorage`, config, userData);
    if (statusMessageId) {
      editMessageText(
        `❌ Gagal memproses permintaan.\n\nPenyebab: <code>${escapeHtml(e.message)}</code>`,
        null,
        chatId,
        statusMessageId,
        config
      );
    }
  }
}
