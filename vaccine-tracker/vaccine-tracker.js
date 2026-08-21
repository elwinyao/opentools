// ==================== 宝宝疫苗接种 - 主逻辑 ====================
// 依赖：lib/common-bundle.js（需在此之前加载）
// 不依赖宝宝档案，所有疫苗计划均可编辑/删除/新增

// ==================== 常用自费疫苗预设 ====================
var CUSTOM_VACCINE_PRESETS = [
  { name: '五联疫苗', icon: '💉', disease: '百日咳、白喉、破伤风、脊髓灰质炎、Hib感染', brand: '赛诺菲 潘太欣', note: '替代百白破+脊灰+Hib，共4剂', presets: [
    { dose: 1, scheduleMonths: 3, scheduleAge: '3月龄' },
    { dose: 2, scheduleMonths: 4, scheduleAge: '4月龄' },
    { dose: 3, scheduleMonths: 5, scheduleAge: '5月龄' },
    { dose: 4, scheduleMonths: 18, scheduleAge: '18月龄' }
  ]},
  { name: '13价肺炎疫苗', icon: '💉', disease: '肺炎链球菌感染', brand: '辉瑞 沛儿13', note: '共4剂，基础免疫3剂+加强1剂', presets: [
    { dose: 1, scheduleMonths: 2, scheduleAge: '2月龄' },
    { dose: 2, scheduleMonths: 4, scheduleAge: '4月龄' },
    { dose: 3, scheduleMonths: 6, scheduleAge: '6月龄' },
    { dose: 4, scheduleMonths: 12, scheduleAge: '12月龄' }
  ]},
  { name: 'ACYW135流脑结合疫苗', icon: '💉', disease: '流行性脑脊髓膜炎(A/C/Y/W135群)', brand: '康希诺 曼海欣', note: '替代免费A群流脑，共3剂', presets: [
    { dose: 1, scheduleMonths: 7, scheduleAge: '7月龄' },
    { dose: 2, scheduleMonths: 9, scheduleAge: '9月龄' },
    { dose: 3, scheduleMonths: 36, scheduleAge: '3岁' }
  ]},
  { name: '手足口EV71疫苗', icon: '💉', disease: '手足口病(EV71)', brand: '医科院生物所/北京科兴', note: '共2剂，间隔28天', presets: [
    { dose: 1, scheduleMonths: 8, scheduleAge: '8月龄' },
    { dose: 2, scheduleMonths: 9, scheduleAge: '9月龄' }
  ]},
  { name: '水痘疫苗', icon: '💉', disease: '水痘', brand: '长春百克/上海所/GSK', note: '共2剂', presets: [
    { dose: 1, scheduleMonths: 12, scheduleAge: '12月龄' },
    { dose: 2, scheduleMonths: 48, scheduleAge: '4岁' }
  ]},
  { name: '甲肝灭活疫苗', icon: '💉', disease: '甲型病毒性肝炎', brand: '科兴/GSK', note: '替代免费减毒，共2剂', presets: [
    { dose: 1, scheduleMonths: 18, scheduleAge: '18月龄' },
    { dose: 2, scheduleMonths: 24, scheduleAge: '2岁' }
  ]},
  { name: '轮状病毒疫苗', icon: '💊', disease: '轮状病毒肠炎', presets: [
    { dose: 1, scheduleMonths: 2, scheduleAge: '2月龄' },
    { dose: 2, scheduleMonths: 6, scheduleAge: '6月龄' }
  ]},
  { name: '流感疫苗', icon: '💉', disease: '流行性感冒', presets: [
    { dose: 1, scheduleMonths: 6, scheduleAge: '6月龄以上' },
    { dose: 2, scheduleMonths: 7, scheduleAge: '7月龄' }
  ]},
  { name: 'Hib疫苗', icon: '💉', disease: 'b型流感嗜血杆菌感染', note: '如未用五联，可单独接种Hib', presets: [
    { dose: 1, scheduleMonths: 2, scheduleAge: '2月龄' },
    { dose: 2, scheduleMonths: 3, scheduleAge: '3月龄' },
    { dose: 3, scheduleMonths: 4, scheduleAge: '4月龄' },
    { dose: 4, scheduleMonths: 18, scheduleAge: '18月龄' }
  ]}
];

// ==================== 命名空间 ====================
App.vaccineData = {};        // { vaccine_key: { ...record } }  所有疫苗（含计划定义+接种记录）
App.vaccineFilter = 'all';
App._editingVaccineKey = null;
App._selectedPresetIdx = -1;

var VACCINE_STORAGE_KEY = 'baby_vaccine_data';

// ==================== 本地存储 ====================
function loadVaccineData() {
  try {
    var d = localStorage.getItem(VACCINE_STORAGE_KEY);
    App.vaccineData = d ? JSON.parse(d) : {};
  } catch(e) { App.vaccineData = {}; }
}

function saveVaccineData() {
  try { localStorage.setItem(VACCINE_STORAGE_KEY, JSON.stringify(App.vaccineData)); }
  catch(e) { Logger.warn('疫苗数据保存失败', e); }
}

// ==================== 疫苗列表（从 vaccineData 直接读取） ====================
function getAllVaccines() {
  var arr = [];
  Object.keys(App.vaccineData).forEach(function(key) {
    var r = App.vaccineData[key];
    if (!r || r._deleted) return;

    // 计算有效接种月龄（考虑调整）
    var effMonths = r.custom_schedule_months != null ? r.custom_schedule_months : r.schedule_months;
    var effAge = r.custom_schedule_age || r.schedule_age;
    var originalMonths = r.schedule_months;
    var originalAge = r.schedule_age;
    var adjusted = r.custom_schedule_months != null;

    arr.push({
      key: r.vaccine_key,
      name: r.vaccine_name.replace(/\(第\d+剂\)/, '').trim(),
      fullName: r.vaccine_name,
      dose: r.dose_number || 1,
      scheduleAge: effAge,
      scheduleMonths: effMonths,
      originalScheduleAge: originalAge,
      originalScheduleMonths: originalMonths,
      scheduleAdjusted: adjusted,
      icon: r.vaccine_icon || '💉',
      disease: r.disease || '',
      isCustom: r.is_custom || false,
      record: r
    });
  });

  arr.sort(function(a, b) { return a.scheduleMonths - b.scheduleMonths; });
  return arr;
}

// ==================== 状态 ====================
function getVaccineStatus(v) {
  var r = v.record;
  if (!r) return 'pending';
  return r.status || 'pending';
}

function getStatusText(status) {
  switch(status) {
    case 'done': return '✅ 已接种';
    case 'skipped': return '⏭️ 已跳过';
    default: return '⏳ 未接种';
  }
}

// ==================== 云端同步 ====================
function mapVaccineCloudRecord(row) {
  return {
    id: row.id,
    vaccine_key: row.vaccine_key,
    vaccine_name: row.vaccine_name,
    dose_number: row.dose_number,
    schedule_age: row.schedule_age || '',
    schedule_months: row.schedule_months || 0,
    status: row.status,
    vaccinated_date: row.vaccinated_date,
    lot_number: row.lot_number || '',
    hospital: row.hospital || '',
    note: row.note || '',
    is_custom: row.is_custom || false,
    disease: row.disease || '',
    vaccine_icon: row.vaccine_icon || '💉',
    custom_schedule_months: row.custom_schedule_months,
    custom_schedule_age: row.custom_schedule_age,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function loadVaccinesFromCloud() {
  if (!App.sbClient || !App.currentUser) return;
  try {
    var allRecords = await fetchAllPages('baby_vaccines', null, [['schedule_months', true]]);
    var cloudData = {};
    allRecords.forEach(function(row) { cloudData[row.vaccine_key] = mapVaccineCloudRecord(row); });

    // 合并（mergeById：updatedAt 大者胜，相等时云端胜即 >=；本地独有已同步记录 = 云端已删，丢弃）
    var merged = mergeById(
      Object.keys(App.vaccineData).map(function(k) { return App.vaccineData[k]; }),
      Object.keys(cloudData).map(function(k) { return cloudData[k]; }),
      function(r) { return r.vaccine_key; },
      { tiePrefer: 'cloud' }
    );
    App.vaccineData = {};
    merged.forEach(function(r) { App.vaccineData[r.vaccine_key] = r; });
    saveVaccineData();
    renderAll();
    updateSyncStatus('online');
  } catch(e) { Logger.warn('加载疫苗记录失败，继续使用本地数据', e); }
}

async function syncVaccineToCloud(record, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    // 方案1：不传 user_id，由数据库默认 auth.uid() 填充，杜绝 RLS 错配
    var row = {
      id: record.id,
      vaccine_key: record.vaccine_key,
      vaccine_name: record.vaccine_name,
      dose_number: record.dose_number || 1,
      schedule_age: record.schedule_age || '',
      schedule_months: record.schedule_months || 0,
      status: record.status,
      vaccinated_date: record.vaccinated_date,
      lot_number: record.lot_number || '',
      hospital: record.hospital || '',
      note: record.note || '',
      is_custom: record.is_custom || false,
      disease: record.disease || '',
      vaccine_icon: record.vaccine_icon || '💉',
      custom_schedule_months: record.custom_schedule_months || null,
      custom_schedule_age: record.custom_schedule_age || null,
      updated_at: toBJISOString()
    };
    var result = await App.sbClient.from('baby_vaccines').upsert(row, { onConflict: 'id' });
    if (result.error) throw result.error;
    record.updatedAt = toBJISOString();
    saveVaccineData();
  } catch(e) {
    Logger.warn('同步疫苗记录到云端失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_vaccines', action: 'upsert', record: record });
    if (opts.throwOnFail) throw e;
  }
}

async function deleteVaccineFromCloud(recordId, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    var result = await App.sbClient.from('baby_vaccines').delete().eq('id', recordId).eq('user_id', App.currentUser.id);
    if (result.error) throw result.error;
  } catch(e) {
    Logger.warn('删除云端疫苗记录失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_vaccines', action: 'delete', id: recordId });
    if (opts.throwOnFail) throw e;
  }
}

// 注册本页同步表处理函数：公共库同步队列（common-bundle.js）按 table 分发时调用
registerSyncTableHandler('baby_vaccines', {
  upsert: function(record) { return syncVaccineToCloud(record, { enqueue: false, throwOnFail: true }); },
  delete: function(id) { return deleteVaccineFromCloud(id, { enqueue: false, throwOnFail: true }); }
});

// ==================== Realtime ====================
// Realtime 统一走公共库（common-bundle.js）：setRealtimeConfig + subscribeRealtime + initRealtimeChannel
// 页面仅注册回调：把公共库批量分发的事件转换为单条 payload 交给数据处理函数
function handleVaccineRealtimeChanges(changes) {
  if (!changes || changes.length === 0) return;
  // 公共库已归一化为 { eventType, table, record, old_record }，直接消费，不再二次构造 payload
  changes.forEach(function(evt) { handleVaccineRealtimePayload(evt); });
}

var _vaccineDebounceTimer = null;
function handleVaccineRealtimePayload(evt) {
  var r = evt.record;
  if (!r || !r.vaccine_key) return;
  if (evt.eventType === 'DELETE') { delete App.vaccineData[r.vaccine_key]; }
  else {
    var newRec = mapVaccineCloudRecord(r);
    var existing = App.vaccineData[r.vaccine_key];
    if (existing) {
      var localTime = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      var cloudTime = newRec.updatedAt ? new Date(newRec.updatedAt).getTime() : 0;
      if (cloudTime > localTime) App.vaccineData[r.vaccine_key] = newRec;
    } else { App.vaccineData[r.vaccine_key] = newRec; }
  }
  if (_vaccineDebounceTimer) clearTimeout(_vaccineDebounceTimer);
  _vaccineDebounceTimer = setTimeout(function() { saveVaccineData(); renderAll(); _vaccineDebounceTimer = null; }, 300);
}

// ==================== UI 渲染 ====================
// Header 三件套（setUserDisplay/clearUserDisplay/updateSyncStatus）统一到公共库 App.UI.bindHeader
App.UI.bindHeader({ displayId: 'monthDisplayText', loginId: 'loginLink', logoutId: 'logoutLink' });

// 登出：清空疫苗登记数据并重渲染空视图（localStorage 专属键 baby_vaccine_data 一并清）
window.onLogout = function() {
  App.vaccineData = {};
  try { localStorage.removeItem('baby_vaccine_data'); } catch(e) {}
  renderAll();
};

function renderStatsBar() {
  var statsDiv = document.getElementById('vaccineStats');
  var counts = { done: 0, pending: 0, skipped: 0 };
  getAllVaccines().forEach(function(v) { var s = getVaccineStatus(v); counts[s] = (counts[s] || 0) + 1; });
  var total = counts.done + counts.pending + counts.skipped;
  var statsHtml = '<span class="stat-total">共 ' + total + ' 剂</span>';
  if (counts.done > 0) statsHtml += '<div class="vaccine-stat"><span class="stat-dot done"></span>已种 <span class="stat-num">' + counts.done + '</span></div>';
  if (counts.pending > 0) statsHtml += '<div class="vaccine-stat"><span class="stat-dot pending"></span>未种 <span class="stat-num">' + counts.pending + '</span></div>';
  if (counts.skipped > 0) statsHtml += '<div class="vaccine-stat"><span class="stat-dot skipped"></span>跳过 <span class="stat-num">' + counts.skipped + '</span></div>';
  statsDiv.innerHTML = statsHtml;
}

function renderVaccineList() {
  var list = document.getElementById('vaccineList');
  list.textContent = '';
  var allVaccines = getAllVaccines();

  // 按月龄分组
  var groups = {};
  allVaccines.forEach(function(v) {
    var ageLabel = v.scheduleAge;
    if (!groups[ageLabel]) groups[ageLabel] = [];
    groups[ageLabel].push(v);
  });

  // 排序月龄
  var seen = {};
  var uniqueAges = [];
  allVaccines.forEach(function(v) {
    if (!seen[v.scheduleAge]) { seen[v.scheduleAge] = true; uniqueAges.push({ label: v.scheduleAge, months: v.scheduleMonths }); }
  });
  uniqueAges.sort(function(a, b) { return a.months - b.months; });

  var hasItems = false;
  var frag = document.createDocumentFragment();

  uniqueAges.forEach(function(ageInfo) {
    var vaccines = groups[ageInfo.label];
    if (!vaccines) return;
    var filtered = vaccines.filter(function(v) {
      var s = getVaccineStatus(v);
      if (App.vaccineFilter === 'all') return true;
      return s === App.vaccineFilter;
    });
    if (filtered.length === 0) return;
    hasItems = true;

    // 分组标题（自费/已调整标签仅在疫苗条目右侧展示，不在月龄旁展示）
    var hasAdjusted = filtered.some(function(v) { return v.scheduleAdjusted; });
    var titleHtml = '📅 ' + escapeHtml(ageInfo.label) + ' <span class="group-age">(' + ageInfo.months + '月龄)</span>';
    if (hasAdjusted) titleHtml += ' <span class="group-adjusted-tag">已调整</span>';

    var groupDiv = document.createElement('div');
    groupDiv.className = 'vaccine-group';
    var title = document.createElement('div');
    title.className = 'vaccine-group-title';
    title.innerHTML = '<span class="group-left">' + titleHtml + '</span>';
    groupDiv.appendChild(title);

    filtered.forEach(function(v) {
      var status = getVaccineStatus(v);
      var item = document.createElement('div');
      item.className = 'vaccine-item status-' + status + (v.isCustom ? ' is-custom' : '');

      var icon = document.createElement('div');
      icon.className = 'vaccine-icon';
      icon.textContent = v.icon;
      item.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'vaccine-info';
      var name = document.createElement('div');
      name.className = 'vaccine-name';
      var nameHtml = escapeHtml(v.name) + ' (第' + v.dose + '剂)';
      if (v.isCustom) nameHtml += ' <span class="custom-tag">自费</span>';
      if (v.scheduleAdjusted) nameHtml += ' <span class="adjusted-tag">已调整</span>';
      name.innerHTML = nameHtml;
      info.appendChild(name);

      var schedule = document.createElement('div');
      schedule.className = 'vaccine-schedule';
      var schedText = '建议: ' + v.scheduleAge + ' · 预防: ' + v.disease;
      if (v.scheduleAdjusted) {
        schedText = '建议: ' + v.scheduleAge + ' (原' + v.originalScheduleAge + ') · 预防: ' + v.disease;
      }
      schedule.textContent = schedText;
      info.appendChild(schedule);

      // 接种详情
      if (v.record && v.record.status === 'done') {
        var detail = document.createElement('div');
        detail.className = 'vaccine-detail';
        var parts = [];
        if (v.record.vaccinated_date) parts.push('接种日: ' + v.record.vaccinated_date);
        if (v.record.hospital) parts.push(v.record.hospital);
        if (v.record.lot_number) parts.push('批号: ' + v.record.lot_number);
        if (v.record.note) parts.push(v.record.note);
        detail.textContent = parts.join(' · ');
        info.appendChild(detail);
      } else if (v.record && v.record.status === 'skipped') {
        var skipDetail = document.createElement('div');
        skipDetail.className = 'vaccine-detail';
        skipDetail.textContent = v.record.note ? ('已跳过: ' + v.record.note) : '已跳过';
        info.appendChild(skipDetail);
      }
      item.appendChild(info);

      // 状态标签
      var statusEl = document.createElement('div');
      statusEl.className = 'vaccine-status ' + status;
      statusEl.textContent = getStatusText(status);
      item.appendChild(statusEl);

      // 操作按钮
      var btns = document.createElement('div');
      btns.className = 'vaccine-btns';

      var editBtn = document.createElement('button');
      editBtn.className = 'vaccine-action-btn' + (status === 'done' || status === 'skipped' ? ' btn-edit' : '');
      editBtn.textContent = status === 'done' ? '✎ 修改' : status === 'skipped' ? '✎ 修改' : '💉 登记';
      editBtn.setAttribute('data-action', 'open-vaccine-modal');
      editBtn.setAttribute('data-vaccine-key', v.key);
      btns.appendChild(editBtn);

      // 所有疫苗都可删除
      var delBtn = document.createElement('button');
      delBtn.className = 'vaccine-action-btn btn-delete';
      delBtn.textContent = '🗑';
      delBtn.setAttribute('data-action', 'delete-vaccine');
      delBtn.setAttribute('data-vaccine-key', v.key);
      delBtn.title = '删除此疫苗';
      btns.appendChild(delBtn);

      item.appendChild(btns);
      groupDiv.appendChild(item);
    });

    frag.appendChild(groupDiv);
  });

  if (!hasItems) {
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    var emoji = document.createElement('div');
    emoji.className = 'emoji';
    emoji.textContent = '📭';
    var msg = document.createElement('div');
    msg.textContent = App.vaccineFilter !== 'all' ? '该分类暂无疫苗' : '暂无疫苗，点击「添加自费疫苗」或重置内置疫苗';
    empty.appendChild(emoji);
    empty.appendChild(msg);
    list.appendChild(empty);
    return;
  }
  list.appendChild(frag);
}

function renderAll() { renderStatsBar(); renderVaccineList(); }

// ==================== 接种弹窗（含疫苗信息编辑） ====================
function openVaccineModal(vaccineKey) {
  var allVaccines = getAllVaccines();
  var v = allVaccines.filter(function(x) { return x.key === vaccineKey; })[0];
  if (!v) return;
  App._editingVaccineKey = vaccineKey;

  var record = v.record || {};
  var modal = document.getElementById('vaccineModal');
  var title = document.getElementById('vaccineModalTitle');
  var info = document.getElementById('vaccineModalInfo');

  title.textContent = record.status === 'done' ? '修改接种记录' : record.status === 'skipped' ? '修改疫苗信息' : '登记接种';
  info.innerHTML = '<div class="vmi-name">' + escapeHtml(v.icon) + ' ' + escapeHtml(v.name) + ' (第' + v.dose + '剂)</div>' +
                   '<div class="vmi-schedule">建议接种: ' + escapeHtml(v.scheduleAge) + ' · 预防: ' + escapeHtml(v.disease) + '</div>';

  document.getElementById('vaccinatedDate').value = record.vaccinated_date || currentDateBJ();
  document.getElementById('lotNumber').value = record.lot_number || '';
  document.getElementById('hospital').value = record.hospital || '';
  document.getElementById('vaccineNote').value = record.note || '';

  // 疫苗信息编辑区
  document.getElementById('editVaccineName').value = v.name;
  document.getElementById('editVaccineType').value = record.is_custom ? 'paid' : 'free';
  document.getElementById('editDoseNumber').value = v.dose;
  document.getElementById('editScheduleMonths').value = v.scheduleMonths;
  document.getElementById('editScheduleAge').value = v.scheduleAge;
  document.getElementById('editDisease').value = v.disease;

  // 状态选择器
  var statusSelect = document.getElementById('vaccineStatusSelect');
  if (statusSelect) {
    statusSelect.value = record.status || 'pending';
  }

  modal.classList.add('show');
  document.getElementById('vaccinatedDate').focus();
}

function closeVaccineModal() {
  document.getElementById('vaccineModal').classList.remove('show');
  App._editingVaccineKey = null;
}

// 保存（统一处理三种状态）
async function saveVaccineRecord() {
  if (!App._editingVaccineKey) return;
  var record = App.vaccineData[App._editingVaccineKey];
  if (!record) return;

  // 读取状态选择器
  var newStatus = document.getElementById('vaccineStatusSelect').value;

  var date = document.getElementById('vaccinatedDate').value;
  var lot = document.getElementById('lotNumber').value.trim();
  var hospital = document.getElementById('hospital').value.trim();
  var note = document.getElementById('vaccineNote').value.trim();

  // 已接种需要日期
  if (newStatus === 'done' && !date) { showToast('请选择接种日期'); return; }

  // 疫苗信息编辑
  var editName = document.getElementById('editVaccineName').value.trim();
  var editType = document.getElementById('editVaccineType').value;
  var editDose = parseInt(document.getElementById('editDoseNumber').value) || 1;
  var editMonths = parseInt(document.getElementById('editScheduleMonths').value);
  var editAge = document.getElementById('editScheduleAge').value.trim();
  var editDisease = document.getElementById('editDisease').value.trim();

  if (editName) {
    record.vaccine_name = editName + '(第' + editDose + '剂)';
    record.dose_number = editDose;
  }
  // 免费/自费类型（免费 → is_custom:false 与内置疫苗一致，不显示自费标签）
  record.is_custom = (editType === 'paid');
  if (!isNaN(editMonths) && editMonths >= 0 && editMonths <= 120) {
    record.schedule_months = editMonths;
    record.schedule_age = editAge || (editMonths + '月龄');
  }
  if (editDisease) record.disease = editDisease;

  // 按状态设置字段
  record.status = newStatus;
  if (newStatus === 'done') {
    record.vaccinated_date = date;
    record.lot_number = lot;
    record.hospital = hospital;
    record.note = note;
  } else {
    record.vaccinated_date = null;
    record.lot_number = '';
    record.hospital = '';
    record.note = newStatus === 'skipped' ? (note || '家长选择跳过') : '';
  }
  record.updatedAt = toBJISOString();

  App.vaccineData[App._editingVaccineKey] = record;
  saveVaccineData();
  closeVaccineModal();
  renderAll();
  if (App.currentUser) {
    await syncVaccineToCloud(record);
    startSyncQueueProcessor();
  }
}

// 删除疫苗（任何疫苗都可删）
async function deleteVaccine(vaccineKey) {
  var record = App.vaccineData[vaccineKey];
  if (!record) return;
  if (!confirm('确定删除「' + record.vaccine_name + '」？此操作不可撤销。')) return;

  var recordId = record.id;
  delete App.vaccineData[vaccineKey];
  saveVaccineData();
  renderAll();
  if (App.currentUser && recordId) {
    await deleteVaccineFromCloud(recordId);
    startSyncQueueProcessor();
  }
}

// ==================== 自费疫苗弹窗 ====================
function openCustomVaccineModal() {
  App._selectedPresetIdx = -1;
  var modal = document.getElementById('customVaccineModal');
  var grid = document.getElementById('presetGrid');
  grid.textContent = '';

  CUSTOM_VACCINE_PRESETS.forEach(function(preset, idx) {
    var item = document.createElement('div');
    item.className = 'preset-item';
    item.setAttribute('data-action', 'select-preset');
    item.setAttribute('data-preset-idx', String(idx));
    var icon = document.createElement('span');
    icon.className = 'preset-icon';
    icon.textContent = preset.icon;
    var info = document.createElement('div');
    info.className = 'preset-info';
    var name = document.createElement('div');
    name.className = 'preset-name';
    name.textContent = preset.name;
    var sched = document.createElement('div');
    sched.className = 'preset-schedule';
    sched.textContent = preset.presets.map(function(p) { return '第' + p.dose + '剂(' + p.scheduleAge + ')'; }).join(' · ');
    info.appendChild(name);
    info.appendChild(sched);
    if (preset.brand || preset.note) {
      var meta = document.createElement('div');
      meta.className = 'preset-schedule';
      meta.style.color = '#ED7D31';
      meta.textContent = (preset.brand || '') + (preset.note ? ' · ' + preset.note : '');
      info.appendChild(meta);
    }
    item.appendChild(icon);
    item.appendChild(info);
    grid.appendChild(item);
  });

  document.getElementById('customVaccineName').value = '';
  document.getElementById('customDoseNumber').value = '1';
  document.getElementById('customVaccineType').value = 'paid';
  document.getElementById('customScheduleMonthsInput').value = '';
  document.getElementById('customScheduleAgeInput').value = '';
  document.getElementById('customDisease').value = '';

  modal.classList.add('show');
}

function closeCustomVaccineModal() {
  document.getElementById('customVaccineModal').classList.remove('show');
  App._selectedPresetIdx = -1;
}

function selectPreset(idx) {
  App._selectedPresetIdx = idx;
  document.querySelectorAll('.preset-item').forEach(function(el) {
    el.classList.toggle('selected', parseInt(el.getAttribute('data-preset-idx')) === idx);
  });
  var preset = CUSTOM_VACCINE_PRESETS[idx];
  if (preset) {
    document.getElementById('customVaccineName').value = preset.name;
    document.getElementById('customDisease').value = preset.disease;
    var firstDose = preset.presets[0];
    document.getElementById('customDoseNumber').value = firstDose.dose;
    document.getElementById('customScheduleMonthsInput').value = firstDose.scheduleMonths;
    document.getElementById('customScheduleAgeInput').value = firstDose.scheduleAge;
  }
}

async function saveCustomVaccine() {
  var name = document.getElementById('customVaccineName').value.trim();
  var dose = parseInt(document.getElementById('customDoseNumber').value) || 1;
  var vaxType = document.getElementById('customVaccineType').value;
  var schedMonths = parseInt(document.getElementById('customScheduleMonthsInput').value);
  var schedAge = document.getElementById('customScheduleAgeInput').value.trim();
  var disease = document.getElementById('customDisease').value.trim();

  if (!name) { showToast('请输入疫苗名称'); return; }
  if (isNaN(schedMonths) || schedMonths < 0 || schedMonths > 120) { showToast('请输入合理的建议月龄 (0-120)'); return; }
  if (!schedAge) schedAge = schedMonths + '月龄';

  // 如果选了预设，自动添加该预设的全部剂次
  if (App._selectedPresetIdx >= 0) {
    var preset = CUSTOM_VACCINE_PRESETS[App._selectedPresetIdx];
    if (preset) {
      for (var i = 0; i < preset.presets.length; i++) {
        var p = preset.presets[i];
        var key = 'custom_' + preset.name + '_' + p.dose + '_' + Date.now() + '_' + i;
        var record = {
          id: generateId(),
          vaccine_key: key,
          vaccine_name: preset.name + '(第' + p.dose + '剂)',
          dose_number: p.dose,
          schedule_age: p.scheduleAge,
          schedule_months: p.scheduleMonths,
          status: 'pending',
          vaccinated_date: null,
          lot_number: '', hospital: '', note: '',
          is_custom: (vaxType === 'paid'),
          disease: preset.disease,
          vaccine_icon: preset.icon,
          custom_schedule_months: null,
          custom_schedule_age: null,
          createdAt: toBJISOString(),
          updatedAt: toBJISOString()
        };
        App.vaccineData[key] = record;
        if (App.currentUser) await syncVaccineToCloud(record);
      }
      if (App.currentUser) startSyncQueueProcessor();
      saveVaccineData();
      closeCustomVaccineModal();
      renderAll();
      return;
    }
  }

  // 单个自定义疫苗
  var icon = '💉';
  for (var j = 0; j < CUSTOM_VACCINE_PRESETS.length; j++) {
    if (CUSTOM_VACCINE_PRESETS[j].name === name) { icon = CUSTOM_VACCINE_PRESETS[j].icon; break; }
  }

  var key = 'custom_' + name + '_' + dose + '_' + Date.now();
  var record = {
    id: generateId(),
    vaccine_key: key,
    vaccine_name: name + '(第' + dose + '剂)',
    dose_number: dose,
    schedule_age: schedAge,
    schedule_months: schedMonths,
    status: 'pending',
    vaccinated_date: null,
    lot_number: '', hospital: '', note: '',
    is_custom: (vaxType === 'paid'),
    disease: disease,
    vaccine_icon: icon,
    custom_schedule_months: null,
    custom_schedule_age: null,
    createdAt: toBJISOString(),
    updatedAt: toBJISOString()
  };

  App.vaccineData[key] = record;
  saveVaccineData();
  closeCustomVaccineModal();
  renderAll();
  if (App.currentUser) {
    await syncVaccineToCloud(record);
    startSyncQueueProcessor();
  }
}

// ==================== 导入导出 ====================
function exportJSON() {
  var data = { version: 3, exportDate: new Date().toISOString(), vaccines: App.vaccineData };
  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, 'baby_vaccines_' + currentDateBJ() + '.json');
}

function importJSON(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data.vaccines) { showToast('文件格式不正确'); return; }
      App.vaccineData = data.vaccines;
      saveVaccineData();
      renderAll();
      showToast('导入成功');
    } catch(err) { showToast('导入失败: ' + err.message); }
  };
  reader.readAsText(file);
}

// ==================== 事件委托 ====================
var _vaccineActionMap = {
  'login': function() { showLogin(); },
  'logout': function() { logout(); },
  'filter': function(el) {
    App.vaccineFilter = el.getAttribute('data-filter');
    document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.toggle('active', b === el); });
    renderVaccineList();
  },
  'open-vaccine-modal': function(el, e) {
    e.stopPropagation();
    openVaccineModal(el.getAttribute('data-vaccine-key'));
  },
  'vaccine-modal-cancel': function() { closeVaccineModal(); },
  'vaccine-modal-save': function() { saveVaccineRecord(); },
  'open-custom-modal': function() { openCustomVaccineModal(); },
  'custom-modal-cancel': function() { closeCustomVaccineModal(); },
  'custom-modal-save': function() { saveCustomVaccine(); },
  'select-preset': function(el) { selectPreset(parseInt(el.getAttribute('data-preset-idx'))); },
  'delete-vaccine': function(el, e) {
    e.stopPropagation();
    deleteVaccine(el.getAttribute('data-vaccine-key'));
  },
  'export-json': function() { exportJSON(); },
  'import-json': function() { document.getElementById('importFile').click(); }
};

function _vaccineHandleClick(e) {
  var target = e.target;
  while (target && target !== document) {
    var action = target.getAttribute && target.getAttribute('data-action');
    if (action) {
      var fn = _vaccineActionMap[action];
      if (fn) { fn(target, e); return; }
    }
    target = target.parentNode;
  }
}

function _bindActions() {
  document.addEventListener('click', _vaccineHandleClick);

  var importFile = document.getElementById('importFile');
  if (importFile) {
    importFile.addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) { importJSON(e.target.files[0]); e.target.value = ''; }
    });
  }

  var modal1 = document.getElementById('vaccineModal');
  if (modal1) modal1.addEventListener('click', function(e) { if (e.target === modal1) closeVaccineModal(); });
  var modal2 = document.getElementById('customVaccineModal');
  if (modal2) modal2.addEventListener('click', function(e) { if (e.target === modal2) closeCustomVaccineModal(); });
}

// ==================== 登录回调 ====================
// 公共样板 standardOnLoginSuccess：保存会话 + 隐藏登录框 + 更新 UI + 订阅 Realtime + 启动同步队列；
// afterSync 为页面差异部分（拉取云端疫苗并渲染；loadVaccinesFromCloud 内部失败不抛出，保留本地数据）
async function onLoginSuccess(user, session) {
  return standardOnLoginSuccess(user, {
    subscribe: handleVaccineRealtimeChanges,
    afterSync: function() { return loadVaccinesFromCloud(); }
  });
}

// ==================== 初始化 ====================
function init() {
  if (App._initCalled) return;
  App._initCalled = true;
  registerSW();
  _bindActions();

  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, {
    onSuccess: function(user, session) { onLoginSuccess(user, session); },
    onSkip: function() { skipLogin(); }
  });

  // Realtime 统一走公共库：配置订阅表 + 注册变更回调 + 设置页面可见时的云端刷新
  setRealtimeConfig({ channelName: 'baby_vaccines_changes', tables: ['baby_vaccines'] });
  subscribeRealtime(handleVaccineRealtimeChanges);
  App._onStaleRefresh = function() { return loadVaccinesFromCloud(); };
  setupVisibilityListener();

  loadVaccineData();

  // 首屏始终先渲染本地数据（秒开），云端数据后台加载、到达后静默更新，避免闪跳
  renderAll();

  loadSupabaseSDK().then(function() {
    initSupabase();
    return restoreSession();
  }).then(function(sessionResult) {
    if (sessionResult.success) {
      setUserDisplay(App.currentUser.email || '用户');
      updateSyncStatus('online');
      return loadVaccinesFromCloud().then(function() {
        initRealtimeChannel();
      }).catch(function(e) {
        Logger.warn('登录后加载疫苗数据失败', e);
        renderAll(); // 云端加载失败，回退展示本地数据
      });
    } else {
      updateSyncStatus('offline');
      clearUserDisplay();
      renderAll(); // 无有效会话，直接展示本地数据
      if (!sessionStorage.getItem('bt_skip_login')) {
        setTimeout(function() { showLogin(sessionResult.reason === 'decrypt_failed' ? '安全升级，请重新登录' : ''); }, 0);
      }
    }
  }).catch(function(e) {
    Logger.warn('SDK 加载或会话恢复失败', e);
    updateSyncStatus('offline');
    clearUserDisplay();
    renderAll(); // 异常时回退展示本地数据
  });

  // 页面切回可见时的数据刷新与 Realtime 重建由 common-bundle.js setupVisibilityListener() 统一处理

  window.addEventListener('beforeunload', function() { saveVaccineData(); });
  window.addEventListener('pagehide', function() { saveVaccineData(); });
}

document.addEventListener('DOMContentLoaded', function() { init(); });
