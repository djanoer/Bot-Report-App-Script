// ===== FILE: Datastore.gs =====

/**
 * [MODIFIKASI v3.1] Fungsi kini membaca daftar kolom pantau dari sheet "Konfigurasi",
 * membuatnya menjadi fleksibel dan tidak lagi hardcoded.
 */
function jalankanPemeriksaanDatastore(config) {
  console.log("Memulai pemeriksaan perubahan datastore...");
  try {
    const sheetName = config['NAMA_SHEET_DATASTORE'];
    if (!sheetName) {
      console.warn("Pemeriksaan datastore dibatalkan: 'NAMA_SHEET_DATASTORE' tidak diatur di Konfigurasi.");
      return null;
    }

    const archiveFileName = KONSTANTA.NAMA_FILE.ARSIP_DS;
    const primaryKeyHeader = config['HEADER_DATASTORE_NAME'];

    // --- AWAL MODIFIKASI: Membaca kolom pantau dari konfigurasi ---
    // Membaca dari kunci baru yang kita definisikan
    const kolomDsUntukDipantau = config[KONSTANTA.KUNCI_KONFIG.KOLOM_PANTAU_DS] || [];
    // Mengubahnya menjadi format yang dimengerti oleh processDataChanges
    const columnsToTrack = kolomDsUntukDipantau.map(namaKolom => ({ nama: namaKolom }));

    if (columnsToTrack.length === 0) {
        console.warn("Pemeriksaan datastore dilewati: 'KOLOM_PANTAU_DATASTORE' tidak diatur atau kosong di Konfigurasi.");
        return null;
    }

    console.log(`Memantau perubahan pada sheet: '${sheetName}'`);
    console.log(`Kolom datastore yang dipantau: '${kolomDsUntukDipantau.join(', ')}'`);
    // --- AKHIR MODIFIKASI ---

    const logEntriesToAdd = processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, KONSTANTA.NAMA_ENTITAS.DATASTORE);

    if (logEntriesToAdd.length > 0) {
      const pesanNotifikasi = `🔔 Terdeteksi ${logEntriesToAdd.length} perubahan pada infrastruktur ${KONSTANTA.NAMA_ENTITAS.DATASTORE}. Silakan cek /cekhistory untuk detail.`;
      console.log(pesanNotifikasi);
      return pesanNotifikasi;
    } else {
      console.log("Tidak ada perubahan pada data datastore yang terdeteksi.");
      return null;
    }
  } catch (e) {
    throw new Error(`Gagal Menjalankan Pemeriksaan Datastore. Penyebab: ${e.message}`);
  }
}

/**
 * [MODIFIKASI FINAL] Mengambil detail lengkap datastore, menggunakan konstanta terpusat untuk semua header.
 * @param {string} dsName - Nama datastore yang akan dicari.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object|null} Objek berisi detail datastore, atau null jika tidak ditemukan.
 */
function getDatastoreDetails(dsName, config) {
  const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
  if (!dsSheet) throw new Error(`Sheet datastore '${config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]}' tidak ditemukan.`);

  const dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
  const allDsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();

  const dsNameIndex = dsHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
  const dsRow = allDsData.find(row => String(row[dsNameIndex] || '').toLowerCase() === dsName.toLowerCase());

  if (!dsRow) return null;

  const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  let vmCount = 0;
  if (vmSheet) {
    const vmHeaders = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
    const vmDsIndex = vmHeaders.indexOf(config[KONSTANTA.KUNCI_KONFIG.VM_DS_COLUMN_HEADER]);
    if (vmDsIndex !== -1) {
      const allVmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();
      vmCount = allVmData.filter(row => String(row[vmDsIndex] || '') === dsName).length;
    }
  }

  // --- [PERUBAHAN UTAMA DIMULAI DI SINI] ---
  // Menggunakan konstanta dari KONSTANTA.HEADER_DS
  const capacityGb = parseFloat(dsRow[dsHeaders.indexOf(KONSTANTA.HEADER_DS.CAPACITY_GB)]) || 0;
  const provisionedGb = parseFloat(dsRow[dsHeaders.indexOf(KONSTANTA.HEADER_DS.PROV_DS_GB)]) || 0;
  const usagePercent = capacityGb > 0 ? (provisionedGb / capacityGb * 100) : 0;
  
  const capacityTbIndex = dsHeaders.indexOf(KONSTANTA.HEADER_DS.CAPACITY_TB);
  const provisionedTbIndex = dsHeaders.indexOf(KONSTANTA.HEADER_DS.PROV_DS_TB);

  const capacityTb = capacityTbIndex !== -1 ? parseFloat(dsRow[capacityTbIndex]) : 0;
  const provisionedTb = provisionedTbIndex !== -1 ? parseFloat(dsRow[provisionedTbIndex]) : 0;
  // --- [PERUBAHAN UTAMA SELESAI] ---

  const migrationConfig = getMigrationConfig(SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_LOGIKA_MIGRASI]));

  return {
    name: dsName,
    ...getDsInfo(dsName, migrationConfig),
    environment: getEnvironmentFromDsName(dsName, config[KONSTANTA.KUNCI_KONFIG.MAP_ENV]),
    capacityGb: capacityGb,
    provisionedGb: provisionedGb,
    freeGb: capacityGb - provisionedGb,
    capacityTb: capacityTb,
    provisionedTb: provisionedTb,
    freeTb: capacityTb - provisionedTb,
    usagePercent: usagePercent,
    vmCount: vmCount
  };
}

/**
 * [MODIFIKASI FINAL] Memformat detail datastore dengan format bold pada label dan italic pada satuan TB.
 * @param {object} details - Objek detail datastore dari getDatastoreDetails.
 * @returns {object} Objek berisi { pesan: string, keyboard: object|null }.
 */
function formatDatastoreDetail(details) {
  if (!details) {
    return { pesan: "❌ Detail untuk datastore tersebut tidak dapat ditemukan.", keyboard: null };
  }

  const addDetail = (value, icon, label, isCode = false) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      const formattedValue = isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
      return `• ${icon} <b>${label}:</b> ${formattedValue}\n`;
    }
    return `• ${icon} <b>${label}:</b> N/A\n`;
  };

  let message = `🗄️  <b>Detail Datastore</b>\n`;
  message += `------------------------------------\n`;
  message += `<b>Informasi Umum</b>\n`;
  message += addDetail(details.name, '🏷️', 'Nama', true);
  message += addDetail(details.cluster, '☁️', 'Cluster');
  message += addDetail(details.environment, '🌍', 'Environment');
  message += addDetail(details.type, '⚙️', 'Tipe');
  
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
  message += addDetail(`${details.vmCount} VM`, '🖥️', 'Jumlah VM');

  let keyboard = null;
  if (details.vmCount > 0) {
    const actionButtons = [
        { text: `📄 Lihat Daftar VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_LIST_VMS_PREFIX}${details.name}` },
        { text: `📥 Ekspor Daftar VM`, callback_data: `${KONSTANTA.CALLBACK_CEKVM.DATASTORE_EXPORT_PREFIX}${details.name}` }
    ];
    keyboard = {
      inline_keyboard: [ actionButtons ]
    };
  }

  return { pesan: message, keyboard: keyboard };
}
