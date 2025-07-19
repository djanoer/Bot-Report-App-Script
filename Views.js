// ===== FILE: Views.gs =====

/**
 * Berisi semua fungsi yang bertanggung jawab untuk me-render (menggambar)
 * tampilan berdasarkan objek state. Fungsi-fungsi ini "bodoh" dan tidak
 * melakukan logika pengambilan data.
 */
const Views = (function() {

    /**
     * [REVISED] Menggambar tampilan detail untuk satu VM dengan format dan keyboard yang telah diperbaiki.
     * Fungsi ini kini menghasilkan format pesan yang presisi dan hanya menyertakan tombol
     * untuk Riwayat dan Catatan, memastikan stabilitas dan fungsionalitas inti.
     */
    function renderVmDetailView(state, config) {
      const { vmData, headers, noteData, activeTickets } = state.data;
      const K = KONSTANTA.KUNCI_KONFIG;
  
      // Helper yang disempurnakan untuk mengambil nilai dari objek vmData berdasarkan kunci konfigurasi.
      const getVal = (headerKey) => {
          const headerName = config[headerKey];
          return vmData[headerName] || "";
      };
  
      // Helper untuk memformat baris detail, memastikan konsistensi.
      const addDetail = (value, icon, label, isCode = false) => {
          if (value !== undefined && value !== null && String(value).trim() !== "") {
              const formattedValue = isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
              return `•  ${icon} <b>${label}:</b> ${formattedValue}\n`;
          }
          return "";
      };
  
      const normalizedPk = normalizePrimaryKey(getVal(K.HEADER_VM_PK));
      const vmName = getVal(K.HEADER_VM_NAME);
      const clusterName = getVal(K.HEADER_VM_CLUSTER);
      const datastoreName = getVal(K.VM_DS_COLUMN_HEADER);
  
      // --- PEMBUATAN PESAN SESUAI FORMAT YANG DIMINTA ---
      let pesan = "🖥️  <b>Detail Virtual Machine</b>\n\n";
      pesan += "<b>Informasi Umum</b>\n";
      pesan += addDetail(vmName, "🏷️", "Nama VM", true);
      pesan += addDetail(normalizedPk, "🔑", "Primary Key", true);
      pesan += addDetail(getVal(K.HEADER_VM_IP), "🌐", "IP Address", true);
      const stateValue = getVal(K.HEADER_VM_STATE) || "";
      const stateIcon = stateValue.toLowerCase().includes("on") ? "🟢" : "🔴";
      pesan += addDetail(stateValue, stateIcon, "Status");
      pesan += addDetail(`${getVal(K.HEADER_VM_UPTIME)} hari`, "⏳", "Uptime");
      
      pesan += "\n<b>Sumber Daya & Kapasitas</b>\n";
      pesan += addDetail(`${getVal(K.HEADER_VM_CPU)} vCPU`, "⚙️", "CPU");
      pesan += addDetail(`${getVal(K.HEADER_VM_MEMORY)} GB`, "🧠", "Memory");
      pesan += addDetail(`${getVal(K.HEADER_VM_PROV_GB)} GB`, "💽", "Provisioned");
      pesan += addDetail(clusterName, "☁️", "Cluster");
      pesan += addDetail(datastoreName, "🗄️", "Datastore");
  
      pesan += "\n<b>Konfigurasi & Manajemen</b>\n";
      pesan += addDetail(getEnvironmentFromDsName(datastoreName || "", config[K.MAP_ENV]) || "N/A", "🌍", "Environment");
      pesan += addDetail(getVal(K.HEADER_VM_KRITIKALITAS), "🔥", "Kritikalitas BIA");
      pesan += addDetail(getVal(K.HEADER_VM_KELOMPOK_APP), "📦", "Aplikasi BIA");
      pesan += addDetail(getVal(K.HEADER_VM_DEV_OPS), "👥", "DEV/OPS");
      pesan += addDetail(getVal(K.HEADER_VM_GUEST_OS), "🐧", "Guest OS");
      pesan += addDetail(getVal(K.HEADER_VM_VCENTER), "🏢", "vCenter");
  
      pesan += `\n--------------------------------------------------\n`;
      pesan += `🎫  <b>Tiket Provisioning:</b>\n`;
      const noTiketProvisioning = getVal(K.HEADER_VM_NO_TIKET);
      pesan += noTiketProvisioning ? `   - <code>${escapeHtml(noTiketProvisioning)}</code>\n` : `   - <i>Tidak ada nomor tiket provisioning yang tercatat.</i>\n`;
      
      pesan += `\n🎟️  <b>Tiket CPR Utilisasi (Aktif):</b>\n`;
      if (activeTickets && activeTickets.length > 0) {
          activeTickets.forEach((ticket) => {
              pesan += `   - <code>${escapeHtml(ticket.id)}</code>: ${escapeHtml(ticket.name)} (${escapeHtml(ticket.status)})\n`;
          });
      } else {
          pesan += `   - <i>Tidak ada tiket utilisasi aktif yang ditemukan.</i>`;
      }
      
      pesan += `\n--------------------------------------------------\n`;
      pesan += `\n📝  <b>Catatan untuk VM ini:</b>\n`;
      if (noteData) {
          const noteText = noteData["Isi Catatan"] || "<i>(Catatan kosong)</i>";
          const updatedBy = noteData["Nama User Update"] || "tidak diketahui";
          const updatedAt = noteData["Timestamp Update"] ? new Date(noteData["Timestamp Update"]).toLocaleString("id-ID") : "tidak diketahui";
          pesan += `<i>${escapeHtml(noteText)}</i>\n`;
          pesan += `_Terakhir diperbarui oleh: ${escapeHtml(updatedBy)} pada ${updatedAt}_\n`;
      } else {
          pesan += `_Tidak ada catatan untuk VM ini._\n`;
      }
  
      // --- BAGIAN KEYBOARD YANG DISEDERHANAKAN DAN STABIL ---
      const keyboardRows = [
          // Baris pertama: Hanya tombol Riwayat
          [
            { text: "📜 Lihat Riwayat", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.VIEW_LIST, { listType: 'history', pk: normalizedPk }) }
          ],
          // Baris kedua: Hanya tombol untuk Catatan
          [
            { text: `✏️ ${noteData ? "Edit" : "Tambah"} Catatan`, callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.PROMPT_NOTE_INPUT, { pk: normalizedPk }) }
          ]
      ];
      
      // Tambahkan tombol Hapus Catatan jika catatan sudah ada
      if (noteData) {
          keyboardRows[1].push({ text: "🗑️ Hapus Catatan", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.DELETE_NOTE_CONFIRM, { pk: normalizedPk }) });
      }
  
      return { text: pesan, keyboard: { inline_keyboard: keyboardRows } };
    }
  
    /**
     * Menggambar tampilan daftar berhalaman.
     */
    function renderPaginatedListView(state, config) {
      const { listType, context, currentPage, data } = state;
      if (!data || !data.items) {
          return { text: "Tidak ada data untuk ditampilkan.", keyboard: null };
      }
      const { items, headers, vmName } = data;
      
      let title, headerContent, formatEntryCallback, navPrefix, exportPrefix, backButton = null;
      const K_CONFIG = KONSTANTA.KUNCI_KONFIG;
  
      switch(listType) {
          case 'search_vm':
              title = `Hasil Pencarian untuk "${escapeHtml(context.searchTerm)}"`;
              navPrefix = "search_nav"; // Sederhanakan prefix untuk build
              exportPrefix = "search_export";
              formatEntryCallback = (row) => {
                  const nameIndex = headers.indexOf(config[K_CONFIG.HEADER_VM_NAME]);
                  const ipIndex = headers.indexOf(config[K_CONFIG.HEADER_VM_IP]);
                  const pkIndex = headers.indexOf(config[K_CONFIG.HEADER_VM_PK]);
                  return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(normalizePrimaryKey(row[pkIndex]))}</code>)`;
              };
              break;
          case 'history':
              title = context.pk ? `Riwayat untuk PK ${context.pk}` : "Log Perubahan Hari Ini";
              headerContent = context.pk ? `<b>📜 Riwayat untuk VM:</b> <code>${context.pk}</code>\n<b>Nama:</b> ${escapeHtml(vmName)}` : `<b>📜 Log Perubahan Hari Ini</b>`;
              navPrefix = "history_nav";
              exportPrefix = "history_export";
              formatEntryCallback = (row) => {
                  const timestamp = new Date(row[headers.indexOf(config[K_CONFIG.HEADER_LOG_TIMESTAMP])]).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Makassar" });
                  const action = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_LOG_ACTION])] || "");
                  const detail = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_LOG_DETAIL])] || "");
                  const oldValueFormatted = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_LOG_OLD_VAL])] || "(Kosong)");
                  const newValueFormatted = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_LOG_NEW_VAL])] || "(Kosong)");
                  let formattedText = `<b>🗓️ ${timestamp}</b> | <b>Aksi:</b> ${action}\n`;
                  if (!context.pk) {
                      formattedText += `<b>VM:</b> ${escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_NAME])] || row[headers.indexOf(config[K_CONFIG.HEADER_VM_PK])])}\n`;
                  }
                  if (action === "MODIFIKASI") {
                      const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
                      formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
                      formattedText += `   - <code>${oldValueFormatted}</code> ➔ <code>${newValueFormatted}</code>\n`;
                  } else {
                      formattedText += `<b>Detail:</b> ${detail}\n`;
                  }
                  return formattedText;
              };
              if (context.pk) {
                  backButton = { text: "⬅️ Kembali", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.GO_BACK) };
              }
              break;
          case 'cluster_vms':
              title = `VM di Cluster "${escapeHtml(context.itemName)}"`;
              const analysis = generateClusterAnalysis(context.itemName, config);
              headerContent = `📊 <b>Analisis Cluster "${escapeHtml(context.itemName)}"</b>\n`;
              headerContent += `• <b>Total VM:</b> ${analysis.totalVms} (🟢 ${analysis.on} On / 🔴 ${analysis.off} Off)\n`;
              const totalMemoryInTb = analysis.totalMemory / 1024;
              headerContent += `• <b>Alokasi Resource:</b> ${analysis.totalCpu} vCPU | ${analysis.totalMemory.toFixed(0)} GB RAM (~${totalMemoryInTb.toFixed(2)} TB)\n`;
              navPrefix = "cluster_nav";
              exportPrefix = "cluster_export";
              formatEntryCallback = (row) => {
                  const state = String(row[headers.indexOf(config[K_CONFIG.HEADER_VM_STATE])] || "").toLowerCase();
                  const statusIcon = state.includes("on") ? "🟢" : "🔴";
                  const vmName = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_NAME])]);
                  const pk = normalizePrimaryKey(row[headers.indexOf(config[K_CONFIG.HEADER_VM_PK])]);
                  return `${statusIcon} <a href="https://dummy.url/cekvm?pk=${pk}">${vmName}</a>`; // Tautan dummy, akan dihandle oleh bot
              };
              if (context.originPk) {
                  backButton = { text: "⬅️ Kembali", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.GO_BACK) };
              }
              break;
      }
  
      const entriesPerPage = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.PAGINATION_ENTRIES) || 15;
      const totalPages = Math.ceil(items.length / entriesPerPage);
      const page = Math.min(currentPage, totalPages);
      const startIndex = (page - 1) * entriesPerPage;
      const pageEntries = items.slice(startIndex, startIndex + entriesPerPage);
  
      let text = `<b>${title}</b>\n`;
      if (headerContent) text += `${headerContent}\n`;
      text += `<i>Menampilkan ${startIndex + 1}-${startIndex + pageEntries.length} dari ${items.length}</i>\n`;
      text += "------------------------------------\n\n";
      text += pageEntries.map((item, index) => `${startIndex + index + 1}. ${formatEntryCallback(item)}`).join("\n\n");
      
      const keyboardRows = [];
      const navigationButtons = [];
      
      if (page > 1) {
          navigationButtons.push({ text: "⬅️ Prev", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.PAGINATE, { page: page - 1 }) });
      }
      if (totalPages > 1) {
          navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: KONSTANTA.ACTIONS.IGNORE });
      }
      if (page < totalPages) {
          navigationButtons.push({ text: "Next ➡️", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.PAGINATE, { page: page + 1 }) });
      }
      
      if (navigationButtons.length > 0) keyboardRows.push(navigationButtons);
      
      keyboardRows.push([{ text: "📄 Ekspor Semua Hasil", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.EXPORT_VIEW) }]);
  
      if (backButton) {
          keyboardRows.push([backButton]);
      }
  
      return { text, keyboard: { inline_keyboard: keyboardRows } };
    }
    
    /**
     * Menggambar tampilan detail untuk satu Datastore.
     */
    function renderDsDetailView(state, config) {
        const { dsDetails } = state.data;
        const { originPk } = state.context;
  
        if (!dsDetails) {
            return { text: "❌ Detail untuk datastore tersebut tidak dapat ditemukan.", keyboard: null };
        }
  
        let message = `🗄️  <b>Detail Datastore</b>\n`;
        message += `------------------------------------\n`;
        message += `<b>Informasi Umum</b>\n`;
        message += `• 🏷️ <b>Nama:</b> <code>${escapeHtml(dsDetails.name)}</code>\n`;
        message += `• ☁️ <b>Cluster:</b> ${dsDetails.cluster || "N/A"}\n`;
        message += `• 🌍 <b>Environment:</b> ${dsDetails.environment || "N/A"}\n`;
        message += `• ⚙️ <b>Tipe:</b> ${dsDetails.type || "N/A"}\n`;
  
        const keyboardRows = [];
        if (originPk) {
            keyboardRows.push([{ text: "⬅️ Kembali", callback_data: CallbackHelper.build(KONSTANTA.ACTIONS.GO_BACK) }]);
        }
        
        return { pesan: message, keyboard: { inline_keyboard: keyboardRows } };
    }
  
    return {
      renderVmDetail: renderVmDetailView,
      renderPaginatedList: renderPaginatedListView,
      renderDsDetail: renderDsDetailView
    };
  
  })();
  