// ==================== baby-tracker page-bundle.js ====================
// 自动合并：render.js + records.js + realtime.js + init.js
// 生成时间：2026-06-16
// 依赖：lib/common-bundle.js（需在此之前加载）

// ==== render.js ====
function renderRecords() {
  var records = getDayData(App.currentDate);
  var container = document.getElementById('recordList');
  var filtered = records;
  if (App.activeFilter) {
    filtered = records.filter(function(r) { var t = typeMap[r.type]; return t && t.category === App.activeFilter; });
  }
  document.getElementById('todayStats').textContent = '共 ' + records.length + ' 条' + (App.activeFilter ? '（筛选 ' + filtered.length + ' 条）' : '');
  while (container.firstChild) container.removeChild(container.firstChild);
  if (filtered.length === 0) {
    var emptyDiv = document.createElement('div');
    emptyDiv.className = 'empty-state';
    emptyDiv.innerHTML = '<div class="emoji">📭</div><div>' + (App.activeFilter ? '该分类暂无记录' : '今天还没有记录') + '</div>';
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
    var icon = document.createElement('div'); icon.className = 'record-icon'; icon.textContent = t.icon;
    var info = document.createElement('div'); info.className = 'record-info';
    var typeDiv = document.createElement('div'); typeDiv.className = 'record-type'; typeDiv.textContent = t.id;
    var timeDiv = document.createElement('div'); timeDiv.className = 'record-time'; timeDiv.textContent = timeText;
    info.appendChild(typeDiv); info.appendChild(timeDiv);
    if (detailText) { var detailDiv = document.createElement('div'); detailDiv.className = 'record-detail'; detailDiv.textContent = detailText; info.appendChild(detailDiv); }
    var editBtn = document.createElement('button'); editBtn.className = 'edit-btn'; editBtn.textContent = '✎'; editBtn.onclick = (function(id) { return function() { startEdit(id); }; })(r.id);
    var delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.textContent = '✕'; delBtn.onclick = (function(id) { return function() { deleteRecord(id); }; })(r.id);
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
  if (App.currentDate === currentDateBJ()) { nowLine.style.display = 'block'; var now = nowBJ(); var nowMin = now.getHours() * 60 + now.getMinutes(); var nowPct = (nowMin / totalMin) * 100; nowLine.style.left = nowPct + '%'; }
  else { nowLine.style.display = 'none'; }
  var oldSegs = bar.querySelectorAll('.timeline-segment'); oldSegs.forEach(function(s) { s.remove(); });
  var filtered = records;
  if (App.activeFilter) { filtered = records.filter(function(r) { var t = typeMap[r.type]; return t && t.category === App.activeFilter; }); }
  if (filtered.length === 0) return;
  var items = [];
  filtered.forEach(function(r) {
    var sm = timeToMinutes(r.start); if (sm < 0) return;
    var em = r.end ? timeToMinutes(r.end) : sm; if (em < sm) em += totalMin;
    var t = typeMap[r.type]; if (!t) t = { id: escapeHtml(r.type), icon: '📌', css: 'zidingyi', category: 'zidingyi' }; else t = { id: escapeHtml(t.id), icon: t.icon, css: t.css, category: t.category };
    items.push({ startMin: sm, endMin: em, css: t.css, label: t.icon + ' ' + t.id });
  });
  if (items.length === 0) return;
  items.sort(function(a, b) { return a.startMin - b.startMin; });
  items.forEach(function(item) {
    var leftPct = (item.startMin / totalMin) * 100;
    var widthPct = ((item.endMin - item.startMin) / totalMin) * 100;
    if (widthPct < 0.5) widthPct = 0.5;
    var seg = document.createElement('div'); seg.className = 'timeline-segment ' + item.css; seg.style.left = leftPct + '%'; seg.style.width = widthPct + '%'; seg.title = item.label;
    if (widthPct > 3) seg.innerHTML = '<span class="seg-label">' + item.label + '</span>';
    bar.appendChild(seg);
  });
}

function toggleFilter(cat, el) {
  if (App.activeFilter === cat) { App.activeFilter = ''; el.classList.remove('dimmed'); var legends = document.querySelectorAll('#timelineLegend span'); legends.forEach(function(s) { s.classList.remove('dimmed'); }); }
  else { App.activeFilter = cat; var legends = document.querySelectorAll('#timelineLegend span'); legends.forEach(function(s) { s.classList.toggle('dimmed', s.dataset.cat !== cat); }); }
  renderRecords(); renderSummary();
}

function updateTimelineNow() {
  var nowLine = document.getElementById('timelineNow'); if (!nowLine) return;
  if (App.currentTab !== 'daily') return;
  if (App.currentDate !== currentDateBJ()) { nowLine.style.display = 'none'; return; }
  nowLine.style.display = 'block';
  var now = nowBJ(); var nowMin = now.getHours() * 60 + now.getMinutes(); var nowPct = (nowMin / (24 * 60)) * 100; nowLine.style.left = nowPct + '%';
}

// ==== records.js ====
function renderTypeGrid() {
  var grid = document.getElementById('typeGrid');
  grid.innerHTML = TYPES.map(function(t) { return '<button class="type-btn ' + t.css + (App.selectedType===t.id?' active':'') + '" onclick="selectType(\'' + t.id + '\')">' + t.icon + ' ' + t.id + '</button>'; }).join('');
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
  var now = toBJISOString();
  var crossMidnight = end && end !== '00:00' && end < start;
  if (crossMidnight) {
    var nextDate = addDays(App.currentDate, 1);
    var record1 = { id: generateId(), type: recordType, start: start, end: '24:00', detail: detail, createdAt: now, updatedAt: now };
    var record2 = { id: generateId(), type: recordType, start: '00:00', end: end, detail: detail, createdAt: now, updatedAt: now };
    if (!App.allData[App.currentDate]) App.allData[App.currentDate] = [];
    App.allData[App.currentDate].push(record1); App.allData[App.currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    if (!App.allData[nextDate]) App.allData[nextDate] = [];
    App.allData[nextDate].push(record2); App.allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    flushSave(); await syncRecordToCloud(record1, App.currentDate); await syncRecordToCloud(record2, nextDate);
  } else {
    var record = { id: generateId(), type: recordType, start: start, end: end, detail: detail, createdAt: now, updatedAt: now };
    if (!App.allData[App.currentDate]) App.allData[App.currentDate] = [];
    App.allData[App.currentDate].push(record); App.allData[App.currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    flushSave(); await syncRecordToCloud(record, App.currentDate);
  }
  document.getElementById('startTime').value = ''; document.getElementById('endTime').value = ''; document.getElementById('detail').value = ''; document.getElementById('customTypeInput').value = '';
  if (App.selectedType === '其他') document.getElementById('customTypeRow').style.display = 'flex'; else document.getElementById('customTypeRow').style.display = 'none';
  renderRecords(); renderSummary();
}

async function deleteRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  App.allData[App.currentDate] = (App.allData[App.currentDate]||[]).filter(function(r) { return r.id !== id; });
  flushSave(); renderRecords(); renderSummary(); await deleteRecordFromCloud(id);
}

async function clearDay() {
  if (!confirm('确定清空 ' + App.currentDate + ' 的所有记录吗？')) return;
  delete App.allData[App.currentDate]; flushSave(); renderRecords(); renderSummary(); await deleteDayFromCloud(App.currentDate);
}

function startEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var t = typeMap[r.type]; if (!t) t = { id: escapeHtml(r.type), icon: '📌', css: 'zidingyi', category: 'zidingyi' }; else t = { id: escapeHtml(t.id), icon: t.icon, css: t.css, category: t.category };
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
    var record2 = { id: generateId(), type: r.type, start: '00:00', end: end, detail: detail, createdAt: toBJISOString(), updatedAt: toBJISOString() };
    if (!App.allData[nextDate]) App.allData[nextDate] = [];
    App.allData[nextDate].push(record2); App.allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    // 先写 localStorage（同步），再异步写云端
    flushSave();
    await syncRecordToCloud(r, App.currentDate);
    await syncRecordToCloud(record2, nextDate);
  } else {
    r.start = start; r.end = end; r.detail = detail; r.updatedAt = toBJISOString();
    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    // 先写 localStorage（同步），再异步写云端
    flushSave();
    await syncRecordToCloud(r, App.currentDate);
  }
  delete r._origEnd;
  // 云端写入完成后再刷新 UI，确保显示的是最终数据
  renderRecords();
  renderSummary();
}

function cancelEdit(id) { var records = getDayData(App.currentDate); var r = records.filter(function(x){return x.id===id;})[0]; if (r) delete r._origEnd; renderRecords(); }

// ==== realtime.js ====
function handleRealtimeChange(changes) {
  if (!changes || changes.length === 0) return;
  var needRenderDaily = false, needRenderMonthly = false;
  changes.forEach(function(evt) {
    var r = evt.record; if (!r || !r.record_date) return;
    var dateStr = r.record_date;
    if (evt.eventType === 'INSERT' || evt.eventType === 'UPDATE') {
      var newRec = mapCloudRecord(r);
      if (!App.allData[dateStr]) App.allData[dateStr] = [];
      var idx = -1;
      for (var i = 0; i < App.allData[dateStr].length; i++) { if (App.allData[dateStr][i].id === newRec.id) { idx = i; break; } }
      if (idx >= 0) { var localTime = App.allData[dateStr][idx].updatedAt ? new Date(App.allData[dateStr][idx].updatedAt).getTime() : 0; var cloudTime = newRec.updatedAt ? new Date(newRec.updatedAt).getTime() : 0; if (cloudTime > localTime) App.allData[dateStr][idx] = newRec; }
      else { App.allData[dateStr].push(newRec); }
      App.allData[dateStr].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
    } else if (evt.eventType === 'DELETE') {
      if (App.allData[dateStr]) { App.allData[dateStr] = App.allData[dateStr].filter(function(x) { return x.id !== r.id; }); if (App.allData[dateStr].length === 0) delete App.allData[dateStr]; }
    }
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

function setUserDisplay(email) {
  document.getElementById('monthDisplayText').textContent = '👤 ' + email;
  document.getElementById('loginLink').style.display = 'none';
  document.getElementById('logoutLink').style.display = 'inline-block';
  document.getElementById('refreshBtn').style.display = 'inline-block';
}

function clearUserDisplay() {
  document.getElementById('monthDisplayText').textContent = '📱 仅本设备';
  document.getElementById('loginLink').style.display = 'inline-block';
  document.getElementById('logoutLink').style.display = 'none';
  document.getElementById('refreshBtn').style.display = 'none';
}

function updateSyncStatus(status) {
  App.syncStatus = status;
  var dot = document.querySelector('.sync-dot'); var text = document.getElementById('syncText');
  dot.className = 'sync-dot ' + status;
  if (status === 'online') text.textContent = '已同步';
  else if (status === 'syncing') text.textContent = '同步中...';
  else text.textContent = App.currentUser ? '离线' : '未登录';
}

async function onLoginSuccess(user, session) {
  App.currentUser.loginAt = Date.now();
  await saveUserSecure(App.currentUser);
  sessionStorage.removeItem('bt_skip_login');
  hideLogin();
  updateSyncStatus('online');
  setUserDisplay(user.email || '用户');
  subscribeRealtime(handleRealtimeChange);
  initRealtimeChannel();
  loadDayFromCloud(App.currentDate).then(function() { renderRecords(); renderSummary(); }).catch(function(e) { Logger.warn('登录后加载云端数据失败，使用本地数据', e); renderRecords(); renderSummary(); });
}

async function refreshData() {
  if (!App.currentUser) return;
  updateSyncStatus('syncing');
  try {
    // 先验证 token 有效性，过期则刷新
    var tokenOk = await verifyAccessToken();
    if (!tokenOk) {
      var refreshed = await refreshAccessToken();
      if (!refreshed) {
        Logger.warn('Token 已失效，请重新登录');
        updateSyncStatus('offline');
        return;
      }
    }
    await loadDayFromCloud(App.currentDate);
    updateSyncStatus('online');
    sessionStorage.setItem('bt_session_verified', String(Date.now()));
  } catch(e) {
    Logger.warn('刷新数据失败', e);
    updateSyncStatus('offline');
  }
  renderRecords();
  renderSummary();
}

var _monthlyModuleLoaded = false;

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

async function init() {
  if (App._initCalled) return;
  App._initCalled = true;
  registerSW();
  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, { onSuccess: function(user, session) { onLoginSuccess(user, session); }, onSkip: function() { skipLogin(); } });
  var loginModal = document.querySelector('login-modal');
  if (loginModal && loginModal.addEventListener) {
    loginModal.addEventListener('login-success', function(e) { onLoginSuccess(e.detail.user, e.detail.session); });
    loginModal.addEventListener('login-skip', function() { skipLogin(); });
  }
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
    // 快速路径跳过 token 刷新，非快速路径后台验证
    setTimeout(function() {
      subscribeRealtime(handleRealtimeChange);
      initRealtimeChannel();
      if (sessionResult.reason !== 'quick') { refreshTokenAndCloud(); }
      else { updateSyncStatus('online'); }
    }, 0);
  } else {
    updateSyncStatus('offline');
    clearUserDisplay();
    if (!sessionStorage.getItem('bt_skip_login')) { setTimeout(function() { showLogin(sessionResult.reason === 'decrypt_failed' ? '安全升级，请重新登录' : ''); }, 0); }
  }
  processSyncQueue();
  setInterval(processSyncQueue, App.CONFIG.SYNC_QUEUE_INTERVAL_MS);
  setInterval(updateTimelineNow, App.CONFIG.TIMELINE_UPDATE_INTERVAL_MS);
  scheduleTokenRefresh();
  setupVisibilityListener();
  window.addEventListener('beforeunload', flushSave);
  window.addEventListener('pagehide', flushSave);
}

async function refreshTokenAndCloud() {
  try {
    var refreshed = await refreshAccessToken();
    if (!refreshed) { var tokenValid = await verifyAccessToken(); if (!tokenValid) { updateSyncStatus('offline'); return; } }
    try { await loadDayFromCloud(App.currentDate); } catch(e) { Logger.warn('后台刷新云端数据失败', e); }
    updateSyncStatus('online'); renderRecords(); renderSummary();
  } catch(e) { Logger.warn('后台刷新 Token 和云端数据失败', e); updateSyncStatus('offline'); }
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
