// ==================== Token 加密存储工具 ====================
// 使用 Web Crypto API (AES-GCM) 对敏感 token 进行加密
// access_token 存入 sessionStorage（关闭标签即清空）
// refresh_token 加密后存入 localStorage
// 非敏感信息（id, email, loginAt）明文存入 localStorage

(function() {
  // 加密密钥派生（使用固定种子 + 浏览器指纹）
  var ALGORITHM = 'AES-GCM';
  var KEY_ALGO = { name: 'PBKDF2' };
  var SALT = new Uint8Array([183, 42, 91, 7, 224, 115, 39, 56, 201, 14, 77, 163, 88, 209, 31, 74]);
  var ITERATIONS = 200000;
  var STORAGE_KEY = 'bt_enc_key_id';

  // 获取或生成加密密钥
  async function getCryptoKey() {
    // 尝试从 sessionStorage 获取缓存的密钥标识
    var keyId = sessionStorage.getItem(STORAGE_KEY);
    if (keyId) {
      // 使用缓存的密钥材料重新派生
      var material = _getKeyMaterial();
      return await _deriveKey(material);
    }
    // 首次使用：生成密钥标识并缓存
    var newId = _generateId();
    sessionStorage.setItem(STORAGE_KEY, newId);
    var material = _getKeyMaterial();
    return await _deriveKey(material);
  }

  // 基于浏览器指纹构建密钥材料
  function _getKeyMaterial() {
    var parts = [
      navigator.userAgent || '',
      screen.colorDepth + 'x' + screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
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
  window.restoreUserSecure = async function() {
    var meta = localStorage.getItem(App.USER_KEY);
    if (!meta) return null;
    try {
      var userInfo = JSON.parse(meta);
      // 检查登录态是否过期（7天）
      if (userInfo.loginAt) {
        var now = Date.now();
        var sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (now - userInfo.loginAt > sevenDays) {
          clearUserSecure();
          return null;
        }
      }
      // 从 sessionStorage 读取 access_token
      userInfo.access_token = sessionStorage.getItem('bt_access_token') || '';
      // 解密 refresh_token
      var encRefresh = localStorage.getItem('bt_refresh_token_enc');
      if (encRefresh) {
        userInfo.refresh_token = await decrypt(encRefresh);
      } else {
        userInfo.refresh_token = '';
      }
      // access_token 必须存在才恢复
      if (!userInfo.access_token) {
        // 尝试用 refresh_token 刷新（由调用方处理）
        return userInfo;
      }
      return userInfo;
    } catch(e) {
      Logger.warn('恢复用户加密数据失败，清除存储', e);
      clearUserSecure();
      return null;
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
