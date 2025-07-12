// ===== FILE: Datastore.gs =====

/**
 * [MODIFIKASI v3.1] Fungsi kini membaca daftar kolom pantau dari sheet "Konfigurasi",
 * membuatnya menjadi fleksibel dan tidak lagi hardcoded.
 */
function jalankanPemeriksaanDatastore(config) {
  console.log("Memulai pemeriksaan perubahan datastore...");
  try {
    const sheetName = config["NAMA_SHEET_DATASTORE"];
    if (!sheetName) {
      console.warn("Pemeriksaan datastore dibatalkan: 'NAMA_SHEET_DATASTORE' tidak diatur di Konfigurasi.");
      return null;
    }

    const archiveFileName = KONSTANTA.NAMA_FILE.ARSIP_DS;
    const primaryKeyHeader = config["HEADER_DATASTORE_NAME"];

    // --- AWAL MODIFIKASI: Membaca kolom pantau dari konfigurasi ---
    // Membaca dari kunci baru yang kita definisikan
    const kolomDsUntukDipantau = config[KONSTANTA.KUNCI_KONFIG.KOLOM_PANTAU_DS] || [];
    // Mengubahnya menjadi format yang dimengerti oleh processDataChanges
    const columnsToTrack = kolomDsUntukDipantau.map((namaKolom) => ({ nama: namaKolom }));

    if (columnsToTrack.length === 0) {
      console.warn("Pemeriksaan datastore dilewati: 'KOLOM_PANTAU_DATASTORE' tidak diatur atau kosong di Konfigurasi.");
      return null;
    }

    console.log(`Memantau perubahan pada sheet: '${sheetName}'`);
    console.log(`Kolom datastore yang dipantau: '${kolomDsUntukDipantau.join(", ")}'`);
    // --- AKHIR MODIFIKASI ---

    const logEntriesToAdd = processDataChanges(
      config,
      sheetName,
      archiveFileName,
      primaryKeyHeader,
      columnsToTrack,
      KONSTANTA.NAMA_ENTITAS.DATASTORE
    );

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

// ===== FILE: Datastore.js (v3.5.0 - FINAL & ROBUST) =====

/**
 * [REFACTORED v3.5.0 - FINAL & ROBUST] Mengambil detail lengkap datastore dengan header dinamis dan validasi proaktif.
 * Fungsi ini tidak akan gagal secara senyap dan akan melaporkan kesalahan konfigurasi header.
 * @param {string} dsName - Nama datastore yang akan dicari.
 * @param {object} config - Objek konfigurasi bot yang aktif.
 * @returns {object|null} Objek berisi detail datastore, atau null jika tidak ditemukan.
 */
function getDatastoreDetails(dsName, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_DS]);
  if (!dsSheet) throw new Error(`Sheet datastore '${config[K.SHEET_DS]}' tidak ditemukan.`);

  const dsHeaders = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];

  const requiredHeaders = {
    dsName: config[K.DS_NAME_HEADER],
    capacityGb: config[K.HEADER_DS_CAPACITY_GB],
    provisionedGb: config[K.HEADER_DS_PROV_DS_GB],
    capacityTb: config[K.HEADER_DS_CAPACITY_TB], // Menggunakan kunci yang sudah benar
    provisionedTb: config[K.HEADER_DS_PROV_DS_TB],
  };

  const indices = {};
  for (const key in requiredHeaders) {
    if (!requiredHeaders[key]) {
      throw new Error(
        `Kunci konfigurasi untuk '${key}' tidak ditemukan. Pastikan semua kunci HEADER_DS... telah diatur di sheet Konfigurasi.`
      );
    }
    indices[key] = dsHeaders.indexOf(requiredHeaders[key]);
    if (indices[key] === -1) {
      throw new Error(
        `Header '${requiredHeaders[key]}' tidak ditemukan di sheet Datastore atau tidak diatur dengan benar di Konfigurasi.`
      );
    }
  }
  // --- [AKHIR VALIDASI] ---

  const allDsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
  const dsRow = allDsData.find((row) => String(row[indices.dsName] || "").toLowerCase() === dsName.toLowerCase());

  if (!dsRow) return null;

  // Mencari jumlah VM (logika tidak berubah)
  const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_VM]);
  let vmCount = 0;
  if (vmSheet) {
    const vmHeaders = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
    const vmDsIndex = vmHeaders.indexOf(config[K.VM_DS_COLUMN_HEADER]);
    if (vmDsIndex !== -1) {
      const allVmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();
      vmCount = allVmData.filter((row) => String(row[vmDsIndex] || "") === dsName).length;
    }
  }

  // Perhitungan sekarang dijamin aman karena indeks sudah divalidasi
  const capacityGb = parseLocaleNumber(dsRow[indices.capacityGb]);
  const provisionedGb = parseLocaleNumber(dsRow[indices.provisionedGb]);
  const capacityTb = parseLocaleNumber(dsRow[indices.capacityTb]);
  const provisionedTb = parseLocaleNumber(dsRow[indices.provisionedTb]);

  const usagePercent = capacityGb > 0 ? (provisionedGb / capacityGb) * 100 : 0;
  const migrationConfig = getMigrationConfig(
    SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_LOGIKA_MIGRASI])
  );

  return {
    name: dsName,
    ...getDsInfo(dsName, migrationConfig),
    environment: getEnvironmentFromDsName(dsName, config[K.MAP_ENV]),
    capacityGb: capacityGb,
    provisionedGb: provisionedGb,
    freeGb: capacityGb - provisionedGb,
    capacityTb: capacityTb,
    provisionedTb: provisionedTb,
    freeTb: capacityTb - provisionedTb,
    usagePercent: usagePercent,
    vmCount: vmCount,
  };
}
