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
    if (!r || !r.id) return;

    // DELETE 事件：Supabase 默认 REPLICA IDENTITY 只返回主键，需用 old_record 或遍历查找 record_date
    if (evt.eventType === 'DELETE') {
      var delDate = r.record_date || (evt.old_record && evt.old_record.record_date);
      if (!delDate) {
        // record_date 缺失，遍历所有日期查找该记录
        Object.keys(App.allData).forEach(function(d) {
          var before = App.allData[d].length;
          App.allData[d] = App.allData[d].filter(function(x) { return x.id !== r.id; });
          if (App.allData[d].length === 0) delete App.allData[d];
          if (before !== (App.allData[d] ? App.allData[d].length : 0)) {
            delDate = d;
            if (d === App.currentDate && App.currentTab === 'daily') needRenderDaily = true;
            if (App.currentTab === 'monthly') {
              var p2 = d.split('-').map(Number);
              if (p2[0] === App.summaryYear && p2[1] === App.summaryMonth) needRenderMonthly = true;
            }
          }
        });
        return; // 已在上方处理渲染标记
      }
      if (App.allData[delDate]) {
        App.allData[delDate] = App.allData[delDate].filter(function(x) { return x.id !== r.id; });
        if (App.allData[delDate].length === 0) delete App.allData[delDate];
      }
      if (delDate === App.currentDate && App.currentTab === 'daily') needRenderDaily = true;
      if (App.currentTab === 'monthly') {
        var dp = delDate.split('-').map(Number);
        if (dp[0] === App.summaryYear && dp[1] === App.summaryMonth) needRenderMonthly = true;
      }
      return;
    }

    // INSERT / UPDATE
    if (!r.record_date) return;
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
