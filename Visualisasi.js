// ===== FILE: Visualisasi.gs =====

/**
 * [FINAL v1.3.3] Membuat gambar grafik Pie Chart untuk distribusi aset.
 * Versi ini memperbaiki masalah legenda yang terpotong dengan mengatur posisi
 * legenda secara eksplisit dan memperlebar dimensi grafik.
 * @param {string} tipeDistribusi - Tipe data yang akan divisualisasikan, misal: "kritikalitas".
 * @param {object} config - Objek konfigurasi bot.
 * @returns {Blob|null} Objek Blob gambar PNG jika berhasil, atau null jika gagal.
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
      throw new Error(`Header untuk distribusi '${tipeDistribusi}' tidak ditemukan.`);
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
      const labelWithPercentage = `${category} (${percentage}%)`;
      dataTable.addRow([labelWithPercentage, count]);
    }

    // === AWAL BLOK PERUBAHAN UTAMA ===
    const chartBuilder = Charts.newPieChart()
      .setDataTable(dataTable)
      .setTitle(title)
      // Perlebar dimensi untuk memberi ruang lebih bagi legenda
      .setDimensions(750, 450)
      .set3D()
      // Secara eksplisit atur posisi legenda ke kanan dengan opsi teks
      .setOption("legend", { position: "right", textStyle: { fontSize: 12 } })
      .setOption("pieSliceText", "value");
    // === AKHIR BLOK PERUBAHAN UTAMA ===

    const chart = chartBuilder.build();

    return chart.getAs("image/png");
  } catch (e) {
    console.error(`Gagal membuat grafik: ${e.message}`);
    return null;
  }
}
