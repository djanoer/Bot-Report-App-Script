/**
 * =================================================================================
 * SCRIPT PENGUJIAN DIAGNOSTIK UNTUK ALUR EKSPOR LENGKAP (VERSI PERBAIKAN)
 * =================================================================================
 * TUJUAN: Mensimulasikan seluruh alur ekspor dari klik tombol hingga eksekusi
 * di antrean untuk menemukan titik kegagalan yang sebenarnya.
 *
 * CARA MENGGUNAKAN: Jalankan fungsi `ujiAlurEksporLengkap` dari editor.
 */

// --- BAGIAN 1: LINGKUNGAN PALSU (MOCK ENVIRONMENT) ---

const MOCK_SERVICES = {
    PropertiesService: {
        _props: {},
        getUserProperties: function() { return this; },
        getProperty: function(key) { return this._props[key] || null; },
        setProperty: function(key, value) {
            console.log(`   [ANTREAN PALSU] Pekerjaan '${key}' ditambahkan ke antrean.`);
            this._props[key] = value;
        },
        deleteProperty: function(key) {
            console.log(`   [ANTREAN PALSU] Pekerjaan '${key}' dihapus dari antrean.`);
            delete this._props[key];
        },
        getKeys: function() { return Object.keys(this._props); },
        _getAllData: function() { return this._props; }
    },
    TelegramAPI: {
        _calls: [],
        call: function(method, payload) {
            console.log(`   [TELEGRAM PALSU] Memanggil metode '${method}' dengan payload: ${JSON.stringify(payload)}`);
            this._calls.push({ method, payload });
        },
        getLastCall: function() { return this._calls[this._calls.length - 1]; }
    }
};

function setupMockEnvironmentForExportTest() {
    const Mocks = (function() { function MockSheet(name, data) { this.name = name; this.data = data || [[]]; this.lastRow = this.data.length; this.lastCol = this.data.length > 0 ? this.data[0].length : 0; this.getName = function() { return this.name; }; this.getLastRow = function() { return this.lastRow; }; this.getLastColumn = function() { return this.lastCol; }; this.getRange = function(row, col, numRows, numCols) { const rangeData = []; const endRow = row + (numRows || 1) - 1; const endCol = col + (numCols || 1) - 1; for (let i = row - 1; i < endRow && i < this.lastRow; i++) { const rowData = []; for (let j = col - 1; j < endCol && j < this.lastCol; j++) { rowData.push(this.data[i][j]); } rangeData.push(rowData); } return { getValues: function() { return rangeData; }, getValue: function() { return rangeData.length > 0 ? rangeData[0][0] : null; } }; }; this.getDataRange = function() { return this.getRange(1, 1, this.lastRow, this.lastCol); }; } function MockSpreadsheet(sheets) { this.sheets = sheets || []; this.getSheetByName = function(name) { return this.sheets.find(s => s.getName() === name) || null; }; } return { createMockSpreadsheet: function(sheetData) { const mockSheets = Object.keys(sheetData).map(name => new MockSheet(name, sheetData[name])); return new MockSpreadsheet(mockSheets); } }; })();

    const mockConfigData = [
        ["Kunci", "Nilai"],
        ["NAMA_SHEET_DATA_UTAMA", "Data VM Uji"], ["NAMA_SHEET_DATASTORE", "Datastore Uji"],
        ["HEADER_VM_PK", "Primary Key"], ["HEADER_VM_NAME", "Virtual Machine"], ["HEADER_VM_IP", "IP Address"],
        ["HEADER_LOG_ACTION", "Aksi"], ["FOLDER_EKSPOR", "folder_id_palsu"],
        ["LIST_KRITIKALITAS", "CRITICAL,HIGH"], ["LIST_ENVIRONMENT", "Production,Development"]
    ];
    const config = Object.fromEntries(mockConfigData.slice(1));

    const mockVmData = [
      ["Primary Key", "Virtual Machine", "IP Address", "Kritikalitas", "Environment"],
      ["VM-001", "WEB_SERVER_01", "10.0.0.1", "CRITICAL", "Production"]
    ];
    
    const mockLogData = [
        ["Timestamp", "Aksi", "Detail"],
        [new Date(), "MODIFIKASI", "Kolom 'CPU' diubah"]
    ];

    const mockSpreadsheet = Mocks.createMockSpreadsheet({
        'Konfigurasi': mockConfigData,
        'Data VM Uji': mockVmData,
        'Log Perubahan': mockLogData
    });
    
    SpreadsheetApp = { getActiveSpreadsheet: () => mockSpreadsheet };
    PropertiesService = MOCK_SERVICES.PropertiesService;
    
    editMessageText = (text, keyboard, chatId, messageId, config) => MOCK_SERVICES.TelegramAPI.call('editMessageText', { text, chatId, messageId });
    answerCallbackQuery = (queryId, config, text) => MOCK_SERVICES.TelegramAPI.call('answerCallbackQuery', { queryId, text });
    exportResultsToSheet = (headers, data, title, config, userData) => `✅ Pesan Sukses: File '${title}' telah dibuat.`;

    return { config };
}

// --- BAGIAN 2: SKRIP PENGUJIAN UTAMA ---

function ujiAlurEksporLengkap() {
    const startTime = new Date();
    console.log(`🚀 [${startTime.toLocaleTimeString()}] MEMULAI PENGUJIAN ALUR EKSPOR...`);

    const originalSpreadsheetApp = SpreadsheetApp;
    const originalPropertiesService = PropertiesService;
    const originalEditMessageText = editMessageText;
    const originalAnswerCallbackQuery = answerCallbackQuery;
    const originalExportResultsToSheet = exportResultsToSheet;

    let jobDataForDebug = {};

    try {
        console.log("\n--- TAHAP 1: PERSIAPAN ---");
        const { config } = setupMockEnvironmentForExportTest();
        console.log("   -> ✅ Lingkungan palsu berhasil disiapkan.");

        console.log("\n--- TAHAP 2: SIMULASI KLIK TOMBOL (handleExportRequest) ---");
        const tipeEksporUntukUji = "log_today";
        const updatePalsu = {
            callback_query: {
                id: "query123",
                message: { chat: { id: "chat123" }, message_id: "msg123" },
                sessionData: { type: tipeEksporUntukUji }
            }
        };
        handleExportRequest(updatePalsu, 'run', config, { userId: "user123", firstName: "Tester" });
        
        let panggilanTerakhir = MOCK_SERVICES.TelegramAPI.getLastCall();
        if (panggilanTerakhir && panggilanTerakhir.method === 'editMessageText' && panggilanTerakhir.payload.text.includes("Sedang memproses")) {
            console.log("   -> ✅ Pesan berhasil diubah menjadi status 'tunggu'.");
        } else {
            throw new Error("GAGAL: Pesan tidak diubah menjadi status 'tunggu' setelah tombol diklik.");
        }

        const antrean = MOCK_SERVICES.PropertiesService._getAllData();
        const kunciPekerjaan = Object.keys(antrean)[0];
        if (kunciPekerjaan && antrean[kunciPekerjaan]) {
            console.log("   -> ✅ Pekerjaan berhasil ditambahkan ke antrean.");
            // **PERBAIKAN**: Simpan data pekerjaan untuk debugging sebelum diproses
            jobDataForDebug = JSON.parse(antrean[kunciPekerjaan]);
        } else {
            throw new Error("GAGAL: Tidak ada pekerjaan yang ditambahkan ke antrean.");
        }

        console.log("\n--- TAHAP 3: SIMULASI PEMICU LATAR BELAKANG (processExportQueue) ---");
        processExportQueue();
        
        panggilanTerakhir = MOCK_SERVICES.TelegramAPI.getLastCall();
        if (panggilanTerakhir && panggilanTerakhir.method === 'editMessageText' && panggilanTerakhir.payload.text.includes("✅ Pesan Sukses")) {
            console.log("   -> ✅ Pesan 'tunggu' berhasil diubah menjadi pesan sukses.");
        } else {
            throw new Error("GAGAL: Pesan akhir tidak sesuai harapan.");
        }

        console.log("\n🎉 SELURUH ALUR EKSPOR BERHASIL DIVERIFIKASI!");

    } catch (e) {
        console.error(`\n🔥🔥🔥 PENGUJIAN GAGAL! Titik kegagalan terdeteksi.\n   -> PESAN ERROR: ${e.message}`);
        console.error("   -> Data Pekerjaan yang Dijalankan:", JSON.stringify(jobDataForDebug));
    } finally {
        SpreadsheetApp = originalSpreadsheetApp;
        PropertiesService = originalPropertiesService;
        editMessageText = originalEditMessageText;
        answerCallbackQuery = originalAnswerCallbackQuery;
        exportResultsToSheet = originalExportResultsToSheet;
        
        const endTime = new Date();
        const duration = (endTime - startTime) / 1000;
        console.log(`\n🏁 PENGUJIAN SELESAI. Durasi: ${duration.toFixed(2)} detik.`);
    }
}
