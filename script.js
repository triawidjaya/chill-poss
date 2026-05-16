// ============================================================
// STORAGE SERVICE — centralized localStorage access
// Prevents crashes from corrupted data or full storage
// ============================================================
const Storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      console.warn(`[Storage] Failed to read key "${key}", using fallback.`);
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        console.error('[Storage] localStorage is full!');
        return 'quota';
      }
      console.error('[Storage] Failed to save:', e);
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  }
};

// ============================================================
// VALIDATOR — ensures localStorage data structure is valid
// Prevents crashes if data is corrupted or manipulated
// ============================================================
const Validator = {
  VALID_JENIS:  ['INCOME', 'OUTGOING'],
  VALID_METODE: ['Cash', 'Card', 'Transfer', 'Qris'],

  isValidTransaction(t) {
    return (
      t && typeof t === 'object' &&
      typeof t.id           === 'string' && t.id.trim() !== '' &&
      this.VALID_JENIS.includes(t.jenis) &&
      typeof t.kategori     === 'string' && t.kategori.trim() !== '' &&
      typeof t.deskripsi    === 'string' && t.deskripsi.trim() !== '' &&
      typeof t.jumlah       === 'number' && isFinite(t.jumlah) &&
      this.VALID_METODE.includes(t.metode) &&
      typeof t.staff        === 'string' && t.staff.trim() !== '' &&
      typeof t.tanggalWaktu === 'string' && !isNaN(Date.parse(t.tanggalWaktu))
    );
  },

  sanitizeTransactions(raw) {
    if (!Array.isArray(raw)) return [];
    const valid   = raw.filter(t => this.isValidTransaction(t));
    const invalid = raw.length - valid.length;
    if (invalid > 0) console.warn(`[Validator] ${invalid} invalid transaction(s) ignored.`);
    return valid;
  },

  sanitizeStringList(raw, fallback) {
    if (!Array.isArray(raw)) return fallback;
    const clean = raw.filter(s => typeof s === 'string' && s.trim() !== '');
    return clean.length > 0 ? clean : fallback;
  }
};

// ============================================================
// DEFAULT DATA
// ============================================================
// Generic defaults — template starts white-label.
// `START BALANCE` is required by shift-start logic, do not remove.
const DEFAULT_CATEGORIES = ['START BALANCE', 'Sales', 'Refund', 'Expense', 'Other'];
const DEFAULT_STAFF      = ['Staff 1'];
const DEFAULT_BRAND      = 'My Business';

// Access gate — change this code to restrict who can use the app
const APP_ACCESS_CODE    = 'smallbutspicy';
const STORAGE_KEY_ACCESS = 'pos_access_granted';

// AccessGate adapter — designed for Opsi 2 migration to Supabase.
// Currently compares to a hardcoded constant. When migrating, swap the body
// to call `supabase.rpc('verify_access_code', { code })` or remove entirely
// in favor of email magic links. Caller code does not change.
// See ROADMAP.md > Fase 2 > Batch 3.5 for the migration plan.
const AccessGate = {
  async verify(code) {
    return code === APP_ACCESS_CODE;
  },
};
// Categories required by app logic — cannot be deleted via UI
const SYSTEM_CATEGORIES  = ['START BALANCE'];

// ============================================================
// AUTH — local-first, async-ready, single source of truth.
// Designed for Opsi 2 migration: swap AuthStorage body to API calls,
// keep Auth API surface identical. All callers already `await`.
// ============================================================

const PERMISSIONS = {
  MANAGE_SETTINGS:    'manage_settings',
  MANAGE_USERS:       'manage_users',
  DELETE_HISTORY:     'delete_history',
  EDIT_TRANSACTION:   'edit_transaction',
  DELETE_TRANSACTION: 'delete_transaction',
  EXPORT_DATA:        'export_data',
  CLOSE_SHIFT:        'close_shift',
  CREATE_TRANSACTION: 'create_transaction',
};

const ROLE_PERMISSIONS = {
  admin:   '*',
  cashier: [
    PERMISSIONS.CREATE_TRANSACTION,
    PERMISSIONS.EDIT_TRANSACTION,   // cashier can fix typos in their own work
    PERMISSIONS.CLOSE_SHIFT,
    PERMISSIONS.EXPORT_DATA,
  ],
};

// Storage adapter — swap body to fetch() in Opsi 2; Auth never changes.
const AuthStorage = {
  async getUsers()       { return Storage.get('pos_users', []); },
  async saveUsers(users) { return Storage.set('pos_users', users); },
  async getSession()     { return Storage.get('pos_session', null); },
  async saveSession(s)   { return Storage.set('pos_session', s); },
  async clearSession()   { Storage.remove('pos_session'); },
};

const Auth = {
  _currentUser: null,

  async _hashPIN(pin, salt) {
    const data = new TextEncoder().encode(salt + pin);
    const buf  = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  },

  async _generateSalt() {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return btoa(String.fromCharCode(...arr));
  },

  async _buildPinHash(pin) {
    if (!pin) return null;
    const salt = await this._generateSalt();
    const hash = await this._hashPIN(pin, salt);
    return `sha256:${salt}:${hash}`;
  },

  async createUser({ username, pin, role }) {
    const users = await AuthStorage.getUsers();
    if (users.some(u => u.username === username)) {
      throw new Error('userExists');
    }
    const user = {
      id:        `usr_${crypto.randomUUID()}`,
      username,
      pinHash:   await this._buildPinHash(pin),
      role,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    await AuthStorage.saveUsers(users);
    return user;
  },

  async login(username, pin) {
    const users = await AuthStorage.getUsers();
    const user  = users.find(u => u.username === username);
    if (!user) return { ok: false, reason: 'not_found' };
    if (user.pinHash) {
      if (!pin) return { ok: false, reason: 'pin_required' };
      if (!(await this.verifyPin(user, pin))) return { ok: false, reason: 'wrong_pin' };
    }
    const session = { userId: user.id, loginAt: new Date().toISOString() };
    await AuthStorage.saveSession(session);
    this._currentUser = user;
    return { ok: true, user };
  },

  async verifyPin(user, pin) {
    if (!user?.pinHash || !pin) return false;
    const [, salt, expected] = user.pinHash.split(':');
    const got = await this._hashPIN(pin, salt);
    return got === expected;
  },

  async logout() {
    await AuthStorage.clearSession();
    this._currentUser = null;
  },

  async restoreSession() {
    const s = await AuthStorage.getSession();
    if (!s) return null;
    const users = await AuthStorage.getUsers();
    const user  = users.find(u => u.id === s.userId);
    if (!user) { await this.logout(); return null; }
    this._currentUser = user;
    return user;
  },

  currentUser() { return this._currentUser; },
  hasRole(role) { return this._currentUser?.role === role; },

  can(permission) {
    const u = this._currentUser;
    if (!u) return false;
    const perms = ROLE_PERMISSIONS[u.role];
    return perms === '*' || (Array.isArray(perms) && perms.includes(permission));
  },

  async setUsername(userId, newUsername) {
    const newName = (newUsername || '').trim();
    if (!newName) throw new Error('userNotFound');
    const users = await AuthStorage.getUsers();
    if (users.some(u => u.id !== userId && u.username === newName)) {
      throw new Error('userExists');
    }
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('userNotFound');
    users[idx].username = newName;
    await AuthStorage.saveUsers(users);
  },

  async setUserPIN(userId, newPin) {
    const users = await AuthStorage.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('userNotFound');
    users[idx].pinHash = await this._buildPinHash(newPin);
    await AuthStorage.saveUsers(users);
  },

  async setUserRole(userId, role) {
    const users = await AuthStorage.getUsers();
    const idx = users.findIndex(u => u.id === userId);
    if (idx === -1) throw new Error('userNotFound');
    if (users[idx].role === 'admin' && role !== 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) throw new Error('cannotDemoteLastAdmin');
    }
    users[idx].role = role;
    await AuthStorage.saveUsers(users);
  },

  async deleteUser(userId) {
    const users = await AuthStorage.getUsers();
    const target = users.find(u => u.id === userId);
    if (!target) return false;
    if (target.role === 'admin') {
      const adminCount = users.filter(u => u.role === 'admin').length;
      if (adminCount <= 1) throw new Error('cannotDeleteLastAdmin');
    }
    await AuthStorage.saveUsers(users.filter(u => u.id !== userId));
    return true;
  },
};

// `t()` shorthand is defined globally in lang.js (loaded before this file)

class ChillPOS {
  constructor() {
    // Load all data through Storage + Validator to prevent crashes
    const rawTransactions = Storage.get('pos_transactions', []);
    this.transactions = Validator.sanitizeTransactions(rawTransactions);

    const rawCategories = Storage.get('pos_categories', null);
    this.categories = Validator.sanitizeStringList(rawCategories, DEFAULT_CATEGORIES);

    const rawStaff = Storage.get('pos_staff', null);
    this.staffList = Validator.sanitizeStringList(rawStaff, DEFAULT_STAFF);

    this.brandName   = Storage.get('pos_brand', DEFAULT_BRAND);
    this.currentEditId = null;
    this.confirmAction = null;
    this.shiftActive   = Storage.get('pos_shift_active', false);

    this.sortState   = { kolom: 'tanggalWaktu', arah: 'desc' };

    this.initElements();
    this.initEventListeners();
    this.initTheme();
    this.initLang();
    this.renderAll();
    // Auth bootstrap (async) — picks the right startup flow:
    //   first-run (no brand)  → wizard (creates admin + auto-login)
    //   existing data, no users → setup-admin modal (one-time)
    //   has session           → restore + proceed
    //   else                  → login modal
    this.bootstrapAuth();
  }

  // ============================================================
  // AUTH BOOTSTRAP & UI
  // ============================================================

  async bootstrapAuth() {
    if (!Storage.get(STORAGE_KEY_ACCESS, false)) {
      this.showAccessGate();
      return;
    }
    const users = await AuthStorage.getUsers();
    if (this.isFirstRun()) {
      this.showFirstRunWizard();
      return;
    }
    if (users.length === 0) {
      this.showSetupAdminModal();   // existing data, no users yet
      return;
    }
    const restored = await Auth.restoreSession();
    if (restored) {
      await this._syncStaffFromUsers();
      this.onLoginSuccess(restored);
      return;
    }
    this.showLoginModal();
  }

  showAccessGate() {
    const modal = document.getElementById('access-gate-modal');
    const form  = document.getElementById('access-gate-form');
    const err   = document.getElementById('access-gate-error');
    modal.style.display = 'flex';
    document.getElementById('access-code-input').focus();
    form.onsubmit = async (e) => {
      e.preventDefault();
      const input = document.getElementById('access-code-input').value;
      if (await AccessGate.verify(input)) {
        Storage.set(STORAGE_KEY_ACCESS, true);
        modal.style.display = 'none';
        this.bootstrapAuth();
      } else {
        err.style.display = 'block';
        document.getElementById('access-code-input').value = '';
        document.getElementById('access-code-input').focus();
      }
    };
  }

  // PIN reset via shared access code — works for any user including last admin.
  // See ROADMAP.md > Fase 2 > Batch 3.5 for the planned migration to email-based reset.
  async showResetPinModal() {
    const sel = document.getElementById('rp-user');
    sel.innerHTML = '';
    const users = await AuthStorage.getUsers();
    users.forEach(u => {
      const opt = document.createElement('option');
      opt.value = u.id;
      opt.textContent = `${u.username} (${t(u.role === 'admin' ? 'roleAdmin' : 'roleCashier')})`;
      sel.appendChild(opt);
    });
    document.getElementById('reset-pin-form').reset();
    document.getElementById('login-modal').style.display = 'none';
    document.getElementById('reset-pin-modal').style.display = 'flex';
  }

  hideResetPinModal() {
    document.getElementById('reset-pin-modal').style.display = 'none';
    this.showLoginModal();
  }

  async handleResetPin() {
    const userId  = document.getElementById('rp-user').value;
    const code    = document.getElementById('rp-access-code').value;
    const newPin  = document.getElementById('rp-new-pin').value;
    const confirm = document.getElementById('rp-confirm-pin').value;

    if (!/^\d{4,6}$/.test(newPin)) { this.showAlert(t('pinTooShort'), 'error'); return; }
    if (newPin !== confirm)        { this.showAlert(t('pinMismatch'),  'error'); return; }

    if (!(await AccessGate.verify(code))) {
      this.showAlert(t('wrongAccessCode'), 'error');
      document.getElementById('rp-access-code').value = '';
      document.getElementById('rp-access-code').focus();
      return;
    }

    try {
      await Auth.setUserPIN(userId, newPin);
      document.getElementById('reset-pin-modal').style.display = 'none';
      this.showAlert(t('alertPinReset'), 'success');
      this.showLoginModal();
    } catch (e) {
      this.showAlert(t(e.message) || e.message, 'error');
    }
  }

  onLoginSuccess(user) {
    this.applyAuthUI();
    this.checkShiftStatus();
  }

  applyAuthUI() {
    const u = Auth.currentUser();
    const userMenuBtn = document.getElementById('user-menu');
    if (u) {
      document.getElementById('user-label').textContent = u.username;
      document.getElementById('user-menu-name').textContent = u.username;
      document.getElementById('user-menu-role').textContent = t(u.role === 'admin' ? 'roleAdmin' : 'roleCashier');
      userMenuBtn.style.display = '';
    } else {
      userMenuBtn.style.display = 'none';
    }
    // Apply role guards on UI elements
    document.getElementById('open-settings').style.display = Auth.can(PERMISSIONS.MANAGE_SETTINGS) ? '' : 'none';
    // Re-render table so per-row edit/delete buttons reflect role
    this.renderTransaksiTable();
  }

  showLoginModal() {
    const sel = document.getElementById('login-user');
    sel.innerHTML = '';
    AuthStorage.getUsers().then(users => {
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.username;
        opt.textContent = u.username;
        opt.dataset.hasPin = u.pinHash ? '1' : '0';
        sel.appendChild(opt);
      });
      this._togglePinFieldVisibility();
    });
    document.getElementById('login-pin').value = '';
    document.getElementById('login-modal').style.display = 'flex';
  }

  _togglePinFieldVisibility() {
    const sel = document.getElementById('login-user');
    const opt = sel.options[sel.selectedIndex];
    const needsPin = opt && opt.dataset.hasPin === '1';
    const pinGroup = document.getElementById('login-pin-group');
    pinGroup.style.display = needsPin ? '' : 'none';
    document.getElementById('login-pin').required = !!needsPin;
  }

  async handleLogin() {
    const username = document.getElementById('login-user').value;
    const pin      = document.getElementById('login-pin').value;
    const result   = await Auth.login(username, pin);
    if (!result.ok) {
      const msg = result.reason === 'wrong_pin' ? t('wrongPin')
                : result.reason === 'not_found' ? t('userNotFound')
                : t('pinTooShort');
      this.showAlert(msg, 'error');
      return;
    }
    document.getElementById('login-modal').style.display = 'none';
    await this._syncStaffFromUsers();
    this.onLoginSuccess(result.user);
  }

  async handleLogout() {
    await Auth.logout();
    document.getElementById('user-menu-popup').style.display = 'none';
    // Close any modal that should not survive a logout
    this.elements.mulaiShiftModal.style.display = 'none';
    this.showLoginModal();
  }

  // Setup-admin modal — for installs with existing data but no users yet
  showSetupAdminModal() {
    const sel = document.getElementById('sa-admin-name');
    sel.innerHTML = '';
    this.staffList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
    document.getElementById('sa-admin-pin').value  = '';
    document.getElementById('sa-admin-pin2').value = '';
    document.getElementById('setup-admin-modal').style.display = 'flex';
  }

  async saveSetupAdmin() {
    const name = document.getElementById('sa-admin-name').value;
    const pin  = document.getElementById('sa-admin-pin').value;
    const pin2 = document.getElementById('sa-admin-pin2').value;
    if (!/^\d{4,6}$/.test(pin))   { this.showAlert(t('pinTooShort'), 'error'); return; }
    if (pin !== pin2)             { this.showAlert(t('pinMismatch'), 'error'); return; }
    try {
      // Create the chosen admin (with PIN), and others as cashier (no PIN)
      for (const s of this.staffList) {
        await Auth.createUser({ username: s, pin: s === name ? pin : null, role: s === name ? 'admin' : 'cashier' });
      }
      const result = await Auth.login(name, pin);
      if (!result.ok) { this.showAlert(t('userNotFound'), 'error'); return; }
      document.getElementById('setup-admin-modal').style.display = 'none';
      await this._syncStaffFromUsers();
      this.onLoginSuccess(result.user);
    } catch (e) {
      this.showAlert(t(e.message) || e.message, 'error');
    }
  }

  // ============================================================
  // STAFF SYNC — single source of truth = pos_users
  // ============================================================

  async _syncStaffFromUsers() {
    const users = await AuthStorage.getUsers();
    this.staffList = users.map(u => u.username);
    Storage.set('pos_staff', this.staffList);
    // Reflect in Settings textarea if it's open
    if (this.elements.settingsModal.style.display === 'flex') {
      this.elements.settingsStaff.value = this.staffList.join('\n');
    }
  }

  // ============================================================
  // CATEGORIES CARD UI (Settings)
  // ============================================================

  renderCategoriesList() {
    const list = document.getElementById('settings-categories-list');
    list.innerHTML = '';
    this.categories.forEach((cat, idx) => {
      const isSystem = SYSTEM_CATEGORIES.includes(cat);
      const row = document.createElement('div');
      row.className = 'cat-row' + (isSystem ? ' cat-system' : '');
      if (!isSystem) row.draggable = true;
      row.dataset.idx = idx;
      row.innerHTML = isSystem
        ? `
          <i class="fas fa-lock cat-lock"  title="System category"></i>
          <span class="cat-name">${this.escapeHtml(cat)}</span>
          <span class="cat-badge" data-i18n="systemBadge">${t('systemBadge')}</span>
        `
        : `
          <i class="fas fa-grip-vertical cat-drag" title="Drag to reorder"></i>
          <span class="cat-name">${this.escapeHtml(cat)}</span>
          <button type="button" class="cat-btn cat-edit"   data-idx="${idx}" title="Rename"><i class="fas fa-pen"></i></button>
          <button type="button" class="cat-btn cat-delete" data-idx="${idx}" title="Delete"><i class="fas fa-times"></i></button>
        `;
      list.appendChild(row);
    });
  }

  addCategoryFlow() {
    const name = (prompt(t('addCategoryPrompt'), '') || '').trim();
    if (!name) return;
    if (this.categories.includes(name)) {
      this.showAlert(t('categoryExists'), 'error'); return;
    }
    this.categories.push(name);
    this.renderCategoriesList();
  }

  editCategoryFlow(idx) {
    const old = this.categories[idx];
    if (!old || SYSTEM_CATEGORIES.includes(old)) return;
    const name = (prompt(t('renameCategoryPrompt'), old) || '').trim();
    if (!name || name === old) return;
    if (this.categories.includes(name)) {
      this.showAlert(t('categoryExists'), 'error'); return;
    }
    this.categories[idx] = name;
    this.renderCategoriesList();
  }

  deleteCategoryFlow(idx) {
    const cat = this.categories[idx];
    if (!cat || SYSTEM_CATEGORIES.includes(cat)) return;
    this.categories.splice(idx, 1);
    this.renderCategoriesList();
  }

  _initCategoryDnD() {
    const list = document.getElementById('settings-categories-list');
    let dragIdx = null;
    list.addEventListener('dragstart', (e) => {
      const row = e.target.closest('.cat-row[draggable="true"]');
      if (!row) return;
      dragIdx = parseInt(row.dataset.idx, 10);
      row.classList.add('dragging');
    });
    list.addEventListener('dragend', () => {
      list.querySelectorAll('.dragging').forEach(r => r.classList.remove('dragging'));
      dragIdx = null;
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.target.closest('.cat-row');
      if (!target || dragIdx === null) return;
      const overIdx = parseInt(target.dataset.idx, 10);
      if (overIdx === dragIdx) return;
      // Don't allow dropping into a system row's slot
      if (SYSTEM_CATEGORIES.includes(this.categories[overIdx])) return;
      const moved = this.categories.splice(dragIdx, 1)[0];
      this.categories.splice(overIdx, 0, moved);
      dragIdx = overIdx;
      this.renderCategoriesList();
    });
  }

  // ============================================================
  // USER MANAGEMENT (admin only)
  // ============================================================

  async showUsersModal() {
    if (!Auth.can(PERMISSIONS.MANAGE_USERS)) {
      this.showAlert(t('noPermission'), 'error'); return;
    }
    await this.renderUsersList();
    document.getElementById('add-user-form').reset();
    document.getElementById('users-modal').style.display = 'flex';
  }

  async renderUsersList() {
    const users = await AuthStorage.getUsers();
    const cur   = Auth.currentUser();
    const list  = document.getElementById('users-list');
    list.innerHTML = '';
    users.forEach(u => {
      const isSelf = cur && cur.id === u.id;
      const row = document.createElement('div');
      row.className = 'user-row';
      row.innerHTML = `
        <div class="user-row-info">
          <div class="user-row-name">${this.escapeHtml(u.username)}${isSelf ? ' <small>(you)</small>' : ''}</div>
          <div class="user-row-meta">
            <span class="role-badge role-${u.role}">${t(u.role === 'admin' ? 'roleAdmin' : 'roleCashier')}</span>
            <span class="pin-badge ${u.pinHash ? 'has-pin' : 'no-pin'}">${t(u.pinHash ? 'pinSet' : 'pinNone')}</span>
          </div>
        </div>
        <div class="user-row-actions">
          <select class="user-role-select" data-id="${u.id}">
            <option value="cashier" ${u.role === 'cashier' ? 'selected' : ''}>${t('roleCashier')}</option>
            <option value="admin"   ${u.role === 'admin'   ? 'selected' : ''}>${t('roleAdmin')}</option>
          </select>
          <button class="btn small user-edit-name" data-id="${u.id}" data-name="${this.escapeHtml(u.username)}" title="Rename">
            <i class="fas fa-pen"></i>
          </button>
          <button class="btn small user-set-pin" data-id="${u.id}" data-name="${this.escapeHtml(u.username)}" title="Set/Reset PIN">
            <i class="fas fa-key"></i>
          </button>
          <button class="btn small danger user-delete" data-id="${u.id}" data-name="${this.escapeHtml(u.username)}" ${isSelf ? 'disabled' : ''} title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      list.appendChild(row);
    });
  }

  async addUserFromForm() {
    const username = document.getElementById('new-username').value.trim();
    const role     = document.getElementById('new-user-role').value;
    const pin      = document.getElementById('new-user-pin').value;
    if (!username) return;
    if (pin && !/^\d{4,6}$/.test(pin)) { this.showAlert(t('pinTooShort'), 'error'); return; }
    try {
      await Auth.createUser({ username, pin: pin || null, role });
      document.getElementById('add-user-form').reset();
      await this._syncStaffFromUsers();
      await this.renderUsersList();
      this.showAlert(t('userCreated'), 'success');
    } catch (e) {
      this.showAlert(t(e.message) || e.message, 'error');
    }
  }

  async handleUserListClick(e) {
    const editNameBtn = e.target.closest('.user-edit-name');
    const setPinBtn   = e.target.closest('.user-set-pin');
    const delBtn      = e.target.closest('.user-delete');
    if (editNameBtn) {
      const oldName = editNameBtn.dataset.name;
      const newName = (prompt(t('renameUserPrompt'), oldName) || '').trim();
      if (!newName || newName === oldName) return;
      try {
        await Auth.setUsername(editNameBtn.dataset.id, newName);
        // If the renamed user IS me, refresh the header badge
        if (Auth.currentUser()?.id === editNameBtn.dataset.id) {
          Auth.currentUser().username = newName;
          this.applyAuthUI();
        }
        await this._syncStaffFromUsers();
        await this.renderUsersList();
        this.showAlert(t('userUpdated'), 'success');
      } catch (e) { this.showAlert(t(e.message) || e.message, 'error'); }
    }
    if (setPinBtn) {
      const newPin = prompt(t('setPin') + ' (4-6 digits, empty to remove):', '');
      if (newPin === null) return;
      if (newPin && !/^\d{4,6}$/.test(newPin)) { this.showAlert(t('pinTooShort'), 'error'); return; }
      try {
        await Auth.setUserPIN(setPinBtn.dataset.id, newPin || null);
        await this.renderUsersList();
        this.showAlert(t('userUpdated'), 'success');
      } catch (e) { this.showAlert(t(e.message) || e.message, 'error'); }
    }
    if (delBtn) {
      const name = delBtn.dataset.name;
      this.showConfirm(t('confirmDeleteUser', name), async () => {
        try {
          await Auth.deleteUser(delBtn.dataset.id);
          await this._syncStaffFromUsers();
          await this.renderUsersList();
          this.showAlert(t('userDeleted'), 'success');
        } catch (e) { this.showAlert(t(e.message) || e.message, 'error'); }
      });
    }
  }

  async handleUserRoleChange(e) {
    const sel = e.target.closest('.user-role-select');
    if (!sel) return;
    try {
      await Auth.setUserRole(sel.dataset.id, sel.value);
      await this.renderUsersList();
    } catch (e) { this.showAlert(t(e.message) || e.message, 'error'); await this.renderUsersList(); }
  }

  // ============================================================
  // FIRST RUN WIZARD
  // ============================================================

  isFirstRun() {
    return this.brandName === DEFAULT_BRAND;
  }

  showFirstRunWizard() {
    document.getElementById('fr-brand').value      = '';
    document.getElementById('fr-categories').value = DEFAULT_CATEGORIES.join('\n');
    document.getElementById('fr-staff').value      = DEFAULT_STAFF.join('\n');
    document.getElementById('fr-admin-pin').value  = '';
    document.getElementById('fr-admin-pin2').value = '';
    this._refreshAdminNameDropdown();
    document.getElementById('first-run-modal').style.display = 'flex';
  }

  // Sync the admin-name dropdown with current staff textarea content
  _refreshAdminNameDropdown() {
    const staff = document.getElementById('fr-staff').value
                    .split('\n').map(s => s.trim()).filter(Boolean);
    const sel = document.getElementById('fr-admin-name');
    const prev = sel.value;
    sel.innerHTML = '';
    staff.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
    if (staff.includes(prev)) sel.value = prev;
  }

  async saveFirstRunWizard() {
    const brand = document.getElementById('fr-brand').value.trim();
    const cats  = document.getElementById('fr-categories').value
                    .split('\n').map(s => s.trim()).filter(Boolean);
    const staff = document.getElementById('fr-staff').value
                    .split('\n').map(s => s.trim()).filter(Boolean);
    const adminName = document.getElementById('fr-admin-name').value;
    const pin       = document.getElementById('fr-admin-pin').value;
    const pin2      = document.getElementById('fr-admin-pin2').value;

    if (!brand || cats.length === 0 || staff.length === 0) {
      this.showAlert(t('alertCategoryEmpty'), 'error'); return;
    }
    if (!staff.includes(adminName)) {
      this.showAlert(t('userNotFound'), 'error'); return;
    }
    if (!/^\d{4,6}$/.test(pin)) { this.showAlert(t('pinTooShort'), 'error'); return; }
    if (pin !== pin2)           { this.showAlert(t('pinMismatch'), 'error'); return; }

    if (!cats.includes('START BALANCE')) cats.unshift('START BALANCE');

    this.brandName  = brand;
    this.categories = cats;
    this.staffList  = staff;
    Storage.set('pos_brand',      brand);
    Storage.set('pos_categories', cats);
    Storage.set('pos_staff',      staff);

    // Create users: chosen admin gets PIN, others are cashier with no PIN
    try {
      for (const s of staff) {
        await Auth.createUser({
          username: s,
          pin:  s === adminName ? pin : null,
          role: s === adminName ? 'admin' : 'cashier',
        });
      }
      const result = await Auth.login(adminName, pin);
      if (!result.ok) { this.showAlert(t('userNotFound'), 'error'); return; }
    } catch (e) {
      this.showAlert(t(e.message) || e.message, 'error'); return;
    }

    document.getElementById('first-run-modal').style.display = 'none';
    await this._syncStaffFromUsers();
    this.renderAll();
    this.onLoginSuccess(Auth.currentUser());
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================

  initElements() {
    this.elements = {
      dashboard:          document.getElementById('dashboard'),
      transaksiTable:     document.getElementById('transaksi-table').querySelector('tbody'),
      newTransaksiBtn:    document.getElementById('new-transaksi'),
      downloadExcelBtn:   document.getElementById('download-excel'),
      tutupShiftBtn:      document.getElementById('tutup-shift'),
      openSettingsBtn:    document.getElementById('open-settings'),
      themeToggleBtn:     document.getElementById('theme-toggle'),
      langToggleBtn:      document.getElementById('lang-toggle'),
      langLabel:          document.getElementById('lang-label'),
      formModal:          document.getElementById('form-modal'),
      confirmModal:       document.getElementById('confirm-modal'),
      settingsModal:      document.getElementById('settings-modal'),
      transaksiForm:      document.getElementById('transaksi-form'),
      currentDate:        document.getElementById('current-date'),
      alertContainer:     document.getElementById('alert-container'),
      // Transaction form fields
      fKategori:    document.getElementById('f-kategori'),
      fMetode:      document.getElementById('f-metode'),
      fStaff:       document.getElementById('f-staff'),
      fDeskripsi:   document.getElementById('f-deskripsi'),
      fJumlah:      document.getElementById('f-jumlah'),
      fJumlahPrev:  document.getElementById('f-jumlah-preview'),
      fKeterangan:  document.getElementById('f-keterangan'),
      // Settings fields (categories handled via card UI, not a single textarea)
      settingsBrand:      document.getElementById('settings-brand'),
      settingsStaff:      document.getElementById('settings-staff'),
      // Start Shift modal
      mulaiShiftModal: document.getElementById('mulai-shift-modal'),
      mulaiShiftForm:  document.getElementById('mulai-shift-form'),
      msStaff:         document.getElementById('ms-staff'),
      msCash:          document.getElementById('ms-cash'),
      msCashPreview:   document.getElementById('ms-cash-preview'),
      msPin:           document.getElementById('ms-pin'),
      msPinHint:       document.getElementById('ms-pin-hint'),
      msLogout:        document.getElementById('ms-logout'),
      msSubtitle:      document.getElementById('ms-subtitle'),
      msUseLast:       document.getElementById('ms-use-last'),
      msAmountChips:   document.getElementById('ms-amount-chips'),
      // Close Shift modal
      tutupShiftModal:     document.getElementById('tutup-shift-modal'),
      tsStepInput:         document.getElementById('ts-step-input'),
      tsStepSummary:       document.getElementById('ts-step-summary'),
      tsActualCash:            document.getElementById('ts-actual-cash'),
      tsActualCashPreview:     document.getElementById('ts-actual-cash-preview'),
      tsActualCard:            document.getElementById('ts-actual-card'),
      tsActualCardPreview:     document.getElementById('ts-actual-card-preview'),
      tsActualTransfer:        document.getElementById('ts-actual-transfer'),
      tsActualTransferPreview: document.getElementById('ts-actual-transfer-preview'),
      tsActualQris:            document.getElementById('ts-actual-qris'),
      tsActualQrisPreview:     document.getElementById('ts-actual-qris-preview'),
      tsSummaryContent:        document.getElementById('ts-summary-content'),
    };
  }

  initEventListeners() {
    // Help modal
    document.getElementById('open-help').addEventListener('click', () => this.showHelp());
    document.getElementById('close-help').addEventListener('click', () => this.hideHelp());

    // Header-actions toggle — single fixed button, swap eye icon based on state
    const toggleBtn = document.getElementById('toggle-header');
    const setHeaderHidden = (hidden) => {
      document.body.classList.toggle('header-hidden', hidden);
      Storage.set('pos_header_hidden', hidden);
      toggleBtn.querySelector('.pepper-icon').classList.toggle('slashed', !hidden);
      toggleBtn.title = hidden ? 'Show header' : 'Hide header';
    };
    toggleBtn.addEventListener('click', () => {
      setHeaderHidden(!document.body.classList.contains('header-hidden'));
    });
    if (Storage.get('pos_header_hidden', false)) setHeaderHidden(true);

    // Action bar
    this.elements.newTransaksiBtn.addEventListener('click', () => {
      if (!this.shiftActive) { this.showMulaiShiftModal(); return; }
      this.showForm();
    });
    this.elements.downloadExcelBtn.addEventListener('click', () => this.exportToExcel());
    this.elements.tutupShiftBtn.addEventListener('click',   () => this.confirmTutupShift());
    this.elements.openSettingsBtn.addEventListener('click', () => this.showSettings());
    this.elements.themeToggleBtn.addEventListener('click',  () => this.toggleTheme());
    this.elements.langToggleBtn.addEventListener('click',   () => this.toggleLang());

    // History page navigation
    document.getElementById('btn-histori').addEventListener('click', () => {
      window.location.href = 'history.html';
    });

    // Modal close buttons
    document.getElementById('close-form').addEventListener('click',     () => this.hideForm());
    document.getElementById('close-settings').addEventListener('click', () => this.hideSettings());
    document.getElementById('confirm-cancel').addEventListener('click', () => this.hideConfirm());
    document.getElementById('confirm-ok').addEventListener('click',     () => this.executeConfirm());

    // Transaction form submit + type toggle + cancel
    this.elements.transaksiForm.addEventListener('submit', (e) => { e.preventDefault(); this.simpanTransaksi(); });
    this.elements.transaksiForm.querySelectorAll('.type-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setActiveType(btn.dataset.type));
    });
    document.getElementById('form-batal').addEventListener('click', () => this.hideForm());

    // Amount field — format number on input
    this.elements.fJumlah.addEventListener('input', () => {
      const raw = this.elements.fJumlah.value.replace(/\D/g, '');
      this.elements.fJumlah.dataset.raw     = raw;
      this.elements.fJumlah.value           = raw ? this.formatNumber(Number(raw)) : '';
      this.elements.fJumlahPrev.textContent = raw ? this.formatCurrency(Number(raw)) : '';
    });

    // Settings
    document.getElementById('settings-save').addEventListener('click',  () => this.saveSettings());
    document.getElementById('settings-reset').addEventListener('click', () => this.resetSettings());

    // Categories card UI: Add button + delegated edit/delete + drag-and-drop
    document.getElementById('add-category-btn').addEventListener('click', () => this.addCategoryFlow());
    document.getElementById('settings-categories-list').addEventListener('click', (e) => {
      const editBtn = e.target.closest('.cat-edit');
      const delBtn  = e.target.closest('.cat-delete');
      if (editBtn) this.editCategoryFlow(parseInt(editBtn.dataset.idx, 10));
      if (delBtn)  this.deleteCategoryFlow(parseInt(delBtn.dataset.idx, 10));
    });
    this._initCategoryDnD();

    // Start Shift modal — format cash on input
    this.elements.msCash.addEventListener('input', () => {
      const raw = this.elements.msCash.value.replace(/\D/g, '');
      this.elements.msCash.dataset.raw       = raw;
      this.elements.msCash.value             = raw ? this.formatNumber(Number(raw)) : '';
      this.elements.msCashPreview.textContent = raw ? this.formatCurrency(Number(raw)) : '';
    });
    this.elements.mulaiShiftForm.addEventListener('submit', (e) => { e.preventDefault(); this.mulaiShift(); });
    // Refresh PIN hint when Staff on Duty changes (admin scenario)
    this.elements.msStaff.addEventListener('change', () => this._refreshShiftPinHint());
    // Logout escape hatch — esp. for cashier whose PIN isn't set yet
    this.elements.msLogout.addEventListener('click', () => this.handleLogout());
    // Quick-fill: use last shift's closing cash
    this.elements.msUseLast.addEventListener('click', () => {
      const amt = parseInt(this.elements.msUseLast.dataset.amount || '0', 10);
      if (amt > 0) this._fillCashInput(amt);
    });
    // Amount chips — common preset amounts
    this.elements.msAmountChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.amount-chip');
      if (chip) this._fillCashInput(parseInt(chip.dataset.amount, 10));
    });

    // Close Shift modal — format actual amounts
    const fmtInput = (inputEl, previewEl) => {
      inputEl.addEventListener('input', () => {
        const raw = inputEl.value.replace(/\D/g, '');
        inputEl.dataset.raw   = raw;
        inputEl.value         = raw ? this.formatNumber(Number(raw)) : '';
        previewEl.textContent = raw ? this.formatCurrency(Number(raw)) : '';
      });
    };
    fmtInput(this.elements.tsActualCash,     this.elements.tsActualCashPreview);
    fmtInput(this.elements.tsActualCard,     this.elements.tsActualCardPreview);
    fmtInput(this.elements.tsActualTransfer, this.elements.tsActualTransferPreview);
    fmtInput(this.elements.tsActualQris,     this.elements.tsActualQrisPreview);

    document.getElementById('ts-next').addEventListener('click',         () => this.showTutupShiftSummary());
    document.getElementById('ts-back').addEventListener('click',         () => {
      this.elements.tsStepInput.style.display   = '';
      this.elements.tsStepSummary.style.display = 'none';
    });
    document.getElementById('ts-batal-input').addEventListener('click',  () => {
      this.elements.tutupShiftModal.style.display = 'none';
    });
    document.getElementById('ts-confirm-close').addEventListener('click', () => this.eksekusiTutupShift());

    // Sort — click table header
    document.getElementById('transaksi-table').querySelector('thead')
      .addEventListener('click', (e) => {
        const th = e.target.closest('th[data-kolom]');
        if (!th) return;
        const kolom = th.dataset.kolom;
        this.sortState.arah = this.sortState.kolom === kolom
          ? (this.sortState.arah === 'asc' ? 'desc' : 'asc')
          : 'asc';
        this.sortState.kolom = kolom;
        this.renderTransaksiTable();
      });

    // Event delegation for edit/delete — works for both table rows AND cards
    const txClickHandler = (e) => {
      const editBtn  = e.target.closest('.btn-edit');
      const hapusBtn = e.target.closest('.btn-hapus');
      if (editBtn)  this.showForm(editBtn.dataset.id);
      if (hapusBtn) this.hapusTransaksi(hapusBtn.dataset.id);
    };
    this.elements.transaksiTable.addEventListener('click', txClickHandler);
    document.getElementById('transaksi-cards').addEventListener('click', txClickHandler);

    // Re-render on viewport breakpoint crossing (debounced 150ms)
    let resizeTimer;
    let lastIsMobile = window.innerWidth < 769;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const isMobile = window.innerWidth < 769;
        if (isMobile !== lastIsMobile) {
          lastIsMobile = isMobile;
          this.renderTransaksiTable();
        }
      }, 150);
    });

    // First-run wizard submit + admin name dropdown sync
    document.getElementById('first-run-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveFirstRunWizard();
    });
    document.getElementById('fr-staff').addEventListener('input', () => this._refreshAdminNameDropdown());

    // Setup-admin (existing-data fallback) submit
    document.getElementById('setup-admin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSetupAdmin();
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
    document.getElementById('login-user').addEventListener('change', () => this._togglePinFieldVisibility());

    // PIN reset flow
    document.getElementById('open-reset-pin').addEventListener('click', () => this.showResetPinModal());
    document.getElementById('rp-cancel').addEventListener('click',     () => this.hideResetPinModal());
    document.getElementById('reset-pin-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleResetPin();
    });

    // Header user-menu toggle + logout
    document.getElementById('user-menu').addEventListener('click', (e) => {
      e.stopPropagation();
      const popup = document.getElementById('user-menu-popup');
      popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    });
    document.getElementById('logout-btn').addEventListener('click', () => this.handleLogout());

    // Users management modal
    document.getElementById('open-users').addEventListener('click', () => {
      this.hideSettings();
      this.showUsersModal();
    });
    document.getElementById('close-users').addEventListener('click', () => {
      document.getElementById('users-modal').style.display = 'none';
    });
    document.getElementById('add-user-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.addUserFromForm();
    });
    document.getElementById('users-list').addEventListener('click',  (e) => this.handleUserListClick(e));
    document.getElementById('users-list').addEventListener('change', (e) => this.handleUserRoleChange(e));

    // Close user-menu popup when clicking outside
    document.addEventListener('click', (e) => {
      const popup = document.getElementById('user-menu-popup');
      if (popup.style.display === 'block' && !e.target.closest('#user-menu') && !e.target.closest('#user-menu-popup')) {
        popup.style.display = 'none';
      }
    });

    // Click outside modal to close
    window.addEventListener('click', (e) => {
      if (e.target === this.elements.formModal)       this.hideForm();
      if (e.target === this.elements.confirmModal)    this.hideConfirm();
      if (e.target === this.elements.settingsModal)   this.hideSettings();
      if (e.target === this.elements.tutupShiftModal) this.elements.tutupShiftModal.style.display = 'none';
      if (e.target === document.getElementById('help-modal'))  this.hideHelp();
      if (e.target === document.getElementById('users-modal')) document.getElementById('users-modal').style.display = 'none';
    });

    // Escape key to close active modal
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.elements.formModal.style.display       === 'flex') this.hideForm();
      if (this.elements.confirmModal.style.display    === 'flex') this.hideConfirm();
      if (this.elements.settingsModal.style.display   === 'flex') this.hideSettings();
      if (this.elements.tutupShiftModal.style.display === 'flex') this.elements.tutupShiftModal.style.display = 'none';
      const help = document.getElementById('help-modal');
      if (help.style.display === 'flex') this.hideHelp();
      const users = document.getElementById('users-modal');
      if (users.style.display === 'flex') users.style.display = 'none';
    });
  }

  initTheme() {
    const saved = Storage.get('theme') || 'light';
    document.body.className = `${saved}-theme`;
    this.updateThemeIcon(saved);
  }

  // ============================================================
  // LANGUAGE
  // ============================================================

  initLang() {
    this.applyLang();
  }

  toggleLang() {
    LangManager.toggle();
    this.applyLang();
  }

  applyLang() {
    const lang = LangManager.current;
    // Update toggle button label — show the OTHER language to indicate what clicking will switch to
    this.elements.langLabel.textContent = lang === 'en' ? 'ID' : 'EN';
    document.documentElement.lang = lang;

    // Update all elements with data-i18n
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const str = t(key);
      if (typeof str === 'string') el.textContent = str;
    });

    // Update placeholder attributes
    document.querySelectorAll('[data-i18n-ph]').forEach(el => {
      el.placeholder = t(el.dataset.i18nPh);
    });

    // Re-render dynamic parts that contain translated strings
    this.renderDashboard();
    this.renderTransaksiTable();
  }

  // ============================================================
  // SHIFT STATUS
  // ============================================================

  checkShiftStatus() {
    // Cashier must start shift before doing anything; admin can browse freely
    // and start a shift voluntarily by clicking "New Transaksi".
    if (!this.shiftActive && Auth.hasRole('cashier')) this.showMulaiShiftModal();
    this.updateShiftUI();
  }

  showMulaiShiftModal() {
    this.elements.msStaff.innerHTML = '';
    this.staffList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      this.elements.msStaff.appendChild(opt);
    });
    // Default to current user; cashier locked to themselves
    const cur = Auth.currentUser();
    if (cur) this.elements.msStaff.value = cur.username;
    this.elements.msStaff.disabled = !!cur && cur.role === 'cashier';
    this.elements.msCash.value              = '';
    this.elements.msCash.dataset.raw        = '';
    this.elements.msCashPreview.textContent = '';
    this.elements.msPin.value               = '';
    this._renderShiftSubtitle();
    this._renderLastShiftButton();
    this._refreshShiftPinHint();
    this.elements.mulaiShiftModal.style.display = 'flex';
  }

  // Show current date/time as audit context — what day/time this shift opens.
  _renderShiftSubtitle() {
    const lang = LangManager.current === 'id' ? 'id-ID' : 'en-US';
    const now  = new Date();
    const dateStr = now.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const timeStr = now.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    this.elements.msSubtitle.innerHTML = `<i class="far fa-calendar-alt"></i> ${dateStr} • ${timeStr}`;
  }

  // If previous shift exists, surface its closing cash as a one-click fill.
  _renderLastShiftButton() {
    const history = Storage.get('pos_shift_history', []);
    const last    = history?.[0]; // saveShiftHistory prepends, so [0] = most recent
    const lastCash = last?.summary?.actualCash ?? last?.summary?.cash ?? null;
    const btn = this.elements.msUseLast;
    if (lastCash !== null && lastCash > 0) {
      btn.dataset.amount = String(lastCash);
      btn.innerHTML = `<i class="fas fa-history"></i> ${t('useLastShiftCash', this.formatCurrency(lastCash))}`;
      btn.style.display = '';
    } else {
      btn.style.display = 'none';
    }
  }

  // Single point to programmatically set cash input (used by quick-fill + chips).
  _fillCashInput(amount) {
    const raw = String(Math.max(0, parseInt(amount, 10) || 0));
    this.elements.msCash.dataset.raw       = raw;
    this.elements.msCash.value             = this.formatNumber(Number(raw));
    this.elements.msCashPreview.textContent = this.formatCurrency(Number(raw));
  }

  // Updates the PIN hint text based on currently selected Staff on Duty.
  // Three states: target has PIN, target has no PIN (admin can override),
  // target has no PIN AND current user isn't admin (blocked).
  async _refreshShiftPinHint() {
    const staffName = this.elements.msStaff.value;
    const cur       = Auth.currentUser();
    const users     = await AuthStorage.getUsers();
    const target    = users.find(u => u.username === staffName);
    const isAdmin   = cur?.role === 'admin';
    const hintEl    = this.elements.msPinHint;
    if (!target?.pinHash) {
      // No PIN on target. Admin can still proceed using own PIN; cashier cannot.
      hintEl.textContent = isAdmin ? t('shiftPinNoPinAdmin') : t('shiftPinNoPin', staffName);
      hintEl.style.color = 'var(--danger)';
    } else {
      hintEl.textContent = isAdmin && cur.username !== staffName
        ? t('shiftPinHintAdmin', staffName)
        : t('shiftPinHint', staffName);
      hintEl.style.color = 'var(--gray)';
    }
  }

  async mulaiShift() {
    const staff   = this.elements.msStaff.value;
    const rawCash = parseFloat(this.elements.msCash.dataset.raw || '0') || 0;
    const pin     = (this.elements.msPin.value || '').trim();

    // PIN validation: try target staff's PIN first; admin can override with own PIN.
    const cur     = Auth.currentUser();
    const isAdmin = cur?.role === 'admin';
    const users   = await AuthStorage.getUsers();
    const target  = users.find(u => u.username === staff);

    if (!pin) {
      this.showAlert(t('alertShiftPinRequired'), 'error');
      this.elements.msPin.focus();
      return;
    }

    // Non-admin attempting to start shift for a user with no PIN → blocked.
    if (!target?.pinHash && !isAdmin) {
      this.showAlert(t('alertShiftPinNoPin'), 'error');
      return;
    }

    let pinOk = false;
    if (target?.pinHash) pinOk = await Auth.verifyPin(target, pin);
    // Admin override: when admin starts shift for someone else, OR target has no PIN,
    // admin's own PIN is also accepted (authorizes the till opening).
    if (!pinOk && isAdmin && (cur.username !== staff || !target?.pinHash)) {
      pinOk = await Auth.verifyPin(cur, pin);
    }

    if (!pinOk) {
      this.showAlert(t('alertShiftPinWrong'), 'error');
      this.elements.msPin.value = '';
      this.elements.msPin.focus();
      return;
    }

    // Save initial cash as a START BALANCE INCOME transaction
    const startTx = {
      id:           crypto.randomUUID(),
      jenis:        'INCOME',
      kategori:     'START BALANCE',
      deskripsi:    'Initial Cash Balance',
      jumlah:       rawCash,
      metode:       'Cash',
      keterangan:   '',
      staff,
      tanggalWaktu: new Date().toISOString()
    };

    this.transactions.push(startTx);
    this._saveTransactions();
    this.shiftActive = true;
    Storage.set('pos_shift_active', true);
    this.elements.mulaiShiftModal.style.display = 'none';
    this.renderAll();
    this.updateShiftUI();
    this.showAlert(`${t('alertShiftStarted')} ${this.formatCurrency(rawCash)}`, 'success');
  }

  updateShiftUI() {
    const active  = this.shiftActive;
    const isAdmin = Auth.hasRole('admin');
    // Admin can click "New Transaksi" without an active shift — it opens the
    // start-shift modal instead of erroring. Close-shift stays gated on active.
    this.elements.newTransaksiBtn.disabled      = !active && !isAdmin;
    this.elements.tutupShiftBtn.disabled        = !active;
    this.elements.newTransaksiBtn.style.opacity = (active || isAdmin) ? '1' : '0.45';
    this.elements.tutupShiftBtn.style.opacity   = active ? '1' : '0.45';
  }

  // ============================================================
  // EXCEL HELPERS
  // ============================================================

  // Prevent Excel/CSV injection: prefix dangerous leading chars with apostrophe
  sanitizeForExcel(value) {
    const str = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
    return str;
  }

  buildExcelData() {
    return this.transactions.map(t => ({
      'Date/Time':  this.sanitizeForExcel(new Date(t.tanggalWaktu).toLocaleString()),
      'Type':       this.sanitizeForExcel(t.jenis),
      'Category':   this.sanitizeForExcel(t.kategori),
      'Description':this.sanitizeForExcel(t.deskripsi),
      'Amount':     t.jenis === 'INCOME' ? t.jumlah : -t.jumlah,
      'Method':     this.sanitizeForExcel(t.metode),
      'Note':       this.sanitizeForExcel(t.keterangan || ''),
      'Staff':      this.sanitizeForExcel(t.staff)
    }));
  }

  // ============================================================
  // RENDER
  // ============================================================

  renderAll() {
    this.renderCurrentDate();
    this.renderBrandName();
    this.renderDashboard();
    this.renderTransaksiTable();
    this.updateDownloadButton();
    if (typeof this.updateShiftUI === 'function') this.updateShiftUI();
  }

  renderCurrentDate() {
    const lang = LangManager.current === 'id' ? 'id-ID' : 'en-US';
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    this.elements.currentDate.textContent = new Date().toLocaleDateString(lang, opts);
  }

  renderBrandName() {
    const el = document.getElementById('brand-name');
    if (el) el.textContent = this.brandName;
  }

  renderDashboard() {
    const saldoCash     = this.calculateSaldo('Cash');
    const saldoCard     = this.calculateSaldo('Card');
    const saldoTransfer = this.calculateSaldo('Transfer');
    const saldoQris     = this.calculateSaldo('Qris');

    this.elements.dashboard.innerHTML = `
      <div class="card">
        <h3><i class="fas fa-money-bill-wave"></i> ${t('cashBalance')}</h3>
        <div class="amount">${this.formatCurrency(saldoCash)}</div>
      </div>
      <div class="card">
        <h3><i class="fas fa-credit-card"></i> ${t('cardBalance')}</h3>
        <div class="amount">${this.formatCurrency(saldoCard)}</div>
      </div>
      <div class="card">
        <h3><i class="fas fa-exchange-alt"></i> ${t('transferBalance')}</h3>
        <div class="amount">${this.formatCurrency(saldoTransfer)}</div>
      </div>
      <div class="card">
        <h3><i class="fas fa-qrcode"></i> ${t('qrisBalance')}</h3>
        <div class="amount">${this.formatCurrency(saldoQris)}</div>
      </div>
    `;
  }

  getVisibleTransactions() {
    let txs = this.transactions;

    const { kolom, arah } = this.sortState;
    return txs.slice().sort((a, b) => {
      let va = a[kolom], vb = b[kolom];
      if (kolom === 'tanggalWaktu') { va = new Date(va); vb = new Date(vb); }
      else if (kolom === 'jumlah')  { va = Math.abs(va); vb = Math.abs(vb); }
      else { va = String(va ?? '').toLowerCase(); vb = String(vb ?? '').toLowerCase(); }
      if (va < vb) return arah === 'asc' ? -1 :  1;
      if (va > vb) return arah === 'asc' ?  1 : -1;
      return 0;
    });
  }

  // Dispatcher: pick table or card layout based on viewport.
  // Both renderers use the same getVisibleTransactions() pipeline.
  renderTransaksiTable() {
    const transactions = this.getVisibleTransactions();
    const { kolom, arah } = this.sortState;

    // Update sort icons (always — table header may be hidden but DOM intact)
    document.querySelectorAll('th[data-kolom]').forEach(th => {
      const icon = th.querySelector('.sort-icon');
      if (!icon) return;
      icon.className = th.dataset.kolom === kolom
        ? `sort-icon fas fa-sort-${arah === 'asc' ? 'up' : 'down'}`
        : 'sort-icon fas fa-sort';
    });

    if (window.innerWidth < 769) {
      this._renderCards(transactions);
    } else {
      this._renderTableRows(transactions);
    }
  }

  _renderTableRows(transactions) {
    this.elements.transaksiTable.innerHTML = '';
    if (transactions.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9; td.style.textAlign = 'center';
      td.textContent = t('noTransactionsTable');
      tr.appendChild(td);
      this.elements.transaksiTable.appendChild(tr);
      return;
    }
    const canEdit = Auth.can(PERMISSIONS.EDIT_TRANSACTION);
    const canDel  = Auth.can(PERMISSIONS.DELETE_TRANSACTION);
    transactions.forEach(tx => {
      const row      = document.createElement('tr');
      const date     = new Date(tx.tanggalWaktu);
      const isIncome = tx.jenis === 'INCOME';
      row.innerHTML = `
        <td>${this.escapeHtml(date.toLocaleString())}</td>
        <td><span class="${isIncome ? 'income-badge' : 'outgoing-badge'}">${this.escapeHtml(tx.jenis)}</span></td>
        <td>${this.escapeHtml(tx.kategori)}</td>
        <td>${this.escapeHtml(tx.deskripsi)}</td>
        <td style="color:${isIncome ? 'var(--success)' : 'var(--danger)'};font-weight:500">
          ${isIncome ? '+' : '-'} ${this.formatCurrency(Math.abs(tx.jumlah))}
        </td>
        <td>${this.escapeHtml(tx.metode)}</td>
        <td>${this.escapeHtml(tx.keterangan || '-')}</td>
        <td>${this.escapeHtml(tx.staff)}</td>
        <td class="actions-cell">
          ${canEdit ? `<button class="btn small btn-edit"  data-id="${tx.id}"><i class="fas fa-edit"></i></button>` : ''}
          ${canDel  ? `<button class="btn small danger btn-hapus" data-id="${tx.id}"><i class="fas fa-trash"></i></button>` : ''}
        </td>
      `;
      this.elements.transaksiTable.appendChild(row);
    });
  }

  _renderCards(transactions) {
    const container = document.getElementById('transaksi-cards');
    container.innerHTML = '';
    if (transactions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-card';
      empty.textContent = t('noTransactionsTable');
      container.appendChild(empty);
      return;
    }
    const canEdit = Auth.can(PERMISSIONS.EDIT_TRANSACTION);
    const canDel  = Auth.can(PERMISSIONS.DELETE_TRANSACTION);
    transactions.forEach(tx => {
      const isIncome = tx.jenis === 'INCOME';
      const card = document.createElement('div');
      card.className = `tx-card ${isIncome ? 'income' : 'outgoing'}`;
      card.innerHTML = `
        <div class="tx-card-header">
          <span class="tx-card-date">${this.escapeHtml(new Date(tx.tanggalWaktu).toLocaleString())}</span>
          <span class="${isIncome ? 'income-badge' : 'outgoing-badge'}">${this.escapeHtml(tx.jenis)}</span>
        </div>
        <div class="tx-card-meta">${this.escapeHtml(tx.kategori)} &middot; ${this.escapeHtml(tx.metode)}</div>
        <div class="tx-card-desc">${this.escapeHtml(tx.deskripsi)}</div>
        <div class="tx-card-amount ${isIncome ? 'pos' : 'neg'}">${isIncome ? '+' : '-'} ${this.formatCurrency(Math.abs(tx.jumlah))}</div>
        ${tx.keterangan ? `<div class="tx-card-note"><i class="fas fa-sticky-note"></i> ${this.escapeHtml(tx.keterangan)}</div>` : ''}
        <div class="tx-card-staff"><i class="fas fa-user"></i> ${this.escapeHtml(tx.staff)}</div>
        ${(canEdit || canDel) ? `
        <div class="tx-card-actions">
          ${canEdit ? `<button class="btn btn-edit"  data-id="${tx.id}"><i class="fas fa-edit"></i> Edit</button>` : ''}
          ${canDel  ? `<button class="btn danger btn-hapus" data-id="${tx.id}"><i class="fas fa-trash"></i> Delete</button>` : ''}
        </div>` : ''}
      `;
      container.appendChild(card);
    });
  }

  // Populate form fields from existing transaction (edit) or reset (new)
  populateForm(transaksi = null) {
    const isEdit = transaksi !== null;

    document.getElementById('modal-title').textContent = isEdit
      ? t('editTransactionTitle') : t('newTransactionTitle');

    this.setActiveType(isEdit && transaksi.jenis === 'OUTGOING' ? 'outgoing' : 'income');

    // Populate category dropdown — exclude system categories (e.g. START BALANCE
    // is only inserted automatically at shift start, never picked manually)
    this.elements.fKategori.innerHTML = '';
    this.categories
      .filter(cat => !SYSTEM_CATEGORIES.includes(cat))
      .forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat;
        if (isEdit && transaksi.kategori === cat) opt.selected = true;
        this.elements.fKategori.appendChild(opt);
      });
    const otherOpt = document.createElement('option');
    otherOpt.value = '_other'; otherOpt.textContent = t('other');
    this.elements.fKategori.appendChild(otherOpt);

    // Populate staff dropdown — default to current user, lock for cashier
    this.elements.fStaff.innerHTML = '';
    const cur = Auth.currentUser();
    this.staffList.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      const preferStaff = isEdit ? transaksi.staff : (cur ? cur.username : null);
      if (preferStaff === s) opt.selected = true;
      this.elements.fStaff.appendChild(opt);
    });
    this.elements.fStaff.disabled = !!cur && cur.role === 'cashier';

    this.elements.fMetode.value     = isEdit ? transaksi.metode     : 'Cash';
    this.elements.fDeskripsi.value  = isEdit ? transaksi.deskripsi  : '';
    this.elements.fKeterangan.value = isEdit ? (transaksi.keterangan || '') : '';

    const rawJumlah = isEdit ? Math.abs(transaksi.jumlah) : 0;
    this.elements.fJumlah.dataset.raw     = rawJumlah || '';
    this.elements.fJumlah.value           = rawJumlah ? this.formatNumber(rawJumlah) : '';
    this.elements.fJumlahPrev.textContent = rawJumlah ? this.formatCurrency(rawJumlah) : '';
  }

  // ============================================================
  // UTILITIES
  // ============================================================

  // Escape HTML special characters to prevent XSS
  escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Format number with thousand separators: 1000000 → "1.000.000"
  formatNumber(amount) {
    return new Intl.NumberFormat('id-ID').format(amount);
  }

  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', minimumFractionDigits: 0
    }).format(amount);
  }

  // Single point for saving transactions to storage
  _saveTransactions() {
    return Storage.set('pos_transactions', this.transactions);
  }

  calculateSaldo(metode) {
    return this.transactions
      .filter(tx => tx.metode === metode)
      .reduce((sum, tx) => sum + tx.jumlah, 0);
  }

  updateDownloadButton() {
    this.elements.downloadExcelBtn.disabled = this.transactions.length === 0;
  }

  generateShiftId() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${Date.now()}`;
  }

  // ============================================================
  // APP FUNCTIONS
  // ============================================================

  toggleTheme() {
    const current = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const next    = current === 'light' ? 'dark' : 'light';
    document.body.classList.replace(`${current}-theme`, `${next}-theme`);
    Storage.set('theme', next);
    this.updateThemeIcon(next);
  }

  updateThemeIcon(theme) {
    this.elements.themeToggleBtn.querySelector('i').className =
      theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
  }

  showForm(transaksiId = null) {
    if (transaksiId) {
      const tx = this.transactions.find(tx => tx.id === transaksiId);
      if (tx) { this.currentEditId = transaksiId; this.populateForm(tx); }
    } else {
      this.currentEditId = null;
      this.populateForm();
    }
    this.elements.formModal.style.display = 'flex';
  }

  hideForm() { this.elements.formModal.style.display = 'none'; }

  showHelp() {
    // Translated help body is HTML — insert via innerHTML (content is hardcoded in lang.js, no user data)
    document.getElementById('help-content').innerHTML = t('helpBody');
    document.getElementById('help-modal').style.display = 'flex';
  }
  hideHelp() { document.getElementById('help-modal').style.display = 'none'; }

  // ============================================================
  // SETTINGS
  // ============================================================

  showSettings() {
    if (!Auth.can(PERMISSIONS.MANAGE_SETTINGS)) {
      this.showAlert(t('noPermission'), 'error'); return;
    }
    document.getElementById('open-users').style.display = Auth.can(PERMISSIONS.MANAGE_USERS) ? '' : 'none';
    this.renderCategoriesList();
    this.elements.settingsBrand.value = this.brandName;
    this.elements.settingsStaff.value = this.staffList.join('\n');   // view-only mirror
    this.elements.settingsModal.style.display = 'flex';
  }

  hideSettings() { this.elements.settingsModal.style.display = 'none'; }

  // Reset only resets brand & categories. Staff/users are NEVER touched here
  // — that would orphan all auth + lose all logins. Use Manage Users for users.
  resetSettings() {
    this.brandName  = DEFAULT_BRAND;
    this.categories = [...DEFAULT_CATEGORIES];
    Storage.set('pos_brand',      this.brandName);
    Storage.set('pos_categories', this.categories);
    this.renderBrandName();
    this.renderCategoriesList();
    this.hideSettings();
    this.showAlert(t('alertSettingsReset'), 'info');
  }

  saveSettings() {
    const brand = this.elements.settingsBrand.value.trim();
    // categories already mutated in-place by card UI; staff is read-only (sourced from Users)
    if (this.categories.length === 0) {
      this.showAlert(t('alertCategoryEmpty'), 'error'); return;
    }
    // Defensive: ensure system categories present
    SYSTEM_CATEGORIES.forEach(c => { if (!this.categories.includes(c)) this.categories.unshift(c); });
    this.brandName = brand || DEFAULT_BRAND;
    Storage.set('pos_brand',      this.brandName);
    Storage.set('pos_categories', this.categories);
    this.renderBrandName();
    this.hideSettings();
    this.showAlert(t('alertSettingsSaved'), 'success');
  }

  setActiveType(type) {
    document.querySelectorAll('.type-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.type-btn.${type}`).classList.add('active');
  }

  // ============================================================
  // TRANSACTION CRUD
  // ============================================================

  simpanTransaksi() {
    const jenis = document.querySelector('.type-btn.income.active')   ? 'INCOME'
                : document.querySelector('.type-btn.outgoing.active') ? 'OUTGOING' : null;

    if (!jenis) { this.showAlert(t('alertSelectType'), 'error'); return; }

    const kategori   = this.elements.fKategori.value;
    const deskripsi  = this.elements.fDeskripsi.value.trim();
    let jumlah       = parseFloat(this.elements.fJumlah.dataset.raw || this.elements.fJumlah.value.replace(/\D/g, ''));
    const metode     = this.elements.fMetode.value;
    const keterangan = this.elements.fKeterangan.value.trim();
    const staff      = this.elements.fStaff.value;

    if (!deskripsi || isNaN(jumlah) || jumlah <= 0) {
      this.showAlert(t('alertFillForm'), 'error'); return;
    }

    // Loading state — disable save button, show spinner
    const submitBtn     = this.elements.transaksiForm.querySelector('[type="submit"]');
    const originalHTML  = submitBtn.innerHTML;
    submitBtn.disabled  = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    setTimeout(() => {
      try {
        if (jenis === 'OUTGOING') jumlah = -jumlah;

        const originalDate = this.currentEditId
          ? this.transactions.find(tx => tx.id === this.currentEditId)?.tanggalWaktu
          : null;

        const txData = {
          id:           this.currentEditId || crypto.randomUUID(),
          jenis, kategori, deskripsi, jumlah, metode, keterangan, staff,
          tanggalWaktu: originalDate || new Date().toISOString()
        };

        if (this.currentEditId) {
          const idx = this.transactions.findIndex(tx => tx.id === this.currentEditId);
          if (idx !== -1) this.transactions[idx] = txData;
        } else {
          this.transactions.push(txData);
        }

        const saved = this._saveTransactions();
        if (saved === 'quota') {
          this.showAlert(t('alertStorageFull'), 'error');
          this.currentEditId ? null : this.transactions.pop();
          return;
        }
        this.renderAll();
        this.hideForm();
        this.showAlert(t(this.currentEditId ? 'alertUpdated' : 'alertSaved'), 'success');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHTML;
      }
    }, 150);
  }

  hapusTransaksi(id) {
    if (!Auth.can(PERMISSIONS.DELETE_TRANSACTION)) {
      this.showAlert(t('noPermission'), 'error'); return;
    }
    this.showConfirm(t('confirmDefault'), () => {
      this.transactions = this.transactions.filter(tx => tx.id !== id);
      this._saveTransactions();
      this.renderAll();
      this.showAlert(t('alertDeleted'), 'success');
    });
  }

  exportToExcel() {
    if (this.transactions.length === 0) {
      this.showAlert(t('alertNoTransactions'), 'error'); return;
    }
    this.showConfirm(t('exportExcel') + '?', () => {
      try {
        const ws = XLSX.utils.json_to_sheet(this.buildExcelData());
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
        XLSX.writeFile(wb, `transactions_${new Date().toISOString().split('T')[0]}.xlsx`);
        this.showAlert(t('alertExcelOk'), 'success');
      } catch (e) {
        console.error(e);
        this.showAlert(t('alertExcelFail'), 'error');
      }
    });
  }

  saveToCSV() {
    try {
      if (this.transactions.length === 0) return;
      const csv  = Papa.unparse(this.transactions);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const d    = new Date();
      const ds   = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      link.href     = URL.createObjectURL(blob);
      link.download = `SHIFT_CLOSE_${ds}_${this.generateShiftId()}.csv`;
      link.click();
    } catch (e) {
      console.error(e);
    }
  }

  // ============================================================
  // CLOSE SHIFT — 2 steps: input actual → summary → confirm
  // ============================================================

  confirmTutupShift() {
    if (this.transactions.length === 0) {
      this.showAlert(t('alertNoShift'), 'error'); return;
    }
    // Reset to step 1 — clear all four actual inputs
    const resetField = (input, preview) => {
      input.value         = '';
      input.dataset.raw   = '';
      preview.textContent = '';
    };
    resetField(this.elements.tsActualCash,     this.elements.tsActualCashPreview);
    resetField(this.elements.tsActualCard,     this.elements.tsActualCardPreview);
    resetField(this.elements.tsActualTransfer, this.elements.tsActualTransferPreview);
    resetField(this.elements.tsActualQris,     this.elements.tsActualQrisPreview);
    this.elements.tsStepInput.style.display     = '';
    this.elements.tsStepSummary.style.display   = 'none';
    this.elements.tutupShiftModal.style.display = 'flex';
  }

  showTutupShiftSummary() {
    const actualCash     = parseFloat(this.elements.tsActualCash.dataset.raw     || '0') || 0;
    const actualCard     = parseFloat(this.elements.tsActualCard.dataset.raw     || '0') || 0;
    const actualTransfer = parseFloat(this.elements.tsActualTransfer.dataset.raw || '0') || 0;
    const actualQris     = parseFloat(this.elements.tsActualQris.dataset.raw     || '0') || 0;

    const expectedCash     = this.calculateSaldo('Cash');
    const expectedCard     = this.calculateSaldo('Card');
    const expectedTransfer = this.calculateSaldo('Transfer');
    const expectedQris     = this.calculateSaldo('Qris');

    const selisihCash     = actualCash     - expectedCash;
    const selisihCard     = actualCard     - expectedCard;
    const selisihTransfer = actualTransfer - expectedTransfer;
    const selisihQris     = actualQris     - expectedQris;

    const fmtSelisih = (val) => {
      if (val === 0) return `<span class="ts-diff-exact">${t('exact')}</span>`;
      const sign  = val > 0 ? '+' : '';
      const cls   = val > 0 ? 'ts-diff-over' : 'ts-diff-short';
      const label = val > 0 ? t('over') : t('short');
      // Two lines: amount on top, label below — keeps Difference column narrow.
      return `<span class="${cls}"><span class="diff-amt">${sign}${this.formatCurrency(val)}</span><span class="diff-label">${label}</span></span>`;
    };

    const hasSelisih = selisihCash !== 0 || selisihCard !== 0 ||
                       selisihTransfer !== 0 || selisihQris !== 0;

    this._pendingActual = { actualCash, actualCard, actualTransfer, actualQris, hasSelisih };

    const row = (icon, label, expected, actual, selisih) => `
      <tr>
        <td><i class="fas ${icon}"></i> ${label}</td>
        <td>${this.formatCurrency(expected)}</td>
        <td class="actual-cell">${this.formatCurrency(actual)}</td>
        <td>${fmtSelisih(selisih)}</td>
      </tr>`;

    const noteHintClass = hasSelisih ? 'note-hint required' : 'note-hint';
    const noteHintText  = hasSelisih ? t('closingNoteRequired') : t('closingNoteOptional');

    this.elements.tsSummaryContent.innerHTML = `
      <div class="shift-summary">
        <h4>${t('shiftSummary')}</h4>
        <div class="ts-table-wrap">
          <table class="ts-summary-table">
            <thead>
              <tr>
                <th>${t('method')}</th>
                <th>${t('expected')}</th>
                <th>${t('actual')}</th>
                <th>${t('difference')}</th>
              </tr>
            </thead>
            <tbody>
              ${row('fa-money-bill-wave', 'Cash',     expectedCash,     actualCash,     selisihCash)}
              ${row('fa-credit-card',     'Card',     expectedCard,     actualCard,     selisihCard)}
              ${row('fa-exchange-alt',    'Transfer', expectedTransfer, actualTransfer, selisihTransfer)}
              ${row('fa-qrcode',          'QRIS',     expectedQris,     actualQris,     selisihQris)}
            </tbody>
          </table>
        </div>
        <div class="total-summary">
          <span>${t('totalExpected')}</span>
          <span class="total-amount">${this.formatCurrency(expectedCash + expectedCard + expectedTransfer + expectedQris)}</span>
        </div>
        <div class="form-group ts-note-group">
          <label for="ts-closing-note">${t('closingNote')}${hasSelisih ? ' <span class="req-marker">*</span>' : ''}</label>
          <textarea id="ts-closing-note" rows="2" maxlength="500"></textarea>
          <small class="${noteHintClass}">${noteHintText}</small>
        </div>
        <p class="summary-info">${t('balanceReset')}</p>
      </div>
    `;

    this.elements.tsStepInput.style.display   = 'none';
    this.elements.tsStepSummary.style.display = '';
  }

  eksekusiTutupShift() {
    const { actualCash, actualCard, actualTransfer, actualQris, hasSelisih } =
      this._pendingActual || { actualCash: 0, actualCard: 0, actualTransfer: 0, actualQris: 0, hasSelisih: false };

    // Note is mandatory when there's a difference — staff must explain why.
    const noteEl = document.getElementById('ts-closing-note');
    const note   = (noteEl?.value || '').trim();
    if (hasSelisih && !note) {
      this.showAlert(t('alertNoteRequired'), 'error');
      noteEl?.focus();
      return;
    }

    const expectedCash     = this.calculateSaldo('Cash');
    const expectedCard     = this.calculateSaldo('Card');
    const expectedTransfer = this.calculateSaldo('Transfer');
    const expectedQris     = this.calculateSaldo('Qris');

    this._actualForHistory = {
      actualCash, actualCard, actualTransfer, actualQris,
      selisihCash:     actualCash     - expectedCash,
      selisihCard:     actualCard     - expectedCard,
      selisihTransfer: actualTransfer - expectedTransfer,
      selisihQris:     actualQris     - expectedQris,
      closingNote:     note,
    };

    this.saveShiftHistory();
    this.saveToCSV();
    this.transactions      = [];
    this.shiftActive       = false;
    this._pendingActual    = null;
    this._actualForHistory = null;
    Storage.remove('pos_transactions');
    Storage.remove('pos_shift_active');
    this.elements.tutupShiftModal.style.display = 'none';
    this.renderAll();
    this.updateShiftUI();
    this.showMulaiShiftModal();
    this.showAlert(t('alertShiftClosed'), 'success');
  }

  // ============================================================
  // SHIFT HISTORY — snapshot saved before clearing transactions
  // Max 50 shifts — oldest is auto-removed
  // ============================================================

  saveShiftHistory() {
    const MAX_HISTORY = 50;
    const staff    = [...new Set(this.transactions.map(tx => tx.staff))];
    const cash     = this.calculateSaldo('Cash');
    const card     = this.calculateSaldo('Card');
    const transfer = this.calculateSaldo('Transfer');
    const qris     = this.calculateSaldo('Qris');

    const shiftRecord = {
      id:       `shift_${Date.now()}`,
      closedAt: new Date().toISOString(),
      staff,
      summary: {
        cash, card, transfer, qris,
        total:            cash + card + transfer + qris,
        totalIncome:      this.transactions.filter(tx => tx.jenis === 'INCOME').reduce((s, tx) => s + tx.jumlah, 0),
        totalOutgoing:    this.transactions.filter(tx => tx.jenis === 'OUTGOING').reduce((s, tx) => s + tx.jumlah, 0),
        jumlahTransaksi:  this.transactions.length,
        actualCash:      this._actualForHistory?.actualCash      ?? null,
        actualCard:      this._actualForHistory?.actualCard      ?? null,
        actualTransfer:  this._actualForHistory?.actualTransfer  ?? null,
        actualQris:      this._actualForHistory?.actualQris      ?? null,
        selisihCash:     this._actualForHistory?.selisihCash     ?? null,
        selisihCard:     this._actualForHistory?.selisihCard     ?? null,
        selisihTransfer: this._actualForHistory?.selisihTransfer ?? null,
        selisihQris:     this._actualForHistory?.selisihQris     ?? null,
        closingNote:     this._actualForHistory?.closingNote     ?? '',
      },
      transactions: this.transactions.map(tx => ({ ...tx }))
    };

    const existing = Storage.get('pos_shift_history', []);
    const updated  = [shiftRecord, ...existing].slice(0, MAX_HISTORY);
    Storage.set('pos_shift_history', updated);
    return shiftRecord;
  }

  // ============================================================
  // MODALS
  // ============================================================

  showConfirm(message, callback, isHtml = false) {
    const el = document.getElementById('confirm-message');
    isHtml ? (el.innerHTML = message) : (el.textContent = message);
    this.elements.confirmModal.style.display = 'flex';
    this.confirmAction = callback;
  }

  hideConfirm() {
    this.elements.confirmModal.style.display = 'none';
    this.confirmAction = null;
  }

  executeConfirm() {
    if (this.confirmAction) this.confirmAction();
    this.hideConfirm();
  }

  showAlert(message, type = 'info') {
    const div = document.createElement('div');
    div.className = `alert ${type}`;
    const p       = document.createElement('p');
    p.textContent = message;
    const closeBtn       = document.createElement('span');
    closeBtn.className   = 'close-alert';
    closeBtn.textContent = '×';
    div.appendChild(p);
    div.appendChild(closeBtn);
    this.elements.alertContainer.appendChild(div);
    setTimeout(() => div.classList.add('show'), 10);
    const hide = () => { div.classList.remove('show'); setTimeout(() => div.remove(), 300); };
    setTimeout(hide, 5000);
    closeBtn.addEventListener('click', hide);
  }
}

const app = new ChillPOS();
