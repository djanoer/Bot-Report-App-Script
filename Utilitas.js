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
 * [REFACTORED v4.1.0 - ROBUST SESSION] Membuat tampilan berhalaman (pesan teks dan keyboard) secara generik.
 * Kini sepenuhnya menggunakan mekanisme Session ID untuk menangani callback data yang kompleks dan aman.
 * Fungsi ini tidak lagi menerima 'navCallbackPrefix', melainkan objek 'callbackInfo' yang lebih deskriptif.
 */
function createPaginatedView({ allItems, page, title, headerContent = null, formatEntryCallback, callbackInfo, entriesPerPage = KONSTANTA.LIMIT.PAGINATION_ENTRIES }) {
  const totalEntries = allItems.length;
  if (totalEntries === 0) {
    let emptyText = `ℹ️ ${title}\n\n`;
    if (headerContent) {
        emptyText = headerContent + `\n` + emptyText;
    }
    emptyText += `Tidak ada data yang ditemukan.`;
    return { text: emptyText, keyboard: null };
  }

  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  page = Math.max(1, Math.min(page, totalPages));

  const startIndex = (page - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const pageEntries = allItems.slice(startIndex, endIndex);

  const listContent = pageEntries.map((item, index) => {
    return `${startIndex + index + 1}. ${formatEntryCallback(item)}`;
  }).join('\n\n');

  let text = "";
  if (headerContent) {
      text += headerContent + "\n";
  }
  
  text += `<i>Menampilkan <b>${startIndex + 1}-${endIndex}</b> dari <b>${totalEntries}</b> hasil | Halaman <b>${page}/${totalPages}</b></i>\n`;
  text += `------------------------------------\n\n`;
  text += listContent;
  text += '\u200B';

  const keyboardRows = [];
  const navigationButtons = [];
  
  // ==================== PERUBAHAN UTAMA DI SINI ====================
  // Membuat sesi untuk navigasi dan ekspor.
  // Data konteks (seperti searchTerm) akan disuntikkan oleh fungsi pemanggil.
  const createSessionForPage = (targetPage) => {
    const sessionData = { 
        ...callbackInfo.context, // Menyalin semua konteks (cth: searchTerm, itemName)
        page: targetPage,
    };
    return createCallbackSession(sessionData); 
  };
  
  if (page > 1) {
    const prevSessionId = createSessionForPage(page - 1);
    navigationButtons.push({ text: '⬅️ Prev', callback_data: `${callbackInfo.navPrefix}${prevSessionId}` });
  }
  if (totalPages > 1) {
    navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: KONSTANTA.CALLBACK.IGNORE });
  }
  if (page < totalPages) {
    const nextSessionId = createSessionForPage(page + 1);
    navigationButtons.push({ text: 'Next ➡️', callback_data: `${callbackInfo.navPrefix}${nextSessionId}` });
  }
  
  if(navigationButtons.length > 0) keyboardRows.push(navigationButtons);
  
  if (callbackInfo.exportPrefix) {
    // Sesi untuk ekspor bisa berisi semua item ID jika perlu, atau hanya query-nya
    const exportSessionId = createSessionForPage(1); // Ekspor selalu dari halaman 1
    keyboardRows.push([{ text: `📄 Ekspor Semua ${totalEntries} Hasil`, callback_data: `${callbackInfo.exportPrefix}${exportSessionId}` }]);
  }
  // ==================== AKHIR PERUBAHAN ====================
  
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

/**
 * [MODIFIKASI v3.5.0 - FINAL & ROBUST] Fungsi pembantu yang lebih tangguh untuk mem-parse
 * string angka, kini dapat menangani format standar dan internasional dengan benar
 * tanpa merusak nilai desimal.
 * @param {string | number} numberString - String angka yang akan di-parse.
 * @returns {number} Angka dalam format float.
 */
function parseLocaleNumber(numberString) {
  // Jika sudah berupa angka, langsung kembalikan
  if (typeof numberString === 'number') {
    return numberString;
  }
  // Jika bukan string, ubah menjadi string
  if (typeof numberString !== 'string') {
    numberString = String(numberString);
  }

  // 1. Bersihkan semua karakter non-numerik kecuali titik, koma, dan tanda minus.
  let cleaned = numberString.replace(/[^0-9.,-]/g, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  // 2. Tentukan format berdasarkan pemisah desimal terakhir
  // Jika koma adalah pemisah terakhir, atau satu-satunya pemisah, asumsikan format Eropa
  if (lastComma > -1 && lastComma > lastDot) {
    // Hapus semua titik (pemisah ribuan), lalu ganti koma desimal dengan titik
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else {
    // Asumsikan format US/standar. Cukup hapus koma (pemisah ribuan).
    // Titik desimal (jika ada) akan di-handle oleh parseFloat.
    cleaned = cleaned.replace(/,/g, '');
  }

  // 3. Lakukan parseFloat pada string yang sudah bersih.
  return parseFloat(cleaned) || 0;
}

/**
 * [FUNGSI BARU v3.3.0] Menyimpan status sementara untuk seorang pengguna.
 * Digunakan untuk interaksi multi-langkah, seperti menunggu input catatan.
 * @param {string} userId - ID unik dari pengguna Telegram.
 * @param {object} stateObject - Objek yang berisi status, contoh: { action: 'AWAITING_NOTE_INPUT', pk: 'VM-XYZ' }
 */
function setUserState(userId, stateObject) {
  const cache = CacheService.getScriptCache();
  // Simpan status untuk pengguna ini selama 10 menit.
  cache.put(`user_state_${userId}`, JSON.stringify(stateObject), 600); 
}

/**
 * [FUNGSI BARU v3.3.0] Mengambil dan menghapus status sementara seorang pengguna.
 * @param {string} userId - ID unik dari pengguna Telegram.
 * @returns {object|null} Objek status jika ada, atau null jika tidak.
 */
function getUserState(userId) {
  const cache = CacheService.getScriptCache();
  const stateKey = `user_state_${userId}`;
  const stateJSON = cache.get(stateKey);

  if (stateJSON) {
    // Setelah status diambil, langsung hapus agar tidak digunakan lagi.
    cache.remove(stateKey); 
    return JSON.parse(stateJSON);
  }
  return null;
}

/**
 * [FUNGSI BARU v3.4.0] Menyimpan data besar ke cache dengan teknik chunking.
 * Fungsi ini secara otomatis menangani invalidasi cache lama sebelum menyimpan yang baru.
 * @param {string} keyPrefix - Awalan unik untuk kunci cache, misal: 'vm_data'.
 * @param {object} data - Objek atau array data yang akan disimpan.
 * @param {number} durationInSeconds - Durasi penyimpanan cache dalam detik.
 */
function saveLargeDataToCache(keyPrefix, data, durationInSeconds) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${keyPrefix}_manifest`;
  
  // Hapus cache lama terlebih dahulu untuk memastikan invalidasi yang bersih
  let oldManifest;
  try {
    const oldManifestJSON = cache.get(manifestKey);
    if (oldManifestJSON) {
      oldManifest = JSON.parse(oldManifestJSON);
    }
  } catch(e) {
    console.warn(`Gagal mem-parse manifest cache lama untuk prefix "${keyPrefix}". Mungkin sudah tidak ada. Error: ${e.message}`);
  }
  
  if (oldManifest && oldManifest.totalChunks) {
    const keysToRemove = [manifestKey];
    for (let i = 0; i < oldManifest.totalChunks; i++) {
      keysToRemove.push(`${keyPrefix}_chunk_${i}`);
    }
    cache.removeAll(keysToRemove);
    console.log(`Cache lama dengan prefix "${keyPrefix}" telah berhasil dihapus.`);
  }

  // Lanjutkan dengan penyimpanan data baru
  const dataString = JSON.stringify(data);
  const maxChunkSize = 95 * 1024; // 95KB untuk batas aman
  const chunks = [];

  // Pecah data menjadi beberapa bagian jika perlu
  for (let i = 0; i < dataString.length; i += maxChunkSize) {
    chunks.push(dataString.substring(i, i + maxChunkSize));
  }

  // Siapkan manifest dan semua potongan data untuk disimpan
  const manifest = { totalChunks: chunks.length };
  const itemsToCache = {
    [manifestKey]: JSON.stringify(manifest)
  };
  chunks.forEach((chunk, index) => {
    itemsToCache[`${keyPrefix}_chunk_${index}`] = chunk;
  });

  try {
    cache.putAll(itemsToCache, durationInSeconds);
    console.log(`Data berhasil disimpan ke cache dengan prefix "${keyPrefix}" dalam ${chunks.length} potongan.`);
  } catch (e) {
    console.error(`Gagal menyimpan data cache dengan teknik chunking untuk prefix "${keyPrefix}". Error: ${e.message}`);
  }
}

/**
 * [FUNGSI BARU v3.4.0] Membaca data besar dari cache yang disimpan dengan teknik chunking.
 * Dilengkapi dengan validasi integritas untuk memastikan data tidak rusak.
 * @param {string} keyPrefix - Awalan unik untuk kunci cache.
 * @returns {object|null} Data yang telah direkonstruksi, atau null jika cache tidak lengkap atau tidak ada.
 */
function readLargeDataFromCache(keyPrefix) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${keyPrefix}_manifest`;
  
  try {
    const manifestJSON = cache.get(manifestKey);
    if (!manifestJSON) {
      console.log(`Cache manifest untuk prefix "${keyPrefix}" tidak ditemukan (cache miss).`);
      return null; 
    }

    const manifest = JSON.parse(manifestJSON);
    const totalChunks = manifest.totalChunks;
    const chunkKeys = [];

    for (let i = 0; i < totalChunks; i++) {
      chunkKeys.push(`${keyPrefix}_chunk_${i}`);
    }

    const cachedChunks = cache.getAll(chunkKeys);
    let reconstructedString = "";

    // Validasi Integritas Cache (Sangat Penting!)
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `${keyPrefix}_chunk_${i}`;
      if (!cachedChunks[chunkKey]) {
        console.error(`Integritas cache rusak: Potongan "${chunkKey}" hilang. Membatalkan pembacaan cache.`);
        return null; // Cache miss karena tidak lengkap
      }
      reconstructedString += cachedChunks[chunkKey];
    }

    console.log(`Data berhasil direkonstruksi dari ${totalChunks} potongan cache.`);
    return JSON.parse(reconstructedString);

  } catch (e) {
    console.error(`Gagal membaca atau mem-parse data cache dengan prefix "${keyPrefix}". Error: ${e.message}`);
    return null; // Cache miss karena error
  }
}

/**
 * [REFACTORED v4.3.0] Membuat sesi callback sementara di cache.
 * Durasi cache sekarang diambil dari file konstanta terpusat.
 */
function createCallbackSession(dataToStore) {
  const cache = CacheService.getScriptCache();
  const sessionId = Utilities.getUuid().substring(0, 8);
  
  // ==================== PERUBAHAN UTAMA DI SINI ====================
  // Menggunakan konstanta, bukan angka hardcoded 900
  cache.put(`session_${sessionId}`, JSON.stringify(dataToStore), KONSTANTA.LIMIT.SESSION_TIMEOUT_SECONDS); 
  // =============================================================
  
  console.log(`Sesi callback dibuat dengan ID: ${sessionId}`);
  return sessionId;
}

/**
 * [FUNGSI BARU v3.7.0] Mengambil dan menghapus sesi callback dari cache.
 * @param {string} sessionId - ID unik dari sesi yang akan diambil.
 * @returns {object|null} Objek data yang tersimpan, atau null jika sesi tidak ditemukan/kedaluwarsa.
 */
function getCallbackSession(sessionId) {
  const cache = CacheService.getScriptCache();
  const sessionKey = `session_${sessionId}`;
  const sessionJSON = cache.get(sessionKey);

  if (sessionJSON) {
    console.log(`Mengambil sesi callback dengan ID: ${sessionId}`);
    // Setelah sesi diambil, langsung hapus agar tidak bisa digunakan lagi (keamanan).
    cache.remove(sessionKey);
    return JSON.parse(sessionJSON);
  }
  console.warn(`Sesi callback dengan ID: ${sessionId} tidak ditemukan atau telah kedaluwarsa.`);
  return null;
}
