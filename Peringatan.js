// ===== FILE: Peringatan.gs =====

  /**
   * Fungsi utama untuk menjalankan semua pemeriksaan ambang batas (thresholds).
   */
/**
 * [FINAL & STABIL] Fungsi utama untuk menjalankan semua pemeriksaan dengan penanganan config yang benar
 * agar dapat dijalankan oleh pemicu (trigger) maupun secara manual.
 *
 * @param {object} [config=null] - Objek konfigurasi. Jika null, fungsi akan membacanya sendiri.
 */
function jalankanPemeriksaanAmbangBatas(config = null) {
  // [PERBAIKAN] Tentukan satu sumber config yang andal di awal.
  // Jika config tidak diberikan (misal: dari menu), baca dari sheet.
  // Jika diberikan (dari trigger), gunakan yang itu.
  const activeConfig = config || bacaKonfigurasi();
  
  console.log("Memulai pemeriksaan ambang batas sistem...");
  try {
    let semuaPeringatan = [];

    // Menggabungkan hasil dari semua fungsi pemeriksaan, masing-masing diberikan config yang aktif
    semuaPeringatan.push(...cekKapasitasDatastore(activeConfig));
    semuaPeringatan.push(...cekUptimeVmKritis(activeConfig));
    semuaPeringatan.push(...cekVmKritisMati(activeConfig));

    if (semuaPeringatan.length > 0) {
      const BATAS_PESAN_DETAIL = 20;

      if (semuaPeringatan.length > BATAS_PESAN_DETAIL) {
          const counts = {
              datastore: 0,
              uptime: { total: 0, byCrit: {} },
              vmMati: { total: 0, byCrit: {} }
          };
          const dataUntukEkspor = [];
          const headers = ["Tipe Peringatan", "Item yang Diperiksa", "Detail", "Kritikalitas"];

          semuaPeringatan.forEach(alert => {
            if (alert.tipe.includes("Kapasitas Datastore")) {
              counts.datastore++;
            } else if (alert.tipe.includes("Uptime VM")) {
              counts.uptime.total++;
              const crit = alert.kritikalitas || 'Lainnya';
              counts.uptime.byCrit[crit] = (counts.uptime.byCrit[crit] || 0) + 1;
            } else if (alert.tipe.includes("VM Kritis Mati")) {
              counts.vmMati.total++;
              const crit = alert.kritikalitas || 'Lainnya';
              counts.vmMati.byCrit[crit] = (counts.vmMati.byCrit[crit] || 0) + 1;
            }
            dataUntukEkspor.push([alert.tipe, alert.item, alert.detailRaw, alert.kritikalitas || 'N/A']);
          });
          
          const dsThreshold = activeConfig[KONSTANTA.KUNCI_KONFIG.THRESHOLD_DS_USED] || 'N/A';
          const uptimeThreshold = activeConfig[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME] || 'N/A';
          
          let ringkasanPesan = `🚨 <b>Laporan Peringatan Dini Sistem</b> 🚨\n`;
          ringkasanPesan += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID')}</i>\n\n`;
          ringkasanPesan += `Ditemukan total <b>${semuaPeringatan.length}</b> potensi masalah. Detail lengkap telah diekspor ke dalam file Google Sheet.\n\n`;
          ringkasanPesan += `<b>Ringkasan Peringatan:</b>\n\n`;
          
          ringkasanPesan += `• 🔥 <b>Kapasitas Datastore Kritis (&gt;${dsThreshold}%):</b> <code>${counts.datastore}</code>\n`;
          
          ringkasanPesan += `\n• 💡 <b>Uptime VM Terlalu Lama (&gt;${uptimeThreshold} hari):</b> <code>${counts.uptime.total}</code>\n`;
          if (counts.uptime.total > 0) {
              for (const crit in counts.uptime.byCrit) {
                  ringkasanPesan += `  - ${escapeHtml(crit)}: ${counts.uptime.byCrit[crit]}\n`;
              }
          }
          
          ringkasanPesan += `\n• ❗️ <b>VM Kritis Mati:</b> <code>${counts.vmMati.total}</code>\n`;
          if (counts.vmMati.total > 0) {
              for (const crit in counts.vmMati.byCrit) {
                  ringkasanPesan += `  - ${escapeHtml(crit)}: ${counts.vmMati.byCrit[crit]}\n`;
              }
          }

          // Gunakan 'activeConfig' untuk mengirim pesan dan mengekspor
          kirimPesanTelegram(ringkasanPesan, activeConfig, 'HTML');
          exportResultsToSheet(headers, dataUntukEkspor, "Laporan Detail Peringatan Sistem", activeConfig, null, "Kritikalitas");

      } else {
        let pesanDetail = `🚨 <b>Peringatan Dini Sistem</b> 🚨\n`;
        pesanDetail += `<i>Ditemukan ${semuaPeringatan.length} potensi masalah yang perlu ditindaklanjuti:</i>\n`;
        
        const formattedAlerts = semuaPeringatan.map(alert => {
            let alertMessage = `${alert.icon} <b>${alert.tipe}</b>\n • <b>Item:</b> <code>${escapeHtml(alert.item)}</code>\n • <b>Detail:</b> ${alert.detailFormatted}`;
            if (alert.kritikalitas) {
                alertMessage += `\n • <b>Kritikalitas:</b> <i>${escapeHtml(alert.kritikalitas)}</i>`;
            }
            return alertMessage;
        });
        pesanDetail += "\n" + formattedAlerts.join('\n\n');
        
        kirimPesanTelegram(pesanDetail, activeConfig, 'HTML');
      }
      console.log(`Laporan peringatan dini telah dikirim dengan ${semuaPeringatan.length} item.`);
    } else {
      console.log("Semua sistem terpantau dalam batas aman.");
    }
  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan ambang batas: ${e.message}\nStack: ${e.stack}`);
    // Gunakan 'activeConfig' untuk mengirim pesan error
    kirimPesanTelegram(`⚠️ Gagal menjalankan Sistem Peringatan Dini.\nError: ${e.message}`, activeConfig);
  }
}
  
  /**
   * Memeriksa datastore yang kapasitasnya melebihi threshold.
   * @returns {Array<string>} Array berisi pesan peringatan.
   */
  function cekKapasitasDatastore(config) {
  const threshold = parseInt(config.THRESHOLD_DS_USED_PERCENT, 10);
  if (isNaN(threshold)) return [];

  const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
  if (!dsSheet) return ["- Pengecekan datastore gagal: sheet tidak ditemukan."];

  const headers = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
  const nameIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
  // [PERBAIKAN] Menggunakan konstanta terpusat
  const usedPercentIndex = headers.indexOf(KONSTANTA.HEADER_DS.USED_PERCENT);

  if (nameIndex === -1 || usedPercentIndex === -1) return ["- Pengecekan datastore gagal: header tidak ditemukan."];
  
  const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
  const alerts = [];

  dsData.forEach(row => {
    const usedPercent = parseFloat(row[usedPercentIndex]);
    if (!isNaN(usedPercent) && usedPercent > threshold) {
      const dsName = row[nameIndex];
      // Format pesan tidak berubah, hanya cara mendapatkan datanya yang lebih baik
      alerts.push(`🔥 <b>Kapasitas Datastore Kritis</b>\n • Datastore: <code>${escapeHtml(dsName)}</code>\n • Kapasitas Terpakai: <b>${usedPercent.toFixed(1)}%</b> (Ambang Batas: ${threshold}%)`);
    }
  });
  return alerts;
}
  
  function cekUptimeVmKritis(config) {
  const threshold = parseInt(config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME], 10);
  const monitoredCrit = config[KONSTANTA.KUNCI_KONFIG.KRITIKALITAS_PANTAU] || [];
  if (isNaN(threshold) || monitoredCrit.length === 0) return [];

  const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  if (!vmSheet) return [{ tipe: "Error Sistem", item: "Pengecekan Uptime VM", detailFormatted: "Sheet tidak ditemukan.", detailRaw: "Sheet tidak ditemukan.", icon: "⚠️" }];

  const headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
  const vmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();

  const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
  const uptimeIndex = headers.indexOf(KONSTANTA.HEADER_VM.UPTIME);
  const critIndex = headers.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS);
  if (nameIndex === -1 || uptimeIndex === -1 || critIndex === -1) return [];

  const alerts = [];
  vmData.forEach(row => {
    const uptimeDays = parseInt(row[uptimeIndex], 10);
    const criticality = String(row[critIndex] || '');

    if (monitoredCrit.some(c => criticality.toUpperCase().includes(c)) && !isNaN(uptimeDays) && uptimeDays > threshold) {
      alerts.push({
        tipe: "Uptime VM Terlalu Lama",
        item: row[nameIndex],
        detailFormatted: `Uptime: <b>${uptimeDays} hari</b> (Batas: ${threshold} hari)`,
        detailRaw: `Uptime: ${uptimeDays} hari, Batas: ${threshold} hari`,
        icon: "💡",
        kritikalitas: criticality
      });
    }
  });
  return alerts;
}

function cekVmKritisMati(config) {
  const monitoredCrit = config[KONSTANTA.KUNCI_KONFIG.KRITIKALITAS_PANTAU] || [];
  if (monitoredCrit.length === 0) return [];

  const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  if (!vmSheet) return [{ tipe: "Error Sistem", item: "Pengecekan Status VM", detailFormatted: "Sheet tidak ditemukan.", detailRaw: "Sheet tidak ditemukan.", icon: "⚠️" }];

  const headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
  const vmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();

  const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
  const stateIndex = headers.indexOf(KONSTANTA.HEADER_VM.STATE);
  const critIndex = headers.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS);
  if (nameIndex === -1 || stateIndex === -1 || critIndex === -1) return [];

  const alerts = [];
  vmData.forEach(row => {
    const state = String(row[stateIndex] || '').toLowerCase();
    const criticality = String(row[critIndex] || '');

    if (monitoredCrit.some(c => criticality.toUpperCase().includes(c)) && state.includes('off')) {
       alerts.push({
        tipe: "VM Kritis Mati",
        item: row[nameIndex],
        detailFormatted: `Status: <b>poweredOff</b>`,
        detailRaw: `Status: poweredOff`,
        icon: "❗️",
        kritikalitas: criticality
      });
    }
  });
  return alerts;
}