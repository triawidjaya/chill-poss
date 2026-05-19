# CHILL POS APP — Claude Code Context

## Overview
A **generic POS (Point of Sale) / cashier web app template** — white-label, multi-device-capable via Supabase. Vanilla JS, HTML, CSS — no framework, no build step.

**Data model:** 1 business = 1 dedicated Supabase project = many devices sharing 1 codebase. The same GitHub Pages URL serves all businesses; each browser is paired with a specific Supabase project via the first-run wizard (URL + publishable key stored in `localStorage`). Data is fully isolated at the project level.

Originally built for a hostel, then refactored as a white-label template, now extended with Supabase as the source of truth + realtime sync. UI prefs (theme, language, header visibility, access gate, Supabase config) stay in `localStorage` as per-browser state.

## File Structure
```
chill-pos/
  index.html    — Main POS page (loads supabase.min.js, supabase.js, lang.js, script.js)
  history.html  — Shift history page (same script chain, inline page logic)
  script.js     — App logic (class ChillPOS) — bootstrap, UI, transaction CRUD
  supabase.js   — SupabaseConfig + DataStore + Storage/AuthStorage Supabase-backed shims
  style.css     — Shared styles (light + dark theme)
  lang.js       — EN/ID language strings + LangManager + storage-key migration
  CONTEXT.md    — This file
  vendor/       — Vendored CDN deps
    xlsx.full.min.js
    papaparse.min.js
    supabase.min.js     (Supabase JS SDK v2 UMD bundle)
    fontawesome/
      css/all.min.css
      webfonts/
```

## Tech Stack
- Vanilla JS (ES2020+), HTML5, CSS3
- Font Awesome 6.4 (vendored) — icons
- SheetJS / xlsx 0.17.5 (vendored) — Excel export
- PapaParse 5.3.0 (vendored) — CSV export
- Supabase JS SDK v2 (vendored as UMD) — Postgres + Realtime
- No npm, no bundler, no framework

## Deployment Model
- **One codebase, many businesses:** the same GitHub Pages URL serves every deployment. Each browser is paired with a Supabase project via the first-run wizard (URL + publishable key persisted in `pos_sb_config` localStorage). Data is fully isolated at the Supabase project level.
- **First-run wizard:** runs when `SupabaseConfig.load()` returns null OR when `brand === DEFAULT_BRAND`. Collects Supabase URL/key (first device only; hidden on subsequent devices) plus brand + categories + staff + admin user + PIN. On submit: saves config, hydrates the cache, then writes brand/categories/users to Supabase and logs in the chosen admin.
- **Setup-admin fallback:** when hydrate succeeds, brand is set, but `pos_users` is empty (e.g. data initialised via SQL), a one-time "Set Up Admin Account" modal appears.
- **Access gate:** before the wizard, an `APP_ACCESS_CODE` local prompt blocks unrecognised browsers. Granted state is per-browser in `pos_access_granted`.

## Supabase Architecture

**Single source of truth:** Supabase. All cross-device data (transactions, shifts, categories, users, session, business settings) lives in 6 tables. The schema, RLS policies, and realtime publication are defined in `SUPABASE_SETUP.md`.

**`supabase.js` — three layers:**
1. **`SupabaseConfig`** — load/save/validate URL + publishable key in `localStorage`. `_normalizeUrl()` strips `/rest/v1/` and trailing slashes so users can paste either the Data API endpoint or the bare base URL.
2. **`getSupabase()`** — lazy singleton client. Reset whenever config changes.
3. **`DataStore`** — in-memory cache + realtime subscriber + per-operation CRUD.
   - **Hydration:** `await DataStore.hydrate()` fetches all 6 tables in parallel on app bootstrap.
   - **Cache arrays are mutated in place** (`push`, `splice`, `length=0`) — never reassigned. `ChillPOS` holds shared references via `_bindDataStore()` so realtime updates reach the UI without re-fetches.
   - **Translators:** `toAppX`/`toDbX` map snake_case ↔ camelCase between DB and app objects.
   - **Realtime:** subscribes to `postgres_changes` on all 6 tables under one channel; events update the cache and fire per-entity listeners (`DataStore.on(entity, cb)`) that `ChillPOS` uses to re-render.

**`Storage` & `AuthStorage` shims** (also in `supabase.js`):
- `Storage.get(key)` is synchronous — returns from `DataStore` cache for Supabase-backed keys, from `localStorage` for UI-only keys.
- `Storage.set(key, value)` updates the cache synchronously and fires the Supabase write async (fire-and-forget) so legacy callers don't need to await.
- Bulk array overwrites (`Storage.set('pos_transactions', arr)`) are no-ops — callers must use `DataStore.insertTransaction` / `updateTransaction` / `deleteTransaction` / `clearTransactions` directly.
- `AuthStorage` keeps the original `getUsers / saveUsers / getSession / saveSession / clearSession` surface; `saveUsers` diffs against the cache and dispatches to `DataStore.insertUser / updateUser / deleteUser`.

**Bootstrap sequence (`ChillPOS.bootstrap()`):**
1. Access gate (local) — show prompt if `pos_access_granted` is false.
2. Supabase config check — show first-run wizard if none.
3. `await DataStore.hydrate()` — error modal with retry / reset on failure.
4. `_bindDataStore()` — bind `this.transactions`, `this.categories`, etc. to live cache.
5. `DataStore.subscribeRealtime()` + `_registerRealtimeListeners()` — wire UI re-renders.
6. `bootstrapAuth()` — existing wizard / setup-admin / restore-session / login-modal flow.

**Cross-device behaviour:**
- Transactions, shifts, settings, categories, users, sessions all propagate within ~1 second via realtime.
- Logout from device A flips `pos_session.user_id` to null; the session listener on device B detects the mismatch with `Auth._currentUser` and force-logs out locally.
- 50-shift retention cap is enforced client-side in `DataStore.insertShift` (oldest deleted from DB).

## Auth Model

**Roles & permissions** — defined in `script.js` as `PERMISSIONS` constants and `ROLE_PERMISSIONS`:

| Permission | Admin | Cashier |
|---|---|---|
| `MANAGE_SETTINGS` (open Settings) | ✅ | ❌ |
| `MANAGE_USERS` (CRUD users) | ✅ | ❌ |
| `DELETE_HISTORY` (delete shifts) | ✅ | ❌ |
| `EDIT_TRANSACTION` | ✅ | ❌ |
| `DELETE_TRANSACTION` | ✅ | ❌ |
| `EXPORT_DATA` (Excel/CSV) | ✅ | ✅ |
| `CLOSE_SHIFT` | ✅ | ✅ |
| `CREATE_TRANSACTION` | ✅ | ✅ |

**Disclaimer:** The RLS policy used by `SUPABASE_SETUP.md` is permissive (`anon full access`). The publishable key + URL pair is effectively the access secret for a tenant. Suitable for the per-business-project deployment model; revisit when migrating to multi-tenant.

**PIN hashing:** SubtleCrypto SHA-256 with random 16-byte salt per user. Format: `sha256:<base64-salt>:<base64-hash>`. Cashier role can have `pinHash: null` (login by name only).

## localStorage Keys (UI-only, per-browser)

Cross-device data lives in Supabase. Only these per-browser preferences stay local:

| Key | Value | Purpose |
|-----|-------|---------|
| `pos_sb_config` | `{url, key}` | Supabase project pairing — set once per browser via wizard |
| `pos_access_granted` | Boolean | True once `APP_ACCESS_CODE` has been entered on this browser |
| `pos_lang` | `'en'` or `'id'` | Language preference (intentionally not synced cross-device) |
| `pos_header_hidden` | Boolean | Collapsed-header toggle in the action bar |
| `pos_staff` | Array of strings | Cached mirror of `pos_users.username` for offline UI fallback |
| `pos_migrated_v1` | Marker | Legacy migration marker from the `hostel_*` → `pos_*` rename |
| `theme` | `'light'` \| `'dark'` | Theme preference |

**Migration:** An IIFE at the top of `lang.js` auto-migrates legacy `hostel_*` keys to `pos_*` once per browser. Vestigial post-Supabase migration; preserved for any cold install that ran on the localStorage-only build.

## Transaction Object Shape
```js
{
  id:           String (crypto.randomUUID()),
  jenis:        'INCOME' | 'OUTGOING',
  kategori:     String,
  deskripsi:    String,
  jumlah:       Number (negative for OUTGOING),
  metode:       'Cash' | 'Card' | 'Transfer' | 'Qris',
  keterangan:   String (optional note),
  staff:        String,
  tanggalWaktu: ISO date string
}
```

## Shift History Record Shape
```js
{
  id:       String (`shift_${Date.now()}`),
  closedAt: ISO date string,
  staff:    Array of unique staff names,
  summary: {
    cash, card, other, total,
    totalIncome, totalOutgoing,
    jumlahTransaksi,
    actualCash,  // null if not entered
    actualCard,  // null if not entered
    selisihCash, // actual - expected, null if not entered
    selisihCard
  },
  transactions: Array (deep copy of all transactions in that shift)
}
```

## Key Classes & Patterns

### Storage / AuthStorage / DataStore (supabase.js)
See **Supabase Architecture** above. `Storage` is the legacy sync facade; `DataStore` is the canonical async API.

### Validator (script.js)
Defensive cleanup for any array-of-string data that may have come from older localStorage caches (e.g. `pos_staff`). Schema constraints already enforce the same invariants on the Supabase side, so it's not exercised on hydrated data.

### LangManager (lang.js)
```js
LangManager.current   // 'en' | 'id'
LangManager.t(key)    // returns translated string
LangManager.toggle()  // switch language + save to localStorage
t(key, arg)           // global shorthand (defined ONCE in lang.js)
```
All UI strings use `data-i18n="key"` attributes. `applyLang()` loops them and sets `textContent`.

### ChillPOS class (script.js)
Main app class. Key methods:
- `renderAll()` — re-renders date, brand, dashboard, filter, table
- `applyLang()` — updates all i18n elements + re-renders dynamic parts
- `isFirstRun()` — true if brand still default ('My Business')
- `showFirstRunWizard()` / `saveFirstRunWizard()` — onboarding flow
- `checkShiftStatus()` — shows Start Shift modal if no active shift
- `mulaiShift()` — saves START BALANCE transaction, sets shift active
- `confirmTutupShift()` — opens 2-step Close Shift modal
- `showTutupShiftSummary()` — shows expected vs actual vs difference table
- `eksekusiTutupShift()` — saves history, clears transactions, resets shift
- `saveShiftHistory()` — snapshots current shift to pos_shift_history
- `simpanTransaksi()` — save/update transaction with loading state
- `getVisibleTransactions()` — single pipeline (filter → search → sort)
- `populateForm(tx)` — fill form fields from transaction data (no innerHTML)
- `toggleLang()` — calls LangManager.toggle() + applyLang()

### Defaults
```js
DEFAULT_CATEGORIES = ['START BALANCE', 'Sales', 'Refund', 'Expense', 'Other']
DEFAULT_STAFF      = ['Staff 1']
DEFAULT_BRAND      = 'My Business'
```
`START BALANCE` is required by `mulaiShift()` — wizard re-inserts it if user removes.

## Security Implemented
- XSS: all user data goes through `escapeHtml()` before innerHTML; form fields use `.value` (not innerHTML)
- Excel injection: `sanitizeForExcel()` prefixes dangerous leading chars
- localStorage validation: Validator rejects malformed data on load
- Storage quota: graceful error + user alert if localStorage is full
- Confirm modals: `showConfirm(msg, cb, isHtml)` — only hardcoded HTML uses isHtml=true

## UI Patterns
- Static HTML templates for modals + filter (no innerHTML generation for structural elements)
- Event listeners attached once in `initEventListeners()` — no re-attachment on render
- `data-i18n="key"` on static text elements; dynamic parts translated in JS
- Sort: `data-kolom` on `<th>`, single click handler on thead via event delegation
- Search: live filter on input, debounce not needed (localStorage is sync)
- Filter: `apply-filter` button reads dropdowns; `reset-filter` clears state
- Filter/search/sort unified via `getVisibleTransactions()` (single source of truth)
- First-run modal: no close button, no Escape, no click-outside — forces completion

## Features Complete
- [x] White-label template (generic defaults, no business-specific terms)
- [x] Vendored deps (Font Awesome, xlsx, papaparse) → offline-capable
- [x] First-run wizard (brand + categories + staff + admin PIN)
- [x] Setup-admin fallback for legacy installs without users
- [x] Local Auth service: PIN hashing (SHA-256 + salt), session, role-based permissions
- [x] User Management UI (admin only): add/delete user, set/reset PIN, change role
- [x] Login modal (Username dropdown + PIN, touch-friendly)
- [x] Role guards on Settings, edit/delete transaction, delete shift history
- [x] Transactions auto-attribute to current user (cashier locked, admin can override)
- [x] Mobile card view for transactions (auto-switch < 769px)
- [x] Date range filter on **history page** (preset: Today/Week/Month + Custom range, filters by `closedAt`)
- [x] Income vs Outgoing bar chart on **history page** (1 bar per shift, pure CSS, no deps)
- [x] In-app Help modal (Quick Start guide, EN + ID)
- [x] localStorage migration `hostel_*` → `pos_*` (auto, one-time, idempotent)
- [x] Transaction CRUD (Income / Outgoing)
- [x] Sort by any column (click header)
- [x] Search (live, multi-field) — composes with filter
- [x] Filter by type + category — composes with search
- [x] Start Shift modal (initial cash balance → saves as START BALANCE transaction)
- [x] Close Shift: 2-step (input actual cash/card → expected vs actual summary → confirm)
- [x] Shift history (max 50, auto-purge oldest)
- [x] History page: list, expand detail, multi-select, delete, export Excel/CSV per shift
- [x] Dark / light theme
- [x] EN / ID language toggle (no reload, button in header)
- [x] Settings: brand name, categories, staff
- [x] Excel export (main + history)
- [x] CSV export on shift close
- [x] Loading state on save button
- [x] Escape key + click-outside to close modals (except first-run wizard)
- [x] XSS protection + localStorage validation + quota handling

## Next Tasks (pick up here)
- [x] **Supabase migration (Fase 2):** done — per-business cloud sync + realtime, see Supabase Architecture above
- [ ] Offline queue: cache writes when `navigator.onLine` is false, flush on reconnect
- [ ] Connection status indicator in header (online / offline / reconnecting)
- [ ] Settings → "Change Supabase project" modal (currently requires DevTools `SupabaseConfig.clear()` + reload)
- [ ] Email magic link via Supabase Auth → replace `APP_ACCESS_CODE` + PIN reset (ROADMAP Batch 3.5)
- [ ] Pagination for transaction table (25/50 rows per page)
- [ ] Chart: Income vs Outgoing bar chart on dashboard (Chart.js — would need to be vendored)
- [ ] Date range filter
- [ ] Soft delete (flag deleted:true, restore option)
- [ ] Auto daily backup snapshot to localStorage
- [ ] Mobile responsive card view for table on small screens
- [ ] Optional: cancel-shift action (delete START BALANCE without recording history)

## How to Run Locally
Serve via any static HTTP server (the Supabase JS SDK won't run reliably from `file://`):
`python -m http.server 8080` or `npx serve .` → open `http://localhost:8080/index.html`.

## Deploying for a New Business
1. Owner provisions a Supabase project per `SUPABASE_SETUP.md` (or you do it on their behalf).
2. Owner opens the production GitHub Pages URL on each device (cashier PC, owner phone, etc.).
3. On the first device: enter the access code → first-run wizard collects Supabase URL + publishable key + brand/categories/staff/admin PIN.
4. On subsequent devices: enter the access code → wizard hides the Supabase section (config already known? No — config is per-browser, see note below) and re-collects URL + key. Same project = same data.

> **Per-browser config:** each browser independently stores `pos_sb_config`. Sharing data across devices means re-entering the same URL + key on each device's first launch. There's currently no QR-code / paste-link onboarding — that's a future enhancement.

## Notes for Claude Code
- Cross-device data lives in Supabase. Local `pos_*` keys are UI prefs only (see localStorage Keys table).
- The `t()` shorthand is a global function defined at the bottom of `lang.js` — it must load before `script.js`. Do **not** redeclare `const t` in `script.js` (causes SyntaxError).
- Script load order in HTML: `papaparse → xlsx → supabase.min.js → supabase.js → lang.js → script.js`. `supabase.js` declares `const Storage / AuthStorage / DataStore / SupabaseConfig` in the global lexical environment so subsequent classic scripts can reference them directly.
- DataStore cache arrays (`transactions`, `shifts`, `categories`, `users`) are mutated in place. `ChillPOS` holds shared references — **never reassign** these on the instance; use `.length = 0; .push(...)` or DataStore CRUD instead.
- Indonesian variable names (jenis, kategori, deskripsi, jumlah, metode, keterangan, tanggalWaktu, staff) are kept as-is on the client; the DB uses snake_case (`tanggal_waktu`, `pin_hash`, etc.). Translators live in `supabase.js`.
- `history.html` has its own inline `<script>` and does not load `script.js`, but it does load `supabase.js` and uses the same `DataStore`.
- When adding new UI strings: add to both `en` and `id` blocks in `lang.js`, add `data-i18n="key"` to the element, and call `applyLang()` if needed.
- Class is `ChillPOS` (was `KasirHostel` before white-label refactor).
- `START BALANCE` is a required category — `mulaiShift()` depends on it. Wizard re-inserts if removed.
