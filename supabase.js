// ============================================================
// SUPABASE INTEGRATION — single source of truth for remote data
// + realtime subscriptions.
//
// Load order (in HTML):
//   1. vendor/supabase.min.js   (provides global `supabase`)
//   2. supabase.js              (this file)
//   3. lang.js
//   4. script.js (or history.html inline)
//
// Architecture:
//   - SupabaseConfig: URL + publishable key persisted in localStorage
//   - getSupabase(): singleton client
//   - DataStore: in-memory cache, hydrated on app start, kept fresh via realtime
//   - Storage / AuthStorage: legacy-compatible facades over DataStore + localStorage
// ============================================================

// ── Config storage ──
const SB_CONFIG_KEY = 'pos_sb_config';

const SupabaseConfig = {
  load() {
    try {
      const raw = localStorage.getItem(SB_CONFIG_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
  save(url, key) {
    const cleanUrl = this._normalizeUrl(url);
    const cleanKey = String(key || '').trim();
    if (!this.isValidUrl(cleanUrl)) throw new Error('invalidSupabaseUrl');
    if (!this.isValidKey(cleanKey)) throw new Error('invalidSupabaseKey');
    localStorage.setItem(SB_CONFIG_KEY, JSON.stringify({ url: cleanUrl, key: cleanKey }));
    _client = null; // force re-init next getSupabase()
  },
  clear() {
    localStorage.removeItem(SB_CONFIG_KEY);
    _client = null;
  },
  // Strip common copy-paste cruft: trailing slashes, REST path, whitespace.
  // Accepts e.g. "https://xxx.supabase.co/rest/v1/" → "https://xxx.supabase.co".
  _normalizeUrl(url) {
    return String(url || '').trim()
      .replace(/\/rest\/v\d+\/?$/i, '')
      .replace(/\/+$/, '');
  },
  isValidUrl(url) {
    return /^https:\/\/[a-z0-9]+\.supabase\.co$/i.test(this._normalizeUrl(url));
  },
  isValidKey(key) {
    const k = String(key || '').trim();
    return k.startsWith('sb_publishable_') || k.startsWith('eyJ');
  },
};

// ── Client singleton ──
let _client = null;
function getSupabase() {
  if (_client) return _client;
  const cfg = SupabaseConfig.load();
  if (!cfg) throw new Error('Supabase not configured');
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    throw new Error('Supabase SDK not loaded');
  }
  _client = supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: false },     // we manage our own user table
    realtime: { params: { eventsPerSecond: 10 } },
  });
  return _client;
}

// ── Translators: snake_case (DB) ↔ camelCase (app) ──
const toAppUser = (r) => ({
  id:        r.id,
  username:  r.username,
  pinHash:   r.pin_hash,
  role:      r.role,
  createdAt: r.created_at,
});
const toDbUser = (u) => ({
  id:         u.id,
  username:   u.username,
  pin_hash:   u.pinHash,
  role:       u.role,
  created_at: u.createdAt || new Date().toISOString(),
});

const toAppTx = (r) => ({
  id:           r.id,
  jenis:        r.jenis,
  kategori:     r.kategori,
  deskripsi:    r.deskripsi,
  jumlah:       Number(r.jumlah),
  metode:       r.metode,
  keterangan:   r.keterangan || '',
  staff:        r.staff,
  tanggalWaktu: r.tanggal_waktu,
});
const toDbTx = (t) => ({
  id:            t.id,
  jenis:         t.jenis,
  kategori:      t.kategori,
  deskripsi:     t.deskripsi,
  jumlah:        t.jumlah,
  metode:        t.metode,
  keterangan:    t.keterangan || null,
  staff:         t.staff,
  tanggal_waktu: t.tanggalWaktu,
});

const toAppShift = (r) => ({
  id:           r.id,
  startedAt:    r.started_at,
  closedAt:     r.closed_at,
  staff:        r.staff,
  summary:      r.summary,
  transactions: r.transactions,
});
const toDbShift = (s) => ({
  id:           s.id,
  started_at:   s.startedAt,
  closed_at:    s.closedAt,
  staff:        s.staff,
  summary:      s.summary,
  transactions: s.transactions,
});

// ============================================================
// DataStore — in-memory cache + realtime + CRUD
//
// All arrays MUST be mutated in place (push, splice, length=0).
// External callers may hold references to these arrays (e.g.
// `this.transactions = DataStore.transactions`), so reassignment
// would break the shared reference and silently desync the UI.
// ============================================================

const MODE_KEY = 'pos_mode';   // 'local' | 'cloud'

const DataStore = {
  hydrated: false,
  _mode: null,                 // set via setMode() during bootstrap

  setMode(mode) {
    this._mode = mode;
    try { localStorage.setItem(MODE_KEY, JSON.stringify(mode)); } catch {}
  },
  loadMode() {
    try { return JSON.parse(localStorage.getItem(MODE_KEY)); } catch { return null; }
  },
  isLocal() { return this._mode === 'local'; },
  isCloud() { return this._mode === 'cloud'; },

  transactions: [],
  shifts:       [],
  categories:   [],            // array of name strings
  users:        [],
  session:      null,          // { userId, loginAt } | null
  settings: {
    brand:       'My Business',
    lang:        'en',
    shiftActive: false,
  },

  _listeners: {
    transactions: [], shifts: [], categories: [],
    users: [], session: [], settings: [],
  },

  on(entity, cb) {
    if (!this._listeners[entity]) this._listeners[entity] = [];
    this._listeners[entity].push(cb);
  },
  _fire(entity) {
    (this._listeners[entity] || []).forEach(cb => {
      try { cb(); } catch (e) { console.error('[DataStore]', entity, 'listener error:', e); }
    });
  },

  // Empty all caches — useful on Supabase reconfig
  _resetCache() {
    this.transactions.length = 0;
    this.shifts.length       = 0;
    this.categories.length   = 0;
    this.users.length        = 0;
    this.session             = null;
    this.settings.brand      = 'My Business';
    this.settings.lang       = 'en';
    this.settings.shiftActive = false;
    this.hydrated = false;
  },

  async hydrate() {
    if (this.isLocal()) return this._hydrateLocal();
    return this._hydrateCloud();
  },

  _hydrateLocal() {
    this.transactions.length = 0;
    (_lsGet('pos_transactions', []) || []).forEach(t => this.transactions.push(t));
    this.shifts.length = 0;
    (_lsGet('pos_shift_history', []) || []).forEach(s => this.shifts.push(s));
    this.categories.length = 0;
    (_lsGet('pos_categories', []) || []).forEach(c => this.categories.push(c));
    this.users.length = 0;
    (_lsGet('pos_users', []) || []).forEach(u => this.users.push(u));
    this.session = _lsGet('pos_session', null);
    this.settings.brand       = _lsGet('pos_brand',        'My Business');
    this.settings.lang        = _lsGet('pos_lang',         'en');
    this.settings.shiftActive = _lsGet('pos_shift_active', false);
    this.hydrated = true;
  },

  async _hydrateCloud() {
    const sb = getSupabase();
    const [txRes, shiftRes, catRes, userRes, sessRes, setRes] = await Promise.all([
      sb.from('pos_transactions').select('*').order('tanggal_waktu', { ascending: false }),
      sb.from('pos_shifts').select('*').order('closed_at', { ascending: false }).limit(50),
      sb.from('pos_categories').select('*').order('sort_order', { ascending: true }),
      sb.from('pos_users').select('*').order('created_at', { ascending: true }),
      sb.from('pos_session').select('*').eq('id', 1).maybeSingle(),
      sb.from('pos_settings').select('*'),
    ]);
    for (const r of [txRes, shiftRes, catRes, userRes, sessRes, setRes]) {
      if (r.error) throw new Error(`Hydrate failed: ${r.error.message}`);
    }

    // Replace contents in place
    this.transactions.length = 0;
    (txRes.data || []).forEach(r => this.transactions.push(toAppTx(r)));

    this.shifts.length = 0;
    (shiftRes.data || []).forEach(r => this.shifts.push(toAppShift(r)));

    this.categories.length = 0;
    (catRes.data || []).forEach(c => this.categories.push(c.name));

    this.users.length = 0;
    (userRes.data || []).forEach(r => this.users.push(toAppUser(r)));

    const s = sessRes.data;
    this.session = (s && s.user_id) ? { userId: s.user_id, loginAt: s.login_at } : null;

    const map = {};
    (setRes.data || []).forEach(row => { map[row.key] = row.value; });
    this.settings.brand       = map.brand        ?? 'My Business';
    this.settings.lang        = map.lang         ?? 'en';
    this.settings.shiftActive = map.shift_active ?? false;

    this.hydrated = true;
  },

  // ── Realtime ──
  subscribeRealtime() {
    if (this.isLocal()) return;   // no realtime in local mode
    const sb = getSupabase();
    sb.channel('pos-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_transactions' }, (p) => this._onTxChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_shifts'       }, (p) => this._onShiftChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_categories'   }, (p) => this._onCategoryChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_users'        }, (p) => this._onUserChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_session'      }, (p) => this._onSessionChange(p))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pos_settings'     }, (p) => this._onSettingsChange(p))
      .subscribe();
  },

  _onTxChange(p) {
    if (p.eventType === 'INSERT') {
      if (!this.transactions.some(t => t.id === p.new.id)) this.transactions.unshift(toAppTx(p.new));
    } else if (p.eventType === 'UPDATE') {
      const idx = this.transactions.findIndex(t => t.id === p.new.id);
      const tx  = toAppTx(p.new);
      if (idx !== -1) this.transactions[idx] = tx; else this.transactions.unshift(tx);
    } else if (p.eventType === 'DELETE') {
      const idx = this.transactions.findIndex(t => t.id === p.old.id);
      if (idx !== -1) this.transactions.splice(idx, 1);
    }
    this._fire('transactions');
  },

  _onShiftChange(p) {
    if (p.eventType === 'INSERT') {
      if (!this.shifts.some(x => x.id === p.new.id)) this.shifts.unshift(toAppShift(p.new));
      if (this.shifts.length > 50) this.shifts.splice(50);
    } else if (p.eventType === 'UPDATE') {
      const idx = this.shifts.findIndex(x => x.id === p.new.id);
      if (idx !== -1) this.shifts[idx] = toAppShift(p.new);
    } else if (p.eventType === 'DELETE') {
      const idx = this.shifts.findIndex(x => x.id === p.old.id);
      if (idx !== -1) this.shifts.splice(idx, 1);
    }
    this._fire('shifts');
  },

  _onCategoryChange(_p) {
    // Refetch the whole list — keeps sort_order semantics consistent
    getSupabase().from('pos_categories').select('*').order('sort_order')
      .then(({ data }) => {
        this.categories.length = 0;
        (data || []).forEach(c => this.categories.push(c.name));
        this._fire('categories');
      })
      .catch(e => console.error('[DataStore] category refetch failed:', e));
  },

  _onUserChange(p) {
    if (p.eventType === 'INSERT') {
      if (!this.users.some(x => x.id === p.new.id)) this.users.push(toAppUser(p.new));
    } else if (p.eventType === 'UPDATE') {
      const idx = this.users.findIndex(x => x.id === p.new.id);
      if (idx !== -1) this.users[idx] = toAppUser(p.new);
    } else if (p.eventType === 'DELETE') {
      const idx = this.users.findIndex(x => x.id === p.old.id);
      if (idx !== -1) this.users.splice(idx, 1);
    }
    this._fire('users');
  },

  _onSessionChange(p) {
    if (p.eventType === 'DELETE') {
      this.session = null;
    } else {
      const s = p.new;
      this.session = (s && s.user_id) ? { userId: s.user_id, loginAt: s.login_at } : null;
    }
    this._fire('session');
  },

  _onSettingsChange(p) {
    if (p.eventType === 'DELETE') return;
    const { key, value } = p.new;
    if      (key === 'brand')        this.settings.brand       = value;
    else if (key === 'lang')         this.settings.lang        = value;
    else if (key === 'shift_active') this.settings.shiftActive = value;
    this._fire('settings');
  },

  // ── Transaction CRUD ──
  async insertTransaction(tx) {
    if (this.isLocal()) {
      if (!this.transactions.some(t => t.id === tx.id)) this.transactions.unshift({ ...tx });
      _lsSet('pos_transactions', this.transactions);
      this._fire('transactions');
      return;
    }
    const { error } = await getSupabase().from('pos_transactions').insert([toDbTx(tx)]);
    if (error) throw error;
    if (!this.transactions.some(t => t.id === tx.id)) this.transactions.unshift({ ...tx });
  },

  async updateTransaction(tx) {
    if (this.isLocal()) {
      const idx = this.transactions.findIndex(t => t.id === tx.id);
      if (idx !== -1) this.transactions[idx] = { ...tx };
      _lsSet('pos_transactions', this.transactions);
      this._fire('transactions');
      return;
    }
    const { error } = await getSupabase().from('pos_transactions').update(toDbTx(tx)).eq('id', tx.id);
    if (error) throw error;
    const idx = this.transactions.findIndex(t => t.id === tx.id);
    if (idx !== -1) this.transactions[idx] = { ...tx };
  },

  async deleteTransaction(id) {
    if (this.isLocal()) {
      const idx = this.transactions.findIndex(t => t.id === id);
      if (idx !== -1) this.transactions.splice(idx, 1);
      _lsSet('pos_transactions', this.transactions);
      this._fire('transactions');
      return;
    }
    const { error } = await getSupabase().from('pos_transactions').delete().eq('id', id);
    if (error) throw error;
    const idx = this.transactions.findIndex(t => t.id === id);
    if (idx !== -1) this.transactions.splice(idx, 1);
  },

  async clearTransactions() {
    if (this.isLocal()) {
      this.transactions.length = 0;
      _lsSet('pos_transactions', this.transactions);
      this._fire('transactions');
      return;
    }
    // .delete() requires a filter clause — neq an impossible UUID matches all rows.
    const { error } = await getSupabase().from('pos_transactions')
      .delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (error) throw error;
    this.transactions.length = 0;
  },

  // ── Shift CRUD ──
  async insertShift(shift) {
    if (this.isLocal()) {
      if (!this.shifts.some(s => s.id === shift.id)) this.shifts.unshift({ ...shift });
      if (this.shifts.length > 50) this.shifts.splice(50);
      _lsSet('pos_shift_history', this.shifts);
      this._fire('shifts');
      return;
    }
    const { error } = await getSupabase().from('pos_shifts').insert([toDbShift(shift)]);
    if (error) throw error;
    if (!this.shifts.some(s => s.id === shift.id)) this.shifts.unshift({ ...shift });
    if (this.shifts.length > 50) {
      const toRemove = this.shifts.splice(50);
      const ids = toRemove.map(s => s.id);
      await getSupabase().from('pos_shifts').delete().in('id', ids).then(({ error }) => {
        if (error) console.error('[DataStore] shift trim failed:', error);
      });
    }
  },

  async deleteShifts(ids) {
    if (!ids || ids.length === 0) return;
    if (this.isLocal()) {
      const set = new Set(ids);
      for (let i = this.shifts.length - 1; i >= 0; i--) {
        if (set.has(this.shifts[i].id)) this.shifts.splice(i, 1);
      }
      _lsSet('pos_shift_history', this.shifts);
      this._fire('shifts');
      return;
    }
    const { error } = await getSupabase().from('pos_shifts').delete().in('id', ids);
    if (error) throw error;
    const set = new Set(ids);
    for (let i = this.shifts.length - 1; i >= 0; i--) {
      if (set.has(this.shifts[i].id)) this.shifts.splice(i, 1);
    }
  },

  // ── Category CRUD (full sync of name array) ──
  async saveCategories(categories) {
    if (this.isLocal()) {
      this.categories.length = 0;
      categories.forEach(n => this.categories.push(n));
      _lsSet('pos_categories', this.categories);
      this._fire('categories');
      return;
    }
    const sb = getSupabase();
    const { data: existing, error: e1 } = await sb.from('pos_categories').select('id,name,sort_order,is_system');
    if (e1) throw e1;
    const existingByName = new Map((existing || []).map(c => [c.name, c]));
    const newNames = new Set(categories);

    // Delete categories no longer in the list (skip system ones)
    const toDelete = (existing || []).filter(c => !newNames.has(c.name) && !c.is_system);
    if (toDelete.length > 0) {
      const { error } = await sb.from('pos_categories').delete().in('id', toDelete.map(c => c.id));
      if (error) throw error;
    }

    // Insert new + update sort_order for moved ones
    const toInsert = [];
    const toUpdate = [];
    categories.forEach((name, idx) => {
      const ex = existingByName.get(name);
      if (!ex) {
        toInsert.push({ name, sort_order: idx, is_system: name === 'START BALANCE' });
      } else if (ex.sort_order !== idx) {
        toUpdate.push({ id: ex.id, sort_order: idx });
      }
    });
    if (toInsert.length > 0) {
      const { error } = await sb.from('pos_categories').insert(toInsert);
      if (error) throw error;
    }
    for (const u of toUpdate) {
      const { error } = await sb.from('pos_categories').update({ sort_order: u.sort_order }).eq('id', u.id);
      if (error) throw error;
    }

    this.categories.length = 0;
    categories.forEach(n => this.categories.push(n));
  },

  // ── User CRUD ──
  async insertUser(user) {
    if (this.isLocal()) {
      if (!this.users.some(u => u.id === user.id)) this.users.push({ ...user });
      _lsSet('pos_users', this.users);
      this._fire('users');
      return { ...user };
    }
    const { data, error } = await getSupabase().from('pos_users').insert([toDbUser(user)]).select().single();
    if (error) throw error;
    const created = toAppUser(data);
    if (!this.users.some(u => u.id === created.id)) this.users.push(created);
    return created;
  },

  async updateUser(userId, updates) {
    if (this.isLocal()) {
      const idx = this.users.findIndex(x => x.id === userId);
      if (idx !== -1) {
        if ('username' in updates) this.users[idx].username = updates.username;
        if ('pinHash'  in updates) this.users[idx].pinHash  = updates.pinHash;
        if ('role'     in updates) this.users[idx].role     = updates.role;
      }
      _lsSet('pos_users', this.users);
      this._fire('users');
      return this.users[idx];
    }
    const dbUpdates = {};
    if ('username' in updates) dbUpdates.username = updates.username;
    if ('pinHash'  in updates) dbUpdates.pin_hash = updates.pinHash;
    if ('role'     in updates) dbUpdates.role     = updates.role;
    const { data, error } = await getSupabase().from('pos_users').update(dbUpdates).eq('id', userId).select().single();
    if (error) throw error;
    const u = toAppUser(data);
    const idx = this.users.findIndex(x => x.id === userId);
    if (idx !== -1) this.users[idx] = u;
    return u;
  },

  async deleteUser(userId) {
    if (this.isLocal()) {
      const idx = this.users.findIndex(u => u.id === userId);
      if (idx !== -1) this.users.splice(idx, 1);
      _lsSet('pos_users', this.users);
      this._fire('users');
      return;
    }
    const { error } = await getSupabase().from('pos_users').delete().eq('id', userId);
    if (error) throw error;
    const idx = this.users.findIndex(u => u.id === userId);
    if (idx !== -1) this.users.splice(idx, 1);
  },

  // ── Session (single row id=1) ──
  async saveSession(session) {
    if (this.isLocal()) {
      this.session = { ...session };
      _lsSet('pos_session', this.session);
      this._fire('session');
      return;
    }
    const { error } = await getSupabase().from('pos_session')
      .update({ user_id: session.userId, login_at: session.loginAt }).eq('id', 1);
    if (error) throw error;
    this.session = { ...session };
  },

  async clearSession() {
    if (this.isLocal()) {
      this.session = null;
      _lsSet('pos_session', null);
      this._fire('session');
      return;
    }
    const { error } = await getSupabase().from('pos_session')
      .update({ user_id: null, login_at: null }).eq('id', 1);
    if (error) throw error;
    this.session = null;
  },

  // ── Settings ──
  async saveSetting(key, value) {
    if (this.isLocal()) {
      if      (key === 'brand')        { this.settings.brand       = value; _lsSet('pos_brand',        value); }
      else if (key === 'lang')         { this.settings.lang        = value; _lsSet('pos_lang',         value); }
      else if (key === 'shift_active') { this.settings.shiftActive = value; _lsSet('pos_shift_active', value); }
      this._fire('settings');
      return;
    }
    const { error } = await getSupabase().from('pos_settings').upsert({ key, value });
    if (error) throw error;
    if      (key === 'brand')        this.settings.brand       = value;
    else if (key === 'lang')         this.settings.lang        = value;
    else if (key === 'shift_active') this.settings.shiftActive = value;
  },
};

// ============================================================
// Storage shim — legacy API kept for backward compat.
//
// Reads: synchronous, from DataStore cache (hydrated on init).
// Writes: synchronous to cache, fire-and-forget to Supabase.
//
// UI-only keys (theme, header_hidden, access_granted, sb_config,
// lang, migrated_v1) remain in localStorage and never touch DataStore.
// ============================================================
const LOCAL_ONLY_KEYS = new Set([
  'theme',
  'pos_lang',
  'pos_header_hidden',
  'pos_access_granted',
  'pos_staff',          // derived from users; cached locally for legacy callers
  'pos_migrated_v1',
  'pos_session',        // per-device session — see AuthStorage below
  SB_CONFIG_KEY,
]);

const _lsGet = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch { return fallback; }
};
const _lsSet = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return (e?.name === 'QuotaExceededError') ? 'quota' : false; }
};

const Storage = {
  get(key, fallback = null) {
    if (LOCAL_ONLY_KEYS.has(key)) return _lsGet(key, fallback);
    switch (key) {
      case 'pos_transactions':  return DataStore.transactions;
      case 'pos_shift_history': return DataStore.shifts;
      case 'pos_categories':    return DataStore.categories;
      case 'pos_brand':         return DataStore.settings.brand;
      case 'pos_shift_active':  return DataStore.settings.shiftActive;
      default:                  return _lsGet(key, fallback);
    }
  },

  set(key, value) {
    if (LOCAL_ONLY_KEYS.has(key)) return _lsSet(key, value);
    const fireAsync = (p) => { p.catch(e => console.error(`[Storage] async write "${key}" failed:`, e)); };
    switch (key) {
      case 'pos_brand':
        DataStore.settings.brand = value;
        fireAsync(DataStore.saveSetting('brand', value));
        return true;
      case 'pos_shift_active':
        DataStore.settings.shiftActive = value;
        fireAsync(DataStore.saveSetting('shift_active', value));
        return true;
      case 'pos_categories':
        fireAsync(DataStore.saveCategories(value));
        return true;
      case 'pos_transactions':
      case 'pos_shift_history':
        // Bulk array overwrites are not supported in Supabase mode.
        // Callers should use DataStore.* methods directly.
        console.warn(`[Storage] bulk "${key}" set is a no-op; use DataStore CRUD.`);
        return true;
      default:
        return _lsSet(key, value);
    }
  },

  remove(key) {
    if (LOCAL_ONLY_KEYS.has(key)) {
      try { localStorage.removeItem(key); } catch {}
      return;
    }
    switch (key) {
      case 'pos_transactions':
        DataStore.clearTransactions().catch(e => console.error('[Storage] clearTransactions failed:', e));
        break;
      case 'pos_shift_active':
        Storage.set('pos_shift_active', false);
        break;
      default:
        try { localStorage.removeItem(key); } catch {}
    }
  },
};

// ============================================================
// AuthStorage — Supabase-backed user/session adapter.
// Identical API surface to legacy AuthStorage so Auth callers don't change.
// ============================================================
const AuthStorage = {
  async getUsers() {
    // Return a shallow copy — callers may mutate the array but should not affect cache.
    return DataStore.users.map(u => ({ ...u }));
  },

  // Legacy bulk save — diff against cache, apply CRUD individually.
  // Prefer DataStore.insertUser / updateUser / deleteUser for clarity.
  async saveUsers(users) {
    const newById      = new Map(users.map(u => [u.id, u]));
    const existingById = new Map(DataStore.users.map(u => [u.id, u]));

    // Delete users removed from the list
    for (const id of existingById.keys()) {
      if (!newById.has(id)) await DataStore.deleteUser(id);
    }
    // Insert new + update changed
    for (const u of users) {
      const ex = existingById.get(u.id);
      if (!ex) {
        await DataStore.insertUser(u);
      } else if (ex.username !== u.username || ex.pinHash !== u.pinHash || ex.role !== u.role) {
        await DataStore.updateUser(u.id, {
          username: u.username, pinHash: u.pinHash, role: u.role,
        });
      }
    }
    return true;
  },

  // Per-device session: stored in localStorage (NOT in Supabase pos_session
  // table). This lets cashier D log in on Computer A while admin A logs in on
  // Computer B simultaneously, each device managing its own session.
  // The legacy single-row pos_session table is now vestigial — safe to ignore
  // or drop later.
  async getSession() {
    return _lsGet('pos_session', null);
  },

  async saveSession(s) {
    _lsSet('pos_session', s);
    return true;
  },

  async clearSession() {
    _lsSet('pos_session', null);
  },
};

// ============================================================
// Migrate Local-mode data to a fresh Supabase project.
// Returns counts on success; throws on validation / non-empty target /
// network failure. Caller persists config + setMode('cloud') + reloads
// only when this resolves.
// ============================================================
async function migrateLocalToCloud(url, key) {
  if (!SupabaseConfig.isValidUrl(url)) throw new Error('invalidSupabaseUrl');
  if (!SupabaseConfig.isValidKey(key)) throw new Error('invalidSupabaseKey');
  if (typeof supabase === 'undefined' || !supabase.createClient) {
    throw new Error('Supabase SDK not loaded');
  }
  const cleanUrl = SupabaseConfig._normalizeUrl(url);
  const cleanKey = String(key).trim();
  const client = supabase.createClient(cleanUrl, cleanKey, {
    auth: { persistSession: false },
  });

  // 1. Verify target project is fresh — refuse to overwrite existing data.
  const [brandRes, usersRes, txRes] = await Promise.all([
    client.from('pos_settings').select('value').eq('key', 'brand').maybeSingle(),
    client.from('pos_users').select('id', { count: 'exact', head: true }),
    client.from('pos_transactions').select('id', { count: 'exact', head: true }),
  ]);
  if (brandRes.error) throw new Error(`Cloud check failed: ${brandRes.error.message}`);
  if (usersRes.error) throw new Error(`Cloud check failed: ${usersRes.error.message}`);
  if (txRes.error)    throw new Error(`Cloud check failed: ${txRes.error.message}`);

  const targetBrand = brandRes.data?.value;
  const targetUserCount = usersRes.count ?? 0;
  const targetTxCount   = txRes.count ?? 0;
  const isFresh = (!targetBrand || targetBrand === 'My Business')
               && targetUserCount === 0
               && targetTxCount   === 0;
  if (!isFresh) throw new Error('cloudNotEmpty');

  // 2. Snapshot local data (DataStore is still in local mode).
  const localTxs    = DataStore.transactions.map(t => ({ ...t }));
  const localShifts = DataStore.shifts.map(s => ({ ...s }));
  const localCats   = [...DataStore.categories];
  const localUsers  = DataStore.users.map(u => ({ ...u }));
  const localBrand        = DataStore.settings.brand;
  const localShiftActive  = DataStore.settings.shiftActive;
  const localSession      = _lsGet('pos_session', null);

  // 3. Write to cloud. Order matters only for FK / unique constraints.
  await client.from('pos_settings').upsert({ key: 'brand',        value: localBrand });
  await client.from('pos_settings').upsert({ key: 'shift_active', value: localShiftActive });

  // Categories: replace seeded non-system rows with local list. START BALANCE
  // is already seeded; upsert by name updates its sort_order.
  {
    const { error } = await client.from('pos_categories').delete().eq('is_system', false);
    if (error) throw new Error(`Categories cleanup failed: ${error.message}`);
    if (localCats.length > 0) {
      const rows = localCats.map((name, idx) => ({
        name, sort_order: idx, is_system: name === 'START BALANCE',
      }));
      const { error: e2 } = await client.from('pos_categories').upsert(rows, { onConflict: 'name' });
      if (e2) throw new Error(`Categories migrate failed: ${e2.message}`);
    }
  }

  if (localUsers.length > 0) {
    const { error } = await client.from('pos_users').insert(localUsers.map(toDbUser));
    if (error) throw new Error(`Users migrate failed: ${error.message}`);
  }
  if (localTxs.length > 0) {
    const { error } = await client.from('pos_transactions').insert(localTxs.map(toDbTx));
    if (error) throw new Error(`Transactions migrate failed: ${error.message}`);
  }
  if (localShifts.length > 0) {
    const { error } = await client.from('pos_shifts').insert(localShifts.map(toDbShift));
    if (error) throw new Error(`Shifts migrate failed: ${error.message}`);
  }
  if (localSession?.userId) {
    const { error } = await client.from('pos_session')
      .update({ user_id: localSession.userId, login_at: localSession.loginAt }).eq('id', 1);
    if (error) throw new Error(`Session migrate failed: ${error.message}`);
  }

  return {
    transactions: localTxs.length,
    shifts:       localShifts.length,
    users:        localUsers.length,
    categories:   localCats.length,
  };
}

// Expose DataStore + SupabaseConfig globally for script.js / history.html
window.DataStore           = DataStore;
window.SupabaseConfig      = SupabaseConfig;
window.getSupabase         = getSupabase;
window.Storage             = Storage;
window.AuthStorage         = AuthStorage;
window.migrateLocalToCloud = migrateLocalToCloud;
