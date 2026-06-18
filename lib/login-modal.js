// ==================== 登录弹窗模块（兼容 iOS / 微信内置浏览器） ====================
// 用法：页面中放置 <div id="loginModalContainer"></div>
// 通过回调通信：
//   App._onLoginSuccess(user, session)
//   App._onLoginSkip()

var LoginModalManager = (function() {
  var _container = null;
  var _callbacks = null;

  function init(containerEl, callbacks) {
    _container = containerEl;
    _callbacks = callbacks || {};

    // 构建登录弹窗 DOM
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'loginModal';
    overlay.style.display = 'none';

    var box = document.createElement('div');
    box.className = 'modal-box';

    var h2 = document.createElement('h2');
    h2.textContent = '🍼 欢迎使用';

    var sub = document.createElement('div');
    sub.className = 'modal-sub';
    sub.id = 'loginSub';

    var emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'loginEmail';
    emailInput.placeholder = '邮箱地址';
    emailInput.autocomplete = 'email';

    var passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.id = 'loginPassword';
    passwordInput.placeholder = '密码（至少6位）';
    passwordInput.autocomplete = 'current-password';

    var errorDiv = document.createElement('div');
    errorDiv.className = 'modal-error';
    errorDiv.id = 'loginError';

    var loginBtn = document.createElement('button');
    loginBtn.type = 'button';
    loginBtn.className = 'btn-block btn-login';
    loginBtn.id = 'modalLoginBtn';
    loginBtn.textContent = '🔑 登录';

    var signupBtn = document.createElement('button');
    signupBtn.type = 'button';
    signupBtn.className = 'btn-block btn-signup';
    signupBtn.id = 'signupBtn';
    signupBtn.textContent = '✨ 注册新账号';

    var divider = document.createElement('div');
    divider.className = 'modal-divider';
    divider.textContent = '或';

    var skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'btn-block btn-skip';
    skipBtn.id = 'skipBtn';
    skipBtn.textContent = '📱 仅本设备使用（不同步）';

    box.appendChild(h2);
    box.appendChild(sub);
    box.appendChild(emailInput);
    box.appendChild(passwordInput);
    box.appendChild(errorDiv);
    box.appendChild(loginBtn);
    box.appendChild(signupBtn);
    box.appendChild(divider);
    box.appendChild(skipBtn);
    overlay.appendChild(box);
    _container.appendChild(overlay);

    // 设置子标题
    var subText = _container.getAttribute('data-sub');
    var subEl = _container.querySelector('#loginSub');
    if (subText && subEl) subEl.textContent = subText;

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
