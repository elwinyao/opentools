// ==================== baby-tracker page-bundle.js ====================
// 自动合并：render.js + records.js + realtime.js + init.js
// 生成时间：2026-06-16
// 依赖：lib/common-bundle.js（需在此之前加载）

// ==== render.js ====
function _resolveType(recordType) {
  var t = typeMap[recordType];
  if (!t) return { id: escapeHtml(recordType), icon: '📌', css: 'zidingyi', category: 'zidingyi' };
  return { id: escapeHtml(t.id), icon: t.icon, css: t.css, category: t.category };
}

function renderRecords() {
  var records = getDayData(App.currentDate);
  var container = document.getElementById('recordList');
  var filtered = records;
  if (App.activeFilter) {
    filtered = records.filter(function(r) { return _matchFilter(r.type, App.activeFilter); });
  }
  document.getElementById('todayStats').textContent = '共 ' + records.length + ' 条' + (App.activeFilter ? '（筛选 ' + filtered.length + ' 条）' : '');
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
    var t = _resolveType(r.type);
    var dur = calcDuration(r.start, r.end);
    var durText = dur !== null ? dur + '分钟' : '';
    var timeText = escapeHtml(r.end ? r.start + ' - ' + r.end : r.start);
    var detailText = escapeHtml([r.detail, durText].filter(Boolean).join(' · '));
    var item = document.createElement('div');
    item.className = 'record-item ' + t.css;
    item.id = 'rec-' + r.id;
    var icon = document.createElement('div'); icon.className = 'record-icon'; icon.textContent = t.icon;
    var info = document.createElement('div'); info.className = 'record-info';
    var typeDiv = document.createElement('div'); typeDiv.className = 'record-type'; typeDiv.textContent = t.id;
    var timeDiv = document.createElement('div'); timeDiv.className = 'record-time'; timeDiv.textContent = timeText;
    info.appendChild(typeDiv); info.appendChild(timeDiv);
    if (detailText) { var detailDiv = document.createElement('div'); detailDiv.className = 'record-detail'; detailDiv.textContent = detailText; info.appendChild(detailDiv); }
    var editBtn = document.createElement('button'); editBtn.className = 'edit-btn'; editBtn.textContent = '✎'; editBtn.addEventListener('click', (function(id) { return function() { startEdit(id); }; })(r.id));
    var delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.textContent = '✕'; delBtn.addEventListener('click', (function(id) { return function() { deleteRecord(id); }; })(r.id));
    item.appendChild(icon); item.appendChild(info); item.appendChild(editBtn); item.appendChild(delBtn);
    frag.appendChild(item);
  });
  container.appendChild(frag);
}

function renderSummary() {
  var records = getDayData(App.currentDate);
  var knownTypes = TYPES.map(function(t){return t.id;});
  var s = calcDayStats(records, knownTypes);
  var container = document.getElementById('summaryBar');
  while (container.firstChild) container.removeChild(container.firstChild);
  var items = [
    { val: s.milkCount, label: '🍼 喝奶次数', cls: 's-milk' },
    { val: s.milkVolume === 0 ? '0' : s.milkVolume + 'ml', label: '🥛 总奶量', cls: 's-milk' },
    { val: formatHours(s.sleepMinutes), label: '😴 睡眠时长', cls: 's-sleep' },
    { val: formatHours(s.playMinutes), label: '🎯 玩耍时长', cls: 's-play' },
    { val: s.chouCount, label: '💩 拉臭臭次数', cls: 's-xihu' },
    { val: s.zaoCount, label: '🛁 洗澡次数', cls: 's-xihu' },
    { val: formatHours(s.xuexiMinutes), label: '📖 学习时长', cls: 's-xuexi' },
    { val: (s.customCount + s.fushiCount), label: '📌 其他', cls: '', customColor: '#909399' }
  ];
  var frag = document.createDocumentFragment();
  items.forEach(function(item) {
    var div = document.createElement('div'); div.className = 'summary-item';
    var valDiv = document.createElement('div'); valDiv.className = 's-val'; if (item.cls) valDiv.classList.add(item.cls); if (item.customColor) valDiv.style.color = item.customColor; valDiv.textContent = item.val;
    var labelDiv = document.createElement('div'); labelDiv.className = 's-label'; labelDiv.textContent = item.label;
    div.appendChild(valDiv); div.appendChild(labelDiv); frag.appendChild(div);
  });
  container.appendChild(frag);
  renderTimeline(records);
}

function renderTimeline(records) {
  var bar = document.getElementById('timelineBar');
  var nowLine = document.getElementById('timelineNow');
  var totalMin = 24 * 60;
  _updateNowLine(true);
  var oldSegs = bar.querySelectorAll('.timeline-segment'); oldSegs.forEach(function(s) { s.remove(); });
  var filtered = records;
  if (App.activeFilter) { filtered = records.filter(function(r) { return _matchFilter(r.type, App.activeFilter); }); }
  if (filtered.length === 0) return;
  var items = [];
  filtered.forEach(function(r) {
    var sm = timeToMinutes(r.start); if (sm < 0) return;
    var em = r.end ? timeToMinutes(r.end) : sm; if (em < sm) em += totalMin;
    var t = _resolveType(r.type);
    items.push({ startMin: sm, endMin: em, css: t.css, label: t.icon + ' ' + t.id });
  });
  if (items.length === 0) return;
  items.sort(function(a, b) { return a.startMin - b.startMin; });
  items.forEach(function(item) {
    var leftPct = (item.startMin / totalMin) * 100;
    var widthPct = ((item.endMin - item.startMin) / totalMin) * 100;
    if (widthPct < 0.5) widthPct = 0.5;
    var seg = document.createElement('div'); seg.className = 'timeline-segment ' + item.css; seg.style.left = leftPct + '%'; seg.style.width = widthPct + '%'; seg.title = item.label;
    if (widthPct > 3) { var labelSpan = document.createElement('span'); labelSpan.className = 'seg-label'; labelSpan.textContent = item.label; seg.appendChild(labelSpan); }
    bar.appendChild(seg);
  });
}

function toggleFilter(cat, el) {
  if (App.activeFilter === cat) { App.activeFilter = ''; el.classList.remove('dimmed'); var legends = document.querySelectorAll('#timelineLegend span'); legends.forEach(function(s) { s.classList.remove('dimmed'); }); }
  else { App.activeFilter = cat; var legends = document.querySelectorAll('#timelineLegend span'); legends.forEach(function(s) { s.classList.toggle('dimmed', s.dataset.cat !== cat); }); }
  renderRecords(); renderSummary();
}

function _updateNowLine(skipTransition) {
  var nowLine = document.getElementById('timelineNow');
  if (!nowLine) return;
  if (App.currentTab !== 'daily' || App.currentDate !== currentDateBJ()) { nowLine.style.display = 'none'; return; }
  nowLine.style.display = 'block';
  if (skipTransition) { nowLine.style.transition = 'none'; }
  var now = nowBJ(); var nowMin = now.getHours() * 60 + now.getMinutes();
  nowLine.style.left = ((nowMin / 1440) * 100) + '%';
  if (skipTransition) { nowLine.offsetHeight; nowLine.style.transition = ''; }
}

// ==== records.js ====
function renderTypeGrid() {
  var grid = document.getElementById('typeGrid');
  while (grid.firstChild) grid.removeChild(grid.firstChild);
  var frag = document.createDocumentFragment();
  TYPES.forEach(function(t) {
    var btn = document.createElement('button');
    btn.className = 'type-btn ' + t.css + (App.selectedType === t.id ? ' active' : '');
    btn.textContent = t.icon + ' ' + t.id;
    btn.addEventListener('click', function() { selectType(t.id); });
    frag.appendChild(btn);
  });
  grid.appendChild(frag);
}

function selectType(id) {
  App.selectedType = id; App.customTypeText = ''; renderTypeGrid();
  var el = document.getElementById('detail'); var customRow = document.getElementById('customTypeRow'); var customInput = document.getElementById('customTypeInput');
  if (id === '喝奶' || id === '喝水' || id === '辅食') { el.inputMode = 'decimal'; if (id === '喝奶') el.placeholder = '奶量(ml)'; else if (id === '喝水') el.placeholder = '水量(ml)'; else el.placeholder = '辅食量(g/ml)'; customRow.style.display = 'none'; }
  else if (id === '其他') { el.inputMode = 'text'; el.placeholder = '备注'; customRow.style.display = 'flex'; customInput.value = ''; }
  else { el.inputMode = 'text'; el.placeholder = '备注'; customRow.style.display = 'none'; }
}

function addDays(dateStr, n) { var p = dateStr.split('-').map(Number); var d = new Date(p[0], p[1]-1, p[2] + n); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }

function setDate(dateStr, skipCloud) {
  App.currentDate = dateStr;
  if (App.activeFilter) { App.activeFilter = ''; var legends = document.querySelectorAll('#timelineLegend span'); legends.forEach(function(s) { s.classList.remove('dimmed'); }); }
  var d = new Date(dateStr + 'T00:00:00'); var weekdays = ['日','一','二','三','四','五','六'];
  document.getElementById('dateText').textContent = (d.getMonth()+1) + '月' + d.getDate() + '日';
  document.getElementById('dateSub').textContent = '星期' + weekdays[d.getDay()];
  renderRecords(); renderSummary();
  if (App.currentUser && !skipCloud) { loadDayFromCloud(dateStr).then(function() { renderRecords(); renderSummary(); }).catch(function(e) { Logger.warn('切换日期加载云端数据失败', e); }); }
}

function changeDate(delta) { var p = App.currentDate.split('-').map(Number); var d = new Date(p[0], p[1]-1, p[2]+delta); setDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')); }

async function addRecord() {
  var start = document.getElementById('startTime').value;
  var end = document.getElementById('endTime').value;
  var detail = document.getElementById('detail').value.trim();
  if (!start) { Logger.info('表单校验：开始时间为空'); alert('请填写开始时间'); return; }
  var recordType = App.selectedType;
  if (App.selectedType === '其他') { var customVal = document.getElementById('customTypeInput').value.trim(); recordType = customVal || '其他'; }
  var crossMidnight = end && end !== '00:00' && end < start;
  if (crossMidnight) {
    var nextDate = addDays(App.currentDate, 1);
    var record1 = { id: generateId(), type: recordType, start: start, end: '24:00', detail: detail, createdAt: toBJISOString() };
    var record2 = { id: generateId(), type: recordType, start: '00:00', end: end, detail: detail, createdAt: toBJISOString() };
    if (!App.allData[App.currentDate]) App.allData[App.currentDate] = [];
    App.allData[App.currentDate].push(record1); App.allData[App.currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    if (!App.allData[nextDate]) App.allData[nextDate] = [];
    App.allData[nextDate].push(record2); App.allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    flushSave(); renderRecords(); renderSummary(); startSyncQueueProcessor(); syncRecordToCloud(record1, App.currentDate); syncRecordToCloud(record2, nextDate);
  } else {
    var record = { id: generateId(), type: recordType, start: start, end: end, detail: detail, createdAt: toBJISOString() };
    if (!App.allData[App.currentDate]) App.allData[App.currentDate] = [];
    App.allData[App.currentDate].push(record); App.allData[App.currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    flushSave(); renderRecords(); renderSummary(); startSyncQueueProcessor(); syncRecordToCloud(record, App.currentDate);
  }
  document.getElementById('startTime').value = ''; document.getElementById('endTime').value = ''; document.getElementById('detail').value = ''; document.getElementById('customTypeInput').value = '';
}

async function deleteRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  App.allData[App.currentDate] = (App.allData[App.currentDate]||[]).filter(function(r) { return r.id !== id; });
  flushSave(); renderRecords(); renderSummary(); startSyncQueueProcessor(); await deleteRecordFromCloud(id);
}

async function clearDay() {
  if (!confirm('确定清空 ' + App.currentDate + ' 的所有记录吗？')) return;
  delete App.allData[App.currentDate]; flushSave(); renderRecords(); renderSummary(); startSyncQueueProcessor(); await deleteDayFromCloud(App.currentDate);
}

function startEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var t = _resolveType(r.type);
  var el = document.getElementById('rec-' + id); if (!el) return;
  el.classList.add('editing');
  while (el.firstChild) el.removeChild(el.firstChild);
  r._origEnd = r.end;
  var editEnd = r.end === '24:00' ? '23:59' : r.end;
  var isFeeding = r.type === '喝奶' || r.type === '喝水' || r.type === '辅食';
  var icon = document.createElement('div'); icon.className = 'record-icon'; icon.textContent = t.icon;
  var info = document.createElement('div'); info.className = 'record-info';
  var typeDiv = document.createElement('div'); typeDiv.className = 'record-type'; typeDiv.textContent = t.id;
  var timeDiv = document.createElement('div'); timeDiv.className = 'record-time'; timeDiv.textContent = '编辑中...';
  info.appendChild(typeDiv); info.appendChild(timeDiv);
  var editRow = document.createElement('div'); editRow.className = 'record-edit-row';
  var timeRow = document.createElement('div'); timeRow.className = 'record-edit-time-row';
  var labelStart = document.createElement('label'); labelStart.textContent = '开始：';
  var inpStart = document.createElement('input'); inpStart.type = 'time'; inpStart.id = 'edit-start-' + id; inpStart.value = r.start; inpStart.step = '60';
  var labelEnd = document.createElement('label'); labelEnd.textContent = '结束：';
  var inpEnd = document.createElement('input'); inpEnd.type = 'time'; inpEnd.id = 'edit-end-' + id; inpEnd.value = editEnd; inpEnd.step = '60';
  timeRow.appendChild(labelStart); timeRow.appendChild(inpStart); timeRow.appendChild(labelEnd); timeRow.appendChild(inpEnd);
  var noteRow = document.createElement('div'); noteRow.className = 'record-edit-note-row';
  var labelNote = document.createElement('label'); labelNote.textContent = '备注：';
  var inpDetail = document.createElement('input'); inpDetail.type = 'text'; inpDetail.id = 'edit-detail-' + id; inpDetail.value = r.detail || ''; inpDetail.placeholder = isFeeding ? '数量' : '备注'; inpDetail.inputMode = isFeeding ? 'decimal' : 'text';
  noteRow.appendChild(labelNote); noteRow.appendChild(inpDetail);
  var btnsRow = document.createElement('div'); btnsRow.className = 'record-edit-btns';
  var saveBtn = document.createElement('button'); saveBtn.className = 'save-edit-btn'; saveBtn.type = 'button'; saveBtn.textContent = '保存'; saveBtn.addEventListener('click', function(e) { e.preventDefault(); saveEdit(id); });
  var cancelBtn = document.createElement('button'); cancelBtn.className = 'cancel-edit-btn'; cancelBtn.type = 'button'; cancelBtn.textContent = '取消'; cancelBtn.addEventListener('click', function(e) { e.preventDefault(); cancelEdit(id); });
  btnsRow.appendChild(saveBtn); btnsRow.appendChild(cancelBtn);
  editRow.appendChild(timeRow); editRow.appendChild(noteRow); editRow.appendChild(btnsRow);
  el.appendChild(icon); el.appendChild(info); el.appendChild(editRow);
}

async function saveEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) { renderRecords(); renderSummary(); return; }
  var startEl = document.getElementById('edit-start-' + id), endEl = document.getElementById('edit-end-' + id), detailEl = document.getElementById('edit-detail-' + id);
  if (!startEl) { renderRecords(); renderSummary(); return; }
  var start = startEl.value, end = endEl ? endEl.value : '', detail = detailEl ? detailEl.value.trim() : '';
  if (!start) { Logger.info('编辑表单校验：开始时间为空'); alert('请填写开始时间'); return; }
  if (end === '23:59' && r._origEnd === '24:00') end = '24:00';
  var crossMidnight = end && end !== '00:00' && end < start;
  if (crossMidnight) {
    var nextDate = addDays(App.currentDate, 1);
    r.start = start; r.end = '24:00'; r.detail = detail; r.updatedAt = toBJISOString();
    var record2 = { id: generateId(), type: r.type, start: '00:00', end: end, detail: detail, createdAt: toBJISOString() };
    if (!App.allData[nextDate]) App.allData[nextDate] = [];
    App.allData[nextDate].push(record2); App.allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    delete r._origEnd;
    flushSave(); renderRecords(); renderSummary(); startSyncQueueProcessor(); syncRecordToCloud(r, App.currentDate); syncRecordToCloud(record2, nextDate);
  } else {
    r.start = start; r.end = end; r.detail = detail; r.updatedAt = toBJISOString();
    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    delete r._origEnd;
    flushSave(); renderRecords(); renderSummary(); startSyncQueueProcessor(); syncRecordToCloud(r, App.currentDate);
  }
}

function cancelEdit(id) { var records = getDayData(App.currentDate); var r = records.filter(function(x){return x.id===id;})[0]; if (r) delete r._origEnd; renderRecords(); }

// ==== realtime.js ====
function handleRealtimeChange(changes) {
  if (!changes || changes.length === 0) return;
  var needRenderDaily = false, needRenderMonthly = false;
  changes.forEach(function(evt) {
    var r = evt.record; if (!r || !r.id) return;
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
            if (App.currentTab === 'monthly') { var p2 = d.split('-').map(Number); if (p2[0] === App.summaryYear && p2[1] === App.summaryMonth) needRenderMonthly = true; }
          }
        });
        return; // 已在上方处理渲染标记
      }
      if (App.allData[delDate]) {
        App.allData[delDate] = App.allData[delDate].filter(function(x) { return x.id !== r.id; });
        if (App.allData[delDate].length === 0) delete App.allData[delDate];
      }
      if (delDate === App.currentDate && App.currentTab === 'daily') needRenderDaily = true;
      if (App.currentTab === 'monthly') { var dp = delDate.split('-').map(Number); if (dp[0] === App.summaryYear && dp[1] === App.summaryMonth) needRenderMonthly = true; }
      return;
    }
    // INSERT / UPDATE
    if (!r.record_date) return;
    var dateStr = r.record_date;
    var newRec = mapCloudRecord(r);
    if (!App.allData[dateStr]) App.allData[dateStr] = [];
    var idx = -1;
    for (var i = 0; i < App.allData[dateStr].length; i++) { if (App.allData[dateStr][i].id === newRec.id) { idx = i; break; } }
    if (idx >= 0) { var localTime = App.allData[dateStr][idx].updatedAt ? new Date(App.allData[dateStr][idx].updatedAt).getTime() : 0; var cloudTime = newRec.updatedAt ? new Date(newRec.updatedAt).getTime() : 0; if (cloudTime > localTime) App.allData[dateStr][idx] = newRec; }
    else { App.allData[dateStr].push(newRec); }
    App.allData[dateStr].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
    if (dateStr === App.currentDate && App.currentTab === 'daily') needRenderDaily = true;
    if (App.currentTab === 'monthly') { var p = dateStr.split('-').map(Number); if (p[0] === App.summaryYear && p[1] === App.summaryMonth) needRenderMonthly = true; }
  });
  saveData();
  if (needRenderDaily) { renderRecords(); renderSummary(); }
  if (needRenderMonthly) { renderMonthlySummary(); }
}

// ==== init.js ====
App.TYPES = [
  { id: '喝奶', icon: '🍼', css: 'he', category: 'he' },
  { id: '喝水', icon: '💧', css: 'he', category: 'he' },
  { id: '辅食', icon: '🥣', css: 'he', category: 'he' },
  { id: '小睡', icon: '😴', css: 'shui', category: 'shui' },
  { id: '长睡', icon: '🛏️', css: 'shui', category: 'shui' },
  { id: '玩耍', icon: '🎯', css: 'wan', category: 'wan' },
  { id: '外出', icon: '🌳', css: 'wan', category: 'wan' },
  { id: '拉臭臭', icon: '💩', css: 'xihu', category: 'xihu' },
  { id: '换尿布', icon: '🩲', css: 'xihu', category: 'xihu' },
  { id: '洗澡', icon: '🛁', css: 'xihu', category: 'xihu' },
  { id: '学习', icon: '📖', css: 'xuexi', category: 'xuexi' },
  { id: '其他', icon: '📌', css: 'zidingyi', category: 'zidingyi' }
];

App.currentDate = currentDateBJ();
App.selectedType = '喝奶';
App.customTypeText = '';
App.currentTab = 'daily';
App.summaryYear = undefined;
App.summaryMonth = undefined;
App.syncStatus = 'offline';
App.activeFilter = '';

var TYPES = App.TYPES;
var typeMap = {};
TYPES.forEach(function(t) { typeMap[t.id] = t; });

// "其他"分类筛选：排除五大预置分类（吃喝/睡眠/玩耍/洗护/学习），覆盖自定义类型
function _matchFilter(recordType, filterCat) {
  if (filterCat === 'zidingyi') {
    var t = typeMap[recordType];
    return !t || !App.CONFIG.ZIDINGYI_EXCLUDE[t.category];
  }
  var t2 = typeMap[recordType];
  return t2 && t2.category === filterCat;
}

// Header 三件套（setUserDisplay/clearUserDisplay/updateSyncStatus）已统一到公共库 App.UI.bindHeader；
// baby 页登录时额外显示 refreshBtn（手动刷新按钮），通过 showOnLogin 参数化
App.UI.bindHeader({ displayId: 'monthDisplayText', loginId: 'loginLink', logoutId: 'logoutLink', showOnLogin: ['refreshBtn'] });

async function onLoginSuccess(user, session) {
  return standardOnLoginSuccess(user, {
    subscribe: handleRealtimeChange,
    afterSync: function() {
      return loadDayFromCloud(App.currentDate).then(function() { renderRecords(); renderSummary(); }).catch(function(e) { Logger.warn('登录后加载云端数据失败，使用本地数据', e); renderRecords(); renderSummary(); });
    }
  });
}

var _refreshInProgress = false;
async function refreshData() {
  if (!App.currentUser) return;
  if (_refreshInProgress) return;
  _refreshInProgress = true;
  updateSyncStatus('syncing');
  try {
    // Supabase SDK 已配置 autoRefreshToken: true，会自动处理 token 刷新
    // 无需额外调用 verifyAccessToken/refreshAccessToken，避免 iPhone 上多次网络往返失败
    await loadDayFromCloud(App.currentDate);
    updateSyncStatus('online');
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
    App._lastDataRefresh = Date.now();
  } catch(e) {
    Logger.warn('刷新数据失败，使用本地数据', e);
    // 网络瞬断不降级为离线：只有原本就是离线状态才保持
    // 手机端 WiFi/4G 切换、iOS WKWebView 限制等因素容易导致单次请求失败
    // 如果之前是 online，说明只是本次请求失败，保留 online 不误导用户
    if (App.syncStatus === 'offline') {
      updateSyncStatus('offline');
    }
    // 其他情况（online/syncing）：保持当前状态不变
  }
  // 无论云端加载成功与否，都渲染本地数据
  renderRecords();
  renderSummary();
  _refreshInProgress = false;
}

var _monthlyModuleLoaded = false;

var _flushedOnExit = false;
function flushSaveOnExit() {
  if (_flushedOnExit) return;
  _flushedOnExit = true;
  flushSave();
}

function switchTab(tab) {
  App.currentTab = tab;
  document.getElementById('tabDaily').className = tab==='daily'?'active':'';
  document.getElementById('tabMonthly').className = tab==='monthly'?'active':'';
  document.getElementById('dailyView').className = tab==='daily'?'daily-view':'daily-view hidden';
  document.getElementById('monthlyView').className = tab==='monthly'?'monthly-view active':'monthly-view';
  if (tab === 'monthly') {
    if (!_monthlyModuleLoaded) { _loadMonthlyModule(function() { _renderMonthlyTab(); }); }
    else { _renderMonthlyTab(); }
  }
}

function _loadMonthlyModule(callback) {
  if (_monthlyModuleLoaded) { callback(); return; }
  var s = document.createElement('script'); s.src = 'monthly.js';
  s.onload = function() { _monthlyModuleLoaded = true; callback(); };
  s.onerror = function() { Logger.error('月度汇总模块加载失败'); };
  document.head.appendChild(s);
}

function _renderMonthlyTab() {
  renderMonthlySummary();
  if (App.currentUser) { loadMonthFromCloud(App.summaryYear, App.summaryMonth).then(function() { renderMonthlySummary(); }); }
}

function _bindActions() {
  var ACTIONS = {
    'login': showLogin,
    'logout': logout,
    'tab-daily': function() { switchTab('daily'); },
    'tab-monthly': function() { switchTab('monthly'); },
    'prev-date': function() { changeDate(-1); },
    'next-date': function() { changeDate(1); },
    'refresh': refreshData,
    'add-record': addRecord,
    'export-excel': exportExcelLazy,
    'export-data': exportDataLazy,
    'import-file': function() { document.getElementById('importFile').click(); },
    'clear-day': clearDay,
    'prev-month': function() { changeSummaryMonth(-1); },
    'next-month': function() { changeSummaryMonth(1); }
  };
  var FILTER_CATS = { 'filter-he': 'he', 'filter-shui': 'shui', 'filter-wan': 'wan', 'filter-xihu': 'xihu', 'filter-xuexi': 'xuexi', 'filter-zidingyi': 'zidingyi' };
  Object.keys(FILTER_CATS).forEach(function(key) {
    ACTIONS[key] = function(e) { toggleFilter(FILTER_CATS[key], e.currentTarget); };
  });

  document.querySelectorAll('[data-action]').forEach(function(el) {
    var action = el.dataset.action;
    var fn = ACTIONS[action];
    if (fn) { el.addEventListener('click', fn); }
  });

  var importFile = document.getElementById('importFile');
  if (importFile) { importFile.addEventListener('change', function(e) { importDataLazy(e); }); }
}

async function init() {
  if (App._initCalled) return;
  App._initCalled = true;
  registerSW();
  _bindActions();
  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, { onSuccess: function(user, session) { onLoginSuccess(user, session); }, onSkip: function() { skipLogin(); } });
  // 先渲染 UI（不依赖会话）
  renderTypeGrid();
  document.getElementById('exportMonth').value = App.currentDate.slice(0, 7);
  var p = App.currentDate.split('-').map(Number);
  App.summaryYear = p[0]; App.summaryMonth = p[1];
  loadData();
  setDate(App.currentDate, false);
  // 异步恢复会话（不阻塞渲染），快速路径几乎瞬间返回
  await loadSupabaseSDK();
  initSupabase();
  var sessionResult = await restoreSession();
  if (sessionResult.success) {
    setUserDisplay(App.currentUser.email || '用户');
    updateSyncStatus('online');
    // 快速路径也要验证 token（JWT 可能 1 小时已过期），非快速路径后台验证
    setTimeout(function() {
      subscribeRealtime(handleRealtimeChange);
      initRealtimeChannel();
      refreshTokenAndCloud();
    }, 0);
  } else {
    updateSyncStatus('offline');
    clearUserDisplay();
    if (!sessionStorage.getItem('bt_skip_login')) { setTimeout(function() { showLogin(sessionResult.reason === 'decrypt_failed' ? '安全升级，请重新登录' : ''); }, 0); }
  }
  startSyncQueueProcessor();
  var _timelineTimer = null;
  function _startTimelineTimer() { if (_timelineTimer) return; _timelineTimer = setInterval(function() { _updateNowLine(false); }, App.CONFIG.TIMELINE_UPDATE_INTERVAL_MS); }
  function _stopTimelineTimer() { if (_timelineTimer) { clearInterval(_timelineTimer); _timelineTimer = null; } }
  _startTimelineTimer();

  // 注册数据刷新回调：common-bundle 的 _autoRefreshDataIfStale() 拉取云端数据后，
  // 通过此回调通知本页面渲染 UI
  App._onDataRefreshed = function() {
    renderRecords();
    renderSummary();
  };

  // 页面可见性变化时控制定时器 + 立即刷新位置
  // 数据过期刷新 & Realtime 重连由 common-bundle.js 的 setupVisibilityListener() 统一处理
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'visible') { _updateNowLine(false); _startTimelineTimer(); }
    else { _stopTimelineTimer(); }
  });

  // Realtime 统一走公共库：显式配置订阅（channel 名 + 订阅表），无隐式缺省
  setRealtimeConfig({ channelName: 'baby_records_changes', tables: ['baby_records'] });

  setupVisibilityListener();
  window.addEventListener('beforeunload', flushSaveOnExit);
  window.addEventListener('pagehide', flushSaveOnExit);
}

// 后台加载云端数据（Token 刷新完全交由 SDK autoRefreshToken + onAuthStateChange 管理）
// 距上次同步超过 FULL_SYNC_INTERVAL_MS 时，强制刷新绕过防重入保护
async function refreshTokenAndCloud() {
  try {
    var loadOk = true;
    var now = Date.now();
    var needForce = !App._lastDataRefresh || (now - App._lastDataRefresh) >= App.CONFIG.FULL_SYNC_INTERVAL_MS;
    try { await loadDayFromCloud(App.currentDate, needForce); } catch(e) { loadOk = false; Logger.warn('后台刷新云端数据失败', e); }
    if (loadOk) { updateSyncStatus('online'); App._lastDataRefresh = now; }
    renderRecords(); renderSummary();
  } catch(e) { Logger.warn('后台刷新云端数据失败', e); updateSyncStatus('offline'); }
}

async function exportExcelLazy() {
  if (App.currentUser) {
    var monthVal = document.getElementById('exportMonth').value;
    if (monthVal) { var parts = monthVal.split('-').map(Number); updateSyncStatus('syncing'); try { await loadMonthFromCloud(parts[0], parts[1]); updateSyncStatus('online'); } catch(e) { Logger.warn('导出前加载当月云端数据失败', e); updateSyncStatus('offline'); } }
  }
  loadXlsxModule(function() { exportExcel(); });
}

function exportDataLazy() { loadXlsxModule(function() { exportData(); }); }

function importDataLazy(event) { loadXlsxModule(function() { importData(event); }); }

document.addEventListener('DOMContentLoaded', function() { init(); });
