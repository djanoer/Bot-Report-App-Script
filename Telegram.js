/**
 * @file Telegram.js
 * @author Djanoer Team
 * @date 2023-01-05
 *
 * @description
 * Bertindak sebagai lapisan abstraksi (wrapper) untuk semua komunikasi dengan
 * Telegram Bot API. Semua panggilan keluar ke Telegram harus melalui file ini.
 */

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
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payloadData),
    muteHttpExceptions: true // Penting: Mencegah script berhenti total jika ada error HTTP (misal: 404, 400).
  };

  try {
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseBody = response.getContentText();

    if (responseCode !== 200) {
      console.error(`Gagal memanggil API Telegram (Metode: ${method}). Kode: ${responseCode}. Respons: ${responseBody}`);
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
  const { config } = getBotState();
  const webAppUrlBase = "https://script.google.com/macros/s/AKfycbzaevYC5eSTSQcoghSSHBryqjJfXXmV3P440Y_H5_K6wTVYblhby7jZ2nP7uG7c_ei3/exec";

  if (webAppUrlBase.includes("MASUKKAN")) {
    // Menggunakan console.error untuk log yang lebih jelas jika dijalankan dari editor
    console.error("GAGAL: Harap masukkan URL Web App Anda di dalam fungsi setWebhook sebelum menjalankannya.");
    return;
  }

  const webAppUrlWithToken = `${webAppUrlBase}?token=${config.WEBHOOK_BOT_TOKEN}`;
  const telegramApiUrl = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/setWebhook?url=${webAppUrlWithToken}`;

  try {
    const response = UrlFetchApp.fetch(telegramApiUrl);
    const responseText = response.getContentText();

    // Memberikan feedback ke log, bukan ke UI
    console.log("Respons dari setWebhook: " + responseText);

    // Cek jika respons dari Telegram berisi "ok":true
    const jsonResponse = JSON.parse(responseText);
    if (jsonResponse.ok) {
        console.log("SUKSES: Webhook berhasil diatur!");
    } else {
        console.error("GAGAL: Telegram melaporkan masalah saat mengatur webhook. Detail: " + responseText);
    }

  } catch (e) {
    // Memberikan feedback error ke log
    console.error(`Gagal total saat mengatur webhook: ${e.message}`);
  }
}

/**
 * [FUNGSI BARU] Menghapus webhook yang sedang aktif di Telegram
 * dengan mengirimkan parameter URL kosong.
 */
function hapusWebhook() {
  const { config } = getBotState();

  console.log("Memulai proses penghapusan webhook...");

  // Memanggil API Telegram dengan method 'setWebhook' dan URL kosong
  const response = callTelegramApi("setWebhook", { url: "" }, config);

  if (response && response.ok) {
    const successMsg = "Webhook telah berhasil dihapus dari server Telegram.";
    console.log(successMsg, response);
    // Menampilkan notifikasi pop-up di Spreadsheet
    showUiFeedback("Sukses!", successMsg);
  } else {
    const errorMsg = "Gagal menghapus webhook.";
    console.error(errorMsg, response);
    showUiFeedback("Gagal!", `${errorMsg} Silakan periksa log eksekusi untuk detail.`);
  }
}

/**
 * [REFACTORED V.1.2] Mengirim pesan ke Telegram dengan logika pemilihan Chat ID
 * yang ketat berdasarkan lingkungan (ENVIRONMENT).
 */
function kirimPesanTelegram(teksPesan, config, parseMode = "HTML", inlineKeyboard = null, targetChatId = null) {
  const TELEGRAM_MESSAGE_LIMIT = 4096;
  let chatTujuan;

  // Logika Pemilih Otomatis yang Diperkuat
  if (config.ENVIRONMENT === 'DEV') {
     // Jika di DEV, SELALU gunakan chat ID DEV, abaikan parameter targetChatId.
     chatTujuan = String(config.TELEGRAM_CHAT_ID_DEV);
  } else {
     // Jika di PROD (atau lingkungan lain), gunakan targetChatId jika ada, atau fallback ke chat ID utama.
     chatTujuan = targetChatId || String(config.TELEGRAM_CHAT_ID);
  }

  if (!chatTujuan || chatTujuan === "undefined") {
    console.error("ID Chat tujuan tidak valid atau tidak diatur di Konfigurasi.");
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
    return callTelegramApi('sendMessage', payloadData, config);
  }

  console.log(`Pesan terlalu panjang (${teksPesan.length} karakter), akan dibagi.`);
  const chunks = [];
  let currentChunk = "";
  const lines = teksPesan.split('\n');

  for (const line of lines) {
    if (currentChunk.length + line.length + 1 > TELEGRAM_MESSAGE_LIMIT) {
      chunks.push(currentChunk);
      currentChunk = "";
    }
    currentChunk += line + '\n';
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
    
    finalResponse = callTelegramApi('sendMessage', payloadData, config);
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
    parse_mode: 'HTML'
  };
  
  // [PERBAIKAN] Hanya tambahkan 'reply_markup' jika 'inlineKeyboard' tidak null.
  if (inlineKeyboard) {
    payloadData.reply_markup = JSON.stringify(inlineKeyboard);
  }
  
  // Panggil API dengan payload yang sudah benar.
  return callTelegramApi('editMessageText', payloadData, config);
}

/**
 * [OPTIMALISASI] Fungsi ini sekarang dapat menampilkan teks notifikasi opsional.
 */
function answerCallbackQuery(callbackQueryId, config, text = null) {
  const payloadData = {
    callback_query_id: callbackQueryId
  };
  if (text) {
    payloadData.text = text;
  }
  return callTelegramApi('answerCallbackQuery', payloadData, config);
}

/**
 * [REFACTOR FINAL & TANGGUH] Mengirim pesan foto ke Telegram.
 * Versi ini membangun permintaan 'multipart/form-data' secara manual untuk
 * memastikan keandalan pengiriman file secara maksimal.
 */
function kirimFotoTelegram(photoBlob, caption, config, targetChatId = null) {
  let chatTujuan;

  if (config.ENVIRONMENT === "DEV") {
    chatTujuan = targetChatId || String(config.TELEGRAM_CHAT_ID_DEV);
  } else {
    chatTujuan = targetChatId || String(config.TELEGRAM_CHAT_ID);
  }

  if (!chatTujuan) {
    console.error("ID Chat tujuan tidak valid.");
    return null;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  
  // --- PERBAIKAN UTAMA: MEMBANGUN PAYLOAD MANUAL ---
  const boundary = "------" + Utilities.getUuid();
  const data = {
    chat_id: chatTujuan,
    caption: caption,
    parse_mode: 'HTML'
  };

  let payload = "";
  for (const key in data) {
    payload += "--" + boundary + "\r\n";
    payload += "Content-Disposition: form-data; name=\"" + key + "\"\r\n\r\n";
    payload += data[key] + "\r\n";
  }

  payload += "--" + boundary + "\r\n";
  payload += "Content-Disposition: form-data; name=\"photo\"; filename=\"grafik.png\"\r\n";
  payload += "Content-Type: image/png\r\n\r\n";
  
  const payloadBytes = Utilities.newBlob(payload).getBytes();
  const photoBytes = photoBlob.getBytes();
  const footerBytes = Utilities.newBlob("\r\n--" + boundary + "--\r\n").getBytes();
  
  const requestBody = Utilities.newBlob(payloadBytes.concat(photoBytes, footerBytes)).setContentType("multipart/form-data; boundary=" + boundary);
  // --- AKHIR PERBAIKAN ---

  const options = {
    method: 'post',
    payload: requestBody, // Gunakan request body yang sudah kita bangun
    muteHttpExceptions: true
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
