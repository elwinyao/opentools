// ==================== 宝宝作息记录 - Realtime 变更处理 ====================
// 依赖：lib/utils.js (mapCloudRecord), lib/storage.js (saveData)
//       render.js (renderRecords, renderSummary), monthly.js (renderMonthlySummary)
//       App.allData, App.currentDate, App.currentTab, App.summaryYear, App.summaryMonth

// ==================== Realtime 变更处理器 ====================
// 收到 WebSocket 推送的 INSERT / UPDATE / DELETE 事件后，智能合并到本地数据
function handleRealtimeChange(changes) {
  if (!changes || changes.length === 0) return;
  var needRenderDaily = false;
  var needRenderMonthly = false;

  changes.forEach(function(evt) {
    var r = evt.record;
    if (!r || !r.record_date) return;
    var dateStr = r.record_date;

    if (evt.eventType === 'INSERT' || evt.eventType === 'UPDATE') {
      var newRec = mapCloudRecord(r);
      if (!App.allData[dateStr]) App.allData[dateStr] = [];

      // 查找是否已存在（去重）
      var idx = -1;
      for (var i = 0; i < App.allData[dateStr].length; i++) {
        if (App.allData[dateStr][i].id === newRec.id) { idx = i; break; }
      }
      if (idx >= 0) {
        // 已存在，比较 updatedAt，云端版本更新才覆盖
        var localTime = App.allData[dateStr][idx].updatedAt ? new Date(App.allData[dateStr][idx].updatedAt).getTime() : 0;
        var cloudTime = newRec.updatedAt ? new Date(newRec.updatedAt).getTime() : 0;
        if (cloudTime > localTime) App.allData[dateStr][idx] = newRec;
      } else {
        App.allData[dateStr].push(newRec);
      }
      App.allData[dateStr].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
    } else if (evt.eventType === 'DELETE') {
      // 记录删除
      if (App.allData[dateStr]) {
        App.allData[dateStr] = App.allData[dateStr].filter(function(x) { return x.id !== r.id; });
        if (App.allData[dateStr].length === 0) delete App.allData[dateStr];
      }
    }

    // 判断是否需要刷新当前 UI
    if (dateStr === App.currentDate && App.currentTab === 'daily') {
      needRenderDaily = true;
    }
    if (App.currentTab === 'monthly') {
      var p = dateStr.split('-').map(Number);
      if (p[0] === App.summaryYear && p[1] === App.summaryMonth) {
        needRenderMonthly = true;
      }
    }
  });

  // 持久化并刷新 UI
  saveData();
  if (needRenderDaily) {
    renderRecords();
    renderSummary();
  }
  if (needRenderMonthly) {
    renderMonthlySummary();
  }
}
