// ==================== 宝宝作息记录 - 页面逻辑 ====================
// 依赖：lib/supabase-config.js, lib/supabase-client.js, lib/supabase-auth.js
//       lib/cloud-sync.js, lib/storage.js, lib/utils.js
// 延迟加载：lib/data-io.js, lib/excel-export.js（首次导出时加载）

// ==================== 页面专属全局变量 ====================
var STORAGE_KEY = 'baby_tracker_data';
var USER_KEY = 'baby_tracker_user';
var SYNC_QUEUE_KEY = 'baby_tracker_sync_queue';

var TYPES = [
  { id: '喝奶',   icon: '🍼', css: 'he',   category: 'he' },
  { id: '喝水',   icon: '💧', css: 'he',   category: 'he' },
  { id: '辅食',   icon: '🥣', css: 'he',   category: 'he' },
  { id: '小睡',   icon: '😴', css: 'shui', category: 'shui' },
  { id: '长睡',   icon: '🛏️', css: 'shui', category: 'shui' },
  { id: '玩耍',   icon: '🎯', css: 'wan',  category: 'wan' },
  { id: '外出',   icon: '🌳', css: 'wan',  category: 'wan' },
  { id: '拉臭臭', icon: '💩', css: 'xihu', category: 'xihu' },
  { id: '换尿布', icon: '🩲', css: 'xihu', category: 'xihu' },
  { id: '洗澡',   icon: '🛁', css: 'xihu', category: 'xihu' },
  { id: '学习',   icon: '📖', css: 'xuexi', category: 'xuexi' },
  { id: '其他',   icon: '📌', css: 'zidingyi', category: 'zidingyi' },
];

var currentDate = currentDateBJ();
var selectedType = '喝奶';
var customTypeText = '';
var allData = {};
var currentTab = 'daily';
var summaryYear, summaryMonth;
var currentUser = null;
var syncStatus = 'offline';
var activeFilter = ''; // 时间轴分类筛选：'' 表示全部，'he'/'shui'/'wan'/'xihu'/'xuexi'/'zidingyi' 表示只显示该分类

// ==================== UI 状态更新（供 auth 模块回调） ====================
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
  syncStatus = status;
  var dot = document.querySelector('.sync-dot');
  var text = document.getElementById('syncText');
  dot.className = 'sync-dot ' + status;
  if (status === 'online') {
    text.textContent = '已同步';
  } else if (status === 'syncing') {
    text.textContent = '同步中...';
  } else {
    text.textContent = currentUser ? '离线' : '未登录';
  }
}

// ==================== 登录成功回调 ====================
function onLoginSuccess(user, session) {
  currentUser.loginAt = Date.now();
  localStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  sessionStorage.removeItem('bt_skip_login');
  hideLogin();
  updateSyncStatus('online');
  setUserDisplay(user.email || '用户');
  loadDayFromCloud(currentDate).then(function() {
    renderRecords();
    renderSummary();
  }).catch(function() {
    renderRecords();
    renderSummary();
  });
}

// ==================== 刷新数据（仅当前日期） ====================
async function refreshData() {
  if (!currentUser) return;
  updateSyncStatus('syncing');
  try {
    await loadDayFromCloud(currentDate);
    updateSyncStatus('online');
  } catch(e) {
    updateSyncStatus('offline');
  }
  renderRecords();
  renderSummary();
}

// ==================== 初始化 ====================
var _initCalled = false;
async function init() {
  if (_initCalled) return;
  _initCalled = true;
  initSupabase();

  // 先渲染 UI 框架（无数据），让页面立即可见
  renderTypeGrid();
  document.getElementById('exportMonth').value = currentDate.slice(0, 7);
  var p = currentDate.split('-').map(Number);
  summaryYear = p[0]; summaryMonth = p[1];

  // 并行：恢复会话 + 读取本地数据
  var hasSession = restoreSession();
  loadData(); // 不管是否登录，先读本地数据

  if (hasSession) {
    // 已登录：先展示本地数据，再异步更新云端数据
    setDate(currentDate, true); // skipCloud
    // 后台异步刷新 token 和云端数据（不阻塞 UI）
    refreshTokenAndCloud();
  } else {
    // 未登录：展示本地数据，并弹出登录弹窗
    // 但如果用户主动跳过登录（sessionStorage 有标记），则不弹窗
    updateSyncStatus('offline');
    clearUserDisplay();
    setDate(currentDate, false);
    if (!sessionStorage.getItem('bt_skip_login')) {
      showLogin();
    }
  }

  processSyncQueue();
  setInterval(processSyncQueue, 30000);

  // 时间轴"现在"线每分钟自动移动
  setInterval(updateTimelineNow, 60000);

  // 每间隔1小时静默刷新页面（含跳出再进入场景）
  scheduleHourlyRefresh();
}

// 更新时间轴"现在"刻度线位置（北京时间）
function updateTimelineNow() {
  var nowLine = document.getElementById('timelineNow');
  if (!nowLine) return;
  // 只在每日记录页（不是月度汇总）且是今天时才显示"现在"线
  if (currentTab !== 'daily') return;
  if (currentDate !== currentDateBJ()) {
    nowLine.style.display = 'none';
    return;
  }
  nowLine.style.display = 'block';
  var now = nowBJ();
  var nowMin = now.getHours() * 60 + now.getMinutes();
  var nowPct = (nowMin / (24 * 60)) * 100;
  nowLine.style.left = nowPct + '%';
}

// 后台异步刷新 token + 云端数据（stale-while-revalidate）
async function refreshTokenAndCloud() {
  try {
    var refreshed = await refreshAccessToken();
    if (!refreshed) {
      var tokenValid = await verifyAccessToken();
      if (!tokenValid) {
        // token 刷新和验证都失败，保留 localStorage 信息，
        // 下次页面刷新时再尝试，不立即清除登录态
        updateSyncStatus('offline');
        return;
      }
    }
    // 加载当前日期云端数据
    try { await loadDayFromCloud(currentDate); } catch(e) {}
    updateSyncStatus('online');
    // 云端数据到达后刷新 UI
    renderRecords();
    renderSummary();
  } catch(e) {
    updateSyncStatus('offline');
  }
}

// ==================== 日期导航 ====================
function setDate(dateStr, skipCloud) {
  currentDate = dateStr;
  // 切换日期时清除分类筛选，避免干扰其他日期的展示
  if (activeFilter) {
    activeFilter = '';
    var legends = document.querySelectorAll('#timelineLegend span');
    legends.forEach(function(s) { s.classList.remove('dimmed'); });
  }
  var d = new Date(dateStr + 'T00:00:00');
  var weekdays = ['日','一','二','三','四','五','六'];
  document.getElementById('dateText').textContent = (d.getMonth()+1) + '月' + d.getDate() + '日';
  document.getElementById('dateSub').textContent = '星期' + weekdays[d.getDay()];
  renderRecords();
  renderSummary();
  // 已登录时，后台静默加载该日期的云端数据（skipCloud 可跳过以避免重复请求）
  if (currentUser && !skipCloud) {
    loadDayFromCloud(dateStr).then(function() {
      renderRecords();
      renderSummary();
    }).catch(function() {});
  }
}

function changeDate(delta) {
  var p = currentDate.split('-').map(Number);
  var d = new Date(p[0], p[1]-1, p[2]+delta);
  setDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
}

// ==================== 类型网格 ====================
function renderTypeGrid() {
  var grid = document.getElementById('typeGrid');
  grid.innerHTML = TYPES.map(function(t) {
    return '<button class="type-btn ' + t.css + (selectedType===t.id?' active':'') + '" onclick="selectType(\'' + t.id + '\')">' + t.icon + ' ' + t.id + '</button>';
  }).join('');
}

function selectType(id) {
  selectedType = id;
  customTypeText = '';
  renderTypeGrid();
  var el = document.getElementById('detail');
  var customRow = document.getElementById('customTypeRow');
  var customInput = document.getElementById('customTypeInput');
  if (id === '喝奶' || id === '喝水' || id === '辅食') {
    el.inputMode = 'decimal';
    if (id === '喝奶') el.placeholder = '奶量(ml)';
    else if (id === '喝水') el.placeholder = '水量(ml)';
    else el.placeholder = '辅食量(g/ml)';
    customRow.style.display = 'none';
  } else if (id === '其他') {
    el.inputMode = 'text';
    el.placeholder = '备注';
    customRow.style.display = 'flex';
    customInput.value = '';
  } else {
    el.inputMode = 'text';
    el.placeholder = '备注';
    customRow.style.display = 'none';
  }
}

// 计算某个日期加 N 天后的日期字符串 (YYYY-MM-DD)
function addDays(dateStr, n) {
  var p = dateStr.split('-').map(Number);
  var d = new Date(p[0], p[1]-1, p[2] + n);
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ==================== 记录操作 ====================
async function addRecord() {
  var start = document.getElementById('startTime').value;
  var end = document.getElementById('endTime').value;
  var detail = document.getElementById('detail').value.trim();
  if (!start) { alert('请填写开始时间'); return; }

  var recordType = selectedType;
  if (selectedType === '其他') {
    var customVal = document.getElementById('customTypeInput').value.trim();
    recordType = customVal || '其他';
  }

  var now = toBJISOString();
  // 结束时间 < 开始时间 = 跨24点（但 00:00 排除，它等同于 24:00 表示当天结束）
  var crossMidnight = end && end !== '00:00' && end < start;

  if (crossMidnight) {
    // 拆分为2条记录：当天 start~24:00，第二天 00:00~end
    var nextDate = addDays(currentDate, 1);

    var record1 = {
      id: Date.now(),
      type: recordType,
      start: start,
      end: '24:00',
      detail: detail,
      createdAt: now,
      updatedAt: now
    };
    var record2 = {
      id: Date.now() + 1,  // 确保ID唯一
      type: recordType,
      start: '00:00',
      end: end,
      detail: detail,
      createdAt: now,
      updatedAt: now
    };

    if (!allData[currentDate]) allData[currentDate] = [];
    allData[currentDate].push(record1);
    allData[currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });

    if (!allData[nextDate]) allData[nextDate] = [];
    allData[nextDate].push(record2);
    allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });

    saveData();
    syncRecordToCloud(record1, currentDate);
    syncRecordToCloud(record2, nextDate);
  } else {
    var record = {
      id: Date.now(),
      type: recordType,
      start: start,
      end: end,
      detail: detail,
      createdAt: now,
      updatedAt: now
    };

    if (!allData[currentDate]) allData[currentDate] = [];
    allData[currentDate].push(record);
    allData[currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    saveData();
    syncRecordToCloud(record, currentDate);
  }

  document.getElementById('startTime').value = '';
  document.getElementById('endTime').value = '';
  document.getElementById('detail').value = '';
  document.getElementById('customTypeInput').value = '';
  if (selectedType === '其他') {
    document.getElementById('customTypeRow').style.display = 'flex';
  } else {
    document.getElementById('customTypeRow').style.display = 'none';
  }
  renderRecords();
  renderSummary();
}

async function deleteRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  allData[currentDate] = (allData[currentDate]||[]).filter(function(r) { return r.id !== id; });
  saveData();
  renderRecords();
  renderSummary();
  deleteRecordFromCloud(id);
}

async function clearDay() {
  if (!confirm('确定清空 ' + currentDate + ' 的所有记录吗？')) return;
  delete allData[currentDate];
  saveData();
  renderRecords();
  renderSummary();
  deleteDayFromCloud(currentDate);
}

// ==================== 渲染记录列表 ====================
function renderRecords() {
  var records = getDayData(currentDate);
  var container = document.getElementById('recordList');

  // 按分类筛选
  var filtered = records;
  if (activeFilter) {
    filtered = records.filter(function(r) {
      var t = TYPES.filter(function(x){return x.id===r.type;})[0];
      return t && t.category === activeFilter;
    });
  }

  document.getElementById('todayStats').textContent = '共 ' + records.length + ' 条' + (activeFilter ? '（筛选 ' + filtered.length + ' 条）' : '');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="emoji">📭</div><div>' + (activeFilter ? '该分类暂无记录' : '今天还没有记录') + '</div></div>';
    return;
  }
  container.innerHTML = filtered.map(function(r) {
    var t = TYPES.filter(function(x){return x.id===r.type;})[0];
    if (!t) t = { id: r.type, icon: '📌', css: 'zidingyi', category: 'zidingyi' };
    var dur = calcDuration(r.start, r.end);
    var durText = dur !== null ? dur + '分钟' : '';
    var timeText = r.end ? r.start + ' - ' + r.end : r.start;
    var detailText = [r.detail, durText].filter(Boolean).join(' · ');
    return '<div class="record-item ' + t.css + '" id="rec-' + r.id + '">' +
      '<div class="record-icon">' + t.icon + '</div>' +
      '<div class="record-info">' +
        '<div class="record-type">' + t.id + '</div>' +
        '<div class="record-time">' + timeText + '</div>' +
        (detailText ? '<div class="record-detail">' + detailText + '</div>' : '') +
      '</div>' +
      '<button class="edit-btn" onclick="startEdit(' + r.id + ')">✎</button>' +
      '<button class="delete-btn" onclick="deleteRecord(' + r.id + ')">✕</button>' +
    '</div>';
  }).join('');
}

// ==================== 编辑记录 ====================
function startEdit(id) {
  var records = getDayData(currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var t = TYPES.filter(function(x){return x.id===r.type;})[0];
  if (!t) t = { id: r.type, icon: '📌', css: 'zidingyi', category: 'zidingyi' };
  var el = document.getElementById('rec-' + id);
  if (!el) return;
  el.classList.add('editing');
  var detVal = escapeHtml(r.detail || '');
  var isFeeding = r.type === '喝奶' || r.type === '喝水' || r.type === '辅食';
  // <input type="time"> 不支持 24:00，编辑时展示为 23:59，保存时还原
  r._origEnd = r.end;
  var editEnd = r.end === '24:00' ? '23:59' : r.end;
  el.innerHTML =
    '<div class="record-icon">' + t.icon + '</div>' +
    '<div class="record-info">' +
      '<div class="record-type">' + t.id + '</div>' +
      '<div class="record-time">编辑中...</div>' +
    '</div>' +
    '<div class="record-edit-row">' +
      '<div class="record-edit-time-row">' +
        '<label>开始：</label>' +
        '<input type="time" id="edit-start-' + id + '" value="' + r.start + '" step="60">' +
        '<label>结束：</label>' +
        '<input type="time" id="edit-end-' + id + '" value="' + editEnd + '" step="60">' +
      '</div>' +
      '<div class="record-edit-note-row">' +
        '<label>备注：</label>' +
        '<input type="text" id="edit-detail-' + id + '" value="' + detVal + '" placeholder="' + (isFeeding ? '数量' : '备注') + '" inputmode="' + (isFeeding ? 'decimal' : 'text') + '">' +
      '</div>' +
      '<div class="record-edit-btns">' +
        '<button class="save-edit-btn" onclick="saveEdit(' + id + ')">保存</button>' +
        '<button class="cancel-edit-btn" onclick="cancelEdit(' + id + ')">取消</button>' +
      '</div>' +
    '</div>';
}

async function saveEdit(id) {
  var records = getDayData(currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var start = document.getElementById('edit-start-' + id).value;
  var end = document.getElementById('edit-end-' + id).value;
  var detail = document.getElementById('edit-detail-' + id).value.trim();
  if (!start) { alert('请填写开始时间'); return; }

  // 如果编辑时 23:59 且原始是 24:00，还原为 24:00
  if (end === '23:59' && r._origEnd === '24:00') end = '24:00';
  // 结束时间 < 开始时间 = 跨24点（但 00:00 排除，它等同于 24:00 表示当天结束）
  var crossMidnight = end && end !== '00:00' && end < start;

  if (crossMidnight) {
    // 编辑后跨天：更新当前记录为当天 start~24:00，再创建第二天 00:00~end
    var nextDate = addDays(currentDate, 1);
    r.start = start;
    r.end = '24:00';
    r.detail = detail;
    r.updatedAt = toBJISOString();

    var record2 = {
      id: Date.now(),
      type: r.type,
      start: '00:00',
      end: end,
      detail: detail,
      createdAt: toBJISOString(),
      updatedAt: toBJISOString()
    };

    if (!allData[nextDate]) allData[nextDate] = [];
    allData[nextDate].push(record2);
    allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });

    allData[currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    saveData();
    syncRecordToCloud(r, currentDate);
    syncRecordToCloud(record2, nextDate);
  } else {
    r.start = start; r.end = end; r.detail = detail;
    r.updatedAt = toBJISOString();
    allData[currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    saveData();
    syncRecordToCloud(r, currentDate);
  }

  renderRecords();
  renderSummary();
}

function cancelEdit(id) { renderRecords(); }

// ==================== 当日概览 ====================
function renderSummary() {
  var records = getDayData(currentDate);
  var cnt = function(t) { return records.filter(function(r){return r.type===t;}).length; };
  var sD = function(types) { return records.filter(function(r){return types.indexOf(r.type)>=0;}).reduce(function(s,r){return s+(calcDuration(r.start,r.end)||0);},0); };
  var knownTypes = TYPES.map(function(t){return t.id;});
  var customCnt = records.filter(function(r){return knownTypes.indexOf(r.type)<0;}).length;
  var milkV = records.filter(function(r){return r.type==='喝奶'}).reduce(function(s,r){return s+(parseFloat(r.detail)||0);},0);
  document.getElementById('summaryBar').innerHTML =
    '<div class="summary-item"><div class="s-val s-milk">' + cnt('喝奶') + '</div><div class="s-label">🍼 喝奶次数</div></div>' +
    '<div class="summary-item"><div class="s-val s-milk">' + (milkV === 0 ? '0' : milkV + 'ml') + '</div><div class="s-label">🥛 总奶量</div></div>' +
    '<div class="summary-item"><div class="s-val s-sleep">' + formatHours(sD(['小睡','长睡'])) + '</div><div class="s-label">😴 睡眠时长</div></div>' +
    '<div class="summary-item"><div class="s-val s-play">' + formatHours(sD(['玩耍','外出'])) + '</div><div class="s-label">🎯 玩耍时长</div></div>' +
    '<div class="summary-item"><div class="s-val s-xihu">' + cnt('拉臭臭') + '</div><div class="s-label">💩 拉臭臭次数</div></div>' +
    '<div class="summary-item"><div class="s-val s-xihu">' + cnt('洗澡') + '</div><div class="s-label">🛁 洗澡次数</div></div>' +
    '<div class="summary-item"><div class="s-val s-xuexi">' + formatHours(sD(['学习'])) + '</div><div class="s-label">📖 学习时长</div></div>' +
    '<div class="summary-item"><div class="s-val" style="color:#909399">' + (cnt('其他')+cnt('辅食')+customCnt) + '</div><div class="s-label">📌 其他</div></div>';
  renderTimeline(records);
}

// ==================== 时间轴进度条 ====================
function renderTimeline(records) {
  var bar = document.getElementById('timelineBar');
  var nowLine = document.getElementById('timelineNow');
  var totalMin = 24 * 60;

  if (currentDate === currentDateBJ()) {
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
  if (activeFilter) {
    filtered = records.filter(function(r) {
      var t = TYPES.filter(function(x){return x.id===r.type;})[0];
      return t && t.category === activeFilter;
    });
  }

  if (filtered.length === 0) return;

  var items = [];
  filtered.forEach(function(r) {
    var sm = timeToMinutes(r.start);
    if (sm < 0) return;
    var em = r.end ? timeToMinutes(r.end) : sm;
    if (em < sm) em += totalMin;
    var t = TYPES.filter(function(x){return x.id===r.type;})[0];
    if (!t) t = { id: r.type, icon: '📌', css: 'zidingyi', category: 'zidingyi' };
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
    if (widthPct > 3) {
      seg.innerHTML = '<span class="seg-label">' + item.label + '</span>';
    }
    bar.appendChild(seg);
  });
}

// ==================== 时间轴分类筛选 ====================
function toggleFilter(cat, el) {
  if (activeFilter === cat) {
    // 取消筛选
    activeFilter = '';
    el.classList.remove('dimmed');
    // 恢复全部图例
    var legends = document.querySelectorAll('#timelineLegend span');
    legends.forEach(function(s) { s.classList.remove('dimmed'); });
  } else {
    // 选中该分类，其他变暗
    activeFilter = cat;
    var legends = document.querySelectorAll('#timelineLegend span');
    legends.forEach(function(s) { s.classList.toggle('dimmed', s.dataset.cat !== cat); });
  }
  renderRecords();
  renderSummary();
}

// ==================== 按需加载 Excel 导出模块 ====================
// loadXlsxModule() 定义在 lib/utils.js 中
// 包装导出函数，确保模块已加载
function exportExcelLazy() {
  loadXlsxModule(function() {
    exportExcel();
  });
}
function exportDataLazy() {
  loadXlsxModule(function() {
    exportData();
  });
}
function importDataLazy(event) {
  loadXlsxModule(function() {
    importData(event);
  });
}

// ==================== Tab 切换 ====================
function switchTab(tab) {
  currentTab = tab;
  document.getElementById('tabDaily').className = tab==='daily'?'active':'';
  document.getElementById('tabMonthly').className = tab==='monthly'?'active':'';
  document.getElementById('dailyView').className = tab==='daily'?'daily-view':'daily-view hidden';
  document.getElementById('monthlyView').className = tab==='monthly'?'monthly-view active':'monthly-view';
  if (tab === 'monthly') {
    // 先展示本地数据，再异步从云端拉取当月数据
    renderMonthlySummary();
    if (currentUser) {
      loadMonthFromCloud(summaryYear, summaryMonth).then(function() {
        renderMonthlySummary();
      });
    }
  }
}

function changeSummaryMonth(delta) {
  summaryMonth += delta;
  if (summaryMonth > 12) { summaryMonth = 1; summaryYear++; }
  if (summaryMonth < 1) { summaryMonth = 12; summaryYear--; }
  renderMonthlySummary();
  if (currentUser) {
    loadMonthFromCloud(summaryYear, summaryMonth).then(function() {
      renderMonthlySummary();
    });
  }
}

// ==================== 月度汇总 ====================
function renderMonthlySummary() {
  document.getElementById('msTitle').textContent = summaryYear + '年' + summaryMonth + '月';
  var days = new Date(summaryYear, summaryMonth, 0).getDate();
  var knownTypes = TYPES.map(function(t){return t.id;});
  var cols = ['日期','喝奶次数','总奶量(ml)','喝水次数','辅食次数','小睡次数','长睡次数','总睡眠(分钟)','玩耍次数','总玩耍(分钟)','外出次数','拉臭臭次数','换尿布次数','洗澡次数','学习时间(分钟)','其他次数'];
  var colClasses = ['','col-milk','col-milk','col-milk','col-milk','col-sleep','col-sleep','col-sleep','col-play','col-play','col-play','col-xihu','col-xihu','col-xihu','col-xuexi','col-other'];

  var thead = '<tr>' + cols.map(function(h,i) { return '<th class="'+colClasses[i]+'">'+h+'</th>'; }).join('') + '</tr>';
  var totals = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
  var tbody = '';
  for (var d = 1; d <= days; d++) {
    var ds = summaryYear + '-' + ('0'+summaryMonth).slice(-2) + '-' + ('0'+d).slice(-2);
    var recs = getDayData(ds);
    var cnt = function(t) { return recs.filter(function(r){return r.type===t;}).length; };
    var sD = function(types) { return recs.filter(function(r){return types.indexOf(r.type)>=0;}).reduce(function(s,r){return s+(calcDuration(r.start,r.end)||0);},0); };
    var milkC = cnt('喝奶'), milkV = recs.filter(function(r){return r.type==='喝奶'}).reduce(function(s,r){return s+(parseFloat(r.detail)||0);},0);
    var waterC = cnt('喝水'), fushiC = cnt('辅食'), napC = cnt('小睡'), longC = cnt('长睡'), playC = cnt('玩耍');
    var chouC = cnt('拉臭臭'), niaoC = cnt('换尿布'), zaoC = cnt('洗澡');
    var waichuC = cnt('外出'), xuexiM = sD(['学习']);
    var customC = cnt('其他') + recs.filter(function(r){return knownTypes.indexOf(r.type)<0;}).length;
    var sleepM = sD(['小睡','长睡']), playM = sD(['玩耍','外出']);
    var row = [d+'日', milkC, milkV||'', waterC, fushiC, napC, longC, sleepM, playC, playM, waichuC, chouC, niaoC, zaoC, xuexiM, customC];
    totals[0]+=milkC; totals[1]+=milkV; totals[2]+=waterC; totals[3]+=fushiC; totals[4]+=napC; totals[5]+=longC; totals[6]+=sleepM; totals[7]+=playC; totals[8]+=playM; totals[9]+=waichuC; totals[10]+=chouC; totals[11]+=niaoC; totals[12]+=zaoC; totals[13]+=xuexiM; totals[14]+=customC;
    tbody += '<tr>' + row.map(function(v){ return '<td>'+(v||'')+'</td>'; }).join('') + '</tr>';
  }
  tbody += '<tr class="row-total">' + (['📋 合计'].concat(totals)).map(function(v){ return '<td>'+(v||'')+'</td>'; }).join('') + '</tr>';
  tbody += '<tr class="row-avg">' + (['📐 日均'].concat(totals.map(function(v){ return (v/days).toFixed(1); }))).map(function(v){ return '<td>'+v+'</td>'; }).join('') + '</tr>';
  document.getElementById('msTable').innerHTML = thead + tbody;
}
