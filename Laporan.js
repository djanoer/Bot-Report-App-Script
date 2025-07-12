// ===== FILE: Laporan.js =====

/**
 * [REFACTORED v3.5.0] Mengambil status provisioning dengan membaca header dari Konfigurasi.
 */
function getProvisioningStatusSummary(config) {
  try {
    const K = KONSTANTA.KUNCI_KONFIG; // Standarisasi menggunakan 'K'
    const sheetName = config[K.SHEET_DS];
    if (!sheetName) {
      return "<i>Status provisioning tidak dapat diperiksa: NAMA_SHEET_DATASTORE belum diatur.</i>";
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dsSheet = ss.getSheetByName(sheetName);
    if (!dsSheet || dsSheet.getLastRow() <= 1) {
      return "<i>Status provisioning tidak dapat diperiksa: Data datastore tidak ditemukan.</i>";
    }

    const headers = dsSheet.getRange(1, 1, 1, dsSheet.getLastColumn()).getValues()[0];

    const nameIndex = headers.indexOf(config[K.DS_NAME_HEADER]);
    const capGbIndex = headers.indexOf(config[K.HEADER_DS_CAPACITY_GB]);
    const provGbIndex = headers.indexOf(config[K.HEADER_DS_PROV_DS_GB]);

    if ([nameIndex, capGbIndex, provGbIndex].includes(-1)) {
      const missing = [];
      if (nameIndex === -1) missing.push(config[K.DS_NAME_HEADER]);
      if (capGbIndex === -1) missing.push(config[K.HEADER_DS_CAPACITY_GB]);
      if (provGbIndex === -1) missing.push(config[K.HEADER_DS_PROV_DS_GB]);
      throw new Error(`Header tidak ditemukan di sheet Datastore: ${missing.join(", ")}`);
    }

    const dsData = dsSheet.getRange(2, 1, dsSheet.getLastRow() - 1, dsSheet.getLastColumn()).getValues();
    let isOverProvisioned = false;

    for (const row of dsData) {
      const capacity = parseFloat(String(row[capGbIndex]).replace(/,/g, "")) || 0;
      const provisioned = parseFloat(String(row[provGbIndex]).replace(/,/g, "")) || 0;

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
 * [REFACTORED v4.6.0] Membuat ringkasan vCenter.
 * Fungsi ini sekarang menggunakan helper _getSheetData untuk efisiensi.
 */
function generateVcenterSummary(config) {
  const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];

  const { headers, dataRows } = _getSheetData(sheetName);

  if (dataRows.length === 0) {
    return { vCenterMessage: "<i>Data VM tidak ditemukan untuk membuat ringkasan.</i>\n\n", uptimeMessage: "" };
  }

  const K = KONSTANTA.KUNCI_KONFIG;
  const vCenterIndex = headers.indexOf(config[K.HEADER_VM_VCENTER]);
  const stateIndex = headers.indexOf(config[K.HEADER_VM_STATE]);
  const uptimeIndex = headers.indexOf(config[K.HEADER_VM_UPTIME]);

  if (vCenterIndex === -1 || stateIndex === -1) {
    throw new Error(`Header '${config[K.HEADER_VM_VCENTER]}' atau '${config[K.HEADER_VM_STATE]}' tidak ditemukan.`);
  }

  const vCenterSummary = {};
  let totalGlobal = { on: 0, off: 0, total: 0 };
  const uptimeCategories = { "0_1": 0, "1_2": 0, "2_3": 0, over_3: 0, invalid: 0 };

  dataRows.forEach((row) => {
    const vCenter = row[vCenterIndex] || "Lainnya";
    if (!vCenterSummary[vCenter]) {
      vCenterSummary[vCenter] = { on: 0, off: 0, total: 0 };
    }
    const state = String(row[stateIndex] || "").toLowerCase();
    vCenterSummary[vCenter].total++;
    totalGlobal.total++;
    if (state.includes("on")) {
      vCenterSummary[vCenter].on++;
      totalGlobal.on++;
    } else {
      vCenterSummary[vCenter].off++;
      totalGlobal.off++;
    }
    if (uptimeIndex !== -1) {
      const uptimeValue = row[uptimeIndex];
      const uptimeDays = parseInt(uptimeValue, 10);
      if (uptimeValue !== "" && uptimeValue !== "-" && !isNaN(uptimeDays)) {
        if (uptimeDays <= 365) uptimeCategories["0_1"]++;
        else if (uptimeDays <= 730) uptimeCategories["1_2"]++;
        else if (uptimeDays <= 1095) uptimeCategories["2_3"]++;
        else uptimeCategories["over_3"]++;
      } else {
        uptimeCategories["invalid"]++;
      }
    }
  });

  let message = "";
  const vCenterOrder = Object.keys(vCenterSummary).sort();
  vCenterOrder.forEach((vc) => {
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
  uptimeMessage += `- Di bawah 1 Tahun: ${uptimeCategories["0_1"]} VM\n`;
  uptimeMessage += `- 1 sampai 2 Tahun: ${uptimeCategories["1_2"]} VM\n`;
  uptimeMessage += `- 2 sampai 3 Tahun: ${uptimeCategories["2_3"]} VM\n`;
  uptimeMessage += `- Di atas 3 Tahun: ${uptimeCategories["over_3"]} VM\n`;
  uptimeMessage += `- Data Tidak Valid/Kosong: ${uptimeCategories["invalid"]} VM`;

  return { vCenterMessage: message, uptimeMessage: uptimeMessage };
}

// Gantikan fungsi ini di Laporan.js
/**
 * [REFACTORED v3.5.0] Membuat laporan harian yang akurat dengan header dinamis.
 */
function buatLaporanHarianVM(config) {
  let pesanLaporan = `📊 <b>Status Operasional Infrastruktur</b>\n`;
  pesanLaporan += `🗓️ <i>${new Date().toLocaleString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}</i>\n`;

  try {
    const K = KONSTANTA.KUNCI_KONFIG;
    pesanLaporan += "\n<b>Aktivitas Sistem Hari Ini:</b>\n";

    const todayStartDate = new Date();
    todayStartDate.setHours(0, 0, 0, 0);
    const { headers, data: todaysLogs } = getCombinedLogs(todayStartDate, config);

    if (todaysLogs.length > 0) {
      const counts = { baru: 0, dimodifikasi: 0, dihapus: 0 };
      const actionHeader = config[K.HEADER_LOG_ACTION];
      const actionIndex = headers.indexOf(actionHeader);

      todaysLogs.forEach((log) => {
        const action = log[actionIndex];
        if (action.includes("PENAMBAHAN")) counts.baru++;
        else if (action.includes("MODIFIKASI")) counts.dimodifikasi++;
        else if (action.includes("PENGHAPUSAN")) counts.dihapus++;
      });
      pesanLaporan += `Teridentifikasi <b>${todaysLogs.length}</b> aktivitas perubahan data:\n`;
      pesanLaporan += `➕ Baru: ${counts.baru} | ✏️ Dimodifikasi: ${counts.dimodifikasi} | ❌ Dihapus: ${counts.dihapus}\n`;
    } else {
      pesanLaporan += "Tidak terdeteksi aktivitas perubahan data VM.\n";
    }

    pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;
    const summary = generateVcenterSummary(config);
    pesanLaporan += "<b>Ringkasan vCenter & Uptime:</b>\n" + summary.vCenterMessage;
    pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;
    const provisioningSummary = getProvisioningStatusSummary(config);
    pesanLaporan += "<b>Status Provisioning:</b>\n" + provisioningSummary;
    pesanLaporan += `\n\n<i>Rincian aktivitas dapat dilihat melalui perintah /cekhistory.</i>`;

    return pesanLaporan;
  } catch (e) {
    throw new Error(`Gagal membuat Laporan Harian VM. Penyebab: ${e.message}`);
  }
}

/**
 * [REFACTORED v4.3.0] Menghasilkan laporan periodik.
 * Fungsi ini sekarang menerima objek config, bukan membacanya sendiri.
 */
function buatLaporanPeriodik(periode) {
  // Menggunakan getBotState untuk efisiensi
  const { config } = getBotState();

  const today = new Date();
  let startDate = new Date();
  let title;

  if (periode === "mingguan") {
    startDate.setDate(today.getDate() - 7);
    const tglMulai = startDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long" });
    const tglSelesai = today.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    title = `📈 <b>Laporan Tren Mingguan</b>\n<i>Periode: ${tglMulai} - ${tglSelesai}</i>`;
  } else if (periode === "bulanan") {
    startDate.setMonth(today.getMonth() - 1);
    const tglMulai = startDate.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
    const tglSelesai = today.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
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

  kirimPesanTelegram(pesanLaporan, config, "HTML");
}

/**
 * [FINAL & STABIL - REFACTORED v3.5.0] Menyusun laporan provisioning dengan membaca header dari Konfigurasi.
 */
function generateProvisioningReport(config) {
  try {
    const sheetName = config[KONSTANTA.KUNCI_KONFIG.SHEET_VM];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
    if (!sheet || sheet.getLastRow() <= 1) throw new Error(`Sheet "${sheetName}" tidak ditemukan atau kosong.`);

    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

    const K = KONSTANTA.KUNCI_KONFIG;
    const requiredHeaders = {
      PK: config[K.HEADER_VM_PK],
      VM_NAME: config[K.HEADER_VM_NAME],
      VCENTER: config[K.HEADER_VM_VCENTER],
      STATE: config[K.HEADER_VM_STATE],
      CPU: config[K.HEADER_VM_CPU],
      MEMORY: config[K.HEADER_VM_MEMORY],
      PROV_TB: config[K.HEADER_VM_PROV_TB],
    };

    const indices = {};
    for (const key in requiredHeaders) {
      indices[key] = headers.indexOf(requiredHeaders[key]);
      if (indices[key] === -1)
        throw new Error(`Header penting '${requiredHeaders[key]}' tidak ditemukan di sheet "${sheetName}".`);
    }

    const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
    const reportData = { Top5: { cpu: [], memory: [], disk: [] } };
    const vCenters = new Set(allData.map((row) => row[indices.VCENTER] || "Lainnya"));

    ["Total", ...vCenters].forEach((vc) => {
      reportData[vc] = { vmCount: 0, cpuOn: 0, cpuOff: 0, memOn: 0, memOff: 0, disk: 0 };
    });

    for (const row of allData) {
      const vCenter = row[indices.VCENTER] || "Lainnya";
      const isPoweredOn = String(row[indices.STATE] || "")
        .toLowerCase()
        .includes("on");
      const cpu = parseInt(row[indices.CPU], 10) || 0;
      const memory = parseFloat(row[indices.MEMORY]) || 0;
      const disk = parseFloat(row[indices.PROV_TB]) || 0;
      reportData[vCenter].vmCount++;
      reportData["Total"].vmCount++;
      reportData[vCenter].disk += disk;
      reportData["Total"].disk += disk;
      if (isPoweredOn) {
        reportData[vCenter].cpuOn += cpu;
        reportData[vCenter].memOn += memory;
        reportData["Total"].cpuOn += cpu;
        reportData["Total"].memOn += memory;
      } else {
        reportData[vCenter].cpuOff += cpu;
        reportData[vCenter].memOff += memory;
        reportData["Total"].cpuOff += cpu;
        reportData["Total"].memOff += memory;
      }
      const vmInfo = { name: row[indices.VM_NAME], pk: row[indices.PK] };
      updateTop5(reportData.Top5.cpu, { ...vmInfo, value: cpu });
      updateTop5(reportData.Top5.memory, { ...vmInfo, value: memory });
      updateTop5(reportData.Top5.disk, { ...vmInfo, value: disk });
    }

    let message = `⚙️ <b>Laporan Alokasi Sumber Daya Infrastruktur</b>\n`;
    message += `<i>Data per ${new Date().toLocaleString("id-ID")}</i>`;

    Object.keys(reportData)
      .filter((key) => key !== "Top5" && key !== "Total")
      .sort()
      .forEach((vc) => {
        message += KONSTANTA.UI_STRINGS.SEPARATOR;
        message += `🏢 <b>vCenter: ${vc}</b>\n\n`;
        const totalCpu = reportData[vc].cpuOn + reportData[vc].cpuOff;
        const totalMem = reportData[vc].memOn + reportData[vc].memOff;
        message += `💻 <b>vCPU:</b>\n`;
        message += ` • Total: <b>${totalCpu.toLocaleString("id")} vCPU</b> (On: ${reportData[vc].cpuOn}, Off: ${
          reportData[vc].cpuOff
        })\n`;
        message += ` • Rata-rata/VM: <b>${(reportData[vc].vmCount > 0 ? totalCpu / reportData[vc].vmCount : 0).toFixed(
          1
        )} vCPU</b>\n\n`;
        message += `🧠 <b>Memori:</b>\n`;
        message += ` • Total: <b>${totalMem.toLocaleString("id")} GB</b> <i>(~${(totalMem / 1024).toFixed(
          1
        )} TB)</i>\n`;
        message += ` • Rata-rata/VM: <b>${(reportData[vc].vmCount > 0 ? totalMem / reportData[vc].vmCount : 0).toFixed(
          1
        )} GB</b>\n\n`;
        message += `💽 <b>Disk:</b>\n`;
        message += ` • Total Provisioned: <b>${reportData[vc].disk.toFixed(2)} TB</b>\n`;
      });

    message += KONSTANTA.UI_STRINGS.SEPARATOR;
    message += `🌍 <b>Total Keseluruhan</b>\n\n`;
    const totalCpuGrand = reportData["Total"].cpuOn + reportData["Total"].cpuOff;
    const totalMemGrand = reportData["Total"].memOn + reportData["Total"].memOff;
    message += `💻 <b>vCPU:</b>\n`;
    message += ` • Total: <b>${totalCpuGrand.toLocaleString("id")} vCPU</b> (On: ${reportData["Total"].cpuOn}, Off: ${
      reportData["Total"].cpuOff
    })\n`;
    message += ` • Rata-rata/VM: <b>${(reportData["Total"].vmCount > 0
      ? totalCpuGrand / reportData["Total"].vmCount
      : 0
    ).toFixed(1)} vCPU</b>\n\n`;
    message += `🧠 <b>Memori:</b>\n`;
    message += ` • Total: <b>${totalMemGrand.toLocaleString("id")} GB</b> <i>(~${(totalMemGrand / 1024).toFixed(
      1
    )} TB)</i>\n`;
    message += ` • Rata-rata/VM: <b>${(reportData["Total"].vmCount > 0
      ? totalMemGrand / reportData["Total"].vmCount
      : 0
    ).toFixed(1)} GB</b>\n\n`;
    message += `💽 <b>Disk:</b>\n`;
    message += ` • Total Provisioned: <b>${reportData["Total"].disk.toFixed(2)} TB</b>\n`;

    message += KONSTANTA.UI_STRINGS.SEPARATOR;
    message += `🏆 <b>Pengguna Resource Teratas</b>\n`;
    const topCpuText = reportData.Top5.cpu
      .map((vm, i) => `${i + 1}. <code>${escapeHtml(vm.name)}</code> (${vm.value} vCPU)`)
      .join("\n");
    const topMemText = reportData.Top5.memory
      .map((vm, i) => `${i + 1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toLocaleString("id")} GB)`)
      .join("\n");
    const topDiskText = reportData.Top5.disk
      .map((vm, i) => `${i + 1}. <code>${escapeHtml(vm.name)}</code> (${vm.value.toFixed(2)} TB)`)
      .join("\n");
    message += `\n<i>vCPU Terbesar:</i>\n${topCpuText}\n`;
    message += `\n<i>Memori Terbesar:</i>\n${topMemText}\n`;
    message += `\n<i>Disk Terbesar:</i>\n${topDiskText}\n`;

    message += `\n\n<i>Detail alokasi per vCenter dapat dianalisis lebih lanjut melalui perintah /export.</i>`;

    return message;
  } catch (e) {
    throw new Error(`Gagal membuat laporan provisioning: ${e.message}`);
  }
}

/**
 * [FINAL & STABIL] Fungsi pembantu untuk mengelola daftar top 5.
 */
function updateTop5(topArray, newItem) {
  if (!newItem || isNaN(newItem.value) || newItem.value <= 0) return;

  if (topArray.length < 5) {
    topArray.push(newItem);
  } else if (newItem.value > topArray[4].value) {
    topArray.pop();
    topArray.push(newItem);
  }
  topArray.sort((a, b) => b.value - a.value);
}

/**
 * [REFACTORED v4.3.2 - CRITICAL FIX] Menganalisis tren perubahan dari log.
 * Memperbaiki bug 'Cannot read properties of undefined (reading 'ACTION')' dengan
 * menggunakan referensi konstanta yang benar dari objek config.
 */
function analisisTrenPerubahan(startDate, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const { headers, data: logs } = getCombinedLogs(startDate, config);

  if (logs.length === 0) {
    return {
      trendMessage: "Tidak ada aktivitas perubahan data yang signifikan pada periode ini.",
      anomalyMessage: null,
      counts: { baru: 0, dimodifikasi: 0, dihapus: 0 },
    };
  }

  // Menggunakan referensi yang BENAR dari objek 'config'
  const actionIndex = headers.indexOf(config[K.HEADER_LOG_ACTION]);
  const timestampIndex = headers.indexOf(config[K.HEADER_LOG_TIMESTAMP]);

  if (actionIndex === -1 || timestampIndex === -1) {
    throw new Error("Header 'Action' atau 'Timestamp' tidak ditemukan di log.");
  }

  const counts = {
    PENAMBAHAN: 0,
    MODIFIKASI: 0,
    PENGHAPUSAN: 0,
  };

  const activityByDay = {};

  logs.forEach((log) => {
    const action = log[actionIndex];
    if (counts.hasOwnProperty(action)) {
      counts[action]++;
    }

    const date = new Date(log[timestampIndex]).toISOString().split("T")[0];
    activityByDay[date] = (activityByDay[date] || 0) + 1;
  });

  let trendMessage;
  const totalChanges = logs.length;
  if (totalChanges > 50) {
    trendMessage = "Aktivitas perubahan terpantau <b>sangat tinggi</b>.";
  } else if (totalChanges > 10) {
    trendMessage = "Aktivitas perubahan terpantau <b>moderat</b>.";
  } else {
    trendMessage = "Aktivitas perubahan terpantau <b>rendah</b>.";
  }

  let anomalyMessage = null;
  const days = Object.keys(activityByDay);
  if (days.length > 1) {
    const avgChanges = totalChanges / days.length;
    const highActivityDays = days.filter(
      (day) => activityByDay[day] > avgChanges * 2 && activityByDay[day] > KONSTANTA.LIMIT.HIGH_ACTIVITY_THRESHOLD
    );
    if (highActivityDays.length > 0) {
      anomalyMessage = `⚠️ Terdeteksi anomali aktivitas pada tanggal: <b>${highActivityDays.join(", ")}</b>.`;
    }
  }

  return {
    trendMessage: trendMessage,
    anomalyMessage: anomalyMessage,
    counts: {
      baru: counts["PENAMBAHAN"],
      dimodifikasi: counts["MODIFIKASI"],
      dihapus: counts["PENGHAPUSAN"],
    },
  };
}

/**
 * [REFACTORED v4.3.1] Menghasilkan laporan distribusi aset VM.
 * Memperbaiki bug referensi konstanta untuk 'KRITIKALITAS'.
 */
function generateAssetDistributionReport(config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const sheetName = config[K.SHEET_VM];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    throw new Error(`Sheet data VM "${sheetName}" tidak dapat ditemukan atau kosong.`);
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const allData = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();

  // Menggunakan referensi yang BENAR dari objek 'config'
  const critIndex = headers.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
  const envIndex = headers.indexOf(config[K.HEADER_VM_ENVIRONMENT]);
  const stateIndex = headers.indexOf(config[K.HEADER_VM_STATE]);

  if ([critIndex, envIndex, stateIndex].includes(-1)) {
    throw new Error("Satu atau lebih header penting (Kritikalitas, Environment, State) tidak ditemukan di sheet VM.");
  }

  const report = {
    criticality: {},
    environment: {},
    totalVm: allData.length,
  };

  const recognizedCriticality = config.LIST_KRITIKALITAS || [];
  const recognizedEnvironment = config.LIST_ENVIRONMENT || [];

  allData.forEach((row) => {
    let criticality = String(row[critIndex] || "").trim();
    if (!recognizedCriticality.includes(criticality) || criticality === "") {
      criticality = "Other";
    }
    report.criticality[criticality] = (report.criticality[criticality] || 0) + 1;

    let environment = String(row[envIndex] || "").trim();
    if (!recognizedEnvironment.includes(environment) || environment === "") {
      environment = "Other";
    }
    if (!report.environment[environment]) {
      report.environment[environment] = { total: 0, on: 0, off: 0 };
    }
    report.environment[environment].total++;

    if (
      String(row[stateIndex] || "")
        .toLowerCase()
        .includes("on")
    ) {
      report.environment[environment].on++;
    } else {
      report.environment[environment].off++;
    }
  });

  const timestamp = new Date().toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  });
  let message = `📊 <b>Laporan Distribusi Aset VM</b>\n`;
  message += `<i>Analisis per ${timestamp} WITA</i>\n\n`;
  message += KONSTANTA.UI_STRINGS.SEPARATOR + "\n";

  message += `🔥 <b>Analisis Berdasarkan Kritikalitas</b>\n`;
  message += `<i>Total Keseluruhan: ${report.totalVm} VM</i>\n\n`;

  const criticalityOrder = [...recognizedCriticality, "Other"];
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
  const envOrder = [...recognizedEnvironment, "Other"];

  for (const env of envOrder) {
    if (report.environment[env]) {
      const data = report.environment[env];
      const icon = env.toLowerCase().includes("production") ? "🏢" : env.toLowerCase().includes("dev") ? "🛠️" : "⚙️";
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

/**
 * [FUNGSI BARU v3.5.0 - LOGIKA FINAL & AKURAT] Menganalisis sebuah cluster secara komprehensif.
 * Menerapkan logika parsing DS yang cerdas dengan mengekstrak pola inti cluster (cth: 'CL01').
 * @param {string} clusterName - Nama cluster yang akan dianalisis (misal: 'TBN-COM-LNV-CL01').
 * @param {object} config - Objek konfigurasi bot yang aktif.
 * @returns {object} Objek yang berisi data analisis cluster.
 */
function generateClusterAnalysis(clusterName, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const analysis = {
    totalVms: 0,
    on: 0,
    off: 0,
    totalCpu: 0,
    totalMemory: 0,
    totalVmProvisionedTb: 0,
    totalDsCapacityTb: 0,
    diskUtilizationPercent: 0,
    criticalVmOffCount: 0,
    criticalVmOffDetails: {},
  };

  try {
    // 1. Analisis VM (Tidak ada perubahan di blok ini)
    const { headers: vmHeaders, results: vmsInCluster } = searchVmsByCluster(clusterName, config);
    if (vmsInCluster.length > 0) {
      analysis.totalVms = vmsInCluster.length;
      const stateIndex = vmHeaders.indexOf(config[K.HEADER_VM_STATE]);
      const cpuIndex = vmHeaders.indexOf(config[K.HEADER_VM_CPU]);
      const memoryIndex = vmHeaders.indexOf(config[K.HEADER_VM_MEMORY]);
      const critIndex = vmHeaders.indexOf(config[K.HEADER_VM_KRITIKALITAS]);
      const provTbIndex = vmHeaders.indexOf(config[K.HEADER_VM_PROV_TB]);
      const monitoredCritLevels = Object.keys(config[K.SKOR_KRITIKALITAS] || {});

      vmsInCluster.forEach((row) => {
        const state = String(row[stateIndex] || "").toLowerCase();
        if (state.includes("on")) analysis.on++;
        else analysis.off++;
        analysis.totalCpu += parseInt(row[cpuIndex], 10) || 0;
        analysis.totalMemory += parseFloat(row[memoryIndex]) || 0;
        analysis.totalVmProvisionedTb += parseLocaleNumber(row[provTbIndex]);

        const criticality = String(row[critIndex] || "")
          .toUpperCase()
          .trim();
        if (monitoredCritLevels.includes(criticality) && !state.includes("on")) {
          analysis.criticalVmOffCount++;
          analysis.criticalVmOffDetails[criticality] = (analysis.criticalVmOffDetails[criticality] || 0) + 1;
        }
      });
    }

    // 2. Analisis Datastore dengan Logika Parsing Baru
    const dsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(config[K.SHEET_DS]);
    if (dsSheet && dsSheet.getLastRow() > 1) {
      const dsData = dsSheet.getDataRange().getValues();
      const dsHeaders = dsData.shift();
      const dsNameIndex = dsHeaders.indexOf(config[K.DS_NAME_HEADER]);
      const dsCapTbIndex = dsHeaders.indexOf(config[K.HEADER_DS_CAPACITY_TB]);

      const includedKeywords = (config.KATA_KUNCI_DS_DIUTAMAKAN || []).map((k) => k.toLowerCase());
      const excludedKeywords = (config[K.DS_KECUALI] || []).map((k) => k.toLowerCase());

      // --- [PERBAIKAN LOGIKA PARSING UTAMA] ---
      // Ekstrak pola inti cluster (CLxx) dari nama cluster lengkap yang dicari.
      const clusterPatternMatch = clusterName.match(/CL\d+/i);
      const coreClusterPattern = clusterPatternMatch ? clusterPatternMatch[0].toLowerCase() : null;

      if (coreClusterPattern && dsNameIndex !== -1 && dsCapTbIndex !== -1) {
        dsData.forEach((row) => {
          const dsName = String(row[dsNameIndex] || "");
          const dsNameLower = dsName.toLowerCase();

          // Periksa apakah nama DS mengandung pola inti cluster (cth: 'cl01').
          if (!dsNameLower.includes(coreClusterPattern)) {
            return; // Lanjut ke datastore berikutnya jika tidak cocok
          }
          // --- [AKHIR PERBAIKAN] ---

          const isIncluded =
            includedKeywords.length === 0 || includedKeywords.some((keyword) => dsNameLower.includes(keyword));
          if (!isIncluded) {
            return;
          }

          const isExcluded = excludedKeywords.some((keyword) => dsNameLower.includes(keyword));
          if (isExcluded) {
            return;
          }

          analysis.totalDsCapacityTb += parseLocaleNumber(row[dsCapTbIndex]);
        });
      }
    }

    // 3. Hitung utilisasi
    if (analysis.totalDsCapacityTb > 0) {
      analysis.diskUtilizationPercent = (analysis.totalVmProvisionedTb / analysis.totalDsCapacityTb) * 100;
    }

    return analysis;
  } catch (e) {
    console.error(`Gagal melakukan analisis untuk cluster "${clusterName}". Error: ${e.message}`);
    return analysis;
  }
}
