// ==================== 本地存储模块 ====================
// 外部依赖：STORAGE_KEY（localStorage key）, allData（全局变量）

function loadData() {
  try {
    allData = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch(e) {
    allData = {};
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
}

function getDayData(date) {
  return allData[date] || [];
}
