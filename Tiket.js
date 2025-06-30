// ===== FILE: Tiket.gs =====

/**
 * [VERSI FINAL LENGKAP]
 * Membuat laporan komprehensif dengan filter "not Done" pada analisis usia follow-up.
 * @param {object} config - Objek konfigurasi yang sudah dibaca.
 * @returns {string} - String berisi teks laporan final.
 */
function generateFinalTicketReportText(config) {
  console.log("Membuat laporan tiket final dengan filter 'not Done'...");
  const { ticketData, headers } = getLocalTicketData(config);

  if (!ticketData || ticketData.length === 0) {
    return "ℹ️ Tidak ada data tiket yang ditemukan untuk dibuat laporan.";
  }

  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
  if (statusIndex === -1 || fuDateIndex === -1) {
    return "❌ Gagal: Kolom 'Status Tiket' atau 'Tanggal FU ke User' tidak ditemukan.";
  }

  // Siapkan semua variabel yang akan kita hitung
  const statusCounts = {};
  let grandTotalStatus = 0;
  let notFollowedUpCount = 0;
  let followedUp7to14Days = 0;
  let followedUp14to28Days = 0;
  let followedUpOver1Month = 0;
  const now = new Date();

  // Iterasi melalui semua data tiket untuk melakukan perhitungan
  ticketData.forEach(row => {
    // 1. Hitung Status Tiket (ini dilakukan untuk semua tiket)
    const status = String(row[statusIndex] || 'Tanpa Status').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    
    // === LOGIKA FILTER BARU DI SINI ===
    // 2. Hanya lakukan analisis usia follow-up jika status tiket BUKAN "Done"
    if (status.toLowerCase() !== 'done') {
      const fuDateValue = row[fuDateIndex];
      if (!fuDateValue) {
        // Jika tanggal kosong, hitung sebagai 'Belum di Follow up'
        notFollowedUpCount++;
      } else {
        const fuDate = new Date(fuDateValue);
        if (!isNaN(fuDate.getTime())) {
          const daysSinceFu = Math.floor((now - fuDate) / (1000 * 60 * 60 * 24));
          
          if (daysSinceFu > 7 && daysSinceFu <= 14) {
            followedUp7to14Days++;
          } else if (daysSinceFu > 14 && daysSinceFu <= 28) {
            followedUp14to28Days++;
          } else if (daysSinceFu > 30) {
            followedUpOver1Month++;
          }
        }
      }
    }
  });

  // Hitung Grand Total dari status
  for (const status in statusCounts) {
    grandTotalStatus += statusCounts[status];
  }
  console.log("Semua perhitungan dengan filter 'not Done' selesai.");

  // Bangun teks laporan final
  let text = `<b>📊 Laporan Monitoring Tiket Utilisasi</b>\n`;
  text += `<i>Data per: ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>\n`;
  text += `--------------------------------------------------\n\n`;
  text += `<b>Ringkasan Status Tiket:</b>\n`;
  for (const status in statusCounts) {
    text += `• ${escapeHtml(status)}: <b>${statusCounts[status]} tiket</b>\n`;
  }
  text += `• <b>Grand Total: ${grandTotalStatus} tiket</b>\n`;
  text += `\n--------------------------------------------------\n\n`;
  text += `<b>Analisis Usia Follow-up (Status Bukan "Done"):</b>\n`; // Judul diperjelas
  text += `• Belum di Follow up: <b>${notFollowedUpCount} tiket</b>\n`;
  text += `• Di-follow Up 7-14 Hari Lalu: <b>${followedUp7to14Days} tiket</b>\n`;
  text += `• Di-follow Up 14-28 Hari Lalu: <b>${followedUp14to28Days} tiket</b>\n`;
  text += `• Di-follow Up > 1 Bulan Lalu: <b>${followedUpOver1Month} tiket</b>\n`;

  console.log("Teks laporan final berhasil dibuat.");
  return text;
}

/**
 * Membuat laporan yang hanya berisi ringkasan status tiket.
 * @param {object} config - Objek konfigurasi yang sudah dibaca.
 * @returns {string} - String berisi teks laporan status.
 */
function generateTicketStatusOnlyReport(config) {
  console.log("Membuat laporan 'hanya status'...");
  const { ticketData, headers } = getLocalTicketData(config);

  // Validasi data
  if (!ticketData || ticketData.length === 0) {
    console.log("Validasi gagal: Tidak ada data tiket ditemukan.");
    return "ℹ️ Tidak ada data tiket yang ditemukan untuk dibuat laporan.";
  }
  console.log(`Ditemukan ${ticketData.length} baris data tiket untuk dihitung statusnya.`);

  // Dapatkan indeks kolom status
  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  if (statusIndex === -1) {
    console.error("Kolom status tidak ditemukan di header.");
    return "❌ Gagal membuat laporan: Kolom status tidak ditemukan di header sheet tiket.";
  }

  // Objek untuk menyimpan hitungan setiap status
  const statusCounts = {};

  // Mulai hitung jumlah tiket untuk setiap status
  ticketData.forEach(row => {
    const status = String(row[statusIndex] || 'Tanpa Status').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  console.log("Penghitungan status selesai.");

  // Bangun teks laporan
  let text = `<b>📊 Laporan Monitoring Tiket Utilisasi</b>\n`;
  text += `<i>Data per: ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>\n\n`;
  text += `--------------------------------------------------\n`;
  text += `<i>Total Tiket Saat Ini: <b>${ticketData.length} tiket</b></i>\n`; // Menambahkan total tiket
  text += `--------------------------------------------------\n\n`;
  text += `<b>Ringkasan Status Tiket:</b>\n`;

  // Tambahkan hasil hitungan ke teks laporan
  for (const status in statusCounts) {
    text += `• ${status}: <b>${statusCounts[status]} tiket</b>\n`;
  }
  
  console.log("Teks laporan 'hanya status' berhasil dibuat.");
  return text;
}

function generateFullTicketReportText(config) {
  try {
    const { ticketData, headers } = getLocalTicketData(config);

    if (!ticketData || ticketData.length === 0) {
      return "ℹ️ Tidak ada data tiket yang ditemukan untuk dibuat laporan.";
    }

    const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
    const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);

    const statusCounts = {};
    const activeTickets = [];
    const statusAktif = config[KONSTANTA.KUNCI_KONFIG.STATUS_TIKET_AKTIF] || [];

    ticketData.forEach(row => {
      const status = String(row[statusIndex] || 'Tanpa Status').trim();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (statusAktif.includes(status.toLowerCase())) {
        activeTickets.push(row);
      }
    });

    const ageCategories = categorizeTicketAge(activeTickets, fuDateIndex);

    let text = `<b>📊 Laporan Monitoring Tiket Utilisasi</b>\n`;
    text += `<i>Data per: ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>\n`;
    text += `<i>Total Tiket Saat Ini: ${ticketData.length} tiket</i>\n`;
    text += `--------------------------------------------------\n\n`;
    text += `<b>Ringkasan Status Tiket:</b>\n`;
    for (const status in statusCounts) {
      // === PERUBAHAN PENTING DI SINI ===
      // Kita menggunakan escapeHtml() untuk mengamankan nama status
      text += `• ${escapeHtml(status)}: <b>${statusCounts[status]} tiket</b>\n`;
    }
    text += `\n--------------------------------------------------\n\n`;
    text += `<b>Analisis Usia Follow-up (untuk ${activeTickets.length} tiket aktif):</b>\n`;
    text += `• > 1 Bulan:         <b>${ageCategories.gt1Month.length} tiket</b>\n`;
    text += `• > 2 - 4 Minggu:  <b>${ageCategories.gt2lt4Weeks.length} tiket</b>\n`;
    text += `• > 1 - 2 Minggu:  <b>${ageCategories.gt1lt2Weeks.length} tiket</b>\n`;
    text += `• < 1 Minggu:      <b>${ageCategories.lt1Week.length} tiket</b>\n\n`;
    text += `<i>Untuk detail lebih lanjut, silakan akses spreadsheet sumber.</i>`;
    
    return text;

  } catch (e) {
    console.error(`ERROR DI DALAM generateFullTicketReportText: ${e.message}\nStack: ${e.stack}`);
    return `❌ Terjadi error internal saat memproses data laporan.\n\n<b>Detail:</b>\n<code>${escapeHtml(e.message)}</code>`;
  }
}

// =================================================================
// FUNGSI UTAMA: PENGENDALI INTERAKSI TIKET
// =================================================================

/**
 * Fungsi utama yang mengendalikan semua interaksi untuk fitur tiket.
 * Dipanggil saat pengguna menjalankan /cektiket atau menekan tombol tiket.
 * @param {object} update - Objek update lengkap dari Telegram (dari doPost).
 */
function handleTicketInteraction(update, config) {
  const isCallback = !!update.callback_query;

  let chatId, messageId, callbackData;

  if (isCallback) {
    chatId = update.callback_query.message.chat.id;
    messageId = update.callback_query.message.message_id;
    callbackData = update.callback_query.data;
  } else {
    chatId = update.message.chat.id;
  }
  
  // -- Alur 1: Pengguna baru memulai dengan /cektiket --
  if (!isCallback) {
    const { text, keyboard } = generateSummaryView(config);
    kirimPesanTelegram(text, config, 'HTML', keyboard, chatId);
    return;
  }

  // -- Alur 2: Pengguna menekan tombol (Callback) --
  const P = KONSTANTA.CALLBACK_TIKET; // Alias untuk konstanta

  // Navigasi Kembali ke Ringkasan Utama
  if (callbackData === P.BACK_TO_SUMMARY) {
    const { text, keyboard } = generateSummaryView(config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }
  
  // Melihat Daftar Tiket berdasarkan Kategori Usia
  else if (callbackData.startsWith(P.VIEW_CATEGORY)) {
    const category = callbackData.replace(P.VIEW_CATEGORY, '');
    const { text, keyboard } = generateTicketListView(category, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }

  // Melihat Detail Keterangan Tiket
  else if (callbackData.startsWith(P.VIEW_DETAIL)) {
    const ticketId = callbackData.replace(P.VIEW_DETAIL, '');
    const { text, keyboard } = generateDetailView(ticketId, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }

  // Navigasi Kembali ke Daftar Tiket dari Detail
  else if (callbackData.startsWith(P.BACK_TO_LIST)) {
    const category = callbackData.replace(P.BACK_TO_LIST, '');
    const { text, keyboard } = generateTicketListView(category, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }
}


// =================================================================
// FUNGSI PEMBUAT TAMPILAN (VIEW GENERATORS)
// =================================================================

/**
 * Membuat tampilan ringkasan utama (Laporan 1).
 */
/**
 * [DIPERBARUI]
 * Membuat tampilan ringkasan utama (Laporan 1).
 * Menambahkan validasi untuk memeriksa apakah ada data tiket sebelum membuat laporan.
 */
// ===== FILE: Tiket.js =====

/**
 * [VERSI DEBUGGING]
 * Membuat tampilan ringkasan utama dengan 'console.log' di setiap langkah
 * untuk melacak di mana prosesnya gagal.
 */
function generateSummaryView(config) {
  try {
    console.log("Memulai generateSummaryView...");
    const { ticketData, headers } = getLocalTicketData(config);

    if (!ticketData || ticketData.length === 0) {
      console.log("Validasi gagal: Tidak ada data tiket ditemukan.");
      const text = "<b>📊 Laporan Monitoring Tiket Utilisasi</b>\n\n❌ Tidak ada data tiket yang ditemukan.";
      const keyboard = { inline_keyboard: [[{ text: 'Tutup', callback_data: 'ignore' }]] };
      return { text, keyboard };
    }
    console.log(`Validasi berhasil: Ditemukan ${ticketData.length} baris data tiket.`);

    const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
    const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
    console.log(`Indeks kolom ditemukan: STATUS di ${statusIndex}, TGL_FU di ${fuDateIndex}.`);

    const statusCounts = {};
    const activeTickets = [];
    const statusAktif = config[KONSTANTA.KUNCI_KONFIG.STATUS_TIKET_AKTIF] || [];
    console.log(`Memulai analisis data dengan status aktif: [${statusAktif.join(", ")}]`);

    ticketData.forEach(row => {
      const status = String(row[statusIndex] || 'Tanpa Status').trim();
      statusCounts[status] = (statusCounts[status] || 0) + 1;
      if (statusAktif.includes(status.toLowerCase())) {
        activeTickets.push(row);
      }
    });
    console.log(`Analisis status selesai. Total tiket aktif ditemukan: ${activeTickets.length}`);

    const ageCategories = categorizeTicketAge(activeTickets, fuDateIndex);
    console.log("Pengelompokan usia tiket selesai.");
    console.log(JSON.stringify(ageCategories, (key, value) => (key === '' ? value.length : value), 2)); // Log jumlah di setiap kategori

    console.log("Mulai merangkai teks laporan...");
    let text = `<b>📊 Laporan Monitoring Tiket Utilisasi</b>\n`;
    text += `<i>Data per: ${new Date().toLocaleString('id-ID', {timeZone: "Asia/Jakarta"})}</i>\n`;
    text += `--------------------------------------------------\n\n`;
    text += `<b>Ringkasan Status Tiket:</b>\n`;
    for (const status in statusCounts) {
      text += `• ${status}: <b>${statusCounts[status]} tiket</b>\n`;
    }
    text += `\n--------------------------------------------------\n\n`;
    text += `<b>Analisis Usia Follow-up (untuk ${activeTickets.length} tiket aktif):</b>\n`;
    text += `• > 1 Bulan:         <b>${ageCategories.gt1Month.length} tiket</b>\n`;
    text += `• > 2 - 4 Minggu:  <b>${ageCategories.gt2lt4Weeks.length} tiket</b>\n`;
    text += `• > 1 - 2 Minggu:  <b>${ageCategories.gt1lt2Weeks.length} tiket</b>\n`;
    text += `• < 1 Minggu:      <b>${ageCategories.lt1Week.length} tiket</b>\n\n`;
    text += `Pilih kategori untuk melihat detail tiket:`;
    console.log("Teks laporan berhasil dirangkai.");

    console.log("Mulai merangkai keyboard...");
    const P = KONSTANTA.CALLBACK_TIKET;
    const keyboard = {
      inline_keyboard: [
        [
          { text: `> 1 Bln (${ageCategories.gt1Month.length})`, callback_data: P.VIEW_CATEGORY + 'gt1Month' },
          { text: `> 2-4 Mg (${ageCategories.gt2lt4Weeks.length})`, callback_data: P.VIEW_CATEGORY + 'gt2lt4Weeks' }
        ],
        [
          { text: `> 1-2 Mg (${ageCategories.gt1lt2Weeks.length})`, callback_data: P.VIEW_CATEGORY + 'gt1lt2Weeks' },
          { text: `< 1 Mg (${ageCategories.lt1Week.length})`, callback_data: P.VIEW_CATEGORY + 'lt1Week' }
        ]
      ]
    };
    console.log("Keyboard berhasil dirangkai.");
    
    return { text, keyboard };
  } catch (e) {
    // Tangkap error spesifik dari dalam fungsi ini
    console.error(`ERROR DI DALAM generateSummaryView: ${e.message}\nStack: ${e.stack}`);
    // Kembalikan pesan error yang jelas untuk dikirim ke pengguna
    return { 
      text: `❌ Terjadi error saat memproses data laporan tiket.\n\n<b>Detail:</b>\n<code>${e.message}</code>`,
      keyboard: { inline_keyboard: [[{ text: 'Tutup', callback_data: 'ignore' }]] }
    };
  }
}

/**
 * [DIPERBARUI]
 * Membuat tampilan daftar tiket per kategori (Laporan 2).
 * Daftar status aktif sekarang juga diambil dari Konfigurasi agar konsisten.
 */
function generateTicketListView(category, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const devOpsIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.DEV_OPS);
  const categoryIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.KATEGORI);
  const linkIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.LINK_TIKET);
  
  // === PERUBAHAN DI SINI ===
  // Menggunakan daftar status aktif dari Konfigurasi, sama seperti di generateSummaryView.
  const statusAktif = config[KONSTANTA.KUNCI_KONFIG.STATUS_TIKET_AKTIF] || [];
  const activeTickets = ticketData.filter(row => {
    const status = String(row[statusIndex] || '').toLowerCase();
    return statusAktif.includes(status);
  });
  
  const ageCategories = categorizeTicketAge(activeTickets, fuDateIndex);
  const ticketsToShow = ageCategories[category];

  const categoryTitles = {
    gt1Month: '> 1 Bulan',
    gt2lt4Weeks: '> 2 - 4 Minggu',
    gt1lt2Weeks: '> 1 - 2 Minggu',
    lt1Week: '< 1 Minggu'
  };

  let text = `<b>📜 Daftar Tiket (Belum Follow-up ${categoryTitles[category]})</b>\n\n`;
  const keyboardRows = [];
  
  if (ticketsToShow.length === 0) {
    text += "<i>Tidak ada tiket dalam kategori ini.</i>";
  } else {
    ticketsToShow.forEach((row, i) => {
      const ticketId = parseTicketId(row[linkIndex] || '');
      const ticketCategory = row[categoryIndex] || 'N/A';
      const ticketDevOps = row[devOpsIndex] || 'N/A';
      const ticketStatus = row[statusIndex] || 'N/A';
      
      text += `${i + 1}. <b>${ticketId}</b>, ${ticketCategory}, ${ticketDevOps}, ${ticketStatus}\n`;
      keyboardRows.push([{ text: `Lihat Keterangan untuk ${ticketId}`, callback_data: KONSTANTA.CALLBACK_TIKET.VIEW_DETAIL + ticketId }]);
    });
  }

  // Tombol kembali
  keyboardRows.push([{ text: '⬅️ Kembali ke Ringkasan', callback_data: KONSTANTA.CALLBACK_TIKET.BACK_TO_SUMMARY }]);
  
  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * Membuat tampilan detail keterangan tiket (Laporan 3).
 */
function generateDetailView(ticketId, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const linkIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.LINK_TIKET);
  const actionIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.ACTION);
  
  const ticketRow = ticketData.find(row => parseTicketId(row[linkIndex] || '') === ticketId);
  
  let text = `<b>💬 Keterangan untuk Tiket: ${ticketId}</b>\n\n`;
  
  if (ticketRow) {
    text += ticketRow[actionIndex] || "<i>Tidak ada keterangan yang tersedia.</i>";
  } else {
    text += "<i>Detail untuk tiket ini tidak dapat ditemukan.</i>";
  }

  // Cari kategori asal untuk tombol kembali yang cerdas
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
  const originalCategory = findTicketCategory(ticketRow, fuDateIndex);

  const keyboard = {
    inline_keyboard: [
      [{ text: '⬅️ Kembali ke Daftar', callback_data: KONSTANTA.CALLBACK_TIKET.BACK_TO_LIST + originalCategory }]
    ]
  };
  
  return { text, keyboard };
}


// =================================================================
// FUNGSI PEMBANTU (HELPER FUNCTIONS)
// =================================================================

/**
 * Membaca data tiket dari sheet lokal di spreadsheet bot.
 */
function getLocalTicketData(config) {
  const namaSheetTiket = config[KONSTANTA.KUNCI_KONFIG.NAMA_SHEET_TIKET];
  if (!namaSheetTiket) throw new Error("Konfigurasi NAMA_SHEET_TIKET tidak ditemukan.");

  const ssBot = SpreadsheetApp.getActiveSpreadsheet();
  const sheetTiket = ssBot.getSheetByName(namaSheetTiket);
  if (!sheetTiket || sheetTiket.getLastRow() <= 1) return { ticketData: [], headers: [] };
  
  const headers = sheetTiket.getRange(1, 1, 1, sheetTiket.getLastColumn()).getValues()[0];
  const ticketData = sheetTiket.getRange(2, 1, sheetTiket.getLastRow() - 1, sheetTiket.getLastColumn()).getValues();
  return { ticketData, headers };
}

// ===== FILE: Tiket.js =====

function categorizeTicketAge(tickets, fuDateIndex) {
  const categories = { gt1Month: [], gt2lt4Weeks: [], gt1lt2Weeks: [], lt1Week: [] };
  const now = new Date();
  
  tickets.forEach(row => {
    const fuDateValue = row[fuDateIndex];
    if (!fuDateValue) return;
    const fuDate = new Date(fuDateValue);
    if (isNaN(fuDate.getTime())) return;

    const daysSinceFu = Math.floor((now - fuDate) / (1000 * 60 * 60 * 24));
    if (daysSinceFu > 30) categories.gt1Month.push(row);
    else if (daysSinceFu > 14) categories.gt2lt4Weeks.push(row);
    else if (daysSinceFu > 7) categories.gt1lt2Weeks.push(row);
    else if (daysSinceFu >= 0) categories.lt1Week.push(row);
  });
  return categories;
}

/**
 * Mencari kategori usia asal dari sebuah tiket untuk tombol kembali yang cerdas.
 */
function findTicketCategory(ticketRow, fuDateIndex) {
  const now = new Date();
  if (!ticketRow) return 'gt1Month'; // Fallback jika tiket tidak ditemukan
  const fuDate = ticketRow[fuDateIndex] ? new Date(ticketRow[fuDateIndex]) : null;
  const daysSinceFu = fuDate ? Math.floor((now - fuDate) / (1000 * 60 * 60 * 24)) : Infinity;

  if (daysSinceFu > 30) return 'gt1Month';
  if (daysSinceFu > 14) return 'gt2lt4Weeks';
  if (daysSinceFu > 7) return 'gt1lt2Weeks';
  return 'lt1Week';
}

/**
 * Mengekstrak ID tiket dari URL JIRA.
 */
function parseTicketId(url) {
  if (typeof url !== 'string' || !url) return 'N/A';
  const parts = url.split('/');
  return parts.pop() || 'N/A';
}