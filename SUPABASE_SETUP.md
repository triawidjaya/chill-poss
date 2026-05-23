# Supabase Setup — Per Usaha Deployment Guide

Panduan setup backend Supabase untuk 1 usaha yang menggunakan CHILL POS APP.

**Konsep:** Tiap usaha punya 1 Supabase project sendiri (data 100% terisolasi). Code app sama untuk semua usaha (di GitHub repo kamu).

> **Versi:** 1.2 — Supabase integration sudah live di production.
> - **v1.2:** Roadmap section diganti dengan status implementasi (Supabase sudah live, bukan future work) + section offline queue untuk transaksi
> - **v1.1:** Per-method shift breakdown (Cash, Card, Transfer, QRIS), closing note per shift (wajib jika ada selisih), shift duration tracking via `started_at` + `closed_at`, AccessGate adapter pattern untuk PIN reset

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

## 🗄️ Step 2 — Run Schema SQL

Buka **SQL Editor** di sidebar Supabase. Schema dibagi jadi 4 blok independen — bisa dijalankan terpisah untuk debugging, atau gabungan di section "**Combined SQL**" di bawah untuk one-shot setup.

> 💡 **Tip:** kalau mau setup ulang dari awal, jalankan dulu blok "Reset" di Troubleshooting → baru jalankan schema baru.

---

### 2.1 — Create Tables

**What this does (English):**
Creates the six core tables that mirror the localStorage keys used by CHILL POS APP:

- **`pos_users`** — User accounts with hashed PINs and role (`admin` / `cashier`). The `pin_hash` column uses the format `sha256:<salt>:<hash>` produced by the client's `Auth._buildPinHash()`. `NULL` means the user can sign in by selecting their name without a PIN (cashier convenience for low-security tills).
- **`pos_categories`** — Transaction categories. `is_system = TRUE` flags categories that the UI prevents from being renamed/deleted (currently only `START BALANCE`, required by the shift-start logic).
- **`pos_transactions`** — Transactions belonging to the **currently active shift only**. When a shift is closed, every row is snapshotted into `pos_shifts.transactions` and this table is truncated. Two indexes optimize the dashboard sort (`tanggal_waktu DESC`) and the income/outgoing filter.
- **`pos_shifts`** — Closed shift records (capped to 50 latest by the client). The `summary` JSONB holds the full per-method breakdown — see schema comment for the exact shape. The `started_at` column (added in v1.1) tracks when the shift began, sourced from the first `START BALANCE` transaction at close time; legacy shifts written before this column may be `NULL`.
- **`pos_settings`** — Key/value singleton store for app-wide preferences (`brand`, `lang`, `shift_active`).
- **`pos_session`** — Single-row table tracking which user is currently signed in. Realtime updates on this row let other devices detect a remote sign-out and force-logout.

**SQL to paste:**

```sql
-- ── Users ──
CREATE TABLE pos_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        UNIQUE NOT NULL,
  pin_hash    TEXT,                                          -- nullable. Format: 'sha256:<salt>:<hash>'. NULL = sign-in without PIN.
  role        TEXT        NOT NULL CHECK (role IN ('admin','cashier')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Categories ──
CREATE TABLE pos_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        UNIQUE NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,             -- TRUE = required by app logic (e.g. START BALANCE), cannot be deleted via UI.
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Active-shift transactions ──
-- Truncated when a shift is closed; the closed shift's transactions
-- are deep-copied into pos_shifts.transactions (JSONB) at close time.
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

-- ── Closed-shift history ──
-- summary JSONB shape (v1.1):
--   {
--     cash, card, transfer, qris,                                -- expected totals per payment method
--     total, totalIncome, totalOutgoing, jumlahTransaksi,
--     actualCash, actualCard, actualTransfer, actualQris,        -- counted by cashier at close (each method)
--     selisihCash, selisihCard, selisihTransfer, selisihQris,    -- actual - expected, per method
--     closingNote                                                 -- cashier note; required by UI when any selisih != 0
--   }
CREATE TABLE pos_shifts (
  id              TEXT        PRIMARY KEY,                   -- 'shift_<timestamp_ms>'
  started_at      TIMESTAMPTZ,                                -- nullable; legacy shifts pre-dating this column may be NULL
  closed_at       TIMESTAMPTZ NOT NULL,
  staff           JSONB       NOT NULL,                       -- array of unique staff usernames active during the shift
  summary         JSONB       NOT NULL,
  transactions    JSONB       NOT NULL                        -- deep copy of all txs that belonged to this shift
);

CREATE INDEX idx_shifts_closed_at ON pos_shifts(closed_at DESC);

-- ── Key/value settings ──
CREATE TABLE pos_settings (
  key     TEXT  PRIMARY KEY,
  value   JSONB
);

-- ── Session — single-row, tracks current logged-in user ──
CREATE TABLE pos_session (
  id           INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- enforce single-row by constraining id
  user_id      UUID        REFERENCES pos_users(id) ON DELETE SET NULL,
  login_at     TIMESTAMPTZ
);
```

---

### 2.2 — Seed Default Data

**What this does (English):**
Inserts the initial rows the app expects on a fresh install:
- The protected `START BALANCE` category (required by shift-start logic), plus four placeholder categories the owner can rename or delete from the first-run wizard.
- Default `pos_settings` rows for brand name, language, and the shift-active flag.
- The single locked-id row in `pos_session` (the app updates `user_id` and `login_at` on login, never inserts new rows).

The owner overrides brand/categories/staff during the first-run wizard after first login.

**SQL to paste:**

```sql
-- Default categories (owner can rename/reorder/delete the non-system ones)
INSERT INTO pos_categories (name, sort_order, is_system) VALUES
  ('START BALANCE', 0, TRUE),
  ('Sales',         1, FALSE),
  ('Refund',        2, FALSE),
  ('Expense',       3, FALSE),
  ('Other',         4, FALSE);

-- Default settings (owner overrides via first-run wizard)
INSERT INTO pos_settings (key, value) VALUES
  ('brand',         '"My Business"'::jsonb),
  ('lang',          '"en"'::jsonb),
  ('shift_active',  'false'::jsonb);

-- Singleton session row (id is locked to 1; never insert a second row)
INSERT INTO pos_session (id) VALUES (1);
```

---

### 2.3 — Enable Row Level Security (RLS)

**What this does (English):**
Since each business gets its own dedicated Supabase project, physical isolation between tenants is already enforced at the project level. RLS is still enabled on every table (Supabase best practice — even with permissive policies, RLS-disabled tables generate console warnings and are flagged in Supabase's security advisor).

A single permissive policy is granted to the `anon` role — the role the browser app uses with the public anon key. The anon key itself is the access secret: whoever has the URL + key has full access to that single business's data, which is acceptable for the per-business deployment model.

**When migrating to a multi-tenant model later**, replace these permissive policies with tenant-scoped policies, for example:
```sql
USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)
```

**SQL to paste:**

```sql
-- Enable RLS on every table
ALTER TABLE pos_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_session      ENABLE ROW LEVEL SECURITY;

-- Permissive policy: anon role (the browser app) has full CRUD access.
-- Acceptable because each business has their own isolated project.
CREATE POLICY "anon full access" ON pos_users        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_categories   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_shifts       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_settings     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_session      FOR ALL TO anon USING (true) WITH CHECK (true);
```

---

### 2.4 — Enable Realtime Publication

**What this does (English):**
Adds tables that the app subscribes to over Supabase Realtime (WebSocket). When any browser inserts, updates, or deletes a row in these tables, all other connected browsers receive a change event and re-render the relevant UI. This is what powers the live multi-device sync experience — e.g. cashier A inputs a transaction on the tablet, and the owner sees the new row appear on the laptop within ~1 second.

`pos_shifts` is included so that a freshly-closed shift appears in the History view of other devices without a manual refresh. `pos_settings` is included so brand/language changes propagate instantly.

**SQL to paste:**

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE pos_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_session;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_users;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_shifts;
```

---

### 🔧 Combined SQL (Full Setup)

Untuk setup sekali-jalan, paste blok di bawah ini ke SQL Editor (gabungan 2.1 → 2.4). Catatan: Supabase SQL Editor tidak auto-rollback kalau ada error di tengah — kalau ragu, jalankan blok terpisah di atas untuk lebih mudah debug.

```sql
-- ============================================================
-- CHILL POS APP — Full schema setup (v1.1)
-- Paste this entire block into Supabase SQL Editor and Run.
-- ============================================================

-- ─────── 2.1 Tables ───────
CREATE TABLE pos_users (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        UNIQUE NOT NULL,
  pin_hash    TEXT,
  role        TEXT        NOT NULL CHECK (role IN ('admin','cashier')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE pos_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        UNIQUE NOT NULL,
  sort_order  INT         NOT NULL DEFAULT 0,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE pos_shifts (
  id              TEXT        PRIMARY KEY,
  started_at      TIMESTAMPTZ,
  closed_at       TIMESTAMPTZ NOT NULL,
  staff           JSONB       NOT NULL,
  summary         JSONB       NOT NULL,
  transactions    JSONB       NOT NULL
);

CREATE INDEX idx_shifts_closed_at ON pos_shifts(closed_at DESC);

CREATE TABLE pos_settings (
  key     TEXT  PRIMARY KEY,
  value   JSONB
);

CREATE TABLE pos_session (
  id           INT         PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  user_id      UUID        REFERENCES pos_users(id) ON DELETE SET NULL,
  login_at     TIMESTAMPTZ
);

-- ─────── 2.2 Seed ───────
INSERT INTO pos_categories (name, sort_order, is_system) VALUES
  ('START BALANCE', 0, TRUE),
  ('Sales',         1, FALSE),
  ('Refund',        2, FALSE),
  ('Expense',       3, FALSE),
  ('Other',         4, FALSE);

INSERT INTO pos_settings (key, value) VALUES
  ('brand',         '"My Business"'::jsonb),
  ('lang',          '"en"'::jsonb),
  ('shift_active',  'false'::jsonb);

INSERT INTO pos_session (id) VALUES (1);

-- ─────── 2.3 RLS ───────
ALTER TABLE pos_users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_shifts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_session      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon full access" ON pos_users        FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_categories   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_transactions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_shifts       FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_settings     FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon full access" ON pos_session      FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────── 2.4 Realtime ───────
ALTER PUBLICATION supabase_realtime ADD TABLE pos_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_session;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_users;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_settings;
ALTER PUBLICATION supabase_realtime ADD TABLE pos_shifts;

-- DONE.
```

Pastikan output ada "Success. No rows returned" — schema siap.

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

## 🛠️ Status Implementasi (Untuk Developer)

Supabase integration **sudah live di production** (per commit `8ae5606` dan rangkaian polish berikutnya). Section ini ringkas apa yang sudah jalan dan apa yang masih open.

### ✅ Sudah live di Cloud mode
1. **First-Run Wizard** — input field Supabase URL + anon key di modal `sb-setup-modal`
2. **DataStore adapter** (`supabase.js`) — hydrate dari 6 tabel saat boot, mutate cache in-place, fire listener ke UI
3. **Realtime subscriptions** — channel `pos-realtime` listen ke perubahan `pos_transactions`, `pos_shifts`, `pos_categories`, `pos_users`, `pos_session`, `pos_settings`; auto-rerender saat data berubah dari device lain
4. **AuthStorage adapter** — `pos_users` CRUD via Supabase di Cloud mode, localStorage di Local mode
5. **Vendor SDK** — `vendor/supabase.min.js` di-load sebelum `supabase.js`
6. **Local → Cloud migration** — flow di Settings (`migrateLocalToCloud()`): snapshot data lokal → verify target project kosong → upload users/transactions/shifts/categories/settings → swap mode → reload
7. **Offline queue** untuk transaksi (per commit `355f0c1`) — lihat section di bawah
8. **Dual-mode bootstrap** — user pilih Local (Basic) vs Cloud (Premium) di mode-choice modal; bisa pindah Local → Cloud belakangan via Settings

### 🔓 Masih open (Phase 3 candidate)
- **PIN reset via email magic link** — saat ini masih pakai shared secret `APP_ACCESS_CODE` di `script.js`. `AccessGate` adapter sudah dipasang supaya body tinggal di-swap nanti tanpa ubah caller. Lihat `ROADMAP.md` Batch 3.5 untuk plan migrasi & pertanyaan terbuka (collect email user existing, communication plan, dll).

---

## 🌐 Offline Queue (Cloud mode)

**Apa yang dilakukan:** Kalau koneksi internet drop saat user input transaksi, transaksi disimpan dulu di browser (`localStorage['pos_offline_queue']`) dan auto-flush ke Supabase begitu online kembali.

**Trigger flush:**
1. Browser fire `online` event (network kembali tersambung)
2. Realtime channel re-subscribe (Supabase reconnect setelah sleep/disconnect)

**UI feedback:** Banner muncul di atas header — merah saat offline (dengan jumlah queue), biru saat syncing, hidden saat online + queue kosong.

**Scope:** Hanya `insertTransaction` yang di-queue. Edit, delete, close-shift, settings, dan user CRUD tetap throw-on-error (jarang dipakai, dan close-shift multi-table tidak aman untuk di-defer).

**Tidak butuh setup tambahan di sisi Supabase** — purely client-side feature. Schema, RLS, dan publication tidak berubah.

**Recovery dari permanent error:** Jika flush gagal karena bukan network error (RLS denied, constraint violation), item di-log + di-drop supaya tidak infinite-retry. Network error tetap di-queue sampai berhasil.

---

## 🆘 Troubleshooting

### "ERROR: relation 'pos_users' already exists"
Schema sudah pernah dijalankan. Drop dulu kalau mau fresh start:
```sql
-- Reset: drop all CHILL POS tables. Data akan hilang permanen.
DROP TABLE IF EXISTS pos_users, pos_categories, pos_transactions, pos_shifts, pos_settings, pos_session CASCADE;
```
Kemudian jalankan schema lagi.

### "Project paused" notification
Project auto-pause kalau 7 hari ga ada traffic. Klik tombol "Restore" di dashboard Supabase, tunggu ~1 menit.

### "Permission denied" saat query
Cek RLS policies sudah dibuat. Re-run blok **2.3** dari schema di atas.

### Realtime ga jalan (perubahan ga muncul di device lain)
Cek tabel sudah di-publish ke `supabase_realtime`:
```sql
SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```
Output harus include `pos_transactions`, `pos_shifts`, dll. Kalau missing, re-run blok **2.4**.

### App ga konek ke Supabase
- Cek URL & key di-paste lengkap (anon key panjang ~200 karakter)
- Cek koneksi internet komputer
- Buka DevTools (F12) → tab Console, lihat error message
- Cek project di dashboard belum di-pause

### "summary doesn't have transfer/qris fields" — legacy shift records
Shift yang dibuat sebelum v1.1 hanya punya field `cash`, `card`, `other` di summary. App sudah handle backward-compat (fallback ke `other` field saat render history detail). Tidak perlu migrate data lama — biarkan saja.

---

## 📞 Support

Kalau ada pertanyaan setup, kontak [your contact info].

**Versi guide:** 1.2 — Supabase integration live di production, dengan offline queue untuk transaksi. PIN reset masih pakai AccessGate adapter (parked sebagai Phase 3 candidate).
