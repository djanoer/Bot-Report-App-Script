/**
 * @file ManajemenPengguna.js
 * @author Djanoer Team
 * @date 2023-07-25
 *
 * @description
 * Mengelola logika yang berkaitan dengan pengguna bot, termasuk alur pendaftaran,
 * persetujuan oleh admin, dan penambahan pengguna baru ke sheet 'Hak Akses'.
 */

/**
 * [REFAKTOR] Fungsi ini sekarang hanya berisi logika bisnis inti untuk persetujuan pengguna.
 */
function handleUserApproval(sessionData, action, adminUserData, config) {
  const { userId, firstName, email } = sessionData;
  const adminName = adminUserData.firstName;

  if (action === "reject") {
    kirimPesanTelegram(
      `Maaf ${escapeHtml(firstName)}, permintaan pendaftaran Anda telah ditolak oleh administrator.`,
      config,
      "HTML",
      null,
      userId
    );
    return `❌ Pendaftaran untuk <b>${escapeHtml(firstName)}</b> telah ditolak oleh ${escapeHtml(adminName)}.`;
  }

  // Tentukan peran berdasarkan aksi
  const role = action === "approve_admin" ? "Admin" : "User";

  const isSuccess = addUserToSheet(userId, firstName, email, role);

  if (isSuccess) {
    clearBotStateCache();

    kirimPesanTelegram(
      `✅ Selamat datang, ${escapeHtml(
        firstName
      )}! Akun Anda telah berhasil diaktifkan dengan peran sebagai <b>${role}</b>.`,
      config,
      "HTML",
      null,
      userId
    );

    return `✅ Pendaftaran untuk <b>${escapeHtml(
      firstName
    )}</b> telah disetujui sebagai <b>${role}</b> oleh ${escapeHtml(adminName)}.`;
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
    const existingIds = data.slice(1).map((row) => String(row[idColumn]));
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

/**
 * [BARU] Mesin Keadaan untuk menangani semua interaksi persetujuan pendaftaran.
 */
function registrationMachine(update, action, config) {
  const userEvent = update.callback_query;
  const adminUserData = getBotState().userAccessMap.get(String(userEvent.from.id));

  if (!adminUserData || (adminUserData.role || "User").toLowerCase() !== "admin") {
    answerCallbackQuery(userEvent.id, config, "Hanya Admin yang dapat melakukan aksi ini.");
    return;
  }
  adminUserData.firstName = userEvent.from.first_name;

  const sessionData = userEvent.sessionData;
  if (sessionData) {
    const resultMessage = handleUserApproval(sessionData, action, adminUserData, config);
    // Tambahkan hasil aksi ke pesan permintaan asli
    const finalMessage = userEvent.message.text + `\n\n------------------------------------\n${resultMessage}`;
    editMessageText(finalMessage, null, userEvent.message.chat.id, userEvent.message.message_id, config);
  } else {
    const finalMessage = userEvent.message.text + "\n\n⚠️ Sesi persetujuan ini telah kedaluwarsa atau tidak valid.";
    editMessageText(finalMessage, null, userEvent.message.chat.id, userEvent.message.message_id, config);
  }
}
