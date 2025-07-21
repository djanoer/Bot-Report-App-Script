/**
 * @file Tiket.js
 * @author Djanoer Team
 * @date 2023-04-12
 *
 * @description
 * Mengelola semua logika yang berkaitan dengan data tiket utilisasi.
 * Bertanggung jawab untuk sinkronisasi data tiket dan menyajikannya kepada
 * pengguna melalui menu interaktif.
 */

// =================================================================
// FUNGSI UTAMA: PENGENDALI INTERAKSI TIKET (ROUTER)
// =================================================================

/**
 * Fungsi untuk menjalankan sinkronisasi data tiket secara berkala.
 * Fungsi ini dimaksudkan untuk dipanggil oleh pemicu waktu (trigger)
 * atau saat perintah /cektiket dijalankan.
 * [DIPERBARUI] Menggunakan nama sheet sumber sebagai nama sheet tujuan secara otomatis.
 */
function syncTiketDataForTrigger() {
  console.log("Memulai sinkronisasi data tiket...");
  try {
    const config = bacaKonfigurasi();
    const sumberId = config[KONSTANTA.KUNCI_KONFIG.TIKET_SPREADSHEET_ID];
    const namaSheet = config[KONSTANTA.KUNCI_KONFIG.NAMA_SHEET_TIKET];

    if (!sumberId || !namaSheet) {
      // Melemparkan error agar bisa ditangkap di level yang lebih tinggi
      throw new Error("Konfigurasi TIKET_SPREADSHEET_ID atau NAMA_SHEET_TIKET tidak lengkap.");
    }

    // salinDataSheet sudah melemparkan error jika gagal, jadi kita tidak perlu mengulanginya.
    salinDataSheet(namaSheet, sumberId);

    console.log("Sinkronisasi data tiket berhasil diselesaikan.");
  } catch (e) {
    console.error(`Gagal menjalankan sinkronisasi tiket: ${e.message}`);
    // Melemparkan error kembali agar bisa ditangani oleh fungsi pemanggil (/cektiket)
    throw new Error(`Gagal sinkronisasi data tiket. Penyebab: ${e.message}`);
  }
}

// =================================================================
// FUNGSI PEMBUAT TAMPILAN (VIEW GENERATORS)
// =================================================================

function generateSummaryView(config) {
  const { ticketData, headers } = getLocalTicketData(config);
  if (!ticketData || ticketData.length === 0) {
    return { text: "ℹ️ Tidak ada data tiket yang ditemukan.", keyboard: null };
  }

  const K = KONSTANTA.KUNCI_KONFIG;
  const statusIndex = headers.indexOf(config[K.HEADER_TIKET_STATUS]);

  const allStatusCounts = {};
  ticketData.forEach((row) => {
    const status = String(row[statusIndex] || "").trim();
    if (status) allStatusCounts[status] = (allStatusCounts[status] || 0) + 1;
  });
  const totalTickets = Object.values(allStatusCounts).reduce((sum, count) => sum + count, 0);

  const ageCategories = categorizeTicketAgeWithNewRules(ticketData, headers, config);
  const totalActiveTickets = Object.values(ageCategories).reduce((sum, categoryArray) => sum + categoryArray.length, 0);

  const timestamp = new Date().toLocaleString("id-ID", { dateStyle: "full", timeStyle: "short" });

  let text = `📊 <b>Monitoring & Analisis Tiket Utilisasi</b>\n`;
  text += `<i>Diperbarui pada: ${timestamp}</i>\n`;

  text += `\n<b>Ikhtisar Status Tiket (Total: ${totalTickets})</b>\n`;
  for (const status in allStatusCounts) {
    text += `• ${escapeHtml(status)}: <b>${allStatusCounts[status]}</b>\n`;
  }

  text += KONSTANTA.UI_STRINGS.SEPARATOR;

  text += `<b>Analisis Usia Tindak Lanjut (Total Tiket Aktif: ${totalActiveTickets})</b>\n`;
  text += `Silakan pilih kategori di bawah untuk inspeksi lebih lanjut:`;

  const keyboard = {
    inline_keyboard: [
      [{ text: `Belum Ditindaklanjuti (${ageCategories.notFollowedUp.length})`, callback_data: CallbackHelper.build('ticket_machine', 'show_list', { category: "notFollowedUp" }, config) }],
      [{ text: `Tindak Lanjut 7-14 Hari (${ageCategories.followedUp7to14Days.length})`, callback_data: CallbackHelper.build('ticket_machine', 'show_list', { category: "followedUp7to14Days" }, config) }],
      [{ text: `Tindak Lanjut 14-28 Hari (${ageCategories.followedUp14to28Days.length})`, callback_data: CallbackHelper.build('ticket_machine', 'show_list', { category: "followedUp14to28Days" }, config) }],
      [{ text: `Tindak Lanjut > 1 Bulan (${ageCategories.followedUpOver1Month.length})`, callback_data: CallbackHelper.build('ticket_machine', 'show_list', { category: "followedUpOver1Month" }, config) }],
    ],
  };
  return { text, keyboard };
}

function generateTicketListView(category, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const K = KONSTANTA.KUNCI_KONFIG;
  const linkIndex = headers.indexOf(config[K.HEADER_TIKET_LINK]);
  const categoryIndex = headers.indexOf(config[K.HEADER_TIKET_KATEGORI]);

  const ageCategories = categorizeTicketAgeWithNewRules(ticketData, headers, config);
  const ticketsToShow = ageCategories[category] || [];

  const categoryTitles = {
    notFollowedUp: "Belum Ditindaklanjuti", followedUp7to14Days: "7-14 Hari Lalu",
    followedUp14to28Days: "14-28 Hari Lalu", followedUpOver1Month: "> 1 Bulan Lalu",
  };

  let text = `<b>📜 Daftar Tiket (${categoryTitles[category]})</b>\n\n`;
  const keyboardRows = [];

  if (ticketsToShow.length === 0) {
    text += "<i>Tidak ada tiket dalam kategori ini.</i>";
  } else {
    ticketsToShow.forEach((row, i) => {
      const ticketUrl = row[linkIndex] || "#";
      const ticketId = parseTicketId(ticketUrl);
      const ticketCategory = row[categoryIndex] || "N/A";

      const sessionData = { ticketId: ticketId, fromCategory: category };
      keyboardRows.push([{ 
        text: `Lihat Keterangan ${ticketId}`, 
        callback_data: CallbackHelper.build('ticket_machine', 'show_detail', sessionData, config) 
      }]);
      text += `${i + 1}. <a href="${ticketUrl}"><b>${ticketId}</b></a>, ${escapeHtml(ticketCategory)}\n`;
    });
  }

  keyboardRows.push([{ 
    text: "⬅️ Kembali ke Ringkasan", 
    callback_data: CallbackHelper.build('ticket_machine', 'show_summary', {}, config) 
  }]);
  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

function generateDetailView(ticketId, fromCategory, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const K = KONSTANTA.KUNCI_KONFIG;
  const linkIndex = headers.indexOf(config[K.HEADER_TIKET_LINK]);
  const keteranganIndex = headers.indexOf(config[K.HEADER_TIKET_KETERANGAN]);

  const ticketRow = ticketData.find((row) => parseTicketId(row[linkIndex] || "") === ticketId);
  let text = `<b>💬 Keterangan untuk Tiket: ${ticketId}</b>\n\n`;

  if (ticketRow) {
    text += (keteranganIndex !== -1 ? ticketRow[keteranganIndex] : "Kolom Keterangan tidak ditemukan.") || "<i>Tidak ada keterangan.</i>";
  } else {
    text += "<i>Detail untuk tiket ini tidak dapat ditemukan.</i>";
  }

  const keyboard = {
    inline_keyboard: [[{ 
      text: "⬅️ Kembali ke Daftar", 
      callback_data: CallbackHelper.build('ticket_machine', 'show_list', { category: fromCategory }, config) 
    }]],
  };
  return { text, keyboard };
}

// =================================================================
// FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================

/**
 * [REFACTORED v3.5.0 - FINAL] Mengelompokkan tiket berdasarkan usia dan status yang dinamis dari Konfigurasi.
 */
function categorizeTicketAgeWithNewRules(allTickets, headers, config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const statusIndex = headers.indexOf(config[K.HEADER_TIKET_STATUS]);
  const fuDateIndex = headers.indexOf(config[K.HEADER_TIKET_TGL_FU]);
  
  const categories = {
    notFollowedUp: [],
    followedUp7to14Days: [],
    followedUp14to28Days: [],
    followedUpOver1Month: []
  };
  const now = new Date();
  
  const activeStatusList = (config[K.STATUS_TIKET_AKTIF] || []).map(status => status.toLowerCase());

  const activeTickets = allTickets.filter(row => {
    const ticketStatus = String(row[statusIndex] || '').toLowerCase();
    return activeStatusList.includes(ticketStatus);
  });

  activeTickets.forEach(row => {
    const fuDateValue = row[fuDateIndex];
    
    // Aturan baru: Jika tanggal FU kosong, tiket dianggap "Belum Ditindaklanjuti".
    if (!fuDateValue || String(fuDateValue).trim() === '') {
      categories.notFollowedUp.push(row);
      return; // Lanjutkan ke tiket berikutnya
    }

    const fuDate = new Date(fuDateValue);
    if (isNaN(fuDate.getTime())) {
      // Jika tanggal tidak valid, anggap juga sebagai "Belum Ditindaklanjuti".
      categories.notFollowedUp.push(row);
      return;
    }

    const daysSinceFu = Math.floor((now - fuDate) / (1000 * 60 * 60 * 24));
    
    // Tiket dengan tanggal FU sekarang dikategorikan berdasarkan usia
    if (daysSinceFu >= 30) {
      categories.followedUpOver1Month.push(row);
    } else if (daysSinceFu >= 14) {
      categories.followedUp14to28Days.push(row);
    } else if (daysSinceFu >= 7) {
      categories.followedUp7to14Days.push(row);
    } else {
      // Tiket yang di-FU kurang dari 7 hari lalu TIDAK lagi masuk ke kategori "Belum Ditindaklanjuti".
      // Jika Anda ingin menampilkannya, kita bisa membuat kategori baru, tapi untuk saat ini kita biarkan.
    }
  });
  
  return categories;
}

/**
 * [REFACTORED v3.5.0 - FINAL] Mencari kategori asal tiket dengan aturan yang dinamis.
 */
function findTicketCategoryWithNewRules(ticketRow, headers, config) {
  if (!ticketRow) return 'notFollowedUp';
  
  const K = KONSTANTA.KUNCI_KONFIG;
  const statusIndex = headers.indexOf(config[K.HEADER_TIKET_STATUS]);
  const fuDateIndex = headers.indexOf(config[K.HEADER_TIKET_TGL_FU]);
  
  const activeStatusList = (config[K.STATUS_TIKET_AKTIF] || []).map(status => status.toLowerCase());
  const status = String(ticketRow[statusIndex] || '').toLowerCase();
  
  if (!activeStatusList.includes(status)) return 'notFollowedUp';

  const fuDateValue = ticketRow[fuDateIndex];
  if (!fuDateValue) return 'notFollowedUp';

  const fuDate = new Date(fuDateValue);
  if (isNaN(fuDate.getTime())) return 'notFollowedUp';

  const daysSinceFu = Math.floor((new Date() - fuDate) / (1000 * 60 * 60 * 24));
  if (daysSinceFu >= 30) return 'followedUpOver1Month';
  if (daysSinceFu >= 14) return 'followedUp14to28Days';
  if (daysSinceFu >= 7) return 'followedUp7to14Days';
  
  return 'notFollowedUp';
}

/**
 * [REFACTORED v4.6.0] Mengambil data tiket lokal.
 * Fungsi ini sekarang menggunakan helper _getSheetData untuk efisiensi.
 */
function getLocalTicketData(config) {
  const K = KONSTANTA.KUNCI_KONFIG;
  const namaSheetTiket = config[K.NAMA_SHEET_TIKET];
  if (!namaSheetTiket) throw new Error("Konfigurasi NAMA_SHEET_TIKET tidak ditemukan.");

  const { headers, dataRows } = _getSheetData(namaSheetTiket);

  if (dataRows.length === 0) {
    return { ticketData: [], headers: [] };
  }
  
  return { ticketData: dataRows, headers: headers };
}

function parseTicketId(url) {
  if (typeof url !== 'string' || !url) return 'N/A';
  const parts = url.split('/');
  return parts.pop() || 'N/A';
}

/**
 * [FINAL v1.2.9 - DEFINITIVE FIX] Mencari semua tiket aktif yang relevan.
 * Memperbaiki bug fatal di mana skrip mencari kunci konstanta, bukan nilainya.
 * @param {string} vmName - Nama VM yang sedang diperiksa dari sheet Data VM.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {Array} Array berisi objek tiket yang relevan.
 */
function findActiveTicketsByVmName(vmName, config) {
  const relevantTickets = [];
  if (!vmName) {
    return relevantTickets;
  }

  try {
    const { ticketData, headers } = getLocalTicketData(config);
    if (ticketData.length === 0) {
      return relevantTickets;
    }

    const K = KONSTANTA.KUNCI_KONFIG;
    
    // Mencari nilai dari konstanta di dalam objek config, bukan nama konstantanya.
    const nameIndex = headers.indexOf(config[K.HEADER_TIKET_NAMA_VM]);
    const statusIndex = headers.indexOf(config[K.HEADER_TIKET_STATUS]);
    const linkIndex = headers.indexOf(config[K.HEADER_TIKET_LINK]);
    
    if (nameIndex === -1 || statusIndex === -1 || linkIndex === -1) {
      // Sekarang kita bisa percaya pada warning ini jika muncul lagi.
      console.warn("Satu atau lebih header tiket penting tidak cocok antara sheet 'Tiket' dan 'Konfigurasi'.");
      return relevantTickets;
    }

    const searchedVmNameClean = vmName.toLowerCase().trim();

    ticketData.forEach(row => {
      // Menggunakan logika yang sudah kita sepakati: 'contains'
      const ticketVmNameClean = String(row[nameIndex] || '').toLowerCase().trim();
      
      if (ticketVmNameClean && ticketVmNameClean.includes(searchedVmNameClean)) {
        const ticketStatus = String(row[statusIndex] || '').toLowerCase().trim();
        const statusSelesai = (config[K.STATUS_TIKET_SELESAI] || []).map(s => s.toLowerCase());
        
        // Menggunakan logika status BUKAN 'done'
        if (ticketStatus && !statusSelesai.includes(ticketStatus)) {
          relevantTickets.push({
            id: parseTicketId(row[linkIndex] || ''),
            name: String(row[nameIndex]).trim(),
            status: String(row[statusIndex]).trim()
          });
        }
      }
    });

  } catch (e) {
    console.error(`Gagal mencari tiket terkait untuk VM "${vmName}". Error: ${e.message}`);
  }
  
  return relevantTickets;
}
