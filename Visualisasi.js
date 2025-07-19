// ===== FILE: Visualisasi.gs =====

/**
 * [REVISI FINAL] Membuat gambar grafik Pie Chart untuk distribusi aset.
 * Versi ini melemparkan error secara transparan untuk pelaporan yang lebih baik dan konsisten.
 */
function buatGrafikDistribusi(tipeDistribusi, config) {
  try {
    const { headers, dataRows: allVmData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (allVmData.length === 0) {
      throw new Error("Data VM tidak ditemukan untuk membuat grafik.");
    }

    const K = KONSTANTA.KUNCI_KONFIG;
    let columnIndex;
    let title;

    if (tipeDistribusi === "kritikalitas") {
      columnIndex = headers.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
      title = "Distribusi VM Berdasarkan Kritikalitas";
    } else if (tipeDistribusi === "environment") {
      columnIndex = headers.indexOf(config[K.HEADER_VM_ENVIRONMENT]);
      title = "Distribusi VM Berdasarkan Environment";
    } else {
      throw new Error("Tipe distribusi tidak valid.");
    }

    if (columnIndex === -1) {
      throw new Error(`Header untuk distribusi '${tipeDistribusi}' tidak ditemukan di sheet "Konfigurasi" atau "Data VM".`);
    }

    const counts = {};
    const totalVms = allVmData.length;
    allVmData.forEach((row) => {
      const category = row[columnIndex] || "Uncategorized";
      counts[category] = (counts[category] || 0) + 1;
    });

    const dataTable = Charts.newDataTable()
      .addColumn(Charts.ColumnType.STRING, "Kategori")
      .addColumn(Charts.ColumnType.NUMBER, "Jumlah");

    for (const category in counts) {
      const count = counts[category];
      const percentage = ((count / totalVms) * 100).toFixed(1);
      dataTable.addRow([`${category} (${percentage}%)`, count]);
    }

    const chart = Charts.newPieChart()
      .setDataTable(dataTable)
      .setTitle(title)
      .setDimensions(750, 450)
      .set3D()
      .setOption("legend", { position: "right", textStyle: { fontSize: 12 } })
      .setOption("pieSliceText", "value")
      .build();

    return chart.getAs("image/png");
  } catch (e) {
    // --- PERBAIKAN UTAMA DI SINI ---
    // Melemparkan kembali error agar bisa ditangkap oleh handler utama dengan pesan yang spesifik.
    throw new Error(e.message);
  }
}