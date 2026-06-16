// ==================== 用户认证模块 ====================
// 依赖：app-namespace.js, supabase-client.js (App.sbClient), crypto-utils.js, login-modal.js
// 需外部提供：updateSyncStatus(), setUserDisplay(), clearUserDisplay()

// 从加密存储恢复会话
// 返回 { success: boolean, reason: 'ok'|'decrypt_failed'|'expired'|'no_session' }
async function restoreSession() {
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
  // 解密失败：安全升级导致密钥变更，需要重新登录
  if (reason === 'decrypt_failed') {
    Logger.warn('加密密钥已变更，需要重新登录');
    // 清除旧存储
    clearUserSecure();
    App.currentUser = null;
    return { success: false, reason: 'decrypt_failed' };
  }
  // 登录过期
  if (reason === 'expired') {
    App.currentUser = null;
    return { success: false, reason: 'expired' };
  }
  return { success: false, reason: reason || 'no_session' };
}

// 使用 refresh_token 刷新 access_token（SDK 方式）
async function refreshAccessToken() {
  if (!App.sbClient || !App.currentUser || !App.currentUser.refresh_token) return false;
  try {
    var result = await App.sbClient.auth.refreshSession({
      refresh_token: App.currentUser.refresh_token
    });
    if (result.error || !result.data || !result.data.session) return false;
    App.currentUser.access_token = result.data.session.access_token;
    App.currentUser.refresh_token = result.data.session.refresh_token;
    App.currentUser.loginAt = Date.now();
    await saveUserSecure(App.currentUser);
    return true;
  } catch(e) {
    Logger.warn('Token 刷新失败', e);
    return false;
  }
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

// 登录弹窗 UI 操作（委托给 login-modal Web Component）
function showLogin(message) {
  var modal = document.querySelector('login-modal');
  if (modal) modal.show(message);
}

function hideLogin() {
  var modal = document.querySelector('login-modal');
  if (modal) modal.hide();
}
