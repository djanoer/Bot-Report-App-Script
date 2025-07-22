/**
 * @file Pengujian.js
 * @description
 * Berisi suite pengujian unit (Unit Tests). Bertujuan untuk memverifikasi
 * fungsionalitas dari fungsi-fungsi individual secara terisolasi untuk
 * memastikan setiap komponen kecil bekerja sesuai harapan.
 *
 * @section FUNGSI UTAMA
 * - jalankanSemuaTes(): Runner utama untuk mengeksekusi semua pengujian unit.
 * - tesFungsiUtilitas(): Menguji fungsi-fungsi pembantu di file Utilitas.js.
 * - tesFungsiManajemenData(): Menguji fungsi pencarian data di file ManajemenVM.js.
 */

/**
 * ==================================================================
 * FUNGSI PENGUJIAN DIAGNOSTIK UPTIME
 * ==================================================================
 * Tujuan: Fungsi ini secara spesifik menguji logika di dalam
 * `_buildGeneralInfoSection` untuk memecahkan masalah teks uptime.
 *
 * Cara Menggunakan:
 * 1. Pastikan nilai di dalam `MOCK_CONFIG` dan `MOCK_VM_ROW` sesuai
 * dengan data Anda (terutama nama header).
 * 2. Pilih fungsi `jalankanTesUptimeLogic` dari dropdown di atas.
 * 3. Klik "Run".
 * 4. Lihat hasilnya di Log Eksekusi (View > Logs atau Ctrl+Enter).
 */
function jalankanTesUptimeLogic() {
  Logger.log("🚀 MEMULAI PENGUJIAN UPTIME LOGIC SECARA TERISOLASI...");

  // --- 1. SIMULASI DATA ---
  // Kita membuat data palsu yang meniru kondisi nyata.

  // Harap sesuaikan nama header di bawah ini agar SAMA PERSIS
  // dengan nama header di sheet "Data VM" Anda.
  const MOCK_HEADERS = [
    "Primary Key",
    "Virtual Machine",
    "IP Address",
    "State",
    "Uptime",
    "HEADER_VM_CPU",
    "HEADER_VM_MEMORY",
    "HEADER_VM_PROV_GB",
    "HEADER_VM_CLUSTER",
    "HEADER_VM_DATASTORE_COLUMN",
    "HEADER_VM_KRITIKALITAS",
    "HEADER_VM_KELOMPOK_APP",
    "HEADER_VM_DEV_OPS",
    "HEADER_VM_GUEST_OS",
    "HEADER_VM_VCENTER",
    "HEADER_VM_NO_TIKET",
    "HEADER_VM_HOSTS",
    "HEADER_VM_TANGGAL_SETUP",
  ];

  // Data untuk satu baris VM yang akan kita uji.
  // Pastikan nilai 'Uptime' (450) lebih besar dari 'THRESHOLD_VM_UPTIME_DAYS' (365).
  const MOCK_VM_ROW = [
    "VM-TEST-001-VC01",
    "TEST_SERVER_UPTIME",
    "10.0.0.1",
    "poweredOn",
    450,
    "8",
    "16",
    "100",
    "PROD-CLUSTER",
    "DS_PROD_01",
    "CRITICAL",
    "Aplikasi Web",
    "John Doe",
    "Linux",
    "VC01",
    "TICKET-123",
    "HOST-01",
    new Date(),
  ];

  // Simulasi objek konfigurasi dari sheet "Konfigurasi".
  const MOCK_CONFIG = {
    HEADER_VM_PK: "Primary Key",
    HEADER_VM_NAME: "Virtual Machine",
    HEADER_VM_IP: "IP Address",
    HEADER_VM_STATE: "State",
    HEADER_VM_UPTIME: "Uptime",
    THRESHOLD_VM_UPTIME_DAYS: 365, // Pastikan ini adalah angka
  };

  // Membuat objek 'indices' yang seharusnya dibuat oleh kode utama.
  const MOCK_INDICES = {};
  for (const key in MOCK_CONFIG) {
    if (key.startsWith("HEADER_")) {
      MOCK_INDICES[key] = MOCK_HEADERS.indexOf(MOCK_CONFIG[key]);
    }
  }

  // Merakit objek 'vmData' yang akan dikirim ke fungsi yang diuji.
  const mockVmData = {
    row: MOCK_VM_ROW,
    headers: MOCK_HEADERS,
    indices: MOCK_INDICES,
    config: MOCK_CONFIG,
    normalizedPk: "VM-TEST-001",
    vmName: "TEST_SERVER_UPTIME",
  };

  Logger.log("\n--- DATA SIMULASI YANG DIGUNAKAN ---");
  Logger.log("Config Threshold: " + MOCK_CONFIG.THRESHOLD_VM_UPTIME_DAYS);
  Logger.log("VM Uptime: " + MOCK_VM_ROW[MOCK_INDICES.HEADER_VM_UPTIME]);
  Logger.log("------------------------------------\n");

  // --- 2. EKSEKUSI FUNGSI ---
  // Kita memanggil fungsi yang bermasalah dengan data simulasi kita.
  try {
    const hasilSection = _buildGeneralInfoSection(mockVmData);

    // --- 3. HASIL & VERIFIKASI ---
    Logger.log("\n--- HASIL AKHIR DARI FUNGSI ---");
    Logger.log(hasilSection);
    Logger.log("---------------------------------\n");

    if (hasilSection.includes("melebihi ambang batas")) {
      Logger.log("✅ VERIFIKASI BERHASIL: Teks tambahan uptime terdeteksi di dalam hasil.");
    } else {
      Logger.log("❌ VERIFIKASI GAGAL: Teks tambahan uptime TIDAK ditemukan di dalam hasil.");
    }
  } catch (e) {
    Logger.log(`🔥 TERJADI ERROR SAAT EKSEKUSI: ${e.message}\n${e.stack}`);
  }

  Logger.log("🏁 PENGUJIAN SELESAI.");
}

/**
 * ==================================================================
 * FUNGSI PENGUJIAN DIAGNOSTIK /cekstorage (Ringkasan)
 * ==================================================================
 * Tujuan: Fungsi ini secara spesifik menguji logika di dalam
 * `generateStorageUtilizationReport` untuk memecahkan masalah data yang tidak terbaca.
 *
 * Cara Menggunakan:
 * 1. Pastikan Anda sudah menempelkan versi diagnostik dari
 * `generateStorageUtilizationReport` di file Laporan.js.
 * 2. Pilih fungsi `jalankanTesCekStorageRingkas` dari dropdown di atas.
 * 3. Klik "Run".
 * 4. Lihat hasilnya di Log Eksekusi (View > Logs atau Ctrl+Enter).
 */
function jalankanTesCekStorageRingkas() {
  Logger.log("🚀 MEMULAI PENGUJIAN /cekstorage (RINGKASAN) SECARA TERISOLASI...");

  // --- 1. SIMULASI DATA ---
  // Kita membuat data palsu yang meniru kondisi nyata dari sheet Anda.

  const MOCK_CONFIG = {
    MAP_KAPASITAS_STORAGE: {
      VSPA: 150.0,
      VSPB: 150.0,
      "ALTR.A": 247.5,
      // Tambahkan tipe storage lain jika perlu diuji
    },
    MAP_ALIAS_STORAGE: {
      "VSP E790 A": ["VSPA", "COM"],
      "VSP E790 B": ["VSPB"],
      "HPE STORAGE ALLETRA A": ["ALTR.A"],
      // Tambahkan alias lain jika perlu diuji
    },
    STORAGE_UTILIZATION_THRESHOLDS: { warning: 75, critical: 90 },
  };

  // Simulasi data dari sheet "Log Storage Historis"
  const MOCK_STORAGE_LOGS = {
    headers: ["Timestamp", "Storage Name", "Storage Alias", "Usage (TB)"],
    data: [
      // Entri ini HARUS ditemukan untuk VSPA karena mengandung alias "COM"
      [new Date(), "Storage VSP E790 A (COM)", "COM, VSPA", 75.5],
      // Entri ini HARUS ditemukan untuk ALTR.A
      [new Date(), "HPE STORAGE ALLETRA A", "ALTR.A", 41.0],
      // Entri ini untuk VSPB, sengaja dibuat lebih lama
      [new Date(new Date().getTime() - 86400000), "Storage VSP E790 B", "VSPB", 30.0],
      // Entri duplikat yang lebih lama untuk VSPA, seharusnya diabaikan
      [new Date(new Date().getTime() - 86400000), "Storage VSP E790 A (VSPA)", "VSPA", 70.0],
    ],
  };

  Logger.log("\n--- DATA SIMULASI YANG DIGUNAKAN ---");
  Logger.log("Kunci Kapasitas: " + Object.keys(MOCK_CONFIG.MAP_KAPASITAS_STORAGE).join(", "));
  Logger.log("Jumlah Log: " + MOCK_STORAGE_LOGS.data.length);
  Logger.log("------------------------------------\n");

  // --- 2. EKSEKUSI FUNGSI ---
  // Kita memanggil fungsi yang bermasalah dengan data simulasi kita.
  try {
    // Kita juga perlu memalsukan `getCombinedStorageLogs` agar mengembalikan data palsu kita
    const original_getCombinedStorageLogs = getCombinedStorageLogs;
    getCombinedStorageLogs = function (config, days) {
      Logger.log(
        `==> getCombinedStorageLogs (palsu) dipanggil. Mengembalikan ${MOCK_STORAGE_LOGS.data.length} baris log.`
      );
      return MOCK_STORAGE_LOGS;
    };

    const hasilLaporan = generateStorageUtilizationReport(MOCK_CONFIG);

    // Kembalikan fungsi asli setelah selesai
    getCombinedStorageLogs = original_getCombinedStorageLogs;

    // --- 3. HASIL & VERIFIKASI ---
    Logger.log("\n--- HASIL AKHIR DARI FUNGSI ---");
    Logger.log(hasilLaporan);
    Logger.log("---------------------------------\n");

    if (hasilLaporan.includes("VSPA") && hasilLaporan.includes("75.5 / 150.0 TB")) {
      Logger.log("✅ VERIFIKASI VSPA BERHASIL: Data ditemukan dan ditampilkan dengan benar.");
    } else {
      Logger.log("❌ VERIFIKASI VSPA GAGAL: Data untuk VSPA tidak ditemukan atau salah.");
    }
    if (hasilLaporan.includes("VSPB") && hasilLaporan.includes("30.0 / 150.0 TB")) {
      Logger.log("✅ VERIFIKASI VSPB BERHASIL: Data ditemukan dan ditampilkan dengan benar.");
    } else {
      Logger.log("❌ VERIFIKASI VSPB GAGAL: Data untuk VSPB tidak ditemukan atau salah.");
    }
  } catch (e) {
    Logger.log(`🔥 TERJADI ERROR SAAT EKSEKUSI: ${e.message}\n${e.stack}`);
  }

  Logger.log("🏁 PENGUJIAN SELESAI.");
}

// Pustaka ini diperlukan untuk membuat objek spreadsheet palsu untuk pengujian.
const Mocks = (function () {
  function MockSheet(name, data) {
    this.name = name;
    this.data = data || [[]];
    this.lastRow = this.data.length;
    this.lastCol = this.data.length > 0 ? this.data[0].length : 0;

    this.getName = function () {
      return this.name;
    };
    this.getLastRow = function () {
      return this.lastRow;
    };
    this.getLastColumn = function () {
      return this.lastCol;
    };
    this.getRange = function (row, col, numRows, numCols) {
      const rangeData = [];
      const endRow = row + (numRows || 1) - 1;
      const endCol = col + (numCols || 1) - 1;

      for (let i = row - 1; i < endRow && i < this.lastRow; i++) {
        const rowData = [];
        for (let j = col - 1; j < endCol && j < this.lastCol; j++) {
          rowData.push(this.data[i][j]);
        }
        rangeData.push(rowData);
      }

      return {
        getValues: function () {
          return rangeData;
        },
        getValue: function () {
          return rangeData.length > 0 ? rangeData[0][0] : null;
        },
      };
    };
    this.getDataRange = function () {
      return this.getRange(1, 1, this.lastRow, this.lastCol);
    };
  }

  function MockSpreadsheet(sheets) {
    this.sheets = sheets || [];
    this.getSheetByName = function (name) {
      return this.sheets.find((s) => s.getName() === name) || null;
    };
  }

  return {
    createMockSpreadsheet: function (sheetData) {
      const mockSheets = Object.keys(sheetData).map((name) => new MockSheet(name, sheetData[name]));
      return new MockSpreadsheet(mockSheets);
    },
  };
})();

// --- Suite Pengujian Unit ---

/**
 * FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk memulai semua pengujian unit.
 */
function jalankanSemuaTes() {
  console.log("Memulai Pengujian Unit...");

  tesFungsiUtilitas();
  tesFungsiManajemenData();

  console.log("Pengujian Unit Selesai.");
}

/**
 * Fungsi pembantu untuk membandingkan hasil yang diharapkan dengan hasil aktual.
 */
function assertEquals(expected, actual, testName) {
  // Membandingkan dengan mengubah keduanya menjadi string untuk konsistensi
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    console.error(`❌ GAGAL: ${testName}.`);
    console.error(`   - Diharapkan: ${JSON.stringify(expected)}`);
    console.error(`   - Hasil:      ${JSON.stringify(actual)}`);
  } else {
    console.log(`✅ LULUS: ${testName}`);
  }
}

// --- Grup Tes untuk Utilitas.gs ---
// Praktik yang baik adalah mengelompokkan tes berdasarkan file yang diuji.
function tesFungsiUtilitas() {
  console.log("\n--- Menguji File: Utilitas.gs ---");

  // Tes untuk fungsi normalizePrimaryKey
  assertEquals("VM-123", normalizePrimaryKey("VM-123-VC01"), "normalizePrimaryKey: Suffix -VC01");
  assertEquals("VM-ABC", normalizePrimaryKey("VM-ABC-VC10"), "normalizePrimaryKey: Suffix -VC10");
  assertEquals("VM-NO-SUFFIX", normalizePrimaryKey("VM-NO-SUFFIX"), "normalizePrimaryKey: Tanpa Suffix");
  assertEquals("VM-TRIM", normalizePrimaryKey(" VM-TRIM  "), "normalizePrimaryKey: Dengan spasi di awal/akhir");
  assertEquals("", normalizePrimaryKey(null), "normalizePrimaryKey: Input null");

  // Tes untuk fungsi parseLocaleNumber
  assertEquals(1234.56, parseLocaleNumber("1,234.56"), "parseLocaleNumber: Format US (1,234.56)");
  assertEquals(1234.56, parseLocaleNumber("1.234,56"), "parseLocaleNumber: Format Eropa (1.234,56)");
  assertEquals(100, parseLocaleNumber("100"), "parseLocaleNumber: Angka bulat");
  assertEquals(95.5, parseLocaleNumber("95,5%"), "parseLocaleNumber: Dengan simbol %");
  assertEquals(0, parseLocaleNumber("Teks Acak"), "parseLocaleNumber: Input teks acak");
}

// --- Grup Tes untuk ManajemenData.js ---
function tesFungsiManajemenData() {
  console.log("\n--- Menguji File: ManajemenData.js ---");

  // 1. Menyiapkan data tiruan
  const mockSheetData = {
    [KONSTANTA.NAMA_SHEET.KONFIGURASI]: [
      ["Kunci", "Nilai"],
      [KONSTANTA.KUNCI_KONFIG.SHEET_VM, "Data VM Utama"],
      [KONSTANTA.KUNCI_KONFIG.HEADER_VM_PK, "Id"],
      [KONSTANTA.KUNCI_KONFIG.HEADER_VM_NAME, "Name"],
      [KONSTANTA.KUNCI_KONFIG.HEADER_VM_IP, "IP Address"],
    ],
    "Data VM Utama": [
      ["Id", "Name", "IP Address", "Cluster"],
      ["VM-001-VC01", "WEB_SERVER_01", "192.168.1.10", "ClusterA"],
      ["VM-002-VC01", "DB_SERVER_01", "192.168.1.20", "ClusterA"],
      ["VM-003-VC02", "WEB_SERVER_02", "10.0.0.5", "ClusterB"],
    ],
  };

  // 2. Membuat objek tiruan SpreadsheetApp
  // Ini menggantikan SpreadsheetApp.getActiveSpreadsheet() yang asli
  const mockSpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return Mocks.createMockSpreadsheet(mockSheetData);
    },
  };

  // 3. Menjalankan tes pada searchVmOnSheet

  // Tes 1: Pencarian berdasarkan nama
  let { results: results1 } = searchVmOnSheet_testable("WEB_SERVER", mockSpreadsheetApp);
  assertEquals(2, results1.length, "searchVmOnSheet: Menemukan 2 VM 'WEB_SERVER'");

  // Tes 2: Pencarian berdasarkan PK yang dinormalisasi
  let { results: results2 } = searchVmOnSheet_testable("VM-002", mockSpreadsheetApp);
  assertEquals(1, results2.length, "searchVmOnSheet: Menemukan 1 VM dengan PK 'VM-002'");
  assertEquals("DB_SERVER_01", results2[0][1], "searchVmOnSheet: Nama VM dengan PK 'VM-002' sudah benar");

  // Tes 3: Pencarian tidak menemukan hasil
  let { results: results3 } = searchVmOnSheet_testable("TIDAK_ADA", mockSpreadsheetApp);
  assertEquals(0, results3.length, "searchVmOnSheet: Tidak menemukan hasil");
}

/**
 * Versi "testable" dari searchVmOnSheet yang menerima mock object
 * sebagai parameter (Dependency Injection).
 */
function searchVmOnSheet_testable(searchTerm, mockApp) {
  // Di sini, kita "menyuntikkan" mockApp kita
  const ss = mockApp.getActiveSpreadsheet();

  // Logika di bawah ini sama persis dengan fungsi aslinya,
  // tetapi sekarang berjalan di atas data tiruan kita.
  const configSheet = ss.getSheetByName(KONSTANTA.NAMA_SHEET.KONFIGURASI);
  const configData = configSheet.getDataRange().getValues();
  const config = Object.fromEntries(configData.slice(1));

  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
  const sheet = ss.getSheetByName(sheetName);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allData =
    sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues() : [];

  const pkIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_PK]);
  const nameIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_NAME]);
  const ipIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_IP]);

  const searchLower = searchTerm.toLowerCase().trim();
  const normalizedSearchTerm = normalizePrimaryKey(searchLower);

  const results = allData.filter((row) => {
    const vmPk = normalizePrimaryKey(String(row[pkIndex] || "")).toLowerCase();
    const vmName = String(row[nameIndex] || "").toLowerCase();
    const vmIp = String(row[ipIndex] || "").toLowerCase();
    return vmPk.includes(normalizedSearchTerm) || vmName.includes(searchLower) || vmIp.includes(searchLower);
  });

  return { headers, results };
}
