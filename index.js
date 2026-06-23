// ==================== 入口页面逻辑 ====================

// ==================== UI 状态 ====================
function setUserDisplay(email) {
  document.getElementById('userDisplay').textContent = '👤 ' + email;
  document.getElementById('headerLoginBtn').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'inline-block';
}

function clearUserDisplay() {
  document.getElementById('userDisplay').textContent = '📱 未登录';
  document.getElementById('headerLoginBtn').style.display = 'inline-block';
  document.getElementById('logoutBtn').style.display = 'none';
}

function updateSyncStatus(status) {
  var el = document.getElementById('userDisplay');
  if (el && App.currentUser) {
    el.textContent = '👤 ' + App.currentUser.email;
  }
}

// ==================== 登录成功回调 ====================
async function onLoginSuccess(user, session) {
  App.currentUser.loginAt = Date.now();
  await saveUserSecure(App.currentUser);
  // 设置快速路径标记，让跳转后的子页面（如 baby-tracker.html）可以走 _tryQuickPath 恢复会话，无需重新解密
  sessionStorage.setItem('bt_session_verified', String(Date.now()));
  sessionStorage.removeItem('bt_skip_login');
  hideLogin();
  updateSyncStatus('online');
  setUserDisplay(user.email || '用户');
}

// ==================== 跳过登录回调 ====================
function onLoginSkip() {
  App.currentUser = null;
  clearUserSecure();
  sessionStorage.setItem('bt_skip_login', '1');
  updateSyncStatus('offline');
  clearUserDisplay();
}



// ==================== data-action 事件绑定（替代 HTML onclick） ====================
function _bindActions() {
  var ACTIONS = {
    'login': showLogin,
    'logout': logout
  };
  document.querySelectorAll('[data-action]').forEach(function(el) {
    var action = el.dataset.action;
    var fn = ACTIONS[action];
    if (fn) { el.addEventListener('click', fn); }
  });
}

// ==================== 初始化 ====================
function init() {
  if (App._initCalled) return;
  App._initCalled = true;

  // 替换 data-action 为事件监听（替代 HTML onclick）
  _bindActions();

  // 初始化登录弹窗（兼容 iOS / 微信环境）
  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, {
    onSuccess: onLoginSuccess,
    onSkip: onLoginSkip
  });

  // 快速路径：优先用 sessionStorage 中的 token 恢复，不阻塞首屏渲染
  var quickResult = _tryQuickPath();
  if (quickResult && quickResult.success) {
    setUserDisplay(App.currentUser.email || '用户');
    updateSyncStatus('online');
    // 后台异步：加载 SDK + 完整恢复
    _backgroundInit();
    return;
  }

  // 无快速路径：仍然先渲染首屏，再后台加载 SDK 做完整恢复
  _backgroundInit();
}

// 后台异步初始化：加载 SDK + 恢复会话（不阻塞首屏）
// Token 刷新完全交由 SDK autoRefreshToken + onAuthStateChange 管理
function _backgroundInit() {
  setTimeout(function() {
    loadSupabaseSDK().then(function() {
      initSupabase();
      return restoreSession();
    }).then(function(sessionResult) {
      if (sessionResult && sessionResult.success) {
        if (!App._quickPathUsed) {
          setUserDisplay(App.currentUser.email || '用户');
          updateSyncStatus('online');
        }
        // index.html 只确认登录态，不需要订阅 Realtime
      } else {
        var reason = sessionResult ? sessionResult.reason : 'no_session';
        showLogin(reason === 'decrypt_failed' ? '安全升级，请重新登录' : '');
      }
      // index 页不需要 Realtime，不需要 setupVisibilityListener
    }).catch(function() {
      // SDK 加载失败：可能是离线或网络问题，静默处理
      showLogin('');
    });
  }, 0);
}

document.addEventListener('DOMContentLoaded', function() { init(); });
