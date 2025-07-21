/**
 * @file Dashboard.js
 * @author Djanoer Team
 * @date 2023-07-01
 *
 * @description
 * Berisi fungsi-fungsi kustom (`@customfunction`) yang dirancang untuk digunakan
 * secara langsung di dalam Google Sheet 'Dashboard'. Bertanggung jawab untuk
 * menarik data dan visualisasi ke dalam antarmuka spreadsheet.
 */

/**
 * Membuat dan menyisipkan grafik distribusi VM berdasarkan kritikalitas ke dalam sheet aktif.
 * Fungsi ini harus dijalankan dari menu, bukan dari sel.
 */
function INSERT_CRITICALITY_CHART() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dashboard");
  if (!sheet) {
    SpreadsheetApp.getUi().alert("Sheet 'Dashboard' tidak ditemukan.");
    return;
  }

  const config = bacaKonfigurasi();
  const chartBlob = buatGrafikDistribusi("kritikalitas", config);

  if (chartBlob) {
    // Hapus grafik lama jika ada, untuk menghindari penumpukan
    sheet.getCharts().forEach(chart => sheet.removeChart(chart));

    // Sisipkan gambar grafik baru di sel D2
    sheet.insertImage(chartBlob, "D", 2);
    SpreadsheetApp.getUi().alert("Grafik berhasil diperbarui.");
  } else {
    SpreadsheetApp.getUi().alert("Gagal membuat gambar grafik.");
  }
}

/**
 * Memaksa penyegaran semua fungsi kustom di dashboard.
 * Ini dilakukan dengan mengatur ulang nilai sel formula, yang memicu perhitungan ulang.
 */
function REFRESH_DASHBOARD_DATA() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Dashboard");
  if (!sheet) return;

  // "Menyentuh" sel yang berisi formula untuk memicu pembaruan
  const cellStatus = sheet.getRange("B2");
  const cellVmSummary = sheet.getRange("B4");

  const oldFormulaStatus = cellStatus.getFormula();
  const oldFormulaVmSummary = cellVmSummary.getFormula();

  cellStatus.setValue("");
  cellVmSummary.setValue("");
  SpreadsheetApp.flush(); // Terapkan perubahan

  cellStatus.setFormula(oldFormulaStatus);
  cellVmSummary.setFormula(oldFormulaVmSummary);

  SpreadsheetApp.getUi().alert("Data Dashboard telah diperbarui.");
}

/**
 * Menghitung dan mengembalikan ringkasan status VM untuk ditampilkan di dashboard.
 * @customfunction
 */
function GET_VM_SUMMARY() {
  const { headers, dataRows } = _getSheetData(bacaKonfigurasi().NAMA_SHEET_DATA_UTAMA);
  if (dataRows.length === 0) {
    return [["Aktif", 0], ["Mati", 0]];
  }

  const stateIndex = headers.indexOf(bacaKonfigurasi().HEADER_VM_STATE);
  let onCount = 0;
  let offCount = 0;

  dataRows.forEach(row => {
    const state = String(row[stateIndex] || "").toLowerCase();
    if (state.includes("on")) {
      onCount++;
    } else {
      offCount++;
    }
  });

  return [["Total VM (Aktif)", onCount], ["Total VM (Mati)", offCount]];
}

/**
 * Mengembalikan status bot sederhana.
 * @customfunction
 */
function GET_BOT_STATUS() {
  // Untuk saat ini, kita kembalikan status sederhana. Nanti bisa kita buat lebih kompleks.
  return "Operasional";
}