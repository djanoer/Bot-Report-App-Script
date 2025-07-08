// ===== FILE: Peringatan.gs =====

/**
 * [MODIFIKASI v3.4 - FINAL] Menempatkan pesan "call to action" /migrasicheck
 * secara kontekstual tepat di bawah peringatan kapasitas datastore.
 */
function jalankanPemeriksaanAmbangBatas(config = null) {
  const activeConfig = config || bacaKonfigurasi();
  console.log("Memulai pemeriksaan ambang batas sistem...");
  
  try {
    let semuaPeringatan = [];
    semuaPeringatan.push(...cekKapasitasDatastore(activeConfig));
    semuaPeringatan.push(...cekUptimeVmKritis(activeConfig));
    semuaPeringatan.push(...cekVmKritisMati(activeConfig));

    if (semuaPeringatan.length > 0) {
      const BATAS_PESAN_DETAIL = 20;

      if (semuaPeringatan.length > BATAS_PESAN_DETAIL) {
          const counts = { datastore: 0, uptime: { total: 0, byCrit: {} }, vmMati: { total: 0, byCrit: {} } };
          const dataUntukEkspor = [];
          const headers = ["Tipe Peringatan", "Item yang Diperiksa", "Detail", "Kritikalitas"];
          const dsAlerts = semuaPeringatan.filter(alert => alert.tipe.includes("Kapasitas Datastore"));
          counts.datastore = dsAlerts.length;

          semuaPeringatan.forEach(alert => {
            if (!alert.tipe.includes("Kapasitas Datastore")) {
                if (alert.tipe.includes("Uptime VM")) {
                  counts.uptime.total++;
                  const crit = alert.kritikalitas || 'Lainnya';
                  counts.uptime.byCrit[crit] = (counts.uptime.byCrit[crit] || 0) + 1;
                } else if (alert.tipe.includes("VM Kritis")) {
                  counts.vmMati.total++;
                  const crit = alert.kritikalitas || 'Lainnya';
                  counts.vmMati.byCrit[crit] = (counts.vmMati.byCrit[crit] || 0) + 1;
                }
            }
            dataUntukEkspor.push([alert.tipe, alert.item, alert.detailRaw, alert.kritikalitas || 'N/A']);
          });
          
          const dsThreshold = activeConfig[KONSTANTA.KUNCI_KONFIG.THRESHOLD_DS_USED] || 'N/A';
          const uptimeThreshold = activeConfig[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME] || 'N/A';
          
          let ringkasanPesan = `🚨 <b>Laporan Kondisi Sistem</b> 🚨\n`;
          ringkasanPesan += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID')}</i>\n\n`;
          ringkasanPesan += `Teridentifikasi total <b>${semuaPeringatan.length}</b> item yang memerlukan tinjauan. Detail lengkap telah diekspor ke dalam file Google Sheet.\n\n`;
          ringkasanPesan += `<b>Ringkasan Peringatan:</b>\n\n`;
          
          ringkasanPesan += `• 🔥 <b>Kapasitas Datastore Melebihi Ambang Batas (>${dsThreshold}%):</b> <code>${counts.datastore}</code>\n`;
          if (dsAlerts.length > 0) {
              const MAX_DS_TO_SHOW = 3;
              for (let i = 0; i < Math.min(dsAlerts.length, MAX_DS_TO_SHOW); i++) {
                  const alert = dsAlerts[i];
                  const usage = alert.detailRaw.split(',')[0].split(':')[1].trim();
                  ringkasanPesan += `  - <code>${escapeHtml(alert.item)}</code> (${usage})\n`;
              }
              if (dsAlerts.length > MAX_DS_TO_SHOW) {
                  ringkasanPesan += `  - <i>... dan ${dsAlerts.length - MAX_DS_TO_SHOW} lainnya.</i>\n`;
              }
              // --- AWAL MODIFIKASI: Menambahkan pesan Call to Action di sini ---
              ringkasanPesan += `  └ <i>Jalankan <code>/migrasicheck</code> untuk mendapatkan rekomendasi perbaikan.</i>\n`;
              // --- AKHIR MODIFIKASI ---
          }
          
          const skorKritikalitas = activeConfig[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
          const sortCrit = (a, b) => (skorKritikalitas[b.toUpperCase()] || 0) - (skorKritikalitas[a.toUpperCase()] || 0);
          
          ringkasanPesan += `\n• 💡 <b>Uptime VM Melebihi Batas Operasional (>${uptimeThreshold} hari):</b> <code>${counts.uptime.total}</code>\n`;
          if (counts.uptime.total > 0) {
              Object.keys(counts.uptime.byCrit).sort(sortCrit).forEach(crit => {
                  ringkasanPesan += `  - ${escapeHtml(crit)}: ${counts.uptime.byCrit[crit]}\n`;
              });
          }
          
          ringkasanPesan += `\n• ❗️ <b>VM Kritis Dalam Status Non-Aktif:</b> <code>${counts.vmMati.total}</code>\n`;
          if (counts.vmMati.total > 0) {
              Object.keys(counts.vmMati.byCrit).sort(sortCrit).forEach(crit => {
                  ringkasanPesan += `  - ${escapeHtml(crit)}: ${counts.vmMati.byCrit[crit]}\n`;
              });
          }

          kirimPesanTelegram(ringkasanPesan, activeConfig, 'HTML');
          exportResultsToSheet(headers, dataUntukEkspor, "Laporan Detail Kondisi Sistem", activeConfig, null, "Kritikalitas");

      } else {
        let pesanDetail = `🚨 <b>Laporan Kondisi Sistem</b> 🚨\n`;
        pesanDetail += `<i>Teridentifikasi ${semuaPeringatan.length} item yang memerlukan tinjauan:</i>\n`;
        
        const formattedAlerts = semuaPeringatan.map(alert => {
            let alertMessage = `${alert.icon} <b>${alert.tipe}</b>\n • <b>Item:</b> <code>${escapeHtml(alert.item)}</code>\n • <b>Detail:</b> ${alert.detailFormatted}`;
            if (alert.kritikalitas) {
                alertMessage += `\n • <b>Kritikalitas:</b> <i>${escapeHtml(alert.kritikalitas)}</i>`;
            }
            return alertMessage;
        });
        pesanDetail += "\n" + formattedAlerts.join('\n\n');
        
        const dsAlertsDetail = semuaPeringatan.filter(alert => alert.tipe.includes("Kapasitas Datastore"));
        if (dsAlertsDetail.length > 0) {
            pesanDetail += `\n\n<i>Jalankan <code>/migrasicheck</code> untuk mendapatkan rekomendasi perbaikan.</i>`;
        }
        
        kirimPesanTelegram(pesanDetail, activeConfig, 'HTML');
      }
    } else {
      const pesanAman = "✅  <b>Kondisi Sistem: Aman</b>\n<i>Tidak ada anomali yang terdeteksi pada semua sistem yang dipantau.</i>";
      console.log("Semua sistem terpantau dalam batas aman.");
      kirimPesanTelegram(pesanAman, activeConfig, 'HTML');
    }
  } catch (e) {
    console.error(`Gagal menjalankan pemeriksaan ambang batas: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`⚠️ <b>Gagal Memeriksa Kondisi Sistem</b>\n<i>Error: ${e.message}</i>`, activeConfig, 'HTML');
  }
}
  
/**
 * [PERBAIKAN KONSISTENSI]
 * Memeriksa datastore yang kapasitasnya melebihi threshold dan MENGEMBALIKAN array berisi objek terstruktur.
 * @param {object} config Objek konfigurasi bot.
 * @returns {Array<object>} Array berisi objek peringatan.
 */
function cekKapasitasDatastore(config) {
  const threshold = parseInt(config.THRESHOLD_DS_USED_PERCENT, 10);
  if (isNaN(threshold)) return [];

  const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_DS]);
  // Mengembalikan objek error yang terstruktur jika sheet tidak ditemukan
  if (!dsSheet) return [{ tipe: "Error Sistem", item: "Pengecekan Kapasitas Datastore", detailFormatted: "Sheet tidak ditemukan.", detailRaw: "Sheet tidak ditemukan.", icon: "⚠️", kritikalitas: "N/A" }];

  const headers = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
  const nameIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
  const usedPercentIndex = headers.indexOf(KONSTANTA.HEADER_DS.USED_PERCENT);

  // Mengembalikan objek error yang terstruktur jika header tidak ditemukan
  if (nameIndex === -1 || usedPercentIndex === -1) return [{ tipe: "Error Sistem", item: "Pengecekan Kapasitas Datastore", detailFormatted: "Header penting tidak ditemukan.", detailRaw: "Header penting tidak ditemukan.", icon: "⚠️", kritikalitas: "N/A" }];

  const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
  const alerts = [];

  dsData.forEach(row => {
    const usedPercent = parseFloat(row[usedPercentIndex]);
    if (!isNaN(usedPercent) && usedPercent > threshold) {
      const dsName = row[nameIndex];
      // [IMPLEMENTASI] Logika tidak berubah, hanya format output yang diubah menjadi OBJEK.
      alerts.push({
        tipe: "Kapasitas Datastore Kritis",
        item: dsName,
        detailFormatted: `Kapasitas Terpakai: <b>${usedPercent.toFixed(1)}%</b> (Ambang Batas: ${threshold}%)`,
        detailRaw: `Terpakai: ${usedPercent.toFixed(1)}%, Batas: ${threshold}%`,
        icon: "🔥",
        kritikalitas: null // Datastore tidak memiliki kolom kritikalitas
      });
    }
  });
  return alerts;
}

/**
 * [MODIFIKASI v2.3 - FIX] Menggunakan sumber skor kritikalitas yang benar dari config,
 * bukan dari konstanta yang telah dihapus.
 */
function cekUptimeVmKritis(config) {
  const threshold = parseInt(config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME], 10);
  
  // --- AWAL PERBAIKAN ---
  // Mendapatkan sistem skoring dari konfigurasi, bukan konstanta.
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
  // Mengambil daftar level kritikalitas dari kunci objek skor.
  const monitoredCrit = Object.keys(skorKritikalitas).filter(k => k !== 'DEFAULT');
  // --- AKHIR PERBAIKAN ---

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
    const criticality = String(row[critIndex] || '').toUpperCase().trim();

    if (monitoredCrit.includes(criticality) && !isNaN(uptimeDays) && uptimeDays > threshold) {
      alerts.push({
        tipe: "Uptime VM Melebihi Batas Operasional",
        item: row[nameIndex],
        detailFormatted: `Uptime: <b>${uptimeDays} hari</b> (Batas: ${threshold} hari)`,
        detailRaw: `Uptime: ${uptimeDays} hari, Batas: ${threshold} hari`,
        icon: "💡",
        kritikalitas: row[critIndex]
      });
    }
  });
  return alerts;
}

// ===================================================================================

/**
 * [MODIFIKASI v2.3 - FIX] Menggunakan sumber skor kritikalitas yang benar dari config,
 * bukan dari konstanta yang telah dihapus.
 */
function cekVmKritisMati(config) {
  // --- AWAL PERBAIKAN ---
  // Mendapatkan sistem skoring dari konfigurasi, bukan konstanta.
  const skorKritikalitas = config[KONSTANTA.KUNCI_KONFIG.SKOR_KRITIKALITAS] || {};
  // Mengambil daftar level kritikalitas dari kunci objek skor.
  const monitoredCrit = Object.keys(skorKritikalitas).filter(k => k !== 'DEFAULT');
  // --- AKHIR PERBAIKAN ---

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
    const criticality = String(row[critIndex] || '').toUpperCase().trim();

    if (monitoredCrit.includes(criticality) && state.includes('off')) {
       alerts.push({
        tipe: "VM Kritis Dalam Status Non-Aktif",
        item: row[nameIndex],
        detailFormatted: `Status: <b>poweredOff</b>`,
        detailRaw: `Status: poweredOff`,
        icon: "❗️",
        kritikalitas: row[critIndex]
      });
    }
  });
  return alerts;
}
