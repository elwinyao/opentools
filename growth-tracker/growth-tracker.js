/* ============================================================
   宝宝成长记录页 - 逻辑
   - 档案：区分「已出生(实际出生日)」/「孕期(预产期)」，计算月龄/孕周
   - 记录：身高 + 体重 + 日期 + 备注，本地存储 + Supabase 云同步
   注意：setUserDisplay / clearUserDisplay / updateSyncStatus
   必须为全局函数，公共库的 SIGNED_OUT 回调会直接调用。
   ============================================================ */

/* ---------- 本地存储 ---------- */
var G_STORAGE_KEY = 'baby_growth_data';

// Growth.profile: { birthType:'actual'|'due', birthDate:'YYYY-MM-DD', dueDate:'YYYY-MM-DD', updatedAt }
// Growth.records: { 'YYYY-MM-DD': [ {id, date, height, weight, note, createdAt, updatedAt} ] }
window.Growth = {
  profile: null,
  records: {},
  _initCalled: false,
  _saveIdleId: null
};

function loadGrowthData() {
  try {
    var raw = JSON.parse(localStorage.getItem(G_STORAGE_KEY) || '{}');
    Growth.profile = raw.profile || { birthType: 'actual', birthDate: '', dueDate: '' };
    Growth.records = raw.records || {};
  } catch (e) {
    Growth.profile = { birthType: 'actual', birthDate: '', dueDate: '' };
    Growth.records = {};
  }
  if (!Growth.profile || typeof Growth.profile !== 'object') {
    Growth.profile = { birthType: 'actual', birthDate: '', dueDate: '' };
  }
  if (!Growth.records || typeof Growth.records !== 'object') Growth.records = {};
}

function saveGrowthData() {
  if (Growth._saveIdleId != null) clearTimeout(Growth._saveIdleId);
  Growth._saveIdleId = setTimeout(function() {
    Growth._saveIdleId = null;
    try { localStorage.setItem(G_STORAGE_KEY, JSON.stringify({ profile: Growth.profile, records: Growth.records })); }
    catch (e) { Logger.warn('本地存储写入失败', e); }
  }, 0);
}

function flushGrowthSave() {
  if (Growth._saveIdleId != null) { clearTimeout(Growth._saveIdleId); Growth._saveIdleId = null; }
  try { localStorage.setItem(G_STORAGE_KEY, JSON.stringify({ profile: Growth.profile, records: Growth.records })); }
  catch (e) { Logger.warn('本地存储写入失败', e); }
}

/* ---------- 日期工具 ---------- */
function parseLocal(dateStr) {
  var p = String(dateStr).split('-').map(Number);
  return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
}

// 当前月龄（已出生）
function calcMonthAge(birthDateStr, todayStr) {
  var b = parseLocal(birthDateStr);
  var t = parseLocal(todayStr);
  if (t.getTime() < b.getTime()) return { years: 0, months: 0, days: 0, unborn: true };
  var years = t.getFullYear() - b.getFullYear();
  var months = t.getMonth() - b.getMonth();
  var days = t.getDate() - b.getDate();
  if (days < 0) {
    months--;
    var lastMonthDays = new Date(t.getFullYear(), t.getMonth(), 0).getDate();
    days += lastMonthDays;
  }
  if (months < 0) { years--; months += 12; }
  return { years: years, months: months, days: days, unborn: false };
}

function formatMonthAge(a) {
  var parts = [];
  if (a.years > 0) parts.push(a.years + '岁');
  if (a.months > 0) parts.push(a.months + '个月');
  if (a.days > 0 || parts.length === 0) parts.push(a.days + '天');
  return parts.join('');
}

// 孕周（预产期 = 孕40周）
function calcPregnancy(dueDateStr, todayStr) {
  var DUE_WEEKS = 40;
  var diffMs = parseLocal(dueDateStr).getTime() - parseLocal(todayStr).getTime();
  var daysLeft = Math.round(diffMs / 86400000);           // 距预产期天数（可为负）
  var pregnantDays = DUE_WEEKS * 7 - daysLeft;            // 已孕天数
  var weeks = Math.floor(pregnantDays / 7);
  var remDays = pregnantDays % 7;
  return { weeks: weeks, remDays: remDays, daysLeft: daysLeft, pregnantDays: pregnantDays };
}

// 根据记录日期计算「当时」的月龄/孕周文本（出生月龄含具体天数，如 4个月10天）
// 规则：只要有实际出生日期，出生月龄一律按实际出生日期计算
function ageBadgeAt(dateStr) {
  var p = Growth.profile;
  if (!p) return '';
  if (p.birthDate) {
    var a = calcMonthAge(p.birthDate, dateStr);
    if (a.unborn) return '未出生';
    return formatMonthAge(a);
  }
  if (p.dueDate) {
    var g = calcPregnancy(p.dueDate, dateStr);
    if (g.pregnantDays < 0) return '孕早期';
    if (g.pregnantDays >= 40 * 7) {
      // 已到/超过预产期：宝宝已出生，按预产期计算出生月龄（含天数）
      return formatMonthAge(calcMonthAge(p.dueDate, dateStr));
    }
    return '孕' + g.weeks + '周' + (g.remDays > 0 ? '+' + g.remDays + '天' : '');
  }
  return '';
}

/* ---------- 用户显示 / 同步状态 ---------- */
// Header 三件套（setUserDisplay/clearUserDisplay/updateSyncStatus）统一到公共库 App.UI.bindHeader
App.UI.bindHeader({ displayId: 'userDisplayText', loginId: 'loginLink', logoutId: 'logoutLink' });

/* ---------- 云端同步 ---------- */
function mapCloudGrowthRecord(row) {
  return {
    id: row.id,
    date: row.record_date,
    height: row.height_cm != null ? Number(row.height_cm) : null,
    weight: row.weight_kg != null ? Number(row.weight_kg) : null,
    head: row.head_cm != null ? Number(row.head_cm) : null,
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// 全量拉取成长记录并合并到本地
async function loadGrowthRecordsFromCloud() {
  if (!App.sbClient || !App.currentUser) return;
  var all = await fetchAllPages('baby_growth_records', null, [['record_date', true]]);
  var cloudByDate = {};
  all.forEach(function(row) {
    var d = row.record_date;
    if (!cloudByDate[d]) cloudByDate[d] = [];
    cloudByDate[d].push(mapCloudGrowthRecord(row));
  });
  // 逐日合并（mergeById：updatedAt 大者胜 + 云端删除检测）
  Object.keys(cloudByDate).forEach(function(d) {
    Growth.records[d] = mergeById(Growth.records[d] || [], cloudByDate[d], function(r) { return r.id; }, {
      tiePrefer: 'local',
      sort: function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.id - b.id)); }
    });
  });
  saveGrowthData();
}

// 拉取档案（每用户一条）
async function loadProfileFromCloud() {
  if (!App.sbClient || !App.currentUser) return;
  var result = await App.sbClient.from('baby_profile')
    .select('*')
    .eq('user_id', App.currentUser.id)
    .limit(1);
  if (result.error) throw result.error;
  if (result.data && result.data.length > 0) {
    var row = result.data[0];
    Growth.profile = {
      birthType: row.birth_type || 'actual',
      birthDate: row.birth_date || '',
      dueDate: row.due_date || '',
      updatedAt: row.updated_at
    };
    saveGrowthData();
  }
}

// 推送档案到云端
async function saveProfileToCloud() {
  if (!App.sbClient || !App.currentUser) return;
  try {
    var p = Growth.profile;
    var row = {
      user_id: App.currentUser.id,
      birth_type: p.birthType,
      birth_date: p.birthDate || null,
      due_date: p.dueDate || null,
      updated_at: p.updatedAt || toBJISOString()
    };
    var result = await App.sbClient.from('baby_profile').upsert(row, { onConflict: 'user_id' });
    if (result.error) throw result.error;
    p.updatedAt = toBJISOString();
    saveGrowthData();
  } catch (e) { Logger.warn('档案同步云端失败，稍后重试', e); }
}

// 推送单条记录到云端；失败入公共库重试队列（table=baby_growth_records）
async function syncGrowthRecordToCloud(record, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    var row = {
      id: record.id,
      user_id: App.currentUser.id,
      record_date: record.date,
      height_cm: record.height,
      weight_kg: record.weight,
      head_cm: record.head,
      note: record.note || '',
      updated_at: record.updatedAt || toBJISOString()
    };
    var result = await App.sbClient.from('baby_growth_records').upsert(row, { onConflict: 'id' });
    if (result.error) throw result.error;
    record.updatedAt = toBJISOString();
    saveGrowthData();
  } catch (e) {
    Logger.warn('成长记录同步云端失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_growth_records', action: 'upsert', record: record });
    if (opts.throwOnFail) throw e;
  }
}

// 删除云端记录；失败入公共库重试队列
async function deleteGrowthRecordFromCloud(id, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    var result = await App.sbClient.from('baby_growth_records')
      .delete().eq('id', id).eq('user_id', App.currentUser.id);
    if (result.error) throw result.error;
  } catch (e) {
    Logger.warn('云端删除成长记录失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_growth_records', action: 'delete', id: id });
    if (opts.throwOnFail) throw e;
  }
}

// 注册本页同步表处理函数：公共库同步队列（common-bundle.js）按 table 分发时调用
registerSyncTableHandler('baby_growth_records', {
  upsert: function(record) { return syncGrowthRecordToCloud(record, { enqueue: false, throwOnFail: true }); },
  delete: function(id) { return deleteGrowthRecordFromCloud(id, { enqueue: false, throwOnFail: true }); }
});

// 登录后：把本地未同步数据推上云端
async function pushLocalToCloud() {
  if (!App.currentUser) return;
  if (Growth.profile && !Growth.profile.updatedAt) await saveProfileToCloud();
  Object.keys(Growth.records).forEach(function(d) {
    (Growth.records[d] || []).forEach(function(r) {
      if (!r.updatedAt) syncGrowthRecordToCloud(r);
    });
  });
}

async function loadAllFromCloud() {
  await loadProfileFromCloud();
  await loadGrowthRecordsFromCloud();
}

/* ==================== Realtime ==================== */
// Realtime 统一走公共库（common-bundle.js）：setRealtimeConfig + subscribeRealtime + initRealtimeChannel
// 页面仅注册回调：把公共库批量分发的事件按表路由到对应数据处理函数
function handleGrowthRealtimeChanges(changes) {
  if (!changes || changes.length === 0) return;
  // 公共库已归一化为 { eventType, table, record, old_record }，直接按表路由，不再二次构造 payload
  changes.forEach(function(evt) {
    if (evt.table === 'baby_profile') handleGrowthProfilePayload(evt);
    else handleGrowthRealtimePayload(evt);
  });
}

var _growthDebounceTimer = null;
// 云端记录变更：按 id 合并到本地（updatedAt 大者胜），DELETE 从本地移除
function handleGrowthRealtimePayload(evt) {
  var r = evt.record;
  if (!r || r.id == null) return;
  if (evt.eventType === 'DELETE') {
    var recordId = String(r.id);
    Object.keys(Growth.records).forEach(function(d) {
      var arr = Growth.records[d];
      for (var i = 0; i < arr.length; i++) {
        if (String(arr[i].id) === recordId) {
          arr.splice(i, 1);
          if (arr.length === 0) delete Growth.records[d];
          return;
        }
      }
    });
  } else {
    var newRec = mapCloudGrowthRecord(r);
    if (!Growth.records[newRec.date]) Growth.records[newRec.date] = [];
    var arr = Growth.records[newRec.date];
    var found = false;
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(newRec.id)) {
        var localTime = arr[i].updatedAt ? new Date(arr[i].updatedAt).getTime() : 0;
        var cloudTime = newRec.updatedAt ? new Date(newRec.updatedAt).getTime() : 0;
        if (cloudTime > localTime) arr[i] = newRec;
        found = true;
        break;
      }
    }
    if (!found) arr.push(newRec);
    arr.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : (a.id - b.id)); });
  }
  if (_growthDebounceTimer) clearTimeout(_growthDebounceTimer);
  _growthDebounceTimer = setTimeout(function() { _growthDebounceTimer = null; saveGrowthData(); renderAll(); }, 300);
}

// 云端档案变更：每用户一条，updatedAt 新者胜
function handleGrowthProfilePayload(evt) {
  var r = evt.record;
  if (!r || evt.eventType === 'DELETE') return;
  var p = {
    birthType: r.birth_type || 'actual',
    birthDate: r.birth_date || '',
    dueDate: r.due_date || '',
    updatedAt: r.updated_at
  };
  var localTime = Growth.profile && Growth.profile.updatedAt ? new Date(Growth.profile.updatedAt).getTime() : 0;
  var cloudTime = p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
  if (cloudTime >= localTime) {
    Growth.profile = p;
    saveGrowthData();
    renderAll();
  }
}

/* ---------- 渲染 ---------- */
function renderProfileForm() {
  var p = Growth.profile || { birthType: 'actual', birthDate: '', dueDate: '' };
  document.querySelectorAll('input[name="birthType"]').forEach(function(radio) {
    radio.checked = (radio.value === p.birthType);
  });
  document.getElementById('birthDate').value = p.birthDate || '';
  document.getElementById('dueDate').value = p.dueDate || '';
}

// 档案展示：出生月龄按实际出生日期计算；纠正月龄按预产期计算
function renderAge() {
  var p = Growth.profile || {};
  var today = currentDateBJ();
  var valueEl = document.getElementById('ageValue');
  var dueEl = document.getElementById('ageDueValue');
  var descEl = document.getElementById('ageDesc');

  // 出生月龄：按实际出生日期计算
  if (p.birthDate) {
    var a = calcMonthAge(p.birthDate, today);
    valueEl.textContent = a.unborn ? '未出生' : formatMonthAge(a);
  } else {
    valueEl.textContent = '--';
  }

  // 纠正月龄：以预产期为基准的出生月龄（把预产期当作出生日期）
  if (p.dueDate) {
    var ca = calcMonthAge(p.dueDate, today);
    if (ca.unborn) {
      // 还未到预产期，纠正月龄为负，此时展示孕期状态
      var g = calcPregnancy(p.dueDate, today);
      dueEl.textContent = '未到预产期 · 孕' + g.weeks + '周' + (g.remDays > 0 ? '+' + g.remDays + '天' : '');
    } else {
      dueEl.textContent = formatMonthAge(ca);
    }
  } else {
    dueEl.textContent = '--';
  }

  var notes = [];
  if (p.birthDate) notes.push('出生日期 ' + p.birthDate);
  if (p.dueDate) notes.push('预产期 ' + p.dueDate);
  descEl.textContent = notes.length ? notes.join(' · ') : '设置出生日期或预产期后，自动计算';
}

function getAllRecordsSorted() {
  var list = [];
  Object.keys(Growth.records).forEach(function(d) {
    (Growth.records[d] || []).forEach(function(r) { list.push(r); });
  });
  list.sort(function(a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;   // 日期倒序
    return (a.createdAt || '').localeCompare(b.createdAt || ''); // 创建时间升序
  });
  return list;
}

// 与上一条记录的差值徽标（d 为 null 时无徽标）
function deltaHtml(d) {
  if (d == null) return '';
  if (d > 0) return '<small class="delta up">+ ' + d + '</small>';
  if (d < 0) return '<small class="delta down">- ' + (-d) + '</small>';
  return '<small class="delta flat">±0</small>';
}

function renderRecords() {
  var list = getAllRecordsSorted();          // 日期倒序
  var asc = list.slice().reverse();          // 日期升序

  // 计算每条记录相对「上一条含该指标记录」的变化值（较上条）
  var lastVal = { height: null, weight: null, head: null };
  var deltaMap = {};
  asc.forEach(function(r) {
    var d = { height: null, weight: null, head: null };
    ['height', 'weight', 'head'].forEach(function(k) {
      if (r[k] != null && lastVal[k] != null) {
        d[k] = Math.round((r[k] - lastVal[k]) * 100) / 100;
      }
    });
    deltaMap[String(r.id)] = d;
    ['height', 'weight', 'head'].forEach(function(k) { if (r[k] != null) lastVal[k] = r[k]; });
  });

  var countEl = document.getElementById('recordCount');
  var emptyEl = document.getElementById('emptyState');
  var listEl = document.getElementById('recordList');
  countEl.textContent = list.length > 0 ? '共 ' + list.length + ' 条' : '';
  emptyEl.style.display = list.length > 0 ? 'none' : '';
  listEl.innerHTML = '';

  list.forEach(function(r) {
    var item = document.createElement('div');
    item.className = 'record-item';
    var d = deltaMap[String(r.id)] || {};
    var vals = [];
    if (r.height != null) vals.push('<span class="val">' + r.height + '<small>cm</small>' + deltaHtml(d.height) + '</span>');
    if (r.weight != null) vals.push('<span class="val">' + r.weight + '<small>kg</small>' + deltaHtml(d.weight) + '</span>');
    if (r.head != null) vals.push('<span class="val">' + r.head + '<small>cm</small>' + deltaHtml(d.head) + '</span>');
    var noteHtml = r.note ? '<div class="rec-note">' + escapeHtml(r.note) + '</div>' : '';
    item.innerHTML =
      '<div class="rec-date">' + escapeHtml(r.date) + '<span class="age-badge">' + escapeHtml(ageBadgeAt(r.date)) + '</span></div>' +
      '<div class="rec-values">' + vals.join('') + '</div>' +
      '<div class="rec-note-wrap">' + noteHtml + '</div>' +
      '<button class="rec-del" data-del="' + r.id + '">删除</button>';
    listEl.appendChild(item);
  });
}

// 三个指标分别展示（身高 / 体重 / 头围）
var TREND_SERIES = [
  { chartId: 'trendChartHeight', emptyId: 'trendEmptyHeight', key: 'height', color: '#2E8B57' },
  { chartId: 'trendChartWeight', emptyId: 'trendEmptyWeight', key: 'weight', color: '#E67E22' },
  { chartId: 'trendChartHead',   emptyId: 'trendEmptyHead',   key: 'head',   color: '#7B68EE' }
];

function renderTrend() {
  var all = getAllRecordsSorted().reverse(); // 时间升序
  TREND_SERIES.forEach(function(s) { renderTrendSeries(all, s); });
  scrollTrendRight(); // 默认停在最近 90 天，可左滑查看历史
}

// X 轴标签：每月 1 号展示月份，其他日期只展示「日」
function trendAxisLabel(dateStr) {
  var p = String(dateStr).split('-');
  if (p.length !== 3) return dateStr;
  var m = parseInt(p[1], 10);
  var day = parseInt(p[2], 10);
  // 每月 1 号显示「月份/日期」，如 9/1；其他日期只显示日
  return day === 1 ? m + '/' + day : String(day);
}

function renderTrendSeries(all, s) {
  var chartEl = document.getElementById(s.chartId);
  var emptyEl = document.getElementById(s.emptyId);
  if (!chartEl || !emptyEl) return;

  // 仅取含该指标值的记录；同一天多条时取最后一条
  var pts = all.filter(function(r) { return r[s.key] != null; });
  var dedup = {};
  pts.forEach(function(r) { dedup[r.date] = r; });
  pts = Object.keys(dedup).sort().map(function(d) { return dedup[d]; });

  if (pts.length < 2) {
    chartEl.innerHTML = '';
    emptyEl.style.display = '';
    return;
  }
  emptyEl.style.display = 'none';

  // 时间范围（毫秒，首条至末条记录）
  var t0 = parseLocal(pts[0].date).getTime();
  var t1 = parseLocal(pts[pts.length - 1].date).getTime();
  if (t1 <= t0) t1 = t0 + 86400000;

  // X 轴刻度：所有记录日期 + 覆盖范围内每月 1 号（无论当天是否有记录）
  var firstP = pts[0].date.split('-');
  var lastP = pts[pts.length - 1].date.split('-');
  var cy = +firstP[0], cm = +firstP[1];
  var cEnd = +lastP[0] * 12 + (+lastP[1]);
  var tickMap = {};
  pts.forEach(function(r) { tickMap[r.date] = true; });
  while (cy * 12 + cm <= cEnd) {
    var firstDay = cy + '-' + (cm < 10 ? '0' : '') + cm + '-01';
    if (parseLocal(firstDay).getTime() >= t0) tickMap[firstDay] = true;
    cm++; if (cm > 12) { cm = 1; cy++; }
  }
  var tickDates = Object.keys(tickMap).sort();

  // 横向：图表宽度按时间跨度线性（约 6px/天），记录密集时数值/标签自动抽稀，
  // 超出容器宽度后可左右滑动查看全部；数据少时至少占满容器宽度
  var containerW = chartEl.clientWidth || 340;
  var spanDays = Math.max(1, Math.round((t1 - t0) / 86400000));
  var W = Math.max(containerW, Math.ceil(spanDays * 6) + 24);
  var H = 170;
  var padL = 12, padR = 12, padT = 24, padB = 28;
  var innerW = W - padL - padR;
  var innerH = H - padT - padB;

  var values = pts.map(function(r) { return r[s.key]; });
  var vMin = Math.min.apply(null, values);
  var vMax = Math.max.apply(null, values);
  if (vMax === vMin) vMax = vMin + 1;

  // X 坐标按真实日期线性分布
  function x(dateStr) { return padL + (parseLocal(dateStr).getTime() - t0) / (t1 - t0) * innerW; }
  function y(v) { return padT + innerH - (v - vMin) / (vMax - vMin) * innerH; }

  // X 轴标签抽稀：每月 1 号（月份边界）优先保留，记录日期在间距足够时补入，
  // 避免记录过多时标签重叠拥挤
  var minLabelGap = 46;
  var chosen = [];
  tickDates.forEach(function(d) {
    if (d.slice(-3) !== '-01') return;
    var tx = x(d);
    if (!chosen.length || tx - chosen[chosen.length - 1].x >= minLabelGap) {
      chosen.push({ d: d, x: tx });
    }
  });
  tickDates.forEach(function(d) {
    if (d.slice(-3) === '-01') return;
    var tx = x(d);
    var tooClose = false;
    for (var k = 0; k < chosen.length; k++) {
      if (Math.abs(chosen[k].x - tx) < minLabelGap) { tooClose = true; break; }
    }
    if (!tooClose) chosen.push({ d: d, x: tx });
  });
  chosen.sort(function(a, b) { return a.x - b.x; });

  var svgNS = 'http://www.w3.org/2000/svg';
  var svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('width', W);
  svg.setAttribute('height', '100%');
  svg.style.width = W + 'px';
  svg.style.minWidth = W + 'px';
  svg.style.height = H + 'px';

  // 网格
  for (var gi = 0; gi <= 3; gi++) {
    var gy = padT + innerH - gi / 3 * innerH;
    var line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', padL); line.setAttribute('y1', gy);
    line.setAttribute('x2', W - padR); line.setAttribute('y2', gy);
    line.setAttribute('stroke', '#f0f0f0'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
  }

  // 折线
  var path = '';
  pts.forEach(function(r, i) {
    var v = r[s.key];
    if (v == null) return;
    var px = x(r.date), py = y(v);
    path += (path ? ' L ' : 'M ') + px.toFixed(1) + ' ' + py.toFixed(1);
  });
  if (path) {
    var p = document.createElementNS(svgNS, 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', s.color);
    p.setAttribute('stroke-width', '2.5');
    p.setAttribute('stroke-linejoin', 'round');
    p.setAttribute('stroke-linecap', 'round');
    svg.appendChild(p);
  }

  // 数据点 + 数值标签（数值标签抽稀：间距不足时只画点不画数值，避免拥挤）
  var lastValX = -Infinity;
  pts.forEach(function(r, i) {
    var v = r[s.key];
    if (v == null) return;
    var px = x(r.date), py = y(v);
    var tight = px - lastValX < 40;
    var circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', px); circle.setAttribute('cy', py);
    circle.setAttribute('r', tight ? '2.5' : '3.5');
    circle.setAttribute('fill', s.color);
    circle.setAttribute('class', 'dot-point');
    svg.appendChild(circle);
    if (!tight) {
      lastValX = px;
      var txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', px); txt.setAttribute('y', py - 7);
      txt.setAttribute('text-anchor', 'middle');
      txt.setAttribute('font-size', '10');
      txt.setAttribute('fill', s.color);
      txt.textContent = v;
      svg.appendChild(txt);
    }
  });

  // X 轴日期：抽稀后的刻度标签（每月 1 号优先保留，记录日期间距足够时补入）
  chosen.forEach(function(t) {
    var txt = document.createElementNS(svgNS, 'text');
    txt.setAttribute('x', t.x); txt.setAttribute('y', H - 8);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('class', 'axis-label');
    txt.textContent = trendAxisLabel(t.d);
    svg.appendChild(txt);
  });

  chartEl.innerHTML = '';
  chartEl.appendChild(svg);
}

function renderAll() {
  renderProfileForm();
  renderAge();
  renderRecords();
  renderTrend();
  renderProfileCollapse();
  renderTrendCollapse();
}

/* ---------- 折叠交互 ---------- */

// 当前月龄摘要文本（折叠态展示；出生月龄按实际出生日期，孕期按预产期）
function currentAgeSummary() {
  var p = Growth.profile || {};
  var today = currentDateBJ();
  if (p.birthDate) {
    var a = calcMonthAge(p.birthDate, today);
    return a.unborn ? '未出生' : formatMonthAge(a);
  }
  if (p.dueDate) {
    var g = calcPregnancy(p.dueDate, today);
    if (g.daysLeft >= 0) return '孕 ' + g.weeks + ' 周 + ' + g.remDays + ' 天';
    return '已出生 ' + formatMonthAge(calcMonthAge(p.dueDate, today));
  }
  return '未设置';
}

// 纠正月龄摘要文本（折叠态展示；以预产期为基准）
function dueAgeSummary() {
  var p = Growth.profile || {};
  var today = currentDateBJ();
  if (!p.dueDate) return '--';
  var ca = calcMonthAge(p.dueDate, today);
  if (ca.unborn) {
    var g = calcPregnancy(p.dueDate, today);
    return '未到预产期 · 孕' + g.weeks + '周' + (g.remDays > 0 ? '+' + g.remDays + '天' : '');
  }
  return formatMonthAge(ca);
}

// 档案已存在时默认折叠，只展示当前月龄；未设置时展开表单
function renderProfileCollapse() {
  var p = Growth.profile || {};
  var hasProfile = !!(p.birthDate || p.dueDate);
  var summaryEl = document.getElementById('profileSummary');
  var bodyEl = document.getElementById('profileBody');
  var arrowEl = document.getElementById('profileArrow');
  var collapsed = hasProfile;
  summaryEl.style.display = collapsed ? '' : 'none';
  bodyEl.style.display = collapsed ? 'none' : '';
  arrowEl.textContent = collapsed ? '▸' : '▾';
  if (collapsed) {
    document.getElementById('profileSummaryValue').textContent = currentAgeSummary();
    document.getElementById('profileSummaryDueValue').textContent = dueAgeSummary();
  }
}

function toggleProfile() {
  var bodyEl = document.getElementById('profileBody');
  var summaryEl = document.getElementById('profileSummary');
  var arrowEl = document.getElementById('profileArrow');
  var collapsed = bodyEl.style.display === 'none';
  if (collapsed) {
    bodyEl.style.display = '';
    summaryEl.style.display = 'none';
    arrowEl.textContent = '▾';
    renderProfileForm();
    renderAge();
  } else {
    bodyEl.style.display = 'none';
    summaryEl.style.display = '';
    document.getElementById('profileSummaryValue').textContent = currentAgeSummary();
    document.getElementById('profileSummaryDueValue').textContent = dueAgeSummary();
    arrowEl.textContent = '▸';
  }
}

// 成长趋势默认折叠（展开状态记录在 Growth.trendOpen）
function renderTrendCollapse() {
  var bodyEl = document.getElementById('trendBody');
  var arrowEl = document.getElementById('trendArrow');
  var open = !!Growth.trendOpen;
  bodyEl.style.display = open ? '' : 'none';
  arrowEl.textContent = open ? '▾' : '▸';
  if (open) scrollTrendRight();
}

function toggleTrend() {
  var bodyEl = document.getElementById('trendBody');
  var arrowEl = document.getElementById('trendArrow');
  var collapsed = bodyEl.style.display === 'none';
  Growth.trendOpen = collapsed;
  if (collapsed) {
    bodyEl.style.display = '';
    arrowEl.textContent = '▾';
    // 折叠时图表以兜底宽度渲染，展开后按当前容器宽度重新渲染
    renderTrend();
  } else {
    bodyEl.style.display = 'none';
    arrowEl.textContent = '▸';
  }
}

// 趋势图 X 轴默认停在最近 90 天，可左滑查看更早历史
function scrollTrendRight() {
  requestAnimationFrame(function() {
    TREND_SERIES.forEach(function(s) {
      var el = document.getElementById(s.chartId);
      if (el) el.scrollLeft = el.scrollWidth;
    });
  });
}

/* ---------- 事件 ---------- */
// showToast 已统一到公共库（common-bundle.js），样式见 common.css 的 .app-toast
function onBirthTypeChange() {
  // 两个日期字段都保留，切换只影响「主基准」与摘要展示
  renderAge();
}

async function saveProfile() {
  var type = document.querySelector('input[name="birthType"]:checked').value;
  var birthDate = document.getElementById('birthDate').value;
  var dueDate = document.getElementById('dueDate').value;
  if (!birthDate && !dueDate) { showToast('出生日期和预产期至少填写一项'); return; }
  if (type === 'actual' && !birthDate) { showToast('请选择实际出生日期'); return; }
  if (type === 'due' && !dueDate) { showToast('请选择预产期'); return; }
  Growth.profile = { birthType: type, birthDate: birthDate, dueDate: dueDate, updatedAt: Growth.profile ? Growth.profile.updatedAt : undefined };
  saveGrowthData();
  renderAge();
  renderRecords(); // 档案变化会影响列表中的月龄徽标
  renderProfileCollapse(); // 保存后折叠，只展示当前月龄
  if (App.currentUser) {
    updateSyncStatus('syncing');
    await saveProfileToCloud();
    updateSyncStatus('online');
  }
  showToast('档案已保存');
}

async function addRecord() {
  var date = document.getElementById('recordDate').value || currentDateBJ();
  var hRaw = document.getElementById('heightInput').value;
  var wRaw = document.getElementById('weightInput').value;
  var hdRaw = document.getElementById('headInput').value;
  var note = document.getElementById('noteInput').value.trim();
  var height = hRaw === '' ? null : parseFloat(hRaw);
  var weight = wRaw === '' ? null : parseFloat(wRaw);
  var head = hdRaw === '' ? null : parseFloat(hdRaw);

  if (height == null && weight == null && head == null) { showToast('身高、体重、头围至少填写一项'); return; }
  if (height != null && (isNaN(height) || height < 0 || height > 250)) { showToast('身高数值不合法（0~250cm）'); return; }
  if (weight != null && (isNaN(weight) || weight < 0 || weight > 120)) { showToast('体重数值不合法（0~120kg）'); return; }
  if (head != null && (isNaN(head) || head < 0 || head > 100)) { showToast('头围数值不合法（0~100cm）'); return; }

  var record = {
    id: generateId(),
    date: date,
    height: height,
    weight: weight,
    head: head,
    note: note,
    createdAt: toBJISOString()
  };
  if (!Growth.records[date]) Growth.records[date] = [];
  Growth.records[date].push(record);
  saveGrowthData();
  if (App.currentUser) {
    updateSyncStatus('syncing');
    await syncGrowthRecordToCloud(record);
    startSyncQueueProcessor();
    updateSyncStatus('online');
  }
  document.getElementById('heightInput').value = '';
  document.getElementById('weightInput').value = '';
  document.getElementById('headInput').value = '';
  document.getElementById('noteInput').value = '';
  renderRecords();
  renderTrend();
  showToast('记录已保存');
}

async function deleteRecord(recordId) {
  if (!confirm('确定删除这条成长记录？')) return;
  var found = false;
  Object.keys(Growth.records).forEach(function(d) {
    var arr = Growth.records[d];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === String(recordId)) {
        arr.splice(i, 1);
        if (arr.length === 0) delete Growth.records[d];
        found = true;
        return;
      }
    }
  });
  if (!found) return;
  saveGrowthData();
  if (App.currentUser) {
    updateSyncStatus('syncing');
    await deleteGrowthRecordFromCloud(recordId);
    startSyncQueueProcessor();
    updateSyncStatus('online');
  }
  renderRecords();
  renderTrend();
  showToast('已删除');
}

function _bindActions() {
  document.addEventListener('click', function(e) {
    var actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      var action = actionEl.getAttribute('data-action');
      if (action === 'login') showLogin('登录后可同步宝宝成长数据');
      else if (action === 'logout') logout();
      else if (action === 'birth-type') onBirthTypeChange();
      else if (action === 'save-profile') saveProfile();
      else if (action === 'add-record') addRecord();
      else if (action === 'toggle-profile') toggleProfile();
      else if (action === 'toggle-trend') toggleTrend();
    }
    var delBtn = e.target.closest('[data-del]');
    if (delBtn) deleteRecord(delBtn.getAttribute('data-del'));
  });
  document.getElementById('birthDate').addEventListener('change', function() { renderAge(); });
  document.getElementById('dueDate').addEventListener('change', function() { renderAge(); });
  document.addEventListener('beforeunload', flushGrowthSave);
  document.addEventListener('pagehide', flushGrowthSave);
}

/* ---------- 登录回调 ---------- */
// 公共样板 standardOnLoginSuccess：保存会话 + 隐藏登录框 + 更新 UI + 订阅 Realtime + 启动同步队列；
// 页面只传差异部分（afterSync：推送本地未同步数据 → 拉取云端合并 → 渲染）
async function onLoginSuccess(user, session) {
  return standardOnLoginSuccess(user, {
    subscribe: handleGrowthRealtimeChanges,
    afterSync: async function() {
      try {
        await pushLocalToCloud();
        await loadAllFromCloud();
        renderAll();
      } catch(e) {
        renderAll();  // 失败也渲染本地数据，同步状态由 standardOnLoginSuccess 降级
        throw e;
      }
    }
  });
}

/* ---------- 初始化 ---------- */
async function init() {
  if (Growth._initCalled) return;
  Growth._initCalled = true;

  registerSW();
  _bindActions();

  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, {
    onSuccess: function(user, session) { onLoginSuccess(user, session); },
    onSkip: function() { skipLogin(); }
  });

  // Realtime 统一走公共库：配置订阅表 + 注册变更回调 + 设置页面可见时的云端刷新
  setRealtimeConfig({ channelName: 'baby_growth_changes', tables: ['baby_growth_records', 'baby_profile'] });
  subscribeRealtime(handleGrowthRealtimeChanges);
  App._onStaleRefresh = function() {
    return loadAllFromCloud().then(function() { renderAll(); updateSyncStatus('online'); });
  };

  loadGrowthData();
  document.getElementById('recordDate').value = currentDateBJ();

  // 首屏始终先渲染本地数据（秒开），云端数据后台加载、到达后静默更新，避免闪跳
  renderAll();

  // 异步恢复会话（不阻塞渲染）
  await loadSupabaseSDK();
  initSupabase();
  var sessionResult = await restoreSession();
  if (sessionResult && sessionResult.success) {
    setUserDisplay((App.currentUser && App.currentUser.email) || '用户');
    updateSyncStatus('online');
    initRealtimeChannel();
    loadAllFromCloud()
      .then(function() { renderAll(); updateSyncStatus('online'); })
      .catch(function(e) { Logger.warn('加载云端成长数据失败，继续使用本地数据', e); renderAll(); });
  } else {
    clearUserDisplay();
    updateSyncStatus('offline');
    renderAll();
  }

  // 页面切回可见时的数据刷新与 Realtime 重建由 common-bundle.js setupVisibilityListener() 统一处理
  setupVisibilityListener();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
