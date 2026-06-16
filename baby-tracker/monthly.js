// ==================== 宝宝作息记录 - 月度汇总模块 ====================
// 依赖：lib/utils.js (calcDayStats), lib/storage.js (getDayData)
//       App.TYPES, App.summaryYear, App.summaryMonth, App.currentUser
//       lib/cloud-sync.js (loadMonthFromCloud)

// ==================== 月度汇总 ====================
function renderMonthlySummary() {
  document.getElementById('msTitle').textContent = App.summaryYear + '年' + App.summaryMonth + '月';
  var days = new Date(App.summaryYear, App.summaryMonth, 0).getDate();
  var knownTypes = TYPES.map(function(t){return t.id;});
  var cols = ['日期','喝奶次数','总奶量(ml)','喝水次数','辅食次数','小睡次数','长睡次数','总睡眠(分钟)','玩耍次数','总玩耍(分钟)','外出次数','拉臭臭次数','换尿布次数','洗澡次数','学习时间(分钟)','其他次数'];
  var colClasses = ['','col-milk','col-milk','col-milk','col-milk','col-sleep','col-sleep','col-sleep','col-play','col-play','col-play','col-xihu','col-xihu','col-xihu','col-xuexi','col-other'];

  var table = document.getElementById('msTable');
  var frag = document.createDocumentFragment();

  // thead
  var thead = document.createElement('thead');
  var trHead = document.createElement('tr');
  cols.forEach(function(h, i) {
    var th = document.createElement('th');
    th.className = colClasses[i] || '';
    th.textContent = h;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  frag.appendChild(thead);

  // tbody
  var tbody = document.createElement('tbody');
  var totals = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  var padMonth = ('0' + App.summaryMonth).slice(-2);

  for (var d = 1; d <= days; d++) {
    var ds = App.summaryYear + '-' + padMonth + '-' + ('0' + d).slice(-2);
    var recs = getDayData(ds);
    var s = calcDayStats(recs, knownTypes);
    var row = [d+'日', s.milkCount, s.milkVolume||'', s.waterCount, s.fushiCount, s.napCount, s.longSleepCount, s.sleepMinutes, s.playCount, s.playMinutes, s.waichuCount, s.chouCount, s.niaoCount, s.zaoCount, s.xuexiMinutes, s.customCount];
    totals[0]+=s.milkCount; totals[1]+=s.milkVolume; totals[2]+=s.waterCount; totals[3]+=s.fushiCount; totals[4]+=s.napCount; totals[5]+=s.longSleepCount; totals[6]+=s.sleepMinutes; totals[7]+=s.playCount; totals[8]+=s.playMinutes; totals[9]+=s.waichuCount; totals[10]+=s.chouCount; totals[11]+=s.niaoCount; totals[12]+=s.zaoCount; totals[13]+=s.xuexiMinutes; totals[14]+=s.customCount;

    var tr = document.createElement('tr');
    row.forEach(function(v) {
      var td = document.createElement('td');
      td.textContent = v || '';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }

  // 合计行
  var trTotal = document.createElement('tr');
  trTotal.className = 'row-total';
  (['📋 合计'].concat(totals)).forEach(function(v) {
    var td = document.createElement('td');
    td.textContent = v || '';
    trTotal.appendChild(td);
  });
  tbody.appendChild(trTotal);

  // 日均行
  var trAvg = document.createElement('tr');
  trAvg.className = 'row-avg';
  (['📐 日均'].concat(totals.map(function(v) { return (v / days).toFixed(1); }))).forEach(function(v) {
    var td = document.createElement('td');
    td.textContent = v;
    trAvg.appendChild(td);
  });
  tbody.appendChild(trAvg);

  frag.appendChild(tbody);

  // 原子替换：清空 + 一次性插入
  while (table.firstChild) table.removeChild(table.firstChild);
  table.appendChild(frag);
}

function changeSummaryMonth(delta) {
  App.summaryMonth += delta;
  if (App.summaryMonth > 12) { App.summaryMonth = 1; App.summaryYear++; }
  if (App.summaryMonth < 1) { App.summaryMonth = 12; App.summaryYear--; }
  renderMonthlySummary();
  if (App.currentUser) {
    loadMonthFromCloud(App.summaryYear, App.summaryMonth).then(function() {
      renderMonthlySummary();
    });
  }
}
