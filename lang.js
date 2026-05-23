// ============================================================
// ONE-TIME MIGRATION — rename localStorage keys hostel_* → pos_*
// Runs once per browser. Guarded by `pos_migrated_v1` marker.
// Must run BEFORE LangManager reads pos_lang.
// ============================================================
(function migrateHostelKeysToPos() {
  try {
    if (localStorage.getItem('pos_migrated_v1')) return;
    const MAP = {
      hostel_transactions:  'pos_transactions',
      hostel_shift_history: 'pos_shift_history',
      hostel_shift_active:  'pos_shift_active',
      hostel_categories:    'pos_categories',
      hostel_staff:         'pos_staff',
      hostel_brand:         'pos_brand',
      hostel_lang:          'pos_lang',
    };
    let migrated = 0;
    for (const [oldKey, newKey] of Object.entries(MAP)) {
      const val = localStorage.getItem(oldKey);
      if (val !== null && localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, val);
        localStorage.removeItem(oldKey);
        migrated++;
      }
    }
    localStorage.setItem('pos_migrated_v1', '1');
    if (migrated > 0) console.info(`[Migration] Moved ${migrated} key(s) from hostel_* to pos_*`);
  } catch (e) {
    console.warn('[Migration] Failed:', e);
  }
})();

// ============================================================
// LANG MANAGER — EN/ID translations for all UI strings
// Usage: LangManager.t('key') or shorthand t('key')
// Switch: LangManager.toggle() or LangManager.set('en'|'id')
// ============================================================

const STRINGS = {
  en: {
    historyShift:'Shift History',appTitle:'CHILL POS APP',
    newTransaction:'New Transaction',exportExcel:'Export Excel',
    hideAll:'Hide All',showAll:'Show All',closeShift:'Close Shift',
    cashBalance:'Cash',cardBalance:'Card',transferBalance:'Transfer',qrisBalance:'QRIS',otherBalance:'Other',
    search:'Search',searchPlaceholder:'Description, category, staff...',
    filterType:'Type',filterAll:'All',filterIncome:'Income',filterOutgoing:'Outgoing',
    filterCategory:'Category',filterMethod:'Method',applyFilter:'Apply Filter',resetFilter:'Reset',
    colDateTime:'Date/Time',colType:'Type',colCategory:'Category',
    colDescription:'Description',colAmount:'Amount',colMethod:'Method',
    colNote:'Note',colStaff:'Staff',colAction:'Action',
    newTransactionTitle:'New Transaction',editTransactionTitle:'Edit Transaction',
    transactionType:'Transaction Type',income:'Income',outgoing:'Outgoing',
    category:'Category',other:'Other...',paymentMethod:'Payment Method',
    staff:'Staff',description:'Description',amount:'Amount',
    note:'Note (Optional)',cancel:'Cancel',save:'Save',saving:'Saving...',
    settings:'Settings',brandName:'Brand Name',brandLogo:'Business Logo',brandLogoHint:'Auto-converted to PNG',
    categoriesPerLine:'Categories (one per line)',staffPerLine:'Staff (one per line)',
    resetDefault:'Reset Default',
    startShift:'Start Shift',staffOnDuty:'Staff on Duty',
    initialCashBalance:'Initial Cash Balance',startShiftBtn:'Start Shift',
    cashHint:'Physical cash currently in the till.',
    cashPlaceholder:'e.g. 500.000',
    useLastShiftCash:(amt) => `Use last shift's cash (${amt})`,
    commonAmounts:'Quick fill',
    shiftPinHint:(name) => `Enter PIN for ${name} to start the shift.`,
    shiftPinHintAdmin:(name) => `Enter PIN for ${name}, or your admin PIN to override.`,
    shiftPinNoPin:(name) => `${name} has no PIN set. Ask an admin to set a PIN first.`,
    shiftPinNoPinAdmin:'Target user has no PIN. Enter your admin PIN to start anyway.',
    alertShiftPinRequired:'PIN is required to start the shift.',
    alertShiftPinWrong:'Wrong PIN.',
    alertShiftPinNoPin:'This staff has no PIN set. An admin must set their PIN before they can start a shift.',
    closeShiftTitle:'Close Shift',closeShiftHint:'Verify the actual balance for each payment method.',
    actualCash:'Actual Cash',actualCard:'Actual Card',actualTransfer:'Actual Transfer',actualQris:'Actual QRIS',
    closingNote:'Closing Note',closingNoteOptional:'Optional — add a note if needed.',
    closingNoteRequired:'Required — please explain the difference.',
    alertNoteRequired:'Please provide a note explaining the difference before closing the shift.',
    back:'Back',viewSummary:'View Summary',confirmClose:'Close Shift',
    shiftSummary:'📊 Shift Closing Summary',method:'Method',
    expected:'Expected',actual:'Actual',difference:'Difference',
    exact:'✓ Exact',over:'(over)',short:'(short)',
    totalExpected:'Total Expected:',
    balanceReset:'* Balance will be reset to 0 after shift is closed',
    confirmDefault:'Are you sure?',yes:'Yes',
    confirmResetDefault:'Reset brand and categories to default? Enter your admin PIN to confirm.',resetPinWrong:'Wrong admin PIN. Reset cancelled.',
    historyTitle:'Shift History',selectAll:'Select All',
    deleteSelected:'Delete Selected',noHistory:'No shift history yet.',
    noHistoryHint:'History will appear after the first shift is closed.',
    transactions:'transactions',cashExpected:'Cash (Expected)',
    cardExpected:'Card (Expected)',transferExpected:'Transfer (Expected)',qrisExpected:'QRIS (Expected)',totalSaldo:'Total Expected',
    exportExcelBtn:'Export Excel',exportCsvBtn:'Export CSV',
    noTransactions:'No transactions',
    alertStartShiftFirst:'Please start a shift first!',
    alertShiftStarted:'Shift started! Initial cash:',
    alertShiftClosed:'Shift closed and history saved.',
    alertNoShift:'No transactions to close!',
    alertNoTransactions:'No transactions to export!',
    alertSelectType:'Please select a transaction type!',
    alertFillForm:'Description and Amount are required!',
    alertStorageFull:'⚠️ Storage full! Close shift to free up space.',
    alertSaved:'Transaction saved!',alertUpdated:'Transaction updated!',
    alertDeleted:'Transaction deleted!',alertExcelOk:'Excel export successful!',
    alertExcelFail:'Excel export failed!',alertSettingsSaved:'Settings saved.',alertInvalidImage:'Invalid image file.',
    alertSettingsReset:'Settings reset to default.',
    alertCategoryEmpty:'Categories and staff cannot be empty!',
    alertDeleteShift:(n) => `Delete ${n} selected shift(s)? This cannot be undone.`,
    alertShiftsDeleted:'Selected shifts deleted.',
    confirmDeleteShiftSingle:(date) => `Delete this shift (closed ${date})? This cannot be undone.`,
    deleteShift:'Delete Shift',
    noTransactionsTable:'No transactions',
    noResults:(q) => `No results for "${q}"`,
    kembali:'Back',
    welcomeTitle:"Welcome! Let's set up your POS",
    welcomeHint:'Customize the basics now — you can change them anytime in Settings.',
    finishSetup:'Finish Setup',
    // Auth
    loginTitle:'Sign In',signIn:'Sign In',selectUser:'Select User',enterPin:'Enter PIN',
    forgotPin:'Forgot PIN?',
    resetPinTitle:'Reset PIN',
    resetPinHint:'Enter the access code to reset PIN for any user. The access code is shared with the business owner.',
    accessCode:'Access Code',newPin:'New PIN (4-6 digits)',
    resetPinBtn:'Reset PIN',
    wrongAccessCode:'Wrong access code.',
    alertPinReset:'PIN reset successfully. Please sign in.',
    adminUser:'Admin User (from staff list above)',adminPin:'Admin PIN (4-6 digits)',
    confirmPin:'Confirm PIN',pinMismatch:'PIN does not match',pinTooShort:'PIN must be 4-6 digits',
    usersTitle:'Manage Users',addUser:'Add User',userExists:'Username already exists',
    cannotDeleteLastAdmin:'Cannot delete the last admin user',
    cannotDemoteLastAdmin:'Cannot change role — at least one admin is required',
    roleAdmin:'Admin',roleCashier:'Cashier',pinSet:'PIN set',pinNone:'No PIN',
    setPin:'Set PIN',resetPin:'Reset PIN',removePin:'Remove PIN',
    logout:'Sign Out',loggedInAs:'Signed in as',noPermission:'You do not have permission for this action',
    wrongPin:'Wrong PIN',userNotFound:'User not found',
    setupAdminTitle:'Set Up Admin Account',
    setupAdminHint:'Existing data found. Please choose an admin user and set a PIN to continue.',
    username:'Username',role:'Role',pin:'PIN',
    confirmDeleteUser:(n) => `Delete user "${n}"? This cannot be undone.`,
    userDeleted:'User deleted',userCreated:'User created',userUpdated:'User updated',
    // Settings UI polish
    staffViewOnly:'Staff (managed via Manage Users — view only)',
    dateRange:'Date',dateAll:'All',dateToday:'Today',dateWeek:'This Week',dateMonth:'This Month',dateCustom:'Custom...',
    chartTitle:'Income vs Outgoing',chartIncome:'Income',chartOutgoing:'Outgoing',chartNoData:'No transactions yet',
    noResultsRange:'No shifts in this date range',
    helpTitle:'Quick Start Guide',
    helpReadFirst:'Read Quick Start Guide first',
    helpBody:`
<h3><i class="fas fa-rocket"></i> First-time setup</h3>
<ol>
  <li>When you first open the app, the <b>Welcome wizard</b> appears.</li>
  <li>Fill in your <b>brand name</b>, <b>categories</b> (one per line), and <b>staff names</b> (one per line).</li>
  <li>Pick which staff is the <b>Admin</b> and set a <b>4-6 digit PIN</b>.</li>
  <li>Click <b>Finish Setup</b>. You'll be auto-logged in as Admin and the Start Shift screen appears.</li>
</ol>

<h3><i class="fas fa-user-lock"></i> Login &amp; roles</h3>
<ul>
  <li><b>Admin</b> can manage settings, users, edit/delete transactions, delete shift history.</li>
  <li><b>Cashier</b> can only create transactions, close shift, and export. No settings, no edit/delete.</li>
  <li>Cashiers without a PIN can log in by just selecting their name. Admin can set PINs later via <b>Manage Users</b>.</li>
  <li>Switch user via the user button in the header (top right) → Sign Out.</li>
</ul>

<h3><i class="fas fa-play-circle"></i> Daily flow</h3>
<ol>
  <li><b>Start Shift:</b> enter the actual cash you start with. Saved as a START BALANCE transaction.</li>
  <li><b>Add transactions</b> as they happen. Pick Income or Outgoing, fill amount + category + payment method.</li>
  <li><b>Close Shift</b> at the end: enter actual cash &amp; card → see expected vs actual → confirm.</li>
  <li>Shift is auto-saved to <b>history</b> (max 50 shifts kept). CSV is auto-downloaded.</li>
</ol>

<h3><i class="fas fa-users-cog"></i> Managing users</h3>
<ul>
  <li>Open <b>Settings</b> (gear icon) → <b>Manage Users</b>.</li>
  <li>Add new user: username + role + optional PIN. Without PIN they log in by name only.</li>
  <li>Pen icon = rename. Key icon = set/reset PIN. Trash = delete.</li>
  <li>You can't delete or demote the last admin. You can't delete yourself.</li>
</ul>

<h3><i class="fas fa-tags"></i> Managing categories</h3>
<ul>
  <li>Open <b>Settings</b> → categories shown as a card list.</li>
  <li>Drag the handle on the left to reorder. Click pen to rename, X to delete.</li>
  <li><b>START BALANCE</b> is locked — required by the shift logic, can't be deleted.</li>
</ul>

<h3><i class="fas fa-shield-alt"></i> Important notes</h3>
<ul>
  <li>All data is stored on this device (in browser). No cloud sync.</li>
  <li><b>Don't clear browser data</b> for this site — you'll lose all transactions and users.</li>
  <li><b>Forgot PIN?</b> Click "Forgot PIN?" on the login screen → select the user → enter the <b>access code</b> (the one set when first opening the app) → set new PIN. Works for any user including admin.</li>
  <li>If both the PIN and the access code are forgotten, the only recovery is clearing browser data and re-running the wizard (you'll lose data). Keep the access code somewhere safe.</li>
  <li>Open <code>history.html</code> to see closed shifts and re-export their data.</li>
</ul>
`,
    addCategory:'Add Category',
    addCategoryPrompt:'Enter new category name:',
    renameCategoryPrompt:'Rename category:',
    categoryExists:'Category already exists',
    systemBadge:'system',
    renameUserPrompt:'New username:',
    // ── Mode choice (Local Basic vs Cloud Premium) ──
    modeChoiceTitle:'Choose Mode',
    modeChoiceHint:'Pick where your data should live. You can upgrade Local → Cloud later.',
    modeLocal:'Local Mode',
    modeLocalDesc:'Data stays in this browser only. No setup needed.',
    modeCloud:'Cloud Mode',
    modeCloudDesc:'Multi-device realtime sync. Needs a Supabase project.',
    localModeBanner:'Local mode — data only in this browser. Export Excel regularly for backup.',
    offlineBanner:'Offline — connection lost. New transactions will be saved here and synced when you reconnect.',
    offlineQueued:'Offline — {n} transaction(s) waiting to sync.',
    syncingQueued:'Syncing {n} transaction(s)…',
    upgradeToCloud:'Upgrade to Cloud (Premium)',
    upgradeToCloudTitle:'Upgrade to Cloud',
    upgradeToCloudHint:'Migrates all your local data to a Supabase project. The target project must be empty (just-created).',
    upgradeStart:'Start Migration',
    upgradeChecking:'Checking cloud project...',
    upgradeMigrating:'Migrating data... do not close this tab.',
    upgradeDone:'Migration complete! Reloading...',
    upgradeFailed:'Migration failed',
    upgradeCloudNotEmpty:'The target Supabase project is not empty. Use a freshly-created project to avoid overwriting data.',
    // ── Admin approval categories ──
    adminApprovalRequired:'Admin approval required',
    adminApprovalHint:'This category requires an admin to approve. Pick an admin and enter their PIN.',
    adminCategoriesLabel:'Categories that require admin approval',
    adminCategoriesHint:'Cashier must enter an admin PIN to record transactions in checked categories.',
    wrongAdminPin:'Wrong admin PIN. Transaction not saved.',
    // ── Non-revenue categories ──
    nonRevenueCategoriesLabel:'Non-Revenue Categories',
    nonRevenueCategoriesHint:'Checked categories are excluded from revenue totals. Use for cash transfers, employee loans, or opening balance.',
    revenueBreakdown:'Revenue Breakdown',
    shiftRevenue:'Revenue',
    shiftOperatingExpense:'Operating Expense',
    shiftNetRevenue:'Net Revenue',
    shiftNonRevenue:'Non-Revenue (Cash Movements)',
    // ── Supabase / cloud sync ──
    sbSetupTitle:'Connect to Cloud',
    sbSetupHint:'Paste your Supabase Project URL and Publishable Key. Same URL + key on every device = shared data.',
    sbSetupConnect:'Connect',
    noSupabaseUseBasic:'No Supabase yet? Use Basic Mode →',
    supabaseSection:'Cloud Backend (Supabase)',
    supabaseHint:'Get these from your Supabase project: Settings → Data API (URL) and API Keys (Publishable key).',
    supabaseUrl:'Supabase Project URL',
    supabaseKey:'Publishable Key',
    invalidSupabaseUrl:'Invalid Supabase URL. Expected format: https://xxxx.supabase.co',
    invalidSupabaseKey:'Invalid publishable key. Expected to start with "sb_publishable_" or "eyJ".',
    sbErrorTitle:'Cloud Connection Error',
    sbErrorHint:'Could not connect to Supabase. Check your internet, or reconfigure with a new URL + key.',
    sbErrorRetry:'Retry',
    sbErrorReset:'Reset & Reconfigure',
    confirmResetSupabase:'Reset Supabase config and reload? You will be asked to enter the URL + key again.',
    remoteLogout:'Signed out from another device.',
  },
  id: {
    historyShift:'Histori Shift',appTitle:'CHILL POS APP',
    newTransaction:'Transaksi Baru',exportExcel:'Export Excel',
    hideAll:'Sembunyikan',showAll:'Tampilkan',closeShift:'Tutup Shift',
    cashBalance:'Cash',cardBalance:'Card',transferBalance:'Transfer',qrisBalance:'QRIS',otherBalance:'Lainnya',
    search:'Cari',searchPlaceholder:'Deskripsi, kategori, staff...',
    filterType:'Jenis',filterAll:'Semua',filterIncome:'Pemasukan',filterOutgoing:'Pengeluaran',
    filterCategory:'Kategori',filterMethod:'Metode',applyFilter:'Terapkan Filter',resetFilter:'Reset',
    colDateTime:'Tanggal/Waktu',colType:'Jenis',colCategory:'Kategori',
    colDescription:'Deskripsi',colAmount:'Jumlah',colMethod:'Metode',
    colNote:'Keterangan',colStaff:'Staff',colAction:'Aksi',
    newTransactionTitle:'Transaksi Baru',editTransactionTitle:'Edit Transaksi',
    transactionType:'Jenis Transaksi',income:'Pemasukan',outgoing:'Pengeluaran',
    category:'Kategori',other:'Lainnya...',paymentMethod:'Metode Pembayaran',
    staff:'Staff',description:'Deskripsi',amount:'Jumlah',
    note:'Keterangan (Opsional)',cancel:'Batal',save:'Simpan',saving:'Menyimpan...',
    settings:'Pengaturan',brandName:'Nama Brand',brandLogo:'Logo Usaha',brandLogoHint:'Otomatis diubah ke PNG',
    categoriesPerLine:'Kategori (satu per baris)',staffPerLine:'Staff (satu per baris)',
    resetDefault:'Reset Default',
    startShift:'Mulai Shift',staffOnDuty:'Staff Bertugas',
    initialCashBalance:'Saldo Cash Awal',startShiftBtn:'Mulai Shift',
    cashHint:'Jumlah uang fisik di laci saat ini.',
    cashPlaceholder:'Misal: 500.000',
    useLastShiftCash:(amt) => `Gunakan saldo akhir shift lalu (${amt})`,
    commonAmounts:'Pilih cepat',
    shiftPinHint:(name) => `Masukkan PIN ${name} untuk memulai shift.`,
    shiftPinHintAdmin:(name) => `Masukkan PIN ${name}, atau PIN admin Anda untuk override.`,
    shiftPinNoPin:(name) => `${name} belum punya PIN. Minta admin untuk set PIN terlebih dahulu.`,
    shiftPinNoPinAdmin:'User target belum punya PIN. Masukkan PIN admin Anda untuk tetap memulai.',
    alertShiftPinRequired:'PIN wajib diisi untuk memulai shift.',
    alertShiftPinWrong:'PIN salah.',
    alertShiftPinNoPin:'Staff ini belum punya PIN. Admin harus set PIN dulu sebelum bisa mulai shift.',
    closeShiftTitle:'Tutup Shift',closeShiftHint:'Verifikasi saldo aktual untuk setiap metode pembayaran.',
    actualCash:'Aktual Cash',actualCard:'Aktual Card',actualTransfer:'Aktual Transfer',actualQris:'Aktual QRIS',
    closingNote:'Catatan Penutupan',closingNoteOptional:'Opsional — tambahkan catatan jika diperlukan.',
    closingNoteRequired:'Wajib — mohon jelaskan alasan selisih.',
    alertNoteRequired:'Mohon berikan catatan alasan selisih sebelum menutup shift.',
    back:'Kembali',viewSummary:'Lihat Summary',confirmClose:'Tutup Shift',
    shiftSummary:'📊 Summary Penutupan Shift',method:'Metode',
    expected:'Expected',actual:'Aktual',difference:'Selisih',
    exact:'✓ Pas',over:'(lebih)',short:'(kurang)',
    totalExpected:'Total Expected:',
    balanceReset:'* Saldo akan direset ke 0 setelah shift ditutup',
    confirmDefault:'Apakah Anda yakin?',yes:'Ya',
    confirmResetDefault:'Reset brand & kategori ke default? Masukkan PIN admin Anda untuk konfirmasi.',resetPinWrong:'PIN admin salah. Reset dibatalkan.',
    historyTitle:'Histori Shift',selectAll:'Pilih Semua',
    deleteSelected:'Hapus Terpilih',noHistory:'Belum ada histori shift.',
    noHistoryHint:'Histori akan muncul setelah shift pertama ditutup.',
    transactions:'transaksi',cashExpected:'Cash (Expected)',
    cardExpected:'Card (Expected)',transferExpected:'Transfer (Expected)',qrisExpected:'QRIS (Expected)',totalSaldo:'Total Expected',
    exportExcelBtn:'Export Excel',exportCsvBtn:'Export CSV',
    noTransactions:'Tidak ada transaksi',
    alertStartShiftFirst:'Mulai shift terlebih dahulu!',
    alertShiftStarted:'Shift dimulai! Saldo cash awal:',
    alertShiftClosed:'Shift ditutup dan histori disimpan.',
    alertNoShift:'Tidak ada transaksi untuk ditutup!',
    alertNoTransactions:'Tidak ada transaksi untuk diekspor!',
    alertSelectType:'Pilih jenis transaksi!',
    alertFillForm:'Deskripsi dan Jumlah harus diisi!',
    alertStorageFull:'⚠️ Penyimpanan penuh! Tutup shift untuk mengosongkan.',
    alertSaved:'Transaksi berhasil disimpan!',alertUpdated:'Transaksi berhasil diperbarui!',
    alertDeleted:'Transaksi berhasil dihapus!',alertExcelOk:'Export Excel berhasil!',
    alertExcelFail:'Gagal export Excel!',alertSettingsSaved:'Pengaturan berhasil disimpan.',alertInvalidImage:'File gambar tidak valid.',
    alertSettingsReset:'Pengaturan direset ke default.',
    alertCategoryEmpty:'Kategori dan staff tidak boleh kosong!',
    alertDeleteShift:(n) => `Hapus ${n} shift terpilih? Tindakan ini tidak bisa dibatalkan.`,
    alertShiftsDeleted:'Shift terpilih berhasil dihapus.',
    confirmDeleteShiftSingle:(date) => `Hapus shift ini (ditutup ${date})? Tindakan ini tidak bisa dibatalkan.`,
    deleteShift:'Hapus Shift',
    noTransactionsTable:'Tidak ada transaksi',
    noResults:(q) => `Tidak ada hasil untuk "${q}"`,
    kembali:'Kembali',
    welcomeTitle:'Selamat Datang! Atur POS Anda',
    welcomeHint:'Sesuaikan dasar-dasarnya sekarang — bisa diubah kapan saja di Pengaturan.',
    finishSetup:'Selesai',
    // Auth
    loginTitle:'Masuk',signIn:'Masuk',selectUser:'Pilih Pengguna',enterPin:'Masukkan PIN',
    forgotPin:'Lupa PIN?',
    resetPinTitle:'Reset PIN',
    resetPinHint:'Masukkan kode akses untuk reset PIN user. Kode akses dipegang oleh pemilik usaha.',
    accessCode:'Kode Akses',newPin:'PIN Baru (4-6 digit)',
    resetPinBtn:'Reset PIN',
    wrongAccessCode:'Kode akses salah.',
    alertPinReset:'PIN berhasil direset. Silakan login.',
    adminUser:'Pengguna Admin (dari daftar staff di atas)',adminPin:'PIN Admin (4-6 digit)',
    confirmPin:'Konfirmasi PIN',pinMismatch:'PIN tidak cocok',pinTooShort:'PIN harus 4-6 digit',
    usersTitle:'Kelola Pengguna',addUser:'Tambah Pengguna',userExists:'Nama pengguna sudah ada',
    cannotDeleteLastAdmin:'Tidak bisa menghapus admin terakhir',
    cannotDemoteLastAdmin:'Tidak bisa mengubah role — minimal harus ada 1 admin',
    roleAdmin:'Admin',roleCashier:'Kasir',pinSet:'PIN aktif',pinNone:'Tanpa PIN',
    setPin:'Set PIN',resetPin:'Reset PIN',removePin:'Hapus PIN',
    logout:'Keluar',loggedInAs:'Masuk sebagai',noPermission:'Anda tidak memiliki izin untuk tindakan ini',
    wrongPin:'PIN salah',userNotFound:'Pengguna tidak ditemukan',
    setupAdminTitle:'Setup Akun Admin',
    setupAdminHint:'Data yang ada terdeteksi. Pilih admin dan set PIN untuk melanjutkan.',
    username:'Nama Pengguna',role:'Role',pin:'PIN',
    confirmDeleteUser:(n) => `Hapus pengguna "${n}"? Tindakan ini tidak bisa dibatalkan.`,
    userDeleted:'Pengguna dihapus',userCreated:'Pengguna ditambahkan',userUpdated:'Pengguna diperbarui',
    // Settings UI polish
    staffViewOnly:'Staff (dikelola via Manage Users — tampilan saja)',
    dateRange:'Tanggal',dateAll:'Semua',dateToday:'Hari Ini',dateWeek:'Minggu Ini',dateMonth:'Bulan Ini',dateCustom:'Custom...',
    chartTitle:'Pemasukan vs Pengeluaran',chartIncome:'Pemasukan',chartOutgoing:'Pengeluaran',chartNoData:'Belum ada transaksi',
    noResultsRange:'Tidak ada shift di rentang tanggal ini',
    helpTitle:'Panduan Singkat',
    helpReadFirst:'Lihat Panduan Singkat dulu',
    helpBody:`
<h3><i class="fas fa-rocket"></i> Setup pertama kali</h3>
<ol>
  <li>Saat pertama buka app, <b>Welcome wizard</b> akan muncul.</li>
  <li>Isi <b>nama brand</b>, <b>kategori</b> (satu per baris), dan <b>nama staff</b> (satu per baris).</li>
  <li>Pilih staff mana yang jadi <b>Admin</b> dan set <b>PIN 4-6 digit</b>.</li>
  <li>Klik <b>Selesai</b>. Anda otomatis login sebagai Admin dan layar Mulai Shift muncul.</li>
</ol>

<h3><i class="fas fa-user-lock"></i> Login &amp; role</h3>
<ul>
  <li><b>Admin</b> bisa kelola pengaturan, users, edit/hapus transaksi, hapus histori shift.</li>
  <li><b>Kasir</b> hanya bisa buat transaksi, tutup shift, dan export. Tidak bisa pengaturan, edit/hapus.</li>
  <li>Kasir tanpa PIN bisa login hanya dengan pilih nama. Admin bisa set PIN nanti via <b>Kelola Pengguna</b>.</li>
  <li>Ganti user lewat tombol user di header (kanan atas) → Keluar.</li>
</ul>

<h3><i class="fas fa-play-circle"></i> Alur harian</h3>
<ol>
  <li><b>Mulai Shift:</b> isi jumlah cash yang ada di laci. Tersimpan sebagai transaksi START BALANCE.</li>
  <li><b>Tambah transaksi</b> tiap kali ada penjualan. Pilih Pemasukan atau Pengeluaran, isi nominal + kategori + metode pembayaran.</li>
  <li><b>Tutup Shift</b> di akhir hari: input cash &amp; card aktual → lihat expected vs aktual → konfirmasi.</li>
  <li>Shift otomatis tersimpan ke <b>histori</b> (max 50 shift). CSV otomatis terdownload.</li>
</ol>

<h3><i class="fas fa-users-cog"></i> Mengelola pengguna</h3>
<ul>
  <li>Buka <b>Pengaturan</b> (ikon gear) → <b>Kelola Pengguna</b>.</li>
  <li>Tambah user: nama + role + PIN opsional. Tanpa PIN, login hanya pilih nama.</li>
  <li>Ikon pena = ganti nama. Ikon kunci = set/reset PIN. Tong sampah = hapus.</li>
  <li>Tidak bisa hapus atau demote admin terakhir. Tidak bisa hapus diri sendiri.</li>
</ul>

<h3><i class="fas fa-tags"></i> Mengelola kategori</h3>
<ul>
  <li>Buka <b>Pengaturan</b> → kategori tampil sebagai card list.</li>
  <li>Drag handle di kiri untuk reorder. Klik pena untuk ganti nama, X untuk hapus.</li>
  <li><b>START BALANCE</b> terkunci — diperlukan logika shift, tidak bisa dihapus.</li>
</ul>

<h3><i class="fas fa-shield-alt"></i> Catatan penting</h3>
<ul>
  <li>Semua data disimpan di device ini (di browser). Tidak ada sync ke cloud.</li>
  <li><b>Jangan clear data browser</b> untuk situs ini — semua transaksi dan user akan hilang.</li>
  <li><b>Lupa PIN?</b> Klik "Lupa PIN?" di layar login → pilih user → masukkan <b>kode akses</b> (yang di-set saat pertama buka app) → atur PIN baru. Berlaku untuk semua user termasuk admin.</li>
  <li>Kalau PIN dan kode akses sama-sama lupa, satu-satunya cara pulih adalah clear data browser dan ulang wizard (data hilang). Simpan kode akses di tempat aman.</li>
  <li>Buka <code>history.html</code> untuk lihat shift yang sudah tertutup dan export ulang datanya.</li>
</ul>
`,
    addCategory:'Tambah Kategori',
    addCategoryPrompt:'Masukkan nama kategori baru:',
    renameCategoryPrompt:'Ubah nama kategori:',
    categoryExists:'Kategori sudah ada',
    systemBadge:'sistem',
    renameUserPrompt:'Nama pengguna baru:',
    // ── Mode choice ──
    modeChoiceTitle:'Pilih Mode',
    modeChoiceHint:'Pilih dimana data disimpan. Bisa upgrade Local → Cloud nanti.',
    modeLocal:'Mode Lokal',
    modeLocalDesc:'Data hanya di browser ini. Tidak perlu setup apa pun.',
    modeCloud:'Mode Cloud',
    modeCloudDesc:'Sync realtime antar device. Perlu Supabase project.',
    localModeBanner:'Mode lokal — data hanya di browser ini. Export Excel rutin untuk backup.',
    offlineBanner:'Offline — koneksi terputus. Transaksi baru disimpan di sini dan akan dikirim saat online kembali.',
    offlineQueued:'Offline — {n} transaksi menunggu sync.',
    syncingQueued:'Mengirim {n} transaksi…',
    upgradeToCloud:'Upgrade ke Cloud (Premium)',
    upgradeToCloudTitle:'Upgrade ke Cloud',
    upgradeToCloudHint:'Migrasikan semua data lokal ke project Supabase. Project tujuan harus kosong (baru dibuat).',
    upgradeStart:'Mulai Migrasi',
    upgradeChecking:'Mengecek project cloud...',
    upgradeMigrating:'Memigrasikan data... jangan tutup tab ini.',
    upgradeDone:'Migrasi selesai! Reloading...',
    upgradeFailed:'Migrasi gagal',
    upgradeCloudNotEmpty:'Project Supabase tujuan tidak kosong. Pakai project baru supaya tidak overwrite data.',
    // ── Admin approval categories ──
    adminApprovalRequired:'Butuh persetujuan admin',
    adminApprovalHint:'Kategori ini butuh approval admin. Pilih admin dan masukkan PIN-nya.',
    adminCategoriesLabel:'Kategori yang butuh persetujuan admin',
    adminCategoriesHint:'Kasir harus masukkan PIN admin untuk catat transaksi di kategori yang dicentang.',
    wrongAdminPin:'PIN admin salah. Transaksi tidak disimpan.',
    // ── Non-revenue categories ──
    nonRevenueCategoriesLabel:'Kategori Non-Revenue',
    nonRevenueCategoriesHint:'Kategori yang dicentang tidak dihitung sebagai revenue. Pakai untuk transfer kas, cashbon karyawan, atau saldo awal.',
    revenueBreakdown:'Rincian Revenue',
    shiftRevenue:'Revenue',
    shiftOperatingExpense:'Pengeluaran Operasional',
    shiftNetRevenue:'Revenue Bersih',
    shiftNonRevenue:'Non-Revenue (Pergerakan Kas)',
    // ── Supabase / cloud sync ──
    sbSetupTitle:'Hubungkan ke Cloud',
    sbSetupHint:'Paste URL Project Supabase dan Publishable Key. URL + key sama di tiap device = data sharing.',
    sbSetupConnect:'Hubungkan',
    noSupabaseUseBasic:'Belum punya Supabase? Pakai Mode Basic →',
    supabaseSection:'Backend Cloud (Supabase)',
    supabaseHint:'Ambil dari project Supabase: Settings → Data API (URL) dan API Keys (Publishable key).',
    supabaseUrl:'URL Project Supabase',
    supabaseKey:'Publishable Key',
    invalidSupabaseUrl:'URL Supabase tidak valid. Format yang benar: https://xxxx.supabase.co',
    invalidSupabaseKey:'Publishable key tidak valid. Harus diawali "sb_publishable_" atau "eyJ".',
    sbErrorTitle:'Gagal Konek ke Cloud',
    sbErrorHint:'Tidak bisa terhubung ke Supabase. Cek koneksi internet, atau reconfigure dengan URL + key baru.',
    sbErrorRetry:'Coba Lagi',
    sbErrorReset:'Reset & Setup Ulang',
    confirmResetSupabase:'Reset konfigurasi Supabase dan reload? Anda akan diminta memasukkan URL + key lagi.',
    remoteLogout:'Logout dari device lain.',
  }
};

// Read directly from localStorage — the Storage service in script.js
// isn't defined yet at this point (script.js loads after lang.js).
function _readLangFromStorage() {
  try {
    const raw = localStorage.getItem('pos_lang');
    if (!raw) return 'en';
    // Migration may have moved a JSON-stringified value ("en") or raw value (en).
    try { return JSON.parse(raw); } catch { return raw; }
  } catch { return 'en'; }
}

const LangManager = {
  current: _readLangFromStorage(),

  t(key, arg) {
    const str = STRINGS[this.current]?.[key] ?? STRINGS['en']?.[key] ?? key;
    return typeof str === 'function' ? str(arg) : str;
  },

  set(lang) {
    if (!STRINGS[lang]) return;
    this.current = lang;
    try { localStorage.setItem('pos_lang', JSON.stringify(lang)); } catch {}
  },

  toggle() {
    this.set(this.current === 'en' ? 'id' : 'en');
  }
};

// Global shorthand — works in both index.html and history.html
const t = (key, arg) => LangManager.t(key, arg);
