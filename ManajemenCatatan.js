/**
 * @file ManajemenCatatan.js
 * @author Djanoer Team
 * @date 2023-08-01
 *
 * @description
 * Mengelola semua operasi Create, Read, Update, Delete (CRUD) untuk catatan VM.
 * Juga berisi "Mesin Keadaan" (noteMachine) untuk menangani alur interaktif
 * penambahan dan penghapusan catatan dari Telegram.
 */

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
