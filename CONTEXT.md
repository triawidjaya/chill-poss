# CHILL POS APP — Claude Code Context

## Overview
A **generic POS (Point of Sale) / cashier web app template** — white-label, portable, offline-capable. Vanilla JS, HTML, CSS — no framework, no backend, no build step. All data stored in `localStorage`.

Originally built for a hostel, now refactored as a reusable template: 1 business = 1 deployment = 1 folder copy.

## File Structure
```
chill-pos/
  index.html    — Main POS page
  history.html  — Shift history page
  script.js     — All app logic (class ChillPOS)
  style.css     — Shared styles (light + dark theme)
  lang.js       — EN/ID language strings + LangManager + storage-key migration
  CONTEXT.md    — This file
  vendor/       — Vendored CDN deps (offline-capable)
    xlsx.full.min.js
    papaparse.min.js
    fontawesome/
      css/all.min.css
      webfonts/
```

## Tech Stack
- Vanilla JS (ES2020+), HTML5, CSS3
- Font Awesome 6.4 (vendored) — icons
- SheetJS / xlsx 0.17.5 (vendored) — Excel export
- PapaParse 5.3.0 (vendored) — CSV export
- No npm, no bundler, no framework

## Deployment Model
- **Template white-label:** 1 usaha = 1 deployment (1 folder copy via flashdrive)
- **Portable:** no install, no build, all deps vendored → runs from `index.html` on any modern browser without internet
- **First-run wizard:** runs when `brandName === DEFAULT_BRAND` ('My Business'). User fills brand + categories + staff + chooses admin user + sets admin PIN. After wizard, all staff are auto-created as users (admin gets PIN, others as cashier with no PIN — admin can set PINs later via Manage Users)
- **Setup-admin fallback:** for installs with existing data but no users yet (e.g. data migrated from pre-auth version), a one-time "Set Up Admin Account" modal appears at startup
- **Future Opsi 2 (separate task):** per-business Supabase backend for auth, sync, multi-device. Local Auth service is designed async-ready with swappable `AuthStorage` adapter — migration = swap adapter body, all callers stay the same

## Auth Model (local-only, UX guard not security)

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

**Disclaimer:** Local auth is a UX guard, not real security. Anyone with DevTools can edit `pos_users` in localStorage to elevate themselves. Acceptable to prevent staff iseng (accidental clicks); not acceptable to prevent staff niat jahat (data exfiltration). Real security comes with Opsi 2 (Supabase RLS).

**PIN hashing:** SubtleCrypto SHA-256 with random 16-byte salt per user. Format: `sha256:<base64-salt>:<base64-hash>`. Cashier role can have `pinHash: null` (login by name only).

## localStorage Keys
| Key | Value |
|-----|-------|
| `pos_transactions` | Array of transaction objects |
| `pos_shift_history` | Array of shift records (max 50) |
| `pos_shift_active` | Boolean — shift started or not |
| `pos_categories` | Array of category strings |
| `pos_staff` | Array of staff name strings |
| `pos_brand` | String — brand name shown in header |
| `pos_lang` | `'en'` or `'id'` |
| `pos_migrated_v1` | Migration marker — set once after `hostel_*` → `pos_*` migration |
| `pos_users` | Array of user objects `{id, username, pinHash, role, createdAt}` |
| `pos_session` | `{userId, loginAt}` — current login session, null if logged out |
| `theme` | `'light'` or `'dark'` |

**Migration:** An IIFE at the top of `lang.js` auto-migrates legacy `hostel_*` keys to `pos_*` once per browser. Idempotent — safe to ship to fresh installs (0 keys migrated) and existing Pipes Hostel installs (7 keys carried over).

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

### Storage (script.js)
Centralised localStorage wrapper with error handling + QuotaExceededError detection.

### Validator (script.js)
Validates all data loaded from localStorage before use. Invalid entries are silently dropped.

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
- [ ] **Opsi 2:** Per-business Supabase backend (auth + sync + multi-device). Migration = swap `AuthStorage` adapter body, all Auth callers stay
- [ ] Pagination for transaction table (25/50 rows per page)
- [ ] Chart: Income vs Outgoing bar chart on dashboard (Chart.js — would need to be vendored)
- [ ] Date range filter
- [ ] Soft delete (flag deleted:true, restore option)
- [ ] Auto daily backup snapshot to localStorage
- [ ] Mobile responsive card view for table on small screens
- [ ] Optional: cancel-shift action (delete START BALANCE without recording history)

## How to Run Locally
Open `index.html` directly in browser — no server needed, no internet needed.
Or use a simple server: `npx serve .` or `python3 -m http.server 8080`

## Deploying for a New Business
1. Copy entire folder (including `vendor/`) to target computer
2. Open `index.html` in browser
3. First-run wizard appears → fill brand, categories, staff
4. Click Finish Setup → Start Shift modal opens → app is ready
5. (Optional) Customize further in Settings (gear icon in header)

## Notes for Claude Code
- All defaults are generic. To deploy for a new business: fill First-Run Wizard OR edit Settings
- Storage keys use `pos_*` prefix; legacy `hostel_*` is auto-migrated by IIFE at top of `lang.js`
- All code comments and strings are in English
- Indonesian variable names (jenis, kategori, deskripsi, jumlah, metode, keterangan, tanggalWaktu, staff) are kept as-is — they are data field names used as localStorage keys across sessions and changing them would break existing stored data
- The `t()` shorthand is a global function defined at the bottom of `lang.js` — it must load before `script.js`. Do **not** redeclare `const t` in `script.js` (causes SyntaxError)
- `history.html` has its own inline `<script>` and does not load `script.js`
- When adding new UI strings: add to both `en` and `id` blocks in `lang.js`, add `data-i18n="key"` to the element, and call `applyLang()` if needed
- Class is `ChillPOS` (was `KasirHostel` before white-label refactor)
- `START BALANCE` is a required category — `mulaiShift()` depends on it. Wizard re-inserts if removed
