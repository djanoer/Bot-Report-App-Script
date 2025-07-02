// ===== FILE: Konstanta.gs =====

const KONSTANTA = {
  // Nama-nama sheet yang dibuat & dikelola oleh skrip
  NAMA_SHEET: {
    KONFIGURASI: 'Konfigurasi',
    HAK_AKSES: 'Hak Akses',
    LOG_PERUBAHAN: 'Log Perubahan',
    LOGIKA_MIGRASI: 'Logika Migrasi'
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
    BACK_TO_LIST: 'ticket_back_list_'
  },

  // Callback data histori
  CALLBACK_HISTORY: {
    PREFIX: 'history_',
    NAVIGATE: 'history_nav' // Hanya perlu prefix navigasi, karena aksi lain (export) punya prefix sendiri
  },
  
  // Callback data cek VM
  CALLBACK_CEKVM: {
    PREFIX: 'cekvm_',
  },
  
  // Aksi spesifik untuk pagination
  PAGINATION_ACTIONS: {
    NAVIGATE: 'nav',
    EXPORT: 'export'
  },

  // Tingkat kritikalitas
  TINGKAT_KRITIKALITAS: {
    'BRONZE': 1, 
    'SILVER': 2, 
    'GOLD': 3, 
    'PLATINUM': 4, 
    'CRITICAL': 5, 
    'DEFAULT': 10
  },
  
  // Header sheet Log Perubahan
  HEADER_LOG: {
    TIMESTAMP: 'Timestamp', 
    ACTION: 'Action/Tipe perubahan', 
    OLD_VAL: 'Old Value', 
    NEW_VAL: 'New Value', 
    DETAIL: 'Detail Perubahan'
  },
  
  // Header kolom krusial VM
  HEADER_VM: {
    PK: 'Primary Key', 
    VM_NAME: 'Virtual Machine', 
    IP: 'IP Address', 
    GUEST_OS: 'Guest OS (Manual)', 
    STATE: 'State', 
    VCENTER: 'vCenter', 
    CLUSTER: 'Cluster', 
    UPTIME: 'Uptime', 
    CPU: 'CPU', 
    MEMORY: 'Memory', 
    PROV_GB: 'Provisioned Space (GB)', 
    PROV_TB: 'Provisioned Space (TB)', 
    KRITIKALITAS: 'Kritikalitas By BIA 2024', 
    KELOMPOK_APP: 'Kelompok Aplikasi by BIA VM 2024', 
    DEV_OPS: 'DEV/OPS by BIA 2024'
  },
  
  // Header kolom Datastore
  HEADER_DS: {
    CAPACITY_GB: 'Capacity (GB)', 
    CAPACITY_TB: 'Capacity (TB)', 
    USED_PERCENT: 'Used Space (%)'
  },
  
  // Header kolom Tiket
  HEADER_TIKET: {
    NAMA_VM: 'Name', 
    KRITIKALITAS: 'Krtikalitas VM', 
    LINK_TIKET: 'Link Tiket', 
    KATEGORI: 'Kategori', 
    TGL_CREATE: 'Tanggal Created Tiket', 
    TGL_FU: 'Tanggal FU ke User', 
    STATUS: 'Status Tiket', 
    ACTION: 'Action', 
    TGL_DONE: 'Tanggal Done Tiket', 
    DEV_OPS: 'DEV/OPS by BIA 2024', 
    KETERANGAN: 'Keterangan'
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
    VM_PROV_GB_HEADER: 'HEADER_VM_PROVISIONED_GB', 
    THRESHOLD_DS_USED: 'THRESHOLD_DS_USED_PERCENT', 
    THRESHOLD_VM_UPTIME: 'THRESHOLD_VM_UPTIME_DAYS', 
    KRITIKALITAS_PANTAU: 'KRITIKALITAS_VM_DIPANTAU', 
    STATUS_TIKET_AKTIF: 'STATUS_TIKET_AKTIF'
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
    LOG_ARCHIVE_THRESHOLD: 5000,
    LOCK_TIMEOUT_MS: 10000, // Timeout untuk script lock
    // Ambang batas untuk deteksi aktivitas tinggi/anomali dalam satu periode laporan
    HIGH_ACTIVITY_THRESHOLD: 50
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
    INFO: '/info'
  },
  // String yang sering digunakan
  UI_STRINGS: {
    SEPARATOR: "\n\n--------------------------------------------------\n"
  },
};