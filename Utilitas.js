// ===== FILE: Utilitas.gs =====

function escapeHtml(text) {
  if (typeof text !== 'string') text = String(text);
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * [DIPERBARUI] Membuat "sidik jari" (hash) dari sebuah objek data VM.
 * Sekarang menganggap nilai #N/A sebagai string kosong agar tidak memicu log perubahan.
 */
function computeVmHash(vmObject) {
  if (!vmObject) return ''; 
  
  const objectForHashing = { ...vmObject };
  
  // Tetap mengabaikan Uptime dari perbandingan hash
  delete objectForHashing['Uptime'];

  const sortedKeys = Object.keys(objectForHashing).sort();
  
  // [PERUBAHAN] Periksa setiap nilai. Jika #N/A, anggap sebagai string kosong.
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
