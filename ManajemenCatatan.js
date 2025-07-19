// ===== FILE: ManajemenCatatan.gs =====

/**
 * [PINDAH] Mengambil satu catatan spesifik untuk sebuah VM.
 */
function getVmNote(vmPrimaryKey, config) {
    const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
  
    if (!sheet || sheet.getLastRow() <= 1) {
      return null; 
    }
  
    const data = sheet.getDataRange().getValues();
    const headers = data.shift();
    const pkIndex = headers.indexOf("VM Primary Key");
    if (pkIndex === -1) {
      console.error("Struktur sheet Catatan VM tidak valid: Header 'VM Primary Key' tidak ditemukan.");
      return null;
    }
  
    const noteRow = data.find((row) => row[pkIndex] === vmPrimaryKey);
  
    if (noteRow) {
      const noteData = {};
      headers.forEach((header, index) => {
        noteData[header] = noteRow[index];
      });
      return noteData;
    }
  
    return null;
  }
  
  /**
   * [PINDAH] Menyimpan (Create) atau memperbarui (Update) catatan untuk sebuah VM.
   */
  function saveOrUpdateVmNote(vmPrimaryKey, noteText, userData) {
    const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return false;
  
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const pkIndex = headers.indexOf("VM Primary Key");
  
    let rowIndexToUpdate = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][pkIndex] === vmPrimaryKey) {
        rowIndexToUpdate = i + 1;
        break;
      }
    }
  
    const timestamp = new Date();
    const userName = userData.firstName || "Pengguna";
    const sanitizedNoteText = "'" + noteText; // Mencegah formula injection
  
    try {
      if (rowIndexToUpdate > -1) {
        sheet.getRange(rowIndexToUpdate, pkIndex + 2, 1, 3).setValues([[sanitizedNoteText, timestamp, userName]]);
      } else {
        sheet.appendRow([vmPrimaryKey, sanitizedNoteText, timestamp, userName]);
      }
      return true;
    } catch (e) {
      console.error(`Gagal menyimpan catatan untuk VM ${vmPrimaryKey}. Error: ${e.message}`);
      return false;
    }
  }
  
  /**
   * [PINDAH] Menghapus (hard delete) catatan untuk sebuah VM.
   */
  function deleteVmNote(vmPrimaryKey) {
    const sheetName = KONSTANTA.NAMA_SHEET.CATATAN_VM;
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
  
    if (!sheet || sheet.getLastRow() <= 1) return false;
  
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const pkIndex = headers.indexOf("VM Primary Key");
  
    for (let i = 1; i < data.length; i++) {
      if (data[i][pkIndex] === vmPrimaryKey) {
        const rowIndexToDelete = i + 1;
        try {
          sheet.deleteRow(rowIndexToDelete);
          return true;
        } catch (e) {
          console.error(`Gagal menghapus baris ${rowIndexToDelete}. Error: ${e.message}`);
          return false;
        }
      }
    }
    return false;
  }
  
  
  /**
   * [BARU] Mesin Keadaan untuk semua interaksi yang berhubungan dengan catatan VM.
   */
  function noteMachine(update, action, config) {
    const userEvent = update.callback_query;
    const sessionData = userEvent.sessionData;
    const chatId = userEvent.message.chat.id;
    const messageId = userEvent.message.message_id;
    const userId = String(userEvent.from.id);
    const pk = sessionData.pk;
    
    if (action === 'prompt_add') {
      // Simpan state pengguna, menandakan bot sedang menunggu input teks untuk catatan
      setUserState(userId, { action: "AWAITING_NOTE_INPUT", pk: pk, messageId: messageId });
      
      const promptMessage = `✏️ Silakan kirimkan teks catatan untuk VM dengan PK: <code>${escapeHtml(pk)}</code>.\n\nKirim "batal" untuk membatalkan.`;
      editMessageText(promptMessage, null, chatId, messageId, config);
  
    } else if (action === 'prompt_delete') {
      const confirmationText = `❓ Yakin ingin menghapus catatan untuk VM <code>${escapeHtml(pk)}</code>?`;
      const confirmationSessionId = createCallbackSession({ pk: pk }, config);
      const confirmationKeyboard = {
        inline_keyboard: [
          [
            { text: "✅ Ya, Hapus", callback_data: `note_machine:confirm_delete:${confirmationSessionId}` },
            { text: "❌ Batal", callback_data: `search_machine:back_to_detail:${confirmationSessionId}` },
          ],
        ],
      };
      editMessageText(confirmationText, confirmationKeyboard, chatId, messageId, config);
  
    } else if (action === 'confirm_delete') {
      if (deleteVmNote(pk)) {
        // Refresh tampilan detail VM setelah berhasil hapus
        const { headers, results } = searchVmOnSheet(pk, config);
        if (results.length > 0) {
          const { pesan, keyboard } = formatVmDetail(results[0], headers, config);
          editMessageText("✅ Catatan berhasil dihapus.\n\n" + pesan, keyboard, chatId, messageId, config);
        } else {
          editMessageText(`✅ Catatan berhasil dihapus.`, null, chatId, messageId, config);
        }
      } else {
        editMessageText(`❌ Gagal menghapus catatan.`, null, chatId, messageId, config);
      }
    } else {
      console.warn("Aksi tidak dikenal di noteMachine:", action);
    }
  }