// ===== FILE: Laporan.gs =====

function getProvisioningStatusSummary(config) {
  try {
    const sheetName = config['NAMA_SHEET_DATASTORE'];
    if (!sheetName) {
      return "<i>Status provisioning tidak dapat diperiksa: NAMA_SHEET_DATASTORE belum diatur.</i>";
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dsSheet = ss.getSheetByName(sheetName);
    if (!dsSheet || dsSheet.getLastRow() <= 1) {
      return "<i>Status provisioning tidak dapat diperiksa: Data datastore tidak ditemukan.</i>";
    }

    const headers = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];
    const nameIndex = headers.indexOf(config['HEADER_DATASTORE_NAME']);
    const capGbIndex = headers.indexOf('Capacity (GB)');
    const provGbIndex = headers.indexOf(config['HEADER_DATASTORE_PROVISIONED_GB']);

    if ([nameIndex, capGbIndex, provGbIndex].includes(-1)) {
      return `<i>Status provisioning tidak dapat diperiksa: Kolom penting tidak ditemukan.</i>`;
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
      return `❗️ Status Provisioning: Terdeteksi datastore over-provisioned. Gunakan /migrasicheck untuk detail.`;
    }

    return "✅ Status Provisioning: Semua datastore dalam rasio aman (1:1).";

  } catch (e) {
    console.error(`Gagal memeriksa status provisioning: ${e.message}`);
    return `<i>Gagal memeriksa status provisioning: ${e.message}</i>`;
  }
}

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
    return { vCenterMessage: `<i>Gagal membuat ringkasan: Kolom '${KONSTANTA.HEADER_VM.VCENTER}' atau '${KONSTANTA.HEADER_VM.STATE}' tidak ditemukan.</i>\n\n`, uptimeMessage: "" };
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
      message += `🏢 vCenter: ${vc}\n`;
      message += `🟢 Power On: ${vCenterSummary[vc].on}\n`;
      message += `🔴 Power Off: ${vCenterSummary[vc].off}\n`;
      message += `Total VM: ${vCenterSummary[vc].total}\n\n`;
    }
  });
  message += `--- GRAND TOTAL ---\n`;
  message += `🟢 Power On: ${totalGlobal.on}\n`;
  message += `🔴 Power Off: ${totalGlobal.off}\n`;
  message += `Total VM: ${totalGlobal.total}\n\n`;

  let uptimeMessage = `📊 Ringkasan Uptime (dari total ${totalGlobal.total} VM)\n`;
  uptimeMessage += `- Di bawah 1 Tahun: ${uptimeCategories['0_1']} VM\n`;
  uptimeMessage += `- 1 sampai 2 Tahun: ${uptimeCategories['1_2']} VM\n`;
  uptimeMessage += `- 2 sampai 3 Tahun: ${uptimeCategories['2_3']} VM\n`;
  uptimeMessage += `- Di atas 3 Tahun: ${uptimeCategories['over_3']} VM\n`;
  uptimeMessage += `- Data Tidak Valid/Kosong: ${uptimeCategories['invalid']} VM`;

  return { vCenterMessage: message, uptimeMessage: uptimeMessage };
}

/**
 * [VERSI FINAL & KONSISTEN] Membuat laporan harian VM.
 * Fungsi ini sekarang sepenuhnya menerapkan konstanta terpusat.
 * @param {object} config - Objek konfigurasi yang sudah dibaca.
 * @returns {string} String laporan lengkap yang siap dikirim.
 */
function buatLaporanHarianVM(config) {
  let pesanLaporan = `🚨 <b>Laporan Harian VM & Datastore</b>\n`;
  pesanLaporan += `--------------------------------------------------\n\n`;
  
  try {
    const sheetName = config['NAMA_SHEET_DATA_UTAMA'];
    if (!sheetName) throw new Error("Nama sheet data utama (NAMA_SHEET_DATA_UTAMA) tidak diatur di Konfigurasi.");
    
    const columnsToTrackConfig = config['KOLOM_YANG_DIPANTAU'];
    if (!columnsToTrackConfig || !Array.isArray(columnsToTrackConfig)) {
      throw new Error("KOLOM_YANG_DIPANTAU tidak diatur dengan benar di Konfigurasi.");
    }
    
    const columnsToTrack = columnsToTrackConfig.map(headerName => ({ nama: headerName }));
    
    // [PERBAIKAN] Menggunakan konstanta terpusat untuk nama file dan header.
    const archiveFileName = KONSTANTA.NAMA_FILE.ARSIP_VM;
    const primaryKeyHeader = KONSTANTA.HEADER_VM.PK;

    const logEntriesToAdd = processDataChanges(config, sheetName, archiveFileName, primaryKeyHeader, columnsToTrack, KONSTANTA.NAMA_ENTITAS.VM);
    
    if (logEntriesToAdd.length > 0) {
      pesanLaporan += `Ringkasan Perubahan Hari Ini:\n`;
      const counts = { baru: 0, dimodifikasi: 0, dihapus: 0 };
       logEntriesToAdd.forEach(log => {
        const action = log[1];
        if (action.includes('PENAMBAHAN')) counts.baru++;
        else if (action.includes('MODIFIKASI')) counts.dimodifikasi++;
        else if (action.includes('PENGHAPUSAN')) counts.dihapus++;
      });

      if (counts.baru > counts.dihapus) { pesanLaporan += `📈 Pertumbuhan infrastruktur terdeteksi.\n`; } 
      else if (counts.dihapus > counts.baru) { pesanLaporan += `📉 Perampingan infrastruktur terdeteksi.\n`; } 
      else { pesanLaporan += `⚙️ Aktivitas infrastruktur cenderung stabil.\n`; }
    } else {
      pesanLaporan += "✅ Tidak ada perubahan data VM terdeteksi hari ini.";
    }
    pesanLaporan += `\n\n--------------------------------------------------\n\n`;

    const summary = generateVcenterSummary(config);
    pesanLaporan += summary.vCenterMessage;
    pesanLaporan += summary.uptimeMessage;
    
    const provisioningSummary = getProvisioningStatusSummary(config);
    pesanLaporan += `\n\n--------------------------------------------------\n${provisioningSummary}\n--------------------------------------------------\n\n`;
    
    if (logEntriesToAdd.length > 0) {
       const counts = { baru: 0, dimodifikasi: 0, dihapus: 0 };
       logEntriesToAdd.forEach(log => {
        const action = log[1];
        if (action.includes('PENAMBAHAN')) counts.baru++;
        else if (action.includes('MODIFIKASI')) counts.dimodifikasi++;
        else if (action.includes('PENGHAPUSAN')) counts.dihapus++;
      });
      pesanLaporan += `✅ Baru: ${counts.baru} | ✏️ Dimodifikasi: ${counts.dimodifikasi} | ❌ Dihapus: ${counts.dihapus}\n\n`;
    }
    pesanLaporan += `Gunakan /export untuk detail perubahan.`;

    return pesanLaporan;
    
  } catch (e) {
    throw new Error(`Gagal membuat Laporan Harian VM. Penyebab: ${e.message}`);
  }
}

/**
 * [REVISI KECERDASAN] Menghasilkan laporan mingguan/bulanan dengan tambahan
 * analisis tren dan deteksi anomali.
 * @param {string} periode - 'mingguan' atau 'bulanan'.
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
    title = `Laporan Mingguan VM & Datastore (${tglMulai} - ${tglSelesai})`;
  } else if (periode === 'bulanan') {
    startDate.setMonth(today.getMonth() - 1);
    title = `Laporan Bulanan VM & Datastore (Bulan ${today.toLocaleString('id-ID', { month: 'long', year: 'numeric' })})`;
  } else {
    return;
  }

  // --- Langkah 1: Lakukan Analisis Tren dan Kumpulkan semua data ---
  const analisis = analisisTrenPerubahan(startDate, config);
  const { vCenterMessage, uptimeMessage } = generateVcenterSummary(config);
  const provisioningSummary = getProvisioningStatusSummary(config);
  
  // --- Langkah 2: Bangun pesan laporan dengan struktur baru ---
  let pesanLaporan = `<b>${title}</b>\n`;
  pesanLaporan += `--------------------------------------------------\n\n`;

  // Bagian 1: [BARU] Tampilkan hasil analisis tren
  pesanLaporan += `<b>Ringkasan Tren Periode Ini:</b>\n`;
  pesanLaporan += `${analisis.trendMessage}\n`;
  // Tampilkan pesan anomali hanya jika ada
  if (analisis.anomalyMessage) {
    pesanLaporan += `\n${analisis.anomalyMessage}\n`;
  }
  pesanLaporan += `\n--------------------------------------------------\n\n`;

  // Bagian 2: Ringkasan vCenter dan Uptime (tidak berubah)
  pesanLaporan += vCenterMessage;
  pesanLaporan += uptimeMessage;
  pesanLaporan += `\n\n--------------------------------------------------\n`;
  
  // Bagian 3: Status Provisioning (tidak berubah)
  pesanLaporan += `${provisioningSummary}\n`;
  pesanLaporan += `--------------------------------------------------\n\n`;

  // Bagian 4: Detail Angka Perubahan (sekarang menggunakan data dari analisis)
  pesanLaporan += `✅ Baru: ${analisis.counts.baru} entri\n`;
  pesanLaporan += `✏️ Dimodifikasi: ${analisis.counts.dimodifikasi} entri\n`;
  pesanLaporan += `❌ Dihapus: ${analisis.counts.dihapus} entri\n\n`;
  
  pesanLaporan += `Gunakan perintah /export untuk melihat detail perubahan.`;

  // --- Langkah 3: Kirim Pesan ---
  kirimPesanTelegram(pesanLaporan, config, 'HTML');
}

/**
 * [PERBAIKAN FINAL] Menyusun laporan provisioning secara mandiri.
 * Fungsi ini tidak lagi bergantung pada objek KONSTANTA global untuk mencegah error.
 * @param {object} config - Objek konfigurasi.
 * @returns {string} String laporan lengkap yang siap dikirim.
 */
function generateProvisioningReport(config) {
  try {
    const sheetName = config['NAMA_SHEET_DATA_UTAMA'];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) throw new Error(`Sheet "${sheetName}" tidak ditemukan atau kosong.`);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    
    // [PERBAIKAN] Mendefinisikan nama header secara lokal di dalam fungsi
    const requiredHeaderNames = {
      PK: 'Primary Key',
      VM_NAME: 'Virtual Machine',
      VCENTER: 'vCenter',
      STATE: 'State',
      CPU: 'CPU',
      MEMORY: 'Memory',
      PROV_TB: 'Provisioned Space (TB)'
    };

    const indices = {};
    for (const key in requiredHeaderNames) {
      const headerName = requiredHeaderNames[key];
      indices[key] = headers.indexOf(headerName);
      if (indices[key] === -1) throw new Error(`Header penting '${headerName}' tidak ditemukan di sheet "${sheetName}".`);
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

      const vmInfo = { name: row[indices.VM_NAME], pk: row[indices.PK] };
      updateTop5(reportData.Top5.cpu, { ...vmInfo, value: cpu });
      updateTop5(reportData.Top5.memory, { ...vmInfo, value: memory });
      updateTop5(reportData.Top5.disk, { ...vmInfo, value: disk });
    }

    let message = `<b>📊 Laporan Provisioning Sumber Daya</b>\n`;
    message += `<i>Berdasarkan data per ${new Date().toLocaleString('id-ID')}</i>`;

    Object.keys(reportData).filter(key => key !== 'Top5' && key !== 'Total').sort().forEach(vc => {
      message += `\n\n------------------------------------\n`;
      message += `<b>🏢 vCenter: ${vc}</b>\n\n`;
      const totalCpu = reportData[vc].cpuOn + reportData[vc].cpuOff;
      const totalMem = reportData[vc].memOn + reportData[vc].memOff;
      message += `<b>vCPU:</b>\n`;
      message += ` • Total Provisioned: <b>${totalCpu} vCPU</b>\n`;
      message += ` • Teralokasi (On): ${reportData[vc].cpuOn} vCPU\n`;
      message += ` • Teralokasi (Off): ${reportData[vc].cpuOff} vCPU\n`;
      message += ` • Rata-rata/VM: ${(reportData[vc].vmCount > 0 ? (totalCpu / reportData[vc].vmCount) : 0).toFixed(1)} vCPU\n\n`;
      message += `<b>Memory:</b>\n`;
      message += ` • Total Provisioned: <b>${totalMem.toFixed(0)} GB</b> (${(totalMem / 1024).toFixed(2)} TB)\n`;
      message += ` • Teralokasi (On): ${reportData[vc].memOn.toFixed(0)} GB (${(reportData[vc].memOn / 1024).toFixed(2)} TB)\n`;
      message += ` • Teralokasi (Off): ${reportData[vc].memOff.toFixed(0)} GB (${(reportData[vc].memOff / 1024).toFixed(2)} TB)\n`;
      message += ` • Rata-rata/VM: ${(reportData[vc].vmCount > 0 ? (totalMem / reportData[vc].vmCount) : 0).toFixed(1)} GB\n\n`;
      message += `<b>Disk:</b>\n`;
      message += ` • Total Provisioned: <b>${reportData[vc].disk.toFixed(2)} TB</b>\n`;
    });
    
    message += `\n\n------------------------------------\n`;
    message += `<b>🌍 GRAND TOTAL</b>\n\n`;
    const totalCpuGrand = reportData['Total'].cpuOn + reportData['Total'].cpuOff;
    const totalMemGrand = reportData['Total'].memOn + reportData['Total'].memOff;
    message += `<b>vCPU:</b>\n`;
    message += ` • Total Provisioned: <b>${totalCpuGrand} vCPU</b>\n`;
    message += ` • Teralokasi (On): ${reportData['Total'].cpuOn} vCPU\n`;
    message += ` • Teralokasi (Off): ${reportData['Total'].cpuOff} vCPU\n`;
    message += ` • Rata-rata/VM: ${(reportData['Total'].vmCount > 0 ? (totalCpuGrand / reportData['Total'].vmCount) : 0).toFixed(1)} vCPU\n\n`;
    message += `<b>Memory:</b>\n`;
    message += ` • Total Provisioned: <b>${totalMemGrand.toFixed(0)} GB</b> (${(totalMemGrand / 1024).toFixed(2)} TB)\n`;
    message += ` • Teralokasi (On): ${reportData['Total'].memOn.toFixed(0)} GB (${(reportData['Total'].memOn / 1024).toFixed(2)} TB)\n`;
    message += ` • Teralokasi (Off): ${reportData['Total'].memOff.toFixed(0)} GB (${(reportData['Total'].memOff / 1024).toFixed(2)} TB)\n`;
    message += ` • Rata-rata/VM: ${(reportData['Total'].vmCount > 0 ? (totalMemGrand / reportData['Total'].vmCount) : 0).toFixed(1)} GB\n\n`;
    message += `<b>Disk:</b>\n`;
    message += ` • Total Provisioned: <b>${reportData['Total'].disk.toFixed(2)} TB</b>\n`;

    message += `\n------------------------------------\n`;
    message += `<b>🏆 Top 5 Pengguna Resource Tertinggi</b>\n`;
    const topCpuText = reportData.Top5.cpu.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value} vCPU)`).join('\n');
    const topMemText = reportData.Top5.memory.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toFixed(0)} GB / ${(vm.value/1024).toFixed(2)} TB)`).join('\n');
    const topDiskText = reportData.Top5.disk.map((vm, i) => `${i+1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toFixed(2)} TB)`).join('\n');
    message += `\n<i>vCPU Terbesar:</i>\n${topCpuText}\n`;
    message += `\n<i>Memory Terbesar:</i>\n${topMemText}\n`;
    message += `\n<i>Disk Terbesar:</i>\n${topDiskText}\n`;
    
    return message;

  } catch (e) {
    throw new Error(`Gagal membuat laporan provisioning: ${e.message}`);
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

/**
 * [FUNGSI KECERDASAN BARU] Menganalisis log perubahan dalam rentang waktu tertentu
 * untuk mendeteksi tren (pertumbuhan/perampingan) dan anomali (aktivitas tinggi).
 *
 * @param {Date} startDate - Tanggal mulai untuk analisis log.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object} Objek berisi { trendMessage: string, anomalyMessage: string, counts: object }.
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
  // Toleransi 5 agar tidak terlalu sensitif terhadap perubahan kecil
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
