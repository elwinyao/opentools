// ==================== 宝宝作息记录 - 初始化 + 回调 + Tab 切换 + 导出 ====================
// 依赖：lib/* (所有公共库)
//       render.js, monthly.js, records.js, realtime.js
//       App 命名空间

// ==================== 页面专属变量（挂载到 App 命名空间） ====================
App.TYPES = [
  { id: '喝奶',   icon: '🍼', css: 'he',   category: 'he' },
  { id: '喝水',   icon: '💧', css: 'he',   category: 'he' },
  { id: '辅食',   icon: '🥣', css: 'he',   category: 'he' },
  { id: '小睡',   icon: '😴', css: 'shui', category: 'shui' },
  { id: '长睡',   icon: '🛏️', css: 'shui', category: 'shui' },
  { id: '玩耍',   icon: '🎯', css: 'wan',  category: 'wan' },
  { id: '外出',   icon: '🌳', css: 'wan',  category: 'wan' },
  { id: '拉臭臭', icon: '💩', css: 'xihu', category: 'xihu' },
  { id: '换尿布', icon: '🩲', css: 'xihu', category: 'xihu' },
  { id: '洗澡',   icon: '🛁', css: 'xihu', category: 'xihu' },
  { id: '学习',   icon: '📖', css: 'xuexi', category: 'xuexi' },
  { id: '其他',   icon: '📌', css: 'zidingyi', category: 'zidingyi' },
];

App.currentDate = currentDateBJ();
App.selectedType = '喝奶';
App.customTypeText = '';
App.currentTab = 'daily';
App.summaryYear = undefined;
App.summaryMonth = undefined;
App.syncStatus = 'offline';
App.activeFilter = ''; // 时间轴分类筛选：'' 表示全部

// 本地引用别名，减少 App. 前缀重复（可选优化）
var TYPES = App.TYPES;

// 构建 O(1) 类型查找索引，避免 renderRecords / renderTimeline / startEdit 中的 forEach 查找
var typeMap = {};
TYPES.forEach(function(t) { typeMap[t.id] = t; });

// ==================== UI 状态更新（供 auth 模块回调） ====================
function setUserDisplay(email) {
  document.getElementById('monthDisplayText').textContent = '👤 ' + email;
  document.getElementById('loginLink').style.display = 'none';
  document.getElementById('logoutLink').style.display = 'inline-block';
  document.getElementById('refreshBtn').style.display = 'inline-block';
}

function clearUserDisplay() {
  document.getElementById('monthDisplayText').textContent = '📱 仅本设备';
  document.getElementById('loginLink').style.display = 'inline-block';
  document.getElementById('logoutLink').style.display = 'none';
  document.getElementById('refreshBtn').style.display = 'none';
}

function updateSyncStatus(status) {
  App.syncStatus = status;
  var dot = document.querySelector('.sync-dot');
  var text = document.getElementById('syncText');
  var realtimeOk = App._realtimeStatus === 'connected';
  if (status === 'online' && realtimeOk) {
    dot.className = 'sync-dot online';
    text.textContent = '已同步';
  } else if (status === 'online' && !realtimeOk) {
    dot.className = 'sync-dot realtime-off';
    text.textContent = '已同步(WS断开)';
  } else if (status === 'syncing') {
    dot.className = 'sync-dot syncing';
    text.textContent = '同步中...';
  } else {
    dot.className = 'sync-dot offline';
    text.textContent = App.currentUser ? '离线' : '未登录';
  }
}

// ==================== 登录成功回调 ====================
async function onLoginSuccess(user, session) {
  App.currentUser.loginAt = Date.now();
  await saveUserSecure(App.currentUser);
  // 设置快速路径标记，刷新页面或从其他页面跳转时可直接走 _tryQuickPath 恢复会话
  sessionStorage.setItem('bt_session_verified', String(Date.now()));
  sessionStorage.removeItem('bt_skip_login');
  hideLogin();
  updateSyncStatus('online');
  setUserDisplay(user.email || '用户');
  // 初始化 Realtime 订阅
  subscribeRealtime(handleRealtimeChange);
  initRealtimeChannel();
  loadDayFromCloud(App.currentDate).then(function() {
    renderRecords();
    renderSummary();
  }).catch(function(e) {
    Logger.warn('登录后加载云端数据失败，使用本地数据', e);
    renderRecords();
    renderSummary();
  });
}

// ==================== 刷新数据（仅当前日期） ====================
async function refreshData() {
  if (!App.currentUser) return;
  updateSyncStatus('syncing');
  try {
    // Supabase SDK 已配置 autoRefreshToken: true，会自动处理 token 刷新
    // 无需额外调用 verifyAccessToken/refreshAccessToken，避免 iPhone 上多次网络往返失败
    await loadDayFromCloud(App.currentDate);
    updateSyncStatus('online');
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    App._lastDataRefresh = Date.now();
  } catch(e) {
    Logger.warn('刷新数据失败，使用本地数据', e);
    // 网络瞬断不降级为离线：只有原本就是离线状态才保持
    // 手机端 WiFi/4G 切换、iOS WKWebView 限制等因素容易导致单次请求失败
    // 如果之前是 online，说明只是本次请求失败，保留 online 不误导用户
    if (App.syncStatus === 'offline') {
      updateSyncStatus('offline');
    }
    // 其他情况（online/syncing）：保持当前状态不变
  }
  // 无论云端加载成功与否，都渲染本地数据
  renderRecords();
  renderSummary();
}

// ==================== Tab 切换 ====================
var _monthlyModuleLoaded = false;

var _flushedOnExit = false;
function flushSaveOnExit() {
  if (_flushedOnExit) return;
  _flushedOnExit = true;
  flushSave();
}

function switchTab(tab) {
  App.currentTab = tab;
  document.getElementById('tabDaily').className = tab==='daily'?'active':'';
  document.getElementById('tabMonthly').className = tab==='monthly'?'active':'';
  document.getElementById('dailyView').className = tab==='daily'?'daily-view':'daily-view hidden';
  document.getElementById('monthlyView').className = tab==='monthly'?'monthly-view active':'monthly-view';
  if (tab === 'monthly') {
    // 按需加载 monthly.js 模块
    if (!_monthlyModuleLoaded) {
      _loadMonthlyModule(function() {
        _renderMonthlyTab();
      });
    } else {
      _renderMonthlyTab();
    }
  }
}

function _loadMonthlyModule(callback) {
  if (_monthlyModuleLoaded) { callback(); return; }
  var s = document.createElement('script');
  s.src = 'monthly.js';
  s.onload = function() {
    _monthlyModuleLoaded = true;
    callback();
  };
  s.onerror = function() {
    Logger.error('月度汇总模块加载失败');
  };
  document.head.appendChild(s);
}

function _renderMonthlyTab() {
  // 先展示本地数据，再异步从云端拉取当月数据
  renderMonthlySummary();
  if (App.currentUser) {
    loadMonthFromCloud(App.summaryYear, App.summaryMonth).then(function() {
      renderMonthlySummary();
    });
  }
}

// ==================== data-action 事件绑定（替代 HTML onclick） ====================
function _bindActions() {
  var ACTIONS = {
    'login': showLogin,
    'logout': logout,
    'tab-daily': function() { switchTab('daily'); },
    'tab-monthly': function() { switchTab('monthly'); },
    'prev-date': function() { changeDate(-1); },
    'next-date': function() { changeDate(1); },
    'refresh': refreshData,
    'add-record': addRecord,
    'export-excel': exportExcelLazy,
    'export-data': exportDataLazy,
    'import-file': function() { document.getElementById('importFile').click(); },
    'clear-day': clearDay,
    'prev-month': function() { changeSummaryMonth(-1); },
    'next-month': function() { changeSummaryMonth(1); }
  };
  // timeline legend 筛选按钮（6 个）
  var FILTER_CATS = { 'filter-he': 'he', 'filter-shui': 'shui', 'filter-wan': 'wan', 'filter-xihu': 'xihu', 'filter-xuexi': 'xuexi', 'filter-zidingyi': 'zidingyi' };
  Object.keys(FILTER_CATS).forEach(function(key) {
    ACTIONS[key] = function(e) { toggleFilter(FILTER_CATS[key], e.currentTarget); };
  });

  document.querySelectorAll('[data-action]').forEach(function(el) {
    var action = el.dataset.action;
    var fn = ACTIONS[action];
    if (fn) { el.addEventListener('click', fn); }
  });

  // import file input onchange
  var importFile = document.getElementById('importFile');
  if (importFile) { importFile.addEventListener('change', function(e) { importDataLazy(e); }); }
}

// ==================== 初始化 ====================
async function init() {
  if (App._initCalled) return;
  App._initCalled = true;

  // 注册 Service Worker（PWA 离线支持）
  registerSW();

  // 替换所有 data-action 为事件监听（替代 HTML onclick）
  _bindActions();

  // 初始化登录弹窗（兼容 iOS / 微信环境）
  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, {
    onSuccess: function(user, session) { onLoginSuccess(user, session); },
    onSkip: function() { skipLogin(); }
  });

  await loadSupabaseSDK();
  initSupabase();

  // 立即渲染 UI 框架 + 读取本地数据（不等待会话恢复）
  renderTypeGrid();
  document.getElementById('exportMonth').value = App.currentDate.slice(0, 7);
  var p = App.currentDate.split('-').map(Number);
  App.summaryYear = p[0]; App.summaryMonth = p[1];
  loadData(); // 立即读本地数据，不等待网络/加密
  setDate(App.currentDate, false); // 先用本地数据渲染，让页面立即可见

  // 并行执行：恢复会话（耗时操作）
  var sessionResult = await restoreSession();

  if (sessionResult.success) {
    // 已登录：更新 UI 状态 + 初始化 Realtime + 后台刷新
    setUserDisplay(App.currentUser.email || '用户');
    updateSyncStatus('online');
    // 快速路径也要加载云端数据（token 有效不代表数据最新），非快速路径后台验证
    setTimeout(function() {
      subscribeRealtime(handleRealtimeChange);
      initRealtimeChannel();
      refreshTokenAndCloud();
    }, 0);
  } else {
    // 未登录：更新 UI + 弹窗
    updateSyncStatus('offline');
    clearUserDisplay();
    if (!sessionStorage.getItem('bt_skip_login')) {
      setTimeout(function() {
        showLogin(sessionResult.reason === 'decrypt_failed' ? '安全升级，请重新登录' : '');
      }, 0);
    }
  }

  startSyncQueueProcessor();

  // 时间轴"现在"线每分钟自动移动（页面隐藏时暂停，节省 CPU）
  var _timelineTimer = null;
  function _startTimelineTimer() {
    if (_timelineTimer) return;
    _timelineTimer = setInterval(function() { _updateNowLine(false); }, App.CONFIG.TIMELINE_UPDATE_INTERVAL_MS);
  }
  function _stopTimelineTimer() {
    if (_timelineTimer) { clearInterval(_timelineTimer); _timelineTimer = null; }
  }
  _startTimelineTimer();

  // 注册数据刷新回调：common-bundle 的 _autoRefreshDataIfStale() 拉取云端数据后，
  // 通过此回调通知本页面渲染 UI
  App._onDataRefreshed = function() {
    renderRecords();
    renderSummary();
  };

  // 页面可见性变化时控制定时器 + 立即刷新位置
  // 数据过期刷新 & Realtime 重连由 common-bundle.js 的 setupVisibilityListener() 统一处理
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      _updateNowLine(false);
      _startTimelineTimer();
    } else {
      _stopTimelineTimer();
    }
  });

  // 页面可见性监听（数据过期刷新 & Realtime 重连由 common-bundle.js 的 setupVisibilityListener() 统一处理）
  setupVisibilityListener();

  // 页面卸载前确保防抖写入落盘
  window.addEventListener('beforeunload', flushSaveOnExit);
  window.addEventListener('pagehide', flushSaveOnExit);
}

// 后台异步刷新 token + 云端数据（stale-while-revalidate）
// 后台加载云端数据（Token 刷新完全交由 SDK autoRefreshToken + onAuthStateChange 管理）
async function refreshTokenAndCloud() {
  try {
    try { await loadDayFromCloud(App.currentDate); } catch(e) { Logger.warn('后台刷新云端数据失败', e); }
    updateSyncStatus('online');
    App._lastDataRefresh = Date.now();
    // 云端数据到达后刷新 UI
    renderRecords();
    renderSummary();
  } catch(e) {
    Logger.warn('后台刷新云端数据失败', e);
    updateSyncStatus('offline');
  }
}

// ==================== 按需加载 Excel 导出模块 ====================
// loadXlsxModule() 定义在 lib/utils.js 中
// 包装导出函数，确保模块已加载
async function exportExcelLazy() {
  // 先确保从 Supabase 拉取当月最新数据
  if (App.currentUser) {
    var monthVal = document.getElementById('exportMonth').value;
    if (monthVal) {
      var parts = monthVal.split('-').map(Number);
      updateSyncStatus('syncing');
      try {
        await loadMonthFromCloud(parts[0], parts[1]);
        updateSyncStatus('online');
      } catch(e) {
        Logger.warn('导出前加载当月云端数据失败', e);
        updateSyncStatus('offline');
      }
    }
  }
  loadXlsxModule(function() {
    exportExcel();
  });
}
function exportDataLazy() {
  loadXlsxModule(function() {
    exportData();
  });
}
function importDataLazy(event) {
  loadXlsxModule(function() {
    importData(event);
  });
}

document.addEventListener('DOMContentLoaded', function() { init(); });
