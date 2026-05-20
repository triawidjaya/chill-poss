# Panduan Setup CHILL POS

Manual ini menjelaskan cara menyiapkan aplikasi dari awal — mulai dari membuka di web browser sampai siap mencatat transaksi.

---

## 1. Apa yang Anda butuhkan

- **Perangkat**: laptop, tablet, atau HP dengan browser modern (Chrome, Edge, Safari, Firefox).
- **Alamat aplikasi (URL)**: halaman GitHub Pages aplikasi Anda, contoh:
  `https://triawidjaya.github.io/chill-poss/`
- **Kode akses aplikasi**: `smallbutspicy`
  (kode ini bisa diganti di kode sumber `script.js` pada `APP_ACCESS_CODE`).
- **Khusus mode Premium (Cloud)**: sebuah project Supabase + **Project URL** dan **Publishable Key**. Cara membuat project Supabase ada di [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

---

## 2. Dua pilihan mode

Saat pertama kali setup, Anda memilih salah satu mode:

| | **Basic (Local)** | **Premium (Cloud)** |
|---|---|---|
| Penyimpanan data | Hanya di browser perangkat ini | Database Supabase (online) |
| Multi-perangkat | Tidak (data tidak sinkron) | Ya, realtime antar perangkat |
| Perlu setup Supabase | Tidak | Ya (URL + key) |
| Ganti logo usaha | Tidak (pakai logo bawaan) | Ya, bisa upload logo sendiri |
| Risiko | Data bisa hilang bila browser membersihkan data | Data aman di cloud |

> **Saran:** untuk usaha sungguhan, pakai **Premium (Cloud)** agar data aman dan bisa diakses dari beberapa perangkat (kasir, pemilik, dll).

---

## 3. Langkah setup

### Langkah 1 — Buka aplikasi di browser
Ketik alamat aplikasi di address bar browser, lalu tekan Enter.

### Langkah 2 — Masukkan kode akses
Akan muncul layar **Access Gate**. Masukkan kode akses (`smallbutspicy`) lalu lanjut. Kode hanya diminta sekali per browser.

### Langkah 3 — Pilih mode
Muncul layar **Choose Mode**:
- Tap **Cloud Mode (Premium)** untuk data online & multi-perangkat, atau
- Tap **Local Mode (Basic)** untuk data lokal saja (langsung ke Langkah 5).

### Langkah 4 — Hubungkan ke Cloud *(hanya jika memilih Premium)*
Muncul layar **Connect to Cloud**. Isi:
- **Supabase Project URL** — contoh `https://xxxx.supabase.co`
  (dari Supabase: **Settings → Data API**)
- **Publishable Key** — diawali `sb_publishable_...`
  (dari Supabase: **Settings → API Keys**)

Tekan **Connect**. Jika URL/key salah, akan muncul pesan error — periksa kembali.

> **PENTING:** Simpan **URL + Publishable Key** ini di tempat aman (mis. catatan HP). Anda membutuhkannya untuk menyambungkan perangkat lain, atau memulihkan koneksi bila data browser terhapus.

### Langkah 5 — Wizard awal (isi data usaha)
Muncul layar **Welcome! Let's set up your POS**. Isi:
1. **Brand Name** — nama usaha (mis. *Warung Pak Budi*).
2. **Categories** — kategori transaksi, satu per baris (mis. Sales, Refund, Expense).
3. **Staff** — nama staff, satu per baris.
4. **Admin User** — pilih satu staff dari daftar di atas sebagai admin.
5. **Admin PIN** — 4–6 digit angka, lalu ulangi di **Confirm PIN**.

Tekan **Finish Setup**. Admin otomatis login dan aplikasi siap dipakai.

> Staff selain admin dibuat sebagai **kasir** tanpa PIN. PIN/role bisa diatur nanti lewat **Settings → Manage Users**.

---

## 4. Mulai memakai aplikasi

1. **Mulai Shift** — tekan tombol shift dan masukkan saldo kas awal.
2. **New Transaction** — catat transaksi. Pilih **Income** atau **Outgoing** (wajib dipilih), isi kategori, jumlah, metode pembayaran, staff.
3. **Export Excel** — unduh data untuk cadangan/laporan.
4. **Close Shift** — tutup shift di akhir; ringkasan tersimpan ke riwayat.

---

## 5. Menambah perangkat lain *(Premium)*

Agar beberapa perangkat berbagi data yang sama:
1. Buka alamat aplikasi di perangkat baru.
2. Masukkan kode akses.
3. Pilih **Cloud Mode**.
4. Masukkan **URL + Publishable Key yang SAMA** seperti perangkat pertama.

Data akan tersinkron otomatis (realtime) antar perangkat.

---

## 6. Pasang sebagai aplikasi (opsional, disarankan)

Memasang sebagai app membuat akses lebih cepat dan **mengurangi risiko data browser terhapus otomatis** (terutama di iPhone/Safari).

- **HP (Android/Chrome)**: menu ⋮ → **Add to Home screen**.
- **iPhone (Safari)**: tombol Share → **Add to Home Screen**.
- **Desktop (Chrome/Edge)**: ikon install di address bar.

---

## 7. Masalah umum & solusi

**Lupa PIN**
Di layar login → **Reset PIN** → pilih user → masukkan **kode akses aplikasi** → buat PIN baru.

**Tiba-tiba kembali ke mode Basic (data Cloud "hilang")**
Ini biasanya karena browser menghapus data tersimpan (clear data / mode privasi / eviction otomatis). Data Cloud Anda **tetap aman di Supabase**. Untuk menyambung ulang:
- **Di desktop**: tekan `F12` → tab **Console** → jalankan:
  ```js
  localStorage.setItem('pos_mode', JSON.stringify('cloud')); location.reload();
  ```
  lalu masukkan kembali **URL + Publishable Key**.
- **Di HP** (tidak ada Console): buka **Setelan browser → Data situs** untuk alamat app → **Hapus data situs** → buka ulang app → pilih **Cloud** → masukkan **URL + key**.

**Reset Default tidak sengaja tertekan**
Reset Default kini meminta **PIN admin** untuk konfirmasi. Tanpa PIN admin yang benar, reset dibatalkan.

**Cadangan data**
Lakukan **Export Excel** secara berkala — wajib untuk mode Basic, dianjurkan juga untuk Premium.

---

## 8. Referensi

- Membuat & menyiapkan project Supabase: [SUPABASE_SETUP.md](SUPABASE_SETUP.md)
- Panduan singkat dalam aplikasi: tombol **Quick Start Guide** di Settings.
