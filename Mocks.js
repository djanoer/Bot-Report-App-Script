// ===== FILE: Mocks.gs =====

/**
 * Pustaka untuk membuat objek tiruan (mock objects) dari layanan Google
 * untuk keperluan pengujian unit yang terisolasi dan andal.
 */
const Mocks = (function() {

    // Objek tiruan untuk merepresentasikan satu Sheet
    function MockSheet(name, data) {
      this.name = name;
      this.data = data || [[]]; // data adalah array 2D, [baris][kolom]
      this.lastRow = this.data.length;
      this.lastCol = this.data.length > 0 ? this.data[0].length : 0;
  
      this.getName = function() {
        return this.name;
      };
      this.getLastRow = function() {
        return this.lastRow;
      };
      this.getLastColumn = function() {
          return this.lastCol;
      };
      this.getRange = function(row, col, numRows, numCols) {
        // Mensimulasikan getRange().getValues()
        const rangeData = [];
        const endRow = row + (numRows || 1) - 1;
        const endCol = col + (numCols || 1) - 1;
        
        for (let i = row - 1; i < endRow && i < this.lastRow; i++) {
          const rowData = [];
          for (let j = col - 1; j < endCol && j < this.lastCol; j++) {
            rowData.push(this.data[i][j]);
          }
          rangeData.push(rowData);
        }
        
        // Kembalikan objek tiruan Range
        return {
          getValues: function() {
            return rangeData;
          },
          getValue: function() {
              return rangeData.length > 0 ? rangeData[0][0] : null;
          }
        };
      };
      this.getDataRange = function() {
          return this.getRange(1, 1, this.lastRow, this.lastCol);
      };
    }
  
    // Objek tiruan untuk merepresentasikan Spreadsheet
    function MockSpreadsheet(sheets) {
      this.sheets = sheets || []; // sheets adalah array dari MockSheet
  
      this.getSheetByName = function(name) {
        return this.sheets.find(s => s.getName() === name) || null;
      };
    }
    
    // Pabrik utama
    return {
      /**
       * Membuat Spreadsheet tiruan dengan sheet dan data yang ditentukan.
       * @param {Object} sheetData Objek di mana kuncinya adalah nama sheet
       * dan nilainya adalah data array 2D.
       * @returns {MockSpreadsheet} Objek Spreadsheet tiruan.
       */
      createMockSpreadsheet: function(sheetData) {
        const mockSheets = Object.keys(sheetData).map(name => {
          return new MockSheet(name, sheetData[name]);
        });
        return new MockSpreadsheet(mockSheets);
      }
    };
  
  })();