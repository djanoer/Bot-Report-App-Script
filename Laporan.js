// ===== FILE: Laporan.js =====

/**
 * [FINAL & STABIL] Mengambil status provisioning dengan menggunakan konstanta dan penanganan error yang lebih baik.
 */
function getProvisioningStatusSummary(config) {
  try {
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_DS];
    if (!sheetName) {
      return "<i>Status provisioning tidak dapat diperiksa: NAMA_SHEET_DATASTORE belum diatur.</i>";
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dsSheet = ss.getSheetByName(sheetName);
    if (!dsSheet || dsSheet.getLastRow() <= 1) {
      return "<i>Status provisioning tidak dapat diperiksa: Data datastore tidak ditemukan.</i>";
    }

    const headers = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
    const nameIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
    const capGbIndex = headers.indexOf(KONSTANTA.HEADER_DS.CAPACITY_GB);
    const provGbIndex = headers.indexOf(config[KONSTANTA.KUNCI_KONFIG.DS_PROV_GB_HEADER]);

    if ([nameIndex, capGbIndex, provGbIndex].includes(-1)) {
      const missing = [];
      if(nameIndex === -1) missing.push(config[KONSTANTA.KUNCI_KONFIG.DS_NAME_HEADER]);
      if(capGbIndex === -1) missing.push(KONSTANTA.HEADER_DS.CAPACITY_GB);
      if(provGbIndex === -1) missing.push(config[KONSTANTA.KUNCI_KONFIG.DS_PROV_GB_HEADER]);
      throw new Error(`Header tidak ditemukan di sheet Datastore: ${missing.join(', ')}`);
    }

    const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
    let isOverProvisioned = false;
    
    for (const row of dsData) {
      const capacity = parseFloat(String(row[capGbIndex]).replace(/,/g, '')) || 0;
      const provisioned = parseFloat(String(row[provGbIndex]).replace(/,/g, '')) || 0;
      
      if (provisioned > capacity) {
        isOverProvisioned = true;
        break;
      }
    }

    if (isOverProvisioned) {
      return `❗️ Terdeteksi datastore over-provisioned. Gunakan /migrasicheck untuk detail.`;
    }

    return "✅ Semua datastore dalam rasio aman (1:1).";

  } catch (e) {
    console.error(`Gagal memeriksa status provisioning: ${e.message}`);
    throw new Error(`Gagal memeriksa status provisioning: ${e.message}`);
  }
}

/**
 * [FINAL & STABIL] Fungsi pembantu untuk membuat ringkasan vCenter.
 */
function generateVcenterSummary(config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    return { vCenterMessage: "<i>Data VM tidak ditemukan untuk membuat ringkasan.</i>\n\n", uptimeMessage: "" };
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  const vCenterIndex = headers.indexOf(KONSTANTA.HEADER_VM.VCENTER);
  const stateIndex = headers.indexOf(KONSTANTA.HEADER_VM.STATE);
  const uptimeIndex = headers.indexOf(KONSTANTA.HEADER_VM.UPTIME);
  if (vCenterIndex === -1 || stateIndex === -1) {
      throw new Error(`Header '${KONSTANTA.HEADER_VM.VCENTER}' atau '${KONSTANTA.HEADER_VM.STATE}' tidak ditemukan.`);
  }

  const vCenterSummary = {};
  let totalGlobal = { on: 0, off: 0, total: 0 };
  const uptimeCategories = { '0_1': 0, '1_2': 0, '2_3': 0, 'over_3': 0, 'invalid': 0 };

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
      message += `🏢 <b>vCenter: ${vc}</b>\n`;
      message += `🟢 Power On: ${vCenterSummary[vc].on}\n`;
      message += `🔴 Power Off: ${vCenterSummary[vc].off}\n`;
      message += `Total: ${vCenterSummary[vc].total} VM\n\n`;
    }
  });
  message += `--- GRAND TOTAL ---\n`;
  message += `🟢 Power On: ${totalGlobal.on}\n`;
  message += `🔴 Power Off: ${totalGlobal.off}\n`;
  message += `Total: ${totalGlobal.total} VM\n\n`;

  let uptimeMessage = `📊 <b>Ringkasan Uptime</b> (dari total ${totalGlobal.total} VM)\n`;
  uptimeMessage += `- Di bawah 1 Tahun: ${uptimeCategories['0_1']} VM\n`;
  uptimeMessage += `- 1 sampai 2 Tahun: ${uptimeCategories['1_2']} VM\n`;
  uptimeMessage += `- 2 sampai 3 Tahun: ${uptimeCategories['2_3']} VM\n`;
  uptimeMessage += `- Di atas 3 Tahun: ${uptimeCategories['over_3']} VM\n`;
  uptimeMessage += `- Data Tidak Valid/Kosong: ${uptimeCategories['invalid']} VM`;

  return { vCenterMessage: message, uptimeMessage: uptimeMessage };
}

/**
 * [LOGIKA FINAL & BENAR] Membuat laporan harian yang kini secara akurat
 * membaca log perubahan hari ini langsung dari sheet "Log Perubahan".
 */
function buatLaporanHarianVM(config) {
  let pesanLaporan = `📊 <b>Laporan Harian VM & Datastore</b>\n`;
  pesanLaporan += `🗓️ <i>${new Date().toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</i>\n`;
  
  try {
    // --- Bagian 1: Analisis Log Perubahan Hari Ini ---
    pesanLaporan += "\n<b>Perubahan Hari Ini:</b>\n";
    
    // [PERBAIKAN UTAMA] Ambil log langsung dari sheet "Log Perubahan" untuk hari ini.
    const todayStartDate = new Date();
    todayStartDate.setHours(0, 0, 0, 0);
    const { headers, data: todaysLogs } = getCombinedLogs(todayStartDate, config);

    if (todaysLogs.length > 0) {
      const counts = { baru: 0, dimodifikasi: 0, dihapus: 0 };
      const actionIndex = headers.indexOf(KONSTANTA.HEADER_LOG.ACTION);
      
      todaysLogs.forEach(log => {
        const action = log[actionIndex];
        if (action.includes('PENAMBAHAN')) counts.baru++;
        else if (action.includes('MODIFIKASI')) counts.dimodifikasi++;
        else if (action.includes('PENGHAPUSAN')) counts.dihapus++;
      });
      pesanLaporan += `➕ Baru: ${counts.baru} | ✏️ Dimodifikasi: ${counts.dimodifikasi} | ❌ Dihapus: ${counts.dihapus}\n`;
    } else {
      pesanLaporan += "✅ Tidak ada perubahan data VM terdeteksi hari ini.\n";
    }
    
    // --- Bagian 2: Ringkasan Infrastruktur ---
    pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;

    // Bagian ini tidak perlu diubah karena sudah benar.
    const summary = generateVcenterSummary(config);
    pesanLaporan += "<b>Ringkasan vCenter:</b>\n" + summary.vCenterMessage;
    pesanLaporan += "\n<b>Analisis Uptime:</b>\n" + summary.uptimeMessage;
    
    const provisioningSummary = getProvisioningStatusSummary(config);
    pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR + "<b>Status Provisioning:</b>\n" + provisioningSummary;
    
    pesanLaporan += `\n\nGunakan /cekhistory untuk detail perubahan lengkap.`;

    return pesanLaporan;
    
  } catch (e) {
    throw new Error(`Gagal membuat Laporan Harian VM. Penyebab: ${e.message}`);
  }
}

/**
 * [FINAL & STABIL] Menghasilkan laporan periodik dengan format teks dan penanganan error yang andal.
 */
function buatLaporanPeriodik(periode) {
  const config = bacaKonfigurasi();
  const today = new Date();
  let startDate = new Date();
  let title;

  if (periode === 'mingguan') {
    startDate.setDate(today.getDate() - 7);
    const tglMulai = startDate.toLocaleDateString('id-ID', {day: '2-digit', month: 'long'});
    const tglSelesai = today.toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});
    title = `📈 <b>Laporan Tren Mingguan</b>\n<i>Periode: ${tglMulai} - ${tglSelesai}</i>`;
  
  } else if (periode === 'bulanan') {
    startDate.setMonth(today.getMonth() - 1);
    
    // [PERBAIKAN] Menggunakan rentang tanggal yang jelas untuk konsistensi.
    const tglMulai = startDate.toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});
    const tglSelesai = today.toLocaleDateString('id-ID', {day: '2-digit', month: 'long', year: 'numeric'});
    
    title = `📈 <b>Laporan Tren Bulanan</b>\n<i>Periode: ${tglMulai} - ${tglSelesai}</i>`;
  
  } else {
    return;
  }

  const analisis = analisisTrenPerubahan(startDate, config);
  const { vCenterMessage, uptimeMessage } = generateVcenterSummary(config);
  const provisioningSummary = getProvisioningStatusSummary(config);
  
  let pesanLaporan = `${title}\n`;
  pesanLaporan += `\n<b>Kesimpulan Tren:</b>\n${analisis.trendMessage}\n`;
  if (analisis.anomalyMessage) {
    pesanLaporan += `\n${analisis.anomalyMessage}\n`;
  }
  pesanLaporan += `\n<i>Total Perubahan: ➕${analisis.counts.baru} ✏️${analisis.counts.dimodifikasi} ❌${analisis.counts.dihapus}</i>`;
  
  pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;
  pesanLaporan += "<b>Ringkasan vCenter & Uptime:</b>\n" + vCenterMessage + "\n" + uptimeMessage;
  pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;
  pesanLaporan += "<b>Status Provisioning:</b>\n" + provisioningSummary;
  pesanLaporan += `\n\nGunakan /export untuk melihat detail perubahan.`;

  kirimPesanTelegram(pesanLaporan, config, 'HTML');
}

/**
 * [FINAL & STABIL] Menyusun laporan provisioning dengan menggunakan konstanta terpusat untuk semua header.
 */
function generateProvisioningReport(config) {
  try {
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) throw new Error(`Sheet "${sheetName}" tidak ditemukan atau kosong.`);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    const requiredHeaders = {
        PK: KONSTANTA.HEADER_VM.PK,
        VM_NAME: KONSTANTA.HEADER_VM.VM_NAME,
        VCENTER: KONSTANTA.HEADER_VM.VCENTER,
        STATE: KONSTANTA.HEADER_VM.STATE,
        CPU: KONSTANTA.HEADER_VM.CPU,
        MEMORY: KONSTANTA.HEADER_VM.MEMORY,
        PROV_TB: KONSTANTA.HEADER_VM.PROV_TB
    };
    
    const indices = {};
    for (const key in requiredHeaders) {
      indices[key] = headers.indexOf(requiredHeaders[key]);
      if (indices[key] === -1) throw new Error(`Header penting '${requiredHeaders[key]}' tidak ditemukan di sheet "${sheetName}".`);
    }

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const reportData = { Top5: { cpu: [], memory: [], disk: [] } };
    const vCenters = new Set(allData.map(row => row[indices.VCENTER] || 'Lainnya'));

    ['Total', ...vCenters].forEach(vc => {
      reportData[vc] = { vmCount: 0, cpuOn: 0, cpuOff: 0, memOn: 0, memOff: 0, disk: 0 };
    });

    for (const row of allData) {
      const vCenter = row[indices.VCENTER] || 'Lainnya';
      const isPoweredOn = String(row[indices.STATE] || '').toLowerCase().includes('on');
      const cpu = parseInt(row[indices.CPU], 10) || 0;
      const memory = parseFloat(row[indices.MEMORY]) || 0;
      const disk = parseFloat(row[indices.PROV_TB]) || 0;
      reportData[vCenter].vmCount++;
      reportData['Total'].vmCount++;
      reportData[vCenter].disk += disk;
      reportData['Total'].disk += disk;
      if(isPoweredOn) {
        reportData[vCenter].cpuOn += cpu; reportData[vCenter].memOn += memory;
        reportData['Total'].cpuOn += cpu; reportData['Total'].memOn += memory;
      } else {
        reportData[vCenter].cpuOff += cpu; reportData[vCenter].memOff += memory;
        reportData['Total'].cpuOff += cpu; reportData['Total'].memOff += memory;
      }
      const vmInfo = { name: row[indices.VM_NAME], pk: row[indices.PK] };
      updateTop5(reportData.Top5.cpu, { ...vmInfo, value: cpu });
      updateTop5(reportData.Top5.memory, { ...vmInfo, value: memory });
      updateTop5(reportData.Top5.disk, { ...vmInfo, value: disk });
    }

    let message = `⚙️ <b>Laporan Provisioning Sumber Daya</b>\n`;
    message += `<i>Berdasarkan data per ${new Date().toLocaleString('id-ID')}</i>`;

    Object.keys(reportData).filter(key => key !== 'Top5' && key !== 'Total').sort().forEach(vc => {
      message += KONSTANTA.UI_STRINGS.SEPARATOR;
      message += `🏢 <b>vCenter: ${vc}</b>\n\n`;
      const totalCpu = reportData[vc].cpuOn + reportData[vc].cpuOff;
      const totalMem = reportData[vc].memOn + reportData[vc].memOff;
      message += `💻 <b>vCPU:</b>\n`;
      message += ` • Total: <b>${totalCpu.toLocaleString('id')} vCPU</b> (On: ${reportData[vc].cpuOn}, Off: ${reportData[vc].cpuOff})\n`;
      message += ` • Rata-rata/VM: <b>${(reportData[vc].vmCount > 0 ? (totalCpu / reportData[vc].vmCount) : 0).toFixed(1)} vCPU</b>\n\n`;
      message += `🧠 <b>Memori:</b>\n`;
      message += ` • Total: <b>${totalMem.toLocaleString('id')} GB</b> <i>(~${(totalMem / 1024).toFixed(1)} TB)</i>\n`;
      message += ` • Rata-rata/VM: <b>${(reportData[vc].vmCount > 0 ? (totalMem / reportData[vc].vmCount) : 0).toFixed(1)} GB</b>\n\n`;
      message += `💽 <b>Disk:</b>\n`;
      message += ` • Total Provisioned: <b>${reportData[vc].disk.toFixed(2)} TB</b>\n`;
    });
    
    message += KONSTANTA.UI_STRINGS.SEPARATOR;
    message += `🌍 <b>GRAND TOTAL</b>\n\n`;
    const totalCpuGrand = reportData['Total'].cpuOn + reportData['Total'].cpuOff;
    const totalMemGrand = reportData['Total'].memOn + reportData['Total'].memOff;
    message += `💻 <b>vCPU:</b>\n`;
    message += ` • Total: <b>${totalCpuGrand.toLocaleString('id')} vCPU</b> (On: ${reportData['Total'].cpuOn}, Off: ${reportData['Total'].cpuOff})\n`;
    message += ` • Rata-rata/VM: <b>${(reportData['Total'].vmCount > 0 ? (totalCpuGrand / reportData['Total'].vmCount) : 0).toFixed(1)} vCPU</b>\n\n`;
    message += `🧠 <b>Memori:</b>\n`;
    message += ` • Total: <b>${totalMemGrand.toLocaleString('id')} GB</b> <i>(~${(totalMemGrand / 1024).toFixed(1)} TB)</i>\n`;
    message += ` • Rata-rata/VM: <b>${(reportData['Total'].vmCount > 0 ? (totalMemGrand / reportData['Total'].vmCount) : 0).toFixed(1)} GB</b>\n\n`;
    message += `💽 <b>Disk:</b>\n`;
    message += ` • Total Provisioned: <b>${reportData['Total'].disk.toFixed(2)} TB</b>\n`;

    message += KONSTANTA.UI_STRINGS.SEPARATOR;
    message += `🏆 <b>Top 5 Pengguna Resource Tertinggi</b>\n`;
    const topCpuText = reportData.Top5.cpu.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value} vCPU)`).join('\n');
    const topMemText = reportData.Top5.memory.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toLocaleString('id')} GB)`).join('\n');
    const topDiskText = reportData.Top5.disk.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toFixed(2)} TB)`).join('\n');
    message += `\n<i>vCPU Terbesar:</i>\n${topCpuText}\n`;
    message += `\n<i>Memori Terbesar:</i>\n${topMemText}\n`;
    message += `\n<i>Disk Terbesar:</i>\n${topDiskText}\n`;
    
    return message;

  } catch (e) {
    throw new Error(`Gagal membuat laporan provisioning: ${e.message}`);
  }
}


/**
 * [FINAL & STABIL] Fungsi pembantu untuk mengelola daftar top 5.
 */
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

/**
 * [FINAL & STABIL] Menganalisis log perubahan untuk mendeteksi tren dan anomali.
 */
function analisisTrenPerubahan(startDate, config) {
  const combinedLogResult = getCombinedLogs(startDate, config);
  const logData = combinedLogResult.data;
  const logHeaders = combinedLogResult.headers;

  const counts = { baru: 0, dimodifikasi: 0, dihapus: 0 };
  const actionIndex = logHeaders.indexOf(KONSTANTA.HEADER_LOG.ACTION);

  if (actionIndex !== -1) {
    logData.forEach(row => {
        const action = String(row[actionIndex] || '');
        if (action.includes('PENAMBAHAN')) counts.baru++;
        else if (action.includes('MODIFIKASI')) counts.dimodifikasi++;
        else if (action.includes('PENGHAPUSAN')) counts.dihapus++;
    });
  }

  let trendMessage = "⚙️ Aktivitas infrastruktur pada periode ini cenderung stabil.";
  if (counts.baru > (counts.dihapus + 5)) {
    trendMessage = "📈 Tren periode ini menunjukkan adanya pertumbuhan infrastruktur.";
  } else if (counts.dihapus > (counts.baru + 5)) {
    trendMessage = "📉 Tren periode ini menunjukkan adanya perampingan infrastruktur.";
  }

  let anomalyMessage = "";
  const totalChanges = counts.baru + counts.dimodifikasi + counts.dihapus;
  if (totalChanges > KONSTANTA.LIMIT.HIGH_ACTIVITY_THRESHOLD) {
    anomalyMessage = `⚠️ Terdeteksi aktivitas sangat tinggi (${totalChanges} perubahan) pada periode ini. Disarankan untuk melakukan review pada log.`;
  }

  return {
    trendMessage: trendMessage,
    anomalyMessage: anomalyMessage,
    counts: counts
  };
}

// ===== FILE: Laporan.js =====

/**
 * [FITUR BARU] Menghasilkan laporan distribusi aset VM berdasarkan kritikalitas dan environment
 * dengan kategori yang dibaca dari sheet konfigurasi.
 * @param {object} config - Objek konfigurasi bot yang sudah diproses.
 * @returns {string} String pesan laporan yang sudah diformat untuk Telegram.
 */
function generateAssetDistributionReport(config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet data VM "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  const critIndex = headers.indexOf(KONSTANTA.HEADER_VM.KRITIKALITAS);
  const envIndex = headers.indexOf(KONSTANTA.HEADER_VM.ENVIRONMENT);
  const stateIndex = headers.indexOf(KONSTANTA.HEADER_VM.STATE);

  if ([critIndex, envIndex, stateIndex].includes(-1)) {
    throw new Error("Satu atau lebih header penting (Kritikalitas, Environment, State) tidak ditemukan di sheet VM.");
  }

  const report = {
    criticality: {},
    environment: {},
    totalVm: allData.length
  };
  
  const recognizedCriticality = config.LIST_KRITIKALITAS || [];
  const recognizedEnvironment = config.LIST_ENVIRONMENT || [];

  allData.forEach(row => {
    // 1. Agregasi berdasarkan Kritikalitas (dengan kategori "Other")
    let criticality = String(row[critIndex] || '').trim();
    if (!recognizedCriticality.includes(criticality) || criticality === '') {
      criticality = 'Other';
    }
    report.criticality[criticality] = (report.criticality[criticality] || 0) + 1;

    // 2. Agregasi berdasarkan Environment (dengan kategori "Other")
    let environment = String(row[envIndex] || '').trim();
    if (!recognizedEnvironment.includes(environment) || environment === '') {
      environment = 'Other';
    }
    if (!report.environment[environment]) {
      report.environment[environment] = { total: 0, on: 0, off: 0 };
    }
    report.environment[environment].total++;
    
    if (String(row[stateIndex] || '').toLowerCase().includes('on')) {
      report.environment[environment].on++;
    } else {
      report.environment[environment].off++;
    }
  });
  
  const timestamp = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Makassar' });
  let message = `📊 <b>Laporan Distribusi Aset VM</b>\n`;
  message += `<i>Analisis per ${timestamp} WITA</i>\n\n`;
  message += KONSTANTA.UI_STRINGS.SEPARATOR + "\n";
  
  message += `🔥 <b>Analisis Berdasarkan Kritikalitas</b>\n`;
  message += `<i>Total Keseluruhan: ${report.totalVm} VM</i>\n\n`;
  
  const criticalityOrder = [...recognizedCriticality, 'Other'];
  for (const crit of criticalityOrder) {
    if (report.criticality[crit]) {
        const count = report.criticality[crit];
        const percentage = ((count / report.totalVm) * 100).toFixed(1);
        message += `• <b>${escapeHtml(crit)}:</b> <code>${count}</code> VM (${percentage}%)\n`;
    }
  }

  message += "\n" + KONSTANTA.UI_STRINGS.SEPARATOR + "\n";

  message += `🌍 <b>Analisis Berdasarkan Environment</b>\n\n`;
  let grandTotal = { total: 0, on: 0, off: 0 };
  const envOrder = [...recognizedEnvironment, 'Other'];
  
  for (const env of envOrder) {
    if (report.environment[env]) {
        const data = report.environment[env];
        const icon = env.toLowerCase().includes('production') ? '🏢' : (env.toLowerCase().includes('dev') ? '🛠️' : '⚙️');
        message += `${icon} <b>${escapeHtml(env)}</b>\n`;
        message += ` • Total: <code>${data.total}</code> VM\n`;
        message += ` • Status: 🟢 <code>${data.on}</code> On | 🔴 <code>${data.off}</code> Off\n\n`;
        
        grandTotal.total += data.total;
        grandTotal.on += data.on;
        grandTotal.off += data.off;
    }
  }
  
  message += `--- <i>Grand Total</i> ---\n`;
  message += ` • Total: <code>${grandTotal.total}</code> VM\n`;
  message += ` • Status: 🟢 <code>${grandTotal.on}</code> On | 🔴 <code>${grandTotal.off}</code> Off\n`;

  return message;
}
