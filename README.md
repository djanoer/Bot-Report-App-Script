# Bot Laporan Infrastruktur Cerdas

![Google Apps Script](https://img.shields.io/badge/Google%20Apps%20Script-4285F4?style=for-the-badge&logo=google&logoColor=white)
![Telegram](https://img.shields.io/badge/Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)
![Google Sheets](https://img.shields.io/badge/Google%20Sheets-34A853?style=for-the-badge&logo=google-sheets&logoColor=white)

Bot Laporan Infrastruktur Cerdas adalah sebuah sistem otomasi berbasis Google Apps Script yang dirancang untuk memonitor, menganalisis, dan melaporkan kondisi infrastruktur Virtual Machine (VM) dan Datastore secara proaktif melalui Telegram.

Proyek ini mengubah data mentah dari Google Sheets menjadi *insight* yang dapat ditindaklanjuti, membantu tim operasional dalam pengambilan keputusan, perencanaan kapasitas, dan identifikasi anomali secara *real-time*.

## 🚀 Fitur Utama

- **Laporan Harian Otomatis**: Mengirimkan ringkasan operasional harian yang mencakup aktivitas perubahan data, status VM, dan kesehatan *provisioning*.
- **Analisis Mendalam & Skenario "What-If"**:
    - **Simulasi Cleanup**: Menganalisis potensi penghematan sumber daya dari VM yang tidak terpakai.
    - **Simulasi Migrasi**: Menganalisis kelayakan dan dampak migrasi VM antar *host* dengan mempertimbangkan kebijakan *overcommit*.
    - **Rekomendasi Penempatan VM**: Memberikan rekomendasi cerdas untuk penempatan VM baru berdasarkan aturan kritikalitas, I/O, dan beban klaster aktif.
- **Pencarian & Pelacakan Aset**:
    - Cari detail VM berdasarkan nama, IP, atau Primary Key.
    - Lacak riwayat lengkap perubahan pada sebuah VM, dari log aktif maupun arsip.
- **Peringatan Proaktif**: Secara otomatis memeriksa kondisi sistem berdasarkan ambang batas yang ditentukan (misalnya, utilisasi Datastore, *uptime* VM kritis) dan mengirimkan peringatan jika ada anomali.
- **Arsitektur Tangguh**:
    - **Sistem Antrean Asinkron**: Menggunakan `PropertiesService` untuk menangani tugas-tugas berat (sinkronisasi, ekspor) di latar belakang untuk menghindari *timeout*.
    - **Manajemen Cache**: Mengimplementasikan strategi *Cache-First* untuk pengambilan data, secara drastis meningkatkan performa dan responsivitas bot.
    - **Pemisahan Lingkungan**: Logika program secara cerdas membedakan antara lingkungan DEV dan Produksi untuk pengiriman notifikasi yang aman.

## 🛠️ Penggunaan & Perintah Bot

Interaksi utama dengan bot dilakukan melalui perintah teks di Telegram.

### Laporan & Analisis
- `/laporanharian`: Membuat laporan operasional harian instan.
- `/laporanprovisioning`: Menghasilkan laporan detail alokasi sumber daya (CPU, Memori, Disk).
- `/laporanaset`: Memberikan laporan distribusi aset VM berdasarkan kritikalitas dan lingkungan.
- `/cekkesehatan`: Menjalankan analisis kondisi dan anomali sistem berdasarkan ambang batas.
- `/cekstorage`: Menampilkan ringkasan utilisasi *storage*.
- `/cekmigrasi`: Menjalankan analisis dan rekomendasi migrasi untuk Datastore yang *over-provisioned*.

### Pencarian & Riwayat
- `/carivm [Nama/IP/PK]`: Mencari detail VM spesifik.
- `/riwayatvm [PK]`: Melacak riwayat lengkap perubahan sebuah VM.
- `/riwayathariini`: Menampilkan semua perubahan data yang terjadi hari ini.

### Interaktif & Aksi
- `/setupvm`: Memulai alur percakapan terpandu untuk rekomendasi penempatan VM baru.
- `/tiketutilisasi`: Membuka menu interaktif untuk memonitor tiket utilisasi.
- `/grafik [kritikalitas/environment]`: Menampilkan visualisasi data dalam bentuk grafik.
- `/simulasi [cleanup/migrasi] [nama_cluster/nama_host]`: Menjalankan skenario perencanaan.
- `/catatlaporanstorage` (sebagai balasan): Mem-parsing dan mencatat laporan utilisasi *storage* manual.

### Utilitas & Administratif
- `/menuekspor`: Membuka menu interaktif untuk mengekspor data ke Google Sheet.
- `/status`: Melakukan pemeriksaan kesehatan internal bot (koneksi API, akses *sheet*).
- `/info`: Menampilkan pesan bantuan ini.
- `/syncdata`: (Admin) Memaksa sinkronisasi data penuh dan pembuatan laporan.
- `/jalankanarsip`: (Admin) Memaksa proses pengarsipan log.
- `/bersihkancache`: (Admin) Membersihkan *cache* konfigurasi dan data bot.

## 🔧 Struktur Proyek

Proyek ini disusun secara modular untuk memastikan keterbacaan dan kemudahan pemeliharaan.

- **`Utama.js`**: Titik masuk utama (webhook `doPost`) dan perutean perintah.
- **`Konfigurasi.js` / `Konstanta.js`**: Pusat untuk semua konfigurasi dan nilai konstan.
- **`Manajemen[Entitas].js`** (misal: `ManajemenVM.js`): Berisi logika bisnis untuk setiap entitas data.
- **`Laporan.js` / `Formatter.js`**: Bertanggung jawab untuk menghitung dan memformat data laporan.
- **`Analisis.js` / `Rekomendasi.js`**: Berisi logika analitis tingkat tinggi dan mesin rekomendasi.
- **`AntreanTugas.js` / `Pemicu.js`**: Mengelola tugas asinkron dan pekerjaan terjadwal.
- **`Telegram.js`**: Lapisan abstraksi untuk semua komunikasi dengan API Telegram.
- **`Pengujian*.js`**: Berisi *suite* untuk pengujian unit dan sistem.