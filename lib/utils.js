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

// 按需动态加载 Excel 导出依赖（链式加载，缓存结果）
var _xlsxLoaded = false;
function loadXlsxModule(callback) {
  if (_xlsxLoaded) { callback(); return; }
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
        _xlsxLoaded = true;
        callback();
      };
      document.head.appendChild(s3);
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

// 每间隔30分钟静默刷新页面（支持跳出再进入场景）
// 间隔设为30分钟，在 Supabase access_token 1小时过期前刷新，确保 token 刷新成功
function scheduleHourlyRefresh(key) {
  key = key || 'global_last_refresh';
  var interval = 30 * 60 * 1000; // 30分钟
  var now = Date.now();
  var last = localStorage.getItem(key);
  if (!last) {
    localStorage.setItem(key, now);
    setTimeout(function() { localStorage.setItem(key, Date.now()); location.reload(); }, interval);
    return;
  }
  var elapsed = now - parseInt(last);
  if (elapsed >= interval) {
    localStorage.setItem(key, now);
    location.reload();
    return;
  }
  setTimeout(function() { localStorage.setItem(key, Date.now()); location.reload(); }, interval - elapsed);
}


