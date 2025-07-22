/**
 * @file PengujianSistem.js
 * @description
 * Pusat untuk semua pengujian sistem dan integrasi (End-to-End).
 * File ini mensimulasikan interaksi pengguna nyata dan memverifikasi
 * alur kerja lengkap dari awal hingga akhir, seperti memanggil perintah bot
 * dan memastikan respons yang benar diterima.
 *
 * @section FUNGSI UTAMA
 * - jalankanSemuaTesSistem(): Runner utama untuk mengeksekusi semua skenario pengujian sistem.
 * - testAlurCekVmDanDetail(): Mensimulasikan alur perintah /carivm.
 * - testAlurEksporLengkap(): Mensimulasikan alur permintaan ekspor dari menu hingga antrean.
 */

/**
 * ==================================================================
 * FUNGSI PENGUJIAN DIAGNOSTIK UNTUK ALUR /manageconfig
 * ==================================================================
 * Tujuan: Fungsi ini mensimulasikan seluruh alur dari pengguna menekan
 * tombol kategori hingga diproses oleh doPost untuk menemukan titik kegagalan.
 *
 * Cara Menggunakan:
 * 1. Pastikan Anda telah menerapkan perbaikan terakhir pada `doPost` di `Utama.js`.
 * 2. Pilih fungsi `jalankanTesAlurConfigManager` dari dropdown di atas.
 * 3. Klik "Run".
 * 4. Lihat hasilnya di Log Eksekusi (View > Logs atau Ctrl+Enter).
 */
function jalankanTesAlurConfigManager() {
  Logger.log("🚀 MEMULAI PENGUJIAN END-TO-END UNTUK ALUR /manageconfig...");

  // --- 1. SIMULASI LINGKUNGAN (MOCKING) ---
  // Kita akan mengganti layanan global sementara agar bisa mengontrolnya.
  const originalUrlFetchApp = UrlFetchApp;
  const originalCacheService = CacheService;

  let capturedEditMessagePayload = null; // Variabel untuk menangkap output

  // Ganti UrlFetchApp dengan versi palsu yang hanya mencatat panggilan
  UrlFetchApp = {
    fetch: function (url, params) {
      if (url.includes("editMessageText")) {
        Logger.log("==> [MOCK] Panggilan ke 'editMessageText' terdeteksi.");
        capturedEditMessagePayload = JSON.parse(params.payload);
      }
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true }) };
    },
  };

  // Ganti CacheService dengan versi palsu yang bisa kita kontrol
  let mockCache = {};
  CacheService = {
    getScriptCache: function () {
      return {
        get: function (key) {
          return mockCache[key] || null;
        },
        put: function (key, value, exp) {
          mockCache[key] = value;
        },
      };
    },
  };

  try {
    // --- 2. SIMULASI AKSI PENGGUNA ---
    Logger.log("\n--- TAHAP 1: Menyiapkan Sesi & Callback ---");

    // Dapatkan konfigurasi nyata untuk membuat callback yang valid
    const state = getBotState();
    const config = state.config;

    // Pengguna menekan tombol "Thresholds & Peringatan"
    const targetCategory = "thresholds";
    const callbackDataString = CallbackHelper.build(
      "config_machine",
      "show_category",
      { category: targetCategory },
      config
    );
    Logger.log(`Callback Data yang Dihasilkan: ${callbackDataString}`);

    // Buat objek 'update' palsu seolah-olah dari Telegram
    const mockUpdate = {
      callback_query: {
        id: "1234567890123456789",
        from: { id: 1, is_bot: false, first_name: "AdminTester" },
        message: { message_id: 987, chat: { id: -1001, type: "group" }, text: "Pesan Menu Utama" },
        chat_instance: "123",
        data: callbackDataString,
      },
    };

    // Buat objek 'event' palsu seolah-olah dari Webhook
    const mockEvent = {
      postData: { contents: JSON.stringify(mockUpdate) },
      parameter: { token: config.WEBHOOK_BOT_TOKEN },
    };

    Logger.log("\n--- TAHAP 2: Mengeksekusi doPost dengan Data Simulasi ---");
    doPost(mockEvent); // Panggil fungsi utama kita

    // --- 3. HASIL & VERIFIKASI ---
    Logger.log("\n--- TAHAP 3: Menganalisis Hasil ---");
    if (capturedEditMessagePayload) {
      Logger.log("✅ VERIFIKASI BERHASIL: Fungsi 'editMessageText' berhasil dipanggil.");
      Logger.log("Teks yang akan dikirim ke pengguna:");
      Logger.log(capturedEditMessagePayload.text);
      if (capturedEditMessagePayload.text.includes("Kategori: Thresholds & Peringatan")) {
        Logger.log("✅ KONTEN VALID: Pesan berisi judul kategori yang benar.");
      } else {
        Logger.log("❌ KONTEN TIDAK VALID: Pesan tidak berisi judul kategori yang diharapkan.");
      }
    } else {
      Logger.log(
        "❌ VERIFIKASI GAGAL: Fungsi 'editMessageText' TIDAK pernah dipanggil. Ini berarti alur terputus di suatu tempat di dalam doPost."
      );
    }
  } catch (e) {
    Logger.log(`🔥 TERJADI ERROR KRITIS SAAT PENGUJIAN: ${e.message}\n${e.stack}`);
  } finally {
    // Kembalikan layanan asli, ini sangat penting!
    UrlFetchApp = originalUrlFetchApp;
    CacheService = originalCacheService;
    Logger.log("\n🏁 PENGUJIAN SELESAI. Layanan asli telah dipulihkan.");
  }
}

// =================================================================================
// BAGIAN 1: KERANGКА KERJA PENGUJIAN & MOCKS
// =================================================================================

// Objek Mock Global untuk meniru layanan Google, Telegram, dan Spreadsheet
const MockServices = {
  UrlFetchApp: {
    _requests: [],
    fetch: function (url, params) {
      this._requests.push({ url, params });
      return {
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ ok: true, result: { message_id: 12345 } }),
      };
    },
    getLastRequest: function () {
      return this._requests[this._requests.length - 1];
    },
    clear: function () {
      this._requests = [];
    },
  },
  CacheService: {
    _cache: {},
    getScriptCache: function () {
      return this;
    },
    get: function (key) {
      return this._cache[key] || null;
    },
    put: function (key, value, exp) {
      this._cache[key] = value;
    },
    remove: function (key) {
      delete this._cache[key];
    },
    removeAll: function (keys) {
      keys.forEach((key) => delete this._cache[key]);
    },
    clear: function () {
      this._cache = {};
    },
  },
  SpreadsheetApp: {
    _sheets: {},
    getActiveSpreadsheet: function () {
      return this;
    },
    getSheetByName: function (name) {
      if (!this._sheets[name]) {
        console.warn(`PERINGATAN UJI: Upaya untuk mengakses sheet palsu '${name}' yang belum disiapkan.`);
        return null;
      }
      return this._sheets[name];
    },
    setSheetData: function (sheetName, data) {
      const sheetData = JSON.parse(JSON.stringify(data));
      this._sheets[sheetName] = {
        _data: sheetData,
        getName: function () {
          return sheetName;
        },
        getLastRow: function () {
          return this._data.length;
        },
        getLastColumn: function () {
          return this._data[0] ? this._data[0].length : 0;
        },
        getDataRange: function () {
          return { getValues: () => JSON.parse(JSON.stringify(this._data)) };
        },
        getRange: function (row, col, numRows, numCols) {
          const self = this;
          return {
            getValues: function () {
              const slicedData = self._data.slice(row - 1, row - 1 + numRows);
              return slicedData.map((r) => r.slice(col - 1, col - 1 + numCols));
            },
          };
        },
      };
    },
    clear: function () {
      this._sheets = {};
    },
  },
  PropertiesService: {
    _props: {},
    getScriptProperties: function () {
      return this;
    },
    getProperty: function (key) {
      return this._props[key];
    },
    setProperty: function (key, value) {
      this._props[key] = value;
    },
    deleteProperty: function (key) {
      delete this._props[key];
    },
    getKeys: function () {
      return Object.keys(this._props);
    },
  },
};

/**
 * FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk memulai semua pengujian sistem.
 */
function jalankanSemuaTesSistem() {
  console.log("🚀 Memulai Pengujian Sistem End-to-End...");

  // Simpan layanan asli untuk dipulihkan nanti
  const originalUrlFetchApp = typeof UrlFetchApp !== "undefined" ? UrlFetchApp : undefined;
  const originalCacheService = typeof CacheService !== "undefined" ? CacheService : undefined;
  const originalSpreadsheetApp = typeof SpreadsheetApp !== "undefined" ? SpreadsheetApp : undefined;
  const originalPropertiesService = typeof PropertiesService !== "undefined" ? PropertiesService : undefined;
  const originalExportResultsToSheet = typeof exportResultsToSheet !== "undefined" ? exportResultsToSheet : undefined;

  // Ganti layanan asli dengan mock
  UrlFetchApp = MockServices.UrlFetchApp;
  CacheService = MockServices.CacheService;
  SpreadsheetApp = MockServices.SpreadsheetApp;
  PropertiesService = MockServices.PropertiesService;

  let allTestsPassed = true;

  try {
    // Menjalankan setiap skenario pengujian
    testAlurCekVmDanDetail();
    testAlurEksporLengkap(); // Skenario baru yang digabungkan
  } catch (e) {
    allTestsPassed = false;
    console.error(`\n🔥 PENGUJIAN GAGAL PADA SALAH SATU SKENARIO: ${e.message}\n${e.stack}`);
  } finally {
    // Kembalikan semua layanan asli
    if (typeof UrlFetchApp !== "undefined") UrlFetchApp = originalUrlFetchApp;
    if (typeof CacheService !== "undefined") CacheService = originalCacheService;
    if (typeof SpreadsheetApp !== "undefined") SpreadsheetApp = originalSpreadsheetApp;
    if (typeof PropertiesService !== "undefined") PropertiesService = originalPropertiesService;
    if (typeof exportResultsToSheet !== "undefined") exportResultsToSheet = originalExportResultsToSheet;

    if (allTestsPassed) {
      console.log("\n🎉 SEMUA SKENARIO PENGUJIAN SISTEM LULUS!");
    } else {
      console.log("\n❌ BEBERAPA SKENARIO PENGUJIAN GAGAL. Silakan periksa log di atas.");
    }
    console.log("✅ Pengujian Sistem Selesai.");
  }
}

// =================================================================
// SKENARIO PENGUJIAN
// =================================================================

function testAlurCekVmDanDetail() {
  console.log("\n🧪 MENGUJI: Alur /cekvm -> Detail VM");

  // --- SETUP LINGKUNGAN UJI ---
  MockServices.UrlFetchApp.clear();
  MockServices.CacheService.clear();
  MockServices.SpreadsheetApp.clear();
  clearBotStateCache();

  const mockConfigData = [
    ["Kunci", "Nilai"],
    ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji Coba"],
    ["HEADER_VM_PK", "Primary Key"],
    ["HEADER_VM_NAME", "Virtual Machine"],
    ["HEADER_VM_IP", "IP Address"],
    ["HEADER_VM_STATE", "State"],
    ["HEADER_VM_UPTIME", "Uptime"],
    ["HEADER_VM_CPU", "CPU"],
    ["HEADER_VM_MEMORY", "Memory"],
    ["HEADER_VM_PROV_GB", "Provisioned (GB)"],
    ["HEADER_VM_CLUSTER", "Cluster"],
    ["HEADER_VM_DATASTORE_COLUMN", "Datastore"],
    ["HEADER_VM_KRITIKALITAS", "Kritikalitas"],
    ["HEADER_VM_KELOMPOK_APP", "Aplikasi BIA"],
    ["HEADER_VM_DEV_OPS", "DEV/OPS"],
    ["HEADER_VM_GUEST_OS", "Guest OS"],
    ["HEADER_VM_VCENTER", "vCenter"],
    ["HEADER_VM_NO_TIKET", "No Tiket"],
    ["HEADER_VM_HOSTS", "Host"],
    ["HEADER_VM_TANGGAL_SETUP", "Tanggal Setup"],
    ["SUMBER_SPREADSHEET_ID", "fake_sumber_id"],
    ["FOLDER_ID_ARSIP", "fake_folder_arsip"],
    ["NAMA_SHEET_TIKET", "Tiket Uji Coba"],
  ];
  MockServices.SpreadsheetApp.setSheetData("Konfigurasi", mockConfigData);

  const mockVmData = [
    [
      "Primary Key",
      "Virtual Machine",
      "IP Address",
      "State",
      "Uptime",
      "CPU",
      "Memory",
      "Provisioned (GB)",
      "Cluster",
      "Datastore",
      "Kritikalitas",
      "Aplikasi BIA",
      "DEV/OPS",
      "Guest OS",
      "vCenter",
      "No Tiket",
      "Host",
      "Tanggal Setup",
    ],
    [
      "VM-001-VC01",
      "WEB_SERVER_PROD",
      "10.10.1.5",
      "poweredOn",
      "100",
      "8",
      "16",
      "100",
      "PROD-CLUSTER-A",
      "DS_PROD_01",
      "CRITICAL",
      "Portal Web",
      "John Doe",
      "Linux",
      "VC01",
      "TICKET-123",
      "HOST-01",
      new Date(),
    ],
  ];
  MockServices.SpreadsheetApp.setSheetData("Data VM Uji Coba", mockVmData);

  MockServices.SpreadsheetApp.setSheetData("Hak Akses", [
    ["User ID", "Nama", "Email", "Role"],
    ["1", "Tester", "tester@example.com", "Admin"],
  ]);
  MockServices.SpreadsheetApp.setSheetData("Catatan VM", [
    ["Primary Key", "Isi Catatan", "Timestamp Update", "Nama User Update"],
  ]);
  MockServices.SpreadsheetApp.setSheetData("Tiket Uji Coba", [["Nama VM", "Status", "Link Tiket"]]);
  MockServices.PropertiesService.setProperty("TELEGRAM_BOT_TOKEN", "fake_telegram_token");
  MockServices.PropertiesService.setProperty("WEBHOOK_BOT_TOKEN", "fake_webhook_token");

  const state = getBotState();
  console.log("   - Setup: Lingkungan steril disiapkan.");

  // --- EKSEKUSI TES ---
  console.log("   - Langkah 1: Pengguna mengirim /carivm dengan PK yang valid");
  const updateCekVm = {
    message: { from: { id: 1, first_name: "Tester" }, chat: { id: -1001 }, text: "/carivm VM-001" },
  };
  doPost({ postData: { contents: JSON.stringify(updateCekVm) }, parameter: { token: state.config.WEBHOOK_BOT_TOKEN } });

  let lastRequest = MockServices.UrlFetchApp.getLastRequest();
  assertTrue(lastRequest, "Bot seharusnya mengirimkan pesan balasan");
  let payload = JSON.parse(lastRequest.params.payload);

  assertTrue(payload.text.includes("Detail Virtual Machine"), "Pesan Detail VM harus muncul");
  assertTrue(payload.text.includes("WEB_SERVER_PROD"), "Nama VM yang benar harus ada di detail");
  console.log("     -> ✅ LULUS: Pesan detail VM berhasil dikirim.");

  console.log("   -> ✅ SKENARIO SELESAI");
}

/**
 * [DIGABUNGKAN] Mensimulasikan seluruh alur ekspor dari klik tombol
 * hingga eksekusi di antrean.
 */
function testAlurEksporLengkap() {
  console.log("\n🧪 MENGUJI: Alur Ekspor Lengkap (Menu -> Antrean -> Hasil)");

  // Setup lingkungan steril
  MockServices.UrlFetchApp.clear();
  MockServices.CacheService.clear();
  MockServices.SpreadsheetApp.clear();
  MockServices.PropertiesService._props = {}; // Membersihkan antrean palsu
  clearBotStateCache();

  // Siapkan data palsu
  const mockConfigData = [
    ["Kunci", "Nilai"],
    ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji"],
    ["SUMBER_SPREADSHEET_ID", "id_sumber_palsu"], // <-- Kunci yang hilang ditambahkan
    ["FOLDER_ID_ARSIP", "id_arsip_palsu"], // <-- Kunci yang hilang ditambahkan
    ["HEADER_LOG_ACTION", "Aksi"],
    ["HEADER_LOG_TIMESTAMP", "Timestamp"],
    ["FOLDER_EKSPOR", "folder_id_palsu"],
    ["WEBHOOK_BOT_TOKEN", "fake_webhook_token"],
  ];
  MockServices.SpreadsheetApp.setSheetData("Konfigurasi", mockConfigData);
  MockServices.SpreadsheetApp.setSheetData("Log Perubahan", [
    ["Timestamp", "Aksi"],
    [new Date(), "MODIFIKASI"],
  ]);
  MockServices.PropertiesService.setProperty("TELEGRAM_BOT_TOKEN", "fake_token");
  MockServices.PropertiesService.setProperty("WEBHOOK_BOT_TOKEN", "fake_token");

  const state = getBotState();
  state.userAccessMap.set("1", { email: "tester@example.com", role: "Admin" });

  // Langkah 1: Simulasi pengguna menekan tombol ekspor
  console.log("   - Langkah 1: Pengguna menekan tombol ekspor 'Log Hari Ini'");
  const tipeEksporUntukUji = "log_today";
  const updatePalsu = {
    callback_query: {
      id: "query123",
      from: { id: 1, first_name: "Tester" },
      message: { chat: { id: "chat123" }, message_id: "msg123" },
      data: `export_machine:run:${createCallbackSession({ type: tipeEksporUntukUji }, state.config)}`,
    },
  };
  doPost({ postData: { contents: JSON.stringify(updatePalsu) }, parameter: { token: state.config.WEBHOOK_BOT_TOKEN } });

  // Verifikasi pekerjaan ditambahkan ke antrean
  const antrean = MockServices.PropertiesService._props;
  const kunciPekerjaan = Object.keys(antrean).find((k) => k.startsWith("job_"));
  assertTrue(kunciPekerjaan, "Pekerjaan seharusnya ditambahkan ke antrean");
  console.log("     -> ✅ LULUS: Pekerjaan berhasil ditambahkan ke antrean.");

  // Langkah 2: Simulasi pemicu antrean berjalan
  console.log("   - Langkah 2: Pemicu antrean memproses pekerjaan");

  let exportCalled = false;
  // Ganti fungsi asli dengan mock untuk mencegah pengiriman file nyata
  exportResultsToSheet = () => {
    exportCalled = true;
    console.log("     -> Fungsi exportResultsToSheet (palsu) terpanggil.");
  };

  prosesAntreanTugas(); // Jalankan prosesor antrean

  assertTrue(exportCalled, "Fungsi exportResultsToSheet seharusnya dipanggil");
  console.log("     -> ✅ LULUS: Fungsi ekspor inti berhasil dipanggil oleh prosesor antrean.");

  console.log("   -> ✅ SKENARIO SELESAI");
}

// =================================================================
// FUNGSI PEMBANTU PENGUJIAN
// =================================================================

function assertTrue(condition, testName) {
  if (!condition) {
    throw new Error(`GAGAL: ${testName}`);
  }
}
