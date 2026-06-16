// ==================== Token 加密存储工具 ====================
// 使用 Web Crypto API (AES-GCM) 对敏感 token 进行加密
// access_token 存入 sessionStorage（关闭标签即清空）
// refresh_token 加密后存入 localStorage
// 非敏感信息（id, email, loginAt）明文存入 localStorage

(function() {
  // 加密密钥派生（随机种子 + 浏览器指纹）
  // 随机种子持久化到 IndexedDB，比 localStorage 更难被 XSS 读取
  var ALGORITHM = 'AES-GCM';
  var KEY_ALGO = { name: 'PBKDF2' };
  var SALT = new Uint8Array([183, 42, 91, 7, 224, 115, 39, 56, 201, 14, 77, 163, 88, 209, 31, 74]);
  var ITERATIONS = 200000;
  var STORAGE_KEY = 'bt_enc_key_id';
  var SEED_DB = 'bt_crypto_store';
  var SEED_STORE = 'seeds';
  var SEED_KEY = 'crypto_seed';

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
      Logger.warn('IndexedDB 种子保存失败', e);
    }
  }

  // ==================== 密钥管理 ====================

  // 获取或生成加密密钥
  async function getCryptoKey() {
    // 尝试从 sessionStorage 获取缓存的密钥标识
    var keyId = sessionStorage.getItem(STORAGE_KEY);
    if (keyId) {
      var material = await _getKeyMaterial();
      return await _deriveKey(material);
    }
    // 首次使用：生成密钥标识并缓存
    var newId = _generateId();
    sessionStorage.setItem(STORAGE_KEY, newId);
    var material = await _getKeyMaterial();
    return await _deriveKey(material);
  }

  // 构建密钥材料：随机种子 + 浏览器指纹（作为额外熵）
  async function _getKeyMaterial() {
    var seed = await _getSeed();
    if (!seed) {
      seed = crypto.randomUUID();
      await _saveSeed(seed);
    }
    var parts = [
      seed,
      navigator.userAgent || '',
      screen.colorDepth + 'x' + screen.width + 'x' + screen.height,
      navigator.language || ''
    ];
    return new TextEncoder().encode(parts.join('|'));
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
  // access_token -> sessionStorage
  // refresh_token -> 加密后存入 localStorage
  // id, email, loginAt -> 明文存入 localStorage
  window.saveUserSecure = async function(user) {
    // access_token 存入 sessionStorage（关闭标签即清空）
    if (user.access_token) {
      sessionStorage.setItem('bt_access_token', user.access_token);
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
      if (userInfo.loginAt) {
        var now = Date.now();
        if (now - userInfo.loginAt > App.CONFIG.LOGIN_EXPIRY_MS) {
          clearUserSecure();
          return { user: null, reason: 'expired' };
        }
      }
      // 从 sessionStorage 读取 access_token
      userInfo.access_token = sessionStorage.getItem('bt_access_token') || '';
      // 解密 refresh_token
      var encRefresh = localStorage.getItem('bt_refresh_token_enc');
      if (encRefresh) {
        var decrypted = await decrypt(encRefresh);
        // 检测解密失败：有密文但解密结果为空（说明密钥材料已变更）
        if (!decrypted) {
          // 保留 userInfo（email 等信息），标记解密失败让调用方提示用户
          userInfo.refresh_token = '';
          userInfo._decryptFailed = true;
          return { user: userInfo, reason: 'decrypt_failed' };
        }
        userInfo.refresh_token = decrypted;
      } else {
        userInfo.refresh_token = '';
      }
      // access_token 必须存在才恢复
      if (!userInfo.access_token) {
        // 尝试用 refresh_token 刷新（由调用方处理）
        return { user: userInfo, reason: 'ok' };
      }
      return { user: userInfo, reason: 'ok' };
    } catch(e) {
      Logger.warn('恢复用户加密数据失败，清除存储', e);
      clearUserSecure();
      return { user: null, reason: 'error' };
    }
  };

  // 更新 access_token（token 刷新后）
  window.updateAccessTokenSecure = function(token) {
    if (token) {
      sessionStorage.setItem('bt_access_token', token);
    }
  };

  // 清除所有用户存储
  window.clearUserSecure = function() {
    localStorage.removeItem(App.USER_KEY);
    localStorage.removeItem('bt_refresh_token_enc');
    sessionStorage.removeItem('bt_access_token');
    sessionStorage.removeItem(App.STORAGE_KEY);
  };
})();
