// ==================== 工具函数模块 ====================

// 计算两个时间之间的分钟差
function calcDuration(start, end) {
  if (!start || !end) return null;
  var sp = start.split(':').map(Number), ep = end.split(':').map(Number);
  var dur = (ep[0] * 60 + ep[1]) - (sp[0] * 60 + sp[1]);
  if (dur < 0) dur += 24 * 60;
  return dur;
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
