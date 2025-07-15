// ===== FILE: Pengujian.gs =====

/**
 * Fungsi pembantu untuk membandingkan hasil yang diharapkan dengan hasil aktual.
 * @param {*} expected - Nilai yang seharusnya dihasilkan.
 * @param {*} actual - Nilai yang benar-benar dihasilkan oleh fungsi yang diuji.
 * @param {string} testName - Nama tes untuk identifikasi di log.
 */
function assertEquals(expected, actual, testName) {
  // Membandingkan dengan mengubah keduanya menjadi string untuk konsistensi
  if (String(expected) !== String(actual)) {
    console.error(`❌ GAGAL: ${testName}. | Diharapkan: "${expected}" | Hasil: "${actual}"`);
  } else {
    console.log(`✅ LULUS: ${testName}`);
  }
}

/**
 * FUNGSI UTAMA: Jalankan fungsi ini dari editor untuk memulai semua pengujian unit.
 * Ini adalah 'runner' yang akan memanggil semua grup tes.
 */
function jalankanSemuaTes() {
  console.log("Memulai Pengujian Unit...");
  tesFungsiUtilitas(); // Menjalankan tes untuk file Utilitas.gs
  // Jika nanti Anda punya grup tes lain, panggil di sini. Contoh: tesFungsiParser();
  console.log("Pengujian Unit Selesai.");
}

// --- Grup Tes untuk Utilitas.gs ---
// Praktik yang baik adalah mengelompokkan tes berdasarkan file yang diuji.
function tesFungsiUtilitas() {
  console.log("\n--- Menguji File: Utilitas.gs ---");

  // Tes untuk fungsi normalizePrimaryKey
  assertEquals("VM-123", normalizePrimaryKey("VM-123-VC01"), "normalizePrimaryKey: Suffix -VC01");
  assertEquals("VM-ABC", normalizePrimaryKey("VM-ABC-VC10"), "normalizePrimaryKey: Suffix -VC10");
  assertEquals("VM-NO-SUFFIX", normalizePrimaryKey("VM-NO-SUFFIX"), "normalizePrimaryKey: Tanpa Suffix");
  assertEquals("VM-TRIM", normalizePrimaryKey(" VM-TRIM  "), "normalizePrimaryKey: Dengan spasi di awal/akhir");
  assertEquals("", normalizePrimaryKey(null), "normalizePrimaryKey: Input null");

  // Tes untuk fungsi parseLocaleNumber
  assertEquals(1234.56, parseLocaleNumber("1,234.56"), "parseLocaleNumber: Format US (1,234.56)");
  assertEquals(1234.56, parseLocaleNumber("1.234,56"), "parseLocaleNumber: Format Eropa (1.234,56)");
  assertEquals(100, parseLocaleNumber("100"), "parseLocaleNumber: Angka bulat");
  assertEquals(95.5, parseLocaleNumber("95,5%"), "parseLocaleNumber: Dengan simbol %");
  assertEquals(0, parseLocaleNumber("Teks Acak"), "parseLocaleNumber: Input teks acak");
}
