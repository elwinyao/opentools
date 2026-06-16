// ==================== Excel 导出模块 ====================
// 依赖：app-namespace.js, storage.js (getDayData), utils.js (calcDuration, loadXlsxModule)
// 外部依赖：App.TYPES（类型定义）

function exportExcel() {
  var monthVal = document.getElementById('exportMonth').value;
  if (!monthVal) { alert('请选择导出月份'); return; }
  var parts = monthVal.split('-').map(Number), year = parts[0], month = parts[1];
  var daysInMonth = new Date(year, month, 0).getDate();
  var wb = XLSX.utils.book_new();

  // ---- Sheet 1: 每日记录 ----
  var rows1 = [['🍼 宝宝每日作息记录表','','','','','','','']];
  rows1.push(['记录月份：',monthVal,'','','📊 本月汇总','','','']);
  rows1.push(['日期','类型','开始时间','结束时间','时长(分钟)','奶量/详情','备注','✅']);

  var knownTypes = TYPES.map(function(t){return t.id;});
  for (var d = 1; d <= daysInMonth; d++) {
    var ds = fmtDate(year, month, d);
    var dayRecords = getDayData(ds);
    var bt = {};
    TYPES.forEach(function(t){ bt[t.id]=[]; });
    bt['__custom__'] = [];
    dayRecords.forEach(function(r){
      if (bt[r.type]) bt[r.type].push(r);
      else bt['__custom__'].push(r);
    });
    TYPES.forEach(function(t) {
      var recs = bt[t.id];
      if (!recs.length) { rows1.push([ds, t.id, '', '', '', '', '', '']); }
      else recs.forEach(function(r, idx) {
        var dur = calcDuration(r.start, r.end);
        rows1.push([idx===0?ds:'', r.type, r.start||'', r.end||'', dur!==null?dur:'', r.detail||'', '', '']);
      });
    });
    bt['__custom__'].forEach(function(r, idx) {
      var dur = calcDuration(r.start, r.end);
      rows1.push([idx===0?ds:'', r.type, r.start||'', r.end||'', dur!==null?dur:'', r.detail||'', '', '']);
    });
  }

  var ws1 = XLSX.utils.aoa_to_sheet(rows1);
  ws1['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:7} }];
  ws1['!cols'] = [{wch:14},{wch:10},{wch:12},{wch:12},{wch:14},{wch:16},{wch:28},{wch:6}];
  XLSX.utils.book_append_sheet(wb, ws1, '每日记录');

  // ---- Sheet 2: 统计汇总 ----
  var rows2 = [['📊 月度统计汇总','','','','','','','','','','','','','']];
  rows2.push([]);
  rows2.push(['日期','喝奶次数','总喝奶量(ml)','喝水次数','辅食次数','小睡次数','长睡次数','总睡眠(分钟)','玩耍次数','总玩耍(分钟)','外出次数','拉臭臭次数','换尿布次数','洗澡次数','学习时间(分钟)','其他次数']);

  var tl = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  for (var d2 = 1; d2 <= daysInMonth; d2++) {
    var ds2 = fmtDate(year, month, d2);
    var rcs = getDayData(ds2);
    var s = calcDayStats(rcs, knownTypes);
    rows2.push([ds2, s.milkCount, s.milkVolume||'', s.waterCount, s.fushiCount, s.napCount, s.longSleepCount, s.sleepMinutes, s.playCount, s.playMinutes, s.waichuCount, s.chouCount, s.niaoCount, s.zaoCount, s.xuexiMinutes, s.customCount]);
    tl[0]+=s.milkCount; tl[1]+=s.milkVolume; tl[2]+=s.waterCount; tl[3]+=s.fushiCount; tl[4]+=s.napCount; tl[5]+=s.longSleepCount; tl[6]+=s.sleepMinutes; tl[7]+=s.playCount; tl[8]+=s.playMinutes; tl[9]+=s.waichuCount; tl[10]+=s.chouCount; tl[11]+=s.niaoCount; tl[12]+=s.zaoCount; tl[13]+=s.xuexiMinutes; tl[14]+=s.customCount;
  }

  rows2.push(['📋 本月合计'].concat(tl));
  rows2.push(['📐 日均'].concat(tl.map(function(v){return (v/daysInMonth).toFixed(1);})));

  var ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:15} }];
  ws2['!cols'] = [{wch:14},{wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, '统计汇总');

  XLSX.writeFile(wb, '宝宝作息记录_' + monthVal + '.xlsx');
}
