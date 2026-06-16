// ==================== 工具函数模块 ====================

// 获取北京时间 Date 对象
// new Date() 返回的是本地时区时间，nowBJ() 返回的是北京时间
function nowBJ() {
  var now = new Date();
  // 计算北京时间 = UTC + 8 小时
  var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 8 * 3600000);
}

// 获取北京时间 ISO 字符串 (YYYY-MM-DDTHH:mm:ss.sssZ 格式，实际为北京时间)
function toBJISOString(date) {
  if (!date) date = nowBJ();
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  var h = String(date.getHours()).padStart(2, '0');
  var min = String(date.getMinutes()).padStart(2, '0');
  var s = String(date.getSeconds()).padStart(2, '0');
  var ms = String(date.getMilliseconds()).padStart(3, '0');
  return y + '-' + m + '-' + d + 'T' + h + ':' + min + ':' + s + '.' + ms + '+08:00';
}

// 获取当前北京日期字符串 YYYY-MM-DD
function currentDateBJ() {
  var d = nowBJ();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 计算两个时间之间的分钟差
function calcDuration(start, end) {
  if (!start || !end) return null;
  var sp = start.split(':').map(Number), ep = end.split(':').map(Number);
  var dur = (ep[0] * 60 + ep[1]) - (sp[0] * 60 + sp[1]);
  if (dur < 0) dur += 24 * 60;
  return dur;
}

// 分钟数格式化为小时显示：0 → "0"，非0 → "X.Xh"
function formatHours(minutes) {
  var h = minutes / 60;
  return h === 0 ? '0' : h.toFixed(1) + 'h';
}

// 时间字符串转分钟数
function timeToMinutes(t) {
  if (!t) return -1;
  var p = t.split(':').map(Number);
  return p[0] * 60 + p[1];
}

// 生成唯一 ID（UUID v4 前 15 位 hex → 10 进制，适合 int8/BIGINT 字段）
// crypto.randomUUID() 保证无碰撞；15 位 hex 最大值 0xFFFFFFFFFFFFFFF = 1.15 × 10¹⁸，
// PostgreSQL BIGINT 范围 -9.2 × 10¹⁸ ~ 9.2 × 10¹⁸，永远安全，无溢出风险。
function generateId() {
  var hex = crypto.randomUUID().replace(/-/g, '').slice(0, 15);
  return parseInt(hex, 16);
}

// HTML 转义
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// 下载文件（Blob）
function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

// 导出 JSON 数据
function exportJSON(data, filename) {
  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, filename);
}

// 获取某月的天数
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

// 格式化日期为 YYYY-MM-DD
function fmtDate(year, month, day) {
  return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

// 云端记录 → 本地记录映射（消除 cloud-sync.js 中 3 处重复）
function mapCloudRecord(row) {
  return {
    id: row.id,
    type: row.type,
    start: row.start_time || '',
    end: row.end_time || '',
    detail: row.detail || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// 单日统计计算（消除 renderMonthlySummary + excel-export 中重复）
// 返回 { milkCount, milkVolume, waterCount, fushiCount, napCount, longSleepCount,
//         sleepMinutes, playCount, playMinutes, waichuCount,
//         chouCount, niaoCount, zaoCount, xuexiMinutes, customCount }
function calcDayStats(records, knownTypes) {
  var cnt = function(t) { return records.filter(function(r){return r.type===t;}).length; };
  var sD = function(types) { return records.filter(function(r){return types.indexOf(r.type)>=0;}).reduce(function(s,r){return s+(calcDuration(r.start,r.end)||0);},0); };
  return {
    milkCount: cnt('喝奶'),
    milkVolume: records.filter(function(r){return r.type==='喝奶'}).reduce(function(s,r){return s+(parseFloat(r.detail)||0);},0),
    waterCount: cnt('喝水'),
    fushiCount: cnt('辅食'),
    napCount: cnt('小睡'),
    longSleepCount: cnt('长睡'),
    sleepMinutes: sD(['小睡','长睡']),
    playCount: cnt('玩耍'),
    playMinutes: sD(['玩耍','外出']),
    waichuCount: cnt('外出'),
    chouCount: cnt('拉臭臭'),
    niaoCount: cnt('换尿布'),
    zaoCount: cnt('洗澡'),
    xuexiMinutes: sD(['学习']),
    customCount: cnt('其他') + records.filter(function(r){return knownTypes.indexOf(r.type)<0;}).length
  };
}

// 按需动态加载 Excel 导出依赖（链式加载，缓存结果）
function loadXlsxModule(callback) {
  if (App._xlsxLoaded) { callback(); return; }

  // 防止重复加载时多次弹出错误提示
  if (App._xlsxLoading) return;
  App._xlsxLoading = true;

  var failed = false;
  function onError(step) {
    if (failed) return;
    failed = true;
    App._xlsxLoading = false;
    var msg = step === 'xlsx'
      ? 'SheetJS 库加载失败，请检查网络连接后刷新页面重试。'
      : '导出模块加载失败，请刷新页面后重试。';
    Logger.fatal(msg);
  }

  // 1) 加载 xlsx CDN
  var s1 = document.createElement('script');
  s1.src = 'https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js';
  s1.onload = function() {
    // 2) 加载 data-io.js
    var s2 = document.createElement('script');
    s2.src = '../lib/data-io.js';
    s2.onload = function() {
      // 3) 加载 excel-export.js
      var s3 = document.createElement('script');
      s3.src = '../lib/excel-export.js';
      s3.onload = function() {
        App._xlsxLoaded = true;
        App._xlsxLoading = false;
        callback();
      };
      s3.onerror = function() { onError('excel-export'); };
      document.head.appendChild(s3);
    };
    s2.onerror = function() { onError('data-io'); };
    document.head.appendChild(s2);
  };
  s1.onerror = function() { onError('xlsx'); };
  document.head.appendChild(s1);
}

// ==================== Service Worker 注册（PWA 离线支持） ====================
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(function(reg) {
      console.log('[PWA] SW 注册成功:', reg.scope);
    })
    .catch(function(err) {
      Logger.warn('PWA Service Worker 注册失败', err);
    });
}

// 静默刷新 token 定时器（不刷新页面）
// 每 25 分钟检查一次 token，在 Supabase access_token 1小时过期前静默刷新
// 配合 visibilitychange 事件，用户切回页面时也检查

function scheduleTokenRefresh() {
  // 清除旧定时器
  if (App._tokenRefreshTimer) clearInterval(App._tokenRefreshTimer);

  App._tokenRefreshTimer = setInterval(function() {
    silentTokenRefresh();
  }, App.CONFIG.TOKEN_REFRESH_INTERVAL_MS);
}

// 页面可见性变化时检查 token
function setupVisibilityListener() {
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') {
      silentTokenRefresh();
    }
  });
}

// 静默刷新 token，不影响页面状态
async function silentTokenRefresh() {
  if (!App.currentUser || !App.currentUser.refresh_token) return;
  try {
    // 先验证当前 token 是否有效
    var valid = await verifyAccessToken();
    if (valid) {
      // token 仍然有效，但更新 loginAt 防止 7 天后被误判过期
      _touchLoginAt();
      return;
    }

    // token 过期，尝试刷新
    var ok = await refreshAccessToken();
    if (ok) {
      updateSyncStatus('online');
    }
  } catch(e) {
    Logger.warn('Token 静默刷新失败', e);
  }
}

// 更新 loginAt 时间戳，防止长时间使用后 loginAt 过期导致被踢出
function _touchLoginAt() {
  if (!App.currentUser) return;
  try {
    App.currentUser.loginAt = Date.now();
    var meta = localStorage.getItem(App.USER_KEY);
    if (meta) {
      var info = JSON.parse(meta);
      info.loginAt = Date.now();
      localStorage.setItem(App.USER_KEY, JSON.stringify(info));
    }
  } catch(e) { /* ignore */ }
}


