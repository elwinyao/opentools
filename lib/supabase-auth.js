// ==================== 用户认证模块 ====================
// 依赖：app-namespace.js, supabase-client.js (App.sbClient), crypto-utils.js, login-modal.js
// 需外部提供：updateSyncStatus(), setUserDisplay(), clearUserDisplay()

// 从加密存储恢复会话
// 返回 { success: boolean, reason: 'ok'|'decrypt_failed'|'expired'|'no_session'|'quick' }
async function restoreSession() {
  // 快速路径：sessionStorage 中有已验证的 token 且上次验证在 5 分钟内
  var quickResult = _tryQuickPath();
  if (quickResult) return quickResult;

  // 状态机：根据 restoreUserSecure 返回的 reason 分派处理
  var result = await restoreUserSecure();
  switch (result.reason) {
    case 'ok':
      return await _handleSessionOk(result.user);
    case 'expired':
      return await _handleSessionExpired(result.user);
    case 'decrypt_failed':
      return await _handleSessionDecryptFailed(result.user);
    case 'no_data':
    case 'no_token':
      return await _handleSessionNoData();
    default:
      return { success: false, reason: result.reason || 'no_session' };
  }
}

// ---- 快速路径 ----
function _tryQuickPath() {
  var quickToken = sessionStorage.getItem('bt_access_token');
  var quickVerified = sessionStorage.getItem('bt_session_verified');
  if (!quickToken || !quickVerified) return null;

  var verifiedAge = Date.now() - parseInt(quickVerified, 10);
  if (verifiedAge >= 5 * 60 * 1000) return null;

  var meta = localStorage.getItem(App.USER_KEY);
  if (!meta) return null;

  try {
    var quickUser = JSON.parse(meta);
    if (quickUser.loginAt && (Date.now() - quickUser.loginAt) < App.CONFIG.TOKEN_REFRESH_INTERVAL_MS) {
      quickUser.access_token = quickToken;
      App.currentUser = quickUser;
      return { success: true, reason: 'quick' };
    }
  } catch(e) {}
  return null;
}

// ---- 状态处理函数 ----

// ok: 加密存储有效，有 access_token 直接用，无则用 refresh_token 刷新
async function _handleSessionOk(user) {
  if (!user) return await _handleSessionNoData();

  if (user.access_token) {
    App.currentUser = user;
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    return { success: true, reason: 'ok' };
  }

  if (user.refresh_token) {
    App.currentUser = user;
    if (await refreshAccessToken()) {
      sessionStorage.setItem('bt_session_verified', String(Date.now()));
      return { success: true, reason: 'ok' };
    }
    App.currentUser = null;
  }

  // refresh 失败或无 token，尝试 SDK 兜底
  var sdkFallback = await _restoreFromSDK(user);
  if (sdkFallback) {
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    return sdkFallback;
  }
  clearUserSecure();
  return { success: false, reason: 'no_session' };
}

// expired: 登录超 7 天，先试 refresh_token，再试 SDK 兜底
async function _handleSessionExpired(user) {
  if (user && user.refresh_token) {
    App.currentUser = user;
    if (await refreshAccessToken()) {
      sessionStorage.setItem('bt_session_verified', String(Date.now()));
      return { success: true, reason: 'ok' };
    }
    App.currentUser = null;
  }
  var sdkResult = await _restoreFromSDK(user);
  if (sdkResult) {
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    return sdkResult;
  }
  clearUserSecure();
  App.currentUser = null;
  return { success: false, reason: 'expired' };
}

// decrypt_failed: 加密密钥变更，尝试 SDK 兜底
async function _handleSessionDecryptFailed(user) {
  Logger.warn('加密密钥已变更，尝试 SDK 兜底恢复...');
  var sdkResult = await _restoreFromSDK(user);
  if (sdkResult) {
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    return sdkResult;
  }
  clearUserSecure();
  App.currentUser = null;
  return { success: false, reason: 'decrypt_failed' };
}

// no_data / no_token: 无本地存储数据，仅尝试 SDK 兜底
async function _handleSessionNoData() {
  var sdkResult = await _restoreFromSDK(null);
  if (sdkResult) {
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    return sdkResult;
  }
  return { success: false, reason: 'no_session' };
}

// SDK 级别兜底恢复（利用 Supabase 自身的 session 持久化）
async function _restoreFromSDK(fallbackUserInfo) {
  if (!App.sbClient) return null;
  try {
    var sdkResult = await App.sbClient.auth.getSession();
    if (sdkResult.data && sdkResult.data.session) {
      var session = sdkResult.data.session;
      var user = sdkResult.data.session.user;
      if (user) {
        App.currentUser = {
          id: user.id,
          email: user.email || (fallbackUserInfo ? fallbackUserInfo.email : ''),
          access_token: session.access_token,
          refresh_token: session.refresh_token || '',
          loginAt: Date.now()
        };
        await saveUserSecure(App.currentUser);
        updateSyncStatus('online');
        setUserDisplay(App.currentUser.email || '用户');
        Logger.info('通过 SDK 兜底恢复会话成功');
        return { success: true, reason: 'ok' };
      }
    }
  } catch(e) {
    Logger.warn('SDK 兜底恢复失败', e);
  }
  return null;
}

// 使用 refresh_token 刷新 access_token（SDK 方式 + 重试机制）
async function refreshAccessToken(retries) {
  if (retries === undefined) retries = 1; // 默认最多重试 1 次（共 2 次尝试）
  if (!App.sbClient || !App.currentUser || !App.currentUser.refresh_token) return false;

  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var result = await App.sbClient.auth.refreshSession({
        refresh_token: App.currentUser.refresh_token
      });
      if (result.error) {
        // 400 等客户端错误说明 refresh_token 本身已失效，无需重试
        if (result.error.status === 400 || result.error.status === 401) {
          Logger.warn('refresh_token 已失效（' + result.error.status + '），需重新登录');
          return false;
        }
        if (attempt < retries) {
          await new Promise(function(r) { setTimeout(r, (attempt + 1) * 1000); });
          continue;
        }
        Logger.warn('Token 刷新失败: ' + (result.error.message || result.error.status));
        return false;
      }
      if (!result.data || !result.data.session) {
        if (attempt < retries) {
          await new Promise(function(r) { setTimeout(r, (attempt + 1) * 1000); });
          continue;
        }
        return false;
      }
      App.currentUser.access_token = result.data.session.access_token;
      App.currentUser.refresh_token = result.data.session.refresh_token;
      App.currentUser.loginAt = Date.now();
      await saveUserSecure(App.currentUser);
      return true;
    } catch(e) {
      Logger.warn('Token 刷新异常 (尝试 ' + (attempt + 1) + '/' + (retries + 1) + ')', e);
      if (attempt < retries) {
        await new Promise(function(r) { setTimeout(r, (attempt + 1) * 1000); });
        continue;
      }
      return false;
    }
  }
  return false;
}

async function verifyAccessToken() {
  if (!App.sbClient || !App.currentUser || !App.currentUser.access_token) return false;
  try {
    var result = await App.sbClient.auth.getUser(App.currentUser.access_token);
    if (result.error) {
      // 403 表示 token 已过期，这是预期行为，无需打 warn
      if (result.error.status !== 403) {
        Logger.warn('Token 验证失败: ' + (result.error.message || result.error.status));
      }
      return false;
    }
    return true;
  } catch(e) {
    Logger.warn('Token 验证异常', e);
    return false;
  }
}

// 跳过登录
function skipLogin() {
  App.currentUser = null;
  clearUserSecure();
  sessionStorage.setItem('bt_skip_login', '1');
  updateSyncStatus('offline');
  clearUserDisplay();
}

// 退出登录
async function logout() {
  if (!confirm('确定退出登录？本地数据不会丢失。')) return;
  unsubscribeRealtime(handleRealtimeChange);
  closeRealtimeChannel();
  if (App.sbClient) {
    await App.sbClient.auth.signOut();
  }
  App.currentUser = null;
  clearUserSecure();
  updateSyncStatus('offline');
  clearUserDisplay();
  alert('已退出登录');
}

// 登录弹窗 UI 操作
function showLogin(message) {
  LoginModalManager.show(message);
}

function hideLogin() {
  LoginModalManager.hide();
}
