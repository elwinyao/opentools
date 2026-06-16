// ==================== 登录弹窗模块（兼容 iOS / 微信内置浏览器） ====================
// 用法：页面中放置 <div id="loginModalContainer"></div>
// 通过回调通信：
//   App._onLoginSuccess(user, session)
//   App._onLoginSkip()
// 保留兼容旧的 Web Component 用法（通过 customElements 注册）

var LoginModalManager = (function() {
  var _container = null;
  var _callbacks = null;

  function init(containerEl, callbacks) {
    _container = containerEl;
    _callbacks = callbacks || {};
    _container.innerHTML =
      '<div class="modal-overlay" id="loginModal" style="display:none">' +
        '<div class="modal-box">' +
          '<h2>🍼 欢迎使用</h2>' +
          '<div class="modal-sub" id="loginSub"></div>' +
          '<input type="email" id="loginEmail" placeholder="邮箱地址" autocomplete="email">' +
          '<input type="password" id="loginPassword" placeholder="密码（至少6位）" autocomplete="current-password">' +
          '<div class="modal-error" id="loginError"></div>' +
          '<button type="button" class="btn-block btn-login" id="modalLoginBtn">🔑 登录</button>' +
          '<button type="button" class="btn-block btn-signup" id="signupBtn">✨ 注册新账号</button>' +
          '<div class="modal-divider">或</div>' +
          '<button type="button" class="btn-block btn-skip" id="skipBtn">📱 仅本设备使用（不同步）</button>' +
        '</div>' +
      '</div>';

    // 设置子标题
    var sub = _container.getAttribute('data-sub');
    var subEl = _container.querySelector('#loginSub');
    if (sub && subEl) subEl.textContent = sub;

    // 事件绑定
    _container.querySelector('#modalLoginBtn').addEventListener('click', _handleLogin);
    _container.querySelector('#signupBtn').addEventListener('click', _handleSignup);
    _container.querySelector('#skipBtn').addEventListener('click', _handleSkip);
  }

  function show(message) {
    var overlay = document.getElementById('loginModal');
    if (!overlay) return;
    overlay.style.display = 'flex';
    var errEl = document.getElementById('loginError');
    if (errEl) {
      errEl.textContent = message || '';
      errEl.style.color = message ? '#E6A817' : '#e74c3c';
    }
  }

  function hide() {
    var overlay = document.getElementById('loginModal');
    if (overlay) overlay.style.display = 'none';
  }

  async function _handleLogin() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errorEl = document.getElementById('loginError');
    if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; errorEl.style.color = '#e74c3c'; return; }
    errorEl.textContent = '';

    try {
      await loadSupabaseSDK();
      initSupabase();
      var result = await App.sbClient.auth.signInWithPassword({ email: email, password: password });
      if (result.error) { errorEl.textContent = '登录失败：' + result.error.message; errorEl.style.color = '#e74c3c'; return; }
      var user = result.data.user;
      var session = result.data.session;
      App.currentUser = {
        id: user.id,
        email: user.email,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        loginAt: Date.now()
      };
      if (_callbacks.onSuccess) _callbacks.onSuccess(user, session);
    } catch(e) {
      Logger.error('登录失败', e);
      errorEl.textContent = '登录失败：' + e.message;
      errorEl.style.color = '#e74c3c';
    }
  }

  async function _handleSignup() {
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errorEl = document.getElementById('loginError');
    if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; errorEl.style.color = '#e74c3c'; return; }
    if (password.length < 6) { errorEl.textContent = '密码至少6位'; errorEl.style.color = '#e74c3c'; return; }
    errorEl.textContent = '';

    try {
      await loadSupabaseSDK();
      initSupabase();
      var result = await App.sbClient.auth.signUp({ email: email, password: password });
      if (result.error) { errorEl.textContent = '注册失败：' + result.error.message; errorEl.style.color = '#e74c3c'; return; }
      var user = result.data.user;
      var session = result.data.session;
      if (user && session) {
        App.currentUser = {
          id: user.id,
          email: user.email,
          access_token: session.access_token,
          refresh_token: session.refresh_token,
          loginAt: Date.now()
        };
        if (_callbacks.onSuccess) _callbacks.onSuccess(user, session);
      } else {
        errorEl.textContent = '注册成功！请前往邮箱确认后登录。';
        errorEl.style.color = '#70AD47';
      }
    } catch(e) {
      Logger.error('注册失败', e);
      errorEl.textContent = '注册失败：' + e.message;
      errorEl.style.color = '#e74c3c';
    }
  }

  function _handleSkip() {
    hide();
    sessionStorage.setItem('bt_skip_login', '1');
    if (_callbacks.onSkip) _callbacks.onSkip();
  }

  return { init: init, show: show, hide: hide };
})();

// ==================== 兼容旧的 Web Component 用法 ====================
// 如果浏览器支持 Custom Elements 且页面中有 <login-modal> 标签，则注册为降级方案
// 延迟到 DOM 解析完成后执行，避免阻塞脚本加载
if (typeof customElements !== 'undefined' && typeof HTMLElement !== 'undefined') {
  (function _registerLoginModalEl() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _registerLoginModalEl);
      return;
    }
    try {
      var LoginModalEl = function() { return Reflect.construct(HTMLElement, [], LoginModalEl); };
      LoginModalEl.prototype = Object.create(HTMLElement.prototype);
      LoginModalEl.prototype.constructor = LoginModalEl;
      LoginModalEl.prototype.connectedCallback = function() {
        LoginModalManager.init(this, {
          onSuccess: function(user, session) {
            this.dispatchEvent(new CustomEvent('login-success', { detail: { user: user, session: session } }));
          }.bind(this),
          onSkip: function() {
            this.dispatchEvent(new Event('login-skip'));
          }.bind(this)
        });
      };
      LoginModalEl.prototype.show = function(message) { LoginModalManager.show(message); };
      LoginModalEl.prototype.hide = function() { LoginModalManager.hide(); };
      customElements.define('login-modal', LoginModalEl);
    } catch(e) {
      // 微信环境或其他不支持 Custom Elements 的环境，忽略
    }
  })();
}
