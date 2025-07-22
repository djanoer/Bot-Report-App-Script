/**
 * @file Peringatan.js
 * @author Djanoer Team
 * @date 2023-07-12
 *
 * @description
 * Bertanggung jawab untuk menjalankan pemeriksaan proaktif terhadap kondisi infrastruktur
 * berdasarkan ambang batas yang ditentukan di konfigurasi. Menghasilkan laporan
 * peringatan jika ditemukan anomali.
 */

/**
 * [FINAL v4.0.0] Menjalankan pemeriksaan dan menghasilkan laporan hibrida cerdas.
 * - Selalu menampilkan detail peringatan datastore.
 * - Meringkas peringatan VM jika jumlahnya banyak.
 * - Menyediakan tombol ekspor opsional untuk detail VM.
 * @param {object} config - Objek konfigurasi bot yang aktif.
 * @returns {object} Objek berisi { pesan: string, keyboard: object | null }
 */
function jalankanPemeriksaanAmbangBatas(config) {
  console.log("Memulai pemeriksaan ambang batas sistem...");

  try {
    const dsSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
    const vmSheetData = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);

    // 1. Jalankan semua pemeriksaan secara terpisah
    const dsAlerts = cekKapasitasDatastore(config, dsSheetData.headers, dsSheetData.dataRows);
    const uptimeAlerts = cekUptimeVmKritis(config, vmSheetData.headers, vmSheetData.dataRows);
    const vmMatiAlerts = cekVmKritisMati(config, vmSheetData.headers, vmSheetData.dataRows);

    const semuaPeringatan = [...dsAlerts, ...uptimeAlerts, ...vmMatiAlerts];

    if (semuaPeringatan.length === 0) {
      return {
        pesan:
          "✅  <b>Kondisi Sistem: Aman</b>\n<i>Tidak ada anomali yang terdeteksi pada semua sistem yang dipantau.</i>",
        keyboard: null,
      };
    }

    // 2. Mulai menyusun pesan laporan
    let finalMessage = formatReportHeader("Laporan Kondisi Sistem");
    finalMessage += `\nTeridentifikasi total <b>${semuaPeringatan.length}</b> item yang memerlukan tinjauan.\n`;

    finalMessage += `\nTeridentifikasi total <b>${semuaPeringatan.length}</b> item yang memerlukan tinjauan.\n`;

    // 3. Bagian Peringatan Datastore (Selalu ditampilkan secara detail)
    if (dsAlerts.length > 0) {
      finalMessage += "\n<b>Peringatan Datastore:</b>\n";
      const formattedDsAlerts = dsAlerts.map((alert) => {
        return `${alert.icon} <b>Item:</b> <code>${escapeHtml(alert.item)}</code>\n${alert.detailFormatted}`;
      });
      finalMessage += formattedDsAlerts.join("\n\n");
    } else {
      finalMessage += "\n<b>Peringatan Datastore:</b>\n✅ Tidak ada peringatan terkait datastore.\n";
    }

    // 4. Bagian Peringatan VM (Selalu diringkas)
    const vmAlerts = [...uptimeAlerts, ...vmMatiAlerts];
    let keyboard = null;

    if (vmAlerts.length > 0) {
      finalMessage += `\n\n------------------------------------\n\n`;
      finalMessage += `<b>Ringkasan Peringatan VM:</b>\n`;

      const uptimeByCrit = uptimeAlerts.reduce((acc, alert) => {
        const crit = alert.kritikalitas || "Lainnya";
        acc[crit] = (acc[crit] || 0) + 1;
        return acc;
      }, {});
      const matiByCrit = vmMatiAlerts.reduce((acc, alert) => {
        const crit = alert.kritikalitas || "Lainnya";
        acc[crit] = (acc[crit] || 0) + 1;
        return acc;
      }, {});

      const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
      const sortCrit = (a, b) => (skorKritikalitas[b.toUpperCase()] || 0) - (skorKritikalitas[a.toUpperCase()] || 0);

      if (uptimeAlerts.length > 0) {
        finalMessage += `\n• 💡 <b>Uptime > ${config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME]} hari:</b> ${
          uptimeAlerts.length
        } VM\n`;
        Object.keys(uptimeByCrit)
          .sort(sortCrit)
          .forEach((crit) => {
            finalMessage += `  - ${escapeHtml(crit)}: ${uptimeByCrit[crit]}\n`;
          });
      }
      if (vmMatiAlerts.length > 0) {
        finalMessage += `\n• ❗️ <b>VM Kritis Non-Aktif:</b> ${vmMatiAlerts.length} VM\n`;
        Object.keys(matiByCrit)
          .sort(sortCrit)
          .forEach((crit) => {
            finalMessage += `  - ${escapeHtml(crit)}: ${matiByCrit[crit]}\n`;
          });
      }

      const sessionData = { exportType: KONSTANTA.TIPE_INTERNAL.EKSPOR_PERINGATAN_VM };
      const sessionId = createCallbackSession(sessionData, config);

      keyboard = {
        inline_keyboard: [
          [
            {
              text: `📄 Ekspor Detail ${vmAlerts.length} Peringatan VM`,
              callback_data: `kondisi_machine:export_alerts:${sessionId}`,
            },
          ],
        ],
      };
    }

    // 5. Tambahkan footer info jika ada datastore yang over-provisioned
    const adaOverProvisioned = dsAlerts.some((alert) => alert.tipe.includes("Over-provisioned"));
    if (adaOverProvisioned) {
      finalMessage += `\n\n<i><b>Info:</b> Untuk datastore yang over-provisioned, gunakan <code>${KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK}</code> untuk mendapatkan rekomendasi perbaikan.</i>`;
    }

    return { pesan: finalMessage, keyboard: keyboard };
  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan: ${e.message}\nStack: ${e.stack}`);
    return { pesan: `⚠️ <b>Gagal Memeriksa Kondisi Sistem</b>\n<i>Error: ${e.message}</i>`, keyboard: null };
  }
}

/**
 * [REVISI v4.2.0 - DENGAN INFO SELISIH & TB] Memeriksa kesehatan datastore dengan
 * logika yang efisien dan menyertakan satuan TB.
 */
function cekKapasitasDatastore(config, headers, dsData) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const usageThreshold = parseInt(config[K.THRESHOLD_DS_USED], 10);
  if (isNaN(usageThreshold) || !dsData || !dsData.length === 0) return [];

  const dsNameIndex = headers.indexOf(config[K.DS_NAME_HEADER]);
  const usedPercentIndex = headers.indexOf(config[K.HEADER_DS_USED_PERCENT]);
  const capacityGbIndex = headers.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
  const provisionedGbIndex = headers.indexOf(config[K.HEADER_DS_PROV_DS_GB]);
  const capacityTbIndex = headers.indexOf(config[K.HEADER_DS_CAPACITY_TB]);
  const provisionedTbIndex = headers.indexOf(config[K.HEADER_DS_PROV_DS_TB]);

  if (
    [dsNameIndex, usedPercentIndex, capacityGbIndex, provisionedGbIndex, capacityTbIndex, provisionedTbIndex].includes(
      -1
    )
  ) {
    console.error(
      "Peringatan: Salah satu header penting (Name, Used%, Capacity/Provisioned GB/TB) untuk datastore tidak ditemukan."
    );
    return [];
  }

  const alerts = [];

  dsData.forEach((row) => {
    const dsName = row[dsNameIndex];
    if (!dsName) return;

    const capacityGb = parseLocaleNumber(row[capacityGbIndex]);
    const totalProvisionedGb = parseLocaleNumber(row[provisionedGbIndex]);
    const capacityTb = parseLocaleNumber(row[capacityTbIndex]);
    const totalProvisionedTb = parseLocaleNumber(row[provisionedTbIndex]);
    const usedPercent = parseLocaleNumber(row[usedPercentIndex]);

    const isOverProvisioned = totalProvisionedGb > capacityGb;
    const isUsageHigh = usedPercent > usageThreshold;

    if (isOverProvisioned || isUsageHigh) {
      let detailLines = [];
      let icon = "⚠️";
      let alertType = "Datastore Health Warning";

      const usedBar = createProgressBar(usedPercent);
      detailLines.push(` • <b>Used Space:</b> ${usedPercent.toFixed(1)}% ${usedBar}`);

      const provisionedPercent = capacityGb > 0 ? (totalProvisionedGb / capacityGb) * 100 : 0;
      const provisionedBar = createProgressBar(provisionedPercent);
      detailLines.push(` • <b>Provisioned:</b> ${provisionedPercent.toFixed(1)}% ${provisionedBar}`);

      if (isOverProvisioned) {
        const selisihGb = totalProvisionedGb - capacityGb;
        detailLines.push(
          `   └ ❗️ Over-provisioned by <b>${selisihGb.toFixed(0)} GB</b>. (${totalProvisionedGb.toFixed(
            0
          )} GB / ${totalProvisionedTb.toFixed(2)} TB allocated vs ${capacityGb.toFixed(0)} GB / ${capacityTb.toFixed(
            2
          )} TB capacity)`
        );
        alertType = "Datastore Over-provisioned";
        icon = "🔥";
      }
      if (isUsageHigh) {
        alertType = "Datastore Usage Critical";
        icon = "🔥";
      }
      if (isOverProvisioned && isUsageHigh) {
        alertType = "Datastore Usage & Provisioning Critical";
      }

      alerts.push({
        tipe: alertType,
        item: dsName,
        detailFormatted: detailLines.join("\n"),
        detailRaw: `Used: ${usedPercent.toFixed(1)}%, Provisioned: ${provisionedPercent.toFixed(1)}%`,
        icon: icon,
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
