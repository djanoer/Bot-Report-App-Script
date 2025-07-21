/**
 * =================================================================================
 * SCRIPT PENGUJIAN INTEGRASI OTOMATIS (VERSI PERBAIKAN)
 * =================================================================================
 * Termasuk definisi Mocks secara lokal untuk memastikan keandalan eksekusi.
 */

// =================================================================================
// === BAGIAN 1: DEFINISI LIBRARY MOCKS (DIGABUNGKAN UNTUK MENGHINDARI ERROR) ===
// =================================================================================
const Mocks = (function() {
  function MockSheet(name, data) {
    this.name = name;
    this.data = data || [[]];
    this.lastRow = this.data.length;
    this.lastCol = this.data.length > 0 ? this.data[0].length : 0;

    this.getName = function() { return this.name; };
    this.getLastRow = function() { return this.lastRow; };
    this.getLastColumn = function() { return this.lastCol; };
    this.getRange = function(row, col, numRows, numCols) {
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
        getValues: function() { return rangeData; },
        getValue: function() { return rangeData.length > 0 ? rangeData[0][0] : null; }
      };
    };
    this.getDataRange = function() { return this.getRange(1, 1, this.lastRow, this.lastCol); };
  }

  function MockSpreadsheet(sheets) {
    this.sheets = sheets || [];
    this.getSheetByName = function(name) { return this.sheets.find(s => s.getName() === name) || null; };
  }
  
  return {
    createMockSpreadsheet: function(sheetData) {
      const mockSheets = Object.keys(sheetData).map(name => new MockSheet(name, sheetData[name]));
      return new MockSpreadsheet(mockSheets);
    }
  };
})();


// =================================================================================
// === BAGIAN 2: KERANGKA KERJA DAN SKENARIO PENGUJIAN OTOMATIS ===
// =================================================================================
const HASIL_TES_OTOMATIS = {
  total: 0,
  lulus: 0,
  gagal: 0,
  kumpulanGagal: []
};

function jalankanTesOtomatis() {
  const startTime = new Date();
  console.log(`🚀 [${startTime.toLocaleTimeString()}] MEMULAI PENGUJIAN INTEGRASI OTOMATIS...`);

  HASIL_TES_OTOMATIS.total = 0;
  HASIL_TES_OTOMATIS.lulus = 0;
  HASIL_TES_OTOMATIS.gagal = 0;
  HASIL_TES_OTOMATIS.kumpulanGagal = [];
  
  // Simpan layanan asli untuk dipulihkan nanti
  const originalSpreadsheetApp = SpreadsheetApp;
  const originalCacheService = CacheService;

  try {
      console.log("\n tahap 1 dari 3: Mempersiapkan Lingkungan Pengujian Palsu...");
      const { config, dataUji } = setupMockEnvironment();
      console.log("   -> ✅ Lingkungan palsu dengan data dummy berhasil dibuat.");

      console.log("\n tahap 2 dari 3: Menguji Skenario Akses Data pada Lingkungan Palsu...");
      ujiLapisanAksesData_Otomatis(config, dataUji);
      
      console.log("\n tahap 3 dari 3: Menguji Skenario Logika Bisnis & Laporan...");
      ujiLogikaLaporan_Otomatis(config);

  } catch (e) {
      console.error(`\n🔥🔥🔥 PENGUJIAN GAGAL TOTAL! Terjadi error tak terduga: ${e.message}\nStack: ${e.stack}`);
  } finally {
      // --- PERBAIKAN UTAMA: PULIHKAN SEMUA LAYANAN ASLI ---
      SpreadsheetApp = originalSpreadsheetApp;
      CacheService = originalCacheService;
      
      const endTime = new Date();
      const duration = (endTime - startTime) / 1000;
      console.log("\n\n--- LAPORAN AKHIR PENGUJIAN ---");
      console.log(`Waktu Selesai: ${endTime.toLocaleTimeString()}`);
      console.log(`Durasi Total: ${duration.toFixed(2)} detik`);
      console.log(`Total Tes Dijalankan: ${HASIL_TES_OTOMATIS.total}`);
      console.log(`✅ LULUS: ${HASIL_TES_OTOMATIS.lulus}`);
      console.log(`❌ GAGAL: ${HASIL_TES_OTOMATIS.gagal}`);

      if (HASIL_TES_OTOMATIS.gagal > 0) {
          console.error("\nDetail Kegagalan:");
          HASIL_TES_OTOMATIS.kumpulanGagal.forEach(pesanGagal => {
              console.error(`   - ${pesanGagal}`);
          });
      }
      console.log("\n🏁 PENGUJIAN OTOMATIS SELESAI.");
  }
}

function setupMockEnvironment() {
  const DATA_UJI = {
      NAMA_VM_VALID: "WEB_SERVER_PROD",
      PK_VM_VALID: "VM-001-VC01",
      IP_VM_VALID: "10.10.1.5",
      NAMA_CLUSTER_VALID: "PROD-CLUSTER-A",
      NAMA_DATASTORE_VALID: "DS_PROD_01",
      VM_TIDAK_ADA: "VM_YANG_TIDAK_ADA"
  };

  const mockConfigData = [
      ["Kunci", "Nilai"],
      ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji"], ["NAMA_SHEET_DATASTORE", "Datastore Uji"],
      ["HEADER_VM_PK", "Primary Key"], ["HEADER_VM_NAME", "Virtual Machine"], ["HEADER_VM_IP", "IP Address"],
      ["HEADER_VM_STATE", "State"], ["HEADER_VM_CLUSTER", "Cluster"], ["HEADER_VM_DATASTORE_COLUMN", "Datastore"], 
      ["HEADER_VM_KRITIKALITAS", "Kritikalitas"], ["HEADER_VM_ENVIRONMENT", "Environment"],
      ["LIST_KRITIKALITAS", "CRITICAL,HIGH"], ["LIST_ENVIRONMENT", "Production,Development"]
  ];
  const config = Object.fromEntries(mockConfigData.slice(1));

  const mockVmData = [
    ["Primary Key", "Virtual Machine", "IP Address", "State", "Cluster", "Datastore", "Kritikalitas", "Environment"],
    [DATA_UJI.PK_VM_VALID, DATA_UJI.NAMA_VM_VALID, DATA_UJI.IP_VM_VALID, "poweredOn", DATA_UJI.NAMA_CLUSTER_VALID, DATA_UJI.NAMA_DATASTORE_VALID, "CRITICAL", "Production"],
    ["VM-002-VC01", "DB_SERVER_PROD", "10.10.1.6", "poweredOn", DATA_UJI.NAMA_CLUSTER_VALID, DATA_UJI.NAMA_DATASTORE_VALID, "CRITICAL", "Production"],
  ];
  
  const mockSpreadsheet = Mocks.createMockSpreadsheet({
      'Konfigurasi': mockConfigData,
      'Data VM Uji': mockVmData,
      'Log Perubahan': [["Timestamp", "Aksi", "VM Primary Key", "Nama VM", "Sheet", "Nilai Lama", "Nilai Baru", "Detail", "Tipe Log"]]
  });
  
  // --- PERBAIKAN UTAMA: SIMULASIKAN SPREADSHEET DAN CACHE ---
  SpreadsheetApp = { getActiveSpreadsheet: () => mockSpreadsheet };
  CacheService = { getScriptCache: () => ({ get: () => null, put: () => {} }) }; // <-- Ini menipu searchVmOnSheet agar berpikir cache kosong
  
  return { config, dataUji: DATA_UJI };
}

function ujiLapisanAksesData_Otomatis(config, dataUji) {
  const hasilCariNama = searchVmOnSheet(dataUji.NAMA_VM_VALID, config);
  catatHasil(hasilCariNama.results.length === 1, `Pencarian VM berdasarkan Nama ('${dataUji.NAMA_VM_VALID}')`);

  const hasilCariGagal = searchVmOnSheet(dataUji.VM_TIDAK_ADA, config);
  catatHasil(hasilCariGagal.results.length === 0, `Pencarian VM yang tidak ada ('${dataUji.VM_TIDAK_ADA}')`);
}

function ujiLogikaLaporan_Otomatis(config) {
  const { headers, dataRows } = _getSheetData_testable(config['NAMA_SHEET_DATA_UTAMA'], SpreadsheetApp.getActiveSpreadsheet());
  const dataAset = _calculateAssetDistributionData(config, dataRows, headers);
  catatHasil(dataAset && dataAset.totalVm === 2 && dataAset.criticality['CRITICAL'] === 2, "Kalkulasi Laporan Aset");
}

function _getSheetData_testable(sheetName, spreadsheetInstance) {
  const sheet = spreadsheetInstance.getSheetByName(sheetName);
  if (!sheet) return { headers: [], dataRows: [] };
  const allData = sheet.getDataRange().getValues();
  const headers = allData.shift() || [];
  return { headers: headers, dataRows: allData };
}

function catatHasil(kondisi, namaTes) {
  HASIL_TES_OTOMATIS.total++;
  if (kondisi) {
      HASIL_TES_OTOMATIS.lulus++;
      console.log(`   -> ✅ LULUS: ${namaTes}`);
  } else {
      HASIL_TES_OTOMATIS.gagal++;
      const pesanGagal = `GAGAL: ${namaTes}`;
      HASIL_TES_OTOMATIS.kumpulanGagal.push(pesanGagal);
      console.error(`   -> ❌ ${pesanGagal}`);
  }
}