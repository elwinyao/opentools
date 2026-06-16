// ==================== common-bundle.js ====================
// 自动合并：app-namespace + config + logger + supabase-config + supabase-client
//          + crypto-utils + login-modal + supabase-auth + cloud-sync + storage + utils
// 生成时间：2026-06-16

// ==== app-namespace.js ====
window.App = {
  STORAGE_KEY: 'baby_tracker_data',
  USER_KEY: 'baby_tracker_user',
  SYNC_QUEUE_KEY: 'baby_tracker_sync_queue',
  currentUser: null,
  allData: {},
  sbClient: null,
  _realtimeChannel: null,
  _realtimeCallbacks: [],
  _realtimePendingChanges: [],
  _realtimeDebounceTimer: null,
  _tokenRefreshTimer: null,
  _xlsxLoaded: false,
  _xlsxLoading: false,
  TYPES: null,
  currentDate: null,
  selectedType: null,
  customTypeText: null,
  currentTab: null,
  summaryYear: null,
  summaryMonth: null,
  syncStatus: null,
  activeFilter: null,
  _initCalled: false
};

// 在脚本同步执行时捕获 lib 基础路径（document.currentScript 此时有效），供后续异步函数使用
(function() {
  var scriptEl = document.currentScript;
  if (scriptEl && scriptEl.src) {
    var m = scriptEl.src.match(/(.*\/)lib\/common-bundle\.js/i);
    if (m) App.__libBase = m[1] + 'lib/';
  }
})();
if (!App.__libBase) App.__libBase = 'lib/';

// ==== config.js ====
App.CONFIG = {
  LOGIN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  SUPABASE_PAGE_SIZE: 1000,
  SYNC_QUEUE_INTERVAL_MS: 30000,
  TIMELINE_UPDATE_INTERVAL_MS: 60000,
  REALTIME_DEBOUNCE_MS: 500,
  TOKEN_REFRESH_INTERVAL_MS: 25 * 60 * 1000
};

// ==== logger.js ====
(function() {
  'use strict';
  var LEVELS = { FATAL: 0, ERROR: 1, WARN: 2, INFO: 3 };
  var LEVEL_LABELS = { 0: 'FATAL', 1: 'ERROR', 2: 'WARN', 3: 'INFO' };
  var MAX_HISTORY = 200;
  if (!App._logHistory) App._logHistory = [];
  function _record(level, message, err) {
    var entry = { level: LEVEL_LABELS[level], message: message, time: new Date().toISOString() };
    if (err) {
      if (err instanceof Error) { entry.errorName = err.name; entry.errorMessage = err.message; entry.errorStack = err.stack ? err.stack.split('\n').slice(0, 4).join('\n') : ''; }
      else { entry.errorDetail = String(err); }
    }
    App._logHistory.push(entry);
    if (App._logHistory.length > MAX_HISTORY) App._logHistory.shift();
  }
  function _formatMsg(level, message) {
    var ts = new Date().toISOString().split('T')[1].slice(0, 8);
    return '[' + ts + '] [' + LEVEL_LABELS[level] + '] ' + message;
  }
  window.Logger = {
    fatal: function(message, err) { _record(LEVELS.FATAL, message, err); console.error(_formatMsg(LEVELS.FATAL, message), err || ''); alert('\u26A0\uFE0F ' + message); },
    error: function(message, err) { _record(LEVELS.ERROR, message, err); console.error(_formatMsg(LEVELS.ERROR, message), err || ''); },
    warn: function(message, err) { _record(LEVELS.WARN, message, err); console.warn(_formatMsg(LEVELS.WARN, message), err || ''); },
    info: function(message, data) { _record(LEVELS.INFO, message, data); console.log(_formatMsg(LEVELS.INFO, message), data !== undefined ? data : ''); },
    getHistory: function(n) { var h = App._logHistory; if (n === undefined) return h.slice(); return h.slice(-n); },
    clearHistory: function() { App._logHistory = []; }
  };
})();

// ==== supabase-config.js ====
App.SUPABASE_URL = 'https://jdlyqpvvfmsesdlicdbp.supabase.co';
App.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__nR2mqJcII6bQ8kuoos69g_cLNg3y6M';

// ==== supabase-client.js ====
var _sbSdkPromise = null;

function loadSupabaseSDK() {
  if (_sbSdkPromise) return _sbSdkPromise;
  if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
    _sbSdkPromise = Promise.resolve();
    return _sbSdkPromise;
  }
  _sbSdkPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    s.src = App.__libBase + 'supabase-js.min.js';
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('Supabase SDK 加载失败')); };
    document.head.appendChild(s);
  });
  return _sbSdkPromise;
}

function initSupabase() {
  if (App.sbClient) return true;
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    Logger.error('Supabase SDK 未加载，请确保引入 CDN');
    return false;
  }
  App.sbClient = supabase.createClient(App.SUPABASE_URL, App.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true },
    realtime: { params: { eventsPerSecond: 10 } },
    global: { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
  });
  return true;
}

function initRealtimeChannel() {
  if (!App.sbClient || !App.currentUser || !App.currentUser.id) return;
  if (App._realtimeChannel) { App.sbClient.removeChannel(App._realtimeChannel); App._realtimeChannel = null; }
  var channel = App.sbClient.channel('baby_records_changes');
  App._realtimeChannel = channel;
  channel.on('postgres_changes',
    { event: '*', schema: 'public', table: 'baby_records', filter: 'user_id=eq.' + App.currentUser.id },
    function(payload) { _handleRealtimePayload(payload); }
  );
  channel.subscribe(function(status) {});
}

function _handleRealtimePayload(payload) {
  var changeEvent = { eventType: payload.eventType, schema: payload.schema, table: payload.table, commit_timestamp: payload.commit_timestamp || '', record: payload.new || payload.old || null, old_record: payload.old || null };
  if (!changeEvent.record) return;
  App._realtimePendingChanges.push(changeEvent);
  if (App._realtimeDebounceTimer) clearTimeout(App._realtimeDebounceTimer);
  App._realtimeDebounceTimer = setTimeout(function() {
    var changes = App._realtimePendingChanges.slice();
    App._realtimePendingChanges = [];
    App._realtimeDebounceTimer = null;
    for (var i = 0; i < App._realtimeCallbacks.length; i++) {
      try { App._realtimeCallbacks[i](changes); } catch(e) {}
    }
  }, App.CONFIG.REALTIME_DEBOUNCE_MS);
}

function subscribeRealtime(callback) {
  if (typeof callback !== 'function') return;
  for (var i = 0; i < App._realtimeCallbacks.length; i++) { if (App._realtimeCallbacks[i] === callback) return; }
  App._realtimeCallbacks.push(callback);
}

function unsubscribeRealtime(callback) {
  App._realtimeCallbacks = App._realtimeCallbacks.filter(function(cb) { return cb !== callback; });
}

function closeRealtimeChannel() {
  if (App._realtimeChannel && App.sbClient) { App.sbClient.removeChannel(App._realtimeChannel); App._realtimeChannel = null; }
  App._realtimePendingChanges = [];
  if (App._realtimeDebounceTimer) { clearTimeout(App._realtimeDebounceTimer); App._realtimeDebounceTimer = null; }
}

// ==== crypto-utils.js ====
(function() {
  var ALGORITHM = 'AES-GCM';
  var KEY_ALGO = { name: 'PBKDF2' };
  var SALT = new Uint8Array([183, 42, 91, 7, 224, 115, 39, 56, 201, 14, 77, 163, 88, 209, 31, 74]);
  var ITERATIONS = 100000;
  var STORAGE_KEY = 'bt_enc_key_id';
  var SEED_DB = 'bt_crypto_store';
  var SEED_STORE = 'seeds';
  var SEED_KEY = 'crypto_seed';
  var SEED_FALLBACK_KEY = 'bt_crypto_seed_bak';
  var _dbPromise = null;

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
      var req = indexedDB.open(SEED_DB, 1);
      req.onupgradeneeded = function(e) { var db = e.target.result; if (!db.objectStoreNames.contains(SEED_STORE)) db.createObjectStore(SEED_STORE); };
      req.onsuccess = function(e) { resolve(e.target.result); };
      req.onerror = function(e) { reject(e.target.error); };
    });
    return _dbPromise;
  }

  async function _getSeed() {
    try {
      var db = await _openDB();
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SEED_STORE, 'readonly');
        var store = tx.objectStore(SEED_STORE);
        var req = store.get(SEED_KEY);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
      });
    } catch(e) { Logger.warn('IndexedDB 种子读取失败', e); return null; }
  }

  async function _saveSeed(seed) {
    try { localStorage.setItem(SEED_FALLBACK_KEY, seed); } catch(e) {}
    try {
      var db = await _openDB();
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SEED_STORE, 'readwrite');
        var store = tx.objectStore(SEED_STORE);
        var req = store.put(seed, SEED_KEY);
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      });
    } catch(e) { Logger.warn('IndexedDB 种子保存失败，仅保留 localStorage 备份', e); }
  }

  var _cachedKey = null;

  async function getCryptoKey() {
    if (_cachedKey) return _cachedKey;
    var keyId = sessionStorage.getItem(STORAGE_KEY);
    if (keyId) {
      var material = await _getKeyMaterial();
      _cachedKey = await _deriveKey(material);
      return _cachedKey;
    }
    var newId = _generateId();
    sessionStorage.setItem(STORAGE_KEY, newId);
    var material = await _getKeyMaterial();
    _cachedKey = await _deriveKey(material);
    return _cachedKey;
  }

  async function _getKeyMaterial() {
    var seed = await _getSeed();
    if (!seed) {
      seed = localStorage.getItem(SEED_FALLBACK_KEY);
      if (seed) { await _saveSeed(seed); }
      else { seed = crypto.randomUUID(); await _saveSeed(seed); }
    } else {
      try { var bak = localStorage.getItem(SEED_FALLBACK_KEY); if (bak !== seed) localStorage.setItem(SEED_FALLBACK_KEY, seed); } catch(e) {}
    }
    return new TextEncoder().encode(seed);
  }

  async function _deriveKey(keyMaterial) {
    var baseKey = await crypto.subtle.importKey('raw', keyMaterial, KEY_ALGO, false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: SALT, iterations: ITERATIONS, hash: 'SHA-256' }, baseKey, { name: ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt']);
  }

  function _generateId() {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, function(b) { return b.toString(16).padStart(2,'0'); }).join('');
  }

  async function encrypt(plaintext) {
    if (!plaintext) return '';
    var key = await getCryptoKey();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encoded = new TextEncoder().encode(plaintext);
    var ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv: iv }, key, encoded);
    var combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return _arrayBufferToBase64(combined.buffer);
  }

  async function decrypt(ciphertext) {
    if (!ciphertext) return '';
    try {
      var key = await getCryptoKey();
      var combined = _base64ToArrayBuffer(ciphertext);
      var iv = combined.slice(0, 12);
      var data = combined.slice(12);
      var decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv: iv }, key, data);
      return new TextDecoder().decode(decrypted);
    } catch(e) { Logger.warn('Token 解密失败（可能浏览器环境变化）', e); return ''; }
  }

  function _arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function _base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  window.saveUserSecure = async function(user) {
    if (user.access_token) {
      sessionStorage.setItem('bt_access_token', user.access_token);
      try { var encAccess = await encrypt(user.access_token); localStorage.setItem('bt_access_token_enc', encAccess); } catch(e) { Logger.warn('access_token 加密存储失败', e); }
    }
    if (user.refresh_token) { var encRefresh = await encrypt(user.refresh_token); localStorage.setItem('bt_refresh_token_enc', encRefresh); }
    var meta = { id: user.id, email: user.email, loginAt: user.loginAt || Date.now() };
    localStorage.setItem(App.USER_KEY, JSON.stringify(meta));
  };

  window.restoreUserSecure = async function() {
    var meta = localStorage.getItem(App.USER_KEY);
    if (!meta) return { user: null, reason: 'no_data' };
    try {
      var userInfo = JSON.parse(meta);
      if (userInfo.loginAt) { var now = Date.now(); if (now - userInfo.loginAt > App.CONFIG.LOGIN_EXPIRY_MS) return { user: userInfo, reason: 'expired' }; }
      userInfo.access_token = sessionStorage.getItem('bt_access_token') || '';
      if (!userInfo.access_token) {
        var encAccess = localStorage.getItem('bt_access_token_enc');
        if (encAccess) { var decAccess = await decrypt(encAccess); if (decAccess) { userInfo.access_token = decAccess; sessionStorage.setItem('bt_access_token', decAccess); } }
      }
      var encRefresh = localStorage.getItem('bt_refresh_token_enc');
      if (encRefresh) {
        var decrypted = await decrypt(encRefresh);
        if (!decrypted) { userInfo.refresh_token = ''; userInfo._decryptFailed = true; return { user: userInfo, reason: 'decrypt_failed' }; }
        userInfo.refresh_token = decrypted;
      } else { userInfo.refresh_token = ''; }
      if (!userInfo.access_token && !userInfo.refresh_token) return { user: userInfo, reason: 'no_token' };
      return { user: userInfo, reason: 'ok' };
    } catch(e) { Logger.warn('恢复用户加密数据失败，清除存储', e); clearUserSecure(); return { user: null, reason: 'error' }; }
  };

  window.updateAccessTokenSecure = async function(token) {
    if (token) {
      sessionStorage.setItem('bt_access_token', token);
      try { var encAccess = await encrypt(token); localStorage.setItem('bt_access_token_enc', encAccess); } catch(e) { Logger.warn('access_token 加密存储失败', e); }
    }
  };

  window.clearUserSecure = function() {
    localStorage.removeItem(App.USER_KEY);
    localStorage.removeItem('bt_refresh_token_enc');
    localStorage.removeItem('bt_access_token_enc');
    sessionStorage.removeItem('bt_access_token');
    sessionStorage.removeItem(App.STORAGE_KEY);
  };

  setTimeout(function() {
    if (sessionStorage.getItem(STORAGE_KEY)) { getCryptoKey().catch(function() {}); }
  }, 0);
})();

// ==== login-modal.js ====
var LoginModalManager = (function() {
  var _container = null;
  var _callbacks = null;

  function init(containerEl, callbacks) {
    _container = containerEl;
    _callbacks = callbacks || {};
    _container.innerHTML =
      '<div class="modal-overlay" id="loginModal" style="display:none">' +
        '<div class="modal-box">' +
          '<h2>🍼 欢迎使用</h2>' +
          '<div class="modal-sub" id="loginSub"></div>' +
          '<input type="email" id="loginEmail" placeholder="邮箱地址" autocomplete="email">' +
          '<input type="password" id="loginPassword" placeholder="密码（至少6位）" autocomplete="current-password">' +
          '<div class="modal-error" id="loginError"></div>' +
          '<button type="button" class="btn-block btn-login" id="modalLoginBtn">🔑 登录</button>' +
          '<button type="button" class="btn-block btn-signup" id="signupBtn">✨ 注册新账号</button>' +
          '<div class="modal-divider">或</div>' +
          '<button type="button" class="btn-block btn-skip" id="skipBtn">📱 仅本设备使用（不同步）</button>' +
        '</div>' +
      '</div>';
    var sub = _container.getAttribute('data-sub');
    var subEl = _container.querySelector('#loginSub');
    if (sub && subEl) subEl.textContent = sub;
    _container.querySelector('#modalLoginBtn').addEventListener('click', _handleLogin);
    _container.querySelector('#signupBtn').addEventListener('click', _handleSignup);
    _container.querySelector('#skipBtn').addEventListener('click', _handleSkip);
  }

  function show(message) {
    var overlay = document.getElementById('loginModal');
    if (!overlay) return;
    overlay.style.display = 'flex';
    var errEl = document.getElementById('loginError');
    if (errEl) { errEl.textContent = message || ''; errEl.style.color = message ? '#E6A817' : '#e74c3c'; }
  }

  function hide() {
    var overlay = document.getElementById('loginModal');
    if (overlay) overlay.style.display = 'none';
  }

  async function _handleLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errorEl = document.getElementById('loginError');
    if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; errorEl.style.color = '#e74c3c'; return; }
    errorEl.textContent = '';
    try {
      await loadSupabaseSDK();
      initSupabase();
      var result = await App.sbClient.auth.signInWithPassword({ email: email, password: password });
      if (result.error) { errorEl.textContent = '登录失败：' + result.error.message; errorEl.style.color = '#e74c3c'; return; }
      var user = result.data.user;
      var session = result.data.session;
      App.currentUser = { id: user.id, email: user.email, access_token: session.access_token, refresh_token: session.refresh_token, loginAt: Date.now() };
      if (_callbacks.onSuccess) _callbacks.onSuccess(user, session);
    } catch(e) { Logger.error('登录失败', e); errorEl.textContent = '登录失败：' + e.message; errorEl.style.color = '#e74c3c'; }
  }

  async function _handleSignup() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errorEl = document.getElementById('loginError');
    if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; errorEl.style.color = '#e74c3c'; return; }
    if (password.length < 6) { errorEl.textContent = '密码至少6位'; errorEl.style.color = '#e74c3c'; return; }
    errorEl.textContent = '';
    try {
      await loadSupabaseSDK();
      initSupabase();
      var result = await App.sbClient.auth.signUp({ email: email, password: password });
      if (result.error) { errorEl.textContent = '注册失败：' + result.error.message; errorEl.style.color = '#e74c3c'; return; }
      var user = result.data.user;
      var session = result.data.session;
      if (user && session) {
        App.currentUser = { id: user.id, email: user.email, access_token: session.access_token, refresh_token: session.refresh_token, loginAt: Date.now() };
        if (_callbacks.onSuccess) _callbacks.onSuccess(user, session);
      } else { errorEl.textContent = '注册成功！请前往邮箱确认后登录。'; errorEl.style.color = '#70AD47'; }
    } catch(e) { Logger.error('注册失败', e); errorEl.textContent = '注册失败：' + e.message; errorEl.style.color = '#e74c3c'; }
  }

  function _handleSkip() { hide(); sessionStorage.setItem('bt_skip_login', '1'); if (_callbacks.onSkip) _callbacks.onSkip(); }

  return { init: init, show: show, hide: hide };
})();

if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  (function _registerLoginModalEl() {
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', _registerLoginModalEl); return; }
    try {
      var LoginModalEl = function() { return Reflect.construct(HTMLElement, [], LoginModalEl); };
      LoginModalEl.prototype = Object.create(HTMLElement.prototype);
      LoginModalEl.prototype.constructor = LoginModalEl;
      LoginModalEl.prototype.connectedCallback = function() {
        LoginModalManager.init(this, {
          onSuccess: function(user, session) { this.dispatchEvent(new CustomEvent('login-success', { detail: { user: user, session: session } })); }.bind(this),
          onSkip: function() { this.dispatchEvent(new Event('login-skip')); }.bind(this)
        });
      };
      LoginModalEl.prototype.show = function(message) { LoginModalManager.show(message); };
      LoginModalEl.prototype.hide = function() { LoginModalManager.hide(); };
      customElements.define('login-modal', LoginModalEl);
    } catch(e) {}
  })();
}

// ==== supabase-auth.js ====
async function restoreSession() {
  // 快速路径：sessionStorage 中有已验证的 token 且上次验证在 5 分钟内，直接跳过 API 调用
  // 但需要确保 token 理论上未过期（loginAt 不超过 TOKEN_REFRESH_INTERVAL_MS）
  var quickToken = sessionStorage.getItem('bt_access_token');
  var quickVerified = sessionStorage.getItem('bt_session_verified');
  if (quickToken && quickVerified) {
    var verifiedAge = Date.now() - parseInt(quickVerified, 10);
    if (verifiedAge < 5 * 60 * 1000) {
      var meta = localStorage.getItem(App.USER_KEY);
      if (meta) {
        try {
          var quickUser = JSON.parse(meta);
          // 检查 loginAt 是否在 token 理论有效期内（25分钟）
          if (quickUser.loginAt && (Date.now() - quickUser.loginAt) < App.CONFIG.TOKEN_REFRESH_INTERVAL_MS) {
            quickUser.access_token = quickToken;
            App.currentUser = quickUser;
            return { success: true, reason: 'quick' };
          }
        } catch(e) {}
      }
    }
  }

  var result = await restoreUserSecure();
  var userInfo = result.user;
  var reason = result.reason;

  if (userInfo && reason === 'ok' && userInfo.access_token) {
    App.currentUser = userInfo;
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    return { success: true, reason: 'ok' };
  }
  if (userInfo && reason === 'ok' && userInfo.refresh_token) {
    App.currentUser = userInfo;
    var ok = await refreshAccessToken();
    if (ok) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return { success: true, reason: 'ok' }; }
    App.currentUser = null;
    var sdkFallback = await _restoreFromSDK(userInfo);
    if (sdkFallback) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkFallback; }
    clearUserSecure(); return { success: false, reason: 'no_session' };
  }
  if (reason === 'decrypt_failed') {
    Logger.warn('加密密钥已变更，尝试 SDK 兜底恢复...');
    var sdkResult = await _restoreFromSDK(userInfo);
    if (sdkResult) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkResult; }
    clearUserSecure(); App.currentUser = null; return { success: false, reason: 'decrypt_failed' };
  }
  if (reason === 'expired') {
    if (userInfo && userInfo.refresh_token) { App.currentUser = userInfo; var ok2 = await refreshAccessToken(); if (ok2) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return { success: true, reason: 'ok' }; } App.currentUser = null; }
    var sdkResult2 = await _restoreFromSDK(userInfo);
    if (sdkResult2) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkResult2; }
    clearUserSecure(); App.currentUser = null; return { success: false, reason: 'expired' };
  }
  if (reason === 'no_data' || reason === 'no_token') { var sdkResult3 = await _restoreFromSDK(null); if (sdkResult3) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkResult3; } }
  return { success: false, reason: reason || 'no_session' };
}

async function _restoreFromSDK(fallbackUserInfo) {
  if (!App.sbClient) return null;
  try {
    var sdkResult = await App.sbClient.auth.getSession();
    if (sdkResult.data && sdkResult.data.session) {
      var session = sdkResult.data.session;
      var user = sdkResult.data.session.user;
      if (user) {
        App.currentUser = { id: user.id, email: user.email || (fallbackUserInfo ? fallbackUserInfo.email : ''), access_token: session.access_token, refresh_token: session.refresh_token || '', loginAt: Date.now() };
        await saveUserSecure(App.currentUser);
        sessionStorage.setItem('bt_session_verified', String(Date.now()));
        updateSyncStatus('online');
        setUserDisplay(App.currentUser.email || '用户');
        Logger.info('通过 SDK 兜底恢复会话成功');
        return { success: true, reason: 'ok' };
      }
    }
  } catch(e) { Logger.warn('SDK 兜底恢复失败', e); }
  return null;
}

async function refreshAccessToken(retries) {
  if (retries === undefined) retries = 1;
  if (!App.sbClient || !App.currentUser || !App.currentUser.refresh_token) return false;
  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var result = await App.sbClient.auth.refreshSession({ refresh_token: App.currentUser.refresh_token });
      if (result.error) {
        if (result.error.status === 400 || result.error.status === 401) { Logger.warn('refresh_token 已失效（' + result.error.status + '），需重新登录'); return false; }
        if (attempt < retries) { await new Promise(function(r) { setTimeout(r, (attempt + 1) * 1000); }); continue; }
        Logger.warn('Token 刷新失败: ' + (result.error.message || result.error.status)); return false;
      }
      if (!result.data || !result.data.session) { if (attempt < retries) { await new Promise(function(r) { setTimeout(r, (attempt + 1) * 1000); }); continue; } return false; }
      App.currentUser.access_token = result.data.session.access_token;
      App.currentUser.refresh_token = result.data.session.refresh_token;
      App.currentUser.loginAt = Date.now();
      await saveUserSecure(App.currentUser);
      return true;
    } catch(e) { Logger.warn('Token 刷新异常 (尝试 ' + (attempt + 1) + '/' + (retries + 1) + ')', e); if (attempt < retries) { await new Promise(function(r) { setTimeout(r, (attempt + 1) * 1000); }); continue; } return false; }
  }
  return false;
}

async function verifyAccessToken() {
  if (!App.sbClient || !App.currentUser || !App.currentUser.access_token) return false;
  try {
    var result = await App.sbClient.auth.getUser(App.currentUser.access_token);
    if (result.error) { if (result.error.status !== 403) { Logger.warn('Token 验证失败: ' + (result.error.message || result.error.status)); } return false; }
    return true;
  } catch(e) { Logger.warn('Token 验证异常', e); return false; }
}

function skipLogin() { App.currentUser = null; clearUserSecure(); sessionStorage.removeItem('bt_session_verified'); sessionStorage.setItem('bt_skip_login', '1'); updateSyncStatus('offline'); clearUserDisplay(); }

async function logout() {
  if (!confirm('确定退出登录？本地数据不会丢失。')) return;
  unsubscribeRealtime(handleRealtimeChange);
  closeRealtimeChannel();
  if (App.sbClient) await App.sbClient.auth.signOut();
  App.currentUser = null;
  clearUserSecure();
  sessionStorage.removeItem('bt_session_verified');
  updateSyncStatus('offline');
  clearUserDisplay();
  alert('已退出登录');
}

function showLogin(message) {
  var modal = document.querySelector('login-modal');
  if (modal && modal.show) { modal.show(message); return; }
  LoginModalManager.show(message);
}

function hideLogin() {
  var modal = document.querySelector('login-modal');
  if (modal && modal.hide) { modal.hide(); return; }
  LoginModalManager.hide();
}

// ==== cloud-sync.js ====
async function loadDayFromCloud(dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  var result = await App.sbClient.from('baby_records').select('*').eq('user_id', App.currentUser.id).eq('record_date', dateStr).order('start_time', { ascending: true });
  if (result.error) throw result.error;
  var cloudRecords = (result.data || []).map(mapCloudRecord);
  var localRecords = App.allData[dateStr] || [];
  var cloudIdMap = {};
  cloudRecords.forEach(function(cr) { cloudIdMap[cr.id] = cr; });
  var merged = [];
  localRecords.forEach(function(lr) {
    var cr = cloudIdMap[lr.id];
    if (!cr) return;
    var cloudTime = cr.updatedAt ? new Date(cr.updatedAt).getTime() : 0;
    var localTime = lr.updatedAt ? new Date(lr.updatedAt).getTime() : 0;
    if (cloudTime > localTime) merged.push(cr); else merged.push(lr);
    delete cloudIdMap[cr.id];
  });
  Object.keys(cloudIdMap).forEach(function(id) { merged.push(cloudIdMap[id]); });
  App.allData[dateStr] = merged.sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
  saveData();
}

async function loadMonthFromCloud(year, month) {
  if (!App.sbClient || !App.currentUser) return;
  var m = ('0' + month).slice(-2);
  var firstDay = year + '-' + m + '-01';
  var daysInMonth = new Date(year, month, 0).getDate();
  var lastDay = year + '-' + m + '-' + ('0' + daysInMonth).slice(-2);
  updateSyncStatus('syncing');
  try {
    var allRecords = [];
    var from = 0;
    var pageSize = App.CONFIG.SUPABASE_PAGE_SIZE;
    var hasMore = true;
    while (hasMore) {
      var result = await App.sbClient.from('baby_records').select('*').eq('user_id', App.currentUser.id).gte('record_date', firstDay).lte('record_date', lastDay).order('record_date', { ascending: true }).order('start_time', { ascending: true }).range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      if (result.data && result.data.length > 0) { allRecords = allRecords.concat(result.data); from += pageSize; if (result.data.length < pageSize) hasMore = false; } else { hasMore = false; }
    }
    var cloudByDate = {};
    allRecords.forEach(function(row) { var d = row.record_date; if (!cloudByDate[d]) cloudByDate[d] = []; cloudByDate[d].push(mapCloudRecord(row)); });
    Object.keys(cloudByDate).forEach(function(d) {
      if (!App.allData[d]) { App.allData[d] = cloudByDate[d]; return; }
      var localMap = {};
      for (var i = 0; i < App.allData[d].length; i++) localMap[App.allData[d][i].id] = i;
      var cloudRecs = cloudByDate[d];
      for (var j = 0; j < cloudRecs.length; j++) {
        var cr = cloudRecs[j];
        var localIdx = localMap[cr.id];
        if (localIdx !== undefined) { var localTime = App.allData[d][localIdx].updatedAt ? new Date(App.allData[d][localIdx].updatedAt).getTime() : 0; var cloudTime = cr.updatedAt ? new Date(cr.updatedAt).getTime() : 0; if (cloudTime > localTime) App.allData[d][localIdx] = cr; delete localMap[cr.id]; }
        else { App.allData[d].push(cr); }
      }
      App.allData[d].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
    });
    saveData();
    updateSyncStatus('online');
  } catch(e) { Logger.warn('按月加载云端数据失败', e); updateSyncStatus('offline'); }
}

async function loadFromCloud(mode) {
  if (!App.sbClient || !App.currentUser) return;
  mode = mode || 'merge';
  updateSyncStatus('syncing');
  try {
    var allRecords = [];
    var from = 0;
    var pageSize = App.CONFIG.SUPABASE_PAGE_SIZE;
    var hasMore = true;
    while (hasMore) {
      var result = await App.sbClient.from('baby_records').select('*').eq('user_id', App.currentUser.id).order('record_date', { ascending: false }).range(from, from + pageSize - 1);
      if (result.error) throw result.error;
      if (result.data && result.data.length > 0) { allRecords = allRecords.concat(result.data); from += pageSize; if (result.data.length < pageSize) hasMore = false; } else { hasMore = false; }
    }
    var cloudData = {};
    allRecords.forEach(function(row) { var d = row.record_date; if (!cloudData[d]) cloudData[d] = []; cloudData[d].push(mapCloudRecord(row)); });
    Object.keys(cloudData).forEach(function(d) { cloudData[d].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); }); });
    if (mode === 'replace') { App.allData = cloudData; }
    else {
      var merged = {};
      Object.keys(App.allData).forEach(function(d) { merged[d] = App.allData[d].slice(); });
      Object.keys(cloudData).forEach(function(d) {
        if (!merged[d]) { merged[d] = cloudData[d]; }
        else { var cloudIds = {}; cloudData[d].forEach(function(r) { cloudIds[r.id] = true; }); merged[d] = merged[d].filter(function(r) { return !cloudIds[r.id]; }); merged[d] = merged[d].concat(cloudData[d]); merged[d].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); }); }
      });
      App.allData = merged;
    }
    saveData();
    updateSyncStatus('online');
  } catch(e) { Logger.warn('全量加载云端数据失败', e); updateSyncStatus('offline'); }
}

async function syncRecordToCloud(record, dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  try {
    var row = { id: record.id, user_id: App.currentUser.id, record_date: dateStr, type: record.type, start_time: record.start || '', end_time: record.end || '', detail: record.detail || '', updated_at: toBJISOString() };
    var result = await App.sbClient.from('baby_records').upsert(row, { onConflict: 'id' });
    if (result.error) throw result.error;
  } catch(e) { Logger.warn('单条同步到云端失败，加入重试队列', e); addToSyncQueue({ action: 'upsert', record: record, date: dateStr }); }
}

async function deleteRecordFromCloud(recordId) {
  if (!App.sbClient || !App.currentUser) return;
  try { var result = await App.sbClient.from('baby_records').delete().eq('id', recordId).eq('user_id', App.currentUser.id); if (result.error) throw result.error; }
  catch(e) { Logger.warn('云端删除记录失败，加入重试队列', e); addToSyncQueue({ action: 'delete', id: recordId }); }
}

async function deleteDayFromCloud(dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  try { var result = await App.sbClient.from('baby_records').delete().eq('record_date', dateStr).eq('user_id', App.currentUser.id); if (result.error) throw result.error; }
  catch(e) { Logger.warn('批量删除云端记录失败', e); }
}

function getSyncQueue() { try { return JSON.parse(localStorage.getItem(App.SYNC_QUEUE_KEY) || '[]'); } catch(e) { return []; } }

function addToSyncQueue(item) { var queue = getSyncQueue(); queue.push({ action: item.action, record: item.record, date: item.date, id: item.id, ts: Date.now() }); localStorage.setItem(App.SYNC_QUEUE_KEY, JSON.stringify(queue)); }

async function processSyncQueue() {
  if (!App.sbClient || !App.currentUser) return;
  var queue = getSyncQueue();
  if (queue.length === 0) return;
  updateSyncStatus('syncing');
  var remaining = [];
  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    try {
      if (item.action === 'upsert') await syncRecordToCloud(item.record, item.date);
      else if (item.action === 'delete') await deleteRecordFromCloud(item.id);
    } catch(e) { remaining.push(item); }
  }
  localStorage.setItem(App.SYNC_QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0) updateSyncStatus('online');
}

// ==== storage.js ====
function loadData() {
  try { App.allData = JSON.parse(localStorage.getItem(App.STORAGE_KEY) || '{}'); } catch(e) { App.allData = {}; }
}

function saveData() {
  if (App._saveIdleId != null) { if (cancelIdleCallback) cancelIdleCallback(App._saveIdleId); else clearTimeout(App._saveIdleId); }
  App._saveIdleId = requestIdleCallback ? requestIdleCallback(_doSave, { timeout: 1000 }) : setTimeout(_doSave, 300);
}

function flushSave() {
  if (App._saveIdleId != null) { if (cancelIdleCallback) cancelIdleCallback(App._saveIdleId); else clearTimeout(App._saveIdleId); App._saveIdleId = null; }
  _doSave();
}

function _doSave() { App._saveIdleId = null; try { localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.allData)); } catch(e) { Logger.warn('localStorage 写入失败', e); } }

function getDayData(date) { return App.allData[date] || []; }

// ==== utils.js ====
function nowBJ() { var now = new Date(); var utcMs = now.getTime() + now.getTimezoneOffset() * 60000; return new Date(utcMs + 8 * 3600000); }

function toBJISOString(date) {
  if (!date) date = nowBJ();
  var y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), d = String(date.getDate()).padStart(2, '0');
  var h = String(date.getHours()).padStart(2, '0'), min = String(date.getMinutes()).padStart(2, '0'), s = String(date.getSeconds()).padStart(2, '0'), ms = String(date.getMilliseconds()).padStart(3, '0');
  return y + '-' + m + '-' + d + 'T' + h + ':' + min + ':' + s + '.' + ms + '+08:00';
}

function currentDateBJ() { var d = nowBJ(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function calcDuration(start, end) {
  if (!start || !end) return null;
  var sp = start.split(':').map(Number), ep = end.split(':').map(Number);
  var dur = (ep[0] * 60 + ep[1]) - (sp[0] * 60 + sp[1]);
  if (dur < 0) dur += 24 * 60;
  return dur;
}

function formatHours(minutes) { var h = minutes / 60; return h === 0 ? '0' : h.toFixed(1) + 'h'; }

function timeToMinutes(t) { if (!t) return -1; var p = t.split(':').map(Number); return p[0] * 60 + p[1]; }

function generateId() { var hex = crypto.randomUUID().replace(/-/g, '').slice(0, 15); return parseInt(hex, 16); }

function escapeHtml(str) { return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function exportJSON(data, filename) { var json = JSON.stringify(data, null, 2); var blob = new Blob([json], { type: 'application/json' }); downloadBlob(blob, filename); }

function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }

function fmtDate(year, month, day) { return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2); }

function mapCloudRecord(row) { return { id: row.id, type: row.type, start: row.start_time || '', end: row.end_time || '', detail: row.detail || '', createdAt: row.created_at, updatedAt: row.updated_at }; }

function calcDayStats(records, knownTypes) {
  var cnt = function(t) { return records.filter(function(r){return r.type===t;}).length; };
  var sD = function(types) { return records.filter(function(r){return types.indexOf(r.type)>=0;}).reduce(function(s,r){return s+(calcDuration(r.start,r.end)||0);},0); };
  return {
    milkCount: cnt('喝奶'), milkVolume: records.filter(function(r){return r.type==='喝奶'}).reduce(function(s,r){return s+(parseFloat(r.detail)||0);},0),
    waterCount: cnt('喝水'), fushiCount: cnt('辅食'), napCount: cnt('小睡'), longSleepCount: cnt('长睡'),
    sleepMinutes: sD(['小睡','长睡']), playCount: cnt('玩耍'), playMinutes: sD(['玩耍','外出']), waichuCount: cnt('外出'),
    chouCount: cnt('拉臭臭'), niaoCount: cnt('换尿布'), zaoCount: cnt('洗澡'), xuexiMinutes: sD(['学习']),
    customCount: cnt('其他') + records.filter(function(r){return knownTypes.indexOf(r.type)<0;}).length
  };
}

function loadXlsxModule(callback) {
  if (App._xlsxLoaded) { callback(); return; }
  if (App._xlsxLoading) return;
  App._xlsxLoading = true;
  // 使用脚本加载时捕获的基础路径
  var libBase = App.__libBase;
  var failed = false;
  function onError(step) { if (failed) return; failed = true; App._xlsxLoading = false; Logger.fatal(step === 'xlsx' ? 'SheetJS 库加载失败，请检查网络连接后刷新页面重试。' : '导出模块加载失败，请刷新页面后重试。'); }
  var s1 = document.createElement('script');
  s1.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
  s1.onload = function() {
    var s2 = document.createElement('script');
    s2.src = libBase + 'data-io.js';
    s2.onload = function() {
      var s3 = document.createElement('script');
      s3.src = libBase + 'excel-export.js';
      s3.onload = function() { App._xlsxLoaded = true; App._xlsxLoading = false; callback(); };
      s3.onerror = function() { onError('excel-export'); };
      document.head.appendChild(s3);
    };
    s2.onerror = function() { onError('data-io'); };
    document.head.appendChild(s2);
  };
  s1.onerror = function() { onError('xlsx'); };
  document.head.appendChild(s1);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  // 从 lib 路径反推根目录：lib/common-bundle.js → ../
  var root = App.__libBase.replace(/lib\/?$/, '');
  navigator.serviceWorker.register(root + 'sw.js', { scope: root || './' }).then(function(reg) { console.log('[PWA] SW 注册成功:', reg.scope); }).catch(function(err) { Logger.warn('PWA Service Worker 注册失败', err); });
}

function scheduleTokenRefresh() { if (App._tokenRefreshTimer) clearInterval(App._tokenRefreshTimer); App._tokenRefreshTimer = setInterval(function() { silentTokenRefresh(); }, App.CONFIG.TOKEN_REFRESH_INTERVAL_MS); }

function setupVisibilityListener() { document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'visible') silentTokenRefresh(); }); }

async function silentTokenRefresh() {
  if (!App.currentUser || !App.currentUser.refresh_token) return;
  try { var valid = await verifyAccessToken(); if (valid) { _touchLoginAt(); return; } var ok = await refreshAccessToken(); if (ok) updateSyncStatus('online'); } catch(e) { Logger.warn('Token 静默刷新失败', e); }
}

function _touchLoginAt() {
  if (!App.currentUser) return;
  try { App.currentUser.loginAt = Date.now(); var meta = localStorage.getItem(App.USER_KEY); if (meta) { var info = JSON.parse(meta); info.loginAt = Date.now(); localStorage.setItem(App.USER_KEY, JSON.stringify(info)); } } catch(e) {}
}
