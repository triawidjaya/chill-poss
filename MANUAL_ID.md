# CHILL POS APP - BUKU PANDUAN PENGGUNA (BAHASA INDONESIA)

## Daftar Isi
1. [Pendahuluan](#pendahuluan)
2. [Memulai](#memulai)
3. [Operasi Dasar](#operasi-dasar)
4. [Manajemen Transaksi](#manajemen-transaksi)
5. [Manajemen Shift](#manajemen-shift)
6. [Manajemen Pengguna](#manajemen-pengguna)
7. [Pengaturan & Kustomisasi](#pengaturan)
8. [Laporan & Ekspor](#laporan)
9. [Pemecahan Masalah](#pemecahan-masalah)
10. [Pertanyaan Umum](#faq)

---

## Pendahuluan

Selamat datang di **CHILL POS App**, sebuah sistem Point of Sale (POS) modern dan fleksibel yang dirancang untuk usaha kecil hingga menengah. Panduan lengkap ini akan membantu Anda menguasai setiap fitur aplikasi.

### Apa itu CHILL POS?

CHILL POS adalah sistem kasir berbasis web dan manajemen transaksi yang memungkinkan Anda untuk:
- Mencatat transaksi pemasukan dan pengeluaran
- Mengelola shift harian dan staf
- Melacak catatan keuangan di berbagai perangkat
- Mengekspor data ke format Excel dan CSV
- Mengelola akun pengguna dengan izin berbasis peran

### Dua Mode Operasional

**Mode Lokal:** Data hanya tersimpan di browser Anda. Tidak perlu setup, tetapi data hanya dapat diakses di perangkat ini.

**Mode Cloud:** Data disinkronkan antar perangkat secara real-time. Memerlukan pengaturan proyek Supabase untuk sinkronisasi multi-perangkat.

---

## Memulai

### Peluncuran Pertama

Saat pertama kali membuka CHILL POS, Anda perlu memasukkan kode akses dan memilih mode operasional Anda.

#### Langkah 1: Kode Akses
1. Masukkan kode akses (default: `smallbutspicy`)
2. Kode ini membatasi akses hanya kepada pengguna yang berwenang

#### Langkah 2: Pilih Mode Operasional
1. **Mode Lokal:** Pilih jika bekerja di satu perangkat saja
2. **Mode Cloud:** Pilih jika perlu sinkronisasi data antar perangkat

#### Langkah 3: Pengaturan Awal
1. Masukkan nama bisnis Anda (misalnya "Warung Pak Budi")
2. Tambahkan kategori transaksi (satu per baris)
3. Tambahkan nama staf (satu per baris)
4. Pilih pengguna admin dan atur PIN 4-6 digit
5. Klik "Selesaikan Setup"

---

## Operasi Dasar

### Dashboard Utama

Layar utama menampilkan:
- Tanggal dan waktu saat ini
- Nama bisnis Anda
- Ringkasan dashboard
- Tabel transaksi dengan semua entri

### Kontrol Header

**Pengaturan (Ikon Gear)**
- Akses pengaturan bisnis, kelola kategori dan staf

**Riwayat Shift (Ikon Jam)**
- Lihat shift yang ditutup dan data historis

**Alih Bahasa (ID/EN)**
- Beralih antara Indonesian dan English

**Alih Tema (Ikon Bulan)**
- Beralih antara mode terang dan gelap

**Menu Pengguna (Ikon Pengguna)**
- Lihat informasi pengguna saat ini dan keluar

---

## Manajemen Transaksi

### Menambahkan Transaksi Baru

1. Klik tombol hijau "+ Transaksi Baru"
2. Pilih jenis transaksi: "Pemasukan" atau "Pengeluaran"
3. Pilih kategori
4. Pilih metode pembayaran (Tunai, Kartu, Transfer, QRIS)
5. Masukkan deskripsi
6. Masukkan jumlah
7. Pilih anggota staf
8. Klik "Simpan"

### Mengedit Transaksi

Hanya pengguna admin yang dapat mengedit transaksi:
1. Klik ikon edit (pensil) pada transaksi
2. Ubah detail
3. Klik "Simpan"

### Menghapus Transaksi

Hanya pengguna admin yang dapat menghapus transaksi:
1. Klik ikon hapus (tempat sampah)
2. Konfirmasi penghapusan

### Filter & Pencarian

Filter transaksi berdasarkan:
- Jenis transaksi (Pemasukan/Pengeluaran)
- Kategori
- Pencarian deskripsi

### Pengurutan

Klik pada header kolom mana pun untuk mengurutkan tabel.

---

## Manajemen Shift

### Memulai Shift

Sebelum mencatat transaksi apa pun, Anda harus memulai shift:

1. Klik "Mulai Shift"
2. Pilih anggota staf yang sedang bertugas
3. Masukkan saldo kas awal
4. Masukkan PIN Anda
5. Klik "Mulai Shift" untuk mengonfirmasi

### Menutup Shift

Pada akhir shift Anda:

1. Klik tombol merah "Tutup Shift"
2. Masukkan saldo kas aktual
3. Masukkan total kartu/transfer/QRIS aktual
4. Tinjau ringkasan (yang diharapkan vs. yang aktual)
5. Klik "Konfirmasi Tutup Shift"

### Memahami Ringkasan Shift

Ringkasan shift menunjukkan:
- **Diharapkan:** Dihitung dari transaksi
- **Aktual:** Hitung fisik
- **Selisih:** Aktual minus Diharapkan (membantu mengidentifikasi ketidaksesuaian)

---

## Manajemen Pengguna

### Peran Pengguna

| Peran | Izin | Catatan |
|------|-----|---------|
| Admin | Semua izin, Pengaturan, Manajemen pengguna, Hapus transaksi | Kontrol penuh |
| Kasir | Buat transaksi, Tutup shift, Ekspor data | Terbatas pada transaksi harian |

### Menambahkan Pengguna Baru

1. Klik "Pengaturan" > "Kelola Pengguna"
2. Masukkan nama pengguna
3. Pilih peran (Admin atau Kasir)
4. Atur PIN (opsional)
5. Klik "Tambah Pengguna"

### Mengelola Pengguna

Pengguna admin dapat:
- Atur atau reset PIN pengguna
- Hapus pengguna
- Ubah peran pengguna

### Keamanan PIN

PIN adalah:
- 4-6 digit saja
- Dienkripsi dengan SHA-256
- Tidak pernah disimpan dalam bentuk teks biasa

---

## Pengaturan & Kustomisasi

### Mengakses Pengaturan

Klik ikon "Pengaturan" (gear) di header.

### Pengaturan Bisnis

**Nama Merek**
- Ubah nama bisnis Anda (muncul di header)

**Logo Bisnis**
- Unggah gambar PNG (otomatis dikonversi)

### Mengelola Kategori

1. Lihat kategori yang sudah ada
2. Klik "Tambah Kategori" untuk menambahkan yang baru
3. Hapus kategori dengan mengklik ikon tempat sampah

### Kategori yang Memerlukan Persetujuan Admin

Kategori tertentu dapat ditandai untuk memerlukan persetujuan admin. Ketika kasir mencatat transaksi dalam kategori ini, mereka harus memasukkan PIN admin.

### Reset ke Default

Klik "Reset Default" untuk mengembalikan semua pengaturan ke nilai default.

---

## Laporan & Ekspor

### Mengekspor Transaksi

1. Klik tombol "Ekspor Excel"
2. File .xlsx akan diunduh dengan semua transaksi saat ini

### Riwayat Shift

Akses riwayat shift dari ikon header:
- Lihat 50 shift terakhir yang ditutup
- Perluas detail shift
- Ekspor shift individual
- Hapus shift lama (hanya admin)

### Rekomendasi Backup

**Dalam Mode Lokal:**
- Ekspor ke Excel secara teratur
- Simpan backup dengan aman

**Dalam Mode Cloud:**
- Data otomatis dicadangkan
- Tetap disarankan untuk mengekspor secara berkala

---

## Pemecahan Masalah

### Kesalahan Koneksi Cloud

**Masalah:** Tidak dapat terhubung ke Supabase

**Solusi:**
1. Periksa koneksi internet Anda
2. Verifikasi URL dan Kunci Supabase sudah benar
3. Coba reset dan konfigurasi ulang

### PIN Terlupa

**Masalah:** Tidak dapat masuk karena PIN terlupa

**Solusi:**
1. Klik "PIN Terlupa" di layar login
2. Masukkan kode akses
3. Atur PIN baru

### Data Tidak Disinkronkan Antar Perangkat

**Masalah:** Mode cloud tidak menyinkronkan data

**Solusi:**
1. Pastikan kedua perangkat menggunakan URL dan Kunci Supabase yang sama
2. Periksa koneksi internet di kedua perangkat
3. Segarkan halaman (mungkin memerlukan beberapa detik untuk disinkronkan)

### Tidak Dapat Menghapus Transaksi

**Masalah:** Tombol hapus tidak aktif

**Solusi:** Hanya pengguna admin yang dapat menghapus transaksi. Masuk sebagai admin.

---

## Pertanyaan Umum

### T: Bisakah saya menggunakan CHILL POS secara offline?

J: Ya, dalam Mode Lokal data Anda tetap ada di browser. Dalam Mode Cloud dengan kemampuan offline, transaksi dapat diantrekan dan disinkronkan nanti.

### T: Apakah data saya aman?

J: Ya. PIN dienkripsi dengan SHA-256. Dalam Mode Cloud, Supabase menyediakan keamanan tingkat enterprise.

### T: Bisakah saya upgrade dari Lokal ke Cloud nanti?

J: Ya. Gunakan opsi "Upgrade ke Cloud" di Pengaturan.

### T: Berapa lama riwayat shift disimpan?

J: 50 shift terakhir disimpan secara otomatis.

### T: Bisakah beberapa staf bekerja secara bersamaan?

J: Ya. Setiap transaksi dikaitkan dengan anggota staf yang masuk. Dalam Mode Cloud, beberapa pengguna dapat bekerja di berbagai perangkat secara real-time.

### T: Metode pembayaran apa yang didukung?

J: Tunai, Kartu, Transfer Bank, dan QRIS.

---

**Untuk bantuan lebih lanjut, hubungi dukungan di triawidjaya@hotmail.com**

*CHILL POS APP v2.0 - Terakhir diperbarui 2026*
