// ==================== 用户认证模块 ====================
// 依赖：app-namespace.js, supabase-client.js (App.sbClient), crypto-utils.js
// 需外部提供：updateSyncStatus(), setUserDisplay(), clearUserDisplay(), onLoginSuccess()

// 从加密存储恢复会话
async function restoreSession() {
  var userInfo = await restoreUserSecure();
  if (userInfo && userInfo.access_token) {
    App.currentUser = userInfo;
    updateSyncStatus('online');
    setUserDisplay(userInfo.email || '用户');
    return true;
  }
  // 有元信息但无 access_token，尝试用 refresh_token 刷新
  if (userInfo && userInfo.refresh_token) {
    App.currentUser = userInfo;
    var ok = await refreshAccessToken();
    if (ok) {
      updateSyncStatus('online');
      setUserDisplay(userInfo.email || '用户');
      return true;
    }
    App.currentUser = null;
  }
  return false;
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

// 登录
async function handleLogin() {
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var errorEl = document.getElementById('loginError');
  if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; return; }
  errorEl.textContent = '';
  try {
    var result = await App.sbClient.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (result.error) {
      var errMsg = result.error.message || '登录失败，请检查邮箱和密码';
      if (errMsg.indexOf('Email not confirmed') >= 0) {
        errMsg = '邮箱未确认，请检查收件箱中的确认邮件';
      }
      throw new Error(errMsg);
    }
    var session = result.data.session;
    App.currentUser = {
      id: session.user.id,
      email: session.user.email,
      access_token: session.access_token,
      refresh_token: session.refresh_token
    };
    onLoginSuccess(session.user, session);
  } catch(e) {
    Logger.error('登录失败', e);
    errorEl.textContent = '登录失败：' + e.message;
  }
}

// 注册
async function handleSignup() {
  var email = document.getElementById('loginEmail').value.trim();
  var password = document.getElementById('loginPassword').value;
  var errorEl = document.getElementById('loginError');
  if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; return; }
  if (password.length < 6) { errorEl.textContent = '密码至少6位'; return; }
  errorEl.textContent = '';
  try {
    var result = await App.sbClient.auth.signUp({
      email: email,
      password: password
    });
    if (result.error) {
      var errMsg = result.error.message || '注册失败';
      throw new Error(errMsg);
    }
    if (result.data.session) {
      var session = result.data.session;
      App.currentUser = {
        id: session.user.id,
        email: session.user.email,
        access_token: session.access_token,
        refresh_token: session.refresh_token
      };
      onLoginSuccess(session.user, session);
    } else {
      errorEl.textContent = '注册成功！请检查邮箱确认链接后再登录。';
    }
  } catch(e) {
    Logger.error('注册失败', e);
    errorEl.textContent = '注册失败：' + e.message;
  }
}

// 跳过登录
function skipLogin() {
  App.currentUser = null;
  clearUserSecure();
  sessionStorage.setItem('bt_skip_login', '1');
  hideLogin();
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
function showLogin() {
  document.getElementById('loginModal').style.display = 'flex';
  var errEl = document.getElementById('loginError');
  if (errEl) errEl.textContent = '';
}

function hideLogin() {
  document.getElementById('loginModal').style.display = 'none';
}
