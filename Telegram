// ===== FILE: Telegram.gs =====

function setWebhook() {
    const config = bacaKonfigurasi();
    // GANTI DENGAN URL WEB APP ANDA YANG DIDAPAT SETELAH DEPLOY
    const webAppUrlBase = "https://script.google.com/macros/s/AKfycbyaoqKuIwptE6k7WlUCaU49YSouDcUoB63mEApRPS_qRC9J4smIkgcdXNXLq6ZiZlzt/exec"; 
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
  
  function kirimPesanTelegram(teksPesan, config, parseMode = 'HTML', inlineKeyboard = null, targetChatId = null) {
    if (String(config.TELEGRAM_BOT_TOKEN).includes("MASUKKAN")) {
      console.error("Token Bot Telegram belum diisi.");
      return;
    }
    
    const chatTujuan = targetChatId || String(config.TELEGRAM_CHAT_ID);
    if (!chatTujuan) {
        console.error("ID Chat tujuan tidak valid.");
        return;
    }
  
    const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;
    const payloadData = {
      chat_id: chatTujuan,
      text: teksPesan,
      parse_mode: parseMode
    };
    if (inlineKeyboard) {
      payloadData.reply_markup = JSON.stringify(inlineKeyboard);
    }
    const payload = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payloadData)
    };
    try {
      UrlFetchApp.fetch(url, payload);
    } catch (e) {
      console.error(`Gagal mengirim pesan ke Telegram (Chat ID: ${chatTujuan}). Error: ${e.message}`);
    }
  }
  
  function answerCallbackQuery(callbackQueryId, config) {
    const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    const payload = { method: 'post', contentType: 'application/json', payload: JSON.stringify({ callback_query_id: callbackQueryId })};
    try { UrlFetchApp.fetch(url, payload); } 
    catch (e) { console.error(`Gagal menjawab callback query. Error: ${e.message}`); }
  }