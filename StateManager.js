// ===== FILE: StateManager.gs =====

/**
 * Mengelola state (kondisi) aplikasi untuk setiap pengguna.
 * State disimpan di CacheService untuk persistensi sementara.
 */
const StateManager = (function() {
  const CACHE_DURATION_SECONDS = 1800; // State akan bertahan selama 30 menit

  /**
   * Mengambil state terakhir dari seorang pengguna.
   * @param {string} userId - ID unik pengguna.
   * @returns {object | null} Objek state pengguna, atau null jika tidak ada.
   */
  function getUserState(userId) {
    const cache = CacheService.getUserCache();
    const stateJSON = cache.get(`state_${userId}`);
    return stateJSON ? JSON.parse(stateJSON) : null;
  }

  /**
   * Memperbarui dan menyimpan state untuk seorang pengguna.
   * @param {string} userId - ID unik pengguna.
   * @param {object} newState - Objek berisi properti state yang akan diperbarui.
   * @returns {object} State baru yang telah diperbarui secara keseluruhan.
   */
  function updateUserState(userId, newState) {
    const currentState = getUserState(userId) || {};
    const updatedState = { ...currentState, ...newState };
    
    const cache = CacheService.getUserCache();
    cache.put(`state_${userId}`, JSON.stringify(updatedState), CACHE_DURATION_SECONDS);
    
    return updatedState;
  }

  /**
   * Menghapus state seorang pengguna dari cache.
   * @param {string} userId - ID unik pengguna.
   */
  function clearUserState(userId) {
    const cache = CacheService.getUserCache();
    cache.remove(`state_${userId}`);
  }

  return {
    getState: getUserState,
    updateState: updateUserState,
    clearState: clearUserState
  };
})();
