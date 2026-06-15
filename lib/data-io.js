// ==================== 数据导入/导出模块 ====================
// 依赖：storage.js (allData, saveData, getDayData), utils.js
// 外部依赖：currentUser, updateSyncStatus(), syncRecordToCloud(), renderRecords(), renderSummary()

// 导出数据为 JSON 文件
function exportData() {
  exportJSON(allData, '宝宝作息数据_' + currentDateBJ() + '.json');
}

// 从 JSON 文件导入数据
async function importData(event) {
  var file = event.target.files[0];
  if (!file) return;
  if (!confirm('导入将替换当前所有数据，确定继续？')) { event.target.value = ''; return; }
  var reader = new FileReader();
  reader.onload = async function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (typeof data !== 'object' || Array.isArray(data)) throw new Error('fmt');
      allData = data;
      saveData();
      renderRecords();
      renderSummary();

      // 如果已登录，批量同步到云端
      if (typeof currentUser !== 'undefined' && currentUser) {
        updateSyncStatus('syncing');
        var dates = Object.keys(data);
        var totalRecords = 0;
        for (var i = 0; i < dates.length; i++) {
          var d = dates[i];
          var recs = data[d];
          for (var j = 0; j < recs.length; j++) {
            await syncRecordToCloud(recs[j], d);
            totalRecords++;
          }
        }
        updateSyncStatus('online');
        alert('✅ 数据导入成功！共 ' + dates.length + ' 天 ' + totalRecords + ' 条记录，已同步到云端');
      } else {
        alert('✅ 数据导入成功！共 ' + Object.keys(data).length + ' 天记录（仅本地）');
      }
    } catch(ex) {
      alert('❌ 文件格式不正确，请选择导出的 .json 文件');
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}
