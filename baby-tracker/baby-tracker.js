// ==================== 宝宝作息记录 - 页面逻辑 ====================
// 依赖：app-namespace.js, lib/supabase-config.js, lib/supabase-client.js, lib/supabase-auth.js
//       lib/cloud-sync.js, lib/storage.js, lib/utils.js
// 延迟加载：lib/data-io.js, lib/excel-export.js（首次导出时加载）

// ==================== 页面专属变量（挂载到 App 命名空间） ====================
App.TYPES = [
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

App.currentDate = currentDateBJ();
App.selectedType = '喝奶';
App.customTypeText = '';
App.currentTab = 'daily';
App.summaryYear = undefined;
App.summaryMonth = undefined;
App.syncStatus = 'offline';
App.activeFilter = ''; // 时间轴分类筛选：'' 表示全部

// 本地引用别名，减少 App. 前缀重复（可选优化）
var TYPES = App.TYPES;

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
  App.syncStatus = status;
  var dot = document.querySelector('.sync-dot');
  var text = document.getElementById('syncText');
  dot.className = 'sync-dot ' + status;
  if (status === 'online') {
    text.textContent = '已同步';
  } else if (status === 'syncing') {
    text.textContent = '同步中...';
  } else {
    text.textContent = App.currentUser ? '离线' : '未登录';
  }
}

// ==================== 登录成功回调 ====================
async function onLoginSuccess(user, session) {
  App.currentUser.loginAt = Date.now();
  await saveUserSecure(App.currentUser);
  sessionStorage.removeItem('bt_skip_login');
  hideLogin();
  updateSyncStatus('online');
  setUserDisplay(user.email || '用户');
  // 初始化 Realtime 订阅
  subscribeRealtime(handleRealtimeChange);
  initRealtimeChannel();
  loadDayFromCloud(App.currentDate).then(function() {
    renderRecords();
    renderSummary();
  }).catch(function(e) {
    Logger.warn('登录后加载云端数据失败，使用本地数据', e);
    renderRecords();
    renderSummary();
  });
}

// ==================== 刷新数据（仅当前日期） ====================
async function refreshData() {
  if (!App.currentUser) return;
  updateSyncStatus('syncing');
  try {
    await loadDayFromCloud(App.currentDate);
    updateSyncStatus('online');
  } catch(e) {
    Logger.warn('刷新数据失败', e);
    updateSyncStatus('offline');
  }
  renderRecords();
  renderSummary();
}

// ==================== Service Worker 注册 ====================
function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(function(reg) {
      console.log('[PWA] SW 注册成功:', reg.scope);
    })
    .catch(function(err) {
      Logger.warn('PWA Service Worker 注册失败', err);
    });
}

// ==================== 初始化 ====================
async function init() {
  if (App._initCalled) return;
  App._initCalled = true;

  // 注册 Service Worker（PWA 离线支持）
  registerSW();

  initSupabase();

  // 先渲染 UI 框架（无数据），让页面立即可见
  renderTypeGrid();
  document.getElementById('exportMonth').value = App.currentDate.slice(0, 7);
  var p = App.currentDate.split('-').map(Number);
  App.summaryYear = p[0]; App.summaryMonth = p[1];

  // 并行：恢复会话 + 读取本地数据
  var hasSession = await restoreSession();
  loadData(); // 不管是否登录，先读本地数据

  if (hasSession) {
    // 已登录：先展示本地数据，再异步更新云端数据
    setDate(App.currentDate, true); // skipCloud
    // 初始化 Realtime 订阅
    subscribeRealtime(handleRealtimeChange);
    initRealtimeChannel();
    // 后台异步刷新 token 和云端数据（不阻塞 UI）
    refreshTokenAndCloud();
  } else {
    // 未登录：展示本地数据，并弹出登录弹窗
    // 但如果用户主动跳过登录（sessionStorage 有标记），则不弹窗
    updateSyncStatus('offline');
    clearUserDisplay();
    setDate(App.currentDate, false);
    if (!sessionStorage.getItem('bt_skip_login')) {
      showLogin();
    }
  }

  processSyncQueue();
  setInterval(processSyncQueue, 30000);

  // 时间轴"现在"线每分钟自动移动
  setInterval(updateTimelineNow, 60000);

  // 静默刷新 token 定时器 + 页面可见性监听
  scheduleTokenRefresh();
  setupVisibilityListener();
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
    try { await loadDayFromCloud(App.currentDate); } catch(e) { Logger.warn('后台刷新云端数据失败', e); }
    updateSyncStatus('online');
    // 云端数据到达后刷新 UI
    renderRecords();
    renderSummary();
  } catch(e) {
    Logger.warn('后台刷新 Token 和云端数据失败', e);
    updateSyncStatus('offline');
  }
}

// ==================== 日期导航 ====================
function setDate(dateStr, skipCloud) {
  App.currentDate = dateStr;
  // 切换日期时清除分类筛选，避免干扰其他日期的展示
  if (App.activeFilter) {
    App.activeFilter = '';
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
  if (App.currentUser && !skipCloud) {
    loadDayFromCloud(dateStr).then(function() {
      renderRecords();
      renderSummary();
    }).catch(function(e) {
      Logger.warn('切换日期加载云端数据失败', e);
    });
  }
}

function changeDate(delta) {
  var p = App.currentDate.split('-').map(Number);
  var d = new Date(p[0], p[1]-1, p[2]+delta);
  setDate(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'));
}

// ==================== 类型网格 ====================
function renderTypeGrid() {
  var grid = document.getElementById('typeGrid');
  grid.innerHTML = TYPES.map(function(t) {
    return '<button class="type-btn ' + t.css + (App.selectedType===t.id?' active':'') + '" onclick="selectType(\'' + t.id + '\')">' + t.icon + ' ' + t.id + '</button>';
  }).join('');
}

function selectType(id) {
  App.selectedType = id;
  App.customTypeText = '';
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
  if (!start) { Logger.info('表单校验：开始时间为空'); alert('请填写开始时间'); return; }

  var recordType = App.selectedType;
  if (App.selectedType === '其他') {
    var customVal = document.getElementById('customTypeInput').value.trim();
    recordType = customVal || '其他';
  }

  var now = toBJISOString();
  // 结束时间 < 开始时间 = 跨24点（但 00:00 排除，它等同于 24:00 表示当天结束）
  var crossMidnight = end && end !== '00:00' && end < start;

  if (crossMidnight) {
    // 拆分为2条记录：当天 start~24:00，第二天 00:00~end
    var nextDate = addDays(App.currentDate, 1);

    var record1 = {
      id: generateId(),
      type: recordType,
      start: start,
      end: '24:00',
      detail: detail,
      createdAt: now,
      updatedAt: now
    };
    var record2 = {
      id: generateId(),
      type: recordType,
      start: '00:00',
      end: end,
      detail: detail,
      createdAt: now,
      updatedAt: now
    };

    if (!App.allData[App.currentDate]) App.allData[App.currentDate] = [];
    App.allData[App.currentDate].push(record1);
    App.allData[App.currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });

    if (!App.allData[nextDate]) App.allData[nextDate] = [];
    App.allData[nextDate].push(record2);
    App.allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });

    saveData();
    syncRecordToCloud(record1, App.currentDate);
    syncRecordToCloud(record2, nextDate);
  } else {
    var record = {
      id: generateId(),
      type: recordType,
      start: start,
      end: end,
      detail: detail,
      createdAt: now,
      updatedAt: now
    };

    if (!App.allData[App.currentDate]) App.allData[App.currentDate] = [];
    App.allData[App.currentDate].push(record);
    App.allData[App.currentDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });
    saveData();
    syncRecordToCloud(record, App.currentDate);
  }

  document.getElementById('startTime').value = '';
  document.getElementById('endTime').value = '';
  document.getElementById('detail').value = '';
  document.getElementById('customTypeInput').value = '';
  if (App.selectedType === '其他') {
    document.getElementById('customTypeRow').style.display = 'flex';
  } else {
    document.getElementById('customTypeRow').style.display = 'none';
  }
  renderRecords();
  renderSummary();
}

async function deleteRecord(id) {
  if (!confirm('确定删除这条记录吗？')) return;
  App.allData[App.currentDate] = (App.allData[App.currentDate]||[]).filter(function(r) { return r.id !== id; });
  saveData();
  renderRecords();
  renderSummary();
  deleteRecordFromCloud(id);
}

async function clearDay() {
  if (!confirm('确定清空 ' + App.currentDate + ' 的所有记录吗？')) return;
  delete App.allData[App.currentDate];
  saveData();
  renderRecords();
  renderSummary();
  deleteDayFromCloud(App.currentDate);
}

// ==================== 渲染记录列表 ====================
function renderRecords() {
  var records = getDayData(App.currentDate);
  var container = document.getElementById('recordList');

  // 按分类筛选
  var filtered = records;
  if (App.activeFilter) {
    filtered = records.filter(function(r) {
      var t = TYPES.filter(function(x){return x.id===r.type;})[0];
      return t && t.category === App.activeFilter;
    });
  }

  document.getElementById('todayStats').textContent = '共 ' + records.length + ' 条' + (App.activeFilter ? '（筛选 ' + filtered.length + ' 条）' : '');

  // 清空容器
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
    var t = TYPES.filter(function(x){return x.id===r.type;})[0];
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

// ==================== 编辑记录 ====================
function startEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var t = TYPES.filter(function(x){return x.id===r.type;})[0];
  if (!t) t = { id: escapeHtml(r.type), icon: '📌', css: 'zidingyi', category: 'zidingyi' };
  else t = { id: escapeHtml(t.id), icon: t.icon, css: t.css, category: t.category };
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
        '<input type="time" id="edit-start-' + id + '" value="' + escapeHtml(r.start) + '" step="60">' +
        '<label>结束：</label>' +
        '<input type="time" id="edit-end-' + id + '" value="' + escapeHtml(editEnd) + '" step="60">' +
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
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var start = document.getElementById('edit-start-' + id).value;
  var end = document.getElementById('edit-end-' + id).value;
  var detail = document.getElementById('edit-detail-' + id).value.trim();
  if (!start) { Logger.info('编辑表单校验：开始时间为空'); alert('请填写开始时间'); return; }

  // 如果编辑时 23:59 且原始是 24:00，还原为 24:00
  if (end === '23:59' && r._origEnd === '24:00') end = '24:00';
  // 结束时间 < 开始时间 = 跨24点（但 00:00 排除，它等同于 24:00 表示当天结束）
  var crossMidnight = end && end !== '00:00' && end < start;

  if (crossMidnight) {
    // 编辑后跨天：更新当前记录为当天 start~24:00，再创建第二天 00:00~end
    var nextDate = addDays(App.currentDate, 1);
    r.start = start;
    r.end = '24:00';
    r.detail = detail;
    r.updatedAt = toBJISOString();

    var record2 = {
      id: generateId(),
      type: r.type,
      start: '00:00',
      end: end,
      detail: detail,
      createdAt: toBJISOString(),
      updatedAt: toBJISOString()
    };

    if (!App.allData[nextDate]) App.allData[nextDate] = [];
    App.allData[nextDate].push(record2);
    App.allData[nextDate].sort(function(a,b) { return (a.start||'99:99').localeCompare(b.start||'99:99'); });

    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    saveData();
    syncRecordToCloud(r, App.currentDate);
    syncRecordToCloud(record2, nextDate);
  } else {
    r.start = start; r.end = end; r.detail = detail;
    r.updatedAt = toBJISOString();
    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    saveData();
    syncRecordToCloud(r, App.currentDate);
  }

  renderRecords();
  renderSummary();
}

function cancelEdit(id) { renderRecords(); }

// ==================== 当日概览 ====================
function renderSummary() {
  var records = getDayData(App.currentDate);
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
      var t = TYPES.filter(function(x){return x.id===r.type;})[0];
      return t && t.category === App.activeFilter;
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
    if (widthPct > 3) {
      seg.innerHTML = '<span class="seg-label">' + item.label + '</span>';
    }
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

// ==================== 按需加载 Excel 导出模块 ====================
// loadXlsxModule() 定义在 lib/utils.js 中
// 包装导出函数，确保模块已加载
async function exportExcelLazy() {
  // 先确保从 Supabase 拉取当月最新数据
  if (App.currentUser) {
    var monthVal = document.getElementById('exportMonth').value;
    if (monthVal) {
      var parts = monthVal.split('-').map(Number);
      updateSyncStatus('syncing');
      try {
        await loadMonthFromCloud(parts[0], parts[1]);
        updateSyncStatus('online');
      } catch(e) {
        Logger.warn('导出前加载当月云端数据失败', e);
        updateSyncStatus('offline');
      }
    }
  }
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
  App.currentTab = tab;
  document.getElementById('tabDaily').className = tab==='daily'?'active':'';
  document.getElementById('tabMonthly').className = tab==='monthly'?'active':'';
  document.getElementById('dailyView').className = tab==='daily'?'daily-view':'daily-view hidden';
  document.getElementById('monthlyView').className = tab==='monthly'?'monthly-view active':'monthly-view';
  if (tab === 'monthly') {
    // 先展示本地数据，再异步从云端拉取当月数据
    renderMonthlySummary();
    if (App.currentUser) {
      loadMonthFromCloud(App.summaryYear, App.summaryMonth).then(function() {
        renderMonthlySummary();
      });
    }
  }
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

    if (evt.eventType === 'INSERT') {
      // 新记录插入
      var newRec = {
        id: r.id,
        type: r.type,
        start: r.start_time || '',
        end: r.end_time || '',
        detail: r.detail || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
      if (!App.allData[dateStr]) App.allData[dateStr] = [];
      // 检查是否已存在（去重）
      var dupIdx = -1;
      for (var i = 0; i < App.allData[dateStr].length; i++) {
        if (App.allData[dateStr][i].id === newRec.id) { dupIdx = i; break; }
      }
      if (dupIdx >= 0) {
        // 已存在，比较 updatedAt
        var dupLocalTime = App.allData[dateStr][dupIdx].updatedAt ? new Date(App.allData[dateStr][dupIdx].updatedAt).getTime() : 0;
        var dupCloudTime = newRec.updatedAt ? new Date(newRec.updatedAt).getTime() : 0;
        if (dupCloudTime > dupLocalTime) App.allData[dateStr][dupIdx] = newRec;
      } else {
        App.allData[dateStr].push(newRec);
      }
      App.allData[dateStr].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
    } else if (evt.eventType === 'UPDATE') {
      // 记录更新
      var updatedRec = {
        id: r.id,
        type: r.type,
        start: r.start_time || '',
        end: r.end_time || '',
        detail: r.detail || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
      if (!App.allData[dateStr]) App.allData[dateStr] = [];
      var idx = -1;
      for (var j = 0; j < App.allData[dateStr].length; j++) {
        if (App.allData[dateStr][j].id === updatedRec.id) { idx = j; break; }
      }
      if (idx >= 0) {
        var localTime = App.allData[dateStr][idx].updatedAt ? new Date(App.allData[dateStr][idx].updatedAt).getTime() : 0;
        var cloudTime = updatedRec.updatedAt ? new Date(updatedRec.updatedAt).getTime() : 0;
        // 只有云端版本更新才覆盖本地（本地可能有未同步的编辑）
        if (cloudTime > localTime) App.allData[dateStr][idx] = updatedRec;
      } else {
        App.allData[dateStr].push(updatedRec);
        App.allData[dateStr].sort(function(a, b) { return (a.start || '99:99').localeCompare(b.start || '99:99'); });
      }
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
