// ==================== 用户认证模块 ====================
// 依赖：app-namespace.js, supabase-client.js (App.sbClient), crypto-utils.js, login-modal.js
// 需外部提供：updateSyncStatus(), setUserDisplay(), clearUserDisplay()

// 从加密存储恢复会话
// 返回 { success: boolean, reason: 'ok'|'decrypt_failed'|'expired'|'no_session' }
async function restoreSession() {
  // 第一层：从自定义加密存储恢复
  var result = await restoreUserSecure();
  var userInfo = result.user;
  var reason = result.reason;

  if (userInfo && reason === 'ok' && userInfo.access_token) {
    App.currentUser = userInfo;
    updateSyncStatus('online');
    setUserDisplay(userInfo.email || '用户');
    return { success: true, reason: 'ok' };
  }
  // 有元信息但无 access_token，尝试用 refresh_token 刷新
  if (userInfo && reason === 'ok' && userInfo.refresh_token) {
    App.currentUser = userInfo;
    var ok = await refreshAccessToken();
    if (ok) {
      updateSyncStatus('online');
      setUserDisplay(userInfo.email || '用户');
      return { success: true, reason: 'ok' };
    }
    App.currentUser = null;
    return { success: false, reason: 'no_session' };
  }
  // 解密失败：安全升级导致密钥变更
  if (reason === 'decrypt_failed') {
    Logger.warn('加密密钥已变更，尝试 SDK 兜底恢复...');
    // 不立即清除存储，先尝试 SDK 兜底
    var sdkResult = await _restoreFromSDK(userInfo);
    if (sdkResult) return sdkResult;
    // SDK 兜底也失败，清除旧存储
    clearUserSecure();
    App.currentUser = null;
    return { success: false, reason: 'decrypt_failed' };
  }
  // 登录过期
  if (reason === 'expired') {
    // 也尝试 SDK 兜底（SDK 可能有更新的 session）
    var sdkResult2 = await _restoreFromSDK(null);
    if (sdkResult2) return sdkResult2;
    App.currentUser = null;
    return { success: false, reason: 'expired' };
  }
  // 完全没有存储数据，尝试 SDK 兜底
  if (reason === 'no_data' || reason === 'no_token') {
    var sdkResult3 = await _restoreFromSDK(null);
    if (sdkResult3) return sdkResult3;
  }
  return { success: false, reason: reason || 'no_session' };
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
  if (retries === undefined) retries = 2; // 默认最多重试 2 次
  if (!App.sbClient || !App.currentUser || !App.currentUser.refresh_token) return false;

  for (var attempt = 0; attempt <= retries; attempt++) {
    try {
      var result = await App.sbClient.auth.refreshSession({
        refresh_token: App.currentUser.refresh_token
      });
      if (result.error || !result.data || !result.data.session) {
        if (attempt < retries) {
          // 等待后重试（指数退避：1s, 2s）
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
      Logger.warn('Token 刷新失败 (尝试 ' + (attempt + 1) + '/' + (retries + 1) + ')', e);
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
    return !result.error;
  } catch(e) {
    Logger.warn('Token 验证失败', e);
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

// 登录弹窗 UI 操作（兼容 Web Component 和传统 DOM 模式）
function showLogin(message) {
  // 优先尝试 Web Component 方式
  var modal = document.querySelector('login-modal');
  if (modal && modal.show) { modal.show(message); return; }
  // 回退到 LoginModalManager
  LoginModalManager.show(message);
}

function hideLogin() {
  var modal = document.querySelector('login-modal');
  if (modal && modal.hide) { modal.hide(); return; }
  LoginModalManager.hide();
}
