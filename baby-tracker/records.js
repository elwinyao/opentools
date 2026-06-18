// ==================== 宝宝作息记录 - 记录 CRUD + 编辑 + 类型选择 + 日期导航 ====================
// 依赖：lib/utils.js (generateId, escapeHtml, toBJISOString)
//       lib/storage.js (getDayData, saveData)
//       lib/cloud-sync.js (syncRecordToCloud, deleteRecordFromCloud, deleteDayFromCloud, loadDayFromCloud)
//       render.js (renderRecords, renderSummary)
//       monthly.js (renderMonthlySummary)
//       App.TYPES, App.selectedType, App.customTypeText, App.currentDate, App.allData, App.currentUser, App.activeFilter

// ==================== 类型网格 ====================
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

    flushSave();
    startSyncQueueProcessor();
    await syncRecordToCloud(record1, App.currentDate);
    await syncRecordToCloud(record2, nextDate);
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
    flushSave();
    startSyncQueueProcessor();
    await syncRecordToCloud(record, App.currentDate);
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
  flushSave();
  renderRecords();
  renderSummary();
  startSyncQueueProcessor();
  await deleteRecordFromCloud(id);
}

async function clearDay() {
  if (!confirm('确定清空 ' + App.currentDate + ' 的所有记录吗？')) return;
  delete App.allData[App.currentDate];
  flushSave();
  renderRecords();
  renderSummary();
  startSyncQueueProcessor();
  await deleteDayFromCloud(App.currentDate);
}

// ==================== 编辑记录 ====================
function startEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) return;
  var t = _resolveType(r.type);
  var el = document.getElementById('rec-' + id);
  if (!el) return;
  el.classList.add('editing');

  // 清空现有内容
  while (el.firstChild) el.removeChild(el.firstChild);

  // <input type="time"> 不支持 24:00，编辑时展示为 23:59，保存时还原
  r._origEnd = r.end;
  var editEnd = r.end === '24:00' ? '23:59' : r.end;
  var isFeeding = r.type === '喝奶' || r.type === '喝水' || r.type === '辅食';

  // ---- icon ----
  var icon = document.createElement('div');
  icon.className = 'record-icon';
  icon.textContent = t.icon;

  // ---- info ----
  var info = document.createElement('div');
  info.className = 'record-info';

  var typeDiv = document.createElement('div');
  typeDiv.className = 'record-type';
  typeDiv.textContent = t.id;

  var timeDiv = document.createElement('div');
  timeDiv.className = 'record-time';
  timeDiv.textContent = '编辑中...';

  info.appendChild(typeDiv);
  info.appendChild(timeDiv);

  // ---- edit-row ----
  var editRow = document.createElement('div');
  editRow.className = 'record-edit-row';

  // time row
  var timeRow = document.createElement('div');
  timeRow.className = 'record-edit-time-row';

  var labelStart = document.createElement('label');
  labelStart.textContent = '开始：';

  var inpStart = document.createElement('input');
  inpStart.type = 'time';
  inpStart.id = 'edit-start-' + id;
  inpStart.value = r.start;
  inpStart.step = '60';

  var labelEnd = document.createElement('label');
  labelEnd.textContent = '结束：';

  var inpEnd = document.createElement('input');
  inpEnd.type = 'time';
  inpEnd.id = 'edit-end-' + id;
  inpEnd.value = editEnd;
  inpEnd.step = '60';

  timeRow.appendChild(labelStart);
  timeRow.appendChild(inpStart);
  timeRow.appendChild(labelEnd);
  timeRow.appendChild(inpEnd);

  // note row
  var noteRow = document.createElement('div');
  noteRow.className = 'record-edit-note-row';

  var labelNote = document.createElement('label');
  labelNote.textContent = '备注：';

  var inpDetail = document.createElement('input');
  inpDetail.type = 'text';
  inpDetail.id = 'edit-detail-' + id;
  inpDetail.value = r.detail || '';
  inpDetail.placeholder = isFeeding ? '数量' : '备注';
  inpDetail.inputMode = isFeeding ? 'decimal' : 'text';

  noteRow.appendChild(labelNote);
  noteRow.appendChild(inpDetail);

  // buttons
  var btnsRow = document.createElement('div');
  btnsRow.className = 'record-edit-btns';

  var saveBtn = document.createElement('button');
  saveBtn.className = 'save-edit-btn';
  saveBtn.type = 'button';
  saveBtn.textContent = '保存';
  saveBtn.addEventListener('click', function(e) { e.preventDefault(); saveEdit(id); });

  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-edit-btn';
  cancelBtn.type = 'button';
  cancelBtn.textContent = '取消';
  cancelBtn.addEventListener('click', function(e) { e.preventDefault(); cancelEdit(id); });

  btnsRow.appendChild(saveBtn);
  btnsRow.appendChild(cancelBtn);

  editRow.appendChild(timeRow);
  editRow.appendChild(noteRow);
  editRow.appendChild(btnsRow);

  // ---- assemble ----
  el.appendChild(icon);
  el.appendChild(info);
  el.appendChild(editRow);
}

async function saveEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (!r) { renderRecords(); renderSummary(); return; }
  var startEl = document.getElementById('edit-start-' + id);
  var endEl = document.getElementById('edit-end-' + id);
  var detailEl = document.getElementById('edit-detail-' + id);
  if (!startEl) { renderRecords(); renderSummary(); return; }
  var start = startEl.value;
  var end = endEl ? endEl.value : '';
  var detail = detailEl ? detailEl.value.trim() : '';
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
    // 先写 localStorage（同步），再异步写云端
    flushSave();
    startSyncQueueProcessor();
    await syncRecordToCloud(r, App.currentDate);
    await syncRecordToCloud(record2, nextDate);
  } else {
    r.start = start; r.end = end; r.detail = detail;
    r.updatedAt = toBJISOString();
    App.allData[App.currentDate] = records.sort(function(a,b){return (a.start||'99:99').localeCompare(b.start||'99:99');});
    // 先写 localStorage（同步），再异步写云端
    flushSave();
    startSyncQueueProcessor();
    await syncRecordToCloud(r, App.currentDate);
  }

  // 清除临时标记
  delete r._origEnd;

  // 云端写入完成后再刷新 UI
  renderRecords();
  renderSummary();
}

function cancelEdit(id) {
  var records = getDayData(App.currentDate);
  var r = records.filter(function(x){return x.id===id;})[0];
  if (r) delete r._origEnd;
  renderRecords();
}
