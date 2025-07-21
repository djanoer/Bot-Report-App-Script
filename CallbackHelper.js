/**
 * @file CallbackHelper.js
 * @author Djanoer Team
 * @date 2023-10-27
 * @version 1.0.0
 *
 * @description
 * Pustaka terpusat untuk membuat callback data yang stateful dan konsisten.
 * Mencegah error dengan memastikan semua callback mengikuti format standar:
 * 'machineName:action:sessionId'
 */
const CallbackHelper = {
  /**
   * Membuat callback data standar.
   * @param {string} machine - Nama mesin keadaan (mis. 'search_machine').
   * @param {string} action - Aksi yang akan dilakukan (mis. 'show_list').
   * @param {object} data - Objek data yang akan disimpan dalam sesi.
   * @param {object} config - Objek konfigurasi bot.
   * @returns {string} String callback data yang sudah diformat.
   */
  build: function(machine, action, data, config) {
    const sessionId = createCallbackSession(data, config);
    return `${machine}:${action}:${sessionId}`;
  },

  /**
   * Helper spesifik untuk tombol batal.
   * @param {string} machine - Nama mesin keadaan yang menangani pembatalan.
   * @param {object} config - Objek konfigurasi bot.
   * @returns {string} String callback data untuk aksi batal.
   */
  cancel: function(machine, config) {
    const sessionId = createCallbackSession({}, config); // Sesi kosong
    return `${machine}:cancel:${sessionId}`;
  }
};