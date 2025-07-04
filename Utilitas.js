// ===== FILE: Utilitas.gs =====

function escapeHtml(text) {
  if (typeof text !== 'string') text = String(text);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * [PERBAIKAN FINAL] Membuat "sidik jari" (hash) dari sebuah objek data VM.
 * Fungsi ini sekarang tidak lagi memiliki aturan hardcoded untuk mengabaikan 'Uptime'.
 * Perilakunya sekarang 100% dikontrol oleh daftar KOLOM_YANG_DIPANTAU.
 */
function computeVmHash(vmObject) {
  if (!vmObject) return ''; 
  
  // Tidak ada lagi penghapusan kunci 'Uptime' secara paksa.
  // Objek sekarang digunakan apa adanya sesuai dengan yang dibuat oleh processDataChanges.
  const objectForHashing = { ...vmObject };
  
  const sortedKeys = Object.keys(objectForHashing).sort();
  
  const dataString = sortedKeys.map(key => {
      const value = objectForHashing[key];
      // Jika nilai adalah string literal "#N/A", perlakukan seperti sel kosong.
      return (String(value || '').trim() === '#N/A') ? '' : value; 
  }).join('||');
  
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataString);
  
  return digest.map(byte => (byte + 0x100).toString(16).substring(1)).join('');
}

/**
 * [FUNGSI HELPER BARU] Mengekstrak informasi dari nama datastore.
 * @param {string} dsName - Nama datastore yang akan di-parse.
 * @param {Map} migrationConfig - Objek konfigurasi dari sheet Logika Migrasi.
 * @returns {object} Objek berisi { cluster: '...', type: '...' }.
 */
function getDsInfo(dsName, migrationConfig) {
  if (typeof dsName !== 'string') return { cluster: null, type: null };

  const clusterMatch = dsName.match(/(CL\d+)/i);
  const cluster = clusterMatch ? clusterMatch[1].toUpperCase() : null;

  let type = null;
  const knownTypes = Array.from(migrationConfig.keys()).sort((a, b) => b.length - a.length);
  
  for (const knownType of knownTypes) {
    if (dsName.includes(knownType)) {
      const rule = migrationConfig.get(knownType);
      type = rule.alias || knownType;
      break;
    }
  }

  return { cluster: cluster, type: type };
}

/**
 * [FUNGSI HELPER BARU] Menampilkan alert di UI jika tersedia, jika tidak catat di log.
 */
function showUiFeedback(title, message) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(title, message, ui.ButtonSet.OK);
  } catch (e) {
    console.log(`UI Feedback (Alert Skipped): ${title} - ${message}`);
  }
}

/**
 * [DIROMBAK] Mengekstrak lingkungan dari nama Datastore berdasarkan kamus di Konfigurasi.
 * @param {string} dsName Nama datastore.
 * @param {object} environmentMap Objek pemetaan dari Konfigurasi.
 * @returns {string|null} Nama lingkungan atau null.
 */
function getEnvironmentFromDsName(dsName, environmentMap) {
  if (typeof dsName !== 'string' || !environmentMap) return null;

  // Urutkan kunci dari yang paling panjang agar tidak salah cocok (misal: 'LNV' vs '108LNV')
  const keywords = Object.keys(environmentMap).sort((a, b) => b.length - a.length);

  for (const keyword of keywords) {
    if (dsName.includes(keyword)) {
      return environmentMap[keyword]; // Kembalikan nama environment resmi
    }
  }
  
  return null; // Bukan environment khusus
}

/**
 * Menghapus sufiks lokasi dari Primary Key untuk perbandingan yang konsisten.
 * Contoh: "VM-001-VC01" menjadi "VM-001".
 * @param {string} pk - Primary Key lengkap yang mungkin mengandung sufiks.
 * @returns {string} Primary Key yang sudah bersih tanpa sufiks lokasi.
 */
function normalizePrimaryKey(pk) {
  if (typeof pk !== 'string' || !pk) return '';
  // Menghapus '-VC' diikuti oleh angka di akhir string.
  // Pola ini fleksibel untuk menangani -VC01, -VC02, -VC10, dst.
  return pk.replace(/-VC\d+$/i, '').trim();
}

/**
 * [MODIFIKASI DEBUGGING] Penanganan Error Terpusat.
 * Versi ini dimodifikasi untuk menampilkan pesan error teknis asli di Telegram,
 * membantu kita menemukan akar masalah yang sebenarnya.
 */
function handleCentralizedError(errorObject, context, config) {
  // 1. Catat log teknis yang detail untuk developer (tidak berubah)
  const errorMessageTechnical = `[ERROR di ${context}] ${errorObject.message}\nStack: ${errorObject.stack || 'Tidak tersedia'}`;
  console.error(errorMessageTechnical);

  // 2. Kirim pesan yang lebih detail ke pengguna untuk debugging
  if (config) {
    let userFriendlyMessage = `🔴 Maaf, terjadi kesalahan saat memproses permintaan Anda.\n\n`;
    userFriendlyMessage += `<b>Konteks:</b> ${context}\n`;
    // [MODIFIKASI PENTING] Tambahkan pesan error asli ke notifikasi
    userFriendlyMessage += `<b>Detail Error Teknis:</b>\n<pre>${escapeHtml(errorObject.message)}</pre>`;
    
    kirimPesanTelegram(userFriendlyMessage, config, 'HTML');
  }
}

/**
 * [FINAL DENGAN FIX DESKTOP]
 * Membuat tampilan berhalaman (pesan teks dan keyboard) untuk data apa pun secara generik.
 * Fungsi ini mengotomatiskan pembuatan tombol navigasi dan tombol aksi seperti "Ekspor".
 *
 * @param {object} options - Objek berisi parameter untuk pagination.
 * @param {Array<Array<any>>} options.allItems - Array dari semua item/baris data yang akan ditampilkan.
 * @param {number} options.page - Halaman saat ini yang diminta.
 * @param {string} options.title - Judul utama yang akan ditampilkan di atas daftar (misal: "Hasil Pencarian untuk '10.10.1.1'").
 * @param {function} options.formatEntryCallback - Fungsi yang menerima satu baris data dan mengembalikan string format HTML-nya.
 * @param {string} options.navCallbackPrefix - Awalan callback untuk tombol navigasi (misal: 'cekvm_nav_10.10.1.1').
 * @param {string|null} [options.exportCallbackData=null] - Callback data untuk tombol ekspor. Jika null, tombol tidak akan ditampilkan.
 * @param {number} [options.entriesPerPage=15] - Jumlah item per halaman.
 * @returns {{text: string, keyboard: object|null}} Objek berisi teks pesan dan keyboard.
 */
function createPaginatedView({ allItems, page, title, formatEntryCallback, navCallbackPrefix, exportCallbackData = null, entriesPerPage = KONSTANTA.LIMIT.PAGINATION_ENTRIES }) {
  const totalEntries = allItems.length;
  if (totalEntries === 0) {
    return { text: `ℹ️ ${title}\n\nTidak ada data yang ditemukan.`, keyboard: null };
  }

  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  page = Math.max(1, Math.min(page, totalPages));

  const startIndex = (page - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const pageEntries = allItems.slice(startIndex, endIndex);

  const listContent = pageEntries.map((item, index) => {
    return `${startIndex + index + 1}. ${formatEntryCallback(item)}`;
  }).join('\n');

  let text = `📄 <b>${title}</b>\n`;
  text += `<i>Menampilkan <b>${startIndex + 1}-${endIndex}</b> dari <b>${totalEntries}</b> hasil | Halaman <b>${page}/${totalPages}</b></i>\n`;
  text += `------------------------------------\n\n`;
  text += listContent;
  
  text += '\u200B';

  const keyboardRows = [];
  const navigationButtons = [];
  
  if (page > 1) {
    navigationButtons.push({ text: '⬅️ Prev', callback_data: `${navCallbackPrefix}_${page - 1}` });
  }
  if (totalPages > 1) {
    navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: KONSTANTA.CALLBACK.IGNORE });
  }
  if (page < totalPages) {
    navigationButtons.push({ text: 'Next ➡️', callback_data: `${navCallbackPrefix}_${page + 1}` });
  }
  
  if(navigationButtons.length > 0) keyboardRows.push(navigationButtons);
  
  if (exportCallbackData) {
    keyboardRows.push([{ text: `📄 Ekspor Semua ${totalEntries} Hasil`, callback_data: exportCallbackData }]);
  }
  
  return { text: text, keyboard: { inline_keyboard: keyboardRows } };
}
