// ==================== 本地存储模块 ====================
// 依赖：app-namespace.js（App.STORAGE_KEY, App.allData）

function loadData() {
  try {
    App.allData = JSON.parse(localStorage.getItem(App.STORAGE_KEY) || '{}');
  } catch(e) {
    App.allData = {};
  }
}

// 防抖写入：requestIdleCallback 在浏览器空闲时执行，不阻塞渲染/交互。
// 短时间内多次 saveData() 合并为一次 localStorage.setItem。
// 不支持 requestIdleCallback 时降级为 setTimeout(fn, 300)。
// flushSave() 立即落盘，用于 beforeunload/pagehide 等关键时机。
function saveData() {
  if (App._saveIdleId != null) {
    if (cancelIdleCallback) {
      cancelIdleCallback(App._saveIdleId);
    } else {
      clearTimeout(App._saveIdleId);
    }
  }
  App._saveIdleId = requestIdleCallback
    ? requestIdleCallback(_doSave, { timeout: 1000 })
    : setTimeout(_doSave, 300);
}

function flushSave() {
  if (App._saveIdleId != null) {
    if (cancelIdleCallback) {
      cancelIdleCallback(App._saveIdleId);
    } else {
      clearTimeout(App._saveIdleId);
    }
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
