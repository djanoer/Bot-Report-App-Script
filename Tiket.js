// ===== FILE: Tiket.gs =====

// =================================================================
// FUNGSI UTAMA: PENGENDALI INTERAKSI TIKET (ROUTER)
// =================================================================

/**
 * Fungsi utama yang mengendalikan semua interaksi untuk fitur tiket "elegan".
 * @param {object} update - Objek update lengkap dari Telegram.
 * @param {object} config - Objek konfigurasi yang sudah dibaca.
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
  
  if (!isCallback) {
    const { text, keyboard } = generateSummaryView(config);
    kirimPesanTelegram(text, config, 'HTML', keyboard, chatId);
    return;
  }

  const P = KONSTANTA.CALLBACK_TIKET;

  if (callbackData === P.BACK_TO_SUMMARY) {
    const { text, keyboard } = generateSummaryView(config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }
  else if (callbackData.startsWith(P.VIEW_CATEGORY)) {
    const category = callbackData.replace(P.VIEW_CATEGORY, '');
    const { text, keyboard } = generateTicketListView(category, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }
  else if (callbackData.startsWith(P.VIEW_DETAIL)) {
    const ticketId = callbackData.replace(P.VIEW_DETAIL, '');
    const { text, keyboard } = generateDetailView(ticketId, config);
    editMessageText(text, keyboard, chatId, messageId, config);
  }
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
 * Membuat tampilan ringkasan utama dengan narasi profesional DAN jumlah pada tombol.
 * @param {object} config - Objek konfigurasi yang sudah dibaca.
 */
function generateSummaryView(config) {
  const { ticketData, headers } = getLocalTicketData(config);
  if (!ticketData || ticketData.length === 0) {
    return { text: "ℹ️ Tidak ada data tiket yang ditemukan.", keyboard: { inline_keyboard: [] }};
  }

  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);

  // Analisis data
  const statusCounts = {};
  // Filter tiket aktif (bukan "Done") untuk analisis usia
  const activeTickets = ticketData.filter(row => String(row[statusIndex] || '').toLowerCase() !== 'done');
  
  // Hitung semua status untuk ditampilkan di ikhtisar
  ticketData.forEach(row => {
    const status = String(row[statusIndex] || 'Tanpa Status').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  // Gunakan logika pengkategorian yang sudah andal pada tiket aktif
  const ageCategories = categorizeTicketAgeWithNewRules(activeTickets, statusIndex, fuDateIndex);

  // Format tanggal yang lebih kaya
  const timestamp = new Date().toLocaleString('id-ID', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  // Membangun Teks Laporan
  let text = `<b>📊 Monitoring & Analisis Tiket Utilisasi</b>\n`;
  text += `<i>Diperbarui pada: ${timestamp}</i>\n`;
  text += `--------------------------------------------------\n\n`;
  text += `<b>Ikhtisar Status Tiket</b>\n`;
  for (const status in statusCounts) {
    text += `• ${escapeHtml(status)}: <b>${statusCounts[status]}</b>\n`;
  }
  text += `• <b>Total Keseluruhan: ${ticketData.length} tiket</b>\n\n`;
  text += `--------------------------------------------------\n\n`;
  text += `<b>Analisis Usia Tindak Lanjut (Tiket Aktif)</b>\n`;
  text += `Silakan pilih kategori di bawah untuk inspeksi lebih lanjut:`;

  // --- PERBAIKAN UTAMA ADA DI SINI ---
  // Membangun keyboard dengan jumlah di setiap tombol
  const P = KONSTANTA.CALLBACK_TIKET;
  const keyboard = {
    inline_keyboard: [
      [{ text: `Belum Ditindaklanjuti (Status "Open") (${ageCategories.notFollowedUp.length})`, callback_data: P.VIEW_CATEGORY + 'notFollowedUp' }],
      [{ text: `Tindak Lanjut 7-14 Hari (${ageCategories.followedUp7to14Days.length})`, callback_data: P.VIEW_CATEGORY + 'followedUp7to14Days' }],
      [{ text: `Tindak Lanjut 14-28 Hari (${ageCategories.followedUp14to28Days.length})`, callback_data: P.VIEW_CATEGORY + 'followedUp14to28Days' }],
      [{ text: `Tindak Lanjut > 1 Bulan (${ageCategories.followedUpOver1Month.length})`, callback_data: P.VIEW_CATEGORY + 'followedUpOver1Month' }]
    ]
  };
  return { text, keyboard };
}

/**
 * Membuat tampilan daftar tiket (Laporan 2).
 */
function generateTicketListView(category, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
  const devOpsIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.DEV_OPS);
  const categoryIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.KATEGORI);
  const linkIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.LINK_TIKET);
  
  const ageCategories = categorizeTicketAgeWithNewRules(ticketData, statusIndex, fuDateIndex);
  
  const ticketsToShow = ageCategories[category];

  const categoryTitles = {
    notFollowedUp: 'Belum di Follow up (Status "Open")',
    followedUp7to14Days: '7-14 Hari Lalu',
    followedUp14to28Days: '14-28 Hari Lalu',
    followedUpOver1Month: '> 1 Bulan Lalu'
  };

  let text = `<b>📜 Daftar Tiket (${categoryTitles[category]})</b>\n\n`;
  const keyboardRows = [];
  
  if (!ticketsToShow || ticketsToShow.length === 0) {
    text += "<i>Tidak ada tiket dalam kategori ini.</i>";
  } else {
    ticketsToShow.forEach((row, i) => {
      const ticketUrl = row[linkIndex] || '#'; // Ambil URL lengkap tiket
      const ticketId = parseTicketId(ticketUrl); // Dapatkan ID tiket untuk teks link
      const ticketCategory = row[categoryIndex] || 'N/A';
      const ticketDevOps = row[devOpsIndex] || 'N/A';
      const ticketStatus = row[statusIndex] || 'N/A';
      
      // === PERUBAHAN PENTING DI SINI ===
      // ID tiket sekarang menjadi hyperlink menggunakan tag <a> HTML
      text += `${i + 1}. <a href="${ticketUrl}"><b>${ticketId}</b></a>, ${escapeHtml(ticketCategory)}, ${escapeHtml(ticketDevOps)}, ${escapeHtml(ticketStatus)}\n`;
      
      keyboardRows.push([{ text: `Lihat Keterangan untuk ${ticketId}`, callback_data: KONSTANTA.CALLBACK_TIKET.VIEW_DETAIL + ticketId }]);
    });
  }

  keyboardRows.push([{ text: '⬅️ Kembali ke Ringkasan', callback_data: KONSTANTA.CALLBACK_TIKET.BACK_TO_SUMMARY }]);
  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * [DIPERBARUI] Membuat tampilan detail tiket dengan mengambil dari kolom Keterangan.
 */
function generateDetailView(ticketId, config) {
  const { ticketData, headers } = getLocalTicketData(config);
  const linkIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.LINK_TIKET);
  // === PERUBAHAN DI SINI: Menggunakan kolom KETERANGAN ===
  const keteranganIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.KETERANGAN);
  
  const ticketRow = ticketData.find(row => parseTicketId(row[linkIndex] || '') === ticketId);
  
  let text = `<b>💬 Keterangan untuk Tiket: ${ticketId}</b>\n\n`;
  
  if (ticketRow) {
    // === PERUBAHAN DI SINI: Mengambil data dari keteranganIndex ===
    const keterangan = keteranganIndex !== -1 ? ticketRow[keteranganIndex] : "Kolom Keterangan tidak ditemukan.";
    text += keterangan || "<i>Tidak ada keterangan yang tersedia.</i>";
  } else {
    text += "<i>Detail untuk tiket ini tidak dapat ditemukan.</i>";
  }

  const statusIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.STATUS);
  const fuDateIndex = headers.indexOf(KONSTANTA.HEADER_TIKET.TGL_FU);
  const originalCategory = findTicketCategoryWithNewRules(ticketRow, statusIndex, fuDateIndex);

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
 * [DIPERBARUI] Mengelompokkan tiket dengan aturan baru untuk "Belum di Follow up".
 */
function categorizeTicketAgeWithNewRules(allTickets, statusIndex, fuDateIndex) {
  const categories = {
    notFollowedUp: [],
    followedUp7to14Days: [],
    followedUp14to28Days: [],
    followedUpOver1Month: []
  };
  const now = new Date();

  allTickets.forEach(row => {
    const status = String(row[statusIndex] || '').toLowerCase();

    // === PERUBAHAN LOGIKA DI SINI ===
    // 1. Jika status adalah "open tiket", langsung masukkan ke kategori notFollowedUp.
    if (status === 'open tiket') {
      categories.notFollowedUp.push(row);
      return; // Lanjutkan ke tiket berikutnya
    }

    // 2. Jika status BUKAN "done", baru proses tanggalnya.
    if (status !== 'done') {
      const fuDateValue = row[fuDateIndex];
      if (fuDateValue) {
        const fuDate = new Date(fuDateValue);
        if (!isNaN(fuDate.getTime())) {
          const daysSinceFu = Math.floor((now - fuDate) / (1000 * 60 * 60 * 24));
          if (daysSinceFu > 30) {
            categories.followedUpOver1Month.push(row);
          } else if (daysSinceFu > 14 && daysSinceFu <= 28) {
            categories.followedUp14to28Days.push(row);
          } else if (daysSinceFu > 7 && daysSinceFu <= 14) {
            categories.followedUp7to14Days.push(row);
          }
        }
      }
    }
  });
  return categories;
}

/**
 * [DIPERBARUI] Mencari kategori asal tiket dengan aturan baru.
 */
function findTicketCategoryWithNewRules(ticketRow, statusIndex, fuDateIndex) {
  if (!ticketRow) return 'notFollowedUp'; // Fallback
  
  const status = String(ticketRow[statusIndex] || '').toLowerCase();
  if (status === 'open tiket') return 'notFollowedUp';
  if (status === 'done') return 'notFollowedUp'; // Fallback jika tiket "done" каким-то образом попадает сюда

  const fuDateValue = ticketRow[fuDateIndex];
  if (!fuDateValue) return 'notFollowedUp'; // Default jika tidak ada tanggal

  const fuDate = new Date(fuDateValue);
  if (isNaN(fuDate.getTime())) return 'notFollowedUp';

  const daysSinceFu = Math.floor((new Date() - fuDate) / (1000 * 60 * 60 * 24));
  if (daysSinceFu > 30) return 'followedUpOver1Month';
  if (daysSinceFu > 14 && daysSinceFu <= 28) return 'followedUp14to28Days';
  if (daysSinceFu > 7 && daysSinceFu <= 14) return 'followedUp7to14Days';
  
  return 'notFollowedUp';
}

/**
 * Membaca data tiket dari sheet lokal. (Tidak Berubah)
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
 * Mengekstrak ID tiket dari URL. (Tidak Berubah)
 */
function parseTicketId(url) {
  if (typeof url !== 'string' || !url) return 'N/A';
  const parts = url.split('/');
  return parts.pop() || 'N/A';
}