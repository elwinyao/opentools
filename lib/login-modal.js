// ==================== 登录弹窗 Web Component ====================
// 用法：<login-modal></login-modal>
// 通过事件通信：
//   - login-success: { user, session }
//   - login-skip: 用户跳过登录

class LoginModal extends HTMLElement {
  connectedCallback() {
    this.innerHTML =
      '<div class="modal-overlay" id="loginModal" style="display:none">' +
        '<div class="modal-box">' +
          '<h2>🍼 欢迎使用</h2>' +
          '<div class="modal-sub" id="loginSub"></div>' +
          '<input type="email" id="loginEmail" placeholder="邮箱地址">' +
          '<input type="password" id="loginPassword" placeholder="密码（至少6位）">' +
          '<div class="modal-error" id="loginError"></div>' +
          '<button class="btn-block btn-login" id="loginBtn">🔑 登录</button>' +
          '<button class="btn-block btn-signup" id="signupBtn">✨ 注册新账号</button>' +
          '<div class="modal-divider">或</div>' +
          '<button class="btn-block btn-skip" id="skipBtn">📱 仅本设备使用（不同步）</button>' +
        '</div>' +
      '</div>';

    // 设置子标题（不同页面可自定义）
    var sub = this.getAttribute('sub');
    if (sub) this.querySelector('#loginSub').textContent = sub;

    // 事件绑定
    this.querySelector('#loginBtn').addEventListener('click', this._handleLogin.bind(this));
    this.querySelector('#signupBtn').addEventListener('click', this._handleSignup.bind(this));
    this.querySelector('#skipBtn').addEventListener('click', this._handleSkip.bind(this));
  }

  // --- 公开方法 ---
  show(message) {
    this.querySelector('#loginModal').style.display = 'flex';
    var errEl = this.querySelector('#loginError');
    if (errEl) {
      errEl.textContent = message || '';
      errEl.style.color = message ? '#E6A817' : '#e74c3c';
    }
  }

  hide() {
    this.querySelector('#loginModal').style.display = 'none';
  }

  // --- 内部处理 ---
  async _handleLogin() {
    var email = this.querySelector('#loginEmail').value.trim();
    var password = this.querySelector('#loginPassword').value;
    var errorEl = this.querySelector('#loginError');
    if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; errorEl.style.color = '#e74c3c'; return; }
    errorEl.textContent = '';

    try {
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
      this.dispatchEvent(new CustomEvent('login-success', { detail: { user: user, session: session } }));
    } catch(e) {
      Logger.error('登录失败', e);
      errorEl.textContent = '登录失败：' + e.message;
      errorEl.style.color = '#e74c3c';
    }
  }

  async _handleSignup() {
    var email = this.querySelector('#loginEmail').value.trim();
    var password = this.querySelector('#loginPassword').value;
    var errorEl = this.querySelector('#loginError');
    if (!email || !password) { errorEl.textContent = '请填写邮箱和密码'; errorEl.style.color = '#e74c3c'; return; }
    if (password.length < 6) { errorEl.textContent = '密码至少6位'; errorEl.style.color = '#e74c3c'; return; }
    errorEl.textContent = '';

    try {
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
        this.dispatchEvent(new CustomEvent('login-success', { detail: { user: user, session: session } }));
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

  _handleSkip() {
    this.hide();
    sessionStorage.setItem('bt_skip_login', '1');
    this.dispatchEvent(new Event('login-skip'));
  }
}

customElements.define('login-modal', LoginModal);
