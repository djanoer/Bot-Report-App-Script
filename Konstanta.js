// ===== FILE: Konstanta.gs =====

const KONSTANTA = {
  // Nama-nama sheet yang dibuat & dikelola oleh skrip
  NAMA_SHEET: {
    KONFIGURASI: 'Konfigurasi',
    HAK_AKSES: 'Hak Akses',
    LOG_PERUBAHAN: 'Log Perubahan',
    LOGIKA_MIGRASI: 'Logika Migrasi'
  },
  // Menambahkan konstanta untuk callback data tombol
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
  // Menambahkan konstanta untuk callback data tiket
  CALLBACK_TIKET: {
    // Awalan untuk semua callback terkait tiket agar mudah diidentifikasi
    PREFIX: 'ticket_',
    // Aksi untuk melihat kategori usia tiket
    VIEW_CATEGORY: 'ticket_view_cat_', // akan diikuti nama kategori, misal: ticket_view_cat_gt1Month
    // Aksi untuk melihat detail tiket spesifik
    VIEW_DETAIL: 'ticket_view_detail_', // akan diikuti nomor tiket, misal: ticket_view_detail_CPR-283
    // Aksi untuk navigasi kembali
    BACK_TO_SUMMARY: 'ticket_back_summary',
    BACK_TO_LIST: 'ticket_back_list_' // akan diikuti nama kategori, misal: ticket_back_list_gt1Month
  },
  CALLBACK_HISTORY: {
    PREFIX: 'history_',
    NAVIGATE: 'history_page_'
  },
  // TAMBAHKAN OBJEK BARU INI
  CALLBACK_CEKVM: {
    PREFIX: 'cekvm_',
    NAVIGATE: 'cekvm_page_',   // Format: cekvm_page_1_searchterm
    EXPORT: 'cekvm_export_'   // Format: cekvm_export_searchterm
  },
  // Nama-nama untuk urutan kritikalitas
  TINGKAT_KRITIKALITAS: {
    'BRONZE': 1,
    'SILVER': 2,
    'GOLD': 3,
    'PLATINUM': 4,
    'CRITICAL': 5,
    'DEFAULT': 10 // Nilai default jika tidak ditemukan
  },
  // Nama-nama header untuk sheet Log Perubahan
  HEADER_LOG: {
    TIMESTAMP: 'Timestamp',
    ACTION: 'Action/Tipe perubahan',
    OLD_VAL: 'Old Value',
    NEW_VAL: 'New Value',
    DETAIL: 'Detail Perubahan'
  },
  // Nama-nama header kolom yang krusial untuk logika
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
  // Nama-nama header kolom Datastore
  HEADER_DS: {
    CAPACITY_GB: 'Capacity (GB)',
    CAPACITY_TB: 'Capacity (TB)',
    USED_PERCENT: 'Used Space (%)'
  },
  // Nama-nama header kolom Tiket
  HEADER_TIKET: {
    NAMA_VM: 'Name', // Kolom B
    KRITIKALITAS: 'Krtikalitas VM', // Kolom C
    LINK_TIKET: 'Link Tiket', // Kolom D
    KATEGORI: 'Kategori', // Kolom E
    TGL_CREATE: 'Tanggal Created Tiket', // Kolom F
    TGL_FU: 'Tanggal FU ke User', // Kolom H
    STATUS: 'Status Tiket', // Kolom I
    ACTION: 'Action', // Kolom J
    TGL_DONE: 'Tanggal Done Tiket', // Kolom K
    DEV_OPS: 'DEV/OPS by BIA 2024', // Kolom M
    KETERANGAN: 'Keterangan'
  },
  // Nama-nama kunci di sheet Konfigurasi
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
    //DS_UTAMA: 'KATA_KUNCI_DS_DIUTAMAKAN', tidak digunakan
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
  // Nama-nama file arsip
  NAMA_FILE: {
    ARSIP_VM: 'archive_vm.json',
    ARSIP_DS: 'archive_datastore.json'
  },
  // [BARU] Menambahkan konstanta untuk nama perintah bot
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
};