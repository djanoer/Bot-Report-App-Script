// ===== FILE: ManajemenPengguna.gs =====

/**
 * [BARU v1.7.0] Fungsi utama untuk menangani aksi persetujuan pendaftaran.
 * @param {object} sessionData - Data pengguna dari sesi callback (userId, firstName, email).
 * @param {string} action - Aksi yang akan dilakukan ('approve_user', 'approve_admin', 'reject').
 * @param {object} adminUserData - Data admin yang menekan tombol.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {string} Pesan konfirmasi untuk dieditkan ke pesan asli.
 */
function handleUserApproval(sessionData, action, adminUserData, config) {
  const { userId, firstName, email } = sessionData;
  const adminName = adminUserData.firstName;

  if (action === 'reject') {
    // Kirim notifikasi penolakan ke pengguna
    kirimPesanTelegram(
      `Maaf ${escapeHtml(firstName)}, permintaan pendaftaran Anda telah ditolak oleh administrator.`,
      config, 'HTML', null, userId
    );
    return `❌ Pendaftaran untuk <b>${escapeHtml(firstName)}</b> telah ditolak oleh ${escapeHtml(adminName)}.`;
  }

  // Tentukan peran berdasarkan aksi
  const role = (action === 'approve_admin') ? 'Admin' : 'User';
  
  // Tambahkan pengguna ke sheet
  const isSuccess = addUserToSheet(userId, firstName, email, role);

  if (isSuccess) {
    // Bersihkan cache agar pengguna baru langsung dikenali
    clearBotStateCache();
    
    // Kirim pesan selamat datang ke pengguna baru
    kirimPesanTelegram(
      `✅ Selamat datang, ${escapeHtml(firstName)}! Akun Anda telah berhasil diaktifkan dengan peran sebagai <b>${role}</b>.`,
      config, 'HTML', null, userId
    );
    
    // Kembalikan pesan konfirmasi untuk admin
    return `✅ Pendaftaran untuk <b>${escapeHtml(firstName)}</b> telah disetujui sebagai <b>${role}</b> oleh ${escapeHtml(adminName)}.`;
  } else {
    return `⚠️ Gagal menambahkan pengguna <b>${escapeHtml(firstName)}</b>. Kemungkinan User ID sudah terdaftar.`;
  }
}

/**
 * [BARU v1.7.0] Menambahkan data pengguna baru ke sheet "Hak Akses".
 * @returns {boolean} True jika berhasil, false jika gagal (misal: duplikat).
 */
function addUserToSheet(userId, firstName, email, role) {
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(KONSTANTA.NAMA_SHEET.HAK_AKSES);
    
    // Cek duplikat
    const data = sheet.getDataRange().getValues();
    const idColumn = data[0].indexOf("User ID"); // Asumsi header adalah "User ID"
    const existingIds = data.slice(1).map(row => String(row[idColumn]));
    if (existingIds.includes(String(userId))) {
      console.warn(`Upaya mendaftarkan User ID duplikat: ${userId}`);
      return false;
    }

    // Tambahkan baris baru
    sheet.appendRow([userId, firstName, email, role]);
    return true;
  } catch (e) {
    console.error(`Gagal menambahkan pengguna ke sheet: ${e.message}`);
    return false;
  }
}