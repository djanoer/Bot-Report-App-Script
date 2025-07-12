// ===== FILE: Telegram.gs =====

/**
 * [OPTIMALISASI] Fungsi inti untuk semua panggilan ke API Telegram.
 * Fungsi ini menangani pembuatan payload, eksekusi UrlFetchApp, dan penanganan error terpusat.
 * @param {string} method - Nama metode API Telegram yang akan dipanggil (misal: "sendMessage").
 * @param {object} payloadData - Objek yang berisi data untuk payload.
 * @param {object} config - Objek konfigurasi bot.
 * @returns {object|null} Objek respons dari Telegram jika berhasil, atau null jika gagal.
 */
function callTelegramApi(method, payloadData, config) {
  if (String(config.TELEGRAM_BOT_TOKEN).includes("MASUKKAN")) {
    console.error("Token Bot Telegram belum diisi.");
    return null;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/${method}`;
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payloadData),
    muteHttpExceptions: true, // Penting: Mencegah script berhenti total jika ada error HTTP (misal: 404, 400).
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(
        `Gagal memanggil API Telegram (Metode: ${method}). Kode: ${responseCode}. Respons: ${responseBody}`
      );
      return null;
    }
    // Mengembalikan hasil parse JSON agar bisa digunakan oleh fungsi pemanggil (misal: untuk mendapatkan message_id)
    return JSON.parse(responseBody);
  } catch (e) {
    console.error(`Gagal total memanggil API Telegram (Metode: ${method}). Error: ${e.message}`);
    return null;
  }
}

function setWebhook() {
  const config = bacaKonfigurasi();
  const webAppUrlBase =
    "https://script.google.com/macros/s/AKfycbxi7QjJafg6Zp8NfW6QDcdixlq-ing7Iy5cie-rUNSQCVkoUNuwa86wpPoQq4bEJjV7/exec";
  if (webAppUrlBase.includes("MASUKKAN")) {
    SpreadsheetApp.getUi().alert("Harap masukkan URL Web App Anda di dalam fungsi setWebhook sebelum menjalankannya.");
    return;
  }
  const webAppUrlWithToken = `${webAppUrlBase}?token=${config.WEBHOOK_BOT_TOKEN}`;
  const telegramApiUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webAppUrlWithToken}`;
  try {
    const response = UrlFetchApp.fetch(telegramApiUrl);
    console.log("setWebhook Response: " + response.getContentText());
    SpreadsheetApp.getUi().alert("Webhook berhasil diatur!");
  } catch (e) {
    console.error(`Gagal mengatur webhook: ${e.message}`);
    SpreadsheetApp.getUi().alert(`Gagal mengatur webhook: ${e.message}`);
  }
}

/**
 * [OPTIMALISASI UX] Mengirim pesan ke Telegram dengan penanganan batas panjang pesan.
 * Fungsi ini sekarang mengembalikan objek respons dari Telegram, yang berisi message_id.
 * @returns {object|null} Objek respons dari pesan terakhir yang dikirim, atau null jika gagal.
 */
function kirimPesanTelegram(teksPesan, config, parseMode = "HTML", inlineKeyboard = null, targetChatId = null) {
  const TELEGRAM_MESSAGE_LIMIT = 4096;
  const chatTujuan = targetChatId || String(config.TELEGRAM_CHAT_ID);

  if (!chatTujuan) {
    console.error("ID Chat tujuan tidak valid.");
    return null;
  }

  if (teksPesan.length <= TELEGRAM_MESSAGE_LIMIT) {
    const payloadData = {
      chat_id: chatTujuan,
      text: teksPesan,
      parse_mode: parseMode,
    };
    if (inlineKeyboard) {
      payloadData.reply_markup = JSON.stringify(inlineKeyboard);
    }
    // [PERBAIKAN] Mengembalikan hasil dari callTelegramApi
    return callTelegramApi("sendMessage", payloadData, config);
  }

  console.log(`Pesan terlalu panjang (${teksPesan.length} karakter), akan dibagi.`);
  const chunks = [];
  let currentChunk = "";
  const lines = teksPesan.split("\n");

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > TELEGRAM_MESSAGE_LIMIT) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += line + "\n";
  }
  chunks.push(currentChunk);

  let finalResponse = null;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const payloadData = {
      chat_id: chatTujuan,
      text: chunk,
      parse_mode: parseMode,
    };

    if (i === chunks.length - 1 && inlineKeyboard) {
      payloadData.reply_markup = JSON.stringify(inlineKeyboard);
    }

    finalResponse = callTelegramApi("sendMessage", payloadData, config);
    if (chunks.length > 1) {
      Utilities.sleep(500);
    }
  }

  return finalResponse;
}

/**
 * [PERBAIKAN FINAL] Mengedit teks dan tombol dari pesan yang sudah ada.
 * Fungsi ini sekarang hanya akan menyertakan 'reply_markup' jika keyboard
 * benar-benar disediakan, untuk mencegah error "Bad Request".
 * @param {string} teksPesan - Teks baru untuk pesan.
 * @param {object | null} inlineKeyboard - Objek keyboard baru, atau null jika tidak ada.
 * @param {string} chatId - ID dari chat.
 * @param {string} messageId - ID dari pesan yang akan diedit.
 * @param {object} config - Objek konfigurasi bot.
 */
function editMessageText(teksPesan, inlineKeyboard, chatId, messageId, config) {
  // [PERBAIKAN] Membuat payload dasar terlebih dahulu.
  const payloadData = {
    chat_id: String(chatId),
    message_id: parseInt(messageId),
    text: teksPesan,
    parse_mode: "HTML",
  };

  // [PERBAIKAN] Hanya tambahkan 'reply_markup' jika 'inlineKeyboard' tidak null.
  if (inlineKeyboard) {
    payloadData.reply_markup = JSON.stringify(inlineKeyboard);
  }

  // Panggil API dengan payload yang sudah benar.
  return callTelegramApi("editMessageText", payloadData, config);
}

/**
 * [OPTIMALISASI] Fungsi ini sekarang hanya menyiapkan data dan mendelegasikannya ke callTelegramApi.
 */
function answerCallbackQuery(callbackQueryId, config) {
  return callTelegramApi("answerCallbackQuery", { callback_query_id: callbackQueryId }, config);
}

/**
 * [BARU v1.3.0] Mengirim pesan foto ke Telegram.
 * @param {Blob} photoBlob - Objek Blob gambar yang akan dikirim.
 * @param {string} caption - Teks caption untuk foto.
 * @param {object} config - Objek konfigurasi bot.
 * @param {string|null} targetChatId - ID chat tujuan jika berbeda dari default.
 * @returns {object|null} Objek respons dari Telegram atau null jika gagal.
 */
function kirimFotoTelegram(photoBlob, caption, config, targetChatId = null) {
  const chatTujuan = targetChatId || String(config.TELEGRAM_CHAT_ID);
  if (!chatTujuan) {
    console.error("ID Chat tujuan tidak valid.");
    return null;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendPhoto`;

  // Untuk mengirim file, payload harus dalam format 'multipart/form-data'
  const payload = {
    chat_id: chatTujuan,
    caption: caption,
    parse_mode: "HTML",
    photo: photoBlob,
  };

  const options = {
    method: "post",
    payload: payload,
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(`Gagal mengirim foto via API Telegram. Kode: ${responseCode}. Respons: ${responseBody}`);
      return null;
    }
    return JSON.parse(responseBody);
  } catch (e) {
    console.error(`Gagal total mengirim foto via API Telegram. Error: ${e.message}`);
    return null;
  }
}
