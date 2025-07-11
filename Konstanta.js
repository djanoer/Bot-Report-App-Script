// ===== FILE: Konstanta.gs =====

const KONSTANTA = {
  // Nama-nama sheet yang dibuat & dikelola oleh skrip
  NAMA_SHEET: {
    KONFIGURASI: 'Konfigurasi',
    HAK_AKSES: 'Hak Akses',
    LOG_PERUBAHAN: 'Log Perubahan',
    LOGIKA_MIGRASI: 'Logika Migrasi',
    CATATAN_VM: 'Catatan VM',
  },
  
  // Callback data untuk tombol
  CALLBACK: {
    IGNORE: 'ignore',
    EXPORT_LOG_TODAY: 'run_export_log_today',
    EXPORT_LOG_7_DAYS: 'run_export_log_7_days',
    EXPORT_LOG_30_DAYS: 'run_export_log_30_days',
    EXPORT_UPTIME_CAT_1: 'export_uptime_0_1',
    EXPORT_UPTIME_CAT_2: 'export_uptime_1_2',
    EXPORT_UPTIME_CAT_3: 'export_uptime_2_3',
    EXPORT_UPTIME_CAT_4: 'export_uptime_over_3',
    EXPORT_UPTIME_INVALID: 'export_uptime_invalid',
    EXPORT_ALL_VMS: 'export_vms_all',
    EXPORT_VC01_VMS: 'export_vms_vc01',
    EXPORT_VC02_VMS: 'export_vms_vc02'
  },

  // Callback data tiket
  CALLBACK_TIKET: {
    PREFIX: 'ticket_',
    VIEW_CATEGORY: 'ticket_view_cat_',
    VIEW_DETAIL: 'ticket_view_detail_',
    BACK_TO_SUMMARY: 'ticket_back_summary',
    BACK_TO_LIST: 'ticket_back_list_',
  },
  
  // Callback data catatan
  CALLBACK_CATATAN: {
    PREFIX: 'note_',
    EDIT_ADD: 'note_edit_add_',
    DELETE: 'note_delete_',
    DELETE_CONFIRM: 'note_delete_confirm_'
  },

  // Callback data histori
  CALLBACK_HISTORY: {
    PREFIX: 'history_',
    NAVIGATE: 'history_nav', // Hanya perlu prefix navigasi, karena aksi lain (export) punya prefix sendiri
  },
  
  // Callback data cek VM
  CALLBACK_CEKVM: {
    PREFIX: 'cekvm_',
    HISTORY_PREFIX: 'cekvm_history_',
    CLUSTER_PREFIX: 'vmcl_',
    DATASTORE_PREFIX: 'vmds_',
    CLUSTER_NAV_PREFIX: 'cekvm_cluster_nav_', // Untuk navigasi halaman VM di cluster
    CLUSTER_EXPORT_PREFIX: 'cekvm_cluster_export_', // Untuk ekspor VM di cluster
    DATASTORE_EXPORT_PREFIX: 'cekvm_ds_export_', // Untuk ekspor VM di datastore
    DATASTORE_LIST_VMS_PREFIX: 'cekvm_ds_list_', // Untuk melihat daftar VM di datastore
    DATASTORE_NAV_PREFIX: 'cekvm_ds_nav_',       // Untuk navigasi halaman VM di datastore
    BACK_TO_DETAIL_PREFIX: 'cekvm_back_to_detail_',
  },
  
  // Aksi spesifik untuk pagination
  PAGINATION_ACTIONS: {
    NAVIGATE: 'nav',
    EXPORT: 'export',
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
    KATEGORI_KRITIKALITAS: 'KATEGORI_KRITIKALITAS',
    KATEGORI_ENVIRONMENT: 'KATEGORI_ENVIRONMENT',
    SKOR_KRITIKALITAS: 'SKOR_KRITIKALITAS',
    KOLOM_PANTAU_DS: 'KOLOM_PANTAU_DATASTORE',
    LOG_TOLERANCE_PROV_GB: 'LOG_TOLERANCE_PROV_GB',
    
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

  // Batas dan nilai default
  LIMIT: {
    PAGINATION_ENTRIES: 15,
    LOG_ARCHIVE_THRESHOLD: 1000,
    LOCK_TIMEOUT_MS: 10000, // Timeout untuk script lock
    // Ambang batas untuk deteksi aktivitas tinggi/anomali dalam satu periode laporan
    HIGH_ACTIVITY_THRESHOLD: 50,
    SESSION_TIMEOUT_SECONDS: 900 // Durasi 15 menit untuk session callback
  },

  // Nama perintah bot
  PERINTAH_BOT: {
    DAFTAR: '/daftar', 
    LAPORAN: '/laporan', 
    SYNC_LAPORAN: '/sync_laporan', 
    PROVISIONING: '/provisioning', 
    CEK_TIKET: '/cektiket', 
    MIGRASI_CHECK: '/migrasicheck', 
    EXPORT: '/export', 
    CEK_VM: '/cekvm', 
    HISTORY: '/history', 
    CEK_HISTORY: '/cekhistory', 
    ARSIPKAN_LOG: '/arsipkanlog', 
    CLEAR_CACHE: '/clearcache', 
    INFO: '/info',
    DISTRIBUSI_VM: '/distribusi_vm',
    CEK_KONDISI: '/cek_kondisi',
  },

  // String yang sering digunakan
  UI_STRINGS: {
    SEPARATOR: "\n--------------------------------------------------\n",
  },
};