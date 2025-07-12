// ===== FILE: Peringatan.gs =====

/**
 * [v1.1.0] Menjadi orkestrator pemeriksaan dengan pola Data Dependency Injection.
 * @param {object} config - Objek konfigurasi.
 * @param {boolean} kirimNotifikasi - (Opsional) Set ke false untuk menonaktifkan pengiriman pesan.
 * @param {object} dsData - (Opsional) Objek data datastore dari _getSheetData.
 * @param {object} vmData - (Opsional) Objek data VM dari _getSheetData.
 * @returns {Array} Array berisi objek peringatan.
 */
function jalankanPemeriksaanAmbangBatas(config = null, kirimNotifikasi = true, dsData = null, vmData = null) {
  const activeConfig = config || bacaKonfigurasi();
  console.log("Memulai pemeriksaan ambang batas sistem...");

  // Ambil data hanya jika tidak disediakan sebagai argumen
  const dsSheetData = dsData || _getSheetData(activeConfig[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
  const vmSheetData = vmData || _getSheetData(activeConfig[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);

  try {
    let semuaPeringatan = [];
    // "Suntikkan" data yang sudah diambil sebagai argumen ke fungsi-fungsi di bawah
    semuaPeringatan.push(...cekKapasitasDatastore(activeConfig, dsSheetData.headers, dsSheetData.dataRows));
    semuaPeringatan.push(...cekUptimeVmKritis(activeConfig, vmSheetData.headers, vmSheetData.dataRows));
    semuaPeringatan.push(...cekVmKritisMati(activeConfig, vmSheetData.headers, vmSheetData.dataRows));

    if (kirimNotifikasi) {
      if (semuaPeringatan.length > 0) {
        const BATAS_PESAN_DETAIL = 20;

        if (semuaPeringatan.length > BATAS_PESAN_DETAIL) {
          const counts = { datastore: 0, uptime: { total: 0, byCrit: {} }, vmMati: { total: 0, byCrit: {} } };
          const dataUntukEkspor = [];
          const headers = ["Tipe Peringatan", "Item yang Diperiksa", "Detail", "Kritikalitas"];
          const dsAlerts = semuaPeringatan.filter((alert) => alert.tipe.includes("Kapasitas Datastore"));
          counts.datastore = dsAlerts.length;

          semuaPeringatan.forEach((alert) => {
            if (!alert.tipe.includes("Kapasitas Datastore")) {
              if (alert.tipe.includes("Uptime VM")) {
                counts.uptime.total++;
                const crit = alert.kritikalitas || "Lainnya";
                counts.uptime.byCrit[crit] = (counts.uptime.byCrit[crit] || 0) + 1;
              } else if (alert.tipe.includes("VM Kritis")) {
                counts.vmMati.total++;
                const crit = alert.kritikalitas || "Lainnya";
                counts.vmMati.byCrit[crit] = (counts.vmMati.byCrit[crit] || 0) + 1;
              }
            }
            dataUntukEkspor.push([alert.tipe, alert.item, alert.detailRaw, alert.kritikalitas || "N/A"]);
          });

          const dsThreshold = activeConfig[KONSTANTA.KUNCI_KONFIG.THRESHOLD_DS_USED] || "N/A";
          const uptimeThreshold = activeConfig[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME] || "N/A";

          let ringkasanPesan = `🚨 <b>Laporan Kondisi Sistem</b> 🚨\n`;
          ringkasanPesan += `<i>Analisis dijalankan pada: ${new Date().toLocaleString("id-ID")}</i>\n\n`;
          ringkasanPesan += `Teridentifikasi total <b>${semuaPeringatan.length}</b> item yang memerlukan tinjauan. Detail lengkap telah diekspor ke dalam file Google Sheet.\n\n`;
          ringkasanPesan += `<b>Ringkasan Peringatan:</b>\n\n`;

          ringkasanPesan += `• 🔥 <b>Kapasitas Datastore Melebihi Ambang Batas (>${dsThreshold}%):</b> <code>${counts.datastore}</code>\n`;
          if (dsAlerts.length > 0) {
            const MAX_DS_TO_SHOW = 3;
            for (let i = 0; i < Math.min(dsAlerts.length, MAX_DS_TO_SHOW); i++) {
              const alert = dsAlerts[i];
              const usage = alert.detailRaw.split(",")[0].split(":")[1].trim();
              ringkasanPesan += `  - <code>${escapeHtml(alert.item)}</code> (${usage})\n`;
            }
            if (dsAlerts.length > MAX_DS_TO_SHOW) {
              ringkasanPesan += `  - <i>... dan ${dsAlerts.length - MAX_DS_TO_SHOW} lainnya.</i>\n`;
            }
            ringkasanPesan += `  └ <i>Jalankan <code>/migrasicheck</code> untuk mendapatkan rekomendasi perbaikan.</i>\n`;
          }

          const skorKritikalitas = activeConfig[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
          const sortCrit = (a, b) =>
            (skorKritikalitas[b.toUpperCase()] || 0) - (skorKritikalitas[a.toUpperCase()] || 0);

          ringkasanPesan += `\n• 💡 <b>Uptime VM Melebihi Batas Operasional (>${uptimeThreshold} hari):</b> <code>${counts.uptime.total}</code>\n`;
          if (counts.uptime.total > 0) {
            Object.keys(counts.uptime.byCrit)
              .sort(sortCrit)
              .forEach((crit) => {
                ringkasanPesan += `  - ${escapeHtml(crit)}: ${counts.uptime.byCrit[crit]}\n`;
              });
          }

          ringkasanPesan += `\n• ❗️ <b>VM Kritis Dalam Status Non-Aktif:</b> <code>${counts.vmMati.total}</code>\n`;
          if (counts.vmMati.total > 0) {
            Object.keys(counts.vmMati.byCrit)
              .sort(sortCrit)
              .forEach((crit) => {
                ringkasanPesan += `  - ${escapeHtml(crit)}: ${counts.vmMati.byCrit[crit]}\n`;
              });
          }

          kirimPesanTelegram(ringkasanPesan, activeConfig, "HTML");
          exportResultsToSheet(
            headers,
            dataUntukEkspor,
            "Laporan Detail Kondisi Sistem",
            activeConfig,
            null,
            "Kritikalitas"
          );
        } else {
          let pesanDetail = `🚨 <b>Laporan Kondisi Sistem</b> 🚨\n`;
          pesanDetail += `<i>Teridentifikasi ${semuaPeringatan.length} item yang memerlukan tinjauan:</i>\n`;

          const formattedAlerts = semuaPeringatan.map((alert) => {
            let alertMessage = `${alert.icon} <b>${alert.tipe}</b>\n • <b>Item:</b> <code>${escapeHtml(
              alert.item
            )}</code>\n • <b>Detail:</b> ${alert.detailFormatted}`;
            if (alert.kritikalitas) {
              alertMessage += `\n • <b>Kritikalitas:</b> <i>${escapeHtml(alert.kritikalitas)}</i>`;
            }
            return alertMessage;
          });
          pesanDetail += "\n" + formattedAlerts.join("\n\n");

          const dsAlertsDetail = semuaPeringatan.filter((alert) => alert.tipe.includes("Kapasitas Datastore"));
          if (dsAlertsDetail.length > 0) {
            pesanDetail += `\n\n<i>Jalankan <code>/migrasicheck</code> untuk mendapatkan rekomendasi perbaikan.</i>`;
          }

          kirimPesanTelegram(pesanDetail, activeConfig, "HTML");
        }
      } else {
        const pesanAman =
          "✅  <b>Kondisi Sistem: Aman</b>\n<i>Tidak ada anomali yang terdeteksi pada semua sistem yang dipantau.</i>";
        console.log("Semua sistem terpantau dalam batas aman.");
        kirimPesanTelegram(pesanAman, activeConfig, "HTML");
      }
    }

    return semuaPeringatan;
  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan ambang batas: ${e.message}\nStack: ${e.stack}`);
    if (kirimNotifikasi) {
      kirimPesanTelegram(`⚠️ <b>Gagal Memeriksa Kondisi Sistem</b>\n<i>Error: ${e.message}</i>`, activeConfig, "HTML");
    }
    return [];
  }
}

/**
 * [REFACTOR v1.1.0] Fungsi ini sekarang murni, hanya memproses data yang diberikan.
 * Tidak ada lagi panggilan I/O di sini.
 */
function cekKapasitasDatastore(config, headers, dsData) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const threshold = parseInt(config[K.THRESHOLD_DS_USED], 10);
  if (isNaN(threshold) || !dsData || dsData.length === 0) return [];

  const nameIndex = headers.indexOf(config[K.DS_NAME_HEADER]);
  const usedPercentHeaderName = config[K.HEADER_DS_USED_PERCENT];
  const usedPercentIndex = headers.indexOf(usedPercentHeaderName);

  if (nameIndex === -1 || usedPercentIndex === -1) {
    // [PERUBAHAN] Menggunakan `return` karena `throw` akan menghentikan seluruh eksekusi.
    console.error(`Peringatan: Header penting untuk cek kapasitas datastore tidak ditemukan. Pengecekan dilewati.`);
    return [];
  }

  const alerts = [];

  dsData.forEach((row) => {
    const usedPercent = parseFloat(row[usedPercentIndex]);
    if (!isNaN(usedPercent) && usedPercent > threshold) {
      const dsName = row[nameIndex];
      alerts.push({
        tipe: "Kapasitas Datastore Kritis",
        item: dsName,
        detailFormatted: `Kapasitas Terpakai: <b>${usedPercent.toFixed(1)}%</b> (Ambang Batas: ${threshold}%)`,
        detailRaw: `Terpakai: ${usedPercent.toFixed(1)}%, Batas: ${threshold}%`,
        icon: "🔥",
        kritikalitas: null,
      });
    }
  });
  return alerts;
}

/**
 * [REFACTOR v1.1.0] Fungsi ini sekarang murni, hanya memproses data yang diberikan.
 * Tidak ada lagi panggilan I/O di sini.
 */
function cekUptimeVmKritis(config, headers, vmData) {
  const threshold = parseInt(config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME], 10);
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
  const monitoredCrit = Object.keys(skorKritikalitas).filter((k) => k !== "DEFAULT");

  if (isNaN(threshold) || monitoredCrit.length === 0 || !vmData || vmData.length === 0) return [];

  const K = KONSTANTA.KUNCI_KONFIG;
  const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
  const uptimeIndex = headers.indexOf(config[K.HEADER_VM_UPTIME]);
  const critIndex = headers.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
  if (nameIndex === -1 || uptimeIndex === -1 || critIndex === -1) {
    console.error(`Peringatan: Header penting untuk cek uptime VM kritis tidak ditemukan. Pengecekan dilewati.`);
    return [];
  }

  const alerts = [];
  vmData.forEach((row) => {
    const uptimeDays = parseInt(row[uptimeIndex], 10);
    const criticality = String(row[critIndex] || "")
      .toUpperCase()
      .trim();

    if (monitoredCrit.includes(criticality) && !isNaN(uptimeDays) && uptimeDays > threshold) {
      alerts.push({
        tipe: "Uptime VM Melebihi Batas Operasional",
        item: row[nameIndex],
        detailFormatted: `Uptime: <b>${uptimeDays} hari</b> (Batas: ${threshold} hari)`,
        detailRaw: `Uptime: ${uptimeDays} hari, Batas: ${threshold} hari`,
        icon: "💡",
        kritikalitas: row[critIndex],
      });
    }
  });
  return alerts;
}

/**
 * [REFACTOR v1.1.0] Fungsi ini sekarang murni, hanya memproses data yang diberikan.
 * Tidak ada lagi panggilan I/O di sini.
 */
function cekVmKritisMati(config, headers, vmData) {
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
  const monitoredCrit = Object.keys(skorKritikalitas).filter((k) => k !== "DEFAULT");

  if (monitoredCrit.length === 0 || !vmData || vmData.length === 0) return [];

  const K = KONSTANTA.KUNCI_KONFIG;
  const nameIndex = headers.indexOf(config[K.HEADER_VM_NAME]);
  const stateIndex = headers.indexOf(config[K.HEADER_VM_STATE]);
  const critIndex = headers.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
  if (nameIndex === -1 || stateIndex === -1 || critIndex === -1) {
    console.error(`Peringatan: Header penting untuk cek status VM kritis tidak ditemukan. Pengecekan dilewati.`);
    return [];
  }

  const alerts = [];
  vmData.forEach((row) => {
    const state = String(row[stateIndex] || "").toLowerCase();
    const criticality = String(row[critIndex] || "")
      .toUpperCase()
      .trim();

    if (monitoredCrit.includes(criticality) && state.includes("off")) {
      alerts.push({
        tipe: "VM Kritis Dalam Status Non-Aktif",
        item: row[nameIndex],
        detailFormatted: `Status: <b>poweredOff</b>`,
        detailRaw: `Status: poweredOff`,
        icon: "❗️",
        kritikalitas: row[critIndex],
      });
    }
  });
  return alerts;
}

/**
 * [FUNGSI BARU v1.1.2] Fungsi pembantu khusus untuk menghitung jumlah VM
 * dengan nilai kritikalitas yang tidak terdaftar di Konfigurasi (dikategorikan sebagai "Others").
 * @param {object} config - Objek konfigurasi.
 * @param {Array} headers - Array header dari sheet VM.
 * @param {Array} vmData - Array data dari sheet VM.
 * @returns {{othersCount: number}} Objek berisi jumlah VM.
 */
function hitungKritikalitasLainnya(config, headers, vmData) {
  let othersCount = 0;
  if (!vmData || vmData.length === 0) {
    return { othersCount };
  }

  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
  const knownCritLevels = Object.keys(skorKritikalitas).map((k) => k.toUpperCase());

  const critIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.HEADER_VM_KRITIKALITAS]);
  if (critIndex === -1) {
    console.error("Peringatan: Kolom kritikalitas tidak ditemukan, perhitungan 'Others' dilewati.");
    return { othersCount };
  }

  vmData.forEach((row) => {
    const criticality = String(row[critIndex] || "")
      .trim()
      .toUpperCase();
    // Hitung hanya jika kolomnya tidak kosong TAPI nilainya tidak ada di daftar yang diketahui
    if (criticality && !knownCritLevels.includes(criticality)) {
      othersCount++;
    }
  });

  return { othersCount };
}
