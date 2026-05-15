# Supabase Setup — Per Usaha Deployment Guide

Panduan setup backend Supabase untuk 1 usaha yang menggunakan CHILL POS APP.

**Konsep:** Tiap usaha punya 1 Supabase project sendiri (data 100% terisolasi). Code app sama untuk semua usaha (di GitHub repo kamu).

---

## 📋 Prerequisites

- Email aktif untuk daftar Supabase (gratis)
- Browser modern (Chrome / Firefox / Edge)
- ~30 menit waktu setup pertama kali

---

## 🚀 Step 1 — Buat Akun & Project Supabase

1. Buka [supabase.com](https://supabase.com) → **Sign up** (pakai GitHub atau email)
2. Setelah login → klik **"New Project"**
3. Isi:
   - **Name:** misal `chill-pos-warung-budi` (deskriptif, internal saja)
   - **Database Password:** **SIMPAN INI BAIK-BAIK** — password untuk akses database directly. Generate random kuat (16+ karakter, mix huruf+angka+simbol). Recommend pakai password manager.
   - **Region:** pilih **Southeast Asia (Singapore)** untuk Indonesia (latency terendah)
   - **Pricing Plan:** Free
4. Klik **"Create new project"** → tunggu ~2 menit sampai project siap

---

## 🗄️ Step 2 — Jalankan Schema SQL

1. Di sidebar kiri Supabase, klik **"SQL Editor"**
2. Klik **"New query"**
3. **Copy-paste SELURUH** SQL di bawah ini, lalu klik **"Run"** (atau tekan Ctrl+Enter):

```sql
-- ============================================================
-- CHILL POS APP — Database Schema
-- Run this in Supabase SQL Editor on a fresh project.
-- ============================================================

-- ── Users (replaces localStorage pos_users) ──
CREATE TABLE pos_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        UNIQUE NOT NULL,
  pin_hash    TEXT,                                          -- nullable: 'sha256:<salt>:<hash>' or null (no PIN)
  role        TEXT        NOT NULL CHECK (role IN ('admin','cashier')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Categories (replaces localStorage pos_categories) ──
CREATE TABLE pos_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        UNIQUE NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,             -- TRUE = START BALANCE (cannot delete)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default categories
INSERT INTO pos_categories (name, sort_order, is_system) VALUES
  ('START BALANCE', 0, TRUE),
  ('Sales',         1, FALSE),
  ('Refund',        2, FALSE),
  ('Expense',       3, FALSE),
  ('Other',         4, FALSE);

-- ── Active shift transactions (replaces localStorage pos_transactions) ──
CREATE TABLE pos_transactions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  jenis           TEXT        NOT NULL CHECK (jenis IN ('INCOME','OUTGOING')),
  kategori        TEXT        NOT NULL,
  deskripsi       TEXT        NOT NULL,
  jumlah          NUMERIC     NOT NULL,
  metode          TEXT        NOT NULL CHECK (metode IN ('Cash','Card','Transfer','Qris')),
  keterangan      TEXT,
  staff           TEXT        NOT NULL,
  tanggal_waktu   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_tanggal ON pos_transactions(tanggal_waktu DESC);
CREATE INDEX idx_transactions_jenis   ON pos_transactions(jenis);

-- ── Closed shift history (replaces localStorage pos_shift_history) ──
CREATE TABLE pos_shifts (
  id              TEXT        PRIMARY KEY,                   -- 'shift_<timestamp>'
  closed_at       TIMESTAMPTZ NOT NULL,
  staff           JSONB       NOT NULL,                       -- array of unique staff names
  summary         JSONB       NOT NULL,                       -- {cash, card, other, total, totalIncome, totalOutgoing, ...}
  transactions    JSONB       NOT NULL                        -- deep copy of all txs in this shift
);

CREATE INDEX idx_shifts_closed_at ON pos_shifts(closed_at DESC);

-- ── Settings — single-row key/value (replaces pos_brand, pos_lang, etc.) ──
CREATE TABLE pos_settings (
  key     TEXT  PRIMARY KEY,
  value   JSONB
);

-- Seed default settings (owner updates these via first-run wizard)
INSERT INTO pos_settings (key, value) VALUES
  ('brand',         '"My Business"'::jsonb),
  ('lang',          '"en"'::jsonb),
  ('shift_active',  'false'::jsonb);

-- ── Session (single-row, tracks current logged-in user) ──
CREATE TABLE pos_session (
  id           INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforce single row
  user_id      UUID        REFERENCES pos_users(id) ON DELETE SET NULL,
  login_at     TIMESTAMPTZ
);

INSERT INTO pos_session (id) VALUES (1);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Since each business = own Supabase project, data isolation is
-- already physical. Anon role gets full access. The anon key
-- itself is the secret — anyone with URL+key can access this
-- business's data.
-- ============================================================

-- Enable RLS on all tables (best practice even with permissive policies)
ALTER TABLE pos_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_session      ENABLE ROW LEVEL SECURITY;

-- Permissive policy: allow anon (the app) to do everything.
-- Acceptable because each business has their own isolated project.
CREATE POLICY "anon full access" ON pos_users        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_categories   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_shifts       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_settings     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_session      FOR ALL TO anon USING (true) WITH CHECK (true);

-- ============================================================
-- REALTIME (untuk auto-sync antar device)
-- Enable broadcast on tables that change frequently
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE pos_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_session;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_users;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_settings;

-- DONE!
```

4. Pastikan output ada "Success. No rows returned" — schema selesai dibikin.

---

## 🔑 Step 3 — Ambil URL & API Key

1. Sidebar kiri → **"Project Settings"** (icon gear) → **"API"**
2. Catat dua nilai berikut:
   - **Project URL** — bentuk: `https://xxxxxxxx.supabase.co`
   - **anon public key** — string panjang dimulai `eyJ...` (ini PUBLIC, aman dishare ke app)
3. **JANGAN COPY** `service_role` key — itu admin key yang TIDAK boleh dipakai di app browser (sangat rahasia).

---

## ⚙️ Step 4 — Plug ke App

Setelah app POS sudah di-refactor untuk support Supabase (lihat bagian "Roadmap" di bawah), saat pertama buka URL app:

1. **First-Run Wizard** akan muncul, ada field tambahan:
   - **Supabase URL** → paste URL dari Step 3
   - **Supabase Anon Key** → paste anon key dari Step 3
2. Lanjutkan wizard seperti biasa (brand, kategori, staff, admin PIN)
3. Klik "Finish Setup" — data tersimpan di Supabase usaha kamu

---

## 🔐 Step 5 — Security Checklist (PENTING!)

Bagian ini diabaikan sering bikin masalah keamanan. **WAJIB cek satu per satu:**

### ✅ Yang HARUS dilakukan
- [ ] Database password disimpan di password manager (Bitwarden, 1Password, atau notes terenkripsi)
- [ ] `service_role` key **tidak pernah** masuk ke kode app (browser-side)
- [ ] RLS sudah ENABLED di semua tabel (sudah dilakukan otomatis via SQL di atas)
- [ ] Anon key dianggap sebagai "shared secret" — jangan publish ke GitHub public repo, jangan share di Discord/forum
- [ ] Region project: Southeast Asia (Singapore) untuk performa terbaik di Indonesia

### ⚠️ Catatan Anon Key
Anon key itu **public** dalam arti aman ada di JavaScript browser — RLS yang mencegah akses tidak sah. **TAPI** di setup kita, RLS permisif (`anon full access`) karena data sudah dipisah per project. Artinya:
- Siapa pun yang punya URL + anon key bisa akses data usaha ini
- **Jangan share screenshot Settings page** ke publik kalau ada URL/key terlihat
- Kalau key bocor → di Supabase: Settings → API → regenerate anon key. Update di app.

### 🚨 Yang TIDAK boleh dilakukan
- [ ] ❌ Jangan masukan `service_role` key ke kode JS yang dideploy
- [ ] ❌ Jangan disable RLS (kalau anon key bocor + RLS off = data bisa dihapus orang asing)
- [ ] ❌ Jangan share database password ke siapa pun (termasuk staff)

---

## 🔄 Step 6 — Backup Manual

Free tier backup otomatis 7 hari saja. **Recommend manual backup mingguan:**

1. SQL Editor di Supabase
2. Run query:
   ```sql
   -- Export all transactions to JSON
   COPY (SELECT row_to_json(pos_transactions) FROM pos_transactions)
   TO STDOUT;
   ```
   Atau pakai **Table Editor** → pilih tabel → klik **Export** → CSV
3. Simpan file CSV/JSON di Google Drive / OneDrive

Backup berisi: users, transactions, shifts, settings.

Atau, lebih baik — owner usaha bisa **Export Excel** dari dalam app POS (yang sudah ada fitur ini), simpan rutin per shift.

---

## 📊 Monitoring & Usage Check

Saban bulan, owner usaha cek penggunaan resource:

1. Supabase dashboard → **"Reports"** atau **"Usage"**
2. Pastikan tidak mendekati limit:
   - **DB Size**: < 500 MB
   - **Bandwidth**: < 5 GB/bulan
   - **Realtime connections**: < 200 peak

Kalau mendekati limit (rarely terjadi untuk POS):
- Hapus shift history lama (sudah di-export ke Excel)
- Upgrade ke Pro ($25/bulan) untuk 8 GB DB

---

## ✅ Checklist Selesai

Setelah Step 1–6 selesai, status:
- [x] Supabase project created
- [x] Schema + RLS + Realtime enabled
- [x] URL + anon key ready to plug into app
- [x] Database password saved securely
- [x] Backup plan ready

Sekarang tinggal buka app POS, isi first-run wizard, dan jalan! Semua device yang akses URL app dengan Supabase yang sama akan **auto-sync real-time**.

---

## 🛠️ Roadmap (Untuk Developer)

Untuk benar-benar bisa pakai Supabase, app POS perlu di-refactor:

### Yang harus diubah
1. **First-Run Wizard**: tambah field Supabase URL + anon key
2. **`AuthStorage` adapter**: body diganti `await supabase.from('pos_users').select()` dll
3. **`Storage` service**: dibuatkan `SupabaseStorage` versi yang sync ke tabel `pos_settings`, `pos_transactions`, dll
4. **Realtime subscriptions**: listen ke perubahan `pos_transactions` & `pos_session`, auto-rerender saat data berubah dari device lain
5. **Vendor Supabase SDK**: download `supabase.min.js` ke `vendor/`
6. **Offline queue**: kalau internet drop, simpan ke localStorage, sync saat online lagi

Estimasi: **2-3 hari kerja**.

---

## 🆘 Troubleshooting

### "ERROR: relation 'pos_users' already exists"
Schema sudah pernah dijalankan. Drop dulu kalau mau fresh start:
```sql
DROP TABLE IF EXISTS pos_users, pos_categories, pos_transactions, pos_shifts, pos_settings, pos_session CASCADE;
```
Kemudian jalankan schema lagi.

### "Project paused" notification
Project auto-pause kalau 7 hari ga ada traffic. Klik tombol "Restore" di dashboard Supabase, tunggu ~1 menit.

### "Permission denied" saat query
Cek RLS policies sudah dibuat. Re-run bagian "ROW LEVEL SECURITY" dari SQL di atas.

### App ga konek ke Supabase
- Cek URL & key di-paste lengkap (anon key panjang ~200 karakter)
- Cek koneksi internet komputer
- Buka DevTools (F12) → tab Console, lihat error message
- Cek project di dashboard belum di-pause

---

## 📞 Support

Kalau ada pertanyaan setup, kontak [your contact info].

**Versi guide:** 1.0 — disesuaikan dengan CHILL POS APP versi current.
