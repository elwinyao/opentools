// ==================== 本地存储模块 ====================
// 依赖：app-namespace.js（App.STORAGE_KEY, App.allData）

function loadData() {
  try {
    App.allData = JSON.parse(localStorage.getItem(App.STORAGE_KEY) || '{}');
  } catch(e) {
    App.allData = {};
  }
}

// 防抖写入：使用微任务 + 延时双保险，确保移动端可靠落盘。
// 原因：requestIdleCallback 在手机端 PWA/WebView 中调度不可靠，
// 页面可能长时间不进入 idle 状态（如微信内置浏览器持续有 touch 事件），
// 导致 saveData 被延迟数秒甚至永远不执行，造成数据不一致。
// 策略：微任务立即写入 + 延时兜底（合并短时间多次调用）。
function saveData() {
  if (App._saveIdleId != null) {
    clearTimeout(App._saveIdleId);
  }
  // 用 setTimeout(0) 合并同一事件循环内的多次 saveData 调用
  // 同时比 requestIdleCallback 可靠得多，移动端也不会丢失
  App._saveIdleId = setTimeout(_doSave, 0);
}

function flushSave() {
  if (App._saveIdleId != null) {
    clearTimeout(App._saveIdleId);
    App._saveIdleId = null;
  }
  _doSave();
}

function _doSave() {
  App._saveIdleId = null;
  try {
    localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.allData));
  } catch(e) {
    Logger.warn('localStorage 写入失败', e);
  }
}

function getDayData(date) {
  return App.allData[date] || [];
}
