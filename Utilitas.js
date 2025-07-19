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
  if (!vmObject) return "";
  const objectForHashing = { ...vmObject };
  const sortedKeys = Object.keys(objectForHashing).sort();
  const dataString = sortedKeys
    .map((key) => {
      const value = objectForHashing[key];
      return String(value || "").trim() === "#N/A" ? "" : value;
    })
    .join("||");
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, dataString);
  return digest.map((byte) => (byte + 0x100).toString(16).substring(1)).join("");
}

/**
 * [FUNGSI HELPER BARU] Mengekstrak informasi dari nama datastore.
 * @param {string} dsName - Nama datastore yang akan di-parse.
 * @param {Map} migrationConfig - Objek konfigurasi dari sheet Logika Migrasi.
 * @returns {object} Objek berisi { cluster: '...', type: '...' }.
 */
function getDsInfo(dsName, migrationConfig) {
  if (typeof dsName !== "string") return { cluster: null, type: null };
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
  if (typeof dsName !== "string" || !environmentMap) return null;
  const keywords = Object.keys(environmentMap).sort((a, b) => b.length - a.length);
  for (const keyword of keywords) {
    if (dsName.includes(keyword)) {
      return environmentMap[keyword];
    }
  }
  return null;
}

/**
 * Menghapus sufiks lokasi dari Primary Key untuk perbandingan yang konsisten.
 * Contoh: "VM-001-VC01" menjadi "VM-001".
 * @param {string} pk - Primary Key lengkap yang mungkin mengandung sufiks.
 * @returns {string} Primary Key yang sudah bersih tanpa sufiks lokasi.
 */
function normalizePrimaryKey(pk) {
  if (typeof pk !== "string" || !pk) return "";
  return pk.replace(/-VC\d+$/i, "").trim();
}

/**
 * [REVISI v3.5.0 - DENGAN KONTEKS PENGGUNA] Penanganan Error Terpusat.
 * Versi ini dimodifikasi untuk menyertakan detail pengguna yang mengalami error,
 * membantu proses debugging menjadi lebih cepat dan akurat.
 */
function handleCentralizedError(errorObject, context, config, userData = null) {
  const userIdentifier = userData ? `[User: ${userData.id} | ${userData.firstName}]` : '[User: System/Unknown]';
  const errorMessageTechnical = `[ERROR di ${context}] ${userIdentifier} ${errorObject.message}\nStack: ${errorObject.stack || "Tidak tersedia"}`;
  console.error(errorMessageTechnical);
  if (config) {
    let userFriendlyMessage = `🔴 Maaf, terjadi kesalahan saat memproses permintaan Anda.\n\n`;
    userFriendlyMessage += `<b>Konteks:</b> ${context}\n`;
    userFriendlyMessage += `<b>Detail Error:</b>\n<pre>${escapeHtml(errorObject.message)}</pre>\n\n`;
    userFriendlyMessage += `<i>Administrator telah diberitahu mengenai masalah ini.</i>`;
    const targetChatId = config.TELEGRAM_CHAT_ID;
    if (targetChatId) {
      kirimPesanTelegram(userFriendlyMessage, config, "HTML", null, targetChatId);
    }
  }
}

/**
 * [REFACTOR FINAL STATE-DRIVEN] Membuat tampilan berhalaman secara generik.
 * Versi ini menghasilkan callback yang stateful dan kompatibel dengan router mesin.
 */
function createPaginatedView({ allItems, page, title, headerContent = null, formatEntryCallback, callbackInfo, config }) {
  const entriesPerPage = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.PAGINATION_ENTRIES) || 15;
  const totalEntries = allItems.length;
  if (totalEntries === 0) {
    let emptyText = `ℹ️ ${title}\n\n`;
    if (headerContent) emptyText = headerContent + `\n` + emptyText;
    emptyText += `Tidak ada data yang ditemukan.`;
    return { text: emptyText, keyboard: null };
  }
  const totalPages = Math.ceil(totalEntries / entriesPerPage);
  page = Math.max(1, Math.min(page, totalPages));
  const startIndex = (page - 1) * entriesPerPage;
  const endIndex = Math.min(startIndex + entriesPerPage, totalEntries);
  const pageEntries = allItems.slice(startIndex, endIndex);
  const listContent = pageEntries.map((item, index) => `${startIndex + index + 1}. ${formatEntryCallback(item)}`).join("\n\n");
  let text = `${headerContent ? headerContent + '\n' : ''}`;
  text += `<i>Menampilkan <b>${startIndex + 1}-${endIndex}</b> dari <b>${totalEntries}</b> hasil | Halaman <b>${page}/${totalPages}</b></i>\n`;
  text += `------------------------------------\n\n${listContent}\u200B`;
  const keyboardRows = [];
  const navigationButtons = [];
  const createSessionForPage = (targetPage) => createCallbackSession({ ...callbackInfo.context, page: targetPage }, config);
  if (page > 1) navigationButtons.push({ text: "⬅️ Prev", callback_data: `${callbackInfo.navPrefix}${createSessionForPage(page - 1)}` });
  if (totalPages > 1) navigationButtons.push({ text: `📄 ${page}/${totalPages}`, callback_data: "ignore" });
  if (page < totalPages) navigationButtons.push({ text: "Next ➡️", callback_data: `${callbackInfo.navPrefix}${createSessionForPage(page + 1)}` });
  if (navigationButtons.length > 0) keyboardRows.push(navigationButtons);
  if (callbackInfo.exportPrefix) {
    keyboardRows.push([{ text: `📄 Ekspor Semua ${totalEntries} Hasil`, callback_data: `${callbackInfo.exportPrefix}${createSessionForPage(1)}` }]);
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
  if (botState) return botState;
  const cache = CacheService.getScriptCache();
  const CACHE_KEY = "BOT_STATE_V2";
  const cachedStateJSON = cache.get(CACHE_KEY);
  if (cachedStateJSON) {
    try {
      const cachedState = JSON.parse(cachedStateJSON);
      cachedState.userAccessMap = new Map(cachedState.userAccessMap);
      botState = cachedState;
      return botState;
    } catch (e) { console.warn("Gagal mem-parsing state dari cache.", e); }
  }
  console.log("Membaca state dari Spreadsheet...");
  const config = bacaKonfigurasi();
  const userAccessMap = new Map();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheetHakAkses = ss.getSheetByName(KONSTANTA.NAMA_SHEET.HAK_AKSES);
  if (sheetHakAkses && sheetHakAkses.getLastRow() > 1) {
    const dataAkses = sheetHakAkses.getRange(2, 1, sheetHakAkses.getLastRow() - 1, 4).getValues();
    dataAkses.forEach((row) => {
      if (row[0] && row[2]) userAccessMap.set(String(row[0]), { email: row[2], role: row[3] });
    });
  }
  const newState = { config: config, userAccessMap: userAccessMap };
  const stateToCache = { ...newState, userAccessMap: Array.from(newState.userAccessMap.entries()) };
  cache.put(CACHE_KEY, JSON.stringify(stateToCache), 21600);
  botState = newState;
  return botState;
}

/**
 * [REFACTOR FINAL] Menghapus SEMUA cache bot yang relevan.
 * Fungsi ini sekarang juga membersihkan cache data VM ("vm_data").
 */
function clearBotStateCache() {
  try {
    const cache = CacheService.getScriptCache();
    
    // 1. Kunci cache state (konfigurasi & hak akses)
    const stateCacheKey = "BOT_STATE_V2";
    
    // 2. Kunci cache data VM (manifest & semua potongannya)
    const vmDataManifestKey = "vm_data_manifest";
    const vmDataManifestJSON = cache.get(vmDataManifestKey);
    const keysToRemove = [stateCacheKey, vmDataManifestKey];

    if (vmDataManifestJSON) {
      try {
        const manifest = JSON.parse(vmDataManifestJSON);
        if (manifest && manifest.totalChunks) {
          for (let i = 0; i < manifest.totalChunks; i++) {
            keysToRemove.push(`vm_data_chunk_${i}`);
          }
        }
      } catch (e) {
        console.warn(`Gagal mem-parse manifest cache vm_data saat pembersihan: ${e.message}`);
      }
    }

    // Hapus semua cache yang teridentifikasi sekaligus
    cache.removeAll(keysToRemove);
    
    // Reset state di memori juga
    botState = null;
    
    console.log(`Pembersihan cache berhasil. Kunci yang dihapus: ${keysToRemove.join(", ")}`);
    return true;
  } catch (e) {
    console.error(`Gagal menghapus cache bot: ${e.message}`);
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
  if (typeof numberString === "number") return numberString;
  if (typeof numberString !== "string") numberString = String(numberString);
  let cleaned = numberString.replace(/[^0-9.,-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastComma > lastDot) {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }
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
 * [FINAL-FIX] Menyimpan data besar ke cache dengan teknik chunking.
 * Memperbaiki bug dengan menggunakan cache.put() di dalam perulangan, bukan cache.putAll().
 */
function saveLargeDataToCache(keyPrefix, data, durationInSeconds) {
  const cache = CacheService.getScriptCache();
  const manifestKey = `${keyPrefix}_manifest`;

  // Hapus cache lama terlebih dahulu
  const oldManifestJSON = cache.get(manifestKey);
  if (oldManifestJSON) {
    try {
      const oldManifest = JSON.parse(oldManifestJSON);
      if (oldManifest && oldManifest.totalChunks) {
        const keysToRemove = [manifestKey];
        for (let i = 0; i < oldManifest.totalChunks; i++) {
          keysToRemove.push(`${keyPrefix}_chunk_${i}`);
        }
        cache.removeAll(keysToRemove);
      }
    } catch (e) {
      console.warn(`Gagal parse manifest cache lama untuk ${keyPrefix}: ${e.message}`);
    }
  }

  const dataString = JSON.stringify(data);
  const maxChunkSize = 95 * 1024; // 95KB
  const chunks = [];
  for (let i = 0; i < dataString.length; i += maxChunkSize) {
    chunks.push(dataString.substring(i, i + maxChunkSize));
  }

  const manifest = { totalChunks: chunks.length };
  
  try {
    // --- PERBAIKAN UTAMA DI SINI ---
    // Simpan manifest terlebih dahulu
    cache.put(manifestKey, JSON.stringify(manifest), durationInSeconds);
    // Simpan setiap potongan data secara individual menggunakan perulangan
    chunks.forEach((chunk, index) => {
      cache.put(`${keyPrefix}_chunk_${index}`, chunk, durationInSeconds);
    });
    console.log(`Data berhasil disimpan ke cache dengan prefix "${keyPrefix}" dalam ${chunks.length} potongan.`);
    // --- AKHIR PERBAIKAN ---
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
    if (!manifestJSON) return null;
    const manifest = JSON.parse(manifestJSON);
    const totalChunks = manifest.totalChunks;
    const chunkKeys = [];
    for (let i = 0; i < totalChunks; i++) {
      chunkKeys.push(`${keyPrefix}_chunk_${i}`);
    }
    const cachedChunks = cache.getAll(chunkKeys);
    let reconstructedString = "";
    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `${keyPrefix}_chunk_${i}`;
      if (!cachedChunks[chunkKey]) {
        console.error(`Integritas cache rusak: Potongan "${chunkKey}" hilang.`);
        return null;
      }
      reconstructedString += cachedChunks[chunkKey];
    }
    return JSON.parse(reconstructedString);
  } catch (e) {
    console.error(`Gagal membaca data cache dengan prefix "${keyPrefix}". Error: ${e.message}`);
    return null;
  }
}

/**
 * [FINAL v1.8.1] Membuat sesi callback sementara di cache.
 * Menggunakan durasi timeout dari konfigurasi terpusat.
 */
function createCallbackSession(dataToStore, config) {
  const cache = CacheService.getScriptCache();
  const sessionId = Utilities.getUuid().substring(0, 8);
  const timeout = (config.SYSTEM_LIMITS && config.SYSTEM_LIMITS.SESSION_TIMEOUT_SECONDS) || 900;
  cache.put(`session_${sessionId}`, JSON.stringify(dataToStore), timeout);
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
    cache.remove(sessionKey);
    return JSON.parse(sessionJSON);
  }
  return null;
}

/**
 * [HELPER v4.6.0] Fungsi terpusat untuk mengambil data dari sebuah sheet.
 * Mengembalikan header dan baris data secara terpisah.
 * @param {string} sheetName Nama sheet yang akan dibaca.
 * @returns {{headers: Array<string>, dataRows: Array<Array<any>>}} Objek berisi header dan baris data.
 */
function _getSheetData(sheetName) {
    if (!sheetName) return { headers: [], dataRows: [] };
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { headers: [], dataRows: [] };
    if (sheet.getLastRow() < 1) return { headers: [], dataRows: [] };
    const allData = sheet.getDataRange().getValues();
    const headers = allData.shift() || [];
    return { headers: headers, dataRows: allData };
}

/**
 * [BARU v1.4.0] Menghitung Jarak Levenshtein antara dua string.
 * Semakin kecil hasilnya, semakin mirip kedua string tersebut.
 * @param {string} a String pertama.
 * @param {string} b String kedua.
 * @returns {number} Jarak antara dua string.
 */
function getLevenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * [BARU v1.4.0] Mencari perintah yang paling mirip dengan input yang salah dari pengguna.
 * @param {string} wrongCommand - Perintah salah yang diketik oleh pengguna.
 * @returns {string|null} Perintah yang paling mirip, atau null jika tidak ada yang cukup mirip.
 */
function findClosestCommand(wrongCommand) {
  const allCommands = Object.values(KONSTANTA.PERINTAH_BOT);
  let closestCommand = null;
  let minDistance = 3; // Batas toleransi, jangan sarankan jika terlalu beda

  allCommands.forEach(command => {
    const distance = getLevenshteinDistance(wrongCommand, command);
    if (distance < minDistance) {
      minDistance = distance;
      closestCommand = command;
    }
  });

  return closestCommand;
}

/**
 * [FINAL v3.0.3 - KRUSIAL] Fungsi khusus untuk mendapatkan info storage dari nama datastore.
 * Versi ini menggunakan Regular Expression yang lebih cerdas dan fleksibel untuk
 * mengekstrak nama cluster dengan berbagai format secara andal.
 * @param {string} dsName - Nama datastore yang akan di-parse.
 * @param {object} aliasMap - Objek pemetaan dari Konfigurasi (MAP_ALIAS_STORAGE).
 * @returns {object} Objek berisi { cluster: '...', storageType: '...' }.
 */
function getStorageInfoFromDsName(dsName, aliasMap) {
    if (typeof dsName !== 'string' || !aliasMap) return { cluster: null, storageType: null };

    // === AWAL BLOK PERBAIKAN UTAMA ===
    // Regex baru yang lebih fleksibel: mencari pola kata-kata yang diakhiri dengan CL##
    // Contoh: akan cocok dengan "TBN-COM-LNV-CL02" dan juga "COM-CL01"
    const clusterMatch = dsName.match(/((?:\w+-)*CL\d+)/i);
    const cluster = clusterMatch ? clusterMatch[0].toUpperCase() : null;
    // === AKHIR BLOK PERBAIKAN UTAMA ===

    // Cari alias storage yang cocok
    let storageType = null;
    // Urutkan kunci dari yang terpanjang agar tidak salah cocok (misal: "VSPA" sebelum "VSP")
    const storageKeys = Object.keys(aliasMap).sort((a, b) => b.length - a.length);

    for (const key of storageKeys) {
        const aliases = aliasMap[key];
        const isMatch = aliases.some(alias => dsName.toUpperCase().includes(alias.toUpperCase()));
        if (isMatch) {
            // Gunakan alias pertama sebagai tipe storage utama
            storageType = aliases[0];
            break;
        }
    }
    return { cluster: cluster, storageType: storageType };
}

/**
 * [BARU v3.1.2 - KRUSIAL] Menghapus state (status percakapan) seorang pengguna dari cache.
 * Fungsi ini dipanggil setelah sebuah percakapan selesai atau dibatalkan.
 * @param {string} userId - ID pengguna yang state-nya akan dihapus.
 */
function clearUserState(userId) {
  const cache = CacheService.getScriptCache();
  const cacheKey = `user_state_${userId}`;
  cache.remove(cacheKey);
  console.log(`State untuk pengguna ${userId} telah berhasil dihapus.`);
}

/**
 * [REVISI v1.1.0 - ROBUST] Membuat progress bar visual berbasis teks.
 * Kini mampu menangani nilai persentase negatif tanpa menyebabkan error.
 */
function createProgressBar(percentage, barLength = 10) {
  // --- PERBAIKAN UTAMA DI SINI ---
  // Memastikan persentase dibatasi antara 0 dan 100 sebelum kalkulasi.
  const safePercentage = Math.max(0, Math.min(percentage, 100));
  // --- AKHIR PERBAIKAN ---

  const filledCount = Math.round((safePercentage / 100) * barLength);
  const emptyCount = barLength - filledCount;
  const filledPart = "█".repeat(filledCount);
  const emptyPart = "░".repeat(emptyCount);
  return `[${filledPart}${emptyPart}]`;
}

/**
 * [BARU] Menghitung dan memformat durasi waktu relatif dari tanggal tertentu hingga sekarang.
 * @param {Date | string} date - Tanggal mulai.
 * @returns {string} String yang diformat seperti "(sekitar 2 tahun yang lalu)".
 */
function formatRelativeTime(date) {
  if (!date) return "";
  
  const startDate = new Date(date);
  if (isNaN(startDate.getTime())) return "";

  const now = new Date();
  const diffSeconds = Math.round((now - startDate) / 1000);
  const diffMinutes = Math.round(diffSeconds / 60);
  const diffHours = Math.round(diffMinutes / 60);
  const diffDays = Math.round(diffHours / 24);
  const diffMonths = Math.round(diffDays / 30.44);
  const diffYears = Math.round(diffDays / 365.25);

  if (diffYears > 0) {
    return `(sekitar ${diffYears} tahun yang lalu)`;
  } else if (diffMonths > 0) {
    return `(sekitar ${diffMonths} bulan yang lalu)`;
  } else if (diffDays > 0) {
    return `(sekitar ${diffDays} hari yang lalu)`;
  } else if (diffHours > 0) {
    return `(sekitar ${diffHours} jam yang lalu)`;
  } else {
    return `(beberapa saat yang lalu)`;
  }
}
