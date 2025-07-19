// ===== FILE: PengujianSistem.gs =====

// Objek Mock Global untuk meniru layanan Google, Telegram, dan Spreadsheet
const MockServices = {
    UrlFetchApp: {
      _requests: [],
      fetch: function (url, params) { this._requests.push({ url, params }); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ ok: true, result: { message_id: 12345 } }) }; },
      getLastRequest: function () { return this._requests[this._requests.length - 1]; },
      clear: function () { this._requests = []; },
    },
    CacheService: {
      _cache: {},
      getScriptCache: function () { return this; },
      get: function (key) { return this._cache[key] || null; },
      put: function (key, value, exp) { this._cache[key] = value; },
      remove: function(key) { delete this._cache[key]; },
      clear: function() { this._cache = {}; }
    },
    SpreadsheetApp: {
      _sheets: {},
      getActiveSpreadsheet: function() { return this; },
      getSheetByName: function(name) {
        if (!this._sheets[name]) {
          // Alih-alih error, kembalikan null agar perilaku lebih mirip aslinya
          console.warn(`PERINGATAN UJI: Upaya untuk mengakses sheet palsu '${name}' yang belum disiapkan.`);
          return null;
        }
        return this._sheets[name];
      },
      setSheetData: function(sheetName, data) {
        const sheetData = JSON.parse(JSON.stringify(data));
        this._sheets[sheetName] = {
          _data: sheetData,
          getLastRow: function() { return this._data.length; },
          getLastColumn: function() { return this._data[0] ? this._data[0].length : 0; },
          getDataRange: function() { return { getValues: () => JSON.parse(JSON.stringify(this._data)) }; },
          getRange: function(row, col, numRows, numCols) {
            const self = this;
            return {
              getValues: function() {
                const slicedData = self._data.slice(row - 1, row - 1 + numRows);
                return slicedData.map(r => r.slice(col - 1, col - 1 + numCols));
              }
            };
          }
        };
      },
      clear: function() { this._sheets = {}; }
    },
    PropertiesService: {
      _props: {},
      getScriptProperties: function() { return this; },
      getProperty: function(key) { return this._props[key]; },
      setProperty: function(key, value) { this._props[key] = value; }
    }
  };
  
  /**
   * FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk memulai semua pengujian sistem.
   */
  function jalankanSemuaTesSistem() {
    console.log("🚀 Memulai Pengujian Sistem End-to-End...");
    
    const originalUrlFetchApp = UrlFetchApp;
    const originalCacheService = CacheService;
    const originalSpreadsheetApp = SpreadsheetApp;
    const originalPropertiesService = PropertiesService;
    UrlFetchApp = MockServices.UrlFetchApp;
    CacheService = MockServices.CacheService;
    SpreadsheetApp = MockServices.SpreadsheetApp;
    PropertiesService = MockServices.PropertiesService;
  
    let allTestsPassed = true; // Flag untuk melacak status keseluruhan tes
  
    try {
      testAlurCekVmDanDetail();
      // TODO: Tambahkan panggilan fungsi tes lain di sini nanti
    } catch (e) {
      allTestsPassed = false; // Set flag ke false jika ada error
      console.error(`\n🔥 PENGUJIAN GAGAL PADA SALAH SATU SKENARIO: ${e.message}\n${e.stack}`);
    } finally {
      // Kembalikan semua layanan asli
      UrlFetchApp = originalUrlFetchApp;
      CacheService = originalCacheService;
      SpreadsheetApp = originalSpreadsheetApp;
      PropertiesService = originalPropertiesService;
      
      // Tampilkan pesan akhir berdasarkan status flag
      if(allTestsPassed) {
          console.log("\n🎉 SEMUA SKENARIO PENGUJIAN LULUS!");
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
    console.log("\n🧪 MENGUJI: Alur /cekvm -> Detail VM -> Daftar Cluster");
    
    // --- SETUP LINGKUNGAN UJI YANG LENGKAP ---
    MockServices.UrlFetchApp.clear();
    MockServices.CacheService.clear();
    MockServices.SpreadsheetApp.clear();
    clearBotStateCache();
    
    // 1. Siapkan data palsu untuk Sheet "Konfigurasi" (LENGKAP)
    const mockConfigSheetName = "Konfigurasi";
    const mockConfigData = [
        ["Kunci", "Nilai"],
        ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji Coba"],
        ["HEADER_VM_PK", "VM Primary Key"], ["HEADER_VM_NAME", "VM Name"], ["HEADER_VM_IP", "IP Address"],
        ["HEADER_VM_STATE", "State"], ["HEADER_VM_UPTIME", "Uptime"], ["HEADER_VM_CPU", "CPU"],
        ["HEADER_VM_MEMORY", "Memory"], ["HEADER_VM_PROV_GB", "Provisioned (GB)"], ["HEADER_VM_CLUSTER", "Cluster"],
        ["HEADER_VM_DATASTORE_COLUMN", "Datastore"], ["HEADER_VM_KRITIKALITAS", "Kritikalitas"],
        ["HEADER_VM_KELOMPOK_APP", "Aplikasi BIA"], ["HEADER_VM_DEV_OPS", "DEV/OPS"],
        ["HEADER_VM_GUEST_OS", "Guest OS"], ["HEADER_VM_VCENTER", "vCenter"], ["HEADER_VM_NO_TIKET", "No Tiket"],
        ["SUMBER_SPREADSHEET_ID", "fake_sumber_id"], ["FOLDER_ID_ARSIP", "fake_folder_arsip"],
        ["NAMA_SHEET_TIKET", "Tiket Uji Coba"] // <-- Tambahkan ini
    ];
    MockServices.SpreadsheetApp.setSheetData(mockConfigSheetName, mockConfigData);
  
    // 2. Siapkan data palsu untuk Sheet "Data VM"
    const mockVmSheetName = "Data VM Uji Coba";
    const mockVmData = [
      ["VM Primary Key", "VM Name", "IP Address", "State", "Uptime", "CPU", "Memory", "Provisioned (GB)", "Cluster", "Datastore", "Kritikalitas", "Aplikasi BIA", "DEV/OPS", "Guest OS", "vCenter", "No Tiket"],
      ["VM-001-VC01", "WEB_SERVER_PROD", "10.10.1.5", "poweredOn", "100", "8", "16", "100", "PROD-CLUSTER-A", "DS_PROD_01", "CRITICAL", "Portal Web", "John Doe", "Linux", "VC01", "TICKET-123"],
    ];
    MockServices.SpreadsheetApp.setSheetData(mockVmSheetName, mockVmData);
  
    // 3. Siapkan data palsu untuk sheet lain yang dibutuhkan
    MockServices.SpreadsheetApp.setSheetData("Hak Akses", [["User ID", "Nama", "Email", "Role"]]);
    MockServices.SpreadsheetApp.setSheetData("Catatan VM", [["VM Primary Key", "Isi Catatan", "Timestamp Update", "Nama User Update"]]);
    MockServices.SpreadsheetApp.setSheetData("Tiket Uji Coba", [["Nama VM", "Status", "Link Tiket"]]);
  
    // 4. Siapkan token palsu
    MockServices.PropertiesService.setProperty("TELEGRAM_BOT_TOKEN", "fake_telegram_token");
    MockServices.PropertiesService.setProperty("WEBHOOK_BOT_TOKEN", "fake_webhook_token");
  
    // 5. Dapatkan state bot dan suntikkan pengguna
    const state = getBotState();
    state.userAccessMap.set('1', { email: 'tester@example.com', role: 'Admin' });
    console.log("   - Setup: Lingkungan steril disiapkan dengan SEMUA sheet dan pengguna palsu.");
    
    // --- EKSEKUSI TES ---
    console.log("   - Langkah 1: Pengguna mengirim /cekvm dengan PK yang valid");
    const updateCekVm = {
      message: { from: { id: 1, first_name: "Tester" }, chat: { id: -1001 }, text: "/cekvm VM-001" },
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
  
  // =================================================================
  // FUNGSI PEMBANTU PENGUJIAN
  // =================================================================
  
  function assertTrue(condition, testName) {
    if (!condition) {
      throw new Error(`GAGAL: ${testName}`);
    }
  }