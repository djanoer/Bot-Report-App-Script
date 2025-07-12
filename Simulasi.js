/**
 * [DEBUGGING v1.2.2] Fungsi ini HANYA untuk debugging.
 * Tugasnya adalah membaca baris pertama dari sheet "Data VM" dan membandingkannya
 * dengan nilai yang diharapkan dari sheet "Konfigurasi".
 */
function debugCekHeaderVm() {
  console.log("===== MEMULAI DEBUGGING HEADER DATA VM =====");
  try {
    const { config } = getBotState();
    const namaSheetVm = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];

    if (!namaSheetVm) {
      throw new Error("Kunci 'SHEET_VM' tidak ditemukan di Konfigurasi.");
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(namaSheetVm);

    if (!sheet) {
      throw new Error(`Sheet dengan nama "${namaSheetVm}" tidak dapat ditemukan.`);
    }
    if (sheet.getLastRow() < 1) {
      throw new Error(`Sheet "${namaSheetVm}" kosong dan tidak memiliki baris header.`);
    }

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    console.log("--- Header yang SEBENARNYA DIBACA dari sheet 'Data VM' ---");
    headers.forEach((header, index) => {
      console.log(`Kolom ${index + 1}: |${header}|`);
    });

    console.log("\n--- Header yang DIHARAPKAN berdasarkan sheet 'Konfigurasi' ---");
    const K = KONSTANTA.KUNCI_KONFIG;
    console.log(`- HOSTS: |${config[K.HEADER_VM_HOSTS]}|`);
    console.log(`- Cluster: |${config[K.HEADER_VM_CLUSTER]}|`);
    console.log(`- CPU: |${config[K.HEADER_VM_CPU]}|`);
    console.log(`- Memory: |${config[K.HEADER_VM_MEMORY]}|`);

    console.log("\nSilakan bandingkan kedua daftar di atas. Tulisannya harus 100% identik.");
    console.log("===== DEBUGGING SELESAI =====");
  } catch (e) {
    console.error("DEBUGGING GAGAL TOTAL:", e.message);
  }
}
