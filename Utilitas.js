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
 * [v1.1-stabil] Membuat tampilan berhalaman (pesan teks dan keyboard) untuk data apa pun secara generik.
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
  
  return { text, keyboard: { inline_keyboard: keyboardRows } };
}

/**
 * @const {object|null}
 * Variabel global untuk menyimpan state bot (konfigurasi & hak akses) selama eksekusi.
 * Ini mencegah pembacaan berulang dari cache atau sheet dalam satu siklus eksekusi.
 */
let botState = null;

/**
 * [FUNGSI BARU - STATE MANAGER]
 * Mendapatkan state bot (konfigurasi dan hak akses) dari cache atau membacanya dari sheet jika perlu.
 * Ini adalah PENGGANTI dari pemanggilan `bacaKonfigurasi()` dan `getUserData()` secara terpisah.
 *
 * @returns {{config: object, userAccessMap: Map}} Objek yang berisi konfigurasi dan peta hak akses.
 */
function getBotState() {
  // 1. Jika state sudah ada di memori (untuk eksekusi yang sama), langsung kembalikan.
  console.log("✅ Verifikasi: State diambil dari MEMORI.");
  if (botState) {
    // console.log("Menggunakan state dari memori.");
    return botState;
  }

  const cache = CacheService.getScriptCache();
  const CACHE_KEY = 'BOT_STATE_V2'; // Gunakan kunci baru
  const CACHE_DURATION_SECONDS = 21600; // Cache untuk 6 jam

  // 2. Coba ambil dari cache.
  const cachedStateJSON = cache.get(CACHE_KEY);
  if (cachedStateJSON) {
    try {
      const cachedState = JSON.parse(cachedStateJSON);
      // Ubah array hasil JSON.stringify kembali menjadi Map
      cachedState.userAccessMap = new Map(cachedState.userAccessMap);
      botState = cachedState; // Simpan ke memori global
      // console.log("State berhasil dimuat dari cache.");
      console.log("✅ Verifikasi: State diambil dari CACHE.");
      return botState;
    } catch (e) {
      console.log("🟡 Verifikasi: State dibaca dari SPREADSHEET.");
      console.warn("Gagal mem-parsing state dari cache, akan membaca ulang dari sheet.", e);
    }
  }

  // 3. Jika tidak ada di memori atau cache, baca dari Spreadsheet (fallback).
  console.log("State tidak ditemukan di memori atau cache. Membaca ulang dari Spreadsheet...");
  const config = bacaKonfigurasi(); // Fungsi bacaKonfigurasi tetap ada
  const userAccessMap = new Map();
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHakAkses = ss.getSheetByName(KONSTANTA.NAMA_SHEET.HAK_AKSES);
  if (sheetHakAkses && sheetHakAkses.getLastRow() > 1) {
    const dataAkses = sheetHakAkses.getRange(2, 1, sheetHakAkses.getLastRow() - 1, 3).getValues();
    dataAkses.forEach(row => {
      const userId = String(row[0]);
      const email = row[2];
      if (userId && email) {
        userAccessMap.set(userId, { email: email });
      }
    });
  }

  // Gabungkan semua menjadi satu objek state
  const newState = {
    config: config,
    userAccessMap: userAccessMap
  };
  
  // Simpan state baru ke cache untuk eksekusi berikutnya.
  // Perlu mengubah Map menjadi array agar bisa disimpan sebagai JSON.
  const stateToCache = {
      ...newState,
      userAccessMap: Array.from(newState.userAccessMap.entries())
  };
  cache.put(CACHE_KEY, JSON.stringify(stateToCache), CACHE_DURATION_SECONDS);

  botState = newState; // Simpan ke memori global
  return botState;
}

/**
 * [FUNGSI BARU - PENGGANTI clearUserAccessCache]
 * Menghapus cache state bot secara keseluruhan.
 */
function clearBotStateCache() {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove('BOT_STATE_V2');
    botState = null; // Hapus juga dari memori
    console.log("Cache state bot berhasil dihapus.");
    return true;
  } catch (e) {
    console.error("Gagal menghapus cache state bot: " + e.message);
    return false;
  }
}
