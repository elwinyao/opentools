// ==================== common-bundle.js ====================
// 自动合并：app-namespace + config + logger + supabase-config + supabase-client
//          + crypto-utils + login-modal + supabase-auth + cloud-sync + storage + utils
// 生成时间：2026-08-17

// ==== app-namespace.js ====
window.App = {
  STORAGE_KEY: 'baby_tracker_data',
  USER_KEY: 'baby_tracker_user',
  SYNC_QUEUE_KEY: 'baby_tracker_sync_queue',
  currentUser: null,
  allData: {},
  sbClient: null,
  _realtimeChannel: null,
  _realtimeChannelName: null,
  _realtimeTables: null,
  _realtimeCallbacks: [],
  _realtimePendingChanges: [],
  _realtimeDebounceTimer: null,
  _realtimeStatus: 'disconnected',
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
  REALTIME_EVENTS_PER_SECOND: 2,        // Realtime 每秒最大事件数：低频场景限流，降低带宽消耗

  // Realtime 连接状态轮询间隔（毫秒）：定时检查 isConnected() 同步 UI 状态
  REALTIME_STATUS_POLL_MS: 60000,                      // 60 秒

  // Realtime 自动重连冷却时间（毫秒）：防抖，避免频繁 removeChannel + subscribe
  REALTIME_RECONNECT_COOLDOWN_MS: 15000,               // 15 秒

  // Realtime 自动重连最大尝试次数：超过后停止主动重连，依赖轮询自然恢复
  REALTIME_MAX_RECONNECT_ATTEMPTS: 3,

  // 数据自动刷新间隔（毫秒）：页面切回可见时，距上次刷新超过此间隔则自动拉取云端数据
  DATA_REFRESH_INTERVAL_MS: 30 * 60 * 1000,          // 30 分钟

  // 全量同步间隔（毫秒）：距上次成功同步超过此间隔时，强制刷新当前日期数据（绕过防重入）
  FULL_SYNC_INTERVAL_MS: 2 * 60 * 60 * 1000,        // 2 小时

  // Realtime 页面隐藏延迟关闭（毫秒）：避免快速切换标签页导致反复创建/销毁 Channel
  REALTIME_HIDDEN_CLOSE_DELAY_MS: 30 * 60 * 1000,   // 30 分钟（与 DATA_REFRESH_INTERVAL_MS 对齐）

  // "其他"分类筛选：排除五大预置分类（吃喝/睡眠/玩耍/洗护/学习），覆盖自定义类型
  ZIDINGYI_EXCLUDE: { he: true, shui: true, wan: true, xihu: true, xuexi: true }
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
    realtime: { params: { eventsPerSecond: App.CONFIG.REALTIME_EVENTS_PER_SECOND } },
    global: { headers: { 'X-Requested-With': 'XMLHttpRequest' } }
  });

  // 监听 SDK Auth 状态变化，替代手动 Token 管理（减少 Auth Egress）
  App.sbClient.auth.onAuthStateChange(function(event, session) {
    if (event === 'TOKEN_REFRESHED' && session && App.currentUser) {
      App.currentUser.access_token = session.access_token;
      App.currentUser.refresh_token = session.refresh_token;
      App.currentUser.loginAt = Date.now();
      saveUserSecure(App.currentUser);
    } else if (event === 'SIGNED_OUT') {
      App.currentUser = null;
      clearUserSecure();
      sessionStorage.removeItem('bt_session_verified');
      if (typeof updateSyncStatus === 'function') updateSyncStatus('offline');
      if (typeof clearUserDisplay === 'function') clearUserDisplay();
    }
  });

  // SDK v2 的 realtime 对象提供 isConnected() 查询方法；定期轮询同步连接状态
  if (App.sbClient.realtime && !App._realtimeStatusTimer) {
    App._realtimeStatusTimer = setInterval(function() {
      var connected = false;
      try { connected = App.sbClient.realtime.isConnected(); } catch(e) {}
      var newStatus = connected ? 'connected' : 'disconnected';
      if (App._realtimeStatus !== newStatus) {
        App._realtimeStatus = newStatus;
        if (typeof updateSyncStatus === 'function') updateSyncStatus(App.syncStatus);
      }
      // 兜底：轮询发现断开时主动重建 channel（微信后台挂起后 WebSocket 可能异常）
      if (newStatus === 'disconnected') _autoReconnectRealtime();
    }, App.CONFIG.REALTIME_STATUS_POLL_MS);
  }

  return true;
}

// 页面设置 Realtime 订阅配置：自定义 channel 名与订阅表列表（调用 initRealtimeChannel 前必须配置）
function setRealtimeConfig(config) {
  if (!config) return;
  if (config.channelName) App._realtimeChannelName = config.channelName;
  if (Array.isArray(config.tables) && config.tables.length) App._realtimeTables = config.tables.slice();
}

function initRealtimeChannel() {
  if (!App.sbClient || !App.currentUser || !App.currentUser.id) return;
  // 页面必须先用 setRealtimeConfig 配置订阅表与 channel 名，无隐式缺省
  if (!App._realtimeTables || !App._realtimeTables.length || !App._realtimeChannelName) return;
  if (App._realtimeChannel) { App.sbClient.removeChannel(App._realtimeChannel); App._realtimeChannel = null; }
  var channel = App.sbClient.channel(App._realtimeChannelName);
  App._realtimeChannel = channel;
  App._realtimeTables.forEach(function(t) {
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: t, filter: 'user_id=eq.' + App.currentUser.id },
      function(payload) { _handleRealtimePayload(payload); }
    );
  });
  channel.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      App._realtimeStatus = 'connected';
      if (typeof updateSyncStatus === 'function') updateSyncStatus(App.syncStatus);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      App._realtimeStatus = 'disconnected';
      if (typeof updateSyncStatus === 'function') updateSyncStatus(App.syncStatus);
    }
  });
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
  if (App._realtimeCloseTimer) { clearTimeout(App._realtimeCloseTimer); App._realtimeCloseTimer = null; }
  if (App._realtimeChannel && App.sbClient) { App.sbClient.removeChannel(App._realtimeChannel); App._realtimeChannel = null; }
  App._realtimePendingChanges = [];
  if (App._realtimeDebounceTimer) { clearTimeout(App._realtimeDebounceTimer); App._realtimeDebounceTimer = null; }
}

// 自动重连 Realtime：仅在确认断开时主动重建 channel（防抖 + 最大次数限制）
function _autoReconnectRealtime() {
  if (!App.currentUser || !App.sbClient) return;
  if (App._realtimeStatus !== 'disconnected') return;
  if (App._reconnectCooldown && (Date.now() - App._reconnectCooldown) < App.CONFIG.REALTIME_RECONNECT_COOLDOWN_MS) return;
  if (!App._reconnectCount) App._reconnectCount = 0;
  if (App._reconnectCount >= App.CONFIG.REALTIME_MAX_RECONNECT_ATTEMPTS) return;
  App._reconnectCooldown = Date.now();
  App._reconnectCount++;
  // 重建当前页面通道（三个页面统一走公共库，按 setRealtimeConfig 订阅对应表）
  initRealtimeChannel();
  // 重连成功后重置计数
  setTimeout(function() { App._reconnectCount = 0; }, App.CONFIG.REALTIME_RECONNECT_COOLDOWN_MS * 2);
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
      else { seed = _randomUUID(); await _saveSeed(seed); }
    } else {
      try { var bak = localStorage.getItem(SEED_FALLBACK_KEY); if (bak !== seed) localStorage.setItem(SEED_FALLBACK_KEY, seed); } catch(e) {}
    }
    return new TextEncoder().encode(seed);
  }

  async function _deriveKey(keyMaterial) {
    var baseKey = await crypto.subtle.importKey('raw', keyMaterial, KEY_ALGO, false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: SALT, iterations: ITERATIONS, hash: 'SHA-256' }, baseKey, { name: ALGORITHM, length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // crypto.randomUUID() 兼容实现：仅安全上下文（HTTPS/localhost）可用
  // 非安全上下文（如 HTTP 局域网 IP）下使用 crypto.getRandomValues 手动拼 UUID v4
  function _randomUUID() {
    try { return crypto.randomUUID(); } catch(e) {}
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    arr[6] = (arr[6] & 0x0f) | 0x40;
    arr[8] = (arr[8] & 0x3f) | 0x80;
    var hex = Array.from(arr, function(b) { return b.toString(16).padStart(2,'0'); }).join('');
    return hex.substring(0,8) + '-' + hex.substring(8,12) + '-4' + hex.substring(13,16) + '-' + hex.substring(16,20) + '-' + hex.substring(20);
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

  // 检测 Web Crypto API 是否可用（subtle 仅在安全上下文 HTTPS/localhost 可用）
  // HTTP 局域网部署时降级为明文存储（局域网环境安全风险可控）
  function _isCryptoAvailable() {
    return !!(crypto && crypto.subtle);
  }

  window.saveUserSecure = async function(user) {
    if (user.access_token) {
      sessionStorage.setItem('bt_access_token', user.access_token);
      if (_isCryptoAvailable()) {
        try { var encAccess = await encrypt(user.access_token); localStorage.setItem('bt_access_token_enc', encAccess); } catch(e) { Logger.warn('access_token 加密存储失败', e); }
      } else {
        localStorage.setItem('bt_access_token_enc', user.access_token);
      }
    }
    if (user.refresh_token) {
      if (_isCryptoAvailable()) { var encRefresh = await encrypt(user.refresh_token); localStorage.setItem('bt_refresh_token_enc', encRefresh); }
      else { localStorage.setItem('bt_refresh_token_enc', user.refresh_token); }
    }
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
        if (encAccess) {
          if (_isCryptoAvailable()) { var decAccess = await decrypt(encAccess); if (decAccess) { userInfo.access_token = decAccess; sessionStorage.setItem('bt_access_token', decAccess); } }
          else { userInfo.access_token = encAccess; sessionStorage.setItem('bt_access_token', encAccess); }
        }
      }
      var encRefresh = localStorage.getItem('bt_refresh_token_enc');
      if (encRefresh) {
        if (_isCryptoAvailable()) {
          var decrypted = await decrypt(encRefresh);
          if (!decrypted) { userInfo.refresh_token = ''; userInfo._decryptFailed = true; return { user: userInfo, reason: 'decrypt_failed' }; }
          userInfo.refresh_token = decrypted;
        } else {
          userInfo.refresh_token = encRefresh;
        }
      } else { userInfo.refresh_token = ''; }
      if (!userInfo.access_token && !userInfo.refresh_token) return { user: userInfo, reason: 'no_token' };
      return { user: userInfo, reason: 'ok' };
    } catch(e) { Logger.warn('恢复用户加密数据失败，清除存储', e); clearUserSecure(); return { user: null, reason: 'error' }; }
  };

  window.updateAccessTokenSecure = async function(token) {
    if (token) {
      sessionStorage.setItem('bt_access_token', token);
      if (_isCryptoAvailable()) {
        try { var encAccess = await encrypt(token); localStorage.setItem('bt_access_token_enc', encAccess); } catch(e) { Logger.warn('access_token 加密存储失败', e); }
      } else {
        localStorage.setItem('bt_access_token_enc', token);
      }
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

// crypto.randomUUID() 兼容函数（全局作用域，供 generateId 等使用）
function _randomUUID() {
  try { return crypto.randomUUID(); } catch(e) {}
  var arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  arr[6] = (arr[6] & 0x0f) | 0x40;
  arr[8] = (arr[8] & 0x3f) | 0x80;
  var hex = Array.from(arr, function(b) { return b.toString(16).padStart(2,'0'); }).join('');
  return hex.substring(0,8) + '-' + hex.substring(8,12) + '-4' + hex.substring(13,16) + '-' + hex.substring(16,20) + '-' + hex.substring(20);
}

// ==== login-modal.js ====
var LoginModalManager = (function() {
  var _container = null;
  var _callbacks = null;

  function init(containerEl, callbacks) {
    _container = containerEl;
    _callbacks = callbacks || {};

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'loginModal';
    overlay.style.display = 'none';

    var box = document.createElement('div');
    box.className = 'modal-box';

    var h2 = document.createElement('h2');
    h2.textContent = '🍼 欢迎使用';

    var sub = document.createElement('div');
    sub.className = 'modal-sub';
    sub.id = 'loginSub';

    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'loginEmail';
    emailInput.placeholder = '邮箱地址';
    emailInput.autocomplete = 'email';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'loginPassword';
    passwordInput.placeholder = '密码（至少6位）';
    passwordInput.autocomplete = 'current-password';

    var errorDiv = document.createElement('div');
    errorDiv.className = 'modal-error';
    errorDiv.id = 'loginError';

    var loginBtn = document.createElement('button');
    loginBtn.type = 'button';
    loginBtn.className = 'btn-block btn-login';
    loginBtn.id = 'modalLoginBtn';
    loginBtn.textContent = '🔑 登录';

    var signupBtn = document.createElement('button');
    signupBtn.type = 'button';
    signupBtn.className = 'btn-block btn-signup';
    signupBtn.id = 'signupBtn';
    signupBtn.textContent = '✨ 注册新账号';

    var divider = document.createElement('div');
    divider.className = 'modal-divider';
    divider.textContent = '或';

    var skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-block btn-skip';
    skipBtn.id = 'skipBtn';
    skipBtn.textContent = '📱 仅本设备使用（不同步）';

    box.appendChild(h2);
    box.appendChild(sub);
    box.appendChild(emailInput);
    box.appendChild(passwordInput);
    box.appendChild(errorDiv);
    box.appendChild(loginBtn);
    box.appendChild(signupBtn);
    box.appendChild(divider);
    box.appendChild(skipBtn);
    overlay.appendChild(box);
    _container.appendChild(overlay);

    var subData = _container.getAttribute('data-sub');
    if (subData) sub.textContent = subData;
    loginBtn.addEventListener('click', _handleLogin);
    signupBtn.addEventListener('click', _handleSignup);
    skipBtn.addEventListener('click', _handleSkip);
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



// ==== supabase-auth.js ====
async function restoreSession() {
  var quickResult = _tryQuickPath();
  if (quickResult) return quickResult;

  var result = await restoreUserSecure();
  switch (result.reason) {
    case 'ok': return await _handleSessionOk(result.user);
    case 'expired': return await _handleSessionExpired(result.user);
    case 'decrypt_failed': return await _handleSessionDecryptFailed(result.user);
    case 'no_data': case 'no_token': return await _handleSessionNoData();
    default: return { success: false, reason: result.reason || 'no_session' };
  }
}

function _tryQuickPath() {
  var quickToken = sessionStorage.getItem('bt_access_token');
  var quickVerified = sessionStorage.getItem('bt_session_verified');
  if (!quickToken || !quickVerified) return null;
  var verifiedAge = Date.now() - parseInt(quickVerified, 10);
  if (verifiedAge >= 15 * 60 * 1000) return null;
  var meta = localStorage.getItem(App.USER_KEY);
  if (!meta) return null;
  try {
    var quickUser = JSON.parse(meta);
    if (quickUser.loginAt && (Date.now() - quickUser.loginAt) < App.CONFIG.LOGIN_EXPIRY_MS) {
      quickUser.access_token = quickToken;
      App.currentUser = quickUser;
      return { success: true, reason: 'quick' };
    }
  } catch(e) {}
  return null;
}

async function _handleSessionOk(user) {
  if (!user) return await _handleSessionNoData();
  if (user.access_token) { App.currentUser = user; sessionStorage.setItem('bt_session_verified', String(Date.now())); return { success: true, reason: 'ok' }; }
  if (user.refresh_token) { App.currentUser = user; if (await refreshAccessToken()) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return { success: true, reason: 'ok' }; } App.currentUser = null; }
  var sdkFallback = await _restoreFromSDK(user);
  if (sdkFallback) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkFallback; }
  clearUserSecure(); return { success: false, reason: 'no_session' };
}

async function _handleSessionExpired(user) {
  if (user && user.refresh_token) { App.currentUser = user; if (await refreshAccessToken()) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return { success: true, reason: 'ok' }; } App.currentUser = null; }
  var sdkResult = await _restoreFromSDK(user);
  if (sdkResult) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkResult; }
  clearUserSecure(); App.currentUser = null; return { success: false, reason: 'expired' };
}

async function _handleSessionDecryptFailed(user) {
  Logger.warn('加密密钥已变更，尝试 SDK 兜底恢复...');
  var sdkResult = await _restoreFromSDK(user);
  if (sdkResult) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkResult; }
  clearUserSecure(); App.currentUser = null; return { success: false, reason: 'decrypt_failed' };
}

async function _handleSessionNoData() {
  var sdkResult = await _restoreFromSDK(null);
  if (sdkResult) { sessionStorage.setItem('bt_session_verified', String(Date.now())); return sdkResult; }
  return { success: false, reason: 'no_session' };
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
  if (!App.sbClient || !App.currentUser) return false;
  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      // 修复：SDK 已启用 autoRefreshToken，Supabase refresh token 单次使用且轮换，
      // 手动传本地旧 refresh_token 刷新时，SDK 已轮换后旧值必然 400（iPhone Safari 常见）。
      // 优先走 SDK 内部会话（无参 refreshSession，token 永远最新）；
      // 仅当 SDK 无内部会话时用本地 token 一次性兜底（页面加载早期恢复流程，与后台自动刷新无竞态）。
      var result = await App.sbClient.auth.refreshSession();
      if (result.error && App.currentUser.refresh_token) {
        result = await App.sbClient.auth.refreshSession({ refresh_token: App.currentUser.refresh_token });
      }
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

// 清空 SW 的 api-cache：Supabase GET 响应按 URL 缓存（URL 不含 user id），
// 换账号登录后离线打开可能命中上一账号数据，登出时一并清空。
// 优先通过 postMessage 通知 SW 清理；页面尚未被 SW 控制时，
// 直接访问与 SW 共享的 Cache Storage 兜底（caches.delete 幂等，重复执行无副作用）。
function clearApiCache() {
  try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage({ type: 'clear-api-cache' }); } catch (e) { Logger.warn('通知 SW 清空 api-cache 失败', e); }
  try { if (window.caches) caches.delete('api-cache').catch(function() {}); } catch (e) {}
}

async function logout() {
  if (!confirm('确定退出登录？本机数据将被清空展示（云端已同步的数据重新登录后可恢复）。')) return;
  // 清空所有页面注册的 Realtime 回调并关闭通道（各页面登录后重新注册）
  App._realtimeCallbacks = [];
  closeRealtimeChannel();
  clearApiCache();
  if (App.sbClient) await App.sbClient.auth.signOut();
  App.currentUser = null;
  clearUserSecure();
  sessionStorage.removeItem('bt_session_verified');
  // 清通用数据键（baby 记录 + 同步队列），防止换账号时旧数据串显
  localStorage.removeItem(App.STORAGE_KEY);
  localStorage.removeItem(App.SYNC_QUEUE_KEY);
  // 页面钩子：各页清本页内存数据/存储键并重渲染空视图（growth/vaccine 专属键由页面自己清）
  if (typeof onLogout === 'function') onLogout();
  updateSyncStatus('offline');
  clearUserDisplay();
  alert('已退出登录');
}

function showLogin(message) {
  LoginModalManager.show(message);
}

function hideLogin() {
  LoginModalManager.hide();
}

// ==== UI 公共函数 ====
// Header 三件套默认 no-op 兜底：common-bundle 内部（logout/skipLogin/_restoreFromSDK/Realtime 回调）会调用，
// 页面通过 App.UI.bindHeader({...}) 绑定真实实现后覆盖这三个全局函数
function updateSyncStatus() {}
function setUserDisplay() {}
function clearUserDisplay() {}
// 登出钩子默认 no-op：页面实现 window.onLogout 后，登出时会清本页内存数据/存储键并重渲染空视图
function onLogout() {}

App.UI = App.UI || {};
// 绑定页面 Header 三件套：setUserDisplay / clearUserDisplay / updateSyncStatus 的通用实现，
// 替代 baby/growth/vaccine 三份 40 行样板（差异仅元素 id 与登录时额外显示的元素）
// opts: { displayId, loginId, logoutId, showOnLogin: ['登录时显示的元素id数组'] }
App.UI.bindHeader = function(opts) {
  opts = opts || {};
  var displayEl = opts.displayId ? document.getElementById(opts.displayId) : null;
  var loginEl = opts.loginId ? document.getElementById(opts.loginId) : null;
  var logoutEl = opts.logoutId ? document.getElementById(opts.logoutId) : null;
  var showOnLogin = opts.showOnLogin || [];

  function setUserDisplay(email) {
    if (displayEl) displayEl.textContent = '👤 ' + email;
    if (loginEl) loginEl.style.display = 'none';
    if (logoutEl) logoutEl.style.display = 'inline-block';
    showOnLogin.forEach(function(id) { var el = document.getElementById(id); if (el) el.style.display = 'inline-block'; });
  }
  function clearUserDisplay() {
    if (displayEl) displayEl.textContent = '📱 仅本设备';
    if (loginEl) loginEl.style.display = 'inline-block';
    if (logoutEl) logoutEl.style.display = 'none';
    showOnLogin.forEach(function(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; });
  }
  function updateSyncStatus(status) {
    App.syncStatus = status;
    var dot = document.querySelector('.sync-dot');
    var text = document.getElementById('syncText');
    if (!dot || !text) return;
    var realtimeOk = App._realtimeStatus === 'connected';
    if (status === 'online' && realtimeOk) { dot.className = 'sync-dot online'; text.textContent = '已同步'; }
    else if (status === 'online' && !realtimeOk) { dot.className = 'sync-dot realtime-off'; text.textContent = '已同步(WS断开)'; }
    else if (status === 'syncing') { dot.className = 'sync-dot syncing'; text.textContent = '同步中...'; }
    else { dot.className = 'sync-dot offline'; text.textContent = App.currentUser ? '离线' : '未登录'; }
  }

  window.setUserDisplay = setUserDisplay;
  window.clearUserDisplay = clearUserDisplay;
  window.updateSyncStatus = updateSyncStatus;
  return { setUserDisplay: setUserDisplay, clearUserDisplay: clearUserDisplay, updateSyncStatus: updateSyncStatus };
};

// 轻提示（公共）：动态创建 .app-toast 元素（样式见 common.css），1.8s 后自动消失；
// 替代 growth 页面内联 toast 与 vaccine 页面的 alert
function showToast(msg) {
  var el = document.getElementById('appToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'appToast';
    el.className = 'app-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  if (el._toastTimer) clearTimeout(el._toastTimer);
  el._toastTimer = setTimeout(function() { el.classList.remove('show'); }, 1800);
}

// 登录成功公共样板：三页共用（保存会话 + 隐藏登录框 + 更新 UI + 订阅 Realtime + 启动同步队列 + 执行页面差异逻辑）
// opts.subscribe: 页面 Realtime 变更回调（common-bundle 注册时已去重，重复注册安全）
// opts.afterSync: 登录后的页面数据加载/渲染逻辑（返回 Promise；失败由本函数降级为离线并保留本地数据）
async function standardOnLoginSuccess(user, opts) {
  opts = opts || {};
  if (App.currentUser) {
    App.currentUser.loginAt = Date.now();
    try { await saveUserSecure(App.currentUser); } catch(e) { Logger.warn('保存用户会话失败', e); }
  }
  sessionStorage.setItem('bt_session_verified', String(Date.now()));
  sessionStorage.removeItem('bt_skip_login');
  hideLogin();
  updateSyncStatus('online');
  setUserDisplay((user && user.email) || '用户');
  if (typeof opts.subscribe === 'function') subscribeRealtime(opts.subscribe);
  initRealtimeChannel();
  startSyncQueueProcessor();
  if (typeof opts.afterSync === 'function') {
    try { await opts.afterSync(); updateSyncStatus('online'); }
    catch(e) { Logger.warn('登录后同步数据失败，使用本地数据', e); updateSyncStatus('offline'); }
  }
}

// ==== cloud-sync.js ====
// 分页拉取指定表全部记录：统一 while(range) 分页循环，替代 baby/growth/vaccine 四份副本
// filters: [[col, op, val], ...]，op 为 supabase 过滤操作符（eq/gte/lte/gt/lt/neq 等）
// orders: [[col, ascending], ...]，ascending 为布尔
async function fetchAllPages(table, filters, orders) {
  if (!App.sbClient || !App.currentUser) return [];
  var all = [];
  var from = 0;
  var pageSize = App.CONFIG.SUPABASE_PAGE_SIZE;
  while (true) {
    var q = App.sbClient.from(table).select('*').eq('user_id', App.currentUser.id);
    (filters || []).forEach(function(f) { q = q[f[1]](f[0], f[2]); });
    (orders || []).forEach(function(o) { q = q.order(o[0], { ascending: o[1] !== false }); });
    var result = await q.range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    var rows = result.data || [];
    all = all.concat(rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// 本地/云端合并纯函数（updatedAt 大者胜 + 云端删除检测）：
// - 云端有同 key 记录：updatedAt 大者胜；相等时按 opts.tiePrefer 决定（'cloud' 云端胜 / 'local' 本地胜）
// - 本地独有：无 updatedAt（未同步过）保留，有 updatedAt（云端已删）丢弃
// - 云端独有：追加
// opts.sort: 可选排序函数，应用到返回数组
function mergeById(localArr, cloudArr, keyFn, opts) {
  opts = opts || {};
  var cloudMap = {};
  (cloudArr || []).forEach(function(c) { cloudMap[keyFn(c)] = c; });
  var merged = [];
  (localArr || []).forEach(function(l) {
    var k = keyFn(l);
    var c = cloudMap[k];
    if (!c) {
      if (!l.updatedAt) merged.push(l);
      return;
    }
    var lt = l.updatedAt ? new Date(l.updatedAt).getTime() : 0;
    var ct = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
    merged.push((ct > lt || (ct === lt && opts.tiePrefer !== 'local')) ? c : l);
    delete cloudMap[k];
  });
  Object.keys(cloudMap).forEach(function(k) { merged.push(cloudMap[k]); });
  if (opts.sort) merged.sort(opts.sort);
  return merged;
}

async function loadDayFromCloud(dateStr, force) {
  if (!App.sbClient || !App.currentUser) return;
  // 防重入：同一天的数据请求在飞行中时跳过，避免两个并发调用各自拿旧快照 merge 导致数据丢失
  // force=true 时跳过防重入保护，用于长时间未同步后的强制刷新
  if (!App._pendingDayLoads) App._pendingDayLoads = {};
  if (!force && App._pendingDayLoads[dateStr]) return;
  App._pendingDayLoads[dateStr] = true;
  try {
    var result = await App.sbClient.from('baby_records').select('*').eq('user_id', App.currentUser.id).eq('record_date', dateStr).order('start_time', { ascending: true });
  if (result.error) throw result.error;
  var cloudRecords = (result.data || []).map(mapCloudRecord);
  // await 后重新读取本地数据，确保拿到最新快照（手机端 PWA SW 缓存场景尤其重要）
  var localRecords = (App.allData[dateStr] || []).slice();
  // SW 离线回退返回 503 → SDK 抛错 → 走 catch 路径，无需空数组保护
  // 合并：updatedAt 大者胜；本地独有无 updatedAt（未同步）保留、有 updatedAt（云端已删）丢弃（mergeById 纯函数）
  App.allData[dateStr] = mergeById(localRecords, cloudRecords, function(r) { return r.id; }, {
    tiePrefer: 'local',
    sort: function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); }
  });
  saveData();
  } finally {
    delete App._pendingDayLoads[dateStr];
  }
}

async function loadMonthFromCloud(year, month) {
  if (!App.sbClient || !App.currentUser) return;
  var m = ('0' + month).slice(-2);
  var firstDay = year + '-' + m + '-01';
  var daysInMonth = new Date(year, month, 0).getDate();
  var lastDay = year + '-' + m + '-' + ('0' + daysInMonth).slice(-2);
  updateSyncStatus('syncing');
  try {
    var allRecords = await fetchAllPages('baby_records', [['record_date', 'gte', firstDay], ['record_date', 'lte', lastDay]], [['record_date', true], ['start_time', true]]);
    var cloudByDate = {};
    allRecords.forEach(function(row) { var d = row.record_date; if (!cloudByDate[d]) cloudByDate[d] = []; cloudByDate[d].push(mapCloudRecord(row)); });
    // 逐日合并（mergeById：updatedAt 大者胜 + 云端删除检测）
    Object.keys(cloudByDate).forEach(function(d) {
      App.allData[d] = mergeById(App.allData[d] || [], cloudByDate[d], function(r) { return r.id; }, {
        tiePrefer: 'local',
        sort: function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); }
      });
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
    var allRecords = await fetchAllPages('baby_records', null, [['record_date', false]]);
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

async function syncRecordToCloud(record, dateStr, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    // 方案1：不传 user_id，由数据库默认 auth.uid() 填充，杜绝 RLS 错配
    var row = { id: record.id, record_date: dateStr, type: record.type, start_time: record.start || '', end_time: record.end || '', detail: record.detail || '', updated_at: record.updatedAt || toBJISOString() };
    var result = await App.sbClient.from('baby_records').upsert(row, { onConflict: 'id' });
    if (result.error) throw result.error;
    // 同步成功后补写 updatedAt，标记该记录已同步到云端
    record.updatedAt = toBJISOString();
    saveData();
  } catch(e) {
    Logger.warn('单条同步到云端失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_records', action: 'upsert', record: record, date: dateStr });
    if (opts.throwOnFail) throw e;
  }
}

async function deleteRecordFromCloud(recordId, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try { var result = await App.sbClient.from('baby_records').delete().eq('id', recordId).eq('user_id', App.currentUser.id); if (result.error) throw result.error; }
  catch(e) {
    Logger.warn('云端删除记录失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_records', action: 'delete', id: recordId });
    if (opts.throwOnFail) throw e;
  }
}

async function deleteDayFromCloud(dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  try { var result = await App.sbClient.from('baby_records').delete().eq('record_date', dateStr).eq('user_id', App.currentUser.id); if (result.error) throw result.error; }
  catch(e) { Logger.warn('批量删除云端记录失败', e); }
}

// ==== 泛化同步队列（多表分发）====
// baby_records / baby_growth_records / baby_vaccines 共用同一队列（localStorage，三页同源共享）。
// 各页面通过 registerSyncTableHandler(table, { upsert(record, date), delete(id) }) 注册本页表的处理函数；
// processSyncQueue 按队列项上的 table 字段分发。对应 handler 未注册（本页未打开）的项会保留在队列中，
// 待对应页面打开后处理，不会丢失。旧版遗留的队列项无 table 字段，统一按 baby_records 处理。
App.SYNC_TABLE_HANDLERS = {};

function registerSyncTableHandler(table, handler) {
  App.SYNC_TABLE_HANDLERS[table] = handler;
}

function getSyncQueue() { try { return JSON.parse(localStorage.getItem(App.SYNC_QUEUE_KEY) || '[]'); } catch(e) { return []; } }

function _queueIdentity(item) { return item.action === 'delete' ? item.id : (item.record ? item.record.id : undefined); }

// 入队（去重）：同表 + 同动作 + 同记录 id 已存在时用最新内容覆盖，避免反复失败导致队列膨胀
function addToSyncQueue(item) {
  var table = item.table || 'baby_records';
  var identity = _queueIdentity(item);
  var queue = getSyncQueue();
  var idx = -1;
  for (var i = 0; i < queue.length; i++) {
    var q = queue[i];
    if (q.action === item.action && (q.table || 'baby_records') === table && identity !== undefined && _queueIdentity(q) === identity) { idx = i; break; }
  }
  var entry = { table: table, action: item.action, record: item.record, date: item.date, id: item.id, ts: Date.now() };
  if (idx >= 0) queue[idx] = entry; else queue.push(entry);
  localStorage.setItem(App.SYNC_QUEUE_KEY, JSON.stringify(queue));
}

async function processSyncQueue() {
  if (!App.sbClient || !App.currentUser) return;
  var queue = getSyncQueue();
  if (queue.length === 0) return;
  var processable = queue.some(function(item) { return App.SYNC_TABLE_HANDLERS[item.table || 'baby_records']; });
  if (!processable) return;  // 队列中无本页可处理的项，跳过（避免 syncing 状态误挂起）
  updateSyncStatus('syncing');
  var remaining = [];
  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    var table = item.table || 'baby_records';
    var handler = App.SYNC_TABLE_HANDLERS[table];
    if (!handler) { remaining.push(item); continue; }  // 本页未注册该表处理函数，保留待对应页面处理
    try {
      if (item.action === 'upsert') await handler.upsert(item.record, item.date);
      else if (item.action === 'delete') await handler.delete(item.id);
    } catch(e) { remaining.push(item); }  // 失败保留，下轮 30s 重试
  }
  localStorage.setItem(App.SYNC_QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0) updateSyncStatus('online');
}

// 注册 baby_records 表处理函数（baby 页逻辑内置在公共库中）
// 队列重试时使用 enqueue:false + throwOnFail:true：失败由 processSyncQueue 保留队列项，避免重复入队后被覆盖丢失
registerSyncTableHandler('baby_records', {
  upsert: function(record, date) { return syncRecordToCloud(record, date, { enqueue: false, throwOnFail: true }); },
  delete: function(id) { return deleteRecordFromCloud(id, { enqueue: false, throwOnFail: true }); }
});

// 按需启停同步队列处理器：仅在已登录且队列非空时运行
function startSyncQueueProcessor() {
  if (App._syncQueueTimer) return;
  App._syncQueueTimer = setInterval(function() {
    if (!App.currentUser || getSyncQueue().length === 0) {
      clearInterval(App._syncQueueTimer);
      App._syncQueueTimer = null;
      return;
    }
    processSyncQueue();
  }, App.CONFIG.SYNC_QUEUE_INTERVAL_MS);
  // 立即执行一次
  processSyncQueue();
}

// ==== storage.js ====
function loadData() {
  try { App.allData = JSON.parse(localStorage.getItem(App.STORAGE_KEY) || '{}'); } catch(e) { App.allData = {}; }
}

function saveData() {
  if (App._saveIdleId != null) { clearTimeout(App._saveIdleId); }
  App._saveIdleId = setTimeout(_doSave, 0);
}

function flushSave() {
  if (App._saveIdleId != null) { clearTimeout(App._saveIdleId); App._saveIdleId = null; }
  _doSave();
}

function _doSave() { App._saveIdleId = null; try { localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.allData)); } catch(e) { Logger.warn('localStorage 写入失败', e); } }

function getDayData(date) { return App.allData[date] || []; }

// ==== utils.js ====
function nowBJ() { var now = new Date(); var utcMs = now.getTime() + now.getTimezoneOffset() * 60000; return new Date(utcMs + 8 * 3600000); }

function toBJISOString(date) {
  if (!date) date = new Date();
  return date.toISOString();
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

function generateId() { var hex = _randomUUID().replace(/-/g, '').slice(0, 15); return parseInt(hex, 16); }

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
  // 微信内置浏览器不支持 Service Worker，跳过避免无意义请求
  var ua = navigator.userAgent;
  if (/MicroMessenger/i.test(ua)) return;
  // 从 lib 路径反推根目录：lib/common-bundle.js → ../
  var root = App.__libBase.replace(/lib\/?$/, '');
  navigator.serviceWorker.register(root + 'sw.js', { scope: root || './' }).then(function(reg) { console.log('[PWA] SW 注册成功:', reg.scope); }).catch(function(err) { Logger.warn('PWA Service Worker 注册失败', err); });
}

function setupVisibilityListener() {
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
      // 页面隐藏时延迟关闭 Realtime，避免快速切换标签页导致反复创建/销毁
      if (App._realtimeCloseTimer) clearTimeout(App._realtimeCloseTimer);
      App._realtimeCloseTimer = setTimeout(function() {
        App._realtimeCloseTimer = null;
        closeRealtimeChannel();
      }, App.CONFIG.REALTIME_HIDDEN_CLOSE_DELAY_MS);
    } else {
      // 页面可见时：取消待关闭定时器，刷新数据，按需重建 Realtime
      if (App._realtimeCloseTimer) {
        clearTimeout(App._realtimeCloseTimer);
        App._realtimeCloseTimer = null;
      }
      _autoRefreshDataIfStale();
      // 通道缺失或已断开时重建（延迟关闭未触发时 Channel 仍存活）
      if (App.currentUser && App.sbClient) {
        if (!App._realtimeChannel || App._realtimeStatus === 'disconnected') initRealtimeChannel();
      }
    }
  });
}

// 数据超过 DATA_REFRESH_INTERVAL_MS 自动刷新（拉取云端数据后通知子页面渲染 UI）
async function _autoRefreshDataIfStale() {
  if (!App.currentUser || !App.currentUser.access_token) return;
  var now = Date.now();
  if (App._lastDataRefresh && (now - App._lastDataRefresh) < App.CONFIG.DATA_REFRESH_INTERVAL_MS) return;
  App._lastDataRefresh = now;
  try {
    // 页面可注册自定义刷新函数（growth/vaccine 全量拉取并渲染）；缺省走作息页按日拉取
    if (typeof App._onStaleRefresh === 'function') {
      await App._onStaleRefresh();
      return;
    }
    await loadDayFromCloud(App.currentDate);
    // 云端数据到达后通知子页面渲染 UI（子页面通过 App._onDataRefreshed 注册回调）
    if (typeof App._onDataRefreshed === 'function') {
      App._onDataRefreshed();
    }
  } catch(e) { /* 静默失败，不影响用户操作 */ }
}
