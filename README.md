# Djiwaruang Invoice

Aplikasi invoice dan penawaran lokal yang berjalan langsung di browser. Tidak membutuhkan akun, database, atau koneksi internet.

## Menjalankan aplikasi

Cara termudah: klik dua kali `index.html`, lalu buka dengan browser Chrome atau Microsoft Edge.

Untuk hasil PDF:

1. Isi dokumen sampai preview sesuai.
2. Klik **Cetak / Simpan PDF**.
3. Pilih printer **Save as PDF** / **Microsoft Print to PDF**.
4. Gunakan ukuran kertas A4, skala 100%, dan nonaktifkan header/footer browser bila muncul.

Data formulir dan profil usaha tersimpan otomatis di penyimpanan lokal browser yang digunakan.

## Riwayat dan backup lokal

- Perubahan formulir tersimpan otomatis sebagai satu draft aktif.
- Klik **Simpan** untuk membuat atau memperbarui dokumen di riwayat IndexedDB.
- Klik **Riwayat** untuk membuka, menduplikat, mencari, atau menghapus dokumen.
- Gunakan **Ekspor backup** untuk mengunduh semua riwayat dan draft sebagai JSON.
- Gunakan **Impor backup** untuk memulihkan data pada browser yang sama atau perangkat lain.

Data riwayat tetap berada di browser. Simpan file backup secara berkala karena membersihkan data browser dapat menghapus riwayat lokal.

Setiap dokumen menampilkan status, waktu pembuatan, watermark, dan fingerprint SHA-256. Fingerprint adalah penanda konsistensi visual, bukan pengganti tanda tangan digital bersertifikat.

## Format perhitungan

- **Build / Produksi:** harga satuan × quantity.
- **Jasa Desain:** luas dalam m² × harga per m².

Judul dan urutan kolom pada dokumen akan menyesuaikan format yang dipilih. Deskripsi item mendukung beberapa baris untuk menuliskan ruang lingkup pekerjaan.

## Pembulatan dan tampilan

Grand total dapat dibulatkan ke atas, ke bawah, atau ke nilai terdekat pada tingkat Rp1.000, Rp10.000, Rp100.000, atau Rp1.000.000. Selisih pembulatan dicantumkan pada ringkasan total. Isian total manual tetap tersedia dan memiliki prioritas jika diisi.

Nilai grand total juga ditulis otomatis dalam bentuk terbilang bahasa Indonesia.

Tab **Tampilan** dapat digunakan untuk menyembunyikan bagian header, informasi pelanggan, status, header tabel, kolom harga, kolom quantity/luas, baris pembulatan, termin, catatan, fingerprint, dan metode pembayaran.
