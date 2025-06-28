// ===== FILE: Peringatan.gs =====

  /**
   * Fungsi utama untuk menjalankan semua pemeriksaan ambang batas (thresholds).
   */
  function jalankanPemeriksaanAmbangBatas() {
    console.log("Memulai pemeriksaan ambang batas sistem...");
    try {
      const config = bacaKonfigurasi();
      let semuaPeringatan = [];

      // Menggabungkan hasil dari semua fungsi pemeriksaan
      semuaPeringatan.push(...cekKapasitasDatastore(config));
      semuaPeringatan.push(...cekUptimeVmKritis(config));
      semuaPeringatan.push(...cekVmKritisMati(config));

      if (semuaPeringatan.length > 0) {
        const BATAS_PESAN_DETAIL = 20;

        // Jika jumlah peringatan melebihi batas, kirim ringkasan dan file ekspor
        if (semuaPeringatan.length > BATAS_PESAN_DETAIL) {
          const counts = {
              datastore: 0,
              uptime: { total: 0, byCrit: {} },
              vmMati: { total: 0, byCrit: {} }
          };
          const dataUntukEkspor = [];
          const headers = ["Tipe Peringatan", "Item yang Diperiksa", "Detail", "Kritikalitas"];

          semuaPeringatan.forEach(alert => {
            if (alert.tipe.includes("Kapasitas Datastore")) counts.datastore++;
            else if (alert.tipe.includes("Uptime VM")) {
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
          
          const dsThreshold = config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_DS_USED] || 'N/A';
          const uptimeThreshold = config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME] || 'N/A';
          
          let ringkasanPesan = `🚨 <b>Laporan Peringatan Dini Sistem</b> 🚨\n`;
          ringkasanPesan += `<i>Analisis dijalankan pada: ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>\n\n`;
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

          // Mengirim pesan ringkasan terlebih dahulu
          kirimPesanTelegram(ringkasanPesan, config, 'HTML');

          // [PERBAIKAN] Memanggil fungsi ekspor, menangkap URL, dan mengirimkannya
          // Argumen juga diperbaiki urutannya
          const fileUrl = exportResultsToSheet(headers, dataUntukEkspor, "Laporan Detail Peringatan Sistem", config, true, "Kritikalitas", null);
          
          if (fileUrl) {
            const pesanFile = `📄 Tautan untuk Laporan Detail Peringatan Sistem dapat diakses di sini:\n${fileUrl}`;
            kirimPesanTelegram(pesanFile, config, 'HTML');
          }

        } else {
          // Jika jumlah peringatan di bawah batas, kirim pesan detail langsung
          let pesanDetail = `🚨 <b>Laporan Peringatan Dini Sistem</b> 🚨\n`;
          pesanDetail += `<i>Ditemukan ${semuaPeringatan.length} potensi masalah yang memerlukan perhatian Anda:</i>\n`;
          pesanDetail += `------------------------------------\n\n`;
          
          const formattedAlerts = semuaPeringatan.map(alert => {
              let alertMessage = `${alert.icon} <b>${alert.tipe}</b>\n • Item: <code>${escapeHtml(alert.item)}</code>\n • Detail: ${alert.detailFormatted}`;
              if (alert.kritikalitas) {
                  alertMessage += `\n • Kritikalitas: <b>${escapeHtml(alert.kritikalitas)}</b>`;
              }
              return alertMessage;
          });
          pesanDetail += formattedAlerts.join('\n\n');
          
          kirimPesanTelegram(pesanDetail, config, 'HTML');
        }
        console.log(`Laporan peringatan dini telah dikirim dengan ${semuaPeringatan.length} item.`);
      } else {
        console.log("Semua sistem terpantau dalam batas aman.");
      }
    } catch (e) {
      console.error(`Gagal menjalankan pemeriksaan ambang batas: ${e.message}\nStack: ${e.stack}`);
      kirimPesanTelegram(`⚠️ Gagal menjalankan Sistem Peringatan Dini.\nError: ${e.message}`, bacaKonfigurasi());
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
    const usedPercentIndex = headers.indexOf('Used Space (%)');
  
    if (nameIndex === -1 || usedPercentIndex === -1) return ["- Pengecekan datastore gagal: header tidak ditemukan."];
    
    const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
    const alerts = [];
  
    dsData.forEach(row => {
      const usedPercent = parseFloat(row[usedPercentIndex]);
      if (!isNaN(usedPercent) && usedPercent > threshold) {
        const dsName = row[nameIndex];
        alerts.push(`🔥 <b>Kapasitas Datastore Kritis</b>\n • Datastore: <code>${escapeHtml(dsName)}</code>\n • Kapasitas Terpakai: <b>${usedPercent.toFixed(1)}%</b> (Ambang Batas: ${threshold}%)`);
      }
    });
    return alerts;
  }
  
  /**
   * [DIROMBAK] Menambahkan data kritikalitas ke objek yang dikembalikan.
   */
  function cekUptimeVmKritis(config) {
    const threshold = parseInt(config[KONSTANTA.KUNCI_KONFIG.THRESHOLD_VM_UPTIME], 10);
    const monitoredCrit = config[KONSTANTA.KUNCI_KONFIG.KRITIKALITAS_PANTAU] || [];
    if (isNaN(threshold) || monitoredCrit.length === 0) return [];
  
    const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (!vmSheet) return [{ tipe: "Error Sistem", item: "Pengecekan Uptime VM", detailFormatted: "Sheet tidak ditemukan.", detailRaw: "Sheet tidak ditemukan.", icon: "⚠️" }];
  
    const headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
    const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const uptimeIndex = headers.indexOf(KONSTANTA.HEADER_VM.UPTIME);
    const critIndex = headers.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS);
    if (nameIndex === -1 || uptimeIndex === -1 || critIndex === -1) return [];
  
    const vmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();
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
          kritikalitas: criticality // [BARU] Menyimpan info kritikalitas
        });
      }
    });
    return alerts;
  }
  
  /**
   * [DIROMBAK] Menambahkan data kritikalitas ke objek yang dikembalikan.
   */
  function cekVmKritisMati(config) {
    const monitoredCrit = config[KONSTANTA.KUNCI_KONFIG.KRITIKALITAS_PANTAU] || [];
    if (monitoredCrit.length === 0) return [];
  
    const vmSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (!vmSheet) return [{ tipe: "Error Sistem", item: "Pengecekan Status VM", detailFormatted: "Sheet tidak ditemukan.", detailRaw: "Sheet tidak ditemukan.", icon: "⚠️" }];
  
    const headers = vmSheet.getRange(1, 1, 1, vmSheet.getLastColumn()).getValues()[0];
    const nameIndex = headers.indexOf(KONSTANTA.HEADER_VM.VM_NAME);
    const stateIndex = headers.indexOf(KONSTANTA.HEADER_VM.STATE);
    const critIndex = headers.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS);
    if (nameIndex === -1 || stateIndex === -1 || critIndex === -1) return [];
  
    const vmData = vmSheet.getRange(2, 1, vmSheet.getLastRow() - 1, vmSheet.getLastColumn()).getValues();
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
          kritikalitas: criticality // [BARU] Menyimpan info kritikalitas
        });
      }
    });
    return alerts;
  }