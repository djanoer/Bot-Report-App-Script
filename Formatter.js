/**
 * @file Formatter.js
 * @author Djanoer Team
 * @date 2023-01-15
 *
 * @description
 * Berisi kumpulan fungsi yang bertanggung jawab murni untuk memformat data mentah
 * menjadi pesan teks (HTML) dan keyboard inline yang siap dikirim ke Telegram.
 * File ini bertindak sebagai lapisan presentasi (view layer) untuk data yang sudah diolah.
 *
 * @section FUNGSI UTAMA
 * - formatVmDetail(...): Mengubah data detail VM menjadi pesan yang terstruktur dan informatif.
 * - formatHistoryEntry(...): Memformat satu entri log riwayat menjadi teks yang mudah dibaca.
 * - formatClusterAnalysisHeader(...): Membuat bagian header untuk laporan analisis cluster.
 * - formatProvisioningReport(...): Menyusun laporan alokasi sumber daya infrastruktur.
 * - formatLaporanHarian(...): Memformat data untuk laporan operasional harian.
 */

function formatHistoryEntry(entry, headers, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  let formattedText = "";

  const timestamp = new Date(entry[headers.indexOf(config[K.HEADER_LOG_TIMESTAMP])]).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const action = entry[headers.indexOf(config[K.HEADER_LOG_ACTION])];
  const oldValue = entry[headers.indexOf(config[K.HEADER_LOG_OLD_VAL])];
  const newValue = entry[headers.indexOf(config[K.HEADER_LOG_NEW_VAL])];
  const detail = entry[headers.indexOf(config[K.HEADER_LOG_DETAIL])];

  formattedText += `<b>🗓️ ${escapeHtml(timestamp)}</b>\n`;
  formattedText += `<b>Aksi:</b> ${escapeHtml(action)}\n`;
  if (action === "MODIFIKASI") {
    const columnName = detail.replace("Kolom '", "").replace("' diubah", "");
    formattedText += `<b>Detail:</b> Kolom '${escapeHtml(columnName)}' diubah\n`;
    formattedText += `   - <code>${escapeHtml(oldValue || "Kosong")}</code> ➔ <code>${escapeHtml(
      newValue || "Kosong"
    )}</code>\n`;
  } else {
    formattedText += `<b>Detail:</b> ${escapeHtml(detail)}\n\n`;
  }
  return formattedText;
}

/**
 * [REVISI FINAL & TERPUSAT - FASE 3] Membuat header analisis cluster.
 * Fungsi ini menjadi satu-satunya sumber kebenaran untuk menampilkan ringkasan cluster.
 */
function formatClusterAnalysisHeader(analysis, clusterName) {
  if (!analysis) return "";

  let header = `\n<b>Ringkasan Kesehatan & Beban Cluster:</b>\n`;
  header += `• <b>Total VM:</b> ${analysis.totalVms} (🟢 ${analysis.on} On / 🔴 ${analysis.off} Off)\n`;
  header += `• <b>Alokasi CPU (Aktif):</b> <code>${analysis.totalCpu} vCPU</code>\n`;
  if (analysis.policy) {
    header += `   └ Utilisasi Efektif: <b>${analysis.cpuUtilEffective.toFixed(1)}%</b> dari batas kebijakan ${
      analysis.policy.cpuovercommitratio
    }:1\n`;
  }
  header += `• <b>Alokasi Memori (Aktif):</b> <code>${(analysis.totalMemoryGb / 1024).toFixed(2)} TB</code>\n`;
  if (analysis.policy) {
    header += `   └ Utilisasi Efektif: <b>${analysis.memUtilEffective.toFixed(1)}%</b> dari batas kebijakan ${
      analysis.policy.memoryovercommitratio
    }:1\n`;
  }
  header += `• <b>Alokasi Disk (Total):</b> <code>${analysis.totalDiskTb.toFixed(2)} TB</code>\n`;

  return header;
}

function formatDatastoreAnalysisHeader(analysis, datastoreName) {
  if (!analysis || !analysis.details) {
    return `🗄️ <b>Ringkasan Datastore "${escapeHtml(datastoreName)}"</b>\n<i>Detail tidak dapat dimuat.</i>`;
  }

  const { details, totalVms, on, off } = analysis;
  let header = `🗄️ <b>Ringkasan Datastore "${escapeHtml(datastoreName)}"</b>\n`;
  header += `• <b>Kapasitas:</b> ${details.capacityGb.toFixed(1)} GB | <b>Terpakai:</b> ${details.provisionedGb.toFixed(
    1
  )} GB\n`;
  header += `• <b>Alokasi Terpakai:</b> ${details.usagePercent.toFixed(1)}% [<code>${createProgressBar(
    details.usagePercent
  )}</code>]\n`;
  header += `• <b>Total VM:</b> ${totalVms} (🟢 ${on} On / 🔴 ${off} Off)\n`;
  return header;
}

/**
 * Memformat detail VM.
 * Menambahkan validasi dan pengambilan data untuk Host dan Tanggal Setup.
 */
function formatVmDetail(row, headers, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const requiredHeaderKeys = [
    K.HEADER_VM_PK,
    K.HEADER_VM_NAME,
    K.HEADER_VM_IP,
    K.HEADER_VM_STATE,
    K.HEADER_VM_UPTIME,
    K.HEADER_VM_CPU,
    K.HEADER_VM_MEMORY,
    K.HEADER_VM_PROV_GB,
    K.HEADER_VM_CLUSTER,
    K.VM_DS_COLUMN_HEADER,
    K.HEADER_VM_KRITIKALITAS,
    K.HEADER_VM_KELOMPOK_APP,
    K.HEADER_VM_DEV_OPS,
    K.HEADER_VM_GUEST_OS,
    K.HEADER_VM_VCENTER,
    K.HEADER_VM_NO_TIKET,
    K.HEADER_VM_HOSTS,
    K.HEADER_VM_TANGGAL_SETUP, // <-- Penambahan baru
  ];
  const indices = {};
  for (const headerKey of requiredHeaderKeys) {
    const headerName = config[headerKey];
    // Menjadikan No Tiket, Host, dan Tanggal Setup sebagai opsional
    const isOptional = [K.HEADER_VM_NO_TIKET, K.HEADER_VM_HOSTS, K.HEADER_VM_TANGGAL_SETUP].includes(headerKey);

    if (!headerName && !isOptional) {
      throw new Error(`Kunci konfigurasi '${headerKey}' tidak ditemukan.`);
    }
    const index = headers.indexOf(headerName);
    if (index === -1 && !isOptional) {
      throw new Error(`Header '${headerName}' (dari kunci '${headerKey}') tidak ditemukan di sheet "Data VM".`);
    }
    indices[headerKey] = index;
  }

  const vmData = {
    row: row,
    indices: indices,
    config: config,
    normalizedPk: normalizePrimaryKey(row[indices[K.HEADER_VM_PK]]),
    vmName: row[indices[K.HEADER_VM_NAME]],
    clusterName: row[indices[K.HEADER_VM_CLUSTER]],
    datastoreName: row[indices[K.VM_DS_COLUMN_HEADER]],
    hostName: row[indices[K.HEADER_VM_HOSTS]],
  };

  const vmNote = getVmNote(vmData.normalizedPk, config);

  let pesan = "🖥️  <b>Detail Virtual Machine</b>\n\n";
  pesan += _buildGeneralInfoSection(vmData);
  pesan += _buildResourceSection(vmData);
  pesan += _buildManagementSection(vmData);
  pesan += KONSTANTA.UI_STRINGS.SEPARATOR;
  pesan += _buildTicketSection(vmData);
  pesan += KONSTANTA.UI_STRINGS.SEPARATOR;
  pesan += _buildNoteSection(vmNote);

  const keyboard = _buildVmDetailKeyboard(vmData, vmNote);

  return { pesan, keyboard };
}

// --- FUNGSI-FUNGSI PEMBANTU BARU ---

// Menambahkan parameter 'isHtmlFormatted'
function _addDetail(value, icon, label, isCode = false, isHtmlFormatted = false) {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    let formattedValue;
    if (isHtmlFormatted) {
      // Jika sudah diformat, gunakan apa adanya tanpa escaping.
      formattedValue = value;
    } else {
      // Jika tidak, terapkan logika escaping seperti biasa.
      formattedValue = isCode ? `<code>${escapeHtml(value)}</code>` : escapeHtml(value);
    }
    return `•  ${icon} <b>${label}:</b> ${formattedValue}\n`;
  }
  return "";
}

/**
 * [REVISI FINAL BERDASARKAN DEBUG] Membangun bagian informasi umum dengan
 * konstanta yang benar dan logika yang tangguh.
 */
function _buildGeneralInfoSection(vmData) {
  const { row, indices, config, normalizedPk, vmName } = vmData;
  const K = KONSTANTA.KUNCI_KONFIG;

  let section = "<b>Informasi Umum</b>\n";

  section += _addDetail(vmName, "🏷️", "Nama VM", true);
  section += _addDetail(normalizedPk, "🔑", "Primary Key", true);
  section += _addDetail(row[indices[K.HEADER_VM_IP]], "🌐", "IP Address", true);

  const stateValue = row[indices[K.HEADER_VM_STATE]] || "";
  const stateIcon = stateValue.toLowerCase().includes("on") ? "🟢" : "🔴";
  section += _addDetail(stateValue, stateIcon, "Status");

  // --- BLOK LOGIKA UPTIME YANG TELAH DIPERBAIKI ---

  const rawUptimeValue = row[indices[K.HEADER_VM_UPTIME]];
  let uptimeText = `${rawUptimeValue || "N/A"} hari`;

  // 1. Menggunakan konstanta yang BENAR: K.THRESHOLD_VM_UPTIME
  const rawThresholdValue = config[K.THRESHOLD_VM_UPTIME];

  // 2. Validasi Kritis: Hanya lanjutkan jika nilai konfigurasi ada.
  if (rawThresholdValue !== undefined && rawThresholdValue !== null && String(rawThresholdValue).trim() !== "") {
    const uptimeDays = parseLocaleNumber(rawUptimeValue);
    const uptimeThreshold = parseLocaleNumber(rawThresholdValue);

    // 3. Lakukan perbandingan yang sekarang dijamin berjalan dengan benar.
    if (uptimeDays > 0 && uptimeThreshold > 0 && uptimeDays > uptimeThreshold) {
      uptimeText += ` 💡 <i>(melebihi ambang batas ${uptimeThreshold} hari)</i>`;
    }
  } else {
    // Fallback jika konfigurasi tidak ada.
    console.warn(
      `Peringatan: Kunci 'THRESHOLD_VM_UPTIME_DAYS' tidak ditemukan atau kosong di Konfigurasi. Logika perbandingan uptime dilewati.`
    );
  }

  section += _addDetail(uptimeText, "⏳", "Uptime", false, true);
  // --- AKHIR BLOK PERBAIKAN ---

  return section;
}

function _buildResourceSection(vmData) {
  const { row, indices, config, clusterName, datastoreName, hostName } = vmData;
  const K = KONSTANTA.KUNCI_KONFIG;
  let section = "\n<b>Sumber Daya & Kapasitas</b>\n";
  section += _addDetail(`${row[indices[K.HEADER_VM_CPU]]} vCPU`, "⚙️", "CPU");
  section += _addDetail(`${row[indices[K.HEADER_VM_MEMORY]]} GB`, "🧠", "Memory");
  section += _addDetail(`${row[indices[K.HEADER_VM_PROV_GB]]} GB`, "💽", "Provisioned");
  section += _addDetail(clusterName, "☁️", "Cluster");
  section += _addDetail(hostName, "🖥️", "Host");
  section += _addDetail(datastoreName, "🗄️", "Datastore");
  return section;
}

function _buildManagementSection(vmData) {
  const { row, indices, config, datastoreName } = vmData;
  const K = KONSTANTA.KUNCI_KONFIG;
  let section = "\n<b>Konfigurasi & Manajemen</b>\n";
  const environment = getEnvironmentFromDsName(datastoreName || "", config[K.MAP_ENV]) || "N/A";
  section += _addDetail(environment, "🌍", "Environment");
  section += _addDetail(row[indices[K.HEADER_VM_KRITIKALITAS]], "🔥", "Kritikalitas BIA");
  section += _addDetail(row[indices[K.HEADER_VM_KELOMPOK_APP]], "📦", "Aplikasi BIA");
  section += _addDetail(row[indices[K.HEADER_VM_DEV_OPS]], "👥", "DEV/OPS");
  section += _addDetail(row[indices[K.HEADER_VM_GUEST_OS]], "🐧", "Guest OS");
  section += _addDetail(row[indices[K.HEADER_VM_VCENTER]], "🏢", "vCenter");
  return section;
}

function _buildTicketSection(vmData) {
  const { row, indices, config, vmName } = vmData;
  const K = KONSTANTA.KUNCI_KONFIG;

  let section = `🎫  <b>Tiket Provisioning:</b>\n`;
  const noTiketProvisioning = indices[K.HEADER_VM_NO_TIKET] !== -1 ? row[indices[K.HEADER_VM_NO_TIKET]] : "";
  section += noTiketProvisioning
    ? `   - <code>${escapeHtml(noTiketProvisioning)}</code>\n`
    : `   - <i>Tidak ada nomor tiket.</i>\n`;

  let tanggalSetup = "";
  // Menggunakan kunci konstanta baru yang telah Anda tambahkan
  const tanggalSetupIndex = indices[K.HEADER_VM_TANGGAL_SETUP];
  if (tanggalSetupIndex > -1) {
    tanggalSetup = String(row[tanggalSetupIndex] || "").trim();
  }

  section += `\n🗓️  <b>Tanggal Setup:</b>\n`;
  // Logika untuk menangani data yang bervariasi
  if (
    tanggalSetup &&
    tanggalSetup.toLowerCase() !== "data tidak ditemukan" &&
    tanggalSetup.toLowerCase() !== "kosong"
  ) {
    const formattedDate = new Date(tanggalSetup).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const relativeTime = formatRelativeTime(tanggalSetup); // Memanggil helper dari Utilitas.js
    section += `   - ${escapeHtml(formattedDate)} <i>${relativeTime}</i>\n`;
  } else {
    section += `   - <i>Tidak ada data.</i>\n`;
  }

  section += `\n🎟️  <b>Tiket CPR Utilisasi (Aktif):</b>\n`;
  const activeTickets = findActiveTicketsByVmName(vmName, config);
  if (activeTickets.length > 0) {
    activeTickets.forEach((ticket) => {
      section += `   - <code>${escapeHtml(ticket.id)}</code>: ${escapeHtml(ticket.name)} (${escapeHtml(
        ticket.status
      )})\n`;
    });
  } else {
    section += `   - <i>Tidak ada tiket utilisasi aktif ditemukan.</i>`;
  }
  return section;
}

function _buildNoteSection(vmNote) {
  let section = `\n📝  <b>Catatan untuk VM ini:</b>\n`;
  if (vmNote) {
    const noteText = vmNote["Isi Catatan"] || "<i>(Catatan kosong)</i>";
    const updatedBy = vmNote["Nama User Update"] || "tidak diketahui";
    const updatedAt = vmNote["Timestamp Update"]
      ? new Date(vmNote["Timestamp Update"]).toLocaleString("id-ID")
      : "tidak diketahui";
    section += `<i>${escapeHtml(noteText)}</i>\n`;
    section += `_Terakhir diperbarui oleh: ${escapeHtml(updatedBy)} pada ${updatedAt}_\n`;
  } else {
    section += `_Tidak ada catatan untuk VM ini._\n`;
  }
  return section;
}

function _buildVmDetailKeyboard(vmData, vmNote) {
  const { config, normalizedPk, clusterName, datastoreName } = vmData;
  const keyboardRows = [];
  const firstRowButtons = [];

  // Menggunakan CallbackHelper untuk semua tombol
  firstRowButtons.push({
    text: "📜 Riwayat VM",
    callback_data: CallbackHelper.build("history_machine", "show", { pk: normalizedPk, page: 1 }, config),
  });

  firstRowButtons.push({
    text: `✏️ ${vmNote ? "Edit" : "Tambah"} Catatan`,
    callback_data: CallbackHelper.build("note_machine", "prompt_add", { pk: normalizedPk }, config),
  });

  if (vmNote) {
    firstRowButtons.push({
      text: "🗑️ Hapus Catatan",
      callback_data: CallbackHelper.build("note_machine", "prompt_delete", { pk: normalizedPk }, config),
    });
  }
  keyboardRows.push(firstRowButtons);

  const secondRowButtons = [];
  if (clusterName) {
    const sessionData = { listType: "cluster", itemName: clusterName, originPk: normalizedPk, page: 1 };
    secondRowButtons.push({
      text: `⚙️ VM di Cluster`,
      callback_data: CallbackHelper.build("search_machine", "show_list", sessionData, config),
    });
  }
  if (datastoreName) {
    const sessionData = { listType: "datastore", itemName: datastoreName, originPk: normalizedPk, page: 1 };
    secondRowButtons.push({
      text: `🗄️ Detail DS`,
      callback_data: CallbackHelper.build("search_machine", "show_list", sessionData, config),
    });
  }
  if (secondRowButtons.length > 0) {
    keyboardRows.push(secondRowButtons);
  }

  return { inline_keyboard: keyboardRows };
}

function formatProvisioningReport(reportData, config) {
  let message = formatReportHeader("Laporan Alokasi Sumber Daya Infrastruktur");

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
      message += ` • Total: <b>${totalMem.toLocaleString("id")} GB</b> <i>(~${(totalMem / 1024).toFixed(1)} TB)</i>\n`;
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

  message += `\n\n<i>Detail alokasi per vCenter dapat dianalisis lebih lanjut melalui perintah <code>${KONSTANTA.PERINTAH_BOT.EXPORT}</code>.</i>`;

  return message;
}

function formatLaporanHarian(reportData) {
  let pesanLaporan = formatReportHeader("Status Operasional Infrastruktur");

  pesanLaporan += "\n<b>Analisis Aktivitas Hari Ini:</b>\n";

  const totalChanges = reportData.todaysLogs.length;
  if (totalChanges > 0) {
    let activityLabel = "moderat";
    let activityEmoji = "📊";

    // Menentukan label berdasarkan jumlah perubahan
    if (totalChanges > 50) {
      // Ambang batas bisa disesuaikan di Konfigurasi nanti
      activityLabel = "<b>sangat tinggi</b>";
      activityEmoji = "📈";
    } else if (totalChanges > 10) {
      activityLabel = "<b>tinggi</b>";
      activityEmoji = "📈";
    } else {
      activityLabel = "rendah";
      activityEmoji = "📉";
    }

    pesanLaporan += `${activityEmoji} Terpantau aktivitas ${activityLabel} dengan <b>${totalChanges} perubahan data</b>, didominasi oleh modifikasi.\n`;
    pesanLaporan += `(➕${reportData.counts.baru} Baru | ✏️${reportData.counts.dimodifikasi} Modifikasi | ❌${reportData.counts.dihapus} Dihapus)\n`;
  } else {
    pesanLaporan += "✅ Tidak terdeteksi aktivitas perubahan data yang signifikan hari ini.\n";
  }

  pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;
  pesanLaporan += "<b>Ringkasan vCenter & Uptime:</b>\n" + reportData.vCenterSummary;
  pesanLaporan += KONSTANTA.UI_STRINGS.SEPARATOR;

  // --- PERBAIKAN UTAMA DI SINI ---
  pesanLaporan += "<b>Status Provisioning:</b>\n";
  // Tambahkan pesan dasar dari objek status
  pesanLaporan += reportData.provisioningSummary.message;
  // Jika over-provisioned, tambahkan perintah dinamis
  if (reportData.provisioningSummary.isOverProvisioned) {
    pesanLaporan += ` Gunakan ${KONSTANTA.PERINTAH_BOT.MIGRASI_CHECK} untuk detail.`;
  }

  // Tambahkan perintah dinamis untuk riwayat
  pesanLaporan += `\n\n<i>Rincian aktivitas dapat dilihat melalui perintah ${KONSTANTA.PERINTAH_BOT.CEK_HISTORY}.</i>`;
  // --- AKHIR PERBAIKAN ---

  return pesanLaporan;
}

/**
 * [BARU] Memformat data distribusi aset VM menjadi pesan HTML yang siap kirim.
 * @param {object} reportData - Objek data hasil dari _calculateAssetDistributionData.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {string} String pesan laporan dalam format HTML.
 */
function formatAssetDistributionReport(reportData, config) {
  const timestamp = new Date().toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Makassar",
  });
  let message = `📊 <b>Laporan Distribusi Aset VM</b>\n`;
  message += `<i>Analisis per ${timestamp} WITA</i>\n\n`;
  message += KONSTANTA.UI_STRINGS.SEPARATOR + "\n";

  // --- Bagian Analisis Kritikalitas ---
  message += `🔥 <b>Analisis Berdasarkan Kritikalitas</b>\n`;
  message += `<i>Total Keseluruhan: ${reportData.totalVm} VM</i>\n\n`;

  // Variabel yang hilang sebelumnya, sekarang didefinisikan di sini.
  const recognizedCriticality = config.LIST_KRITIKALITAS || [];
  const criticalityOrder = [...recognizedCriticality, "Other"];

  for (const crit of criticalityOrder) {
    if (reportData.criticality[crit]) {
      const count = reportData.criticality[crit];
      const percentage = ((count / reportData.totalVm) * 100).toFixed(1);
      message += `• <b>${escapeHtml(crit)}:</b> <code>${count}</code> VM (${percentage}%)\n`;
    }
  }

  message += "\n" + KONSTANTA.UI_STRINGS.SEPARATOR + "\n";

  // --- Bagian Analisis Environment ---
  message += `🌍 <b>Analisis Berdasarkan Environment</b>\n\n`;
  let grandTotal = { total: 0, on: 0, off: 0 };

  // Variabel yang hilang sebelumnya, sekarang didefinisikan di sini.
  const recognizedEnvironment = config.LIST_ENVIRONMENT || [];
  const envOrder = [...recognizedEnvironment, "Other"];

  for (const env of envOrder) {
    if (reportData.environment[env]) {
      const data = reportData.environment[env];
      const icon = env.toLowerCase().includes("production") ? "🏢" : env.toLowerCase().includes("dev") ? "🛠️" : "⚙️";
      message += `${icon} <b>${escapeHtml(env)}</b>\n`;
      message += ` • Total: <code>${data.total}</code> VM\n`;
      message += ` • Status: 🟢 <code>${data.on}</code> On | 🔴 <code>${data.off}</code> Off\n\n`;

      grandTotal.total += data.total;
      grandTotal.on += data.on;
      grandTotal.off += data.off;
    }
  }

  // --- Bagian Grand Total ---
  message += `--- <i>Grand Total</i> ---\n`;
  message += ` • Total: <code>${grandTotal.total}</code> VM\n`;
  message += ` • Status: 🟢 <code>${grandTotal.on}</code> On | 🔴 <code>${grandTotal.off}</code> Off\n`;

  return message;
}

/**
 * [REVISI - FASE 3] Memformat detail analisis cluster dan daftar VM-nya.
 * Sekarang memanggil helper header terpusat untuk konsistensi.
 */
function formatClusterDetail(analysis, vmsInCluster, vmHeaders, config) {
  const K = KONSTANTA.KUNCI_KONFIG;

  // 1. Buat Header Laporan Utama
  let headerContent = formatReportHeader(`Analisis Cluster ${analysis.clusterName}`);
  // Panggil helper ringkasan yang sudah diperbaiki
  headerContent += formatClusterAnalysisHeader(analysis, analysis.clusterName);

  // 2. Siapkan pemformat entri untuk daftar VM
  const formatVmEntry = (row) => {
    const stateIcon = String(row[vmHeaders.indexOf(config[K.HEADER_VM_STATE])] || "")
      .toLowerCase()
      .includes("on")
      ? "🟢"
      : "🔴";
    const vmName = escapeHtml(row[vmHeaders.indexOf(config[K.HEADER_VM_NAME])]);
    const criticality = escapeHtml(row[vmHeaders.indexOf(config[K.HEADER_VM_KRITIKALITAS])] || "");
    const cpu = row[vmHeaders.indexOf(config[K.HEADER_VM_CPU])] || "N/A";
    const memory = row[vmHeaders.indexOf(config[K.HEADER_VM_MEMORY])] || "N/A";
    const disk = row[vmHeaders.indexOf(config[K.HEADER_VM_PROV_TB])] || "N/A";
    return `${stateIcon} <b>${vmName}</b> ${
      criticality ? `<code>[${criticality.toUpperCase()}]</code>` : ""
    }\n     <code>${cpu} vCPU</code> | <code>${memory} GB RAM</code> | <code>${disk} TB Disk</code>`;
  };

  // 3. Buat objek callbackInfo yang benar
  const callbackInfo = {
    machine: "search_machine",
    action: "navigate_list",
    context: {
      listType: "cluster",
      itemName: analysis.clusterName,
    },
  };

  // 4. Gunakan kembali createPaginatedView
  const paginatedView = createPaginatedView(
    vmsInCluster,
    1,
    `Daftar VM di Cluster ${analysis.clusterName}`,
    headerContent,
    formatVmEntry,
    callbackInfo,
    config
  );

  return { pesan: paginatedView.text, keyboard: paginatedView.keyboard };
}

/**
 * [BARU - FASE 4] Membuat tampilan menu utama untuk manajemen konfigurasi.
 * @returns {object} Objek berisi { pesan: string, keyboard: object }.
 */
function formatConfigMainMenu() {
  const pesan =
    "⚙️ <b>Pusat Manajemen Konfigurasi</b>\n\n" +
    "Silakan pilih kategori konfigurasi yang ingin Anda lihat atau ubah. " +
    "Setiap perubahan akan dicatat untuk tujuan audit.";

  // Tombol akan dibuat oleh state machine, fungsi ini hanya menyediakan teks.
  return { pesan };
}

/**
 * [BARU - FASE 4] Membuat tampilan sub-menu untuk kategori konfigurasi tertentu.
 * @param {string} categoryTitle - Judul kategori yang akan ditampilkan.
 * @param {Array<object>} configItems - Array objek [{key: string, value: any}].
 * @returns {string} String pesan yang sudah diformat HTML.
 */
function formatConfigCategoryView(categoryTitle, configItems) {
  let pesan = `⚙️ **Kategori: ${escapeHtml(categoryTitle)}**\n\n`;
  pesan += "Berikut adalah daftar konfigurasi saat ini. Pilih 'Ubah' untuk memperbarui nilai.\n\n";

  if (configItems.length === 0) {
    pesan += "<i>Tidak ada item konfigurasi dalam kategori ini.</i>";
    return pesan;
  }

  configItems.forEach((item) => {
    let displayValue = item.value;
    // Jika nilainya array atau objek, tampilkan sebagai JSON string agar rapi
    if (typeof displayValue === "object" && displayValue !== null) {
      displayValue = JSON.stringify(displayValue);
    }
    // Batasi panjang tampilan nilai agar tidak merusak pesan
    if (String(displayValue).length > 50) {
      displayValue = String(displayValue).substring(0, 50) + "...";
    }
    pesan += `• <code>${escapeHtml(item.key)}</code>\n   └ Nilai Saat Ini: <b>${escapeHtml(displayValue)}</b>\n`;
  });

  return pesan;
}

/**
 * [BARU] Membuat blok header standar untuk semua laporan.
 * @param {string} title - Judul utama laporan.
 * @returns {string} String header laporan yang sudah diformat HTML.
 */
function formatReportHeader(title) {
  const timestamp = new Date().toLocaleString("id-ID", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Asia/Makassar", // <-- Zona waktu statis
  });
  let header = `📊 <b>${escapeHtml(title)}</b>\n`;
  header += `<i>Analisis dijalankan pada: ${timestamp} WITA</i>\n`; // <-- Label statis
  header += KONSTANTA.UI_STRINGS.SEPARATOR;
  return header;
}

/**
 * [BARU] Membuat blok footer standar untuk semua laporan.
 * @returns {string} String footer laporan yang sudah diformat HTML.
 */
function formatReportFooter() {
  let footer = `\n\n<i>Laporan ini dihasilkan secara otomatis oleh Sistem Bot Infrastruktur.</i>`;
  return footer;
}
