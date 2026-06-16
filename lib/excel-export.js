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
    var cnt = function(t){return rcs.filter(function(r){return r.type===t;}).length;};
    var sD = function(types){return rcs.filter(function(r){return types.indexOf(r.type)>=0;}).reduce(function(s,r){return s+(calcDuration(r.start,r.end)||0);},0);};
    var mc=cnt('喝奶'), mv=rcs.filter(function(r){return r.type==='喝奶'}).reduce(function(s,r){return s+(parseFloat(r.detail)||0);},0);
    var wc=cnt('喝水'), fc=cnt('辅食'), nc=cnt('小睡'), lc=cnt('长睡'), pc=cnt('玩耍');
    var chouC=cnt('拉臭臭'), niaoC=cnt('换尿布'), zaoC=cnt('洗澡');
    var waichuC=cnt('外出'), xuexiM=sD(['学习']);
    var cc=cnt('其他')+rcs.filter(function(r){return knownTypes.indexOf(r.type)<0;}).length;
    var sm=sD(['小睡','长睡']), pm=sD(['玩耍','外出']);
    rows2.push([ds2,mc,mv||'',wc,fc,nc,lc,sm,pc,pm,waichuC,chouC,niaoC,zaoC,xuexiM,cc]);
    tl[0]+=mc; tl[1]+=mv; tl[2]+=wc; tl[3]+=fc; tl[4]+=nc; tl[5]+=lc; tl[6]+=sm; tl[7]+=pc; tl[8]+=pm; tl[9]+=waichuC; tl[10]+=chouC; tl[11]+=niaoC; tl[12]+=zaoC; tl[13]+=xuexiM; tl[14]+=cc;
  }

  rows2.push(['📋 本月合计'].concat(tl));
  rows2.push(['📐 日均'].concat(tl.map(function(v){return (v/daysInMonth).toFixed(1);})));

  var ws2 = XLSX.utils.aoa_to_sheet(rows2);
  ws2['!merges'] = [{ s:{r:0,c:0}, e:{r:0,c:15} }];
  ws2['!cols'] = [{wch:14},{wch:12},{wch:14},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:12},{wch:16},{wch:16}];
  XLSX.utils.book_append_sheet(wb, ws2, '统计汇总');

  XLSX.writeFile(wb, '宝宝作息记录_' + monthVal + '.xlsx');
}
