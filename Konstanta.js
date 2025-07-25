/**
 * @file Konstanta.js
 * @author Djanoer Team
 * @date 2023-01-11
 *
 * @description
 * File terpusat untuk semua nilai konstan. Tujuannya untuk menghindari "magic strings"
 * dan memudahkan pemeliharaan dengan menyediakan satu sumber kebenaran untuk
 * nama sheet, kunci konfigurasi, nama perintah bot, dan lainnya.
 */

const KONSTANTA = {
    // Nama-nama sheet yang dibuat & dikelola oleh skrip
  NAMA_SHEET: {
    KONFIGURASI: 'Konfigurasi',
    HAK_AKSES: 'Hak Akses',
    LOG_PERUBAHAN: 'Log Perubahan',
    LOGIKA_MIGRASI: 'Logika Migrasi',
    CATATAN_VM: 'Catatan VM',
    RULE_PROVISIONING: 'Rule Provisioning',
    KEBIJAKAN_OVERCOMMIT_CLUSTER: 'Kebijakan Overcommit Cluster', 
  },
  
  // Kunci di sheet Konfigurasi
  KUNCI_KONFIG: {
    ID_SUMBER: 'SUMBER_SPREADSHEET_ID', 
    SHEET_VM: 'NAMA_SHEET_DATA_UTAMA', 
    SHEET_DS: 'NAMA_SHEET_DATASTORE', 
    TIKET_SPREADSHEET_ID: 'TIKET_SPREADSHEET_ID', 
    NAMA_SHEET_TIKET: 'NAMA_SHEET_TIKET', 
    FOLDER_ARSIP: 'FOLDER_ID_ARSIP', 
    FOLDER_EKSPOR: 'FOLDER_ID_HASIL_EKSPOR', 
    FOLDER_ARSIP_LOG: 'FOLDER_ID_ARSIP_LOG', 
    KOLOM_PANTAU: 'KOLOM_YANG_DIPANTAU', 
    MAP_ENV: 'PEMETAAN_ENVIRONMENT', 
    DS_KECUALI: 'KATA_KUNCI_DS_DIKECUALIKAN', 
    SHEET_LOGIKA_MIGRASI: 'NAMA_SHEET_LOGIKA_MIGRASI', 
    DS_NAME_HEADER: 'HEADER_DATASTORE_NAME',
    VM_DS_COLUMN_HEADER: 'HEADER_VM_DATASTORE_COLUMN', 
    DS_PROV_GB_HEADER: 'HEADER_DATASTORE_PROVISIONED_GB', 
    THRESHOLD_DS_USED: 'THRESHOLD_DS_USED_PERCENT', 
    THRESHOLD_VM_UPTIME: 'THRESHOLD_VM_UPTIME_DAYS', 
    KRITIKALITAS_PANTAU: 'KRITIKALITAS_VM_DIPANTAU', 
    STATUS_TIKET_AKTIF: 'STATUS_TIKET_AKTIF',
    STATUS_TIKET_SELESAI: 'STATUS_TIKET_SELESAI',
    KATEGORI_KRITIKALITAS: 'KATEGORI_KRITIKALITAS',
    KATEGORI_ENVIRONMENT: 'KATEGORI_ENVIRONMENT',
    SKOR_KRITIKALITAS: 'SKOR_KRITIKALITAS',
    KOLOM_PANTAU_DS: 'KOLOM_PANTAU_DATASTORE',
    LOG_TOLERANCE_PROV_GB: 'LOG_TOLERANCE_PROV_GB',
    FOLDER_ID_ARSIP_LOG_STORAGE: 'FOLDER_ID_ARSIP_LOG_STORAGE',
    ATURAN_NAMA_DEFAULT: 'ATURAN_NAMA_DEFAULT',
    
    HEADER_VM_PK: 'HEADER_VM_PK',
    HEADER_VM_NAME: 'HEADER_VM_NAME',
    HEADER_VM_IP: 'HEADER_VM_IP',
    HEADER_VM_GUEST_OS: 'HEADER_VM_GUEST_OS',
    HEADER_VM_STATE: 'HEADER_VM_STATE',
    HEADER_VM_VCENTER: 'HEADER_VM_VCENTER',
    HEADER_VM_CLUSTER: 'HEADER_VM_CLUSTER',
    HEADER_VM_UPTIME: 'HEADER_VM_UPTIME',
    HEADER_VM_CPU: 'HEADER_VM_CPU',
    HEADER_VM_MEMORY: 'HEADER_VM_MEMORY',
    HEADER_VM_PROV_GB: 'HEADER_VM_PROV_GB',
    HEADER_VM_PROV_TB: 'HEADER_VM_PROV_TB',
    HEADER_VM_KRITIKALITAS: 'HEADER_VM_KRITIKALITAS',
    HEADER_VM_KELOMPOK_APP: 'HEADER_VM_KELOMPOK_APP',
    HEADER_VM_DEV_OPS: 'HEADER_VM_DEV_OPS',
    HEADER_VM_ENVIRONMENT: 'HEADER_VM_ENVIRONMENT',
    HEADER_VM_NO_TIKET: 'HEADER_VM_NO_TIKET',
    HEADER_VM_HOSTS: 'HEADER_VM_HOSTS',
    HEADER_VM_TANGGAL_SETUP: 'HEADER_VM_TANGGAL_SETUP',
    MAP_ALIAS_STORAGE: 'MAP_ALIAS_STORAGE',
    MAP_KAPASITAS_STORAGE: 'MAP_KAPASITAS_STORAGE',
    SYSTEM_LIMITS: 'SYSTEM_LIMITS',
    STORAGE_UTILIZATION_THRESHOLDS: 'STORAGE_UTILIZATION_THRESHOLDS',
    
    HEADER_DS_CAPACITY_GB: 'HEADER_DS_CAPACITY_GB',
    HEADER_DS_CAPACITY_TB: 'HEADER_DS_CAPACITY_TB',
    HEADER_DS_PROV_DS_GB: 'HEADER_DS_PROV_DS_GB',
    HEADER_DS_PROV_DS_TB: 'HEADER_DS_PROV_DS_TB',
    HEADER_DS_USED_PERCENT: 'HEADER_DS_USED_PERCENT',

    HEADER_LOG_TIMESTAMP: 'HEADER_LOG_TIMESTAMP',
    HEADER_LOG_ACTION: 'HEADER_LOG_ACTION',
    HEADER_LOG_OLD_VAL: 'HEADER_LOG_OLD_VAL',
    HEADER_LOG_NEW_VAL: 'HEADER_LOG_NEW_VAL',
    HEADER_LOG_DETAIL: 'HEADER_LOG_DETAIL',
    HEADER_LOG_TIPE_LOG: 'HEADER_LOG_TIPE_LOG',

    HEADER_TIKET_NAMA_VM: 'HEADER_TIKET_NAMA_VM',
    HEADER_TIKET_KRITIKALITAS: 'HEADER_TIKET_KRITIKALITAS',
    HEADER_TIKET_LINK: 'HEADER_TIKET_LINK',
    HEADER_TIKET_KATEGORI: 'HEADER_TIKET_KATEGORI',
    HEADER_TIKET_TGL_CREATE: 'HEADER_TIKET_TGL_CREATE',
    HEADER_TIKET_TGL_FU: 'HEADER_TIKET_TGL_FU',
    HEADER_TIKET_STATUS: 'HEADER_TIKET_STATUS',
    HEADER_TIKET_ACTION: 'HEADER_TIKET_ACTION',
    HEADER_TIKET_TGL_DONE: 'HEADER_TIKET_TGL_DONE',
    HEADER_TIKET_DEV_OPS: 'HEADER_TIKET_DEV_OPS',
    HEADER_TIKET_KETERANGAN: 'HEADER_TIKET_KETERANGAN'
  },
  
  // Nama file arsip
  NAMA_FILE: {
    ARSIP_VM: 'archive_vm.json',
    ARSIP_DS: 'archive_datastore.json'
  },

  // Nama-nama entitas untuk logging
  NAMA_ENTITAS: {
    VM: 'VM',
    DATASTORE: 'Datastore'
  },

  // Nama perintah bot
  PERINTAH_BOT: {
    // Laporan & Analisis
    LAPORAN: '/laporanharian',
    PROVISIONING: '/laporanprovisioning',
    DISTRIBUSI_VM: '/laporanaset',
    CEK_KONDISI: '/cekkesehatan',
    CEK_STORAGE: '/cekstorage',
    MIGRASI_CHECK: '/cekmigrasi',

    // Pencarian & Riwayat
    CEK_VM: '/carivm',
    HISTORY: '/riwayatvm',
    CEK_HISTORY: '/riwayathariini',
    CEK_CLUSTER: '/cekcluster',
    
    // Interaktif & Aksi
    CEK_TIKET: '/tiketutilisasi',
    REKOMENDASI_SETUP: '/setupvm',
    GRAFIK: '/grafik',
    SIMULASI: '/simulasi',
    LOG_REPORT: '/catatlaporanstorage',
    
    // Utilitas
    EXPORT: '/menuekspor',
    INFO: '/info',
    STATUS: '/status',
    DAFTAR: '/daftar',

    // Administratif
    SYNC_LAPORAN: '/syncdata',
    ARSIPKAN_LOG: '/jalankanarsip',
    CLEAR_CACHE: '/bersihkancache',
    MANAGE_CONFIG: '/manageconfig',
  },

  // String yang sering digunakan
  UI_STRINGS: {
    SEPARATOR: "\n--------------------------------------------------\n",
  },

  // Kumpulan pengenal internal yang digunakan dalam kode,
  // tidak untuk diubah oleh pengguna via sheet.
  TIPE_INTERNAL: {
    EKSPOR_PERINGATAN_VM: 'all_vm_alerts',
  },

  // Perintah yang hanya bisa diakses oleh Admin
  PERINTAH_ADMIN: [
    '/syncdata',
    '/jalankanarsip',
    '/bersihkancache',
    '/manageconfig'
  ],
};