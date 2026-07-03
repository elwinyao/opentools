// ==================== 家庭健康记录 - 主逻辑 ====================
'use strict';

// ==================== 命名空间 ====================
window.HApp = {
  members: [],           // [{id, name, emoji, createdAt}]
  currentMemberId: null,
  allData: {},           // { memberId: { 'YYYY-MM-DD': [records] } }
  currentDate: null,     // YYYY-MM-DD
  currentTab: 'daily',
  selectedMetric: null,  // 当前选中的记录类型
  chartMetric: 'blood_sugar',
  chartRange: 7,
  summaryYear: null,
  summaryMonth: null,    // 0-based (0=Jan)
  _editingMemberId: null,
  _selectedEmoji: '👨',
};

// ==================== 配置 ====================
var CONFIG = {
  STORAGE_KEY: 'health_tracker_v1',
  MEMBERS_KEY: 'health_tracker_members_v1',
  EMOJIS: ['👨','👩','👴','👵','👦','👧','🧓','👶','🧑','👮','👷','👩‍⚕️','👨‍⚕️','🧑‍🌾'],
  METRICS: [
    { key: 'blood_sugar',    label: '血糖', icon: '🩸', color: '#E74C3C', unit: 'mmol/L' },
    { key: 'blood_pressure', label: '血压', icon: '💓', color: '#5B9BD5', unit: 'mmHg' },
    { key: 'weight',         label: '体重', icon: '⚖️', color: '#70AD47', unit: 'kg' },
    { key: 'temperature',    label: '体温', icon: '🌡️', color: '#ED7D31', unit: '°C' },
    { key: 'custom',         label: '其他', icon: '📝', color: '#909399', unit: '' },
  ],
  RANGES: {
    blood_sugar_fasting:    { min: 3.9, max: 6.1,  label: '空腹正常' },
    blood_sugar_postmeal:   { min: 3.9, max: 7.8,  label: '餐后正常' },
    bp_systolic:            { min: 90,  max: 140,  label: '收缩压正常' },
    bp_diastolic:           { min: 60,  max: 90,   label: '舒张压正常' },
    temperature:            { min: 36.0,max: 37.3, label: '体温正常' },
  },
};

// ==================== 工具函数 ====================
function nowBJ() {
  var now = new Date();
  var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utcMs + 8 * 3600000);
}

function currentDateStr() {
  var d = nowBJ();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function generateId() {
  var hex = crypto.randomUUID().replace(/-/g, '').slice(0, 15);
  return parseInt(hex, 16);
}

function fmtDate(year, month, day) {
  return year + '-' + ('0' + month).slice(-2) + '-' + ('0' + day).slice(-2);
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function downloadBlob(blob, filename) {
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
}

function getMetricDef(key) {
  for (var i = 0; i < CONFIG.METRICS.length; i++) {
    if (CONFIG.METRICS[i].key === key) return CONFIG.METRICS[i];
  }
  return null;
}

function isAbnormal(record) {
  if (record.type === 'blood_sugar') {
    var period = record.extra && record.extra.period;
    var range = period === 'postmeal' ? CONFIG.RANGES.blood_sugar_postmeal : CONFIG.RANGES.blood_sugar_fasting;
    return record.value < range.min || record.value > range.max;
  }
  if (record.type === 'blood_pressure') {
    var s = record.extra && record.extra.systolic;
    var d = record.extra && record.extra.diastolic;
    return s < CONFIG.RANGES.bp_systolic.min || s > CONFIG.RANGES.bp_systolic.max ||
           d < CONFIG.RANGES.bp_diastolic.min || d > CONFIG.RANGES.bp_diastolic.max;
  }
  if (record.type === 'temperature') {
    return record.value < CONFIG.RANGES.temperature.min || record.value > CONFIG.RANGES.temperature.max;
  }
  return false;
}

function formatValue(record) {
  if (record.type === 'blood_pressure') {
    var s = record.extra ? record.extra.systolic : '';
    var d = record.extra ? record.extra.diastolic : '';
    var hr = record.extra && record.extra.heartRate ? ' (心率' + record.extra.heartRate + ')' : '';
    return s + '/' + d + ' mmHg' + hr;
  }
  var def = getMetricDef(record.type);
  var unit = def ? def.unit : '';
  var val = record.value;
  if (record.type === 'blood_sugar') {
    var period = record.extra && record.extra.period;
    var pl = period === 'postmeal' ? '餐后' : '空腹';
    return val + ' ' + unit + ' (' + pl + ')';
  }
  if (record.type === 'custom') {
    var cn = record.extra && record.extra.customName ? record.extra.customName : '';
    return cn + ': ' + val;
  }
  return val + (unit ? ' ' + unit : '');
}

// ==================== 数据持久化 ====================
function saveData() {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(HApp.allData));
    localStorage.setItem(CONFIG.MEMBERS_KEY, JSON.stringify(HApp.members));
  } catch (e) {
    console.error('保存失败:', e);
  }
}

function loadData() {
  try {
    var d = localStorage.getItem(CONFIG.STORAGE_KEY);
    HApp.allData = d ? JSON.parse(d) : {};
    var m = localStorage.getItem(CONFIG.MEMBERS_KEY);
    HApp.members = m ? JSON.parse(m) : [];
  } catch (e) {
    console.error('加载失败:', e);
    HApp.allData = {};
    HApp.members = [];
  }
}

function getMemberData(memberId, dateStr) {
  if (!HApp.allData[memberId]) return [];
  if (!HApp.allData[memberId][dateStr]) return [];
  return HApp.allData[memberId][dateStr];
}

function getAllMemberRecords(memberId, days) {
  var result = [];
  if (!HApp.allData[memberId]) return result;
  var now = nowBJ();
  for (var i = 0; i < days; i++) {
    var d = new Date(now.getTime() - i * 86400000);
    var ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    var recs = HApp.allData[memberId][ds] || [];
    for (var j = 0; j < recs.length; j++) {
      result.push(recs[j]);
    }
  }
  return result;
}

// ==================== 成员管理 ====================
function renderMemberBar() {
  var bar = document.getElementById('memberBar');
  bar.textContent = '';
  
  for (var i = 0; i < HApp.members.length; i++) {
    var m = HApp.members[i];
    (function(member) {
      var pill = document.createElement('div');
      pill.className = 'member-pill' + (member.id === HApp.currentMemberId ? ' active' : '');
      pill.setAttribute('data-action', 'switch-member');
      pill.setAttribute('data-member-id', String(member.id));
      
      var emoji = document.createElement('span');
      emoji.className = 'pill-emoji';
      emoji.textContent = member.emoji;
      pill.appendChild(emoji);
      
      var name = document.createElement('span');
      name.textContent = member.name;
      pill.appendChild(name);
      
      bar.appendChild(pill);
    })(m);
  }
  
  // 编辑按钮
  if (HApp.members.length > 0) {
    var editBtn = document.createElement('button');
    editBtn.className = 'member-edit-btn';
    editBtn.textContent = '✏️';
    editBtn.setAttribute('data-action', 'edit-member');
    bar.appendChild(editBtn);
  }
  
  // 添加按钮
  var addBtn = document.createElement('button');
  addBtn.className = 'member-add';
  addBtn.textContent = '＋';
  addBtn.setAttribute('data-action', 'add-member');
  bar.appendChild(addBtn);
}

function openMemberModal(editId) {
  HApp._editingMemberId = editId || null;
  var modal = document.getElementById('memberModal');
  var title = document.getElementById('memberModalTitle');
  var nameInput = document.getElementById('memberNameInput');
  var btnsContainer = document.getElementById('memberModalBtns');
  
  title.textContent = editId ? '编辑成员' : '添加成员';
  nameInput.value = '';
  HApp._selectedEmoji = '👨';
  
  if (editId) {
    var m = null;
    for (var i = 0; i < HApp.members.length; i++) {
      if (HApp.members[i].id === editId) { m = HApp.members[i]; break; }
    }
    if (m) {
      nameInput.value = m.name;
      HApp._selectedEmoji = m.emoji;
    }
  }
  
  // 渲染 emoji 选择
  var grid = document.getElementById('emojiGrid');
  grid.textContent = '';
  for (var j = 0; j < CONFIG.EMOJIS.length; j++) {
    (function(emoji) {
      var opt = document.createElement('div');
      opt.className = 'emoji-option' + (emoji === HApp._selectedEmoji ? ' selected' : '');
      opt.textContent = emoji;
      opt.setAttribute('data-action', 'select-emoji');
      opt.setAttribute('data-emoji', emoji);
      grid.appendChild(opt);
    })(CONFIG.EMOJIS[j]);
  }
  
  // 渲染按钮
  btnsContainer.textContent = '';
  var cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn-cancel';
  cancelBtn.textContent = '取消';
  cancelBtn.setAttribute('data-action', 'member-modal-cancel');
  btnsContainer.appendChild(cancelBtn);
  
  if (editId) {
    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete';
    deleteBtn.textContent = '删除';
    deleteBtn.setAttribute('data-action', 'member-modal-delete');
    btnsContainer.appendChild(deleteBtn);
  }
  
  var saveBtn = document.createElement('button');
  saveBtn.className = 'btn-save';
  saveBtn.textContent = '保存';
  saveBtn.setAttribute('data-action', 'member-modal-save');
  btnsContainer.appendChild(saveBtn);
  
  modal.classList.add('show');
  nameInput.focus();
}

function closeMemberModal() {
  document.getElementById('memberModal').classList.remove('show');
  HApp._editingMemberId = null;
}

function saveMember() {
  var name = document.getElementById('memberNameInput').value.trim();
  if (!name) { name = '成员' + (HApp.members.length + 1); }
  
  if (HApp._editingMemberId) {
    // 编辑
    for (var i = 0; i < HApp.members.length; i++) {
      if (HApp.members[i].id === HApp._editingMemberId) {
        HApp.members[i].name = name;
        HApp.members[i].emoji = HApp._selectedEmoji;
        break;
      }
    }
  } else {
    // 新增
    var newMember = {
      id: generateId(),
      name: name,
      emoji: HApp._selectedEmoji,
      createdAt: new Date().toISOString()
    };
    HApp.members.push(newMember);
    HApp.currentMemberId = newMember.id;
    HApp.allData[newMember.id] = {};
  }
  
  saveData();
  closeMemberModal();
  renderMemberBar();
  renderAll();
}

function deleteMember() {
  if (!HApp._editingMemberId) return;
  var id = HApp._editingMemberId;
  
  // 从数组中删除
  HApp.members = HApp.members.filter(function(m) { return m.id !== id; });
  // 删除数据
  delete HApp.allData[id];
  
  // 切换到第一个成员
  if (HApp.members.length > 0) {
    HApp.currentMemberId = HApp.members[0].id;
  } else {
    HApp.currentMemberId = null;
  }
  
  saveData();
  closeMemberModal();
  renderMemberBar();
  renderAll();
}

function switchMember(id) {
  HApp.currentMemberId = id;
  renderMemberBar();
  renderAll();
}

// ==================== 类型选择 ====================
function renderTypeGrid() {
  var grid = document.getElementById('typeGrid');
  grid.textContent = '';
  
  for (var i = 0; i < CONFIG.METRICS.length; i++) {
    (function(m) {
      var btn = document.createElement('div');
      btn.className = 'type-btn' + (HApp.selectedMetric === m.key ? ' active' : '');
      btn.setAttribute('data-action', 'select-metric');
      btn.setAttribute('data-metric', m.key);
      
      var icon = document.createElement('div');
      icon.className = 'type-icon';
      icon.textContent = m.icon;
      btn.appendChild(icon);
      
      var label = document.createElement('div');
      label.textContent = m.label;
      btn.appendChild(label);
      
      grid.appendChild(btn);
    })(CONFIG.METRICS[i]);
  }
}

function selectMetric(key) {
  HApp.selectedMetric = key;
  renderTypeGrid();
  renderDynamicInputs();
}

// ==================== 动态输入字段 ====================
function renderDynamicInputs() {
  var container = document.getElementById('dynamicInputs');
  container.textContent = '';
  
  if (!HApp.selectedMetric) return;
  
  if (HApp.selectedMetric === 'blood_sugar') {
    container.appendChild(createInputRow('数值', 'number', 'bsValue', 'mmol/L', '0.1', 'step'));
    container.appendChild(createSelectRow('时段', 'bsPeriod', [
      { value: 'fasting', text: '空腹' },
      { value: 'postmeal', text: '餐后2h' }
    ]));
  } else if (HApp.selectedMetric === 'blood_pressure') {
    container.appendChild(createInputRow('高压', 'number', 'bpSys', '收缩压', '1', 'step'));
    container.appendChild(createInputRow('低压', 'number', 'bpDia', '舒张压', '1', 'step'));
    container.appendChild(createInputRow('心率', 'number', 'bpHr', '次/分 (可选)', '1', 'step'));
  } else if (HApp.selectedMetric === 'weight') {
    container.appendChild(createInputRow('体重', 'number', 'weightVal', 'kg', '0.1', 'step'));
  } else if (HApp.selectedMetric === 'temperature') {
    container.appendChild(createInputRow('体温', 'number', 'tempVal', '°C', '0.1', 'step'));
  } else if (HApp.selectedMetric === 'custom') {
    container.appendChild(createInputRow('名称', 'text', 'customName', '如：心率、血氧等', '', ''));
    container.appendChild(createInputRow('数值', 'text', 'customVal', '测量值', '', ''));
  }
}

function createInputRow(label, type, id, placeholder, step, stepAttr) {
  var row = document.createElement('div');
  row.className = 'input-row';
  
  var lab = document.createElement('label');
  lab.textContent = label + '：';
  row.appendChild(lab);
  
  var input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.placeholder = placeholder;
  if (step && type === 'number') {
    input.setAttribute('step', step);
    input.setAttribute('inputmode', 'decimal');
  }
  row.appendChild(input);
  
  return row;
}

function createSelectRow(label, id, options) {
  var row = document.createElement('div');
  row.className = 'input-row';
  
  var lab = document.createElement('label');
  lab.textContent = label + '：';
  row.appendChild(lab);
  
  var select = document.createElement('select');
  select.id = id;
  for (var i = 0; i < options.length; i++) {
    var opt = document.createElement('option');
    opt.value = options[i].value;
    opt.textContent = options[i].text;
    select.appendChild(opt);
  }
  row.appendChild(select);
  
  return row;
}

// ==================== 添加记录 ====================
function addRecord() {
  if (!HApp.currentMemberId) {
    alert('请先添加家庭成员');
    return;
  }
  if (!HApp.selectedMetric) {
    alert('请选择记录类型');
    return;
  }
  
  var time = document.getElementById('recordTime').value;
  if (!time) time = String(nowBJ().getHours()).padStart(2, '0') + ':' + String(nowBJ().getMinutes()).padStart(2, '0');
  
  var note = document.getElementById('recordNote').value.trim();
  var record = {
    id: generateId(),
    date: HApp.currentDate,
    time: time,
    type: HApp.selectedMetric,
    value: 0,
    extra: {},
    note: note,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  if (HApp.selectedMetric === 'blood_sugar') {
    var val = parseFloat(document.getElementById('bsValue').value);
    if (isNaN(val)) { alert('请输入血糖数值'); return; }
    record.value = val;
    record.extra.period = document.getElementById('bsPeriod').value;
  } else if (HApp.selectedMetric === 'blood_pressure') {
    var sys = parseInt(document.getElementById('bpSys').value);
    var dia = parseInt(document.getElementById('bpDia').value);
    if (isNaN(sys) || isNaN(dia)) { alert('请输入高压和低压'); return; }
    var hr = document.getElementById('bpHr').value;
    record.extra.systolic = sys;
    record.extra.diastolic = dia;
    if (hr) record.extra.heartRate = parseInt(hr);
    record.value = sys; // 主值用收缩压
  } else if (HApp.selectedMetric === 'weight') {
    var w = parseFloat(document.getElementById('weightVal').value);
    if (isNaN(w)) { alert('请输入体重'); return; }
    record.value = w;
  } else if (HApp.selectedMetric === 'temperature') {
    var t = parseFloat(document.getElementById('tempVal').value);
    if (isNaN(t)) { alert('请输入体温'); return; }
    record.value = t;
  } else if (HApp.selectedMetric === 'custom') {
    var cn = document.getElementById('customName').value.trim();
    var cv = document.getElementById('customVal').value.trim();
    if (!cn) { alert('请输入自定义名称'); return; }
    record.extra.customName = cn;
    record.value = isNaN(parseFloat(cv)) ? cv : parseFloat(cv);
  }
  
  // 存入数据
  if (!HApp.allData[HApp.currentMemberId]) HApp.allData[HApp.currentMemberId] = {};
  if (!HApp.allData[HApp.currentMemberId][HApp.currentDate]) HApp.allData[HApp.currentMemberId][HApp.currentDate] = [];
  HApp.allData[HApp.currentMemberId][HApp.currentDate].push(record);
  
  saveData();
  
  // 清空输入
  document.getElementById('recordNote').value = '';
  if (HApp.selectedMetric === 'blood_sugar') {
    document.getElementById('bsValue').value = '';
  } else if (HApp.selectedMetric === 'blood_pressure') {
    document.getElementById('bpSys').value = '';
    document.getElementById('bpDia').value = '';
    document.getElementById('bpHr').value = '';
  } else if (HApp.selectedMetric === 'weight') {
    document.getElementById('weightVal').value = '';
  } else if (HApp.selectedMetric === 'temperature') {
    document.getElementById('tempVal').value = '';
  } else if (HApp.selectedMetric === 'custom') {
    document.getElementById('customName').value = '';
    document.getElementById('customVal').value = '';
  }
  
  renderRecordList();
  renderSummaryBar();
}

function deleteRecord(id) {
  if (!HApp.currentMemberId) return;
  var recs = HApp.allData[HApp.currentMemberId] && HApp.allData[HApp.currentMemberId][HApp.currentDate];
  if (!recs) return;
  HApp.allData[HApp.currentMemberId][HApp.currentDate] = recs.filter(function(r) { return r.id !== id; });
  saveData();
  renderRecordList();
  renderSummaryBar();
}

function clearDay() {
  if (!HApp.currentMemberId) return;
  if (!confirm('确认清空 ' + HApp.currentDate + ' 的所有记录？')) return;
  if (HApp.allData[HApp.currentMemberId]) {
    HApp.allData[HApp.currentMemberId][HApp.currentDate] = [];
  }
  saveData();
  renderRecordList();
  renderSummaryBar();
}

// ==================== 记录列表渲染 ====================
function renderRecordList() {
  var list = document.getElementById('recordList');
  var stats = document.getElementById('todayStats');
  list.textContent = '';
  
  if (!HApp.currentMemberId) {
    list.appendChild(createEmptyState('👤', '请先添加家庭成员'));
    stats.textContent = '';
    return;
  }
  
  var recs = getMemberData(HApp.currentMemberId, HApp.currentDate);
  if (recs.length === 0) {
    list.appendChild(createEmptyState('📋', '今日暂无记录'));
    stats.textContent = '';
    return;
  }
  
  // 按时间排序
  recs.sort(function(a, b) { return a.time.localeCompare(b.time); });
  
  stats.textContent = '共 ' + recs.length + ' 条记录';
  
  for (var i = 0; i < recs.length; i++) {
    list.appendChild(createRecordItem(recs[i]));
  }
}

function createRecordItem(record) {
  var def = getMetricDef(record.type);
  var icon = def ? def.icon : '📝';
  var color = def ? def.color : '#909399';
  var abnormal = isAbnormal(record);
  
  var item = document.createElement('div');
  item.className = 'record-item';
  item.style.borderLeftColor = color;
  
  var iconEl = document.createElement('div');
  iconEl.className = 'record-icon';
  iconEl.textContent = icon;
  item.appendChild(iconEl);
  
  var info = document.createElement('div');
  info.className = 'record-info';
  
  var typeEl = document.createElement('div');
  typeEl.className = 'record-type';
  typeEl.textContent = def ? def.label : '其他';
  info.appendChild(typeEl);
  
  var timeEl = document.createElement('div');
  timeEl.className = 'record-time';
  timeEl.textContent = record.time;
  info.appendChild(timeEl);
  
  var detailEl = document.createElement('div');
  detailEl.className = 'record-detail';
  detailEl.textContent = formatValue(record);
  if (record.note) detailEl.textContent += ' | ' + record.note;
  info.appendChild(detailEl);
  
  item.appendChild(info);
  
  var status = document.createElement('span');
  status.className = 'record-status ' + (abnormal ? 'abnormal' : 'normal');
  status.textContent = abnormal ? '⚠️ 异常' : '✓ 正常';
  item.appendChild(status);
  
  var delBtn = document.createElement('button');
  delBtn.className = 'delete-btn';
  delBtn.textContent = '🗑';
  delBtn.setAttribute('data-action', 'delete-record');
  delBtn.setAttribute('data-record-id', String(record.id));
  item.appendChild(delBtn);
  
  return item;
}

function createEmptyState(emoji, text) {
  var div = document.createElement('div');
  div.className = 'empty-state';
  
  var e = document.createElement('div');
  e.className = 'emoji';
  e.textContent = emoji;
  div.appendChild(e);
  
  var t = document.createElement('div');
  t.textContent = text;
  div.appendChild(t);
  
  return div;
}

// ==================== 概览卡片 ====================
function renderSummaryBar() {
  var bar = document.getElementById('summaryBar');
  bar.textContent = '';
  
  if (!HApp.currentMemberId) return;
  
  var recs = getMemberData(HApp.currentMemberId, HApp.currentDate);
  
  // 找最新值
  var latest = {};
  for (var i = recs.length - 1; i >= 0; i--) {
    var r = recs[i];
    if (!latest[r.type]) latest[r.type] = r;
  }
  
  var metrics = ['blood_sugar', 'blood_pressure', 'weight', 'temperature'];
  for (var j = 0; j < metrics.length; j++) {
    (function(key) {
      var def = getMetricDef(key);
      var rec = latest[key];
      var item = document.createElement('div');
      item.className = 'summary-item';
      
      var status = document.createElement('div');
      status.className = 's-status ' + (rec ? (isAbnormal(rec) ? 'abnormal' : 'normal') : 'none');
      item.appendChild(status);
      
      var icon = document.createElement('div');
      icon.className = 's-icon';
      icon.textContent = def.icon;
      item.appendChild(icon);
      
      var val = document.createElement('div');
      val.className = 's-val';
      if (rec) {
        if (key === 'blood_pressure') {
          val.textContent = rec.extra.systolic + '/' + rec.extra.diastolic;
        } else {
          val.textContent = rec.value;
        }
      } else {
        val.textContent = '--';
      }
      item.appendChild(val);
      
      var lab = document.createElement('div');
      lab.className = 's-label';
      lab.textContent = def.label;
      item.appendChild(lab);
      
      bar.appendChild(item);
    })(metrics[j]);
  }
}

// ==================== 日期导航 ====================
function renderDate() {
  var parts = HApp.currentDate.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]);
  var day = parseInt(parts[2]);
  var d = new Date(year, month - 1, day);
  var weekDays = ['周日','周一','周二','周三','周四','周五','周六'];
  
  document.getElementById('dateText').textContent = month + '月' + day + '日';
  document.getElementById('dateSub').textContent = year + '年 · ' + weekDays[d.getDay()];
  
  var today = currentDateStr();
  var headerDate = document.getElementById('headerDate');
  var nd = nowBJ();
  headerDate.textContent = nd.getFullYear() + '年' + (nd.getMonth() + 1) + '月' + nd.getDate() + '日 ' + weekDays[nd.getDay()];
}

function prevDate() {
  var parts = HApp.currentDate.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() - 1);
  HApp.currentDate = fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  renderDate();
  renderRecordList();
  renderSummaryBar();
}

function nextDate() {
  var parts = HApp.currentDate.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + 1);
  HApp.currentDate = fmtDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
  renderDate();
  renderRecordList();
  renderSummaryBar();
}

// ==================== Tab 切换 ====================
function switchTab(tab) {
  HApp.currentTab = tab;
  document.getElementById('tabDaily').classList.toggle('active', tab === 'daily');
  document.getElementById('tabChart').classList.toggle('active', tab === 'chart');
  document.getElementById('tabMonthly').classList.toggle('active', tab === 'monthly');
  document.getElementById('dailyView').classList.toggle('active', tab === 'daily');
  document.getElementById('chartView').classList.toggle('active', tab === 'chart');
  document.getElementById('monthlyView').classList.toggle('active', tab === 'monthly');
  
  if (tab === 'chart') renderChart();
  if (tab === 'monthly') renderMonthlySummary();
}

// ==================== 图表 ====================
function renderChartMetricRow() {
  var row = document.getElementById('chartMetricRow');
  row.textContent = '';
  
  var metrics = ['blood_sugar', 'blood_pressure', 'weight', 'temperature'];
  for (var i = 0; i < metrics.length; i++) {
    (function(key) {
      var def = getMetricDef(key);
      var btn = document.createElement('button');
      btn.className = 'chart-metric-btn' + (HApp.chartMetric === key ? ' active' : '');
      btn.setAttribute('data-action', 'chart-metric');
      btn.setAttribute('data-metric', key);
      btn.textContent = def.icon + ' ' + def.label;
      row.appendChild(btn);
    })(metrics[i]);
  }
}

function renderChart() {
  renderChartMetricRow();
  
  var wrap = document.getElementById('chartWrap');
  var legend = document.getElementById('chartLegend');
  wrap.textContent = '';
  legend.textContent = '';
  
  if (!HApp.currentMemberId) {
    wrap.appendChild(createEmptyState('👤', '请先添加家庭成员'));
    return;
  }
  
  var records = getAllMemberRecords(HApp.currentMemberId, HApp.chartRange);
  // 筛选当前指标
  var filtered = records.filter(function(r) { return r.type === HApp.chartMetric; });
  
  if (filtered.length === 0) {
    wrap.appendChild(createEmptyState('📊', '暂无' + getMetricDef(HApp.chartMetric).label + '数据'));
    return;
  }
  
  // 按日期+时间排序
  filtered.sort(function(a, b) {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.time.localeCompare(b.time);
  });
  
  drawLineChart(wrap, filtered, HApp.chartMetric);
  renderChartLegend(legend, HApp.chartMetric);
}

function drawLineChart(container, records, metricKey) {
  var def = getMetricDef(metricKey);
  var W = 800, H = 400;
  var padL = 60, padR = 30, padT = 30, padB = 50;
  var chartW = W - padL - padR;
  var chartH = H - padT - padB;
  
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'chart-svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  
  // 收集数据点
  var isBP = metricKey === 'blood_pressure';
  var points1 = [], points2 = [];
  var minVal = Infinity, maxVal = -Infinity;
  
  for (var i = 0; i < records.length; i++) {
    var r = records[i];
    var x = i; // 按顺序排列
    if (isBP) {
      var sys = r.extra ? r.extra.systolic : 0;
      var dia = r.extra ? r.extra.diastolic : 0;
      points1.push({ x: x, y: sys, record: r });
      points2.push({ x: x, y: dia, record: r });
      if (sys < minVal) minVal = sys;
      if (sys > maxVal) maxVal = sys;
      if (dia < minVal) minVal = dia;
      if (dia > maxVal) maxVal = dia;
    } else {
      points1.push({ x: x, y: r.value, record: r });
      if (r.value < minVal) minVal = r.value;
      if (r.value > maxVal) maxVal = r.value;
    }
  }
  
  // Y 轴范围
  var range = null;
  if (metricKey === 'blood_sugar') {
    range = CONFIG.RANGES.blood_sugar_fasting;
  } else if (metricKey === 'temperature') {
    range = CONFIG.RANGES.temperature;
  } else if (metricKey === 'blood_pressure') {
    range = CONFIG.RANGES.bp_systolic;
  }
  
  var yMin, yMax;
  if (range) {
    yMin = Math.min(minVal, range.min) - 1;
    yMax = Math.max(maxVal, range.max) + 1;
  } else {
    yMin = minVal - (maxVal - minVal) * 0.1 - 1;
    yMax = maxVal + (maxVal - minVal) * 0.1 + 1;
  }
  if (yMin < 0) yMin = 0;
  
  var totalPoints = records.length;
  var xScale = function(idx) { return padL + (totalPoints <= 1 ? chartW / 2 : (idx / (totalPoints - 1)) * chartW); };
  var yScale = function(val) { return padT + chartH - ((val - yMin) / (yMax - yMin)) * chartH; };
  
  // defs - 渐变
  var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  var grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
  grad.setAttribute('id', 'areaGrad');
  grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
  grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
  var s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', def.color); s1.setAttribute('stop-opacity', '0.25');
  grad.appendChild(s1);
  var s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
  s2.setAttribute('offset', '100%'); s2.setAttribute('stop-color', def.color); s2.setAttribute('stop-opacity', '0.02');
  grad.appendChild(s2);
  defs.appendChild(grad);
  svg.appendChild(defs);
  
  // 正常范围带
  if (range) {
    var rangeY1 = yScale(range.max);
    var rangeY2 = yScale(range.min);
    var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', padL);
    rect.setAttribute('y', rangeY1);
    rect.setAttribute('width', chartW);
    rect.setAttribute('height', Math.max(0, rangeY2 - rangeY1));
    rect.setAttribute('fill', '#2E7D32');
    rect.setAttribute('opacity', '0.08');
    svg.appendChild(rect);
    
    // 范围标签
    var rangeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    rangeLabel.setAttribute('x', padL + chartW - 5);
    rangeLabel.setAttribute('y', rangeY1 - 5);
    rangeLabel.setAttribute('fill', '#2E7D32');
    rangeLabel.setAttribute('font-size', '10');
    rangeLabel.setAttribute('text-anchor', 'end');
    rangeLabel.setAttribute('opacity', '0.6');
    rangeLabel.textContent = '正常 ' + range.min + '-' + range.max;
    svg.appendChild(rangeLabel);
  }
  
  // Y 轴网格线 + 标签
  var ySteps = 5;
  for (var yi = 0; yi <= ySteps; yi++) {
    var val = yMin + (yMax - yMin) * yi / ySteps;
    var y = yScale(val);
    
    var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', padL);
    line.setAttribute('y1', y);
    line.setAttribute('x2', W - padR);
    line.setAttribute('y2', y);
    line.setAttribute('stroke', '#eee');
    line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
    
    var label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    label.setAttribute('x', padL - 8);
    label.setAttribute('y', y + 4);
    label.setAttribute('fill', '#999');
    label.setAttribute('font-size', '11');
    label.setAttribute('text-anchor', 'end');
    label.textContent = val.toFixed(1);
    svg.appendChild(label);
  }
  
  // X 轴日期标签（最多显示 8 个）
  var xLabelCount = Math.min(totalPoints, 8);
  var xStep = Math.max(1, Math.floor(totalPoints / xLabelCount));
  for (var xi = 0; xi < totalPoints; xi += xStep) {
    var x = xScale(xi);
    var parts = records[xi].date.split('-');
    var dateLabel = parseInt(parts[1]) + '/' + parseInt(parts[2]);
    
    var tlabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tlabel.setAttribute('x', x);
    tlabel.setAttribute('y', H - padB + 20);
    tlabel.setAttribute('fill', '#999');
    tlabel.setAttribute('font-size', '11');
    tlabel.setAttribute('text-anchor', 'middle');
    tlabel.textContent = dateLabel;
    svg.appendChild(tlabel);
  }
  
  // 绘制线 1
  if (points1.length > 0) {
    // 区域填充
    var areaPath = 'M ' + xScale(points1[0].x) + ' ' + yScale(points1[0].y);
    for (var ai = 1; ai < points1.length; ai++) {
      areaPath += ' L ' + xScale(points1[ai].x) + ' ' + yScale(points1[ai].y);
    }
    areaPath += ' L ' + xScale(points1[points1.length - 1].x) + ' ' + (padT + chartH);
    areaPath += ' L ' + xScale(points1[0].x) + ' ' + (padT + chartH);
    areaPath += ' Z';
    
    var area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    area.setAttribute('d', areaPath);
    area.setAttribute('fill', 'url(#areaGrad)');
    svg.appendChild(area);
    
    // 折线
    var linePath = '';
    for (var li = 0; li < points1.length; li++) {
      linePath += (li === 0 ? 'M ' : ' L ') + xScale(points1[li].x) + ' ' + yScale(points1[li].y);
    }
    var lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    lineEl.setAttribute('d', linePath);
    lineEl.setAttribute('fill', 'none');
    lineEl.setAttribute('stroke', def.color);
    lineEl.setAttribute('stroke-width', '2');
    lineEl.setAttribute('stroke-linejoin', 'round');
    lineEl.setAttribute('stroke-linecap', 'round');
    svg.appendChild(lineEl);
    
    // 数据点
    for (var pi = 0; pi < points1.length; pi++) {
      var abnormal = isAbnormal(points1[pi].record);
      var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', xScale(points1[pi].x));
      dot.setAttribute('cy', yScale(points1[pi].y));
      dot.setAttribute('r', '5');
      dot.setAttribute('fill', abnormal ? '#E74C3C' : def.color);
      dot.setAttribute('stroke', '#fff');
      dot.setAttribute('stroke-width', '2');
      dot.style.cursor = 'pointer';
      dot.setAttribute('data-record-idx', String(pi));
      
      // tooltip 事件
      (function(pt) {
        dot.addEventListener('mouseenter', function(e) { showChartTooltip(e, pt.record); });
        dot.addEventListener('mouseleave', function() { hideChartTooltip(); });
        dot.addEventListener('click', function(e) { showChartTooltip(e, pt.record); });
      })(points1[pi]);
      
      svg.appendChild(dot);
    }
  }
  
  // 绘制线 2（血压的舒张压）
  if (isBP && points2.length > 0) {
    var line2Path = '';
    for (var bi = 0; bi < points2.length; bi++) {
      line2Path += (bi === 0 ? 'M ' : ' L ') + xScale(points2[bi].x) + ' ' + yScale(points2[bi].y);
    }
    var line2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line2.setAttribute('d', line2Path);
    line2.setAttribute('fill', 'none');
    line2.setAttribute('stroke', '#5B9BD5');
    line2.setAttribute('stroke-width', '2');
    line2.setAttribute('stroke-dasharray', '5,3');
    line2.setAttribute('stroke-linejoin', 'round');
    line2.setAttribute('stroke-linecap', 'round');
    svg.appendChild(line2);
    
    for (var di = 0; di < points2.length; di++) {
      var dot2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot2.setAttribute('cx', xScale(points2[di].x));
      dot2.setAttribute('cy', yScale(points2[di].y));
      dot2.setAttribute('r', '4');
      dot2.setAttribute('fill', '#5B9BD5');
      dot2.setAttribute('stroke', '#fff');
      dot2.setAttribute('stroke-width', '2');
      dot2.style.cursor = 'pointer';
      (function(pt) {
        dot2.addEventListener('mouseenter', function(e) { showChartTooltip(e, pt.record); });
        dot2.addEventListener('mouseleave', function() { hideChartTooltip(); });
      })(points2[di]);
      svg.appendChild(dot2);
    }
  }
  
  // Y 轴标题
  var yTitle = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  yTitle.setAttribute('x', padL - 45);
  yTitle.setAttribute('y', padT - 10);
  yTitle.setAttribute('fill', '#666');
  yTitle.setAttribute('font-size', '12');
  yTitle.setAttribute('font-weight', '600');
  yTitle.textContent = def.label + (def.unit ? '(' + def.unit + ')' : '');
  svg.appendChild(yTitle);
  
  container.appendChild(svg);
}

function renderChartLegend(container, metricKey) {
  container.textContent = '';
  var def = getMetricDef(metricKey);
  
  // 正常范围
  var range = null;
  if (metricKey === 'blood_sugar') range = CONFIG.RANGES.blood_sugar_fasting;
  else if (metricKey === 'temperature') range = CONFIG.RANGES.temperature;
  else if (metricKey === 'blood_pressure') range = CONFIG.RANGES.bp_systolic;
  
  if (range) {
    var span1 = document.createElement('span');
    var dot1 = document.createElement('span');
    dot1.className = 'legend-range';
    span1.appendChild(dot1);
    span1.appendChild(document.createTextNode(' 正常范围 ' + range.min + '-' + range.max));
    container.appendChild(span1);
  }
  
  // 主线
  var span2 = document.createElement('span');
  var dot2 = document.createElement('span');
  dot2.className = 'legend-dot';
  dot2.style.background = def.color;
  span2.appendChild(dot2);
  span2.appendChild(document.createTextNode(' ' + def.label));
  container.appendChild(span2);
  
  // 血压第二条线
  if (metricKey === 'blood_pressure') {
    var span3 = document.createElement('span');
    var dot3 = document.createElement('span');
    dot3.className = 'legend-dot';
    dot3.style.background = '#5B9BD5';
    span3.appendChild(dot3);
    span3.appendChild(document.createTextNode(' 舒张压'));
    container.appendChild(span3);
  }
  
  // 异常点
  var span4 = document.createElement('span');
  var dot4 = document.createElement('span');
  dot4.className = 'legend-dot';
  dot4.style.background = '#E74C3C';
  span4.appendChild(dot4);
  span4.appendChild(document.createTextNode(' 异常值'));
  container.appendChild(span4);
}

function showChartTooltip(e, record) {
  var tooltip = document.getElementById('chartTooltip');
  var def = getMetricDef(record.type);
  var abnormal = isAbnormal(record);
  var parts = record.date.split('-');
  var dateStr = parseInt(parts[1]) + '/' + parseInt(parts[2]);
  
  tooltip.textContent = dateStr + ' ' + record.time + ' · ' + def.label + ' · ' + formatValue(record) + (abnormal ? ' ⚠️' : ' ✓');
  tooltip.style.display = 'block';
  
  // 定位
  var rect = tooltip.getBoundingClientRect();
  var x = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
  var y = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
  tooltip.style.left = (x - rect.width / 2) + 'px';
  tooltip.style.top = (y - rect.height - 12) + 'px';
}

function hideChartTooltip() {
  document.getElementById('chartTooltip').style.display = 'none';
}

// ==================== 月度汇总 ====================
function renderMonthlySummary() {
  var now = nowBJ();
  if (HApp.summaryYear === null) {
    HApp.summaryYear = now.getFullYear();
    HApp.summaryMonth = now.getMonth();
  }
  
  document.getElementById('msTitle').textContent = HApp.summaryYear + '年' + (HApp.summaryMonth + 1) + '月';
  
  var table = document.getElementById('msTable');
  table.textContent = '';
  
  // 表头
  var thead = document.createElement('thead');
  var headerRow = document.createElement('tr');
  var th0 = document.createElement('th');
  th0.textContent = '日期';
  headerRow.appendChild(th0);
  
  var headers = [
    { label: '血糖(空腹)', key: 'blood_sugar', sub: 'fasting' },
    { label: '血糖(餐后)', key: 'blood_sugar', sub: 'postmeal' },
    { label: '血压', key: 'blood_pressure' },
    { label: '体重', key: 'weight' },
    { label: '体温', key: 'temperature' },
  ];
  
  for (var h = 0; h < headers.length; h++) {
    var th = document.createElement('th');
    th.textContent = headers[h].label;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  // 表体
  var tbody = document.createElement('tbody');
  var days = daysInMonth(HApp.summaryYear, HApp.summaryMonth + 1);
  
  for (var d = 1; d <= days; d++) {
    var dateStr = fmtDate(HApp.summaryYear, HApp.summaryMonth + 1, d);
    var recs = HApp.currentMemberId ? getMemberData(HApp.currentMemberId, dateStr) : [];
    
    var row = document.createElement('tr');
    var td0 = document.createElement('td');
    td0.textContent = (HApp.summaryMonth + 1) + '/' + d;
    row.appendChild(td0);
    
    for (var hi = 0; hi < headers.length; hi++) {
      var td = document.createElement('td');
      var found = null;
      
      for (var ri = 0; ri < recs.length; ri++) {
        if (recs[ri].type === headers[hi].key) {
          if (headers[hi].sub) {
            if (recs[ri].extra && recs[ri].extra.period === headers[hi].sub) {
              found = recs[ri];
              break;
            }
          } else {
            found = recs[ri];
            break;
          }
        }
      }
      
      if (found) {
        if (headers[hi].key === 'blood_pressure') {
          td.textContent = found.extra.systolic + '/' + found.extra.diastolic;
        } else {
          td.textContent = found.value;
        }
        if (isAbnormal(found)) {
          td.className = 'val-abnormal';
        }
      } else {
        td.textContent = '-';
        td.className = 'val-none';
      }
      row.appendChild(td);
    }
    
    tbody.appendChild(row);
  }
  
  table.appendChild(tbody);
}

function prevMonth() {
  HApp.summaryMonth--;
  if (HApp.summaryMonth < 0) {
    HApp.summaryMonth = 11;
    HApp.summaryYear--;
  }
  renderMonthlySummary();
}

function nextMonth() {
  HApp.summaryMonth++;
  if (HApp.summaryMonth > 11) {
    HApp.summaryMonth = 0;
    HApp.summaryYear++;
  }
  renderMonthlySummary();
}

// ==================== 导入导出 ====================
function exportJSON() {
  var data = {
    version: 1,
    exportDate: new Date().toISOString(),
    members: HApp.members,
    data: HApp.allData
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var filename = 'health_records_' + currentDateStr() + '.json';
  downloadBlob(blob, filename);
}

function importJSON(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.members || !data.data) {
        alert('文件格式不正确');
        return;
      }
      HApp.members = data.members;
      HApp.allData = data.data;
      if (HApp.members.length > 0) {
        HApp.currentMemberId = HApp.members[0].id;
      }
      saveData();
      renderMemberBar();
      renderAll();
      alert('导入成功');
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ==================== 事件绑定 ====================
function bindActions() {
  document.addEventListener('click', function(e) {
    var target = e.target;
    // 向上查找 data-action
    while (target && target !== document) {
      var action = target.getAttribute && target.getAttribute('data-action');
      if (action) {
        handleAction(action, target, e);
        return;
      }
      target = target.parentNode;
    }
  });
}

function handleAction(action, el, e) {
  switch (action) {
    case 'tab-daily': switchTab('daily'); break;
    case 'tab-chart': switchTab('chart'); break;
    case 'tab-monthly': switchTab('monthly'); break;
    case 'prev-date': prevDate(); break;
    case 'next-date': nextDate(); break;
    case 'add-member': openMemberModal(null); break;
    case 'edit-member':
      if (HApp.currentMemberId) openMemberModal(HApp.currentMemberId);
      break;
    case 'switch-member':
      switchMember(parseInt(el.getAttribute('data-member-id')));
      break;
    case 'select-emoji':
      HApp._selectedEmoji = el.getAttribute('data-emoji');
      var opts = document.querySelectorAll('.emoji-option');
      for (var i = 0; i < opts.length; i++) {
        opts[i].classList.toggle('selected', opts[i] === el);
      }
      break;
    case 'member-modal-cancel': closeMemberModal(); break;
    case 'member-modal-save': saveMember(); break;
    case 'member-modal-delete': deleteMember(); break;
    case 'select-metric':
      selectMetric(el.getAttribute('data-metric'));
      break;
    case 'add-record': addRecord(); break;
    case 'delete-record':
      deleteRecord(parseInt(el.getAttribute('data-record-id')));
      break;
    case 'chart-metric':
      HApp.chartMetric = el.getAttribute('data-metric');
      renderChart();
      break;
    case 'chart-range':
      HApp.chartRange = parseInt(el.getAttribute('data-range'));
      var btns = document.querySelectorAll('.chart-range-btn');
      for (var j = 0; j < btns.length; j++) {
        btns[j].classList.toggle('active', btns[j] === el);
      }
      renderChart();
      break;
    case 'prev-month': prevMonth(); break;
    case 'next-month': nextMonth(); break;
    case 'export-json': exportJSON(); break;
    case 'import-json':
      document.getElementById('importFile').click();
      break;
    case 'clear-day': clearDay(); break;
  }
}

// ==================== 渲染全部 ====================
function renderAll() {
  renderDate();
  renderTypeGrid();
  renderDynamicInputs();
  renderRecordList();
  renderSummaryBar();
  
  // 设置默认时间
  var now = nowBJ();
  document.getElementById('recordTime').value = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}

// ==================== 初始化 ====================
function init() {
  loadData();
  HApp.currentDate = currentDateStr();
  
  // 如果没有成员，创建默认成员
  if (HApp.members.length === 0) {
    HApp.members = [
      { id: generateId(), name: '爸爸', emoji: '👨', createdAt: new Date().toISOString() },
      { id: generateId(), name: '妈妈', emoji: '👩', createdAt: new Date().toISOString() },
    ];
    HApp.currentMemberId = HApp.members[0].id;
    HApp.allData = {};
    HApp.allData[HApp.members[0].id] = {};
    HApp.allData[HApp.members[1].id] = {};
    saveData();
  } else {
    HApp.currentMemberId = HApp.members[0].id;
  }
  
  // 设置默认选中血糖
  HApp.selectedMetric = 'blood_sugar';
  
  // 文件导入
  document.getElementById('importFile').addEventListener('change', function(e) {
    if (e.target.files && e.target.files[0]) {
      importJSON(e.target.files[0]);
      e.target.value = '';
    }
  });
  
  bindActions();
  renderMemberBar();
  renderAll();
  
  console.log('[健康记录] 初始化完成，成员数:', HApp.members.length);
}

// DOM 就绪后启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
