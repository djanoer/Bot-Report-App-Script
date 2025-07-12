// ===== FILE: ManajemenData.gs =====

/**
 * [MODIFIKASI FINAL v3.4.0] Menjadi pusat untuk semua pekerjaan harian.
 * Kini terintegrasi dengan sistem caching (invalidasi dan cache warming).
 */
function syncDanBuatLaporanHarian(showUiAlert = true, triggerSource = "TIDAK DIKETAHUI", config = null) {
  const activeConfig = config || bacaKonfigurasi();
  const lock = LockService.getScriptLock();
  const lockAcquired = lock.tryLock(KONSTANTA.LIMIT.LOCK_TIMEOUT_MS); 

  if (!lockAcquired) {
    console.log("Proses sinkronisasi sudah berjalan, permintaan saat ini dibatalkan.");
    return;
  }
  
  let statusMessageId = null;
  try {
    const startTime = new Date();
    const timestamp = startTime.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    let pesanAwal = `<b>Permintaan diterima pada pukul ${timestamp}</b>\n\n⏳ Memulai sinkronisasi penuh & pembuatan laporan operasional...`;
    
    const sentMessage = kirimPesanTelegram(pesanAwal, activeConfig, 'HTML');
    if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
    }

    const KUNCI = KONSTANTA.KUNCI_KONFIG;
    const sumberId = activeConfig[KUNCI.ID_SUMBER];
    const sheetVmName = activeConfig[KUNCI.SHEET_VM];
    const sheetDsName = activeConfig[KUNCI.SHEET_DS];

    console.log("Memulai sinkronisasi dan pemeriksaan perubahan VM...");
    salinDataSheet(sheetVmName, sumberId, activeConfig);

    try {
      console.log("Memulai proses Cache Warming untuk data VM...");
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(sheetVmName);
      if (sheet && sheet.getLastRow() > 1) {
        const vmDataWithHeaders = sheet.getDataRange().getValues(); 
        saveLargeDataToCache('vm_data', vmDataWithHeaders, 21600);
      } else {
        console.warn("Cache Warming dilewati: Sheet VM tidak ditemukan atau kosong.");
      }
    } catch(e) {
      console.error(`Gagal melakukan cache warming untuk data VM. Error: ${e.message}`);
    }

    try {
      const kolomVmUntukDipantau = activeConfig[KUNCI.KOLOM_PANTAU] || [];
      const columnsToTrackVm = kolomVmUntukDipantau.map(namaKolom => ({ nama: namaKolom }));
      if (columnsToTrackVm.length > 0) {
        const primaryKeyHeader = activeConfig[KUNCI.HEADER_VM_PK];
        processDataChanges(activeConfig, sheetVmName, KONSTANTA.NAMA_FILE.ARSIP_VM, primaryKeyHeader, columnsToTrackVm, KONSTANTA.NAMA_ENTITAS.VM);
      }
    } catch(e) {
      console.error(`Gagal Menjalankan Pemeriksaan Perubahan VM. Penyebab: ${e.message}`);
    }

    if (sheetDsName) {
      console.log("Memulai sinkronisasi dan pemeriksaan perubahan Datastore...");
      salinDataSheet(sheetDsName, sumberId, activeConfig);
      try {
        const kolomDsUntukDipantau = activeConfig[KUNCI.KOLOM_PANTAU_DS] || [];
        const columnsToTrackDs = kolomDsUntukDipantau.map(namaKolom => ({ nama: namaKolom }));
        if (columnsToTrackDs.length > 0) {
          processDataChanges(activeConfig, sheetDsName, KONSTANTA.NAMA_FILE.ARSIP_DS, activeConfig[KUNCI.DS_NAME_HEADER], columnsToTrackDs, KONSTANTA.NAMA_ENTITAS.DATASTORE);
        }
      } catch(e) {
        console.error(`Gagal Menjalankan Pemeriksaan Perubahan Datastore. Penyebab: ${e.message}`);
      }
    }
    
    const pesanLaporanOperasional = buatLaporanHarianVM(activeConfig);
    kirimPesanTelegram(pesanLaporanOperasional, activeConfig, 'HTML');
    
    const pesanKonfirmasi = `<b>✅ Proses Selesai</b>\n\nLaporan operasional telah dikirimkan.`;
    if (statusMessageId) {
        editMessageText(pesanKonfirmasi, null, activeConfig.TELEGRAM_CHAT_ID, statusMessageId, activeConfig);
    }

  } catch (e) {
    handleCentralizedError(e, "syncDanBuatLaporanHarian", activeConfig);
    const pesanError = `<b>❌ Proses Gagal</b>\n\nTerjadi kesalahan kritis saat menjalankan sinkronisasi.`;
    if (statusMessageId) {
        editMessageText(pesanError, null, activeConfig.TELEGRAM_CHAT_ID, statusMessageId, activeConfig);
    }
  } finally {
    lock.releaseLock();
    console.log("Proses selesai dan kunci dilepaskan.");
  }
}

/**
 * Fungsi untuk menjalankan sinkronisasi data tiket secara berkala.
 * Fungsi ini dimaksudkan untuk dipanggil oleh pemicu waktu (trigger)
 * atau saat perintah /cektiket dijalankan.
 * [DIPERBARUI] Menggunakan nama sheet sumber sebagai nama sheet tujuan secara otomatis.
 */
function syncTiketDataForTrigger() {
  console.log("Memulai sinkronisasi data tiket...");
  try {
    const config = bacaKonfigurasi();
    const sumberId = config[KONSTANTA.KUNCI_KONFIG.TIKET_SPREADSHEET_ID];
    const namaSheet = config[KONSTANTA.KUNCI_KONFIG.NAMA_SHEET_TIKET];

    if (!sumberId || !namaSheet) {
      // Melemparkan error agar bisa ditangkap di level yang lebih tinggi
      throw new Error("Konfigurasi TIKET_SPREADSHEET_ID atau NAMA_SHEET_TIKET tidak lengkap.");
    }
    
    // salinDataSheet sudah melemparkan error jika gagal, jadi kita tidak perlu mengulanginya.
    salinDataSheet(namaSheet, sumberId);
    
    console.log("Sinkronisasi data tiket berhasil diselesaikan.");
    
  } catch (e) {
    console.error(`Gagal menjalankan sinkronisasi tiket: ${e.message}`);
    // Melemparkan error kembali agar bisa ditangani oleh fungsi pemanggil (/cektiket)
    throw new Error(`Gagal sinkronisasi data tiket. Penyebab: ${e.message}`);
  }
}

/**
 * Helper untuk menyalin konten sebuah sheet dari spreadsheet sumber ke tujuan.
 */
function salinDataSheet(namaSheet, sumberId) {
  try {
    if (!sumberId) throw new Error("ID Spreadsheet Sumber belum diisi di sheet Konfigurasi.");
    if (!namaSheet) {
      console.warn("Nama sheet untuk disalin tidak disediakan. Proses dilewati.");
      return;
    }
    const sumberSpreadsheet = SpreadsheetApp.openById(sumberId);
    const sumberSheet = sumberSpreadsheet.getSheetByName(namaSheet);
    if (!sumberSheet) throw new Error(`Sheet "${namaSheet}" tidak ditemukan di file SUMBER.`);
    
    const dataSumber = sumberSheet.getDataRange().getValues();
    if (dataSumber.length === 0) {
        console.warn(`Sheet sumber "${namaSheet}" kosong. Tidak ada data untuk diimpor.`);
        return;
    };

    const tujuanSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let tujuanSheet = tujuanSpreadsheet.getSheetByName(namaSheet);
    if (!tujuanSheet) {
      tujuanSheet = tujuanSpreadsheet.insertSheet(namaSheet);
      console.log(`Sheet tujuan "${namaSheet}" tidak ditemukan, sheet baru telah dibuat.`);
    }

    tujuanSheet.clearContents();
    tujuanSheet.getRange(1, 1, dataSumber.length, dataSumber[0].length).setValues(dataSumber);
    console.log(`Data untuk sheet "${namaSheet}" berhasil disalin.`);
  } catch (e) {
    throw new Error(`Gagal memproses impor sheet "${namaSheet}". Penyebab: ${e.message}`);
  }
}

/**
 * [FINAL & OPTIMIZED v3.4.0] Mencari VM dengan strategi Cache-First menggunakan chunking.
 * Fungsi ini secara otomatis melakukan fallback ke Spreadsheet jika cache tidak ada atau rusak,
 * dan langsung memanaskan kembali cache tersebut.
 */
function searchVmOnSheet(searchTerm, config) {
  let allDataWithHeaders = readLargeDataFromCache('vm_data');
  
  if (!allDataWithHeaders) {
    console.log("Cache miss atau rusak. Membaca data langsung dari Spreadsheet...");
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet || sheet.getLastRow() < 2) {
      throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
    }
    allDataWithHeaders = sheet.getDataRange().getValues();
    console.log("Melakukan cache warming ulang setelah cache miss...");
    saveLargeDataToCache('vm_data', allDataWithHeaders, 21600); 
  }
  
  const headers = allDataWithHeaders.shift();
  const allData = allDataWithHeaders;

  const KUNCI = KONSTANTA.KUNCI_KONFIG;
  const pkIndex = headers.indexOf(config[KUNCI.HEADER_VM_PK]);
  const nameIndex = headers.indexOf(config[KUNCI.HEADER_VM_NAME]);
  const ipIndex = headers.indexOf(config[KUNCI.HEADER_VM_IP]);

  if (pkIndex === -1 || nameIndex === -1 || ipIndex === -1) {
    throw new Error(`Satu atau lebih kolom header penting (PK, Nama, IP) tidak ditemukan atau salah dikonfigurasi.`);
  }

  let results = [];

  if (searchTerm.includes('|')) {
    const searchPks = new Set(searchTerm.split('|').map(pk => normalizePrimaryKey(pk.trim())));
    results = allData.filter(row => {
      const vmPk = normalizePrimaryKey(String(row[pkIndex] || '').trim());
      return searchPks.has(vmPk);
    });
  } else {
    const searchLower = searchTerm.toLowerCase().trim();
    const normalizedSearchTerm = normalizePrimaryKey(searchLower);
    
    results = allData.filter(row => {
      const vmPk = normalizePrimaryKey(String(row[pkIndex] || '').trim()).toLowerCase();
      const vmName = String(row[nameIndex] || '').trim().toLowerCase();
      const vmIp = String(row[ipIndex] || '').trim().toLowerCase();
      
      return vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower);
    });
  }

  return { headers, results };
}

/**
 * [FUNGSI BARU v3.3.0 - SETELAH PERBAIKAN] Mengambil satu catatan spesifik untuk sebuah VM.
 * @param {string} vmPrimaryKey - Primary Key dari VM yang catatannya akan dicari.
 * @param {object} config - Objek konfigurasi bot (meskipun tidak digunakan langsung di sini,
 * baik untuk konsistensi antarmuka).
 * @returns {object|null} Objek berisi detail catatan jika ditemukan, atau null jika tidak ada.
 */
function getVmNote(vmPrimaryKey, config) {
  // --- [PERBAIKAN UTAMA DI SINI] ---
  // Kita langsung menggunakan nama sheet dari konstanta, bukan dari objek config.
  const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
  
  if (!sheetName) {
    console.warn("Fitur catatan dilewati: Konstanta untuk nama sheet catatan tidak ditemukan.");
    return null;
  }
  // --- [AKHIR PERBAIKAN UTAMA] ---

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    console.warn(`Fitur catatan dilewati: Sheet "${sheetName}" tidak ditemukan.`);
    return null;
  }

  if (sheet.getLastRow() <= 1) {
    return null; // Sheet ada tapi kosong
  }

  const data = sheet.getDataRange().getValues();
  const headers = data.shift();

  const pkIndex = headers.indexOf('VM Primary Key');
  if (pkIndex === -1) {
    console.error("Struktur sheet Catatan VM tidak valid: Header 'VM Primary Key' tidak ditemukan.");
    return null;
  }

  const noteRow = data.find(row => row[pkIndex] === vmPrimaryKey);

  if (noteRow) {
    const noteData = {};
    headers.forEach((header, index) => {
      noteData[header] = noteRow[index];
    });
    return noteData;
  }

  return null;
}

/**
 * [FUNGSI BARU v3.3.0] Menyimpan (Create) atau memperbarui (Update) catatan untuk sebuah VM.
 * @param {string} vmPrimaryKey - Primary Key dari VM.
 * @param {string} noteText - Teks catatan yang baru.
 * @param {object} userData - Objek data pengguna yang sedang berinteraksi.
 * @returns {boolean} True jika berhasil, false jika gagal.
 */
function saveOrUpdateVmNote(vmPrimaryKey, noteText, userData) {
  const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    console.error(`Sheet "${sheetName}" tidak ditemukan saat akan menyimpan catatan.`);
    return false;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const pkIndex = headers.indexOf('VM Primary Key');

  // Cari baris yang ada untuk di-update
  let rowIndexToUpdate = -1;
  for (let i = 1; i < data.length; i++) {
    if (data[i][pkIndex] === vmPrimaryKey) {
      rowIndexToUpdate = i + 1; // getRange menggunakan indeks berbasis 1
      break;
    }
  }

  const timestamp = new Date();
  const userName = userData.firstName || 'Pengguna';

  try {
    if (rowIndexToUpdate > -1) {
      // --- UPDATE ---
      // Urutan kolom: Isi Catatan, Timestamp Update, Nama User Update
      sheet.getRange(rowIndexToUpdate, pkIndex + 2, 1, 3).setValues([[noteText, timestamp, userName]]);
      console.log(`Catatan untuk VM ${vmPrimaryKey} berhasil diperbarui oleh ${userName}.`);
    } else {
      // --- CREATE ---
      // Urutan kolom: VM Primary Key, Isi Catatan, Timestamp Update, Nama User Update
      sheet.appendRow([vmPrimaryKey, noteText, timestamp, userName]);
      console.log(`Catatan baru untuk VM ${vmPrimaryKey} berhasil dibuat oleh ${userName}.`);
    }
    return true;
  } catch (e) {
    console.error(`Gagal menyimpan catatan untuk VM ${vmPrimaryKey}. Error: ${e.message}`);
    return false;
  }
}

/**
 * [FUNGSI BARU v3.3.0] Menghapus (hard delete) catatan untuk sebuah VM.
 * @param {string} vmPrimaryKey - Primary Key dari VM yang catatannya akan dihapus.
 * @returns {boolean} True jika berhasil, false jika gagal.
 */
function deleteVmNote(vmPrimaryKey) {
  const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() <= 1) {
    console.warn(`Proses hapus dibatalkan: Sheet "${sheetName}" tidak ada atau kosong.`);
    return false;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const pkIndex = headers.indexOf('VM Primary Key');

  // Cari nomor baris yang akan dihapus
  for (let i = 1; i < data.length; i++) {
    if (data[i][pkIndex] === vmPrimaryKey) {
      const rowIndexToDelete = i + 1; // getRange menggunakan indeks berbasis 1
      try {
        sheet.deleteRow(rowIndexToDelete);
        console.log(`Catatan untuk VM ${vmPrimaryKey} berhasil dihapus.`);
        return true;
      } catch (e) {
        console.error(`Gagal menghapus baris ${rowIndexToDelete} untuk VM ${vmPrimaryKey}. Error: ${e.message}`);
        return false;
      }
    }
  }

  console.warn(`Proses hapus gagal: Catatan untuk VM ${vmPrimaryKey} tidak ditemukan.`);
  return false; // Catatan tidak ditemukan
}

/**
 * [FINAL v1.2.4] Memformat detail VM menjadi pesan yang siap kirim.
 * Versi ini menyempurnakan tata letak untuk bagian tiket agar lebih rapi dan simetris.
 */
function formatVmDetail(row, headers, config) {
  const K = KONSTANTA.KUNCI_KONFIG;

  const requiredHeaders = [
    K.HEADER_VM_PK, K.HEADER_VM_NAME, K.HEADER_VM_IP, K.HEADER_VM_STATE,
    K.HEADER_VM_UPTIME, K.HEADER_VM_CPU, K.HEADER_VM_MEMORY, K.HEADER_VM_PROV_GB,
    K.HEADER_VM_CLUSTER, K.VM_DS_COLUMN_HEADER, K.HEADER_VM_KRITIKALITAS,
    K.HEADER_VM_KELOMPOK_APP, K.HEADER_VM_DEV_OPS, K.HEADER_VM_GUEST_OS,
    K.HEADER_VM_VCENTER, K.HEADER_VM_NO_TIKET
  ];
  
  const indices = {};
  for(const headerName of requiredHeaders) {
      indices[headerName] = headers.indexOf(config[headerName]);
      if(indices[headerName] === -1 && headerName !== K.HEADER_VM_NO_TIKET) {
          throw new Error(`Header untuk '${config[headerName]}' (didefinisikan oleh konstanta '${headerName}') tidak ditemukan.`);
      }
  }

  const normalizedPk = normalizePrimaryKey(row[indices[K.HEADER_VM_PK]]);
  const vmName = row[indices[K.HEADER_VM_NAME]];
  const clusterName = row[indices[K.HEADER_VM_CLUSTER]];
  const datastoreName = row[indices[K.VM_DS_COLUMN_HEADER]];
  const vmNote = getVmNote(normalizedPk, config);

  const addDetail = (value, icon, label, isCode = false) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const formattedValue = isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
      return `•  ${icon} <b>${label}:</b> ${formattedValue}\n`;
    }
    return '';
  };
  
  let pesan = "🖥️  <b>Detail Virtual Machine</b>\n\n";
  pesan += "<b>Informasi Umum</b>\n";
  pesan += addDetail(vmName, '🏷️', 'Nama VM', true);
  pesan += addDetail(normalizedPk, '🔑', 'Primary Key', true);
  pesan += addDetail(row[indices[K.HEADER_VM_IP]], '🌐', 'IP Address', true);
  const stateValue = row[indices[K.HEADER_VM_STATE]] || '';
  const stateIcon = stateValue.toLowerCase().includes('on') ? '🟢' : '🔴';
  pesan += addDetail(stateValue, stateIcon, 'Status');
  pesan += addDetail(`${row[indices[K.HEADER_VM_UPTIME]]} hari`, '⏳', 'Uptime');

  pesan += "\n<b>Sumber Daya & Kapasitas</b>\n";
  pesan += addDetail(`${row[indices[K.HEADER_VM_CPU]]} vCPU`, '⚙️', 'CPU');
  pesan += addDetail(`${row[indices[K.HEADER_VM_MEMORY]]} GB`, '🧠', 'Memory');
  pesan += addDetail(`${row[indices[K.HEADER_VM_PROV_GB]]} GB`, '💽', 'Provisioned');
  
  pesan += addDetail(clusterName, '☁️', 'Cluster');
  pesan += addDetail(datastoreName, '🗄️', 'Datastore');

  const environment = getEnvironmentFromDsName(datastoreName || '', config[K.MAP_ENV]) || 'N/A';
  
  pesan += "\n<b>Konfigurasi & Manajemen</b>\n";
  pesan += addDetail(environment, '🌍', 'Environment');
  pesan += addDetail(row[indices[K.HEADER_VM_KRITIKALITAS]], '🔥', 'Kritikalitas BIA');
  pesan += addDetail(row[indices[K.HEADER_VM_KELOMPOK_APP]], '📦', 'Aplikasi BIA');
  pesan += addDetail(row[indices[K.HEADER_VM_DEV_OPS]], '👥', 'DEV/OPS');
  pesan += addDetail(row[indices[K.HEADER_VM_GUEST_OS]], '🐧', 'Guest OS');
  pesan += addDetail(row[indices[K.HEADER_VM_VCENTER]], '🏢', 'vCenter');

  pesan += `\n--------------------------------------------------\n`;
  
  // Bagian Tiket Provisioning
  pesan += `🎫  <b>Tiket Provisioning:</b>\n`;
  const noTiketProvisioning = indices[K.HEADER_VM_NO_TIKET] !== -1 ? row[indices[K.HEADER_VM_NO_TIKET]] : '';
  if (noTiketProvisioning) {
      pesan += `   - <code>${escapeHtml(noTiketProvisioning)}</code>\n`;
  } else {
      pesan += `   - <i>Tidak ada nomor tiket provisioning yang tercatat.</i>\n`;
  }

  // Bagian Tiket Terkait (Aktif)
  pesan += `\n🎟️  <b>Tiket CPR Utilisasi (Aktif):</b>\n`;
  const activeTickets = findActiveTicketsByVmName(vmName, config);
  if (activeTickets.length > 0) {
      activeTickets.forEach(ticket => {
          pesan += `   - <code>${escapeHtml(ticket.id)}</code>: ${escapeHtml(ticket.name)} (${escapeHtml(ticket.status)})\n`;
      });
  } else {
      pesan += `   - <i>Tidak ada tiket utilisasi aktif yang ditemukan.</i>`;
  }
  
  pesan += `\n--------------------------------------------------\n`;

  pesan += `\n📝  <b>Catatan untuk VM ini:</b>\n`;
  if (vmNote) {
    const noteText = vmNote['Isi Catatan'] || '<i>(Catatan kosong)</i>';
    const updatedBy = vmNote['Nama User Update'] || 'tidak diketahui';
    const updatedAt = vmNote['Timestamp Update'] ? new Date(vmNote['Timestamp Update']).toLocaleString('id-ID') : 'tidak diketahui';
    pesan += `<i>${escapeHtml(noteText)}</i>\n`;
    pesan += `_Terakhir diperbarui oleh: ${escapeHtml(updatedBy)} pada ${updatedAt}_\n`;
  } else {
    pesan += `_Tidak ada catatan untuk VM ini._\n`;
  }

  const keyboardRows = [];
  const K_NOTE = KONSTANTA.CALLBACK_CATATAN;
  const K_CEKVM = KONSTANTA.CALLBACK_CEKVM;
  const K_HISTORY = KONSTANTA.CALLBACK_HISTORY;

  const historySessionId = createCallbackSession({ pk: normalizedPk });

  const firstRowButtons = [];
  firstRowButtons.push({ text: '📜 Riwayat VM', callback_data: `${K_HISTORY.PREFIX}${historySessionId}` });
  firstRowButtons.push({ text: `✏️ ${vmNote ? 'Edit' : 'Tambah'} Catatan`, callback_data: `${K_NOTE.EDIT_ADD}${normalizedPk}` });
  if (vmNote) {
    firstRowButtons.push({ text: '🗑️ Hapus Catatan', callback_data: `${K_NOTE.DELETE}${normalizedPk}` });
  }
  keyboardRows.push(firstRowButtons);

  const secondRowButtons = [];
  if (clusterName) {
    const clusterSessionId = createCallbackSession({ itemName: clusterName, originPk: normalizedPk });
    secondRowButtons.push({ text: `⚙️ VM di Cluster`, callback_data: `${K_CEKVM.CLUSTER_PREFIX}${clusterSessionId}` });
  }
  if (datastoreName) {
    const datastoreSessionId = createCallbackSession({ itemName: datastoreName, originPk: normalizedPk });
    secondRowButtons.push({ text: `🗄️ Detail DS`, callback_data: `${K_CEKVM.DATASTORE_PREFIX}${datastoreSessionId}` });
  }
  if (secondRowButtons.length > 0) {
    keyboardRows.push(secondRowButtons);
  }

  const keyboard = keyboardRows.length > 0 ? { inline_keyboard: keyboardRows } : null;
  return { pesan, keyboard };
}

/**
 * [FINAL & STABIL] Memformat detail datastore. Tombol "Lihat Daftar VM" membawa PK asal
 * dan ada tombol "Kembali" jika ada PK asal.
 */
function formatDatastoreDetail(details, originPk = null) {
  if (!details) {
    return { pesan: "❌ Detail untuk datastore tersebut tidak dapat ditemukan.", keyboard: null };
  }
  
  let message = `🗄️  <b>Detail Datastore</b>\n`;
  message += `------------------------------------\n`;
  message += `<b>Informasi Umum</b>\n`;
  message += `• 🏷️ <b>Nama:</b> <code>${escapeHtml(details.name)}</code>\n`;
  message += `• ☁️ <b>Cluster:</b> ${details.cluster || 'N/A'}\n`;
  message += `• 🌍 <b>Environment:</b> ${details.environment || 'N/A'}\n`;
  message += `• ⚙️ <b>Tipe:</b> ${details.type || 'N/A'}\n`;
  
  message += `\n<b>Status Kapasitas</b>\n`;
  message += `• 📦 <b>Kapasitas:</b> ${details.capacityGb.toFixed(2)} GB <i>(${details.capacityTb.toFixed(2)} TB)</i>\n`;
  message += `• 📥 <b>Terpakai (Provisioned):</b> ${details.provisionedGb.toFixed(2)} GB <i>(${details.provisionedTb.toFixed(2)} TB)</i>\n`;
  message += `• 📤 <b>Tersedia:</b> ${details.freeGb.toFixed(2)} GB <i>(${details.freeTb.toFixed(2)} TB)</i>\n`;
  
  const usage = details.usagePercent;
  const barLength = 12;
  const filledLength = Math.round((usage / 100) * barLength);
  const emptyLength = barLength - filledLength;
  const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
  
  message += `\n• 📊 <b>Alokasi Terpakai:</b> ${usage.toFixed(1)}% [ <code>${progressBar}</code> ]\n`;
  
  message += `\n<b>Beban Kerja (Workload)</b>\n`;
  message += `• 🖥️ <b>Jumlah VM:</b> ${details.vmCount} VM\n`;

  const keyboardRows = [];
  const FROM_PK_SUFFIX = originPk ? `${KONSTANTA.CALLBACK_CEKVM.ORIGIN_PK_MARKER}${originPk}` : '';
  
  if (details.vmCount > 0) {
    const actionButtons = [
        { text: `📄 Lihat Daftar VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_LIST_VMS_PREFIX}${details.name}${FROM_PK_SUFFIX}` },
        { text: `📥 Ekspor Daftar VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_EXPORT_PREFIX}${details.name}${FROM_PK_SUFFIX}` }
    ];
    keyboardRows.push(actionButtons);
  }

  if (originPk) {
    keyboardRows.push([{ text: `⬅️ Kembali ke Detail VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.BACK_TO_DETAIL_PREFIX}${originPk}` }]);
  }
  return { pesan: message, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * [REFACTORED v4.1.6 - CONTEXT-AWARE FIX] Menangani pencarian VM.
 * Fungsi ini sekarang secara benar menangani dua konteks: panggilan awal dari
 * perintah teks dan panggilan lanjutan dari callback, secara permanen memperbaiki bug 'undefined'.
 */
function handleVmSearchInteraction(update, config, userData) {
  const isCallback = !!update.callback_query;
  const userEvent = isCallback ? update.callback_query : update.message;

  try {
    if (userData) {
      userData.userId = userEvent.from.id;
      userData.firstName = userEvent.from.first_name;
    }

    let searchTerm;
    let page = 1;

    // Logika ini sekarang secara eksplisit membedakan sumber panggilan.
    if (isCallback) {
        // Jika ini adalah callback, kita bisa percaya sessionData ada karena sudah divalidasi oleh doPost.
        const sessionData = userEvent.sessionData;
        searchTerm = sessionData.searchTerm;
        page = sessionData.page || 1;
        
        if (userEvent.action === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
            answerCallbackQuery(userEvent.id, config, "Menambahkan ke antrean...");
            
            const jobData = { searchTerm, config, userData, chatId: userEvent.message.chat.id };
            const jobKey = `export_job_${userEvent.from.id}_${Date.now()}`;
            PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(jobData));
            
            kirimPesanTelegram(`✅ Permintaan ekspor Anda untuk "<b>${escapeHtml(searchTerm)}</b>" telah ditambahkan ke antrean.`, config, 'HTML', null, userEvent.message.chat.id);
            return; 
        }
    } else {
        // Jika ini bukan callback, berarti ini adalah panggilan pertama dari pesan teks.
        searchTerm = userEvent.text.split(' ').slice(1).join(' ');
        if (!searchTerm) {
            kirimPesanTelegram(`Gunakan format: <code>/cekvm [IP / Nama / PK]</code>`, config, 'HTML');
            return;
        }
    }

    const { headers, results } = searchVmOnSheet(searchTerm, config);
    if (results.length === 0) {
      const message = `❌ VM dengan kriteria "<b>${escapeHtml(searchTerm)}</b>" tidak ditemukan.`;
      isCallback ? editMessageText(message, null, userEvent.message.chat.id, userEvent.message.message_id, config) : kirimPesanTelegram(message, config, 'HTML');
      return;
    }

    if (results.length === 1 && !isCallback) {
        const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
        kirimPesanTelegram(`✅ Ditemukan 1 hasil untuk "<b>${escapeHtml(searchTerm)}</b>":\n\n${pesan}`, config, 'HTML', keyboard);
        return;
    }

    const formatVmEntry = (row) => {
      const K = KONSTANTA.KUNCI_KONFIG;
      const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
      const ipIndex = headers.indexOf(config[K.HEADER_VM_IP]);
      const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
      return `<b>${escapeHtml(row[nameIndex])}</b>\n   (<code>${escapeHtml(row[ipIndex])}</code> | <code>${escapeHtml(normalizePrimaryKey(row[pkIndex]))}</code>)`;
    };
    
    const K_PAGINATE = KONSTANTA.PAGINATION_ACTIONS;
    const callbackInfo = {
        navPrefix: `cekvm_${K_PAGINATE.NAVIGATE}_`,
        exportPrefix: `cekvm_${K_PAGINATE.EXPORT}_`,
        context: { searchTerm: searchTerm }
    };

    const { text, keyboard } = createPaginatedView({
      allItems: results,
      page: page,
      title: `Hasil Pencarian untuk "${escapeHtml(searchTerm)}"`,
      formatEntryCallback: formatVmEntry,
      callbackInfo: callbackInfo
    });

    if (isCallback) {
      if(userEvent.message.text !== text || JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(keyboard)) {
        editMessageText(text, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config);
      }
    } else {
      kirimPesanTelegram(text, config, 'HTML', keyboard, userEvent.chat.id);
    }
  } catch (err) {
    handleCentralizedError(err, "[handleVmSearchInteraction]", config);
  }
}

/**
 * [FINAL v1.2.10] Menangani interaksi untuk riwayat.
 * Versi ini menambahkan tombol "Kembali" pada pesan "Riwayat Tidak Ditemukan"
 * untuk meningkatkan pengalaman pengguna (UX).
 */
function handleHistoryInteraction(update, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;
  const isCallback = !!userEvent.id;
  
  try {
    if (userEvent.action === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
        answerCallbackQuery(userEvent.id, config, "Menambahkan ke antrean...");
        
        const jobData = { 
            jobType: 'history',
            context: sessionData,
            config: config, 
            userData: userData, 
            chatId: userEvent.message.chat.id 
        };
        const jobKey = `export_job_${userEvent.from.id}_${Date.now()}`;
        PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(jobData));
        
        const title = sessionData.pk ? `Riwayat untuk PK ${sessionData.pk}` : "Riwayat Hari Ini";
        kirimPesanTelegram(`✅ Permintaan ekspor Anda untuk "<b>${escapeHtml(title)}</b>" telah ditambahkan ke antrean.`, config, 'HTML', null, userEvent.message.chat.id);
        return;
    }

    const page = sessionData.page || 1;
    let logsToShow, logHeaders, title, headerContent;

    if (sessionData.pk) {
        const pk = sessionData.pk;
        const result = getVmHistory(pk, config);
        logsToShow = result.history;
        logHeaders = result.headers;
        title = `Riwayat Perubahan untuk ${escapeHtml(pk)}`;
        const profileAnalysis = analyzeVmProfile(logsToShow, logHeaders, config);
        headerContent = `<b>📜 Riwayat Perubahan untuk VM</b>\n` +
                          `<b>Nama:</b> ${escapeHtml(result.vmName)}\n` +
                          `<b>PK:</b> <code>${escapeHtml(pk)}</code>\n\n` +
                          `${profileAnalysis}`;
    } else {
        const todayStartDate = new Date();
        todayStartDate.setHours(0, 0, 0, 0);
        const result = getCombinedLogs(todayStartDate, config);
        logsToShow = result.data;
        logHeaders = result.headers;
        title = "Log Perubahan Hari Ini";
        headerContent = `<b>📜 Log Perubahan Hari Ini</b>\n<i>(Termasuk dari arsip jika relevan)</i>`;
    }

    if (logsToShow.length === 0) {
      let message;
      let keyboard = null;

      if (sessionData.pk) {
          message = `ℹ️ <b>Analisis Riwayat:</b>\nTidak ada aktivitas perubahan yang tercatat untuk VM dengan PK: <code>${escapeHtml(sessionData.pk)}</code>`;
          // Buat tombol kembali
          keyboard = {
              inline_keyboard: [[
                  { text: '⬅️ Kembali ke Detail VM', callback_data: `${KONSTANTA.CALLBACK_CEKVM.BACK_TO_DETAIL_PREFIX}${sessionData.pk}` }
              ]]
          };
      } else {
          message = `✅ Tidak ada aktivitas perubahan data yang tercatat hari ini.`;
      }
      
      // Edit pesan dengan teks baru DAN tombol kembali (jika ada)
      isCallback ? editMessageText(message, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config) : kirimPesanTelegram(message, config, 'HTML', keyboard, userEvent.chat.id);
      return;
    }

    const K = KONSTANTA.KUNCI_KONFIG;
    const headerIndices = {
        timestamp: logHeaders.indexOf(config[K.HEADER_LOG_TIMESTAMP]),
        action: logHeaders.indexOf(config[K.HEADER_LOG_ACTION]),
        oldValue: logHeaders.indexOf(config[K.HEADER_LOG_OLD_VAL]),
        newValue: logHeaders.indexOf(config[K.HEADER_LOG_NEW_VAL]),
        detail: logHeaders.indexOf(config[K.HEADER_LOG_DETAIL]),
        pk: logHeaders.indexOf(config[K.HEADER_VM_PK]),
        vmName: logHeaders.indexOf(config[K.HEADER_VM_NAME])
    };

    const formatHistoryEntry = (row) => {
        const timestamp = new Date(row[headerIndices.timestamp]).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Makassar' });
        const action = escapeHtml(row[headerIndices.action] || '');
        const detail = escapeHtml(row[headerIndices.detail] || '');
        
        const oldValueFormatted = escapeHtml(row[headerIndices.oldValue] || '(Kosong)');
        const newValueFormatted = escapeHtml(row[headerIndices.newValue] || '(Kosong)');

        let formattedText = `<b>🗓️ ${timestamp}</b> | <b>Aksi:</b> ${action}\n`;
        if (!sessionData.pk) {
            formattedText += `<b>VM:</b> ${escapeHtml(row[headerIndices.vmName] || row[headerIndices.pk])}\n`;
        }

        if (action === 'MODIFIKASI') {
            const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
            formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
            formattedText += `   - <code>${oldValueFormatted}</code> ➔ <code>${newValueFormatted}</code>\n`;
        } else {
            formattedText += `<b>Detail:</b> ${detail}\n`;
        }
        return formattedText;
    };

    const K_HISTORY = KONSTANTA.CALLBACK_HISTORY;
    const callbackInfo = {
        navPrefix: K_HISTORY.NAVIGATE_PREFIX,
        exportPrefix: K_HISTORY.EXPORT_PREFIX,
        context: sessionData.pk ? { pk: sessionData.pk } : { timeframe: 'today' }
    };

    const { text, keyboard } = createPaginatedView({
      allItems: logsToShow,
      page: page,
      title: title,
      headerContent: headerContent,
      formatEntryCallback: formatHistoryEntry,
      callbackInfo: callbackInfo
    });

    if (sessionData.pk && keyboard) {
      keyboard.inline_keyboard.push([{ text: '⬅️ Kembali ke Detail VM', callback_data: `${KONSTANTA.CALLBACK_CEKVM.BACK_TO_DETAIL_PREFIX}${sessionData.pk}` }]);
    }
    
    if (isCallback) {
        if (userEvent.message.text !== text || JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(keyboard)) {
            editMessageText(text, keyboard, userEvent.message.chat.id, userEvent.message.message_id, config);
        }
    } else {
        kirimPesanTelegram(text, config, 'HTML', keyboard, userEvent.chat.id);
    }
  } catch (err) {
    const context = sessionData.pk ? `PK: ${sessionData.pk}` : 'Today';
    handleCentralizedError(err, `[handleHistoryInteraction for ${context}]`, config);
  }
}

/**
 * [MODIFIKASI v2.5 - FIX] Mengekspor data ke Google Sheet dengan logika pengurutan
 * otomatis berdasarkan kolom "Kritikalitas", kini dengan pembersihan spasi (trim).
 */
function exportResultsToSheet(headers, dataRows, title, config, userData, highlightColumnName = null) {
  const folderId = config[KONSTANTA.KUNCI_KONFIG.FOLDER_EKSPOR];
  if (!folderId) {
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor: Konfigurasi FOLDER_ID_HASIL_EKSPOR tidak ditemukan.`, config);
    return;
  }
  
  if (userData && !userData.email) {
    kirimPesanTelegram(`⚠️ Gagal membagikan file: Email untuk pengguna dengan ID ${userData.userId || 'tidak dikenal'} tidak ditemukan di sheet 'Hak Akses'.`, config);
    return;
  }

  try {
    const critHeaderName = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_KRITIKALITAS];
    const critIndex = headers.indexOf(critHeaderName);
    
    if (critIndex !== -1 && dataRows.length > 0) {
      console.log(`Kolom '${critHeaderName}' ditemukan. Melakukan pengurutan otomatis...`);
      const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
      
      dataRows.sort((a, b) => {
        // --- AWAL PERBAIKAN: Menambahkan .trim() ---
        const critA = String(a[critIndex] || '').toUpperCase().trim();
        const critB = String(b[critIndex] || '').toUpperCase().trim();
        // --- AKHIR PERBAIKAN ---
        
        const scoreA = skorKritikalitas[critA] || -1;
        const scoreB = skorKritikalitas[critB] || -1;
        
        return scoreB - scoreA;
      });
    }

    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const fileName = `Laporan - ${title.replace(/<|>/g, '')} - ${timestamp}`;
    const newSs = SpreadsheetApp.create(fileName);
    const sheet = newSs.getSheets()[0];
    sheet.setName(title.substring(0, 100));

    sheet.getRange("A1").setValue(title).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");
    sheet.getRange(1, 1, 1, headers.length).merge();
    sheet.getRange(2, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    if (dataRows.length > 0) {
      sheet.getRange(3, 1, dataRows.length, headers.length).setValues(dataRows);
    }
    
    const dataRange = sheet.getRange(2, 1, sheet.getLastRow() > 2 ? sheet.getLastRow() - 1 : 1, headers.length);
    if (highlightColumnName) {
      const highlightColIndex = headers.indexOf(highlightColumnName) + 1;
      if (highlightColIndex > 0) {
        sheet.getRange(2, highlightColIndex, dataRange.getNumRows()).setBackground("#FFF2CC");
      }
    }
    dataRange.createFilter();
    headers.forEach((_, i) => sheet.autoResizeColumn(i + 1));
    
    const file = DriveApp.getFileById(newSs.getId());
    const folder = DriveApp.getFolderById(folderId);
    file.moveTo(folder);
    const fileUrl = file.getUrl();
    
    let pesanFile;

    if (userData && userData.email) {
      file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.NONE);
      file.addViewer(userData.email);
      console.log(`Hasil ekspor berhasil dibuat dan dibagikan secara pribadi ke ${userData.email}: ${fileUrl}`);
      const userMention = `<a href="tg://user?id=${userData.userId}">${escapeHtml(userData.firstName || 'Pengguna')}</a>`;
      pesanFile = `${userMention}, file ekspor Anda untuk "<b>${escapeHtml(title)}</b>" sudah siap.\n\nFile ini telah dibagikan secara pribadi ke email Anda.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    
    } else {
      console.log("Proses sistem terdeteksi. Membagikan file ke siapa saja dengan tautan.");
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      console.log(`Hasil ekspor sistem berhasil dibuat dan dibagikan secara publik: ${fileUrl}`);
      pesanFile = `📄 Laporan sistem "<b>${escapeHtml(title)}</b>" telah dibuat.\n\nSilakan akses file melalui tautan di bawah ini.\n\n<a href="${fileUrl}">Buka File Laporan</a>`;
    }

    kirimPesanTelegram(pesanFile, config, 'HTML');

  } catch (e) {
    console.error(`Gagal mengekspor hasil ke sheet: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`⚠️ Gagal membuat file ekspor. Error: ${e.message}`, config);
  }
}

/**
 * [REVISED v4.3.1 - ROBUST ARCHIVE SEARCH] Mengumpulkan semua riwayat perubahan untuk satu VM.
 * Secara andal membaca log dari sheet aktif dan semua file arsip JSON.
 */
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
      const files = archiveFolder.getFilesByName('archive_log_index.json');

      if (files.hasNext()) {
        const indexFile = files.next();
        const indexData = JSON.parse(indexFile.getBlob().getDataAsString());

        for (const indexEntry of indexData) {
            const archiveFiles = archiveFolder.getFilesByName(indexEntry.fileName);
            if(archiveFiles.hasNext()){
                const file = archiveFiles.next();
                const archivedRows = JSON.parse(file.getBlob().getDataAsString());
                if (Array.isArray(archivedRows)) {
                  for (const rowObj of archivedRows) {
                    if (rowObj[config[K.HEADER_VM_PK]] && normalizePrimaryKey(rowObj[config[K.HEADER_VM_PK]]) === normalizePrimaryKey(pk)) {
                      const rowArray = headers.map(header => rowObj[header] || '');
                      allHistory.push(rowArray);
                    }
                  }
                }
            }
        }
      }
    } catch(e) {
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

/**
 * [REFACTORED v3.5.0] Memformat satu baris entri log menjadi teks yang rapi.
 * Kini membaca nama header dari Konfigurasi.
 */
function formatHistoryEntry(entry, headers, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  let formattedText = "";
  
  const timestamp = new Date(entry[headers.indexOf(config[K.HEADER_LOG_TIMESTAMP])]).toLocaleString('id-ID', { 
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit' 
  });
  const action = entry[headers.indexOf(config[K.HEADER_LOG_ACTION])];
  const oldValue = entry[headers.indexOf(config[K.HEADER_LOG_OLD_VAL])];
  const newValue = entry[headers.indexOf(config[K.HEADER_LOG_NEW_VAL])];
  const detail = entry[headers.indexOf(config[K.HEADER_LOG_DETAIL])];

  formattedText += `<b>🗓️ ${escapeHtml(timestamp)}</b>\n`;
  formattedText += `<b>Aksi:</b> ${escapeHtml(action)}\n`;
  if (action === 'MODIFIKASI') {
    const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
    formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
    formattedText += `   - <code>${escapeHtml(oldValue || 'Kosong')}</code> ➔ <code>${escapeHtml(newValue || 'Kosong')}</code>\n\n`;
  } else {
    formattedText += `<b>Detail:</b> ${escapeHtml(detail)}\n\n`;
  }
  return formattedText;
}

/**
 * [FUNGSI BARU v3.1] Menghitung skor kelayakan migrasi untuk sebuah VM
 * berdasarkan kombinasi status, nama, kritikalitas, dan ukuran.
 * Semakin tinggi skor, semakin tinggi prioritas untuk dimigrasi.
 * @param {object} vm - Objek VM yang berisi { name, state, criticality, provisionedGb }.
 * @param {object} config - Objek konfigurasi yang aktif.
 * @returns {number} Skor kelayakan migrasi.
 */
function calculateMigrationScore(vm, config) {
  let score = 0;
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};

  // 1. Bobot Status (Paling Penting)
  const isOff = String(vm.state || '').toLowerCase().includes('off');
  if (isOff) {
    score += 1000000; // Bobot sangat besar untuk VM yang mati
  }

  // 2. Bobot Nama "unused"
  const isUnused = String(vm.name || '').toLowerCase().includes('unused');
  if (isUnused) {
    score += 500000; // Bobot besar untuk VM yang tidak terpakai
  }

  // 3. Bobot Kritikalitas (Terbalik)
  const criticalityScore = skorKritikalitas[String(vm.criticality || '').toUpperCase().trim()] || 0;
  // Bobot tertinggi untuk yang tidak terdefinisi (skor 0), terendah untuk CRITICAL (skor 5)
  score += (10 - criticalityScore) * 1000;

  // 4. Bobot Ukuran (Terbalik)
  // Memberi skor lebih tinggi pada VM yang lebih kecil.
  // Angka 10000 digunakan sebagai basis maksimum agar perhitungannya signifikan.
  const size = vm.provisionedGb || 0;
  if (size > 0) {
    score += (10000 - size);
  }

  return score;
}

/**
 * [MODIFIKASI v3.1] Fungsi pengurutan kini disederhanakan. Ia hanya memanggil
 * calculateMigrationScore untuk setiap VM dan mengurutkannya dari skor tertinggi ke terendah.
 */
function sortVmForMigration(a, b, config) {
  const scoreA = calculateMigrationScore(a, config);
  const scoreB = calculateMigrationScore(b, config);

  // Mengurutkan secara menurun (descending), dari skor tertinggi ke terendah.
  return scoreB - scoreA;
}

/**
 * [REFACTORED v4.2.5 - BULLETPROOF LOGIC] Mencari datastore tujuan terbaik.
 * Versi ini memiliki benteng pertahanan yang diperkuat untuk secara definitif
 * menangani kasus di mana sebuah tipe datastore tidak memiliki aturan migrasi sama sekali,
 * sehingga menyelesaikan error 'Cannot read properties of undefined'.
 */
function findBestDestination(sourceDs, requiredGb, availableDestinations, migrationConfig, config) {
    const sourceType = sourceDs.type;
    const excludedKeywords = (config[KONSTANTA.KUNCI_KONFIG.DS_KECUALI] || []).map(k => k.toUpperCase());

    let candidates = availableDestinations.filter(destDs => {
        const destDsNameUpper = destDs.name.toUpperCase();
        return destDs.cluster === sourceDs.cluster && 
               destDs.environment === sourceDs.environment &&
               destDs.name !== sourceDs.name &&
               destDs.freeSpace > requiredGb &&
               !excludedKeywords.some(exc => destDsNameUpper.includes(exc));
    });

    if (candidates.length === 0) {
        const initialCandidates = availableDestinations.filter(d => d.name !== sourceDs.name);
        if(initialCandidates.filter(d => d.cluster !== sourceDs.cluster).length === initialCandidates.length) return {error: true, reason: `Tidak ada kandidat di Cluster ${sourceDs.cluster}.`};
        if(initialCandidates.filter(d => d.environment !== sourceDs.environment).length === initialCandidates.length) return {error: true, reason: `Tidak ada kandidat di Environment ${sourceDs.environment}.`};
        if(initialCandidates.filter(d => d.freeSpace <= requiredGb).length === initialCandidates.length) return {error: true, reason: `Tidak ada kandidat dengan ruang kosong yang cukup (> ${requiredGb.toFixed(1)} GB).`};
        return { error: true, reason: `Semua kandidat datastore termasuk dalam daftar pengecualian.` };
    }
    
    const sourceRule = migrationConfig.get(sourceType) || Array.from(migrationConfig.values()).find(rule => rule && rule.alias === sourceType);
    
    // ==================== PERUBAHAN UTAMA DI SINI ====================
    // "Benteng pertahanan" yang lebih kuat.
    // Pertama, pastikan 'sourceRule' ada.
    if (sourceRule) {
        // Kedua, setelah yakin 'sourceRule' ada, baru periksa properti 'destinations'.
        if (Array.isArray(sourceRule.destinations) && sourceRule.destinations.length > 0) {
            const priorityTypes = sourceRule.destinations;
            
            for (const priorityType of priorityTypes) {
                const found = candidates.find(d => d.type === priorityType);
                if (found) {
                    return candidates
                        .filter(c => c.type === priorityType)
                        .sort((a,b) => b.freeSpace - a.freeSpace)[0];
                }
            }
            return { error: true, reason: `Tidak ditemukan datastore tujuan yang memenuhi syarat migrasi.` };
        }
    }
    // ==================== AKHIR PERUBAHAN ====================

    // Jika tidak ada aturan migrasi yang cocok, atau jika aturan ada tapi tujuannya kosong,
    // maka lanjutkan ke logika fallback.
    candidates.sort((a, b) => b.freeSpace - a.freeSpace);
    
    return candidates.length > 0 ? candidates[0] : { error: true, reason: `Tidak ditemukan datastore yang cocok.` };
}

/**
 * [FUNGSI BARU v3.1] Menganalisis semua datastore dalam sebuah cluster untuk
 * menghitung metrik kesehatan dan target ekuilibrium.
 * @param {Array<object>} datastoresInCluster - Array objek datastore dalam satu cluster.
 * @returns {object} Objek yang berisi { totalCapacity, totalProvisioned, averageUtilization }.
 */
function getClusterEquilibriumStatus(datastoresInCluster) {
  let totalCapacity = 0;
  let totalProvisioned = 0;

  datastoresInCluster.forEach(ds => {
    totalCapacity += ds.capacity;
    totalProvisioned += ds.provisioned;
  });

  const averageUtilization = (totalCapacity > 0) ? (totalProvisioned / totalCapacity * 100) : 0;

  return {
    totalCapacity: totalCapacity,
    totalProvisioned: totalProvisioned,
    averageUtilization: averageUtilization
  };
}

/**
 * [REFACTORED v4.7.0 - PROACTIVE VALIDATION] Menjalankan alur kerja analisis migrasi.
 * Fungsi ini sekarang secara proaktif memvalidasi 'Logika Migrasi' dan akan menyertakan
 * peringatan dalam laporan jika ditemukan tipe datastore yang tidak memiliki aturan.
 */
function jalankanRekomendasiMigrasi() {
    const { config } = getBotState();
    console.log("Memulai analisis penyeimbangan cluster...");
    
    try {
        const { allDatastores, allVms, vmHeaders, migrationConfig } = _gatherMigrationDataSource(config);

        let finalMessage = `⚖️ <b>Analisis & Rekomendasi Migrasi Datastore</b>\n`;
        finalMessage += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID')}</i>`;
        
        // ==================== PERUBAHAN UTAMA DI SINI: VALIDASI PROAKTIF ====================
        const uniqueDsTypes = [...new Set(allDatastores.map(ds => ds.type).filter(Boolean))];
        const unconfiguredTypes = [];

        uniqueDsTypes.forEach(type => {
            const rule = migrationConfig.get(type) || Array.from(migrationConfig.values()).find(r => r.alias === type);
            if (!rule) {
                unconfiguredTypes.push(type);
            }
        });

        if (unconfiguredTypes.length > 0) {
            finalMessage += `\n\n⚠️ <b>Peringatan Konfigurasi</b>\n`;
            finalMessage += `Ditemukan tipe datastore berikut yang belum memiliki aturan di sheet "Logika Migrasi":\n`;
            unconfiguredTypes.forEach(type => {
                finalMessage += ` • <code>${escapeHtml(type)}</code>\n`;
            });
            finalMessage += `<i>Rekomendasi untuk tipe ini mungkin tidak optimal. Harap perbarui konfigurasi.</i>`;
        }
        // ==================== AKHIR PERUBAHAN ====================

        const overProvisionedDsList = allDatastores.filter(ds => ds.provisionedGb > ds.capacityGb);
        if (overProvisionedDsList.length === 0) {
            finalMessage += "\n\n✅ Semua datastore dalam kondisi provisioning yang aman (1:1).";
            return finalMessage;
        }

        overProvisionedDsList.forEach(dsInfo => {
            finalMessage += KONSTANTA.UI_STRINGS.SEPARATOR;
            const migrationTargetGb = dsInfo.provisionedGb - dsInfo.capacityGb;
            const provisionedTb = dsInfo.provisionedGb / 1024;
            const capacityTb = dsInfo.capacityGb / 1024;
            const migrationTargetTb = migrationTargetGb / 1024;
            
            finalMessage += `❗️ <b>Datastore Over-Provisioned:</b> <code>${dsInfo.name}</code>\n`;
            finalMessage += `• <b>Status:</b> Provisioned ${dsInfo.provisionedGb.toFixed(2)} GB (${provisionedTb.toFixed(2)} TB) / ${dsInfo.capacityGb.toFixed(2)} GB (${capacityTb.toFixed(2)} TB) (<b>${dsInfo.utilization.toFixed(1)}%</b>)\n`;
            
            const diagnosis = diagnoseOverprovisioningCause(dsInfo.name, config);
            if (diagnosis) finalMessage += `• <b>Indikasi Penyebab:</b> ${diagnosis}\n`;
            finalMessage += `• <b>Target Migrasi:</b> ${migrationTargetGb.toFixed(2)} GB (~${migrationTargetTb.toFixed(2)} TB)\n`;

            const migrationPlan = _buildMigrationPlan(dsInfo, allDatastores, allVms, vmHeaders, migrationConfig, config);
            
            finalMessage += `\n✅ <b>Rencana Tindak Lanjut:</b>\n`;
            if (migrationPlan.size > 0) {
                migrationPlan.forEach((vms, destDsName) => {
                    const totalSizeToDest = vms.reduce((sum, vm) => sum + vm.provisionedGb, 0);
                    finalMessage += `\n➡️ Migrasi ke <code>${destDsName}</code> (~${totalSizeToDest.toFixed(2)} GB):\n`;
                    vms.forEach(vm => {
                        finalMessage += ` • <code>${escapeHtml(vm.name)}</code> (${vm.provisionedGb.toFixed(2)} GB) | ${escapeHtml(vm.criticality)} | ${escapeHtml(vm.state)}\n`;
                    });
                });
            } else {
                finalMessage += "<i>Tidak ditemukan datastore tujuan yang cocok di dalam cluster ini.</i>\n\n";
                finalMessage += "💡 <b>Rekomendasi:</b>\n";
                finalMessage += `Buat Datastore baru pada <b>Cluster ${dsInfo.cluster}</b> dengan tipe <code>${dsInfo.type || 'Sesuai standar'}</code> dan kapasitas > <code>${migrationTargetGb.toFixed(2)} GB</code>.\n`;
            }
        });
        
        return finalMessage;

    } catch (e) {
      console.error(`Gagal menjalankan analisis migrasi: ${e.message}\nStack: ${e.stack}`);
      throw new Error(`Gagal Menjalankan Analisis Migrasi. Penyebab: ${e.message}`);
    }
}

/**
 * [REFACTORED v3.5.0 - FINAL] Fungsi spesialis untuk menangani semua permintaan ekspor kategori Uptime.
 * Kini membaca nama header Uptime secara dinamis dari Konfigurasi.
 */
function processUptimeExport(exportType, config) {
    let categoryName, minDays, maxDays, isInvalidCheck = false, sortAscending = true;
    switch (exportType) {
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_1: minDays = 0; maxDays = 365; categoryName = "Uptime < 1 Tahun"; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_2: minDays = 366; maxDays = 730; categoryName = "Uptime 1-2 Tahun"; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_3: minDays = 731; maxDays = 1095; categoryName = "Uptime 2-3 Tahun"; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_4: minDays = 1096; maxDays = Infinity; categoryName = "Uptime > 3 Tahun"; sortAscending = false; break;
        case KONSTANTA.CALLBACK.EXPORT_UPTIME_INVALID: isInvalidCheck = true; categoryName = "Data Uptime Tidak Valid"; break;
        default: return null;
    }
    
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (!sheet) throw new Error("Sheet Data Utama tidak ditemukan.");
    
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const uptimeHeaderName = config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_UPTIME];
    const uptimeIndex = headers.indexOf(uptimeHeaderName);
    if (uptimeIndex === -1) throw new Error(`Kolom '${uptimeHeaderName}' tidak ditemukan atau salah dikonfigurasi.`);
    
    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    let filteredData = allData.filter(row => {
        const uptimeValue = row[uptimeIndex];
        const uptimeDays = parseInt(uptimeValue, 10);
        if (isInvalidCheck) return uptimeValue === '' || uptimeValue === '-' || isNaN(uptimeDays);
        else return !isNaN(uptimeDays) && uptimeDays >= minDays && uptimeDays <= maxDays;
    });

    if (filteredData.length > 0 && !isInvalidCheck) {
        filteredData.sort((a, b) => {
            const uptimeA = parseInt(a[uptimeIndex], 10) || 0;
            const uptimeB = parseInt(b[uptimeIndex], 10) || 0;
            return sortAscending ? uptimeA - uptimeB : uptimeB - uptimeA;
        });
    }

    const reportDate = new Date().toLocaleDateString('id-ID');
    const dynamicTitle = `Laporan VM - ${categoryName} per ${reportDate}`;
    
    return { headers: headers, data: filteredData, title: dynamicTitle };
}

/**
 * [REFACTORED v3.5.0] Mengumpulkan entri log dari sheet aktif DAN arsip JSON.
 */
function getCombinedLogs(startDate, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  let combinedLogEntries = [];
  let logHeaders = [];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (sheetLog && sheetLog.getLastRow() > 1) {
    const allLogData = sheetLog.getDataRange().getValues();
    logHeaders = allLogData.shift(); 
    
    const timestampHeader = config[K.HEADER_LOG_TIMESTAMP];
    const timestampIndex = logHeaders.indexOf(timestampHeader);
    if (timestampIndex === -1) {
        throw new Error(`Gagal memproses log: Kolom '${timestampHeader}' tidak ditemukan di header sheet 'Log Perubahan'.`);
    }

    const activeLogs = allLogData.filter(row => {
      return row.length > 0 && row[timestampIndex] && new Date(row[timestampIndex]) >= startDate;
    });
    combinedLogEntries.push(...activeLogs);
  } else if (sheetLog) {
    logHeaders = sheetLog.getRange(1, 1, 1, sheetLog.getLastColumn()).getValues()[0];
  }

  const FOLDER_ARSIP_ID = config[K.FOLDER_ARSIP_LOG];
  if (FOLDER_ARSIP_ID && logHeaders.length > 0) {
    try {
      const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);
      const indexFiles = folderArsip.getFilesByName('archive_log_index.json');
      if (indexFiles.hasNext()) {
        const indexFile = indexFiles.next();
        const indexData = JSON.parse(indexFile.getBlob().getDataAsString());
        const timestampHeader = config[K.HEADER_LOG_TIMESTAMP];

        for (const indexEntry of indexData) {
          const archiveEndDate = new Date(indexEntry.endDate);
          if (archiveEndDate >= startDate) {
            const archiveFiles = folderArsip.getFilesByName(indexEntry.fileName);
            if (archiveFiles.hasNext()) {
              const file = archiveFiles.next();
              const jsonContent = file.getBlob().getDataAsString();
              const archivedLogs = JSON.parse(jsonContent);

              const relevantLogs = archivedLogs.filter(logObject => 
                logObject[timestampHeader] && new Date(logObject[timestampHeader]) >= startDate
              );
              const relevantLogsAsArray = relevantLogs.map(logObject => logHeaders.map(header => logObject[header] || ''));
              combinedLogEntries.push(...relevantLogsAsArray);
            }
          }
        }
      }
    } catch(e) {
      console.error(`Gagal membaca file arsip log menggunakan indeks: ${e.message}`);
    }
  }

  if (combinedLogEntries.length > 0) {
    const timestampHeader = config[K.HEADER_LOG_TIMESTAMP];
    const timestampIndex = logHeaders.indexOf(timestampHeader);
    if (timestampIndex !== -1) {
      combinedLogEntries.sort((a, b) => new Date(b[timestampIndex]) - new Date(a[timestampIndex]));
    }
  }

  return { headers: logHeaders, data: combinedLogEntries };
}

/**
 * [REFACTORED v3.5.0 - FINAL & ROBUST] Mengendalikan semua permintaan ekspor dari menu interaktif.
 * Kini sepenuhnya menggunakan header dinamis dari Konfigurasi untuk SEMUA tipe ekspor.
 */
function handleExportRequest(update, config, userData) {
  const callbackQuery = update.callback_query;
  const chatId = callbackQuery.message.chat.id;
  const messageId = callbackQuery.message.message_id;
  const exportType = callbackQuery.data;

  let statusMessageId = null;
  try {
    const titleForStatus = exportType.replace(/export_|run_export_/, '').replace(/_/g, ' ').toUpperCase();
    const sentMessage = kirimPesanTelegram(`⏳ Memulai proses ekspor untuk <b>${titleForStatus}</b>... Harap tunggu.`, config, 'HTML', null, chatId);
    if (sentMessage && sentMessage.ok) {
        statusMessageId = sentMessage.result.message_id;
    }
  } catch (e) {
    console.warn(`Gagal mengirim pesan status awal untuk ekspor: ${e.message}`);
  }

  try {
    let headers, data, title, highlightColumn = null;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const K = KONSTANTA.KUNCI_KONFIG; // Alias untuk kemudahan

    switch (exportType) {
      case KONSTANTA.CALLBACK.EXPORT_LOG_TODAY:
      case KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS:
      case KONSTANTA.CALLBACK.EXPORT_LOG_30_DAYS: {
        const now = new Date();
        let startDate = new Date();
        if (exportType === KONSTANTA.CALLBACK.EXPORT_LOG_TODAY) {
            startDate.setHours(0, 0, 0, 0);
            title = "Log Perubahan Hari Ini (Termasuk Arsip)";
        } else if (exportType === KONSTANTA.CALLBACK.EXPORT_LOG_7_DAYS) {
            startDate.setDate(now.getDate() - 7);
            title = "Log Perubahan 7 Hari Terakhir (Termasuk Arsip)";
        } else {
            startDate.setDate(now.getDate() - 30);
            title = "Log Perubahan 30 Hari Terakhir (Termasuk Arsip)";
        }
        const combinedLogResult = getCombinedLogs(startDate, config);
        headers = combinedLogResult.headers;
        data = combinedLogResult.data;
        // --- [PERBAIKAN UTAMA DI SINI] ---
        highlightColumn = config[K.HEADER_LOG_ACTION]; // Menggunakan kunci dinamis
        break;
      }
        
      case KONSTANTA.CALLBACK.EXPORT_ALL_VMS:
      case KONSTANTA.CALLBACK.EXPORT_VC01_VMS:
      case KONSTANTA.CALLBACK.EXPORT_VC02_VMS: {
        const vmSheet = ss.getSheetByName(config[K.SHEET_VM]);
        if (!vmSheet) throw new Error(`Sheet data utama '${config[K.SHEET_VM]}' tidak ditemukan.`);

        headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
        const allVmData = vmSheet.getLastRow() > 1 ? vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues() : [];
        
        if (exportType === KONSTANTA.CALLBACK.EXPORT_ALL_VMS) {
            data = allVmData;
            title = "Semua Data VM";
        } else {
            const vcenterHeaderName = config[K.HEADER_VM_VCENTER];
            const vcenterIndex = headers.indexOf(vcenterHeaderName);
            if (vcenterIndex === -1) throw new Error(`Kolom '${vcenterHeaderName}' tidak ditemukan atau salah dikonfigurasi.`);
            
            const vcenter = exportType.split('_').pop().toUpperCase();
            data = allVmData.filter(row => String(row[vcenterIndex]).toUpperCase() === vcenter);
            title = `Data VM di ${vcenter}`;
        }
        highlightColumn = config[K.HEADER_VM_VCENTER];
        break;
      }

      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_1:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_2:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_3:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_CAT_4:
      case KONSTANTA.CALLBACK.EXPORT_UPTIME_INVALID: {
        const result = processUptimeExport(exportType, config);
        if (result) {
            headers = result.headers;
            data = result.data;
            title = result.title;
            highlightColumn = config[K.HEADER_VM_UPTIME];
        }
        break;
      }
    }

    if (data && headers && headers.length > 0) {
        if (data.length > 0) {
            exportResultsToSheet(headers, data, title, config, userData, highlightColumn);
            if (statusMessageId) {
                editMessageText(`✅ Proses ekspor untuk <b>${title}</b> telah selesai. Hasilnya telah dikirimkan dalam pesan terpisah.`, null, chatId, statusMessageId, config);
            }
        } else {
            const noDataMessage = `ℹ️ Tidak ada data yang dapat diekspor untuk kategori "<b>${title}</b>".`;
            if (statusMessageId) {
                editMessageText(noDataMessage, null, chatId, statusMessageId, config);
            } else {
                kirimPesanTelegram(noDataMessage, config, 'HTML', null, chatId);
            }
        }
    } else {
        const failMessage = `⚠️ Gagal memproses permintaan: Tidak dapat menemukan data atau header yang diperlukan untuk ekspor ini.`;
        if (statusMessageId) {
            editMessageText(failMessage, null, chatId, statusMessageId, config);
        } else {
            kirimPesanTelegram(failMessage, config, 'HTML', null, chatId);
        }
    }

  } catch (e) {
      console.error(`Gagal menangani permintaan ekspor: ${e.message}\nStack: ${e.stack}`);
      const errorMessage = `⚠️ Terjadi kesalahan saat memproses permintaan ekspor Anda.\n<code>${escapeHtml(e.message)}</code>`;
      if (statusMessageId) {
          editMessageText(errorMessage, null, chatId, statusMessageId, config);
      } else {
          kirimPesanTelegram(errorMessage, config, 'HTML', null, chatId);
      }
  }
}

/**
 * FUNGSI UTAMA PENGARSIPAN (DENGAN LOGIKA INDEKS & RETURN VALUE FINAL)
 * Tugasnya adalah memindahkan log lama ke file JSON, membersihkan sheet,
 * dan HANYA mengembalikan pesan hasilnya.
 */
function jalankanPengarsipanLogKeJson(config) {
  const activeConfig = config;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    console.log("Tidak ada log untuk diarsipkan.");
    return "ℹ️ Tidak ada data log yang bisa diarsipkan saat ini.";
  }

  const FOLDER_ARSIP_ID = activeConfig[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP_LOG];
  if (!FOLDER_ARSIP_ID) {
    throw new Error("Folder ID untuk arsip log (FOLDER_ID_ARSIP_LOG) belum diatur di Konfigurasi.");
  }
  const folderArsip = DriveApp.getFolderById(FOLDER_ARSIP_ID);

  const dataRange = sheetLog.getDataRange();
  const allLogData = dataRange.getValues();
  const headers = allLogData.shift();
  
  if (allLogData.length === 0) {
    console.log("Tidak ada baris data log setelah header. Pengarsipan dibatalkan.");
    return "ℹ️ Tidak ada baris data log setelah header. Pengarsipan dibatalkan.";
  }

  const timestampIndex = headers.indexOf(KONSTANTA.HEADER_LOG.TIMESTAMP);
  if (timestampIndex === -1) {
    throw new Error("Kolom 'Timestamp' tidak ditemukan di header log. Tidak dapat melanjutkan pengarsipan.");
  }

  const timestamps = allLogData.map(row => new Date(row[timestampIndex])).filter(d => !isNaN(d.getTime()));
  const logStartDate = new Date(Math.min.apply(null, timestamps));
  const logEndDate = new Date(Math.max.apply(null, timestamps));
  
  const jsonData = allLogData.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });

  try {
    const timezone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
    const timestamp = Utilities.formatDate(new Date(), timezone, "yyyy-MM-dd_HH-mm-ss");
    const namaFileArsip = `Arsip Log - ${timestamp}.json`;
    const jsonString = JSON.stringify(jsonData, null, 2); 
    
    folderArsip.createFile(namaFileArsip, jsonString, MimeType.PLAIN_TEXT);
    console.log(`${allLogData.length} baris log telah ditulis ke file JSON: ${namaFileArsip}`);

    const indexFileName = 'archive_log_index.json';
    let indexData = [];
    const indexFiles = folderArsip.getFilesByName(indexFileName);

    if (indexFiles.hasNext()) {
      const indexFile = indexFiles.next();
      try {
        indexData = JSON.parse(indexFile.getBlob().getDataAsString());
      } catch (e) {
        console.warn(`Gagal parse file indeks, akan membuat yang baru. Error: ${e.message}`);
        indexData = [];
      }
      indexFile.setTrashed(true);
    }
    
    indexData.push({
      fileName: namaFileArsip,
      startDate: logStartDate.toISOString(),
      endDate: logEndDate.toISOString()
    });
    
    folderArsip.createFile(indexFileName, JSON.stringify(indexData, null, 2), MimeType.PLAIN_TEXT);
    console.log(`File indeks "${indexFileName}" telah diperbarui.`);

    sheetLog.getRange(2, 1, sheetLog.getLastRow(), sheetLog.getLastColumn()).clearContent();

    const pesanSukses = `✅ Pengarsipan log berhasil.\n\nSebanyak ${allLogData.length} baris log telah dipindahkan ke file "${namaFileArsip}".`;
    console.log(pesanSukses);
    return pesanSukses;

  } catch (e) {
    const pesanGagal = `❌ Gagal melakukan pengarsipan log. Error: ${e.message}\nStack: ${e.stack}`;
    console.error(pesanGagal);
    return pesanGagal;
  }
}

/**
 * FUNGSI PENGECЕK (Setelah Perbaikan Logika Threshold & Return Value)
 * Tugasnya adalah memeriksa jumlah baris dan mengembalikan pesan hasilnya.
 */
function cekDanArsipkanLogJikaPenuh(config = null) {
  const activeConfig = config || bacaKonfigurasi();
  const BATAS_BARIS = activeConfig.LOG_ARCHIVE_THRESHOLD || KONSTANTA.LIMIT.LOG_ARCHIVE_THRESHOLD;

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetLog = ss.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);

    if (!sheetLog) {
      const errorMsg = "Sheet 'Log Perubahan' tidak ditemukan. Pengecekan dibatalkan.";
      console.error(errorMsg);
      return `❌ Gagal: ${errorMsg}`; // Mengembalikan pesan error
    }

    const jumlahBaris = sheetLog.getLastRow();
    console.log(`Pengecekan jumlah baris log: ${jumlahBaris} baris.`);

    if (jumlahBaris > BATAS_BARIS) {
      console.log(`Jumlah baris (${jumlahBaris}) melebihi batas (${BATAS_BARIS}). Memulai proses pengarsipan...`);
      // Jalankan pengarsipan dan kembalikan pesannya
      return jalankanPengarsipanLogKeJson(activeConfig);
    } else {
      const feedbackMsg = `ℹ️ Pengarsipan belum diperlukan. Jumlah baris log saat ini adalah ${jumlahBaris}, masih di bawah ambang batas ${BATAS_BARIS} baris.`;
      console.log(feedbackMsg);
      return feedbackMsg; // Mengembalikan pesan info
    }
  } catch(e) {
      const errorMsg = `❌ Gagal saat memeriksa log untuk pengarsipan: ${e.message}`;
      console.error(errorMsg);
      return errorMsg; // Mengembalikan pesan error
  }
}

/**
 * [REFACTORED v4.3.1 - CRITICAL FIX] Memproses perubahan data untuk VM atau Datastore.
 * Memperbaiki bug fatal 'Cannot read properties of undefined' dengan menggunakan referensi
 * yang benar dari objek config untuk mendapatkan nama header dinamis.
 */
function processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, entityName) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) throw new Error(`Sheet "${sheetName}" tidak ditemukan.`);
  
  const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  if (!sheetLog) throw new Error(`Sheet Log Perubahan tidak ditemukan.`);

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const pkIndex = headers.indexOf(primaryKeyHeader);
  if (pkIndex === -1) throw new Error(`Kolom Primary Key "${primaryKeyHeader}" tidak ditemukan di sheet "${sheetName}".`);

  const folderArsip = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP]);
  const files = folderArsip.getFilesByName(archiveFileName);
  let mapDataKemarin = new Map();
  let fileArsip;
  if (files.hasNext()) {
    fileArsip = files.next();
    try {
      const archivedData = JSON.parse(fileArsip.getBlob().getDataAsString());
      const normalizedArchivedData = archivedData.map(([pk, data]) => [normalizePrimaryKey(pk), data]);
      mapDataKemarin = new Map(normalizedArchivedData);
    } catch (e) {
      console.warn(`Gagal parse arsip "${archiveFileName}": ${e.message}`);
    }
  }

  const dataHariIni = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];
  const mapDataHariIni = new Map();
  
  columnsToTrack.forEach(kolom => {
    kolom.index = headers.indexOf(kolom.nama);
  });
  
  const buatObjekData = (row) => {
    const data = {};
    columnsToTrack.forEach(kolom => {
      if (kolom.index !== -1) data[kolom.nama] = row[kolom.index];
    });
    return data;
  };

  dataHariIni.forEach(row => {
    const pk = row[pkIndex];
    if (pk) {
      const pkNormalized = normalizePrimaryKey(pk);
      const rowData = buatObjekData(row);
      rowData[primaryKeyHeader] = pk; 
      mapDataHariIni.set(pkNormalized, { data: rowData, hash: computeVmHash(rowData) });
    }
  });

  let logEntriesToAdd = [];
  const timestamp = new Date();
  
  // ==================== PERUBAHAN UTAMA DI SINI ====================
  // Menggunakan referensi yang BENAR dari objek 'config'
  const K = KONSTANTA.KUNCI_KONFIG;
  const nameHeaderForLog = entityName === 'VM' ? config[K.HEADER_VM_NAME] : primaryKeyHeader;
  const tolerance = parseFloat(config[K.LOG_TOLERANCE_PROV_GB]) || 0;
  const provisionedGbHeader = config[K.HEADER_VM_PROV_GB];
  // ==================== AKHIR PERUBAHAN ====================

  for (const [id, dataBaru] of mapDataHariIni.entries()) {
    const dataLama = mapDataKemarin.get(id);
    const entityDisplayName = dataBaru.data[nameHeaderForLog] || id;
    const pkRawForLog = dataBaru.data[primaryKeyHeader];

    if (!dataLama) {
      const detail = `${entityName} baru dibuat/ditemukan.`;
      const logEntry = [timestamp, 'PENAMBAHAN', pkRawForLog, entityDisplayName, sheetName, '', '', detail, entityName];
      logEntriesToAdd.push(logEntry);
    } else if (dataBaru.hash !== dataLama.hash) {
      if (dataLama && dataLama.data) {
        for (const key in dataBaru.data) {
          if(key === primaryKeyHeader) continue; 
          
          const oldValue = dataLama.data[key] || '';
          const newValue = dataBaru.data[key] || '';
          let hasChanged = false;

          if (key === provisionedGbHeader && entityName === KONSTANTA.NAMA_ENTITAS.VM) {
            const oldNum = parseLocaleNumber(oldValue);
            const newNum = parseLocaleNumber(newValue);
            if (Math.abs(newNum - oldNum) > tolerance) {
              hasChanged = true;
            }
          } else {
            if (String(newValue) !== String(oldValue)) {
              hasChanged = true;
            }
          }

          if (hasChanged) {
            const detail = `Kolom '${key}' diubah`;
            const logEntry = [timestamp, 'MODIFIKASI', pkRawForLog, entityDisplayName, sheetName, oldValue, newValue, detail, entityName];
            logEntriesToAdd.push(logEntry);
          }
        }
      }
    }
    mapDataKemarin.delete(id);
  }

  for (const [id, dataLama] of mapDataKemarin.entries()) {
    const entityDisplayName = (dataLama.data && dataLama.data[nameHeaderForLog]) || id;
    const pkRawForLog = (dataLama.data && dataLama.data[primaryKeyHeader]) || id;
    const detail = `${entityName} telah dihapus.`;
    const logEntry = [timestamp, 'PENGHAPUSAN', pkRawForLog, entityDisplayName, sheetName, '', '', detail, entityName];
    logEntriesToAdd.push(logEntry);
  }

  if (logEntriesToAdd.length > 0) {
    sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logEntriesToAdd.length, 9).setValues(logEntriesToAdd);
    console.log(`${logEntriesToAdd.length} log perubahan untuk ${entityName} telah ditambahkan.`);
  }

  const dataUntukArsip = JSON.stringify(Array.from(mapDataHariIni.entries()));
  if (fileArsip) {
    fileArsip.setContent(dataUntukArsip);
  } else {
    folderArsip.createFile(archiveFileName, dataUntukArsip, MimeType.PLAIN_TEXT);
  }
  console.log(`Pengarsipan ${entityName} selesai.`);
  
  return logEntriesToAdd;
}

/**
 * [REFACTORED v4.2.7 - STRICT CONSTANTS FIX] Menganalisis log perubahan untuk mendiagnosis penyebab over-provisioning.
 * Memperbaiki bug 'Cannot read properties of undefined (reading 'TIPE_LOG')' dengan menggunakan
 * referensi konstanta yang benar dari objek config.
 */
function diagnoseOverprovisioningCause(dsName, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { headers, data: allRecentLogs } = getCombinedLogs(thirtyDaysAgo, config);
    if(allRecentLogs.length === 0) return null;
    
    // ==================== PERUBAHAN UTAMA DI SINI ====================
    // Menggunakan referensi yang BENAR dari objek 'config'
    const typeLogHeader = config[K.HEADER_LOG_TIPE_LOG];
    const typeLogIndex = headers.indexOf(typeLogHeader);
    // ==================== AKHIR PERUBAHAN ====================

    if (typeLogIndex === -1) {
        console.warn(`Kolom 'Tipe Log' dengan header '${typeLogHeader}' tidak ditemukan, analisis penyebab mungkin tidak akurat.`);
        return null;
    }
    
    const recentLogs = allRecentLogs.filter(log => log[typeLogIndex] === KONSTANTA.NAMA_ENTITAS.VM);
    if(recentLogs.length === 0) return null;

    const pkIndex = headers.indexOf(config[K.HEADER_VM_PK]);
    const actionIndex = headers.indexOf(config[K.HEADER_LOG_ACTION]);
    const detailIndex = headers.indexOf(config[K.HEADER_LOG_DETAIL]);

    let newVmCount = 0;
    let diskModCount = 0;

    const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_VM]);
    const vmData = vmSheet.getDataRange().getValues();
    const vmHeaders = vmData.shift();
    const vmPkIndex = vmHeaders.indexOf(config[K.HEADER_VM_PK]);
    const vmDsIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
    const vmProvGbHeader = config[K.HEADER_VM_PROV_GB];

    if (vmPkIndex === -1 || vmDsIndex === -1) {
        console.warn("Header PK atau DS tidak ditemukan di sheet VM, analisis penyebab dibatalkan.");
        return null;
    }

    const vmsOnThisDs = new Set(vmData.filter(row => row[vmDsIndex] === dsName).map(row => normalizePrimaryKey(row[vmPkIndex])));

    recentLogs.forEach(log => {
        const pk = normalizePrimaryKey(log[pkIndex]);
        if (vmsOnThisDs.has(pk)) {
            const action = log[actionIndex];
            if (action === 'PENAMBAHAN') {
                newVmCount++;
            } else if (action === 'MODIFIKASI' && log[detailIndex].includes(vmProvGbHeader)) {
                diskModCount++;
            }
        }
    });

    if (newVmCount > 0 || diskModCount > 0) {
        let diagnosis = "Kondisi ini kemungkinan disebabkan oleh ";
        const causes = [];
        if (newVmCount > 0) causes.push(`<b>${newVmCount} penambahan VM baru</b>`);
        if (diskModCount > 0) causes.push(`<b>${diskModCount} modifikasi ukuran disk</b>`);
        diagnosis += causes.join(' dan ') + " dalam 30 hari terakhir.";
        return diagnosis;
    }

    return null;
}

/**
 * [REFACTORED v3.5.0] Mencari semua VM yang berada di dalam cluster tertentu.
 */
function searchVmsByCluster(clusterName, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const sheetName = config[K.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const clusterHeaderName = config[K.HEADER_VM_CLUSTER];
  const clusterIndex = headers.indexOf(clusterHeaderName);

  if (clusterIndex === -1) {
    throw new Error(`Kolom header penting "${clusterHeaderName}" tidak ditemukan di sheet "${sheetName}".`);
  }

  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  const results = allData.filter(row => 
    String(row[clusterIndex] || '').toLowerCase() === clusterName.toLowerCase()
  );

  return { headers, results };
}

/**
 * [FUNGSI BARU] Mencari semua VM yang berada di dalam datastore tertentu.
 * @param {string} datastoreName - Nama datastore yang akan dicari.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {{headers: Array<string>, results: Array<Array<any>>}} Objek berisi header dan baris data VM yang cocok.
 */
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

  const results = allData.filter(row => 
    String(row[datastoreIndex] || '').toLowerCase() === datastoreName.toLowerCase()
  );

  return { headers, results };
}

/**
 * [REFACTORED v4.2.2 - EXPORT ENABLED] Mengendalikan tampilan daftar VM untuk Cluster/Datastore.
 * Fungsi ini sekarang sepenuhnya mendukung aksi ekspor, membuat pekerjaan yang benar,
 * dan menyimpannya ke antrean untuk diproses.
 */
function handlePaginatedVmList(update, config, userData) {
  const userEvent = update.callback_query;
  const sessionData = userEvent.sessionData;

  try {
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;

    if (!sessionData) {
        editMessageText("Sesi telah kedaluwarsa atau tidak valid. Silakan mulai lagi perintah awal.", null, chatId, messageId, config);
        return;
    }
    
    const { listType, itemName, originPk, page = 1 } = sessionData;

    // Logika untuk menangani aksi ekspor
    if (userEvent.action === KONSTANTA.PAGINATION_ACTIONS.EXPORT) {
        answerCallbackQuery(userEvent.id, config, "Menambahkan ke antrean...");
        
        // Membuat jobData yang spesifik untuk tipe daftar ini
        const jobData = { 
            listType: listType, 
            itemName: itemName, 
            config: config, 
            userData: userData, 
            chatId: chatId 
        };
        const jobKey = `export_job_${userEvent.from.id}_${Date.now()}`;
        PropertiesService.getUserProperties().setProperty(jobKey, JSON.stringify(jobData));
        
        const friendlyListType = listType === 'cluster' ? 'Cluster' : 'Datastore';
        kirimPesanTelegram(`✅ Permintaan ekspor Anda untuk VM di <b>${friendlyListType} "${escapeHtml(itemName)}"</b> telah ditambahkan ke antrean.`, config, 'HTML', null, chatId);
        return;
    }
    
    let searchFunction, titlePrefix, navPrefix, exportPrefix, headerContent = "";
    const K_CEKVM = KONSTANTA.CALLBACK_CEKVM;
    const K_CONFIG = KONSTANTA.KUNCI_KONFIG;

    if (listType === 'cluster') {
        searchFunction = searchVmsByCluster;
        titlePrefix = 'VM di Cluster';
        navPrefix = K_CEKVM.CLUSTER_NAV_PREFIX;
        exportPrefix = K_CEKVM.CLUSTER_EXPORT_PREFIX;

        const analysis = generateClusterAnalysis(itemName, config);
        headerContent = `📊 <b>Analisis Cluster "${escapeHtml(itemName)}"</b>\n`;
        headerContent += `• <b>Total VM:</b> ${analysis.totalVms} (🟢 ${analysis.on} On / 🔴 ${analysis.off} Off)\n`;
        const totalMemoryInTb = analysis.totalMemory / 1024;
        headerContent += `• <b>Alokasi Resource:</b> ${analysis.totalCpu} vCPU | ${analysis.totalMemory.toFixed(0)} GB RAM (~${totalMemoryInTb.toFixed(2)} TB)\n`;
        const diskUtilPercent = analysis.diskUtilizationPercent;
        const barLength = 12;
        const filledLength = Math.round((diskUtilPercent / 100) * barLength);
        const emptyLength = barLength - filledLength;
        const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
        headerContent += `• <b>Utilisasi Disk:</b> ${diskUtilPercent.toFixed(1)}% [<code>${progressBar}</code>] (${analysis.totalVmProvisionedTb.toFixed(2)} / ${analysis.totalDsCapacityTb.toFixed(2)} TB)\n`;
        if (analysis.criticalVmOffCount > 0) {
            headerContent += `• <b>Peringatan:</b> Terdapat <b>${analysis.criticalVmOffCount} VM Kritis</b> dalam kondisi mati!\n`;
        }
    } else if (listType === 'datastore') {
        searchFunction = searchVmsByDatastore;
        titlePrefix = 'VM di Datastore';
        navPrefix = K_CEKVM.DATASTORE_NAV_PREFIX;
        exportPrefix = K_CEKVM.DATASTORE_EXPORT_PREFIX;

        const details = getDatastoreDetails(itemName, config);
        const { headers: vmHeaders, results: vmResults } = searchFunction(itemName, config);

        if (details) {
            headerContent = `🗄️ <b>Ringkasan Datastore "${escapeHtml(details.name)}"</b>\n`;
            headerContent += `• <b>Kapasitas:</b> ${details.capacityGb.toFixed(1)} GB (${details.capacityTb.toFixed(2)} TB) | <b>Terpakai:</b> ${details.provisionedGb.toFixed(1)} GB (${details.provisionedTb.toFixed(2)} TB)\n`;
            const usage = details.usagePercent;
            const barLength = 12;
            const filledLength = Math.round((usage / 100) * barLength);
            const emptyLength = barLength - filledLength;
            const progressBar = '█'.repeat(filledLength) + '░'.repeat(emptyLength);
            headerContent += `• <b>Alokasi Terpakai:</b> ${usage.toFixed(1)}% [ <code>${progressBar}</code> ]\n`;
            
            let onCount = 0;
            let offCount = 0;
            const stateIndex = vmHeaders.indexOf(config[K_CONFIG.HEADER_VM_STATE]);
            if(stateIndex !== -1) {
                vmResults.forEach(row => {
                    const state = String(row[stateIndex] || '').toLowerCase();
                    if (state.includes('on')) {
                        onCount++;
                    } else {
                        offCount++;
                    }
                });
            }
            headerContent += `• <b>Total VM:</b> ${vmResults.length} (🟢 ${onCount} On / 🔴 ${offCount} Off)\n`;
        } else {
            headerContent = `🗄️ Detail untuk Datastore "${escapeHtml(itemName)}" tidak ditemukan.\n`;
        }
    } else {
      throw new Error("Tipe daftar tidak valid: " + listType);
    }
    
    const { headers, results } = searchFunction(itemName, config);

    const formatVmEntry = (row) => {
      const state = String(row[headers.indexOf(config[K_CONFIG.HEADER_VM_STATE])] || '').toLowerCase();
      const statusIcon = state.includes('on') ? '🟢' : '🔴';
      const vmName = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_NAME])]);
      const criticality = escapeHtml(row[headers.indexOf(config[K_CONFIG.HEADER_VM_KRITIKALITAS])] || '');
      const criticalityLabel = criticality ? `<code>[${criticality.toUpperCase()}]</code>` : '';
      
      const cpu = row[headers.indexOf(config[K_CONFIG.HEADER_VM_CPU])] || 'N/A';
      const memory = row[headers.indexOf(config[K_CONFIG.HEADER_VM_MEMORY])] || 'N/A';
      const disk = row[headers.indexOf(config[K_CONFIG.HEADER_VM_PROV_TB])] || 'N/A';
      
      return `${statusIcon} <b>${vmName}</b> ${criticalityLabel}\n     <code>${cpu} vCPU</code> | <code>${memory} GB RAM</code> | <code>${disk} TB Disk</code>`;
    };
    
    const callbackInfo = {
        navPrefix: `${navPrefix}`,
        exportPrefix: `${exportPrefix}`,
        context: { listType, itemName, originPk }
    };

    const paginatedView = createPaginatedView({
      allItems: results,
      page: page,
      title: `${titlePrefix} "${escapeHtml(itemName)}"`,
      headerContent: headerContent,
      formatEntryCallback: formatVmEntry,
      callbackInfo: callbackInfo
    });

    if (originPk && paginatedView.keyboard) {
        paginatedView.keyboard.inline_keyboard.push([{ text: `⬅️ Kembali ke Detail VM`, callback_data: `${K_CEKVM.BACK_TO_DETAIL_PREFIX}${originPk}` }]);
    }
    
    if (userEvent.message.text !== paginatedView.text || JSON.stringify(userEvent.message.reply_markup) !== JSON.stringify(paginatedView.keyboard)) {
        editMessageText(paginatedView.text, paginatedView.keyboard, chatId, messageId, config);
    }

  } catch (err) {
    const itemNameForError = update.callback_query.sessionData ? update.callback_query.sessionData.itemName : 'N/A';
    const listTypeForError = update.callback_query.sessionData ? update.callback_query.sessionData.listType : 'N/A';
    handleCentralizedError(err, `Daftar VM Paginasi (${listTypeForError}: ${itemNameForError})`, config);
  }
}

/**
 * [REFACTORED - ADAPTIVE EXECUTOR] Mengeksekusi satu pekerjaan ekspor.
 * Memperbaiki bug 'cannot read length' dengan cara beradaptasi terhadap
 * berbagai struktur data hasil (baik 'results' maupun 'history').
 */
function executeExportJob(jobData) {
  try {
    const { config, userData, chatId } = jobData;
    let searchResults;
    let title;
    let headers, results; // Deklarasikan di sini

    // Logika cerdas untuk menentukan metode pencarian
    if (jobData.jobType === 'history') {
        const context = jobData.context;
        searchResults = context.pk 
            ? getVmHistory(context.pk, config) 
            : getCombinedLogs(new Date(0), config); // Ambil semua log jika tidak ada pk
        
        title = context.pk 
            ? `Laporan Riwayat - PK ${context.pk}` 
            : `Laporan Riwayat Perubahan Hari Ini`;
        
        // Logika adaptif untuk menangani struktur data yang berbeda
        headers = searchResults.headers;
        results = searchResults.history || searchResults.data; // Ambil dari 'history' atau 'data'

    } else { // Untuk pekerjaan ekspor non-riwayat
        if (jobData.listType) {
            const { listType, itemName } = jobData;
            const searchFunction = listType === 'cluster' ? searchVmsByCluster : searchVmsByDatastore;
            searchResults = searchFunction(itemName, config);
            const friendlyListType = listType.charAt(0).toUpperCase() + listType.slice(1);
            title = `Laporan VM di ${friendlyListType} - ${itemName}`;
        } else if (jobData.searchTerm) {
            const { searchTerm } = jobData;
            searchResults = searchVmOnSheet(searchTerm, config);
            title = `Laporan Hasil Pencarian - '${searchTerm}'`;
        } else {
            throw new Error("Data pekerjaan ekspor tidak valid.");
        }
        headers = searchResults.headers;
        results = searchResults.results; // Ambil dari 'results'
    }

    if (!results || results.length === 0) {
      kirimPesanTelegram(`ℹ️ Tidak ada data untuk diekspor untuk permintaan: "${title}".`, config, 'HTML', null, chatId);
      return;
    }
    
    exportResultsToSheet(headers, results, title, config, userData);

  } catch (e) {
      console.error(`Gagal mengeksekusi pekerjaan ekspor. Data: ${JSON.stringify(jobData)}. Error: ${e.message}\nStack: ${e.stack}`);
      if (jobData.config && jobData.chatId) {
          const failMessage = `🔴 Maaf, terjadi kesalahan saat memproses file ekspor Anda.\n\n<code>Penyebab: ${escapeHtml(e.message)}</code>`;
          kirimPesanTelegram(failMessage, jobData.config, 'HTML', null, jobData.chatId);
      }
  }
}

/**
 * [NEW v4.5.0] Memproses antrean pekerjaan ekspor.
 * Fungsi ini dirancang untuk dijalankan oleh trigger berbasis waktu. Ia akan memeriksa
 * PropertiesService untuk setiap pekerjaan ekspor yang tertunda dan mengeksekusinya.
 */
function processExportQueue() {
  const properties = PropertiesService.getUserProperties();
  const allKeys = properties.getKeys();
  const jobKeys = allKeys.filter(key => key.startsWith('export_job_'));

  if (jobKeys.length > 0) {
    console.log(`Ditemukan ${jobKeys.length} pekerjaan ekspor dalam antrean. Memulai proses...`);
  }

  for (const key of jobKeys) {
    let jobDataString = null;
    try {
      jobDataString = properties.getProperty(key);
      if (jobDataString) {
        const jobData = JSON.parse(jobDataString);
        executeExportJob(jobData);
      }
    } catch (e) {
      console.error(`Gagal memproses pekerjaan ekspor dengan kunci ${key}. Error: ${e.message}`);
      if (jobDataString) {
        try {
            const jobData = JSON.parse(jobDataString);
            if (jobData.config && jobData.chatId) {
                const failMessage = `🔴 Maaf, terjadi kesalahan saat memproses file ekspor Anda.\n\n<code>Penyebab: ${escapeHtml(e.message)}</code>`;
                kirimPesanTelegram(failMessage, jobData.config, 'HTML', null, jobData.chatId);
            }
        } catch (parseError) {
            console.error("Gagal mengirim notifikasi error karena jobData tidak valid.");
        }
      }
    } finally {
      properties.deleteProperty(key);
      console.log(`Pekerjaan dengan kunci ${key} telah selesai diproses dan dihapus dari antrean.`);
    }
  }
}

/**
 * [HELPER v4.4.0] Mengumpulkan semua data sumber yang diperlukan untuk analisis migrasi.
 * Fungsi ini mengisolasi semua operasi pembacaan dari Google Sheets.
 * @param {object} config Objek konfigurasi yang aktif.
 * @returns {object} Objek yang berisi data yang telah diproses: { allDatastores, allVms, vmHeaders, migrationConfig }.
 */
function _gatherMigrationDataSource(config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // 1. Mengambil Data Datastore
    const dsSheet = ss.getSheetByName(config[K.SHEET_DS]);
    if (!dsSheet) throw new Error(`Sheet datastore '${config[K.SHEET_DS]}' tidak ditemukan.`);
    const dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
    const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
    const dsCapGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
    const dsProvGbIndex = dsHeaders.indexOf(config[K.HEADER_DS_PROV_DS_GB]);
    const dsCapTbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_TB]);
    const dsProvTbIndex = dsHeaders.indexOf(config[K.HEADER_DS_PROV_DS_TB]);

    if ([dsNameIndex, dsCapGbIndex, dsProvGbIndex, dsCapTbIndex, dsProvTbIndex].includes(-1)) {
        throw new Error("Satu atau lebih header penting (Name, Capacity/Provisioned GB/TB) tidak ditemukan di sheet Datastore.");
    }
    const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();

    // 2. Mengambil Logika Migrasi
    const migrationConfig = getMigrationConfig(ss.getSheetByName(config[K.SHEET_LOGIKA_MIGRASI]));

    // 3. Memproses Data Datastore
    const allDatastores = dsData.map(row => {
        const dsName = row[dsNameIndex];
        const capacityGb = parseLocaleNumber(row[dsCapGbIndex]);
        const provisionedGb = parseLocaleNumber(row[dsProvGbIndex]);
        const capacityTb = parseLocaleNumber(row[dsCapTbIndex]);
        const provisionedTb = parseLocaleNumber(row[dsProvTbIndex]);
        const dsInfo = getDsInfo(dsName, migrationConfig);
        return {
            name: dsName, capacityGb, provisionedGb, capacityTb, provisionedTb,
            freeSpace: capacityGb - provisionedGb,
            utilization: capacityGb > 0 ? (provisionedGb / capacityGb * 100) : 0,
            cluster: dsInfo.cluster,
            type: dsInfo.type,
            environment: getEnvironmentFromDsName(dsName, config[K.MAP_ENV])
        };
    });

    // 4. Mengambil Data VM
    const vmSheet = ss.getSheetByName(config[K.SHEET_VM]);
    if (!vmSheet) throw new Error(`Sheet VM '${config[K.SHEET_VM]}' tidak ditemukan.`);
    const vmHeaders = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
    const allVms = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();

    return { allDatastores, allVms, vmHeaders, migrationConfig };
}

/**
 * [HELPER v4.4.0] Mesin inti yang membangun rencana migrasi untuk satu datastore.
 * @param {object} sourceDsInfo Informasi datastore sumber yang over-provisioned.
 * @param {Array} allDatastores Array semua objek datastore.
 * @param {Array} allVms Array semua data VM mentah.
 * @param {Array} vmHeaders Array header untuk data VM.
 * @param {Map} migrationConfig Peta konfigurasi aturan migrasi.
 * @param {object} config Objek konfigurasi yang aktif.
 * @returns {Map} Peta (Map) yang berisi rencana migrasi. Kuncinya adalah nama DS tujuan, nilainya adalah array VM yang akan dipindahkan.
 */
function _buildMigrationPlan(sourceDsInfo, allDatastores, allVms, vmHeaders, migrationConfig, config) {
    const K = KONSTANTA.KUNCI_KONFIG;
    const migrationTargetGb = sourceDsInfo.provisionedGb - sourceDsInfo.capacityGb;
    
    // Indeks header VM
    const vmNameIndex = vmHeaders.indexOf(config[K.HEADER_VM_NAME]);
    const vmProvGbIndex = vmHeaders.indexOf(config[K.HEADER_VM_PROV_GB]);
    const vmStateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
    const vmCritIndex = vmHeaders.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
    const vmDsColumnIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
    const skorKritikalitas = config[K.SKOR_KRITIKALITAS] || {};

    let datastoresInCluster = JSON.parse(JSON.stringify(allDatastores.filter(ds => ds.cluster === sourceDsInfo.cluster)));

    let candidatePool = allVms
        .filter(row => row[vmDsColumnIndex] === sourceDsInfo.name)
        .map(row => ({
            name: row[vmNameIndex],
            provisionedGb: parseLocaleNumber(row[vmProvGbIndex]),
            state: row[vmStateIndex],
            criticality: row[vmCritIndex],
        }));

    const migrationPlan = new Map();
    let totalMigrated = 0;
    const MAX_MIGRATION_LOOPS = 50;
    let loopCount = 0;

    while (totalMigrated < migrationTargetGb && candidatePool.length > 0 && loopCount < MAX_MIGRATION_LOOPS) {
        loopCount++;
        let bestMove = { vmIndex: -1, destDsName: null, efficiencyScore: -Infinity };

        for (let i = 0; i < candidatePool.length; i++) {
            const vm = candidatePool[i];
            const sourceDs = datastoresInCluster.find(ds => ds.name === sourceDsInfo.name);
            const recipients = datastoresInCluster.filter(ds => ds.name !== sourceDs.name && vm.provisionedGb <= ds.freeSpace);
            if (recipients.length === 0) continue;
            
            for (const destDs of recipients) {
                const isValidMove = findBestDestination(sourceDs, vm.provisionedGb, [destDs], migrationConfig, config);
                if (!isValidMove || isValidMove.error) continue;
                
                let benefitScore = 1;
                if (String(vm.state || '').toLowerCase().includes('off')) benefitScore += 10000;
                if (String(vm.name || '').toLowerCase().includes('unused')) benefitScore += 5000;
                const critScore = skorKritikalitas[String(vm.criticality || '').toUpperCase().trim()] || 0;
                benefitScore += (10 - critScore) * 100;
                
                const sizeDifference = Math.abs(vm.provisionedGb - (migrationTargetGb - totalMigrated));
                const cost = 1 + sizeDifference;
                const efficiencyScore = benefitScore / cost;
                
                if (efficiencyScore > bestMove.efficiencyScore) {
                    bestMove = { vmIndex: i, destDsName: destDs.name, efficiencyScore: efficiencyScore };
                }
            }
        }

        if (bestMove.vmIndex !== -1) {
            const vmToMove = candidatePool[bestMove.vmIndex];
            if (!migrationPlan.has(bestMove.destDsName)) {
                migrationPlan.set(bestMove.destDsName, []);
            }
            migrationPlan.get(bestMove.destDsName).push(vmToMove);
            totalMigrated += vmToMove.provisionedGb;
            const destDs = datastoresInCluster.find(ds => ds.name === bestMove.destDsName);
            destDs.freeSpace -= vmToMove.provisionedGb;
            candidatePool.splice(bestMove.vmIndex, 1);
        } else {
            break; // Keluar dari loop jika tidak ada lagi langkah yang bisa diambil
        }
    }
    return migrationPlan;
}

/**
 * [BARU v1.2.0] Menganalisis log historis sebuah VM untuk membuat profil perilaku.
 * @param {Array} history - Array berisi semua baris log untuk satu VM.
 * @param {Array} headers - Array header untuk baris log.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {string} Pesan ringkasan analisis yang sudah diformat HTML.
 */
function analyzeVmProfile(history, headers, config) {
  if (!history || history.length === 0) {
    return ""; // Tidak ada riwayat untuk dianalisis
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

  history.forEach(log => {
    const action = log[actionIndex];
    const timestamp = new Date(log[timestampIndex]);

    if (action === 'MODIFIKASI') {
      modificationCount++;
      if (timestamp > ninetyDaysAgo) {
        recentModificationCount++;
      }
      
      const detail = log[detailIndex] || '';
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
