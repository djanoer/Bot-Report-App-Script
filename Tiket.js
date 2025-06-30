// ===== FILE: Tiket.gs =====

// =================================================================
// FUNGSI UTAMA: PENGENDALI INTERAKSI TIKET
// =================================================================

/**
 * Fungsi utama yang mengendalikan semua interaksi untuk fitur tiket.
 * Dipanggil saat pengguna menjalankan /cektiket atau menekan tombol tiket.
 * @param {object} update - Objek update lengkap dari Telegram (dari doPost).
 */
function handleTicketInteraction(update) {
  const config = bacaKonfigurasi();
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
function generateSummaryView(config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);

  // Analisis data
  const statusCounts = {};
  const activeTickets = [];
  const statusAktif = ["open", "review by owner", "apply solution by owner"];

  ticketData.forEach(row => {
    const status = String(row[statusIndex] || 'Tanpa Status').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (statusAktif.includes(status.toLowerCase())) {
      activeTickets.push(row);
    }
  });

  const ageCategories = categorizeTicketAge(activeTickets, fuDateIndex);

  // Bangun teks laporan
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

  // Bangun keyboard
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
  return { text, keyboard };
}

/**
 * Membuat tampilan daftar tiket per kategori (Laporan 2).
 */
function generateTicketListView(category, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const devOpsIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.DEV_OPS);
  const categoryIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.KATEGORI);
  const linkIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.LINK_TIKET);
  
  const statusAktif = ["open", "review by owner", "apply solution by owner"];
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

/**
 * Mengelompokkan tiket ke dalam kategori usia berdasarkan tanggal follow-up.
 */
function categorizeTicketAge(tickets, fuDateIndex) {
  const categories = {
    gt1Month: [],
    gt2lt4Weeks: [],
    gt1lt2Weeks: [],
    lt1Week: []
  };
  const now = new Date();
  
  tickets.forEach(row => {
    const fuDate = row[fuDateIndex] ? new Date(row[fuDateIndex]) : null;
    const daysSinceFu = fuDate ? Math.floor((now - fuDate) / (1000 * 60 * 60 * 24)) : Infinity;

    if (daysSinceFu > 30) categories.gt1Month.push(row);
    else if (daysSinceFu > 14) categories.gt2lt4Weeks.push(row);
    else if (daysSinceFu > 7) categories.gt1lt2Weeks.push(row);
    else categories.lt1Week.push(row);
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