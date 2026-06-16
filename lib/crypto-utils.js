// ==================== Token 加密存储工具 ====================
// 使用 Web Crypto API (AES-GCM) 对敏感 token 进行加密
// access_token 加密后存入 localStorage（持久化）+ sessionStorage（热缓存）
// refresh_token 加密后存入 localStorage
// 非敏感信息（id, email, loginAt）明文存入 localStorage
//
// 加密密钥只依赖随机种子（IndexedDB + localStorage 双备份），
// 不再使用浏览器指纹，避免无痕模式/外接显示器等场景密钥变更导致登录态丢失。

(function() {
  var ALGORITHM = 'AES-GCM';
  var KEY_ALGO = { name: 'PBKDF2' };
  var SALT = new Uint8Array([183, 42, 91, 7, 224, 115, 39, 56, 201, 14, 77, 163, 88, 209, 31, 74]);
  var ITERATIONS = 100000;
  var STORAGE_KEY = 'bt_enc_key_id';
  var SEED_DB = 'bt_crypto_store';
  var SEED_STORE = 'seeds';
  var SEED_KEY = 'crypto_seed';
  var SEED_FALLBACK_KEY = 'bt_crypto_seed_bak'; // localStorage 备份

  // ==================== IndexedDB 种子管理 ====================
  var _dbPromise = null;

  function _openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise(function(resolve, reject) {
      var req = indexedDB.open(SEED_DB, 1);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(SEED_STORE)) {
          db.createObjectStore(SEED_STORE);
        }
      };
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
    } catch(e) {
      Logger.warn('IndexedDB 种子读取失败', e);
      return null;
    }
  }

  async function _saveSeed(seed) {
    // 双写：IndexedDB + localStorage 备份
    try {
      localStorage.setItem(SEED_FALLBACK_KEY, seed);
    } catch(e) { /* ignore */ }
    try {
      var db = await _openDB();
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(SEED_STORE, 'readwrite');
        var store = tx.objectStore(SEED_STORE);
        var req = store.put(seed, SEED_KEY);
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
      });
    } catch(e) {
      Logger.warn('IndexedDB 种子保存失败，仅保留 localStorage 备份', e);
    }
  }

  // ==================== 密钥管理 ====================

  // 缓存派生密钥，避免每次加解密都重新派生（PBKDF2 开销大）
  var _cachedKey = null;

  // 获取或生成加密密钥
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

  // 构建密钥材料：仅使用随机种子（不依赖浏览器指纹）
  // 种子丢失时从 localStorage 备份恢复，确保密钥稳定
  async function _getKeyMaterial() {
    var seed = await _getSeed();
    if (!seed) {
      // IndexedDB 种子丢失（无痕模式/清理数据），尝试从 localStorage 恢复
      seed = localStorage.getItem(SEED_FALLBACK_KEY);
      if (seed) {
        // 恢复种子到 IndexedDB
        await _saveSeed(seed);
      } else {
        // 首次使用：生成新种子并双写
        seed = crypto.randomUUID();
        await _saveSeed(seed);
      }
    } else {
      // 种子存在，确保 localStorage 备份同步
      try {
        var bak = localStorage.getItem(SEED_FALLBACK_KEY);
        if (bak !== seed) {
          localStorage.setItem(SEED_FALLBACK_KEY, seed);
        }
      } catch(e) { /* ignore */ }
    }
    return new TextEncoder().encode(seed);
  }

  // 派生 AES-GCM 密钥
  async function _deriveKey(keyMaterial) {
    var baseKey = await crypto.subtle.importKey(
      'raw', keyMaterial, KEY_ALGO, false, ['deriveKey']
    );
    return await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: SALT, iterations: ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: ALGORITHM, length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function _generateId() {
    var arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, function(b) { return b.toString(16).padStart(2,'0'); }).join('');
  }

  // 加密字符串
  async function encrypt(plaintext) {
    if (!plaintext) return '';
    var key = await getCryptoKey();
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var encoded = new TextEncoder().encode(plaintext);
    var ciphertext = await crypto.subtle.encrypt(
      { name: ALGORITHM, iv: iv }, key, encoded
    );
    // 返回 iv + ciphertext 的 base64 编码
    var combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(ciphertext), iv.length);
    return _arrayBufferToBase64(combined.buffer);
  }

  // 解密字符串
  async function decrypt(ciphertext) {
    if (!ciphertext) return '';
    try {
      var key = await getCryptoKey();
      var combined = _base64ToArrayBuffer(ciphertext);
      var iv = combined.slice(0, 12);
      var data = combined.slice(12);
      var decrypted = await crypto.subtle.decrypt(
        { name: ALGORITHM, iv: iv }, key, data
      );
      return new TextDecoder().decode(decrypted);
    } catch(e) {
      Logger.warn('Token 解密失败（可能浏览器环境变化）', e);
      return '';
    }
  }

  function _arrayBufferToBase64(buffer) {
    var bytes = new Uint8Array(buffer);
    var binary = '';
    for (var i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function _base64ToArrayBuffer(base64) {
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // ==================== 公开 API ====================

  // 加密存储用户信息
  // access_token -> sessionStorage（热缓存）+ localStorage 加密持久化
  // refresh_token -> 加密后存入 localStorage
  // id, email, loginAt -> 明文存入 localStorage
  window.saveUserSecure = async function(user) {
    // access_token 双写：sessionStorage 热缓存 + localStorage 加密持久化
    if (user.access_token) {
      sessionStorage.setItem('bt_access_token', user.access_token);
      try {
        var encAccess = await encrypt(user.access_token);
        localStorage.setItem('bt_access_token_enc', encAccess);
      } catch(e) {
        Logger.warn('access_token 加密存储失败', e);
      }
    }
    // refresh_token 加密后存入 localStorage
    if (user.refresh_token) {
      var encRefresh = await encrypt(user.refresh_token);
      localStorage.setItem('bt_refresh_token_enc', encRefresh);
    }
    // 非敏感信息明文存储
    var meta = {
      id: user.id,
      email: user.email,
      loginAt: user.loginAt || Date.now()
    };
    localStorage.setItem(App.USER_KEY, JSON.stringify(meta));
  };

  // 从存储恢复用户信息（异步）
  // 返回 { user: userInfo|null, reason: 'ok'|'expired'|'decrypt_failed'|'no_data'|'error' }
  window.restoreUserSecure = async function() {
    var meta = localStorage.getItem(App.USER_KEY);
    if (!meta) return { user: null, reason: 'no_data' };
    try {
      var userInfo = JSON.parse(meta);
      // 检查登录态是否过期
      // 注意：不过早清除存储，留给上层 SDK 兜底恢复的机会
      if (userInfo.loginAt) {
        var now = Date.now();
        if (now - userInfo.loginAt > App.CONFIG.LOGIN_EXPIRY_MS) {
          // 不立即 clearUserSecure()，保留数据给 SDK 兜底
          return { user: userInfo, reason: 'expired' };
        }
      }

      // 优先从 sessionStorage 读取 access_token（热缓存）
      userInfo.access_token = sessionStorage.getItem('bt_access_token') || '';
      // sessionStorage 为空时，从 localStorage 解密 access_token
      if (!userInfo.access_token) {
        var encAccess = localStorage.getItem('bt_access_token_enc');
        if (encAccess) {
          var decAccess = await decrypt(encAccess);
          if (decAccess) {
            userInfo.access_token = decAccess;
            // 恢复热缓存
            sessionStorage.setItem('bt_access_token', decAccess);
          }
        }
      }

      // 解密 refresh_token
      var encRefresh = localStorage.getItem('bt_refresh_token_enc');
      if (encRefresh) {
        var decrypted = await decrypt(encRefresh);
        // 检测解密失败：有密文但解密结果为空（说明密钥材料已变更）
        if (!decrypted) {
          userInfo.refresh_token = '';
          userInfo._decryptFailed = true;
          return { user: userInfo, reason: 'decrypt_failed' };
        }
        userInfo.refresh_token = decrypted;
      } else {
        userInfo.refresh_token = '';
      }

      // 如果两个 token 都没有，尝试 refresh_token 刷新（由调用方处理）
      if (!userInfo.access_token && !userInfo.refresh_token) {
        return { user: userInfo, reason: 'no_token' };
      }

      return { user: userInfo, reason: 'ok' };
    } catch(e) {
      Logger.warn('恢复用户加密数据失败，清除存储', e);
      clearUserSecure();
      return { user: null, reason: 'error' };
    }
  };

  // 更新 access_token（token 刷新后）
  window.updateAccessTokenSecure = async function(token) {
    if (token) {
      sessionStorage.setItem('bt_access_token', token);
      try {
        var encAccess = await encrypt(token);
        localStorage.setItem('bt_access_token_enc', encAccess);
      } catch(e) {
        Logger.warn('access_token 加密存储失败', e);
      }
    }
  };

  // 清除所有用户存储
  window.clearUserSecure = function() {
    localStorage.removeItem(App.USER_KEY);
    localStorage.removeItem('bt_refresh_token_enc');
    localStorage.removeItem('bt_access_token_enc');
    sessionStorage.removeItem('bt_access_token');
    sessionStorage.removeItem(App.STORAGE_KEY);
  };

  // ==================== 密钥预热：利用脚本加载后的空闲时间提前派生密钥 ====================
  // 在 DOMContentLoaded 之前，利用浏览器解析 HTML 的间隙触发 PBKDF2 派生
  // 这样当 restoreSession 需要密钥时，派生已经完成或即将完成
  setTimeout(function() {
    if (sessionStorage.getItem(STORAGE_KEY)) {
      getCryptoKey().catch(function() { /* 静默失败，实际使用时再重试 */ });
    }
  }, 0);
})();
