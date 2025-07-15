// ===== FILE: Simulasi.gs =====

/**
 * [REVISI v1.3.0 - DENGAN VALIDASI] Menjalankan simulasi cleanup pada sebuah cluster
 * untuk mengidentifikasi potensi penghematan sumber daya dari VM yang tidak terpakai atau mati.
 * Kini dilengkapi dengan validasi header untuk mencegah kegagalan senyap.
 * @param {string} clusterName - Nama cluster yang akan dianalisis.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {string} Pesan hasil simulasi yang sudah diformat HTML.
 */
function jalankanSimulasiCleanup(clusterName, config) {
  try {
    const { headers, results: vmsInCluster } = searchVmsByCluster(clusterName, config);
    if (vmsInCluster.length === 0) {
      return `ℹ️ Tidak ditemukan VM di cluster "<b>${escapeHtml(clusterName)}</b>" untuk disimulasikan.`;
    }

    const K = KONSTANTA.KUNCI_KONFIG;

    // --- BLOK VALIDASI HEADER BARU ---
    const requiredHeaders = {
      nameIndex: config[K.HEADER_VM_NAME],
      stateIndex: config[K.HEADER_VM_STATE],
      cpuIndex: config[K.HEADER_VM_CPU],
      memoryIndex: config[K.HEADER_VM_MEMORY],
      provGbIndex: config[K.HEADER_VM_PROV_GB],
    };

    const indices = {};
    for (const key in requiredHeaders) {
      const headerName = requiredHeaders[key];
      indices[key] = headers.indexOf(headerName);
      if (indices[key] === -1) {
        // Membuat pesan error yang sangat spesifik
        const configKeyName = Object.keys(K).find((k) => K[k] === headerName) || "TIDAK DIKETAHUI";
        throw new Error(
          `Header '${headerName}' tidak ditemukan. Periksa nilai untuk kunci '${configKeyName}' di sheet "Konfigurasi".`
        );
      }
    }
    // --- AKHIR BLOK VALIDASI ---

    const candidatesForCleanup = [];
    const totals = { cpu: 0, memory: 0, diskGb: 0 };

    vmsInCluster.forEach((vm) => {
      const vmName = String(vm[indices.nameIndex] || "").toLowerCase();
      const vmState = String(vm[indices.stateIndex] || "").toLowerCase();

      if (vmName.includes("unused") || vmName.includes("decom") || vmState.includes("off")) {
        const cpu = parseInt(vm[indices.cpuIndex], 10) || 0;
        const memory = parseFloat(vm[indices.memoryIndex]) || 0;
        const diskGb = parseFloat(vm[indices.provGbIndex]) || 0;

        candidatesForCleanup.push(vm[indices.nameIndex]);
        totals.cpu += cpu;
        totals.memory += memory;
        totals.diskGb += diskGb;
      }
    });

    let message = `🔮 <b>Hasil Simulasi Cleanup di Cluster ${escapeHtml(clusterName)}</b>\n\n`;
    if (candidatesForCleanup.length === 0) {
      message +=
        "✅ Tidak ditemukan kandidat VM untuk di-cleanup (berdasarkan nama 'unused'/'decom' atau status 'off').";
    } else {
      message += `Jika Anda melakukan dekomisioning terhadap <b>${candidatesForCleanup.length} VM</b> yang teridentifikasi, Anda berpotensi membebaskan:\n`;
      message += ` • ⚙️ <b>CPU:</b> <code>${totals.cpu} vCPU</code>\n`;
      message += ` • 🧠 <b>Memori:</b> <code>${totals.memory.toFixed(1)} GB RAM</code>\n`;
      message += ` • 💽 <b>Penyimpanan:</b> <code>${totals.diskGb.toFixed(1)} GB</code> (~${(
        totals.diskGb / 1024
      ).toFixed(2)} TB)\n\n`;
      message += `<i>Ini adalah simulasi berdasarkan data saat ini dan tidak melakukan perubahan apa pun.</i>`;
    }

    return message;
  } catch (e) {
    console.error(`Gagal menjalankan simulasi cleanup untuk cluster "${clusterName}". Error: ${e.message}`);
    // Mengembalikan pesan error yang informatif ke pengguna
    return `❌ Gagal menjalankan simulasi cleanup. Penyebab:\n<code>${escapeHtml(e.message)}</code>`;
  }
}

/**
 * [BARU v1.2.1] Menjalankan simulasi migrasi dari satu host ke host lain dalam cluster yang sama.
 * Versi ini menggunakan konstanta terpusat untuk semua header.
 * @param {string} sourceHost - Nama host sumber.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {string} Pesan hasil simulasi yang sudah diformat HTML.
 */
function jalankanSimulasiMigrasi(sourceHost, config) {
  try {
    const { headers, dataRows: allVmData } = _getSheetData(config[KONSTANTA.KUNCI_KONFIG.SHEET_VM]);
    if (allVmData.length === 0) {
      return `ℹ️ Data VM tidak ditemukan untuk menjalankan simulasi.`;
    }

    const K = KONSTANTA.KUNCI_KONFIG;

    // Menggunakan konstanta terpusat, bukan string literal "HOSTS".
    const hostIndex = headers.indexOf(config[K.HEADER_VM_HOSTS]);

    const clusterIndex = headers.indexOf(config[K.HEADER_VM_CLUSTER]);
    const cpuIndex = headers.indexOf(config[K.HEADER_VM_CPU]);
    const memoryIndex = headers.indexOf(config[K.HEADER_VM_MEMORY]);

    if ([hostIndex, clusterIndex, cpuIndex, memoryIndex].includes(-1)) {
      throw new Error("Satu atau lebih header penting (HOSTS, Cluster, CPU, Memory) tidak ditemukan.");
    }

    const vmsOnSourceHost = allVmData.filter((vm) => (vm[hostIndex] || "").toLowerCase() === sourceHost.toLowerCase());

    if (vmsOnSourceHost.length === 0) {
      return `ℹ️ Tidak ditemukan VM pada host sumber "<b>${escapeHtml(sourceHost)}</b>".`;
    }

    const sourceCluster = vmsOnSourceHost[0][clusterIndex];
    const totalsToMigrate = { vmCount: vmsOnSourceHost.length, cpu: 0, memory: 0 };
    vmsOnSourceHost.forEach((vm) => {
      totalsToMigrate.cpu += parseInt(vm[cpuIndex], 10) || 0;
      totalsToMigrate.memory += parseFloat(vm[memoryIndex]) || 0;
    });

    const hostAnalysis = {};
    allVmData.forEach((vm) => {
      if (vm[clusterIndex] === sourceCluster) {
        const hostName = vm[hostIndex];
        if (!hostAnalysis[hostName]) {
          hostAnalysis[hostName] = { vmCount: 0, cpu: 0, memory: 0 };
        }
        hostAnalysis[hostName].vmCount++;
        hostAnalysis[hostName].cpu += parseInt(vm[cpuIndex], 10) || 0;
        hostAnalysis[hostName].memory += parseFloat(vm[memoryIndex]) || 0;
      }
    });

    let message = `🔮 <b>Hasil Simulasi Migrasi dari Host ${escapeHtml(sourceHost)}</b>\n\n`;
    message += `<b>Beban yang akan dipindah:</b>\n`;
    message += ` • 🖥️ Total VM: <code>${totalsToMigrate.vmCount}</code>\n`;
    message += ` • ⚙️ Total CPU: <code>${totalsToMigrate.cpu} vCPU</code>\n`;
    message += ` • 🧠 Total Memori: <code>${totalsToMigrate.memory.toFixed(1)} GB</code>\n\n`;
    message += `<b>Analisis Host Tujuan (di Cluster ${escapeHtml(sourceCluster)}):</b>\n`;

    const targetHosts = Object.keys(hostAnalysis).filter((h) => h.toLowerCase() !== sourceHost.toLowerCase());
    if (targetHosts.length === 0) {
      message += "   - <i>Tidak ditemukan host lain di dalam cluster ini sebagai tujuan migrasi.</i>";
    } else {
      targetHosts.sort((a, b) => hostAnalysis[a].vmCount - hostAnalysis[b].vmCount);

      targetHosts.forEach((host) => {
        const currentLoad = hostAnalysis[host];
        const newLoad = {
          vmCount: currentLoad.vmCount + totalsToMigrate.vmCount,
          cpu: currentLoad.cpu + totalsToMigrate.cpu,
          memory: currentLoad.memory + totalsToMigrate.memory,
        };
        message += ` • <b>${escapeHtml(host)}:</b>\n`;
        message += `   └ Beban Setelah Migrasi: ${newLoad.vmCount} VM, ${newLoad.cpu} vCPU, ${newLoad.memory.toFixed(
          1
        )} GB RAM\n`;
      });
    }

    return message;
  } catch (e) {
    console.error(`Gagal menjalankan simulasi migrasi dari host "${sourceHost}". Error: ${e.message}`);
    return `❌ Gagal menjalankan simulasi migrasi. Penyebab: ${e.message}`;
  }
}

// ===== FUNGSI UJI COBA UNTUK DEBUGGING =====

/**
 * Jalankan fungsi ini langsung dari editor Apps Script untuk menguji
 * dan melihat log debug dari fitur simulasi cleanup.
 */
function tesSimulasiCleanup_DariEditor() {
  // --- KONFIGURASI PENGUJIAN ---
  // Ganti nama cluster di bawah ini dengan nama cluster valid yang ada di data DEV Anda.
  const NAMA_CLUSTER_UJI_COBA = "TBN-COM-LNV-CL01";
  // -----------------------------

  console.log(`[DEBUG] Memulai tes simulasi cleanup untuk cluster: "${NAMA_CLUSTER_UJI_COBA}"`);

  try {
    // Membaca konfigurasi, sama seperti yang dilakukan bot
    const { config } = getBotState();
    if (!config) {
      console.error("[DEBUG] GAGAL: Tidak dapat membaca konfigurasi.");
      return;
    }
    console.log("[DEBUG] Konfigurasi berhasil dibaca.");

    // Memanggil fungsi simulasi yang sebenarnya
    const hasilSimulasi = jalankanSimulasiCleanup(NAMA_CLUSTER_UJI_COBA, config);

    // Menampilkan hasil akhir di log
    console.log("------------------------------------------");
    console.log("[DEBUG] HASIL AKHIR SIMULASI:");
    console.log(hasilSimulasi);
    console.log("------------------------------------------");
    console.log(
      "[DEBUG] Jika Anda melihat pesan ini, artinya seluruh fungsi berhasil dijalankan sampai selesai tanpa error."
    );
  } catch (e) {
    // Menangkap dan menampilkan error apapun yang mungkin terjadi
    console.error("[DEBUG] TERJADI ERROR KRITIS! Proses berhenti.");
    console.error(`[DEBUG] Detail Error: ${e.message}`);
    console.error(`[DEBUG] Stack Trace: ${e.stack}`);
  }
}
