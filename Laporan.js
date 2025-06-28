// ===== FILE: Laporan.gs =====

function generateVcenterSummary(config) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
  if (!sheet || sheet.getLastRow() <= 1) {
    return { message: "<i>Data VM tidak ditemukan untuk membuat ringkasan.</i>\n\n", keyboard: null };
  }
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const vCenterIndex = headers.indexOf(KONSTANTA.HEADER_VM.VCENTER);
  const stateIndex = headers.indexOf(KONSTANTA.HEADER_VM.STATE);
  const uptimeIndex = headers.indexOf(KONSTANTA.HEADER_VM.UPTIME);
  if (vCenterIndex === -1 || stateIndex === -1) {
    return { message: `<i>Gagal membuat ringkasan: Kolom '${KONSTANTA.HEADER_VM.VCENTER}' atau '${KONSTANTA.HEADER_VM.STATE}' tidak ditemukan di header.</i>\n\n`, keyboard: null };
  }
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const vCenterSummary = {};
  let totalGlobal = { on: 0, off: 0, total: 0 };
  const uptimeCategories = { '0_1': 0, '1_2': 0, '2_3': 0, 'over_3': 0, 'invalid': 0 };
  let totalUptimeValid = 0;
  data.forEach(row => {
    const vCenter = row[vCenterIndex] || 'Lainnya';
    if (!vCenterSummary[vCenter]) {
      vCenterSummary[vCenter] = { on: 0, off: 0, total: 0 };
    }
    const state = String(row[stateIndex] || '').toLowerCase();
    vCenterSummary[vCenter].total++;
    totalGlobal.total++;
    if (state.includes('on')) {
      vCenterSummary[vCenter].on++;
      totalGlobal.on++;
    } else {
      vCenterSummary[vCenter].off++;
      totalGlobal.off++;
    }
    if (uptimeIndex !== -1) {
      const uptimeValue = row[uptimeIndex];
      const uptimeDays = parseInt(uptimeValue, 10);
      if (uptimeValue !== '' && uptimeValue !== '-' && !isNaN(uptimeDays)) {
        totalUptimeValid++;
        if (uptimeDays <= 365) uptimeCategories['0_1']++;
        else if (uptimeDays <= 730) uptimeCategories['1_2']++;
        else if (uptimeDays <= 1095) uptimeCategories['2_3']++;
        else uptimeCategories['over_3']++;
      } else {
        uptimeCategories['invalid']++;
      }
    }
  });
  let message = "";
  const vCenterOrder = Object.keys(vCenterSummary).sort();
  vCenterOrder.forEach(vc => {
    if (vCenterSummary[vc]) {
      message += `<b>🏢 vCenter: ${vc}</b>\n`;
      message += `🟢 Power On: ${vCenterSummary[vc].on}\n`;
      message += `🔴 Power Off: ${vCenterSummary[vc].off}\n`;
      message += `Total VM: ${vCenterSummary[vc].total}\n\n`;
    }
  });
  message += `<b>--- GRAND TOTAL ---</b>\n`;
  message += `🟢 Power On: <b>${totalGlobal.on}</b>\n`;
  message += `🔴 Power Off: <b>${totalGlobal.off}</b>\n`;
  message += `<b>Total VM: ${totalGlobal.total}</b>\n\n`;
  let uptimeKeyboard = null;
  if (uptimeIndex !== -1) {
    message += `<b>📊 Ringkasan Uptime (dari total ${totalGlobal.total} VM)</b>\n`;
    message += `- Di bawah 1 Tahun: <b>${uptimeCategories['0_1']} VM</b>\n`;
    message += `- 1 sampai 2 Tahun: <b>${uptimeCategories['1_2']} VM</b>\n`;
    message += `- 2 sampai 3 Tahun: <b>${uptimeCategories['2_3']} VM</b>\n`;
    message += `- Di atas 3 Tahun: <b>${uptimeCategories['over_3']} VM</b>\n`;
    message += `- Data Tidak Valid/Kosong: <b>${uptimeCategories['invalid']} VM</b>\n`;
  }
  return { message: message, keyboard: null }; // Keyboard sengaja dibuat null untuk laporan harian
}

function buatLaporanHarianVM() {
  const startTime = new Date();
  const config = bacaKonfigurasi();
  let pesanLaporan = `🚨 <b>Laporan Harian VM</b>\n`;
  pesanLaporan += `<i>Analisis dijalankan pada: ${startTime.toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>\n`;
  pesanLaporan += `--------------------------------------------------\n`;
  
  const summary = generateVcenterSummary(config);
  pesanLaporan += summary.message;
  pesanLaporan += `\n--------------------------------------------------`;

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheetLog = spreadsheet.getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN) || spreadsheet.insertSheet(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  const expectedLogHeader = [
    KONSTANTA.HEADER_LOG.TIMESTAMP, KONSTANTA.HEADER_LOG.ACTION, 
    KONSTANTA.HEADER_VM.PK, KONSTANTA.HEADER_VM.VM_NAME, 
    "Sheet Name", KONSTANTA.HEADER_LOG.OLD_VAL, KONSTANTA.HEADER_LOG.NEW_VAL, KONSTANTA.HEADER_LOG.DETAIL
  ];
  if (sheetLog.getLastRow() === 0) {
    sheetLog.appendRow(expectedLogHeader);
  }

  try {
    const sheetDataUtama = spreadsheet.getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (!sheetDataUtama) throw new Error(`Sheet data utama "${config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]}" tidak ditemukan.`);
    const headers = sheetDataUtama.getRange(1, 1, 1, sheetDataUtama.getLastColumn()).getValues()[0];
    const pkIndex = headers.indexOf(KONSTANTA.HEADER_VM.PK);
    if (pkIndex === -1) throw new Error(`Kolom '${KONSTANTA.HEADER_VM.PK}' tidak ditemukan.`);

    const folderArsip = DriveApp.getFolderById(config[KONSTANTA.KUNCI_KONFIG.FOLDER_ARSIP]);
    const files = folderArsip.getFilesByName(KONSTANTA.NAMA_FILE.ARSIP_VM);
    let mapVmKemarin = new Map();
    let fileArsip;
    if (files.hasNext()) {
      fileArsip = files.next();
      try { mapVmKemarin = new Map(JSON.parse(fileArsip.getBlob().getDataAsString())); } 
      catch (e) { console.warn(`Gagal parse arsip VM: ${e.message}`); }
    }

    const dataHariIni = sheetDataUtama.getLastRow() > 1 ? sheetDataUtama.getRange(2, 1, sheetDataUtama.getLastRow() - 1, sheetDataUtama.getLastColumn()).getValues() : [];
    const mapVmHariIni = new Map();
    const buatObjekDataVM = (row) => {
      const data = {};
      config[KONSTANTA.KUNCI_KONFIG.KOLOM_PANTAU].forEach(kolom => { data[kolom.nama] = row[kolom.index]; });
      return data;
    };
    dataHariIni.forEach(row => {
      const pk = row[pkIndex];
      if (pk) {
        const vmData = buatObjekDataVM(row);
        mapVmHariIni.set(pk, { data: vmData, hash: computeVmHash(vmData) });
      }
    });
    
    let logEntriesToAdd = [];
    const timestamp = new Date();

    for (const [id, dataHariIniObj] of mapVmHariIni.entries()) {
      const dataKemarinObj = mapVmKemarin.get(id);
      if (!dataKemarinObj) {
        const logEntry = [timestamp, 'PENAMBAHAN', id, dataHariIniObj.data[KONSTANTA.HEADER_VM.VM_NAME], sheetDataUtama.getName(), '', '', 'VM baru dibuat'];
        logEntriesToAdd.push(logEntry);
      } else if (dataHariIniObj.hash !== dataKemarinObj.hash) {
        for (const key in dataHariIniObj.data) {
          if (key === KONSTANTA.HEADER_VM.UPTIME || key === KONSTANTA.HEADER_VM.PROV_TB) continue; 
          if (String(dataHariIniObj.data[key]) !== String(dataKemarinObj.data[key])) {
            const logEntry = [timestamp, 'MODIFIKASI', id, dataHariIniObj.data[KONSTANTA.HEADER_VM.VM_NAME], sheetDataUtama.getName(), dataKemarinObj.data[key] || '', dataHariIniObj.data[key] || '', `Kolom '${key}' diubah`];
            logEntriesToAdd.push(logEntry);
          }
        }
      }
      mapVmKemarin.delete(id);
    }
    for (const [id, dataKemarinObj] of mapVmKemarin.entries()) {
      const vmName = (dataKemarinObj.data && dataKemarinObj.data[KONSTANTA.HEADER_VM.VM_NAME]) || 'Nama tidak diketahui';
      const logEntry = [timestamp, 'PENGHAPUSAN', id, vmName, sheetDataUtama.getName(), '', '', 'VM telah dihapus'];
      logEntriesToAdd.push(logEntry);
    }
    
    if (logEntriesToAdd.length > 0) {
      sheetLog.getRange(sheetLog.getLastRow() + 1, 1, logEntriesToAdd.length, expectedLogHeader.length).setValues(logEntriesToAdd);
      
      const counts = { penambahan: 0, modifikasi: 0, pengurangan: 0 };
      const actionIndex = expectedLogHeader.indexOf(KONSTANTA.HEADER_LOG.ACTION);
      logEntriesToAdd.forEach(log => {
        const action = log[actionIndex];
        if (action.includes('PENAMBAHAN')) counts.penambahan++;
        else if (action.includes('MODIFIKASI')) counts.modifikasi++;
        else if (action.includes('PENGHAPUSAN')) counts.pengurangan++;
      });

      pesanLaporan += `\n\n📈 <b>Ringkasan Perubahan</b>\n\n`;
      pesanLaporan += `• Total Perubahan Hari Ini: <b>${logEntriesToAdd.length} entri</b>\n`;
      pesanLaporan += `  - Penambahan: ${counts.penambahan}\n`;
      pesanLaporan += `  - Modifikasi: ${counts.modifikasi}\n`;
      pesanLaporan += `  - Pengurangan: ${counts.pengurangan}\n\n`;
      pesanLaporan += `<i>(Gunakan /cekhistory untuk detail atau /export untuk mengunduh log)</i>`;

    } else {
      pesanLaporan += "\n\n✅ Tidak ada perubahan data terdeteksi hari ini.";
    }

    kirimPesanTelegram(pesanLaporan, config, 'HTML');

    const dataUntukArsip = JSON.stringify(Array.from(mapVmHariIni.entries()));
    if (fileArsip) {
      fileArsip.setContent(dataUntukArsip);
    } else {
      folderArsip.createFile(KONSTANTA.NAMA_FILE.ARSIP_VM, dataUntukArsip, MimeType.PLAIN_TEXT);
    }
    console.log("Pengarsipan VM selesai.");
    
  } catch (e) {
    console.error(`Error saat membuat laporan harian: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`<b>⚠️ Peringatan: Proses Laporan VM Gagal!</b>\n\n<code>${escapeHtml(e.message)}</code>`, config);
  }
}

function formatBatchNotification(vmBaru, vmDihapus, vmDimodifikasi) {
  let message = `<b>Log Perubahan Terdeteksi:</b>\n`;
  let buttons = [];

  if (vmBaru.length > 0) {
    message += `\n<b>✅ VM Baru (${vmBaru.length}):</b>\n`;
    vmBaru.forEach(log => message += `- ${escapeHtml(log[3])}\n`);
  }
  
  if (vmDihapus.length > 0) {
    message += `\n<b>❌ VM Dihapus (${vmDihapus.length}):</b>\n`;
    vmDihapus.forEach(log => message += `- ${escapeHtml(log[3])}\n`);
  }
  
  if (vmDimodifikasi.length > 0) {
    const modifiedSummary = new Map();
    vmDimodifikasi.forEach(log => {
      const pk = log[2];
      const vmName = log[3];
      const detail = log[7];
      if (!modifiedSummary.has(vmName)) {
        modifiedSummary.set(vmName, { pk: pk, changes: [] });
      }
      modifiedSummary.get(vmName).changes.push(detail.replace("Kolom '", "").replace("' diubah", ""));
    });

    message += `\n<b>✏️ VM Dimodifikasi (${modifiedSummary.size}):</b>\n`;
    modifiedSummary.forEach((value, vmName) => {
      message += `- <b>${escapeHtml(vmName)}</b>: <i>${escapeHtml(value.changes.join(', '))}</i>\n`;
      buttons.push([{ text: `📜 Riwayat: ${vmName.substring(0,40)}`, callback_data: `history_${value.pk}` }]);
    });
  }
  
  let keyboard = null;
  if (buttons.length > 0) {
    keyboard = { inline_keyboard: buttons };
  }

  return { message: message, keyboard: keyboard };
}

function buatLaporanPeriodik(periode) {
  const config = bacaKonfigurasi();
  const today = new Date();
  let startDate = new Date();
  let title;

  if (periode === 'mingguan') {
    startDate.setDate(today.getDate() - 7);
    title = `Laporan Mingguan VM (${startDate.toLocaleDateString('id-ID')} - ${today.toLocaleDateString('id-ID')})`;
  } else if (periode === 'bulanan') {
    startDate.setMonth(today.getMonth() - 1);
    title = `Laporan Bulanan VM (Bulan ${today.toLocaleString('id-ID', { month: 'long' })})`;
  } else {
    return;
  }

  let pesanLaporan = `<b>${title}</b>\n`;
  pesanLaporan += `--------------------------------------------------\n`;
  
  const summary = generateVcenterSummary(config);
  pesanLaporan += summary.message;

  pesanLaporan += `\n--------------------------------------------------\n\n`;

  const sheetLog = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KONSTANTA.NAMA_SHEET.LOG_PERUBAHAN);
  if (!sheetLog || sheetLog.getLastRow() <= 1) {
    pesanLaporan += "✅ Tidak ada log perubahan yang tercatat pada periode ini.";
    kirimPesanTelegram(pesanLaporan, config);
    return;
  }
  
  const logData = sheetLog.getRange(2, 1, sheetLog.getLastRow() - 1, sheetLog.getLastColumn()).getValues();
  const changes = { baru: 0, dihapus: 0, dimodifikasi: 0 };
  const entriesForExport = [];

  logData.forEach(row => {
    const logTimestamp = new Date(row[0]);
    if (logTimestamp >= startDate && logTimestamp <= today) {
      const action = row[1];
      if (action === 'PENAMBAHAN' || action === 'DATASTORE BARU') changes.baru++;
      else if (action === 'PENGHAPUSAN' || action === 'DATASTORE DIHAPUS') changes.dihapus++;
      else if (action === 'MODIFIKASI' || action === 'KAPASITAS DS DIUBAH') changes.dimodifikasi++;
      entriesForExport.push(row);
    }
  });

  pesanLaporan += `<b>Ringkasan Perubahan Periode Ini:</b>\n`;
  pesanLaporan += `✅ Baru: ${changes.baru} entri\n`;
  pesanLaporan += `✏️ Dimodifikasi: ${changes.dimodifikasi} entri\n`;
  pesanLaporan += `❌ Dihapus: ${changes.dihapus} entri\n`;

  let inlineKeyboard = null;
  if (entriesForExport.length > 0) {
    const headers = sheetLog.getRange(1, 1, 1, sheetLog.getLastColumn()).getValues()[0];
    const fileUrl = exportResultsToSheet(headers, entriesForExport, `Log Perubahan - ${periode}`, config, null, true);
    if (fileUrl) {
      inlineKeyboard = { inline_keyboard: [[{ text: `📄 Lihat Detail ${entriesForExport.length} Log di Sheet`, url: fileUrl }]] };
    }
  } else {
    pesanLaporan += "\n✅ Tidak ada perubahan yang tercatat pada periode ini.";
  }
  
  kirimPesanTelegram(pesanLaporan, config, 'HTML', inlineKeyboard);
}

function generateProvisioningReport(config) {
  kirimPesanTelegram("📊 Menganalisis laporan provisioning... Ini mungkin memakan waktu beberapa saat.", config);

  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (!sheet || sheet.getLastRow() <= 1) throw new Error('Data VM tidak ditemukan atau sheet kosong.');

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const requiredCols = [KONSTANTA.HEADER_VM.PK, KONSTANTA.HEADER_VM.VM_NAME, KONSTANTA.HEADER_VM.VCENTER, KONSTANTA.HEADER_VM.STATE, KONSTANTA.HEADER_VM.CPU, KONSTANTA.HEADER_VM.MEMORY, KONSTANTA.HEADER_VM.PROV_TB];
    const indices = {};
    requiredCols.forEach(col => {
      indices[col] = headers.indexOf(col);
      if (indices[col] === -1) throw new Error(`Header '${col}' tidak ditemukan.`);
    });

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    
    const reportData = { Top5: { cpu: [], memory: [], disk: [] } };
    const vCenters = new Set(allData.map(row => row[indices[KONSTANTA.HEADER_VM.VCENTER]] || 'Lainnya'));

    ['Total', ...vCenters].forEach(vc => {
      reportData[vc] = { vmCount: 0, cpuOn: 0, cpuOff: 0, memOn: 0, memOff: 0, disk: 0 };
    });

    for (const row of allData) {
      const vCenter = row[indices[KONSTANTA.HEADER_VM.VCENTER]] || 'Lainnya';
      const isPoweredOn = String(row[indices[KONSTANTA.HEADER_VM.STATE]] || '').toLowerCase().includes('on');
      
      const cpu = parseInt(row[indices[KONSTANTA.HEADER_VM.CPU]], 10) || 0;
      const memory = parseFloat(row[indices[KONSTANTA.HEADER_VM.MEMORY]]) || 0;
      const disk = parseFloat(row[indices[KONSTANTA.HEADER_VM.PROV_TB]]) || 0;

      reportData[vCenter].vmCount++;
      reportData['Total'].vmCount++;
      reportData[vCenter].disk += disk;
      reportData['Total'].disk += disk;

      if(isPoweredOn) {
        reportData[vCenter].cpuOn += cpu;
        reportData[vCenter].memOn += memory;
        reportData['Total'].cpuOn += cpu;
        reportData['Total'].memOn += memory;
      } else {
        reportData[vCenter].cpuOff += cpu;
        reportData[vCenter].memOff += memory;
        reportData['Total'].cpuOff += cpu;
        reportData['Total'].memOff += memory;
      }

      const vmInfo = { name: row[indices[KONSTANTA.HEADER_VM.VM_NAME]], pk: row[indices[KONSTANTA.HEADER_VM.PK]] };
      updateTop5(reportData.Top5.cpu, { ...vmInfo, value: cpu });
      updateTop5(reportData.Top5.memory, { ...vmInfo, value: memory });
      updateTop5(reportData.Top5.disk, { ...vmInfo, value: disk });
    }

    let message = `<b>📊 Laporan Provisioning Sumber Daya</b>\n`;
    message += `<i>Berdasarkan data per ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>`;

    Object.keys(reportData).filter(key => key !== 'Top5' && key !== 'Total').sort().forEach(vc => {
      message += `\n\n------------------------------------\n`;
      message += `<b>🏢 vCenter: ${vc}</b>\n\n`;
      const d = reportData[vc];
      const totalCpu = d.cpuOn + d.cpuOff;
      const totalMem = d.memOn + d.memOff;
      message += `<b>vCPU:</b>\n`;
      message += ` • Total Provisioned: <b>${totalCpu} vCPU</b>\n`;
      message += ` • Teralokasi (On): ${d.cpuOn} vCPU\n`;
      message += ` • Teralokasi (Off): ${d.cpuOff} vCPU\n`;
      message += ` • Rata-rata/VM: ${d.vmCount > 0 ? (totalCpu / d.vmCount).toFixed(1) : 0} vCPU\n\n`;
      message += `<b>Memory:</b>\n`;
      message += ` • Total Provisioned: <b>${totalMem.toFixed(0)} GB</b> (${(totalMem / 1024).toFixed(2)} TB)\n`;
      message += ` • Teralokasi (On): ${d.memOn.toFixed(0)} GB (${(d.memOn / 1024).toFixed(2)} TB)\n`;
      message += ` • Teralokasi (Off): ${d.memOff.toFixed(0)} GB (${(d.memOff / 1024).toFixed(2)} TB)\n`;
      message += ` • Rata-rata/VM: ${d.vmCount > 0 ? (totalMem / d.vmCount).toFixed(1) : 0} GB\n\n`;
      message += `<b>Disk:</b>\n`;
      message += ` • Total Provisioned: <b>${d.disk.toFixed(2)} TB</b>\n`;
    });
    
    message += `\n\n------------------------------------\n`;
    message += `<b>🌍 GRAND TOTAL</b>\n\n`;
    const t = reportData['Total'];
    const totalCpuGrand = t.cpuOn + t.cpuOff;
    const totalMemGrand = t.memOn + t.memOff;
    message += `<b>vCPU:</b>\n`;
    message += ` • Total Provisioned: <b>${totalCpuGrand} vCPU</b>\n`;
    message += ` • Teralokasi (On): ${t.cpuOn} vCPU\n`;
    message += ` • Teralokasi (Off): ${t.cpuOff} vCPU\n`;
    message += ` • Rata-rata/VM: ${t.vmCount > 0 ? (totalCpuGrand / t.vmCount).toFixed(1) : 0} vCPU\n\n`;
    message += `<b>Memory:</b>\n`;
    message += ` • Total Provisioned: <b>${totalMemGrand.toFixed(0)} GB</b> (${(totalMemGrand / 1024).toFixed(2)} TB)\n`;
    message += ` • Teralokasi (On): ${t.memOn.toFixed(0)} GB (${(t.memOn / 1024).toFixed(2)} TB)\n`;
    message += ` • Teralokasi (Off): ${t.memOff.toFixed(0)} GB (${(t.memOff / 1024).toFixed(2)} TB)\n`;
    message += ` • Rata-rata/VM: ${t.vmCount > 0 ? (totalMemGrand / t.vmCount).toFixed(1) : 0} GB\n\n`;
    message += `<b>Disk:</b>\n`;
    message += ` • Total Provisioned: <b>${t.disk.toFixed(2)} TB</b>\n`;

    message += `\n------------------------------------\n`;
    message += `<b>🏆 Top 5 Pengguna Resource Tertinggi</b>\n`;
    const topCpuText = reportData.Top5.cpu.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value} vCPU)`).join('\n');
    const topMemText = reportData.Top5.memory.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toFixed(0)} GB / ${(vm.value/1024).toFixed(2)} TB)`).join('\n');
    const topDiskText = reportData.Top5.disk.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toFixed(2)} TB)`).join('\n');
    message += `\n<i>vCPU Terbesar:</i>\n${topCpuText}\n`;
    message += `\n<i>Memory Terbesar:</i>\n${topMemText}\n`;
    message += `\n<i>Disk Terbesar:</i>\n${topDiskText}\n`;
    
    kirimPesanTelegram(message, config, 'HTML');

  } catch (e) {
    console.error(`Gagal membuat laporan provisioning: ${e.message}\nStack: ${e.stack}`);
    kirimPesanTelegram(`<b>⚠️ Gagal membuat laporan provisioning!</b>\n\n<code>${escapeHtml(e.message)}</code>`, config);
  }
}

function updateTop5(topArray, newItem) {
  if(!newItem || isNaN(newItem.value) || newItem.value <= 0) return;
  
  if (topArray.length < 5) {
    topArray.push(newItem);
  } else if (newItem.value > topArray[4].value) {
    topArray.pop();
    topArray.push(newItem);
  }
  topArray.sort((a, b) => b.value - a.value);
}