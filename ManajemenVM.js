// ===== FILE: ManajemenVM.gs =====

/**
 * [FINAL & BULLETPROOF] Mencari VM dengan strategi Cache-First dan pelaporan error yang sangat detail.
 * Fungsi ini akan melaporkan dengan presisi jika ada ketidakcocokan antara konfigurasi dan header sheet.
 */
function searchVmOnSheet(searchTerm, config) {
    let allDataWithHeaders = readLargeDataFromCache("vm_data");
  
    if (!allDataWithHeaders) {
      const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetName);
  
      if (!sheet || sheet.getLastRow() < 2) {
        throw new Error(`Sheet data VM "${sheetName}" tidak dapat ditemukan atau kosong.`);
      }
      allDataWithHeaders = sheet.getDataRange().getValues();
      saveLargeDataToCache("vm_data", allDataWithHeaders, 21600);
    }
  
    const headers = allDataWithHeaders.shift();
    const allData = allDataWithHeaders;
  
    const KUNCI = KONSTANTA.KUNCI_KONFIG;
  
    // --- PERBAIKAN UTAMA: VALIDASI DENGAN PESAN ERROR DETAIL ---
    const headerKeys = {
      pk: KUNCI.HEADER_VM_PK,
      name: KUNCI.HEADER_VM_NAME,
      ip: KUNCI.HEADER_VM_IP,
    };
  
    const indices = {};
    
    for (const key in headerKeys) {
      const configKey = headerKeys[key];
      const headerNameFromConfig = config[configKey];
  
      if (!headerNameFromConfig) {
        throw new Error(`Kunci konfigurasi '${configKey}' tidak ditemukan atau nilainya kosong di sheet "Konfigurasi".`);
      }
  
      const foundIndex = headers.indexOf(headerNameFromConfig);
      if (foundIndex === -1) {
        // Ini akan memberikan pesan error yang sangat spesifik
        throw new Error(
          `Header '${headerNameFromConfig}' (dari kunci '${configKey}') tidak dapat ditemukan di sheet "Data VM".\n\n` +
          `Pastikan tidak ada salah ketik atau spasi ekstra.\n` +
          `Header yang tersedia: [${headers.join(", ")}]`
        );
      }
      indices[key + 'Index'] = foundIndex;
    }
    
    const { pkIndex, nameIndex, ipIndex } = indices;
    // --- AKHIR VALIDASI ---
  
    let results = [];
  
    if (searchTerm.includes("|")) {
      const searchPks = new Set(searchTerm.split("|").map((pk) => normalizePrimaryKey(pk.trim())));
      results = allData.filter((row) => {
        const vmPk = normalizePrimaryKey(String(row[pkIndex] || "").trim());
        return searchPks.has(vmPk);
      });
    } else {
      const searchLower = searchTerm.toLowerCase().trim();
      const normalizedSearchTerm = normalizePrimaryKey(searchLower);
  
      results = allData.filter((row) => {
        const vmPk = normalizePrimaryKey(String(row[pkIndex] || "").trim()).toLowerCase();
        const vmName = String(row[nameIndex] || "").trim().toLowerCase();
        const vmIp = String(row[ipIndex] || "").trim().toLowerCase();
        return vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower);
      });
    }
  
    return { headers, results };
  }
  
  function searchVmsByCluster(clusterName, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const sheetName = config[K.SHEET_VM];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
  
    if (!sheet || sheet.getLastRow() < 2) {
      throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
    }
  
    // 1. Baca SELURUH data dari sheet dalam SATU KALI panggilan.
    const allDataWithHeaders = sheet.getDataRange().getValues();
    const headers = allDataWithHeaders.shift();
    const allData = allDataWithHeaders;
  
    const clusterHeaderName = config[K.HEADER_VM_CLUSTER];
    const clusterIndex = headers.indexOf(clusterHeaderName);
  
    if (clusterIndex === -1) {
      throw new Error(`Kolom header untuk cluster ("${clusterHeaderName}") tidak ditemukan di sheet "${sheetName}".`);
    }
  
    // 2. Lakukan penyaringan di dalam memori, yang sangat cepat.
    const results = allData.filter((row) => {
      // Memastikan perbandingan case-insensitive untuk hasil yang lebih andal
      return String(row[clusterIndex] || "").toLowerCase() === clusterName.toLowerCase();
    });
  
    return { headers, results };
  }
  
  function searchVmsByDatastore(datastoreName, config) {
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
  
    if (!sheet || sheet.getLastRow() < 2) {
      throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
    }
  
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const datastoreColumn = config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER];
    const datastoreIndex = headers.indexOf(datastoreColumn);
  
    if (datastoreIndex === -1) {
      throw new Error(`Kolom header untuk datastore ("${datastoreColumn}") tidak ditemukan di sheet "${sheetName}".`);
    }
  
    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  
    const results = allData.filter(
      (row) => String(row[datastoreIndex] || "").toLowerCase() === datastoreName.toLowerCase()
    );
  
    return { headers, results };
  }
  
  function getVmHistory(pk, config) {
    const allHistory = [];
    const K = KONSTANTA.KUNCI_KONFIG;
  
    const logSheetName = KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN;
    const archiveFolderId = config[K.FOLDER_ARSIP_LOG];
  
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(logSheetName);
    if (!sheet) throw new Error(`Sheet log dengan nama "${logSheetName}" tidak ditemukan.`);
  
    let headers = [];
    let pkIndex = -1;
    let vmNameIndex = -1;
    let lastKnownVmName = pk;
  
    if (sheet.getLastRow() > 0) {
      const data = sheet.getDataRange().getValues();
      headers = data.shift() || [];
      pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
      vmNameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
  
      if (pkIndex === -1 && data.length > 0) {
        throw new Error(`Kolom Primary Key ('${config[K.HEADER_VM_PK]}') tidak ditemukan di header sheet log.`);
      }
  
      if (pkIndex !== -1) {
        for (const row of data) {
          if (normalizePrimaryKey(row[pkIndex]) === normalizePrimaryKey(pk)) {
            allHistory.push(row);
          }
        }
      }
    }
  
    if (archiveFolderId && headers.length > 0 && pkIndex !== -1) {
      try {
        const archiveFolder = DriveApp.getFolderById(archiveFolderId);
        const files = archiveFolder.getFilesByName("archive_log_index.json");
  
        if (files.hasNext()) {
          const indexFile = files.next();
          const indexData = JSON.parse(indexFile.getBlob().getDataAsString());
  
          for (const indexEntry of indexData) {
            const archiveFiles = archiveFolder.getFilesByName(indexEntry.fileName);
            if (archiveFiles.hasNext()) {
              const file = archiveFiles.next();
              const archivedRows = JSON.parse(file.getBlob().getDataAsString());
              if (Array.isArray(archivedRows)) {
                for (const rowObj of archivedRows) {
                  if (
                    rowObj[config[K.HEADER_VM_PK]] &&
                    normalizePrimaryKey(rowObj[config[K.HEADER_VM_PK]]) === normalizePrimaryKey(pk)
                  ) {
                    const rowArray = headers.map((header) => rowObj[header] || "");
                    allHistory.push(rowArray);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`Gagal memproses arsip log: ${e.message}`);
      }
    }
  
    const timestampIndex = headers.indexOf(config[K.HEADER_LOG_TIMESTAMP]);
    if (timestampIndex !== -1 && allHistory.length > 0) {
      allHistory.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));
      if (vmNameIndex !== -1 && allHistory[0][vmNameIndex]) {
        lastKnownVmName = allHistory[0][vmNameIndex];
      }
    }
  
    return { history: allHistory, headers: headers, vmName: lastKnownVmName };
  }
  
  function analyzeVmProfile(history, headers, config) {
      if (!history || history.length === 0) {
        return "";
      }
    
      const K = KONSTANTA.KUNCI_KONFIG;
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    
      const actionIndex = headers.indexOf(config[K.HEADER_LOG_ACTION]);
      const detailIndex = headers.indexOf(config[K.HEADER_LOG_DETAIL]);
      const timestampIndex = headers.indexOf(config[K.HEADER_LOG_TIMESTAMP]);
    
      let modificationCount = 0;
      let recentModificationCount = 0;
      const modifiedColumns = {};
    
      history.forEach((log) => {
        const action = log[actionIndex];
        const timestamp = new Date(log[timestampIndex]);
    
        if (action === "MODIFIKASI") {
          modificationCount++;
          if (timestamp > ninetyDaysAgo) {
            recentModificationCount++;
          }
    
          const detail = log[detailIndex] || "";
          const columnNameMatch = detail.match(/'([^']+)'/);
          if (columnNameMatch) {
            const columnName = columnNameMatch[1];
            modifiedColumns[columnName] = (modifiedColumns[columnName] || 0) + 1;
          }
        }
      });
    
      let mostModifiedColumn = null;
      let maxMods = 0;
      for (const col in modifiedColumns) {
        if (modifiedColumns[col] > maxMods) {
          maxMods = modifiedColumns[col];
          mostModifiedColumn = col;
        }
      }
    
      let profileMessage = "<b>Analisis Profil VM:</b>\n";
      profileMessage += `• <b>Frekuensi Perubahan:</b> Total <code>${modificationCount}</code> modifikasi tercatat.\n`;
      if (modificationCount > 0) {
        profileMessage += `  └ <code>${recentModificationCount}</code> di antaranya terjadi dalam 90 hari terakhir.\n`;
      }
    
      if (mostModifiedColumn) {
        profileMessage += `• <b>Stabilitas Konfigurasi:</b> Kolom '<code>${mostModifiedColumn}</code>' adalah yang paling sering diubah (${maxMods} kali).\n`;
      } else {
        profileMessage += `• <b>Stabilitas Konfigurasi:</b> Konfigurasi terpantau stabil.\n`;
      }
    
      return profileMessage + "\n";
  }
  
  /**
   * [REFACTOR FINAL v5.2] Memformat detail VM.
   * Menambahkan validasi dan pengambilan data untuk Host dan Tanggal Setup.
   */
  function formatVmDetail(row, headers, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const requiredHeaderKeys = [
      K.HEADER_VM_PK, K.HEADER_VM_NAME, K.HEADER_VM_IP, K.HEADER_VM_STATE, K.HEADER_VM_UPTIME,
      K.HEADER_VM_CPU, K.HEADER_VM_MEMORY, K.HEADER_VM_PROV_GB, K.HEADER_VM_CLUSTER,
      K.VM_DS_COLUMN_HEADER, K.HEADER_VM_KRITIKALITAS, K.HEADER_VM_KELOMPOK_APP, K.HEADER_VM_DEV_OPS,
      K.HEADER_VM_GUEST_OS, K.HEADER_VM_VCENTER, K.HEADER_VM_NO_TIKET, K.HEADER_VM_HOSTS,
      K.HEADER_VM_TANGGAL_SETUP, // <-- Penambahan baru
    ];
    const indices = {};
    for (const headerKey of requiredHeaderKeys) {
      const headerName = config[headerKey];
      // Menjadikan No Tiket, Host, dan Tanggal Setup sebagai opsional
      const isOptional = [K.HEADER_VM_NO_TIKET, K.HEADER_VM_HOSTS, K.HEADER_VM_TANGGAL_SETUP].includes(headerKey);
      
      if (!headerName && !isOptional) { throw new Error(`Kunci konfigurasi '${headerKey}' tidak ditemukan.`); }
      const index = headers.indexOf(headerName);
      if (index === -1 && !isOptional) { throw new Error(`Header '${headerName}' (dari kunci '${headerKey}') tidak ditemukan di sheet "Data VM".`); }
      indices[headerKey] = index;
    }
  
    const vmData = {
        row: row,
        indices: indices,
        config: config,
        normalizedPk: normalizePrimaryKey(row[indices[K.HEADER_VM_PK]]),
        vmName: row[indices[K.HEADER_VM_NAME]],
        clusterName: row[indices[K.HEADER_VM_CLUSTER]],
        datastoreName: row[indices[K.VM_DS_COLUMN_HEADER]],
        hostName: row[indices[K.HEADER_VM_HOSTS]]
    };
  
    const vmNote = getVmNote(vmData.normalizedPk, config);
  
    let pesan = "🖥️  <b>Detail Virtual Machine</b>\n\n";
    pesan += _buildGeneralInfoSection(vmData);
    pesan += _buildResourceSection(vmData);
    pesan += _buildManagementSection(vmData);
    pesan += KONSTANTA.UI_STRINGS.SEPARATOR;
    pesan += _buildTicketSection(vmData);
    pesan += KONSTANTA.UI_STRINGS.SEPARATOR;
    pesan += _buildNoteSection(vmNote);
  
    const keyboard = _buildVmDetailKeyboard(vmData, vmNote);
    
    return { pesan, keyboard };
  }
  
  
  // --- FUNGSI-FUNGSI PEMBANTU BARU ---
  
  function _addDetail(value, icon, label, isCode = false) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        const formattedValue = isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
        return `•  ${icon} <b>${label}:</b> ${formattedValue}\n`;
      }
      return "";
  }
  
  function _buildGeneralInfoSection(vmData) {
      const { row, indices, config, normalizedPk, vmName } = vmData;
      const K = KONSTANTA.KUNCI_KONFIG;
      let section = "<b>Informasi Umum</b>\n";
      section += _addDetail(vmName, "🏷️", "Nama VM", true);
      section += _addDetail(normalizedPk, "🔑", "Primary Key", true);
      section += _addDetail(row[indices[K.HEADER_VM_IP]], "🌐", "IP Address", true);
      const stateValue = row[indices[K.HEADER_VM_STATE]] || "";
      const stateIcon = stateValue.toLowerCase().includes("on") ? "🟢" : "🔴";
      section += _addDetail(stateValue, stateIcon, "Status");
      section += _addDetail(`${row[indices[K.HEADER_VM_UPTIME]]} hari`, "⏳", "Uptime");
      return section;
  }
  
  function _buildResourceSection(vmData) {
      const { row, indices, config, clusterName, datastoreName, hostName } = vmData;
      const K = KONSTANTA.KUNCI_KONFIG;
      let section = "\n<b>Sumber Daya & Kapasitas</b>\n";
      section += _addDetail(`${row[indices[K.HEADER_VM_CPU]]} vCPU`, "⚙️", "CPU");
      section += _addDetail(`${row[indices[K.HEADER_VM_MEMORY]]} GB`, "🧠", "Memory");
      section += _addDetail(`${row[indices[K.HEADER_VM_PROV_GB]]} GB`, "💽", "Provisioned");
      section += _addDetail(clusterName, "☁️", "Cluster");
      section += _addDetail(hostName, "🖥️", "Host");
      section += _addDetail(datastoreName, "🗄️", "Datastore");
      return section;
  }
  
  function _buildManagementSection(vmData) {
      const { row, indices, config, datastoreName } = vmData;
      const K = KONSTANTA.KUNCI_KONFIG;
      let section = "\n<b>Konfigurasi & Manajemen</b>\n";
      const environment = getEnvironmentFromDsName(datastoreName || "", config[K.MAP_ENV]) || "N/A";
      section += _addDetail(environment, "🌍", "Environment");
      section += _addDetail(row[indices[K.HEADER_VM_KRITIKALITAS]], "🔥", "Kritikalitas BIA");
      section += _addDetail(row[indices[K.HEADER_VM_KELOMPOK_APP]], "📦", "Aplikasi BIA");
      section += _addDetail(row[indices[K.HEADER_VM_DEV_OPS]], "👥", "DEV/OPS");
      section += _addDetail(row[indices[K.HEADER_VM_GUEST_OS]], "🐧", "Guest OS");
      section += _addDetail(row[indices[K.HEADER_VM_VCENTER]], "🏢", "vCenter");
      return section;
  }
  
  function _buildTicketSection(vmData) {
      const { row, indices, config, vmName } = vmData;
      const K = KONSTANTA.KUNCI_KONFIG;
  
      let section = `🎫  <b>Tiket Provisioning:</b>\n`;
      const noTiketProvisioning = indices[K.HEADER_VM_NO_TIKET] !== -1 ? row[indices[K.HEADER_VM_NO_TIKET]] : "";
      section += noTiketProvisioning ? `   - <code>${escapeHtml(noTiketProvisioning)}</code>\n` : `   - <i>Tidak ada nomor tiket.</i>\n`;
  
      let tanggalSetup = "";
      // Menggunakan kunci konstanta baru yang telah Anda tambahkan
      const tanggalSetupIndex = indices[K.HEADER_VM_TANGGAL_SETUP];
      if (tanggalSetupIndex > -1) {
          tanggalSetup = String(row[tanggalSetupIndex] || "").trim();
      }
      
      section += `\n🗓️  <b>Tanggal Setup:</b>\n`;
      // Logika untuk menangani data yang bervariasi
      if (tanggalSetup && tanggalSetup.toLowerCase() !== "data tidak ditemukan" && tanggalSetup.toLowerCase() !== "kosong") {
          const formattedDate = new Date(tanggalSetup).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
          const relativeTime = formatRelativeTime(tanggalSetup); // Memanggil helper dari Utilitas.js
          section += `   - ${escapeHtml(formattedDate)} <i>${relativeTime}</i>\n`;
      } else {
          section += `   - <i>Tidak ada data.</i>\n`;
      }
      
      section += `\n🎟️  <b>Tiket CPR Utilisasi (Aktif):</b>\n`;
      const activeTickets = findActiveTicketsByVmName(vmName, config);
      if (activeTickets.length > 0) {
          activeTickets.forEach(ticket => {
              section += `   - <code>${escapeHtml(ticket.id)}</code>: ${escapeHtml(ticket.name)} (${escapeHtml(ticket.status)})\n`;
          });
      } else {
          section += `   - <i>Tidak ada tiket utilisasi aktif ditemukan.</i>`;
      }
      return section;
  }
  
  function _buildNoteSection(vmNote) {
      let section = `\n📝  <b>Catatan untuk VM ini:</b>\n`;
      if (vmNote) {
          const noteText = vmNote["Isi Catatan"] || "<i>(Catatan kosong)</i>";
          const updatedBy = vmNote["Nama User Update"] || "tidak diketahui";
          const updatedAt = vmNote["Timestamp Update"] ? new Date(vmNote["Timestamp Update"]).toLocaleString("id-ID") : "tidak diketahui";
          section += `<i>${escapeHtml(noteText)}</i>\n`;
          section += `_Terakhir diperbarui oleh: ${escapeHtml(updatedBy)} pada ${updatedAt}_\n`;
      } else {
          section += `_Tidak ada catatan untuk VM ini._\n`;
      }
      return section;
  }
  
  function _buildVmDetailKeyboard(vmData, vmNote) {
      const { config, normalizedPk, clusterName, datastoreName } = vmData;
      const keyboardRows = [];
      const firstRowButtons = [];
      
      const historySessionId = createCallbackSession({ pk: normalizedPk, page: 1 }, config);
      firstRowButtons.push({ text: "📜 Riwayat VM", callback_data: `history_machine:show:${historySessionId}` });
  
      const addNoteSessionId = createCallbackSession({ pk: normalizedPk }, config);
      firstRowButtons.push({ text: `✏️ ${vmNote ? "Edit" : "Tambah"} Catatan`, callback_data: `note_machine:prompt_add:${addNoteSessionId}` });
      
      if (vmNote) {
          const deleteNoteSessionId = createCallbackSession({ pk: normalizedPk }, config);
          firstRowButtons.push({ text: "🗑️ Hapus Catatan", callback_data: `note_machine:prompt_delete:${deleteNoteSessionId}` });
      }
      keyboardRows.push(firstRowButtons);
  
      const secondRowButtons = [];
      if (clusterName) {
          const clusterSessionId = createCallbackSession({ listType: "cluster", itemName: clusterName, originPk: normalizedPk, page: 1 }, config);
          secondRowButtons.push({ text: `⚙️ VM di Cluster`, callback_data: `search_machine:show_list:${clusterSessionId}` });
      }
      if (datastoreName) {
          const datastoreSessionId = createCallbackSession({ listType: "datastore", itemName: datastoreName, originPk: normalizedPk, page: 1 }, config);
          secondRowButtons.push({ text: `🗄️ Detail DS`, callback_data: `search_machine:show_list:${datastoreSessionId}` });
      }
      if (secondRowButtons.length > 0) {
          keyboardRows.push(secondRowButtons);
      }
  
      return { inline_keyboard: keyboardRows };
  }
  
  function formatHistoryEntry(entry, headers, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    let formattedText = "";
  
    const timestamp = new Date(entry[headers.indexOf(config[K.HEADER_LOG_TIMESTAMP])]).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    const action = entry[headers.indexOf(config[K.HEADER_LOG_ACTION])];
    const oldValue = entry[headers.indexOf(config[K.HEADER_LOG_OLD_VAL])];
    const newValue = entry[headers.indexOf(config[K.HEADER_LOG_NEW_VAL])];
    const detail = entry[headers.indexOf(config[K.HEADER_LOG_DETAIL])];
  
    formattedText += `<b>🗓️ ${escapeHtml(timestamp)}</b>\n`;
    formattedText += `<b>Aksi:</b> ${escapeHtml(action)}\n`;
    if (action === "MODIFIKASI") {
      const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
      formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
      formattedText += `   - <code>${escapeHtml(oldValue || "Kosong")}</code> ➔ <code>${escapeHtml(
        newValue || "Kosong"
      )}</code>\n\n`;
    } else {
      formattedText += `<b>Detail:</b> ${escapeHtml(detail)}\n\n`;
    }
    return formattedText;
  }
  