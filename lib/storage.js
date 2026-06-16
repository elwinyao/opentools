// ==================== 本地存储模块 ====================
// 依赖：app-namespace.js（App.STORAGE_KEY, App.allData）

function loadData() {
  try {
    App.allData = JSON.parse(localStorage.getItem(App.STORAGE_KEY) || '{}');
  } catch(e) {
    App.allData = {};
  }
}

function saveData() {
  localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.allData));
}

function getDayData(date) {
  return App.allData[date] || [];
}
