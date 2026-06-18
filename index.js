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
    if (status === 'online') el.textContent = '👤 ' + App.currentUser.email;
    else if (status === 'syncing') el.textContent = '⏳ 同步中...';
    else el.textContent = '👤 ' + App.currentUser.email + ' (离线)';
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
  // 初始化 Realtime 订阅（为 baby-tracker 子页面预连接）
  subscribeRealtime(function() {});
  initRealtimeChannel();
}

// ==================== 跳过登录回调 ====================
function onLoginSkip() {
  App.currentUser = null;
  clearUserSecure();
  sessionStorage.setItem('bt_skip_login', '1');
  updateSyncStatus('offline');
  clearUserDisplay();
}

// ==================== Realtime 空处理器（index 页不直接展示数据） ====================
function handleRealtimeChange() {}

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
async function init() {
  if (App._initCalled) return;
  App._initCalled = true;

  // 注册 Service Worker（PWA 离线支持）—— 异步不阻塞
  registerSW();

  // 替换 data-action 为事件监听（替代 HTML onclick）
  _bindActions();

  // 初始化登录弹窗（兼容 iOS / 微信环境）
  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, {
    onSuccess: onLoginSuccess,
    onSkip: onLoginSkip
  });

  await loadSupabaseSDK();
  initSupabase();

  // 会话恢复是核心路径，必须等待完成
  var sessionResult = await restoreSession();
  if (sessionResult.success) {
    setUserDisplay(App.currentUser.email || '用户');
    updateSyncStatus('online');

    // 快速路径也要验证 token（JWT 可能 1 小时已过期），非快速路径后台验证
    setTimeout(function() {
      refreshAccessToken().then(function(refreshed) {
        if (refreshed) { updateSyncStatus('online'); return; }
        // refresh 失败，尝试用当前 access_token 验证
        return verifyAccessToken().then(function(tokenValid) {
          if (tokenValid) { updateSyncStatus('online'); return; }
          // token 完全失效，清除登录态
          Logger.warn('Token 已失效，请重新登录');
          App.currentUser = null;
          clearUserSecure();
          sessionStorage.removeItem('bt_session_verified');
          updateSyncStatus('offline');
          clearUserDisplay();
          showLogin('登录已过期，请重新登录');
        });
      }).catch(function(e) {
        Logger.warn('初始化时 Token 验证异常', e);
        updateSyncStatus('offline');
      });
      // Realtime 放到后台初始化
      subscribeRealtime(function() {});
      initRealtimeChannel();
    }, 0);
  } else {
    // 登录弹窗延迟显示，避免阻塞首屏
    setTimeout(function() {
      showLogin(sessionResult.reason === 'decrypt_failed' ? '安全升级，请重新登录' : '');
    }, 0);
  }

  // 静默刷新 token 定时器 + 页面可见性监听
  scheduleTokenRefresh();
  setupVisibilityListener();
}

document.addEventListener('DOMContentLoaded', function() { init(); });
