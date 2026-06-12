// ==================== 用户认证模块 ====================
// 依赖：supabase-config.js, supabase-client.js
// 外部依赖：USER_KEY（localStorage key）, currentUser（全局变量）
// 需外部提供：updateSyncStatus(), setUserDisplay(), clearUserDisplay(), onLoginSuccess()

// 从 localStorage 恢复会话
function restoreSession() {
  var saved = localStorage.getItem(USER_KEY);
  if (saved) {
    try {
      var userInfo = JSON.parse(saved);
      // 检查登录态是否过期（7天）
      if (userInfo.loginAt) {
        var now = Date.now();
        var sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (now - userInfo.loginAt > sevenDays) {
          localStorage.removeItem(USER_KEY);
          return false;
        }
      }
      currentUser = userInfo;
      updateSyncStatus('online');
      setUserDisplay(userInfo.email || '用户');
      return true;
    } catch(e) {
      localStorage.removeItem(USER_KEY);
    }
  }
  return false;
}

// 使用 refresh_token 刷新 access_token
async function refreshAccessToken() {
  if (!currentUser || !currentUser.refresh_token) return false;
  try {
    var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: currentUser.refresh_token })
    });
    var data = await res.json();
    if (!res.ok || !data.access_token) return false;
    currentUser.access_token = data.access_token;
    currentUser.refresh_token = data.refresh_token;
    currentUser.loginAt = Date.now();
    localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
    return true;
  } catch(e) {
    return false;
  }
}

// 验证当前 access_token 是否仍然有效
async function verifyAccessToken() {
  if (!currentUser || !currentUser.access_token) return false;
  try {
    var res = await fetch(SUPABASE_URL + '/auth/v1/user', {
      method: 'GET',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': 'Bearer ' + currentUser.access_token
      }
    });
    if (!res.ok) return false;
    return true;
  } catch(e) {
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
    var res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (!res.ok) {
      var errMsg = data.error_description || data.msg || data.error || '登录失败，请检查邮箱和密码';
      if (errMsg.indexOf('Email not confirmed') >= 0) {
        errMsg = '邮箱未确认，请检查收件箱中的确认邮件';
      }
      throw new Error(errMsg);
    }
    currentUser = {
      id: data.user.id,
      email: data.user.email,
      access_token: data.access_token,
      refresh_token: data.refresh_token
    };
    onLoginSuccess(data.user, { access_token: data.access_token });
  } catch(e) {
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
    var res = await fetch(SUPABASE_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email, password: password })
    });
    var data = await res.json();
    if (!res.ok) {
      var errMsg = data.msg || data.message || '注册失败';
      throw new Error(errMsg);
    }
    if (data.access_token) {
      currentUser = {
        id: data.user.id,
        email: data.user.email,
        access_token: data.access_token,
        refresh_token: data.refresh_token
      };
      onLoginSuccess(data.user, { access_token: data.access_token });
    } else {
      errorEl.textContent = '注册成功！请检查邮箱确认链接后再登录。';
    }
  } catch(e) {
    errorEl.textContent = '注册失败：' + e.message;
  }
}

// 跳过登录
function skipLogin() {
  currentUser = null;
  localStorage.removeItem(USER_KEY);
  hideLogin();
  updateSyncStatus('offline');
  clearUserDisplay();
}

// 退出登录
async function logout() {
  if (!confirm('确定退出登录？本地数据不会丢失。')) return;
  await supabaseFetch('/auth/v1/logout', { method: 'POST' });
  currentUser = null;
  localStorage.removeItem(USER_KEY);
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
