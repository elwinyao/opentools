// ==================== 宝宝作息记录 - 渲染模块 ====================
// 依赖：lib/utils.js (calcDayStats, formatHours, timeToMinutes, escapeHtml, currentDateBJ, nowBJ)
//       lib/storage.js (getDayData)
//       App.TYPES, App.currentDate, App.activeFilter, App.currentTab, App.summaryYear, App.summaryMonth

// "其他"分类筛选：排除五大预置分类（吃喝/睡眠/玩耍/洗护/学习），覆盖自定义类型
function _matchFilter(recordType, filterCat) {
  if (filterCat === 'zidingyi') {
    var t = typeMap[recordType];
    return !t || !App.CONFIG.ZIDINGYI_EXCLUDE[t.category];
  }
  var t2 = typeMap[recordType];
  return t2 && t2.category === filterCat;
}

// ==================== 渲染记录列表 ====================
function renderRecords() {
  var records = getDayData(App.currentDate);
  var container = document.getElementById('recordList');

  // 按分类筛选
  var filtered = records;
  if (App.activeFilter) {
    filtered = records.filter(function(r) {
      return _matchFilter(r.type, App.activeFilter);
    });
  }

  document.getElementById('todayStats').textContent = '共 ' + records.length + ' 条' + (App.activeFilter ? '（筛选 ' + filtered.length + ' 条）' : '');

  // 清空容器
  while (container.firstChild) container.removeChild(container.firstChild);

  if (filtered.length === 0) {
    var emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    var emojiDiv = document.createElement('div'); emojiDiv.className = 'emoji'; emojiDiv.textContent = '📭';
    var msgDiv = document.createElement('div'); msgDiv.textContent = App.activeFilter ? '该分类暂无记录' : '今天还没有记录';
    emptyDiv.appendChild(emojiDiv); emptyDiv.appendChild(msgDiv);
    container.appendChild(emptyDiv);
    return;
  }

  var frag = document.createDocumentFragment();
  filtered.forEach(function(r) {
    var t = typeMap[r.type];
    if (!t) t = { id: escapeHtml(r.type), icon: '📌', css: 'zidingyi', category: 'zidingyi' };
    else t = { id: escapeHtml(t.id), icon: t.icon, css: t.css, category: t.category };
    var dur = calcDuration(r.start, r.end);
    var durText = dur !== null ? dur + '分钟' : '';
    var timeText = escapeHtml(r.end ? r.start + ' - ' + r.end : r.start);
    var detailText = escapeHtml([r.detail, durText].filter(Boolean).join(' · '));

    var item = document.createElement('div');
    item.className = 'record-item ' + t.css;
    item.id = 'rec-' + r.id;

    var icon = document.createElement('div');
    icon.className = 'record-icon';
    icon.textContent = t.icon;

    var info = document.createElement('div');
    info.className = 'record-info';

    var typeDiv = document.createElement('div');
    typeDiv.className = 'record-type';
    typeDiv.textContent = t.id;

    var timeDiv = document.createElement('div');
    timeDiv.className = 'record-time';
    timeDiv.textContent = timeText;

    info.appendChild(typeDiv);
    info.appendChild(timeDiv);

    if (detailText) {
      var detailDiv = document.createElement('div');
      detailDiv.className = 'record-detail';
      detailDiv.textContent = detailText;
      info.appendChild(detailDiv);
    }

    var editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✎';
    editBtn.onclick = (function(id) { return function() { startEdit(id); }; })(r.id);

    var delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '✕';
    delBtn.onclick = (function(id) { return function() { deleteRecord(id); }; })(r.id);

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(editBtn);
    item.appendChild(delBtn);
    frag.appendChild(item);
  });

  container.appendChild(frag);
}

// ==================== 当日概览 ====================
function renderSummary() {
  var records = getDayData(App.currentDate);
  var knownTypes = TYPES.map(function(t){return t.id;});
  var s = calcDayStats(records, knownTypes);
  var container = document.getElementById('summaryBar');

  // 清空容器
  while (container.firstChild) container.removeChild(container.firstChild);

  var items = [
    { val: s.milkCount,         label: '🍼 喝奶次数', cls: 's-milk' },
    { val: s.milkVolume === 0 ? '0' : s.milkVolume + 'ml', label: '🥛 总奶量', cls: 's-milk' },
    { val: formatHours(s.sleepMinutes), label: '😴 睡眠时长', cls: 's-sleep' },
    { val: formatHours(s.playMinutes),  label: '🎯 玩耍时长', cls: 's-play' },
    { val: s.chouCount,         label: '💩 拉臭臭次数', cls: 's-xihu' },
    { val: s.zaoCount,          label: '🛁 洗澡次数', cls: 's-xihu' },
    { val: formatHours(s.xuexiMinutes), label: '📖 学习时长', cls: 's-xuexi' },
    { val: (s.customCount + s.fushiCount), label: '📌 其他', cls: '', customColor: '#909399' }
  ];

  var frag = document.createDocumentFragment();
  items.forEach(function(item) {
    var div = document.createElement('div');
    div.className = 'summary-item';

    var valDiv = document.createElement('div');
    valDiv.className = 's-val';
    if (item.cls) valDiv.classList.add(item.cls);
    if (item.customColor) valDiv.style.color = item.customColor;
    valDiv.textContent = item.val;

    var labelDiv = document.createElement('div');
    labelDiv.className = 's-label';
    labelDiv.textContent = item.label;

    div.appendChild(valDiv);
    div.appendChild(labelDiv);
    frag.appendChild(div);
  });
  container.appendChild(frag);

  renderTimeline(records);
}

// ==================== 时间轴进度条 ====================
function renderTimeline(records) {
  var bar = document.getElementById('timelineBar');
  var nowLine = document.getElementById('timelineNow');
  var totalMin = 24 * 60;

  if (App.currentDate === currentDateBJ()) {
    nowLine.style.display = 'block';
    var now = nowBJ();
    var nowMin = now.getHours() * 60 + now.getMinutes();
    var nowPct = (nowMin / totalMin) * 100;
    nowLine.style.left = nowPct + '%';
  } else {
    nowLine.style.display = 'none';
  }

  var oldSegs = bar.querySelectorAll('.timeline-segment');
  oldSegs.forEach(function(s) { s.remove(); });

  // 按分类筛选
  var filtered = records;
  if (App.activeFilter) {
    filtered = records.filter(function(r) {
      return _matchFilter(r.type, App.activeFilter);
    });
  }

  if (filtered.length === 0) return;

  var items = [];
  filtered.forEach(function(r) {
    var sm = timeToMinutes(r.start);
    if (sm < 0) return;
    var em = r.end ? timeToMinutes(r.end) : sm;
    if (em < sm) em += totalMin;
    var t = typeMap[r.type];
    if (!t) t = { id: escapeHtml(r.type), icon: '📌', css: 'zidingyi', category: 'zidingyi' };
    else t = { id: escapeHtml(t.id), icon: t.icon, css: t.css, category: t.category };
    items.push({ startMin: sm, endMin: em, css: t.css, label: t.icon + ' ' + t.id });
  });
  if (items.length === 0) return;

  items.sort(function(a, b) { return a.startMin - b.startMin; });
  items.forEach(function(item) {
    var leftPct = (item.startMin / totalMin) * 100;
    var widthPct = ((item.endMin - item.startMin) / totalMin) * 100;
    if (widthPct < 0.5) widthPct = 0.5;
    var seg = document.createElement('div');
    seg.className = 'timeline-segment ' + item.css;
    seg.style.left = leftPct + '%';
    seg.style.width = widthPct + '%';
    seg.title = item.label;
    if (widthPct > 3) { var labelSpan = document.createElement('span'); labelSpan.className = 'seg-label'; labelSpan.textContent = item.label; seg.appendChild(labelSpan); }
    bar.appendChild(seg);
  });
}

// ==================== 时间轴分类筛选 ====================
function toggleFilter(cat, el) {
  if (App.activeFilter === cat) {
    // 取消筛选
    App.activeFilter = '';
    el.classList.remove('dimmed');
    // 恢复全部图例
    var legends = document.querySelectorAll('#timelineLegend span');
    legends.forEach(function(s) { s.classList.remove('dimmed'); });
  } else {
    // 选中该分类，其他变暗
    App.activeFilter = cat;
    var legends = document.querySelectorAll('#timelineLegend span');
    legends.forEach(function(s) { s.classList.toggle('dimmed', s.dataset.cat !== cat); });
  }
  renderRecords();
  renderSummary();
}

// 更新时间轴"现在"刻度线位置（北京时间）
function updateTimelineNow() {
  var nowLine = document.getElementById('timelineNow');
  if (!nowLine) return;
  // 只在每日记录页（不是月度汇总）且是今天时才显示"现在"线
  if (App.currentTab !== 'daily') return;
  if (App.currentDate !== currentDateBJ()) {
    nowLine.style.display = 'none';
    return;
  }
  nowLine.style.display = 'block';
  var now = nowBJ();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var nowPct = (nowMin / (24 * 60)) * 100;
  nowLine.style.left = nowPct + '%';
}
