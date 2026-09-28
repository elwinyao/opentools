/* ============================================================
   宝宝辅食记录 - 页面逻辑
   - 每日记录：一餐一条，登记当天辅食材料（食材 / 分量 / 性状 / 反应）
   - 食材库：每种食材一条档案（首次添加日 / 观察期 / 过敏 / 暂停）
   - 辅食计划：基于食材库 + 观察期 + 过敏排除，生成未来 3|7 天安排
              （不单独建计划表，直接写入记录表 status='planned'）
   - 统计：自定义日期区间，纯本地规则计算 + 本地规则洞察（不联网、不调模型）
   依赖：lib/common-bundle.js（需在此之前加载）
   注意：setUserDisplay / clearUserDisplay / updateSyncStatus 由公共库 App.UI.bindHeader 绑定
   ============================================================ */

var F_STORAGE_KEY = 'baby_food_data';
var F_OBSERVE_DAYS = 3;

var F_MEALS = ['上午', '下午', '晚餐', '加餐'];
var F_TEXTURES = ['泥糊', '稠糊', '颗粒', '小块', '手指食物'];
var F_CATS = ['谷物', '蔬菜', '水果', '肉类', '蛋类', '水产', '豆类', '油脂', '其他'];
var F_CAT_ICON = { '谷物': '🌾', '蔬菜': '🥬', '水果': '🍎', '肉类': '🥩', '蛋类': '🥚', '水产': '🐟', '豆类': '🫘', '油脂': '🧈', '其他': '🍽️' };
var F_CAT_TARGET = { '谷物': 3, '蔬菜': 8, '水果': 4, '肉类': 4, '蛋类': 2, '水产': 2, '豆类': 1, '油脂': 1 };
var F_STATUS_META = {
  accepted: { cls: 't-ok', text: '已接受' },
  observing: { cls: 't-obs', text: '观察中' },
  allergic: { cls: 't-allergy', text: '过敏' },
  planned: { cls: 't-plan', text: '计划中' },
  paused: { cls: 't-pause', text: '暂停' }
};

// 推荐食材库：[分类, 名称, 是否富铁, 致敏风险]
var F_PRESETS = [
  ['谷物', '铁强化米粉', true, 'low'], ['谷物', '小米粥', false, 'low'], ['谷物', '燕麦糊', false, 'low'], ['谷物', '大米粥', false, 'low'],
  ['蔬菜', '南瓜泥', false, 'low'], ['蔬菜', '胡萝卜泥', false, 'low'], ['蔬菜', '西兰花泥', false, 'low'], ['蔬菜', '菠菜泥', false, 'low'],
  ['蔬菜', '土豆泥', false, 'low'], ['蔬菜', '山药泥', false, 'low'], ['蔬菜', '青菜泥', false, 'low'], ['蔬菜', '番茄泥', false, 'low'],
  ['水果', '苹果泥', false, 'low'], ['水果', '香蕉泥', false, 'low'], ['水果', '梨泥', false, 'low'], ['水果', '牛油果泥', false, 'low'],
  ['水果', '蓝莓泥', false, 'low'],
  ['肉类', '猪肉泥', true, 'low'], ['肉类', '牛肉泥', true, 'low'], ['肉类', '鸡肉泥', true, 'low'], ['肉类', '猪肝泥', true, 'medium'],
  ['肉类', '鸡肝泥', true, 'medium'],
  ['蛋类', '蛋黄', false, 'medium'], ['蛋类', '蛋清', false, 'high'],
  ['水产', '三文鱼泥', false, 'high'], ['水产', '鳕鱼泥', false, 'high'],
  ['豆类', '嫩豆腐', false, 'medium'],
  ['油脂', '核桃油', false, 'low'], ['油脂', '亚麻籽油', false, 'low']
];
var F_PRESET_MAP = {};
F_PRESETS.forEach(function(p) { F_PRESET_MAP[p[1]] = { category: p[0], iron: p[2], risk: p[3] }; });

window.Food = {
  records: {},        // { 'YYYY-MM-DD': [ {id,date,mealType,time,ingredients[],amount,texture,isNew,status,reaction,note,createdAt,updatedAt} ] }
  ingredients: {},    // { name: {id,name,category,firstTryDate,status,ironRich,allergenRisk,note,createdAt,updatedAt} }
  tab: 'daily',
  currentDate: '',
  ingFilter: 'all',
  planDays: 7,
  statFrom: '',
  statTo: '',
  draftIngredients: [],
  draftMeal: '上午',
  draftTexture: '泥糊',
  fmIngredients: [],
  editingRecordId: null,
  editingIngName: null,
  _initCalled: false,
  _saveIdleId: null,
  _realtimeTimer: null,
  _pendingDays: null
};

/* ==================== 日期工具 ==================== */
function fFmt(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function fParse(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function fAddDays(dateStr, n) { var p = String(dateStr).split('-').map(Number); return fFmt(new Date(p[0], p[1] - 1, p[2] + n)); }
function fDayDiff(a, b) { return Math.round((fParse(b) - fParse(a)) / 86400000); }
function fWeekday(dateStr) { return ['日', '一', '二', '三', '四', '五', '六'][fParse(dateStr).getDay()]; }

/* ==================== 本地存储 ==================== */
function loadFoodData() {
  try {
    var raw = JSON.parse(localStorage.getItem(F_STORAGE_KEY) || '{}');
    Food.records = (raw.records && typeof raw.records === 'object') ? raw.records : {};
    Food.ingredients = (raw.ingredients && typeof raw.ingredients === 'object') ? raw.ingredients : {};
  } catch (e) {
    Food.records = {};
    Food.ingredients = {};
  }
}

function writeFoodLocal() {
  try { localStorage.setItem(F_STORAGE_KEY, JSON.stringify({ records: Food.records, ingredients: Food.ingredients })); }
  catch (e) { Logger.warn('辅食数据本地保存失败', e); }
  Food._localDirty = false;
}

function saveFoodData() {
  Food._localDirty = true;
  if (Food._saveIdleId != null) clearTimeout(Food._saveIdleId);
  Food._saveIdleId = setTimeout(function() {
    Food._saveIdleId = null;
    writeFoodLocal();
  }, 0);
}

// 退出/隐藏页面时的兜底落盘：仅当本页确有未落盘的改动才写，
// 避免「本页内存未变、但别处（另一标签页/云端）已更新」时用过期内存覆盖 localStorage
function flushFoodSave() {
  if (Food._saveIdleId != null) { clearTimeout(Food._saveIdleId); Food._saveIdleId = null; }
  if (!Food._localDirty) return;
  writeFoodLocal();
}

/* ==================== 数据工具 ==================== */
function parseIngredientList(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  var s = String(v == null ? '' : v).trim();
  if (!s) return [];
  if (s.charAt(0) === '[') {
    try {
      var arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.map(function(x) { return String(x).trim(); }).filter(Boolean);
    } catch (e) { /* 落回分隔符解析 */ }
  }
  return s.split(/[,，、|]/).map(function(x) { return x.trim(); }).filter(Boolean);
}

function allIngredientList() {
  return Object.keys(Food.ingredients).map(function(k) { return Food.ingredients[k]; })
    .filter(function(x) { return x && x.name; });
}

function ingredientByName(name) { return Food.ingredients[name] || null; }

function categoryOf(name) {
  var ing = ingredientByName(name);
  if (ing && ing.category) return ing.category;
  if (F_PRESET_MAP[name]) return F_PRESET_MAP[name].category;
  return '其他';
}

function isIronRich(name) {
  var ing = ingredientByName(name);
  if (ing) return !!ing.ironRich;
  return !!(F_PRESET_MAP[name] && F_PRESET_MAP[name].iron);
}

function riskOf(name) {
  var ing = ingredientByName(name);
  if (ing && ing.allergenRisk) return ing.allergenRisk;
  return (F_PRESET_MAP[name] && F_PRESET_MAP[name].risk) || 'low';
}

function dayRecords(date) { return (Food.records[date] || []).slice(); }

function findRecordById(id) {
  var key = String(id);
  var dates = Object.keys(Food.records);
  for (var i = 0; i < dates.length; i++) {
    var arr = Food.records[dates[i]] || [];
    for (var j = 0; j < arr.length; j++) {
      if (String(arr[j].id) === key) return arr[j];
    }
  }
  return null;
}

function sortDayRecords(date) {
  var arr = Food.records[date];
  if (!arr) return;
  arr.sort(function(a, b) {
    var ta = a.time || '99:99', tb = b.time || '99:99';
    return ta === tb ? 0 : (ta < tb ? -1 : 1);
  });
}

function putRecordLocal(rec) {
  if (!Food.records[rec.date]) Food.records[rec.date] = [];
  var arr = Food.records[rec.date];
  for (var i = 0; i < arr.length; i++) {
    if (String(arr[i].id) === String(rec.id)) { arr[i] = rec; sortDayRecords(rec.date); saveFoodData(); return; }
  }
  arr.push(rec);
  sortDayRecords(rec.date);
  saveFoodData();
}

function removeRecordLocal(id) {
  var key = String(id);
  Object.keys(Food.records).forEach(function(d) {
    var arr = Food.records[d] || [];
    for (var i = 0; i < arr.length; i++) {
      if (String(arr[i].id) === key) { arr.splice(i, 1); break; }
    }
    if (arr.length === 0) delete Food.records[d];
  });
  saveFoodData();
}

/* ==================== 云端同步 ==================== */
function mapCloudFoodRecord(row) {
  return {
    id: row.id,
    date: row.record_date,
    mealType: row.meal_type || '',
    time: row.meal_time || '',
    ingredients: parseIngredientList(row.ingredients),
    amount: row.amount || '',
    texture: row.texture || '',
    isNew: !!row.is_new,
    status: row.status || 'done',
    reaction: row.reaction || '',
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCloudFoodIngredient(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category || '其他',
    firstTryDate: row.first_try_date || '',
    status: row.status || 'planned',
    ironRich: !!row.iron_rich,
    allergenRisk: row.allergen_risk || 'low',
    note: row.note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function sortRecordsInDay(list) {
  return list.sort(function(a, b) {
    var ta = a.time || '99:99', tb = b.time || '99:99';
    return ta === tb ? 0 : (ta < tb ? -1 : 1);
  });
}

async function loadRecordsFromCloud() {
  if (!App.sbClient || !App.currentUser) return;
  var rows = await fetchAllPages('baby_food_records', null, [['record_date', false]]);
  var cloudByDate = {};
  rows.forEach(function(row) {
    var rec = mapCloudFoodRecord(row);
    if (!cloudByDate[rec.date]) cloudByDate[rec.date] = [];
    cloudByDate[rec.date].push(rec);
  });
  // 遍历「本地日期 ∪ 云端日期」：云端缺失的本地日期用空数组合并，据此清理云端已删记录
  var merged = {};
  Object.keys(Food.records).forEach(function(d) {
    var list = mergeById(Food.records[d] || [], cloudByDate[d] || [], function(r) { return r.id; }, { tiePrefer: 'local' });
    if (list.length > 0) merged[d] = sortRecordsInDay(list);
  });
  Object.keys(cloudByDate).forEach(function(d) {
    if (merged[d]) return;
    merged[d] = sortRecordsInDay(cloudByDate[d]);
  });
  Food.records = merged;
  saveFoodData();
}

async function loadDayFromCloud(dateStr, force) {
  if (!App.sbClient || !App.currentUser) return;
  if (!Food._pendingDays) Food._pendingDays = {};
  if (!force && Food._pendingDays[dateStr]) return;
  Food._pendingDays[dateStr] = true;
  try {
    var result = await App.sbClient.from('baby_food_records').select('*')
      .eq('user_id', App.currentUser.id).eq('record_date', dateStr);
    if (result.error) throw result.error;
    var cloudRecords = (result.data || []).map(mapCloudFoodRecord);
    var localRecords = (Food.records[dateStr] || []).slice();
    var list = mergeById(localRecords, cloudRecords, function(r) { return r.id; }, { tiePrefer: 'local' });
    if (list.length > 0) Food.records[dateStr] = sortRecordsInDay(list); else delete Food.records[dateStr];
    saveFoodData();
  } finally {
    delete Food._pendingDays[dateStr];
  }
}

async function loadIngredientsFromCloud() {
  if (!App.sbClient || !App.currentUser) return;
  var rows = await fetchAllPages('baby_food_ingredients', null, [['name', true]]);
  var cloudList = rows.map(mapCloudFoodIngredient);
  var mergedList = mergeById(allIngredientList(), cloudList, function(x) { return x.name; }, { tiePrefer: 'cloud' });
  Food.ingredients = {};
  mergedList.forEach(function(ing) { if (ing && ing.name) Food.ingredients[ing.name] = ing; });
  saveFoodData();
}

async function loadAllFromCloud() {
  if (!App.sbClient || !App.currentUser) return;
  updateSyncStatus('syncing');
  try {
    loadFoodData();          // 拉取前先重读本地快照，避免并发调用用旧快照 merge
    await loadIngredientsFromCloud();
    await loadRecordsFromCloud();
    updateSyncStatus('online');
  } catch (e) {
    Logger.warn('加载云端辅食数据失败，继续使用本地数据', e);
    updateSyncStatus('offline');
  }
}

async function syncFoodRecordToCloud(record, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    var row = {
      id: record.id,
      user_id: App.currentUser.id,
      record_date: record.date,
      meal_type: record.mealType || '',
      meal_time: record.time || '',
      ingredients: JSON.stringify(record.ingredients || []),
      amount: record.amount || '',
      texture: record.texture || '',
      is_new: !!record.isNew,
      status: record.status || 'done',
      reaction: record.reaction || '',
      note: record.note || '',
      updated_at: record.updatedAt || toBJISOString()
    };
    var result = await App.sbClient.from('baby_food_records').upsert(row, { onConflict: 'id' });
    if (result.error) throw result.error;
    record.updatedAt = toBJISOString();
    saveFoodData();
  } catch (e) {
    Logger.warn('辅食记录同步云端失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_food_records', action: 'upsert', record: record });
    if (opts.throwOnFail) throw e;
  }
}

async function deleteFoodRecordFromCloud(id, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    var result = await App.sbClient.from('baby_food_records').delete().eq('id', id).eq('user_id', App.currentUser.id);
    if (result.error) throw result.error;
  } catch (e) {
    Logger.warn('删除云端辅食记录失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_food_records', action: 'delete', id: id });
    if (opts.throwOnFail) throw e;
  }
}

async function syncIngredientToCloud(ing, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser || !ing) return;
  try {
    var row = {
      id: ing.id,
      user_id: App.currentUser.id,
      name: ing.name,
      category: ing.category || '其他',
      first_try_date: ing.firstTryDate || null,
      status: ing.status || 'planned',
      iron_rich: !!ing.ironRich,
      allergen_risk: ing.allergenRisk || 'low',
      note: ing.note || '',
      updated_at: ing.updatedAt || toBJISOString()
    };
    var result = await App.sbClient.from('baby_food_ingredients').upsert(row, { onConflict: 'id' });
    if (result.error) throw result.error;
    ing.updatedAt = toBJISOString();
    saveFoodData();
  } catch (e) {
    Logger.warn('食材同步云端失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_food_ingredients', action: 'upsert', record: ing });
    if (opts.throwOnFail) throw e;
  }
}

async function deleteIngredientFromCloud(id, opts) {
  opts = opts || {};
  if (!App.sbClient || !App.currentUser) return;
  try {
    var result = await App.sbClient.from('baby_food_ingredients').delete().eq('id', id).eq('user_id', App.currentUser.id);
    if (result.error) throw result.error;
  } catch (e) {
    Logger.warn('删除云端食材失败，加入重试队列', e);
    if (opts.enqueue !== false) addToSyncQueue({ table: 'baby_food_ingredients', action: 'delete', id: id });
    if (opts.throwOnFail) throw e;
  }
}

registerSyncTableHandler('baby_food_records', {
  upsert: function(record) { return syncFoodRecordToCloud(record, { enqueue: false, throwOnFail: true }); },
  delete: function(id) { return deleteFoodRecordFromCloud(id, { enqueue: false, throwOnFail: true }); }
});

registerSyncTableHandler('baby_food_ingredients', {
  upsert: function(record) { return syncIngredientToCloud(record, { enqueue: false, throwOnFail: true }); },
  delete: function(id) { return deleteIngredientFromCloud(id, { enqueue: false, throwOnFail: true }); }
});

// 登录后：把本地未同步的数据推上云端
function pushLocalToCloud() {
  if (!App.currentUser) return;
  allIngredientList().forEach(function(ing) { if (!ing.updatedAt) syncIngredientToCloud(ing); });
  Object.keys(Food.records).forEach(function(d) {
    (Food.records[d] || []).forEach(function(r) { if (!r.updatedAt) syncFoodRecordToCloud(r); });
  });
}

/* ==================== Realtime ==================== */
function _foodRealtimeRender() {
  if (Food._realtimeTimer) clearTimeout(Food._realtimeTimer);
  Food._realtimeTimer = setTimeout(function() { Food._realtimeTimer = null; renderAll(); }, 300);
}

function handleFoodRealtimeChanges(changes) {
  if (!changes || changes.length === 0) return;
  changes.forEach(function(evt) {
    if (evt.table === 'baby_food_ingredients') handleIngredientPayload(evt);
    else handleFoodRecordPayload(evt);
  });
}

function handleFoodRecordPayload(evt) {
  var r = evt.record;
  if (!r || r.id == null) return;
  if (evt.eventType === 'DELETE') {
    removeRecordLocal(r.id);
  } else {
    var rec = mapCloudFoodRecord(r);
    var existing = findRecordById(rec.id);
    if (existing) {
      var lt = existing.updatedAt ? new Date(existing.updatedAt).getTime() : 0;
      var ct = rec.updatedAt ? new Date(rec.updatedAt).getTime() : 0;
      if (ct <= lt) return;
      if (existing.date !== rec.date) removeRecordLocal(rec.id);
    }
    putRecordLocal(rec);
  }
  _foodRealtimeRender();
}

function handleIngredientPayload(evt) {
  var r = evt.record;
  if (!r || !r.name) return;
  if (evt.eventType === 'DELETE') {
    if (Food.ingredients[r.name]) { delete Food.ingredients[r.name]; saveFoodData(); }
  } else {
    var ing = mapCloudFoodIngredient(r);
    var cur = Food.ingredients[ing.name];
    var lt = cur && cur.updatedAt ? new Date(cur.updatedAt).getTime() : 0;
    var ct = ing.updatedAt ? new Date(ing.updatedAt).getTime() : 0;
    if (cur && ct < lt) return;
    Food.ingredients[ing.name] = ing;
    saveFoodData();
  }
  _foodRealtimeRender();
}

/* ==================== 业务规则 ==================== */
// 食材入库（不存在则按预设/默认建档）
function ensureIngredient(name, opts) {
  opts = opts || {};
  name = String(name || '').trim();
  if (!name) return null;
  var ing = Food.ingredients[name];
  if (ing) return ing;
  var preset = F_PRESET_MAP[name] || {};
  ing = {
    id: generateId(),
    name: name,
    category: opts.category || preset.category || '其他',
    firstTryDate: opts.firstTryDate || '',
    status: opts.status || 'planned',
    ironRich: opts.ironRich !== undefined ? !!opts.ironRich : !!preset.iron,
    allergenRisk: opts.allergenRisk || preset.risk || 'low',
    note: '',
    createdAt: toBJISOString()
  };
  Food.ingredients[name] = ing;
  saveFoodData();
  syncIngredientToCloud(ing);
  return ing;
}

// 记录保存后：把「已喂」记录里的食材同步进食材库（首次添加日 + 进入观察期）
function syncIngredientsFromRecord(rec) {
  if (!rec || rec.status !== 'done') return;
  (rec.ingredients || []).forEach(function(name) {
    name = String(name || '').trim();
    if (!name) return;
    var ing = ensureIngredient(name);
    if (!ing) return;
    if (ing.status === 'allergic' || ing.status === 'paused') return;  // 人工标记不被覆盖
    if (!ing.firstTryDate || rec.date < ing.firstTryDate) {
      ing.firstTryDate = rec.date;
      if (ing.status === 'planned' || ing.status === 'observing') ing.status = 'observing';
      ing.updatedAt = toBJISOString();
      syncIngredientToCloud(ing);
    }
  });
  saveFoodData();
}

// 观察期推进：首次添加满 3 天后自动转「已接受」
function refreshObservation() {
  var today = currentDateBJ();
  var changed = false;
  allIngredientList().forEach(function(ing) {
    if (ing.status !== 'observing' || !ing.firstTryDate) return;
    if (fDayDiff(ing.firstTryDate, today) >= F_OBSERVE_DAYS) {
      ing.status = 'accepted';
      ing.updatedAt = toBJISOString();
      changed = true;
      syncIngredientToCloud(ing);
    }
  });
  if (changed) saveFoodData();
}

function observationDayIndex(ing, dateStr) {
  if (!ing || !ing.firstTryDate) return 0;
  return fDayDiff(ing.firstTryDate, dateStr || currentDateBJ()) + 1;
}

/* ==================== 记录增删改 ==================== */
function addRecordFromForm() {
  if (Food.draftIngredients.length === 0) { showToast('请先选择至少 1 种食材'); return; }
  var rec = {
    id: generateId(),
    date: Food.currentDate,
    mealType: Food.draftMeal,
    time: document.getElementById('addMealTime').value || '',
    ingredients: Food.draftIngredients.slice(),
    amount: document.getElementById('addAmount').value.trim(),
    texture: Food.draftTexture,
    isNew: document.getElementById('addIsNew').checked,
    status: 'done',
    reaction: document.getElementById('addReaction').value,
    note: document.getElementById('addNote').value.trim(),
    createdAt: toBJISOString()
  };
  putRecordLocal(rec);
  syncFoodRecordToCloud(rec);
  syncIngredientsFromRecord(rec);
  confirmReactionForNewIngredients(rec);
  resetAddForm();
  renderAll();
  showToast('已添加 ' + rec.ingredients.length + ' 种食材');
}

function resetAddForm() {
  Food.draftIngredients = [];
  document.getElementById('addNewIngInput').value = '';
  document.getElementById('addAmount').value = '';
  document.getElementById('addNote').value = '';
  document.getElementById('addReaction').value = '';
  document.getElementById('addIsNew').checked = false;
  renderDraftPickers();
}

// 反应为过敏/疑似过敏时，确认是否把本次新食材标记为过敏 / 暂停
function confirmReactionForNewIngredients(rec) {
  if (rec.reaction !== '过敏' && rec.reaction !== '疑似过敏') return;
  var names = (rec.ingredients || []).filter(function(n) {
    var ing = Food.ingredients[n];
    return ing && (ing.status === 'observing' || ing.status === 'planned' || !ing.firstTryDate);
  });
  if (names.length === 0) return;
  var toAllergic = rec.reaction === '过敏';
  var msg = '本次反应记录为「' + rec.reaction + '」。\n\n是否把 ' + names.join('、') + ' 标记为「' +
    (toAllergic ? '过敏' : '暂停') + '」食材？\n（标记后计划与统计会自动排除它）';
  if (!confirm(msg)) return;
  names.forEach(function(n) {
    var ing = Food.ingredients[n];
    if (!ing) return;
    ing.status = toAllergic ? 'allergic' : 'paused';
    ing.note = (ing.note ? ing.note + '；' : '') + rec.date + ' ' + rec.reaction;
    ing.updatedAt = toBJISOString();
    syncIngredientToCloud(ing);
  });
  saveFoodData();
  renderAll();
}

function updateRecord(rec, patch) {
  Object.keys(patch).forEach(function(k) { rec[k] = patch[k]; });
  rec.updatedAt = toBJISOString();
  putRecordLocal(rec);
  syncFoodRecordToCloud(rec);
  syncIngredientsFromRecord(rec);
  renderAll();
}

function deleteRecord(id) {
  var rec = findRecordById(id);
  if (!rec) return;
  if (!confirm('删除这条辅食记录？')) return;
  if (App.currentUser) deleteFoodRecordFromCloud(id);
  removeRecordLocal(id);
  renderAll();
  showToast('已删除');
}

function markRecordDone(id) {
  var rec = findRecordById(id);
  if (!rec) return;
  rec.status = 'done';
  if (!rec.time && currentDateBJ() === rec.date) {
    var d = nowBJ();
    rec.time = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  rec.updatedAt = toBJISOString();
  putRecordLocal(rec);
  syncFoodRecordToCloud(rec);
  syncIngredientsFromRecord(rec);
  refreshObservation();
  renderAll();
  showToast('已记为已喂');
}

function markDayDone(dateStr) {
  var arr = (Food.records[dateStr] || []).filter(function(r) { return r.status === 'planned'; });
  if (arr.length === 0) { showToast('当天没有待执行的计划'); return; }
  arr.forEach(function(r) {
    r.status = 'done';
    r.updatedAt = toBJISOString();
    putRecordLocal(r);
    syncFoodRecordToCloud(r);
    syncIngredientsFromRecord(r);
  });
  refreshObservation();
  renderAll();
  showToast('已记为已喂 ' + arr.length + ' 餐');
}

function clearDay() {
  var arr = dayRecords(Food.currentDate);
  if (arr.length === 0) { showToast('当天没有记录'); return; }
  if (!confirm('清空 ' + Food.currentDate + ' 的 ' + arr.length + ' 条记录？')) return;
  arr.forEach(function(r) {
    if (App.currentUser) deleteFoodRecordFromCloud(r.id);
    removeRecordLocal(r.id);
  });
  renderAll();
  showToast('已清空当天');
}

/* ==================== 计划生成 ==================== */
function foodStateBuckets() {
  var st = { accepted: [], observing: [], planned: [], allergic: [], paused: [] };
  allIngredientList().forEach(function(ing) {
    (st[ing.status] || st.planned).push(ing);
  });
  return st;
}

function lastUsedMap() {
  var m = {};
  Object.keys(Food.records).forEach(function(d) {
    (Food.records[d] || []).forEach(function(r) {
      if (r.status !== 'done') return;
      (r.ingredients || []).forEach(function(n) { if (!m[n] || d > m[n]) m[n] = d; });
    });
  });
  return m;
}

function takeIngredient(pool, usedNames, lastUsed, filterFn) {
  var cand = pool.filter(function(ing) {
    return usedNames.indexOf(ing.name) < 0 && (!filterFn || filterFn(ing));
  });
  if (cand.length === 0) return null;
  cand.sort(function(a, b) {
    return String(lastUsed[a.name] || '0000-00-00').localeCompare(String(lastUsed[b.name] || '0000-00-00'));
  });
  return cand[0];
}

// 计划算法：观察期优先 → 每 3 天 1 种新食材 → 已接受食材按「最久没吃」轮换 → 结构补位
function buildPlan(days, mealsPerDay) {
  var today = currentDateBJ();
  var planDates = [];
  for (var i = 1; i <= days; i++) planDates.push(fAddDays(today, i));

  var st = foodStateBuckets();
  var lastUsed = lastUsedMap();
  var allergicNames = st.allergic.map(function(x) { return x.name; });
  var ruleNew = document.getElementById('planRuleNew').checked;
  var ruleIron = document.getElementById('planRuleIron').checked;
  var ruleExclude = document.getElementById('planRuleExclude').checked;

  var acceptedPool = st.accepted.filter(function(ing) {
    return !(ruleExclude && allergicNames.indexOf(ing.name) >= 0);
  });

  // 观察期安排：观察中食材在其 3 天窗口内继续吃
  var obsAssign = {};
  st.observing.forEach(function(ing) {
    if (!ing.firstTryDate) return;
    for (var k = 0; k < F_OBSERVE_DAYS; k++) {
      var d = fAddDays(ing.firstTryDate, k);
      if (planDates.indexOf(d) >= 0) { (obsAssign[d] = obsAssign[d] || []).push(ing.name); }
    }
  });

  // 候选新食材：库中「计划中」的食材，按 富铁 > 低致敏 排序
  var riskOrder = { low: 0, medium: 1, high: 2 };
  var newCands = st.planned.slice().sort(function(a, b) {
    if (ruleIron && a.ironRich !== b.ironRich) return a.ironRich ? -1 : 1;
    var ra = riskOrder[a.allergenRisk] || 0, rb = riskOrder[b.allergenRisk] || 0;
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name));
  });

  var lastNewDate = st.observing.concat(st.accepted)
    .map(function(x) { return x.firstTryDate; }).filter(Boolean).sort().pop() || '';

  var plan = {};
  var newIdx = 0;

  planDates.forEach(function(d) {
    var used = [];
    var meals = [];

    var inObsWindow = st.observing.some(function(ing) {
      return ing.firstTryDate && d >= ing.firstTryDate && fDayDiff(ing.firstTryDate, d) < F_OBSERVE_DAYS;
    });
    var gapOk = !ruleNew || !lastNewDate || fDayDiff(lastNewDate, d) >= F_OBSERVE_DAYS;

    var newIng = null;
    if (!inObsWindow && gapOk && newIdx < newCands.length) {
      newIng = newCands[newIdx++];
      lastNewDate = d;
    }

    // 第 1 餐：观察中食材优先 + 新食材 + 主食 + 富铁 + 蔬菜（最多 4 种）
    var first = [];
    (obsAssign[d] || []).forEach(function(n) { if (first.indexOf(n) < 0) first.push(n); });
    if (newIng) first.push(newIng.name);
    var main = takeIngredient(acceptedPool, used.concat(first), lastUsed, function(x) { return x.category === '谷物'; });
    if (main) first.push(main.name);
    var iron = takeIngredient(acceptedPool, used.concat(first), lastUsed, function(x) { return x.ironRich; });
    if (iron) first.push(iron.name);
    var veg = takeIngredient(acceptedPool, used.concat(first), lastUsed, function(x) { return x.category === '蔬菜'; });
    if (veg) first.push(veg.name);
    first = first.slice(0, 4);
    if (first.length === 0) {
      var any = takeIngredient(acceptedPool, used, lastUsed, null);
      if (any) first.push(any.name);
    }
    if (first.length > 0) {
      meals.push({ mealType: '上午', time: '10:00', ingredients: first });
      first.forEach(function(n) { used.push(n); lastUsed[n] = d; });
    }

    // 第 2 餐：加餐（水果）
    if (mealsPerDay >= 2) {
      var fruit = takeIngredient(acceptedPool, used, lastUsed, function(x) { return x.category === '水果'; });
      if (!fruit) fruit = takeIngredient(acceptedPool, used, lastUsed, null);
      if (fruit) {
        meals.push({ mealType: '加餐', time: '15:30', ingredients: [fruit.name] });
        used.push(fruit.name);
        lastUsed[fruit.name] = d;
      }
    }

    // 第 3 餐：晚餐（主食 + 蔬菜）
    if (mealsPerDay >= 3) {
      var third = [];
      var m3 = takeIngredient(acceptedPool, used, lastUsed, function(x) { return x.category === '谷物'; });
      if (m3) third.push(m3.name);
      var v3 = takeIngredient(acceptedPool, used.concat(third), lastUsed, function(x) { return x.category === '蔬菜'; });
      if (v3) third.push(v3.name);
      if (third.length > 0) {
        meals.push({ mealType: '晚餐', time: '17:30', ingredients: third });
        third.forEach(function(n) { used.push(n); lastUsed[n] = d; });
      }
    }

    if (meals.length > 0) plan[d] = meals;
  });

  return plan;
}

function generatePlanFromUI() {
  var days = Food.planDays || 7;
  var mealsPerDay = parseInt(document.getElementById('planMealsPerDay').value, 10) || 2;

  var hasAccepted = allIngredientList().some(function(i) { return i.status === 'accepted'; });
  if (!hasAccepted) { showToast('请先在「食材库」添加并接受一些食材'); return; }

  var plan = buildPlan(days, mealsPerDay);
  var dates = Object.keys(plan);
  if (dates.length === 0) { showToast('暂无可生成的计划，请先补充食材库'); return; }

  // 覆盖同区间内「未执行」的计划项（已喂记录不动）
  dates.forEach(function(d) {
    (Food.records[d] || []).slice().forEach(function(r) {
      if (r.status !== 'planned') return;
      if (App.currentUser) deleteFoodRecordFromCloud(r.id);
      removeRecordLocal(r.id);
    });
  });

  var count = 0;
  dates.forEach(function(d) {
    plan[d].forEach(function(m) {
      var rec = {
        id: generateId(),
        date: d,
        mealType: m.mealType,
        time: m.time,
        ingredients: m.ingredients,
        amount: '',
        texture: '',
        isNew: false,
        status: 'planned',
        reaction: '',
        note: '',
        createdAt: toBJISOString()
      };
      putRecordLocal(rec);
      syncFoodRecordToCloud(rec);
      count++;
    });
  });

  renderAll();
  showToast('已生成 ' + dates.length + ' 天 · ' + count + ' 餐计划');
}

/* ==================== 统计 ==================== */
function statRangeInfo() {
  var to = Food.statTo || currentDateBJ();
  var from = Food.statFrom || fAddDays(to, -29);
  var invalid = from > to;
  return { from: from, to: to, days: invalid ? 0 : (fDayDiff(from, to) + 1), invalid: invalid };
}

function initStatRange() {
  var to = currentDateBJ();
  Food.statTo = to;
  Food.statFrom = fAddDays(to, -29);
  document.getElementById('statFrom').value = Food.statFrom;
  document.getElementById('statTo').value = Food.statTo;
}

function applyStatRange(days) {
  var to = currentDateBJ();
  var from;
  if (days === 0) {
    var all = Object.keys(Food.records).sort();
    var firstTry = allIngredientList().map(function(i) { return i.firstTryDate; }).filter(Boolean).sort();
    from = firstTry[0] || all[0] || to;
  } else {
    from = fAddDays(to, -(days - 1));
  }
  Food.statFrom = from;
  Food.statTo = to;
  document.getElementById('statFrom').value = from;
  document.getElementById('statTo').value = to;
  document.querySelectorAll('#statRangeChips .chip').forEach(function(c) {
    c.classList.toggle('active', parseInt(c.getAttribute('data-days'), 10) === days);
  });
  renderStats();
  showToast('统计已更新 · ' + statRangeInfo().days + ' 天');
}

function doneRecordsInRange(from, to) {
  var out = [];
  Object.keys(Food.records).forEach(function(d) {
    if (d < from || d > to) return;
    (Food.records[d] || []).forEach(function(r) { if (r.status === 'done') out.push(r); });
  });
  return out;
}

function hasDoneOn(dateStr) {
  return (Food.records[dateStr] || []).some(function(r) { return r.status === 'done'; });
}

function sumAmounts(recs) {
  var total = 0, unit = 'g', found = false;
  recs.forEach(function(r) {
    var m = String(r.amount || '').match(/(\d+(?:\.\d+)?)\s*(g|ml|克|毫升|勺)?/i);
    if (!m) return;
    total += parseFloat(m[1]);
    found = true;
    if (m[2] && /ml|毫升/i.test(m[2])) unit = 'ml';
  });
  return found ? (Math.round(total * 10) / 10) + unit : '—';
}

function computeStats() {
  var rg = statRangeInfo();
  var recs = rg.invalid ? [] : doneRecordsInRange(rg.from, rg.to);
  var byDate = {};
  recs.forEach(function(r) { (byDate[r.date] = byDate[r.date] || []).push(r); });
  var dates = Object.keys(byDate).sort();

  var ingsAll = allIngredientList();
  var triedAll = ingsAll.filter(function(i) { return i.firstTryDate; });
  var newInRange = triedAll.filter(function(i) { return i.firstTryDate >= rg.from && i.firstTryDate <= rg.to; });
  var allergic = ingsAll.filter(function(i) { return i.status === 'allergic'; });

  var ironNames = {}, catOf = {};
  ingsAll.forEach(function(i) { catOf[i.name] = i.category; if (i.ironRich) ironNames[i.name] = 1; });

  var ingDays = {}, diversity = {}, ctx = { iron: 0, grain: 0, veg: 0, fruit: 0 };
  dates.forEach(function(d) {
    var names = {};
    byDate[d].forEach(function(r) { (r.ingredients || []).forEach(function(n) { names[n] = 1; }); });
    var keys = Object.keys(names);
    diversity[d] = keys.length;
    keys.forEach(function(n) { ingDays[n] = (ingDays[n] || 0) + 1; });
    if (keys.some(function(n) { return ironNames[n]; })) ctx.iron++;
    if (keys.some(function(n) { return catOf[n] === '谷物'; })) ctx.grain++;
    if (keys.some(function(n) { return catOf[n] === '蔬菜'; })) ctx.veg++;
    if (keys.some(function(n) { return catOf[n] === '水果'; })) ctx.fruit++;
  });

  var top = Object.keys(ingDays).map(function(n) { return { name: n, days: ingDays[n] }; })
    .sort(function(a, b) { return b.days - a.days || String(a.name).localeCompare(String(b.name)); })
    .slice(0, 8);

  var streak = 0, cur = rg.to;
  while (hasDoneOn(cur)) { streak++; cur = fAddDays(cur, -1); }

  var recentNew = triedAll.slice().sort(function(a, b) {
    return String(b.firstTryDate || '').localeCompare(String(a.firstTryDate || ''));
  }).slice(0, 6);

  var gaps = [];
  recentNew.forEach(function(ing, i) {
    if (i === recentNew.length - 1) { gaps.push('首次添加'); return; }
    gaps.push('间隔 ' + fDayDiff(recentNew[i + 1].firstTryDate, ing.firstTryDate) + ' 天');
  });
  var gapSum = 0;
  for (var gi = 0; gi < recentNew.length - 1; gi++) {
    gapSum += fDayDiff(recentNew[gi + 1].firstTryDate, recentNew[gi].firstTryDate);
  }
  var avgGap = (recentNew.length > 1) ? Math.round((gapSum / (recentNew.length - 1)) * 10) / 10 : 0;

  var avgDiv = dates.length ? (dates.reduce(function(s, d) { return s + diversity[d]; }, 0) / dates.length) : 0;

  return {
    range: rg, recs: recs, dates: dates, byDate: byDate,
    triedAll: triedAll, newInRange: newInRange, allergic: allergic, ingsAll: ingsAll,
    ingDays: ingDays, diversity: diversity, top: top, ctx: ctx, streak: streak,
    recentNew: recentNew, gaps: gaps, avgGap: avgGap,
    allergyRecs: recs.filter(function(r) { return r.reaction === '过敏' || r.reaction === '疑似过敏'; }),
    refuseRecs: recs.filter(function(r) { return r.reaction === '拒食'; }),
    avgDiv: Math.round(avgDiv * 10) / 10
  };
}

// 洞察与建议：纯本地规则，按优先级取前 5 条
function buildInsights(st) {
  if (st.range.invalid) return ['⚠️ 开始日期晚于结束日期，请重新选择统计范围。'];
  var out = [];
  var days = st.range.days || 1;

  var ironRate = days ? Math.round(st.ctx.iron / days * 100) : 0;
  if (st.dates.length) {
    if (ironRate < 70) out.push('🩸 <b>富铁摄入不足</b>：本区间仅 ' + st.ctx.iron + '/' + days + ' 天出现富铁食材（' + ironRate + '%），建议增加红肉泥 / 肝泥。');
    else out.push('✅ <b>富铁摄入达标</b>：' + st.ctx.iron + '/' + days + ' 天出现富铁食材（' + ironRate + '%），红肉与肝泥轮换良好。');
  }

  var fruitRate = days ? Math.round(st.ctx.fruit / days * 100) : 0;
  if (st.dates.length && fruitRate < 50) {
    out.push('⚠️ <b>水果偏少</b>：仅 ' + st.ctx.fruit + '/' + days + ' 天吃水果，建议固定下午加餐为水果泥。');
  }

  var overdue = st.ingsAll.filter(function(i) {
    return i.status === 'observing' && i.firstTryDate && fDayDiff(i.firstTryDate, currentDateBJ()) >= F_OBSERVE_DAYS;
  });
  if (overdue.length) {
    out.push('⏳ <b>' + overdue.length + ' 种食材观察期已满</b>（' + overdue.map(function(i) { return i.name; }).join('、') + '），请确认是否已接受。');
  }

  if (st.top.length && days >= 7 && st.top[0].days / days > 0.6) {
    out.push('🔁 <b>轮换可优化</b>：' + st.top[0].name + ' 出现 ' + st.top[0].days + ' 天（占比 ' + Math.round(st.top[0].days / days * 100) + '%），可用同类食材替换。');
  }

  var missing = ['谷物', '蔬菜', '水果', '肉类', '蛋类', '水产', '豆类', '油脂'].filter(function(c) {
    return !st.ingsAll.some(function(i) { return i.category === c; });
  });
  if (missing.length) out.push('💡 <b>分类未覆盖</b>：' + missing.join('、') + ' 尚未引入，可逐步安排。');

  if (st.avgGap > 5) out.push('📈 <b>新食材引入偏慢</b>：最近平均间隔 ' + st.avgGap + ' 天，建议每 3 天引入 1 种。');
  else if (st.avgGap > 0) out.push('📈 <b>引入节奏良好</b>：平均每 ' + st.avgGap + ' 天引入 1 种新食材。');

  if (st.allergic.length) {
    out.push('🚫 <b>已自动排除</b>：' + st.allergic.map(function(i) { return i.name; }).join('、') + '（计划与统计中不再出现）。');
  }

  if (out.length === 0) out.push('📝 本区间数据较少，继续记录后会自动生成更有针对性的建议。');
  return out.slice(0, 5);
}

/* ==================== 渲染公共小件 ==================== */
function makeBtn(text, cls, action, attrs) {
  var b = document.createElement('button');
  b.className = cls;
  b.textContent = text;
  b.setAttribute('data-action', action);
  Object.keys(attrs || {}).forEach(function(k) { b.setAttribute('data-' + k, attrs[k]); });
  return b;
}

function buildIngPill(name, dateStr) {
  var span = document.createElement('span');
  span.className = 'ing-pill';
  var ing = ingredientByName(name);
  var prefix = (ing && ing.status === 'observing') ? '⏳ ' : '';
  span.textContent = prefix + name;
  if (ing && ing.status === 'observing' && dateStr) {
    var n = observationDayIndex(ing, dateStr);
    if (n >= 1 && n <= F_OBSERVE_DAYS) span.textContent += '（第' + n + '/' + F_OBSERVE_DAYS + '天）';
  }
  return span;
}

function renderBarRows(id, rows) {
  var box = document.getElementById(id);
  if (!box) return;
  if (rows.length === 0) { box.innerHTML = '<div class="empty-state" style="padding:16px 0">暂无数据</div>'; return; }
  box.innerHTML = rows.map(function(r) {
    var pct = r.total > 0 ? Math.round(r.val / r.total * 100) : 0;
    var valText = r.unit ? (r.val + r.unit) : (r.val + ' / ' + r.total);
    return '<div class="bar-row">' +
      '<div class="bar-label">' + escapeHtml(r.label) + '</div>' +
      '<div class="bar-track"><i class="' + (r.cls || '') + '" style="width:' + pct + '%"></i></div>' +
      '<div class="bar-val">' + escapeHtml(String(valText)) + '</div>' +
      '</div>';
  }).join('');
}

/* ==================== 渲染：每日记录 ==================== */
function renderDay() {
  var d = Food.currentDate;
  var dt = fParse(d);
  document.getElementById('dateText').textContent = (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
  document.getElementById('dateSub').textContent = '星期' + fWeekday(d) + (d === currentDateBJ() ? ' · 今天' : '');
  document.getElementById('datePickerInput').value = d;

  renderDaySummary();

  var list = document.getElementById('recordList');
  var arr = dayRecords(d);
  document.getElementById('dayCount').textContent = arr.length ? ('共 ' + arr.length + ' 条') : '';
  while (list.firstChild) list.removeChild(list.firstChild);

  if (arr.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="emoji">🥣</div><div>今天还没有辅食记录</div>';
    list.appendChild(empty);
    return;
  }

  var frag = document.createDocumentFragment();
  arr.forEach(function(r) {
    var planned = r.status === 'planned';
    var item = document.createElement('div');
    item.className = 'record-item' + (planned ? ' planned' : '');

    var icon = document.createElement('div');
    icon.className = 'rec-icon';
    icon.textContent = planned ? '🕘' : '🥣';
    item.appendChild(icon);

    var info = document.createElement('div');
    info.className = 'rec-info';

    var title = document.createElement('div');
    title.className = 'rec-title';
    title.innerHTML = escapeHtml(r.time ? (r.time + ' · ' + (r.mealType || '')) : (r.mealType || '未填餐次')) +
      (planned ? ' <span class="tag t-plan">计划</span>' : '') +
      (r.isNew ? ' <span class="tag t-new">🆕 新食材</span>' : '');
    info.appendChild(title);

    var ings = document.createElement('div');
    ings.className = 'rec-ings';
    (r.ingredients || []).forEach(function(n) { ings.appendChild(buildIngPill(n, r.date)); });
    info.appendChild(ings);

    var metaParts = [];
    if (r.amount) metaParts.push('分量: ' + r.amount);
    if (r.texture) metaParts.push(r.texture);
    if (r.reaction) metaParts.push('反应: ' + r.reaction);
    if (r.note) metaParts.push(r.note);
    if (metaParts.length) {
      var meta = document.createElement('div');
      meta.className = 'rec-meta';
      meta.textContent = metaParts.join(' · ');
      info.appendChild(meta);
    }
    item.appendChild(info);

    var acts = document.createElement('div');
    acts.className = 'rec-acts';
    if (planned) acts.appendChild(makeBtn('✓ 已喂', 'btn-line', 'mark-done', { id: r.id }));
    else {
      acts.appendChild(makeBtn('✎', 'btn-line', 'edit-record', { id: r.id }));
      acts.appendChild(makeBtn('✕', 'btn-line danger', 'delete-record', { id: r.id }));
    }
    item.appendChild(acts);
    frag.appendChild(item);
  });
  list.appendChild(frag);
}

function renderDaySummary() {
  var d = Food.currentDate;
  var arr = dayRecords(d).filter(function(r) { return r.status === 'done'; });
  var names = {}, newNames = {};
  arr.forEach(function(r) {
    (r.ingredients || []).forEach(function(n) {
      names[n] = 1;
      if (r.isNew) newNames[n] = 1;
      var ing = ingredientByName(n);
      if (ing && ing.firstTryDate === d) newNames[n] = 1;
    });
  });
  var observing = 0;
  allIngredientList().forEach(function(ing) {
    if (ing.status !== 'observing' || !ing.firstTryDate) return;
    if (d >= ing.firstTryDate && fDayDiff(ing.firstTryDate, d) < F_OBSERVE_DAYS) observing++;
  });

  var bar = document.getElementById('daySummary');
  while (bar.firstChild) bar.removeChild(bar.firstChild);
  [
    { v: Object.keys(names).length, label: '食材种类', cls: '' },
    { v: Object.keys(newNames).length, label: '新食材', cls: 'r' },
    { v: observing, label: '观察中', cls: 'b' },
    { v: sumAmounts(arr), label: '辅食总量', cls: 'g' }
  ].forEach(function(x) {
    var div = document.createElement('div');
    div.className = 'summary-item';
    var v = document.createElement('div');
    v.className = 's-val' + (x.cls ? ' ' + x.cls : '');
    v.textContent = x.v;
    var k = document.createElement('div');
    k.className = 's-label';
    k.textContent = x.label;
    div.appendChild(v);
    div.appendChild(k);
    bar.appendChild(div);
  });

  var keys = Object.keys(names);
  var structs = [
    { ok: keys.some(function(n) { return categoryOf(n) === '谷物'; }), text: '主食' },
    { ok: keys.some(function(n) { return isIronRich(n); }), text: '富铁' },
    { ok: keys.some(function(n) { return categoryOf(n) === '蔬菜'; }), text: '蔬菜' },
    { ok: keys.some(function(n) { return categoryOf(n) === '水果'; }), text: '水果' }
  ];
  var struct = document.getElementById('dayStruct');
  while (struct.firstChild) struct.removeChild(struct.firstChild);
  structs.forEach(function(s) {
    var span = document.createElement('span');
    span.className = 'st ' + (s.ok ? 'ok' : 'miss');
    span.textContent = (s.ok ? '✅ ' : '⬜ ') + s.text;
    struct.appendChild(span);
  });
  if (arr.length > 0) {
    var missing = structs.filter(function(s) { return !s.ok; }).map(function(s) { return s.text; });
    if (missing.length > 0) {
      var tip = document.createElement('span');
      tip.className = 'st';
      tip.textContent = '建议补充：' + missing.join(' / ');
      struct.appendChild(tip);
    }
  }
}

/* ==================== 渲染：待选食材 chips ==================== */
function renderIngChips(containerId, selected, onClick) {
  var box = document.getElementById(containerId);
  while (box.firstChild) box.removeChild(box.firstChild);
  var pool = allIngredientList().filter(function(i) { return i.status === 'accepted' || i.status === 'observing'; });
  pool.sort(function(a, b) {
    if (a.status !== b.status) return a.status === 'observing' ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  });
  if (pool.length === 0) {
    var tip = document.createElement('span');
    tip.style.fontSize = '12px';
    tip.style.color = '#999';
    tip.textContent = '食材库暂无已接受/观察中的食材，可直接在下方输入新食材名';
    box.appendChild(tip);
    return;
  }
  pool.forEach(function(ing) {
    var b = document.createElement('button');
    var on = selected.indexOf(ing.name) >= 0;
    b.className = 'chip sm multi' + (ing.status === 'observing' ? ' observing' : '') + (on ? ' on' : '');
    b.textContent = (ing.status === 'observing' ? '⏳ ' : '') + ing.name;
    b.addEventListener('click', function() { onClick(ing.name); });
    box.appendChild(b);
  });
}

function renderDraftPickers() {
  var mealBox = document.getElementById('mealChips');
  while (mealBox.firstChild) mealBox.removeChild(mealBox.firstChild);
  F_MEALS.forEach(function(m) {
    var b = document.createElement('button');
    b.className = 'chip' + (Food.draftMeal === m ? ' active' : '');
    b.textContent = m;
    b.addEventListener('click', function() { Food.draftMeal = m; renderDraftPickers(); });
    mealBox.appendChild(b);
  });

  var texBox = document.getElementById('textureChips');
  while (texBox.firstChild) texBox.removeChild(texBox.firstChild);
  F_TEXTURES.forEach(function(t) {
    var b = document.createElement('button');
    b.className = 'chip' + (Food.draftTexture === t ? ' active' : '');
    b.textContent = t;
    b.addEventListener('click', function() { Food.draftTexture = t; renderDraftPickers(); });
    texBox.appendChild(b);
  });

  renderIngChips('addIngChips', Food.draftIngredients, function(name) {
    var idx = Food.draftIngredients.indexOf(name);
    if (idx >= 0) Food.draftIngredients.splice(idx, 1); else Food.draftIngredients.push(name);
    renderDraftPickers();
  });
  document.getElementById('addPicked').textContent = Food.draftIngredients.length
    ? ('本次已选：' + Food.draftIngredients.join('、')) : '本次已选：（无）';
}

function addDraftIngredient() {
  var input = document.getElementById('addNewIngInput');
  var name = input.value.trim();
  if (!name) return;
  if (Food.draftIngredients.indexOf(name) < 0) Food.draftIngredients.push(name);
  ensureIngredient(name, { status: 'planned' });
  input.value = '';
  renderDraftPickers();
}

/* ==================== 渲染：食材库 ==================== */
function renderIngredients() {
  var ings = allIngredientList();
  var counts = { accepted: 0, observing: 0, planned: 0, allergic: 0, paused: 0 };
  ings.forEach(function(i) { counts[i.status] = (counts[i.status] || 0) + 1; });

  document.getElementById('ingStats').innerHTML =
    '<span class="stat-item"><b>' + ings.filter(function(i) { return i.firstTryDate; }).length + '</b>已尝试</span>' +
    '<span class="stat-item"><span class="dot" style="background:#70AD47"></span><b>' + counts.accepted + '</b>已接受</span>' +
    '<span class="stat-item"><span class="dot" style="background:#FF9800"></span><b>' + counts.observing + '</b>观察中</span>' +
    '<span class="stat-item"><span class="dot" style="background:#E74C3C"></span><b>' + counts.allergic + '</b>过敏</span>' +
    '<span class="stat-item"><span class="dot" style="background:#5B9BD5"></span><b>' + counts.planned + '</b>计划中</span>' +
    '<span class="stat-item"><span class="dot" style="background:#bbb"></span><b>' + counts.paused + '</b>暂停</span>';

  document.querySelectorAll('#ingFilterChips .chip').forEach(function(c) {
    c.classList.toggle('active', c.getAttribute('data-filter') === Food.ingFilter);
  });

  var list = document.getElementById('ingList');
  while (list.firstChild) list.removeChild(list.firstChild);

  var filtered = ings.filter(function(i) { return Food.ingFilter === 'all' || i.status === Food.ingFilter; });
  if (filtered.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = '<div class="emoji">📭</div><div>没有符合条件的食材，可点上方「➕ 添加食材」或下方「推荐食材库」</div>';
    list.appendChild(empty);
    renderPresetBox();
    return;
  }

  F_CATS.forEach(function(cat) {
    var items = filtered.filter(function(i) { return (i.category || '其他') === cat; });
    if (items.length === 0) return;
    var order = { observing: 0, accepted: 1, planned: 2, paused: 3, allergic: 4 };
    items.sort(function(a, b) {
      var oa = order[a.status] == null ? 9 : order[a.status];
      var ob = order[b.status] == null ? 9 : order[b.status];
      if (oa !== ob) return oa - ob;
      return String(a.name).localeCompare(String(b.name));
    });
    var group = document.createElement('div');
    group.className = 'cat-group';
    var title = document.createElement('div');
    title.className = 'cat-title';
    title.innerHTML = F_CAT_ICON[cat] + ' ' + escapeHtml(cat) + ' <span>' + items.length + ' 种</span>';
    group.appendChild(title);
    items.forEach(function(ing) { group.appendChild(buildIngRow(ing)); });
    list.appendChild(group);
  });

  renderPresetBox();
}

function buildIngRow(ing) {
  var meta = F_STATUS_META[ing.status] || F_STATUS_META.planned;
  var row = document.createElement('div');
  row.className = 'ing-row ' + (F_STATUS_META[ing.status] ? ing.status : 'planned');

  var info = document.createElement('div');
  info.className = 'ing-info';
  var name = document.createElement('div');
  name.className = 'ing-name';
  name.innerHTML = escapeHtml(ing.name) + ' <span class="tag ' + meta.cls + '">' + meta.text + '</span>' +
    (ing.ironRich ? ' <span class="tag t-iron">🩸 富铁</span>' : '') +
    (ing.allergenRisk === 'high' ? ' <span class="tag t-risk">⚠️ 高致敏</span>' :
      (ing.allergenRisk === 'medium' ? ' <span class="tag t-risk">⚠️ 中致敏</span>' : ''));
  info.appendChild(name);
  var sub = document.createElement('div');
  sub.className = 'ing-sub';
  sub.textContent = (ing.firstTryDate ? ('首次添加 ' + ing.firstTryDate) : '尚未添加') + (ing.note ? (' · ' + ing.note) : '');
  info.appendChild(sub);
  row.appendChild(info);

  var right = document.createElement('div');
  right.className = 'ing-right';
  if (ing.status === 'observing' && ing.firstTryDate) {
    var n = observationDayIndex(ing, currentDateBJ());
    if (n > F_OBSERVE_DAYS) n = F_OBSERVE_DAYS;
    var dots = document.createElement('div');
    dots.className = 'prog-dots';
    for (var i = 1; i <= F_OBSERVE_DAYS; i++) {
      var dot = document.createElement('i');
      if (i <= n) dot.className = 'f';
      dots.appendChild(dot);
    }
    right.appendChild(dots);
    var txt = document.createElement('span');
    txt.className = 'prog-text';
    txt.textContent = '第' + n + '/' + F_OBSERVE_DAYS + '天';
    right.appendChild(txt);
  }
  right.appendChild(makeBtn('✎ 状态', 'btn-line', 'open-ing-modal', { name: ing.name }));
  row.appendChild(right);
  return row;
}

function renderPresetBox() {
  var box = document.getElementById('presetBox');
  while (box.firstChild) box.removeChild(box.firstChild);
  F_CATS.forEach(function(cat) {
    var items = F_PRESETS.filter(function(p) { return p[0] === cat; });
    if (items.length === 0) return;
    var g = document.createElement('div');
    g.className = 'preset-group';
    var t = document.createElement('div');
    t.className = 'pg-title';
    t.textContent = F_CAT_ICON[cat] + ' ' + cat;
    g.appendChild(t);
    items.forEach(function(p) {
      var exists = !!Food.ingredients[p[1]];
      var b = document.createElement('button');
      b.className = 'preset-chip' + (exists ? ' added' : '');
      b.textContent = (exists ? '✓ ' : '+ ') + p[1];
      if (exists) b.disabled = true;
      else {
        b.setAttribute('data-action', 'toggle-preset');
        b.setAttribute('data-name', p[1]);
      }
      g.appendChild(b);
    });
    box.appendChild(g);
  });
}

function togglePreset(name) {
  if (Food.ingredients[name]) return;
  ensureIngredient(name, { status: 'planned' });
  renderIngredients();
  showToast('已加入食材库（计划中）：' + name);
}

/* ==================== 渲染：计划 ==================== */
function renderPlanForm() {
  document.querySelectorAll('#planRangeChips .chip').forEach(function(c) {
    c.classList.toggle('active', parseInt(c.getAttribute('data-days'), 10) === Food.planDays);
  });
  var allergic = allIngredientList().filter(function(i) { return i.status === 'allergic'; });
  var tip = document.getElementById('planExcludeTip');
  if (allergic.length) {
    tip.style.display = '';
    tip.innerHTML = '<b>已自动排除：</b>' + allergic.map(function(i) { return escapeHtml(i.name); }).join('、');
  } else {
    tip.style.display = 'none';
  }
}

// 推荐理由标签：按食材与记录实时推导，不落库
function planReasonTags(name, rec) {
  var ing = ingredientByName(name);
  var tags = [];
  if (!ing || !ing.firstTryDate || ing.firstTryDate >= rec.date) tags.push({ cls: 't-new', text: '🆕 新食材' });
  if (isIronRich(name)) tags.push({ cls: 't-iron', text: '🩸 富铁' });
  if (ing && ing.status === 'observing') {
    var n = observationDayIndex(ing, rec.date);
    tags.push({ cls: 't-obs', text: '⏳ 观察第' + Math.max(1, Math.min(n, F_OBSERVE_DAYS)) + '天' });
  }
  var risk = riskOf(name);
  if (risk === 'high') tags.push({ cls: 't-risk', text: '⚠️ 高致敏' });
  if (tags.length === 0) tags.push({ cls: 't-rot', text: '🔁 轮换' });
  return tags;
}

function renderPlan() {
  renderPlanForm();
  var list = document.getElementById('planList');
  while (list.firstChild) list.removeChild(list.firstChild);

  var today = currentDateBJ();
  var dates = Object.keys(Food.records).filter(function(d) {
    return d >= today && (Food.records[d] || []).some(function(r) { return r.status === 'planned'; });
  }).sort();

  if (dates.length === 0) {
    var empty = document.createElement('div');
    empty.className = 'card';
    empty.innerHTML = '<div class="empty-state"><div class="emoji">📅</div><div>还没有计划，点上方「✨ 生成计划」自动安排未来几天的辅食材料</div></div>';
    list.appendChild(empty);
    return;
  }

  dates.forEach(function(d) {
    var recs = (Food.records[d] || []).filter(function(r) { return r.status === 'planned'; })
      .sort(function(a, b) { return String(a.time || '').localeCompare(String(b.time || '')); });
    var card = document.createElement('div');
    card.className = 'plan-day' + (d === today ? ' today' : '');

    var head = document.createElement('div');
    head.className = 'plan-head';
    var dt = document.createElement('div');
    dt.className = 'plan-date';
    dt.innerHTML = (fParse(d).getMonth() + 1) + '月' + fParse(d).getDate() + '日 <small>星期' + fWeekday(d) + (d === today ? ' · 今天' : '') + '</small>';
    head.appendChild(dt);
    var acts = document.createElement('div');
    acts.className = 'plan-acts';
    acts.appendChild(makeBtn('✓ 全部记为已喂', 'btn-amber', 'plan-mark-day', { date: d }));
    head.appendChild(acts);
    card.appendChild(head);

    recs.forEach(function(r) {
      var line = document.createElement('div');
      line.className = 'meal-line';
      var time = document.createElement('div');
      time.className = 'meal-time';
      time.textContent = (r.time || '') + (r.mealType ? (' ' + r.mealType) : '');
      line.appendChild(time);

      var body = document.createElement('div');
      body.className = 'meal-body';
      (r.ingredients || []).forEach(function(n) {
        var rowEl = document.createElement('div');
        rowEl.className = 'meal-line-title';
        rowEl.innerHTML = escapeHtml(n) + ' ' + planReasonTags(n, r).map(function(t) {
          return '<span class="tag ' + t.cls + '">' + t.text + '</span>';
        }).join(' ');
        body.appendChild(rowEl);
      });
      line.appendChild(body);

      var mActs = document.createElement('div');
      mActs.className = 'meal-acts';
      mActs.appendChild(makeBtn('✓ 已喂', 'btn-line', 'plan-mark-one', { id: r.id }));
      mActs.appendChild(makeBtn('✏️', 'btn-line', 'edit-record', { id: r.id }));
      line.appendChild(mActs);

      card.appendChild(line);
    });

    list.appendChild(card);
  });
}

/* ==================== 渲染：统计 ==================== */
function renderStats() {
  var st = computeStats();
  var rg = st.range;
  var days = rg.days || 1;
  document.getElementById('statSpan').textContent = rg.invalid ? '日期范围有误' : ('共 ' + rg.days + ' 天');

  var ironRate = st.dates.length ? Math.round(st.ctx.iron / days * 100) : 0;
  document.getElementById('kpiGrid').innerHTML = [
    { v: st.triedAll.length, u: ' 种', k: '已尝试食材', d: '食材库累计', c: 'g' },
    { v: st.newInRange.length, u: ' 种', k: '本区间新增', d: st.newInRange.length ? st.newInRange.map(function(i) { return i.name; }).join(' · ') : '无新增', c: '' },
    { v: st.avgDiv, u: ' 种/天', k: '日均多样性', d: st.dates.length + ' 天有记录', c: 'b' },
    { v: st.streak, u: ' 天', k: '连续记录', d: '截至 ' + rg.to.slice(5), c: 'p' },
    { v: ironRate + '%', u: '', k: '富铁达标率', d: st.ctx.iron + ' / ' + days + ' 天', c: (st.dates.length && ironRate < 70) ? 'r' : 'g' },
    { v: st.allergic.length, u: ' 种', k: '过敏食材', d: st.allergic.length ? st.allergic.map(function(i) { return i.name; }).join(' · ') : '无', c: 'r' }
  ].map(function(x) {
    return '<div class="kpi ' + x.c + '">' +
      '<div class="kv">' + x.v + '<small>' + x.u + '</small></div>' +
      '<div class="kk">' + x.k + '</div>' +
      '<div class="kd' + (x.c === 'r' ? ' down' : (x.c === '' ? ' gray' : '')) + '">' + escapeHtml(String(x.d)) + '</div>' +
      '</div>';
  }).join('');

  renderBarRows('coverBars', Object.keys(F_CAT_TARGET).map(function(c) {
    var got = st.ingsAll.filter(function(i) { return i.category === c && i.status === 'accepted'; }).length;
    var target = F_CAT_TARGET[c];
    return { label: F_CAT_ICON[c] + ' ' + c, val: got, total: target, cls: got >= target ? 'g' : (got === 0 ? 'r' : '') };
  }));

  var chartDates = st.dates.slice(-30);
  document.getElementById('divChartHint').textContent = rg.invalid ? '' :
    (rg.days > 30 ? ('区间 ' + rg.days + ' 天 · 仅展示最近 30 天') : ('区间 ' + rg.days + ' 天'));
  var ch = document.getElementById('divChart');
  var cx = document.getElementById('divChartX');
  while (ch.firstChild) ch.removeChild(ch.firstChild);
  while (cx.firstChild) cx.removeChild(cx.firstChild);
  if (chartDates.length === 0) {
    var none = document.createElement('div');
    none.style.cssText = 'width:100%;text-align:center;color:#bbb;font-size:12px;align-self:center';
    none.textContent = '该区间暂无记录';
    ch.appendChild(none);
  } else {
    var maxV = Math.max.apply(null, chartDates.map(function(d) { return st.diversity[d] || 0; }).concat([1]));
    chartDates.forEach(function(d, i) {
      var col = document.createElement('div');
      col.className = 'col';
      var bar = document.createElement('i');
      var dayRecs = st.byDate[d] || [];
      if (dayRecs.some(function(r) { return r.isNew; })) bar.className = 'hi';
      bar.style.height = Math.max(6, Math.round((st.diversity[d] || 0) / maxV * 100)) + '%';
      bar.title = d + ' · ' + (st.diversity[d] || 0) + ' 种食材';
      col.appendChild(bar);
      ch.appendChild(col);
      var lb = document.createElement('span');
      lb.textContent = (i === 0 || i === chartDates.length - 1 || (i + 1) % 5 === 0) ? d.slice(5) : '';
      cx.appendChild(lb);
    });
  }

  renderBarRows('topBars', st.top.map(function(t) {
    return { label: t.name, val: t.days, total: st.top[0].days || 1, cls: '', unit: ' 天' };
  }));

  document.getElementById('structHint').textContent = '共 ' + (rg.invalid ? 0 : rg.days) + ' 天';
  renderBarRows('structBars', [
    { label: '🍚 主食', val: st.ctx.grain, total: days, cls: '' },
    { label: '🩸 富铁', val: st.ctx.iron, total: days, cls: 'g' },
    { label: '🥬 蔬菜', val: st.ctx.veg, total: days, cls: 'g' },
    { label: '🍎 水果', val: st.ctx.fruit, total: days, cls: st.ctx.fruit < days * 0.5 ? 'r' : '' }
  ]);

  var tl = document.getElementById('timeline');
  document.getElementById('timelineHint').textContent = st.recentNew.length > 1
    ? ('最近 ' + st.recentNew.length + ' 种 · 平均间隔 ' + st.avgGap + ' 天') : '';
  while (tl.firstChild) tl.removeChild(tl.firstChild);
  if (st.recentNew.length === 0) {
    tl.innerHTML = '<div class="empty-state" style="padding:16px 0">暂无新食材记录</div>';
  } else {
    st.recentNew.forEach(function(ing, i) {
      var meta = F_STATUS_META[ing.status] || F_STATUS_META.planned;
      var item = document.createElement('div');
      item.className = 'tl-item';
      item.innerHTML = '<div class="tl-date">' + escapeHtml(String(ing.firstTryDate || '').slice(5)) + '</div>' +
        '<div><span class="tl-name">' + escapeHtml(ing.name) + '</span>' +
        ' <span class="tag ' + meta.cls + '">' + meta.text + '</span>' +
        '<span class="tl-state">' + F_CAT_ICON[ing.category || '其他'] + ' ' + escapeHtml(ing.category || '其他') + '</span></div>' +
        '<div class="tl-gap">' + escapeHtml(st.gaps[i] || '') + '</div>';
      tl.appendChild(item);
    });
  }

  renderHeatmap(st);

  var alHtml = '';
  var rejected = {};
  st.refuseRecs.forEach(function(r) {
    (r.ingredients || []).forEach(function(n) { rejected[n] = (rejected[n] || 0) + 1; });
  });
  st.allergyRecs.forEach(function(r) {
    alHtml += '<span class="al">🚫 ' + escapeHtml((r.ingredients || []).join('、')) + ' · ' + escapeHtml(r.reaction) + '（' + escapeHtml(String(r.date).slice(5)) + '）</span>';
  });
  if (st.refuseRecs.length) {
    var rejText = Object.keys(rejected).map(function(n) { return n + ' ×' + rejected[n]; }).join(' / ');
    alHtml += '<span class="al warn">⚠️ 拒食 ' + st.refuseRecs.length + ' 次（' + escapeHtml(rejText) + '）</span>';
  }
  if (!alHtml) alHtml = '<span class="al ok">✅ 该区间无过敏 / 拒食记录</span>';
  document.getElementById('reactionList').innerHTML = alHtml;

  document.getElementById('insight').innerHTML = buildInsights(st).map(function(t, i) {
    return (i + 1) + '. ' + t;
  }).join('<br>');
}

// 记录坚持度：8 周 × 7 天日历式热力图（行 = 周，列 = 周一~周日，锚定今天）
function renderHeatmap(st) {
  var heat = document.getElementById('heat');
  while (heat.firstChild) heat.removeChild(heat.firstChild);
  var weeks = 8;
  var today = currentDateBJ();
  var dow = fParse(today).getDay();                 // 0 = 周日
  var mondayOffset = (dow === 0 ? 6 : dow - 1);     // 距本周一的偏移
  var lastMonday = fAddDays(today, -mondayOffset);
  var firstMonday = fAddDays(lastMonday, -(weeks - 1) * 7);
  var wd = ['一', '二', '三', '四', '五', '六', '日'];

  function cell(cls, text, title) {
    var d = document.createElement('div');
    d.className = cls;
    if (text) d.textContent = text;
    if (title) d.title = title;
    return d;
  }

  heat.appendChild(cell('hd', ''));
  wd.forEach(function(w) { heat.appendChild(cell('hd', w)); });

  var recorded = 0;
  for (var w = 0; w < weeks; w++) {
    var monday = fAddDays(firstMonday, w * 7);
    heat.appendChild(cell('wk', monday.slice(5).replace('-', '/')));
    for (var i = 0; i < 7; i++) {
      var d = fAddDays(monday, i);
      if (d > today) { heat.appendChild(cell('cl future', '', '未到日期')); continue; }
      var cnt = (Food.records[d] || []).filter(function(r) { return r.status === 'done'; }).length;
      if (cnt > 0) recorded++;
      var lv = Math.min(cnt, 4);
      heat.appendChild(cell('cl' + (lv > 0 ? ' l' + lv : ''), '', d + ' · 记录 ' + cnt + ' 次'));
    }
  }
  var streak = (st && typeof st.streak === 'number') ? st.streak : computeStats().streak;
  document.getElementById('heatSummary').textContent = '近 8 周记录 ' + recorded + ' / ' + (weeks * 7) + ' 天 · 当前连续 ' + streak + ' 天';
  document.getElementById('heatLegend').innerHTML =
    '<span>少</span><i class="cl"></i><i class="cl l1"></i><i class="cl l2"></i><i class="cl l3"></i><i class="cl l4"></i><span>多</span>' +
    '<span style="margin-left:10px">颜色越深 = 当天辅食记录次数越多（虚框 = 未到日期）</span>';
}

/* ==================== 渲染总入口 ==================== */
function renderAll() {
  refreshObservation();
  if (Food.tab === 'daily') { renderDay(); renderDraftPickers(); }
  else if (Food.tab === 'lib') renderIngredients();
  else if (Food.tab === 'plan') renderPlan();
  else renderStats();
}

function switchTab(name) {
  Food.tab = name;
  document.querySelectorAll('.tab-bar button').forEach(function(b) {
    b.classList.toggle('active', b.getAttribute('data-tab') === name);
  });
  ['daily', 'lib', 'plan', 'stats'].forEach(function(k) {
    document.getElementById('page-' + k).style.display = (k === name) ? '' : 'none';
  });
  renderAll();
}

function setDate(dateStr, silent) {
  Food.currentDate = dateStr;
  renderDay();
  if (App.currentUser && !silent) {
    loadDayFromCloud(dateStr).then(function() { renderDay(); }).catch(function(e) { Logger.warn('加载当天辅食数据失败', e); });
  }
}

function refreshDay() {
  var btn = document.getElementById('refreshBtn');
  btn.textContent = '⏳';
  function done(msg) {
    btn.textContent = '🔄';
    renderAll();
    if (msg) showToast(msg);
  }
  if (!App.currentUser) { setTimeout(function() { done('未登录，显示本机数据'); }, 300); return; }
  loadDayFromCloud(Food.currentDate, true)
    .then(function() { return loadIngredientsFromCloud(); })
    .then(function() { done('已刷新当天数据'); })
    .catch(function(e) { Logger.warn('刷新当天辅食数据失败', e); done('刷新失败，请检查网络'); });
}

/* ==================== 弹窗：记录 ==================== */
function openFoodModal(id) {
  var rec = findRecordById(id);
  if (!rec) return;
  Food.editingRecordId = String(rec.id);
  Food.fmIngredients = (rec.ingredients || []).slice();
  document.getElementById('foodModalTitle').textContent = '编辑辅食记录';
  document.getElementById('fmMeal').value = rec.mealType || '上午';
  document.getElementById('fmTime').value = rec.time || '';
  document.getElementById('fmAmount').value = rec.amount || '';
  document.getElementById('fmTexture').value = rec.texture || '';
  document.getElementById('fmStatus').value = rec.status || 'done';
  document.getElementById('fmReaction').value = rec.reaction || '';
  document.getElementById('fmNote').value = rec.note || '';
  document.getElementById('fmIsNew').checked = !!rec.isNew;
  renderFmIngChips();
  document.getElementById('foodModal').classList.add('show');
}

function closeFoodModal() {
  document.getElementById('foodModal').classList.remove('show');
  Food.editingRecordId = null;
  Food.fmIngredients = [];
}

function renderFmIngChips() {
  renderIngChips('fmIngChips', Food.fmIngredients, function(name) {
    var idx = Food.fmIngredients.indexOf(name);
    if (idx >= 0) Food.fmIngredients.splice(idx, 1); else Food.fmIngredients.push(name);
    renderFmIngChips();
  });
}

function fmAddIng() {
  var input = document.getElementById('fmNewIng');
  var name = input.value.trim();
  if (!name) return;
  if (Food.fmIngredients.indexOf(name) < 0) Food.fmIngredients.push(name);
  ensureIngredient(name, { status: 'planned' });
  input.value = '';
  renderFmIngChips();
}

function saveFoodModal() {
  var rec = findRecordById(Food.editingRecordId);
  if (!rec) { closeFoodModal(); return; }
  if (Food.fmIngredients.length === 0) { showToast('请至少选择 1 种食材'); return; }
  var wasPlanned = rec.status === 'planned';
  updateRecord(rec, {
    mealType: document.getElementById('fmMeal').value,
    time: document.getElementById('fmTime').value,
    ingredients: Food.fmIngredients.slice(),
    amount: document.getElementById('fmAmount').value.trim(),
    texture: document.getElementById('fmTexture').value,
    status: document.getElementById('fmStatus').value,
    reaction: document.getElementById('fmReaction').value,
    note: document.getElementById('fmNote').value.trim(),
    isNew: document.getElementById('fmIsNew').checked
  });
  if (wasPlanned && rec.status === 'done') { refreshObservation(); renderAll(); }
  closeFoodModal();
  showToast('已保存');
}

function deleteFromFoodModal() {
  var id = Food.editingRecordId;
  closeFoodModal();
  if (id) deleteRecord(id);
}

/* ==================== 弹窗：食材 ==================== */
function openIngModal(name) {
  Food.editingIngName = name || null;
  var ing = name ? Food.ingredients[name] : null;
  document.getElementById('ingModalTitle').textContent = ing ? '编辑食材' : '添加食材';
  document.getElementById('imName').value = ing ? ing.name : '';
  document.getElementById('imName').disabled = !!ing;
  document.getElementById('imCategory').value = ing ? (ing.category || '其他') : '其他';
  document.getElementById('imFirstTry').value = ing ? (ing.firstTryDate || '') : '';
  document.getElementById('imStatus').value = ing ? (ing.status || 'planned') : 'planned';
  document.getElementById('imRisk').value = ing ? (ing.allergenRisk || 'low') : 'low';
  document.getElementById('imNote').value = ing ? (ing.note || '') : '';
  document.getElementById('imIron').checked = ing ? !!ing.ironRich : false;
  document.getElementById('imDeleteBtn').style.display = ing ? '' : 'none';
  document.getElementById('ingModal').classList.add('show');
}

function closeIngModal() {
  document.getElementById('ingModal').classList.remove('show');
  Food.editingIngName = null;
}

function saveIngModal() {
  var nameInput = document.getElementById('imName');
  var name = String(Food.editingIngName || nameInput.value || '').trim();
  if (!name) { showToast('请填写食材名称'); return; }
  var isNew = !Food.ingredients[name];
  var ing = Food.ingredients[name] || ensureIngredient(name, { status: 'planned' });
  if (!ing) return;
  ing.name = name;
  ing.category = document.getElementById('imCategory').value;
  ing.firstTryDate = document.getElementById('imFirstTry').value || '';
  ing.status = document.getElementById('imStatus').value;
  ing.allergenRisk = document.getElementById('imRisk').value;
  ing.note = document.getElementById('imNote').value.trim();
  ing.ironRich = document.getElementById('imIron').checked;
  ing.updatedAt = toBJISOString();
  Food.ingredients[name] = ing;
  saveFoodData();
  syncIngredientToCloud(ing);
  closeIngModal();
  renderAll();
  showToast(isNew ? ('已添加食材：' + name) : '已保存');
}

function deleteFromIngModal() {
  var name = Food.editingIngName;
  if (!name) { closeIngModal(); return; }
  if (!confirm('删除食材「' + name + '」？已有记录中的同名食材不受影响。')) return;
  var ing = Food.ingredients[name];
  if (ing && App.currentUser) deleteIngredientFromCloud(ing.id);
  delete Food.ingredients[name];
  saveFoodData();
  closeIngModal();
  renderAll();
  showToast('已删除食材');
}

/* ==================== 导入导出 ==================== */
function exportJSON() {
  var payload = {
    type: 'baby_food_data',
    version: 1,
    exportedAt: new Date().toISOString(),
    records: Food.records,
    ingredients: Food.ingredients
  };
  var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = '辅食记录_' + currentDateBJ() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
}

function importJSON(file) {
  var reader = new FileReader();
  reader.onload = function(e) {
    try {
      var data = JSON.parse(e.target.result);
      if (!data || typeof data !== 'object') throw new Error('格式不正确');
      var recs = data.records || {};
      var ings = data.ingredients || {};
      var recCount = 0, ingCount = 0;
      Object.keys(ings).forEach(function(k) {
        if (!Food.ingredients[k]) { Food.ingredients[k] = ings[k]; ingCount++; }
      });
      Object.keys(recs).forEach(function(d) {
        (recs[d] || []).forEach(function(r) {
          if (!findRecordById(r.id)) {
            if (!Food.records[d]) Food.records[d] = [];
            Food.records[d].push(r);
            recCount++;
          }
        });
        sortDayRecords(d);
      });
      saveFoodData();
      renderAll();
      pushLocalToCloud();
      showToast('导入完成：' + recCount + ' 条记录 / ' + ingCount + ' 种食材');
    } catch (err) {
      Logger.warn('辅食数据导入失败', err);
      showToast('导入失败：文件格式不正确');
    }
  };
  reader.readAsText(file);
}

/* ==================== 事件绑定 ==================== */
var _foodActionMap = {
  'login': function() { showLogin(); },
  'logout': function() { logout(); },
  'tab': function(el) { switchTab(el.getAttribute('data-tab')); },
  'prev-date': function() { setDate(fAddDays(Food.currentDate || currentDateBJ(), -1)); },
  'next-date': function() { setDate(fAddDays(Food.currentDate || currentDateBJ(), 1)); },
  'refresh-day': function() { refreshDay(); },
  'add-draft-ing': function() { addDraftIngredient(); },
  'add-record': function() { addRecordFromForm(); },
  'edit-record': function(el) { openFoodModal(el.getAttribute('data-id')); },
  'delete-record': function(el) { deleteRecord(el.getAttribute('data-id')); },
  'mark-done': function(el) { markRecordDone(el.getAttribute('data-id')); },
  'food-modal-cancel': function() { closeFoodModal(); },
  'food-modal-save': function() { saveFoodModal(); },
  'food-modal-delete': function() { deleteFromFoodModal(); },
  'fm-add-ing': function() { fmAddIng(); },
  'filter-ing': function(el) { Food.ingFilter = el.getAttribute('data-filter'); renderIngredients(); },
  'open-ing-modal': function(el) { openIngModal(el.getAttribute('data-name') || null); },
  'ing-modal-cancel': function() { closeIngModal(); },
  'ing-modal-save': function() { saveIngModal(); },
  'ing-modal-delete': function() { deleteFromIngModal(); },
  'toggle-preset': function(el) { togglePreset(el.getAttribute('data-name')); },
  'plan-range': function(el) { Food.planDays = parseInt(el.getAttribute('data-days'), 10) || 7; renderPlanForm(); },
  'gen-plan': function() { generatePlanFromUI(); },
  'plan-mark-one': function(el) { markRecordDone(el.getAttribute('data-id')); },
  'plan-mark-day': function(el) { markDayDone(el.getAttribute('data-date')); },
  'stat-range': function(el) { applyStatRange(parseInt(el.getAttribute('data-days'), 10)); },
  'export-json': function() { exportJSON(); },
  'import-json': function() { document.getElementById('importFile').click(); },
  'clear-day': function() { clearDay(); }
};

function _foodHandleClick(e) {
  var target = e.target;
  while (target && target !== document) {
    var action = target.getAttribute && target.getAttribute('data-action');
    if (action) {
      var fn = _foodActionMap[action];
      if (fn) { fn(target, e); return; }
    }
    target = target.parentNode;
  }
}

function _bindActions() {
  document.addEventListener('click', _foodHandleClick);

  var datePicker = document.getElementById('datePickerInput');
  if (datePicker) datePicker.addEventListener('change', function(e) { if (e.target.value) setDate(e.target.value); });

  ['statFrom', 'statTo'].forEach(function(id) {
    var el = document.getElementById(id);
    el.addEventListener('change', function() {
      if (!el.value) return;
      if (id === 'statFrom') Food.statFrom = el.value; else Food.statTo = el.value;
      document.querySelectorAll('#statRangeChips .chip').forEach(function(c) { c.classList.remove('active'); });
      renderStats();
      var rg = statRangeInfo();
      showToast('统计已更新 · ' + (rg.invalid ? '日期范围有误' : ('共 ' + rg.days + ' 天')));
    });
  });

  var importFile = document.getElementById('importFile');
  if (importFile) {
    importFile.addEventListener('change', function(e) {
      if (e.target.files && e.target.files[0]) { importJSON(e.target.files[0]); e.target.value = ''; }
    });
  }

  var foodModal = document.getElementById('foodModal');
  if (foodModal) foodModal.addEventListener('click', function(e) { if (e.target === foodModal) closeFoodModal(); });
  var ingModal = document.getElementById('ingModal');
  if (ingModal) ingModal.addEventListener('click', function(e) { if (e.target === ingModal) closeIngModal(); });

  window.addEventListener('beforeunload', function() { flushFoodSave(); });
  window.addEventListener('pagehide', function() { flushFoodSave(); });
}

/* ==================== 登录 / 登出 ==================== */
async function onLoginSuccess(user, session) {
  return standardOnLoginSuccess(user, {
    subscribe: handleFoodRealtimeChanges,
    afterSync: function() {
      return loadAllFromCloud().then(function() {
        pushLocalToCloud();
        refreshObservation();
        renderAll();
      });
    }
  });
}

// Header 三件套（setUserDisplay/clearUserDisplay/updateSyncStatus）统一到公共库 App.UI.bindHeader
App.UI.bindHeader({ displayId: 'monthDisplayText', loginId: 'loginLink', logoutId: 'logoutLink', showOnLogin: ['refreshBtn'] });

// 登出：清空辅食数据并重渲染空视图（localStorage 专属键 baby_food_data 一并清）
window.onLogout = function() {
  if (Food._saveIdleId != null) { clearTimeout(Food._saveIdleId); Food._saveIdleId = null; }
  Food._localDirty = false;
  Food.records = {};
  Food.ingredients = {};
  try { localStorage.removeItem(F_STORAGE_KEY); } catch (e) { /* 忽略 */ }
  renderAll();
};

/* ==================== 初始化 ==================== */
function init() {
  if (Food._initCalled) return;
  Food._initCalled = true;

  registerSW();
  _bindActions();

  var container = document.getElementById('loginModalContainer');
  LoginModalManager.init(container, {
    onSuccess: function(user, session) { onLoginSuccess(user, session); },
    onSkip: function() { skipLogin(); }
  });

  // Realtime 统一走公共库：配置订阅表 + 注册变更回调 + 页面可见时的云端刷新
  setRealtimeConfig({ channelName: 'baby_food_changes', tables: ['baby_food_records', 'baby_food_ingredients'] });
  subscribeRealtime(handleFoodRealtimeChanges);
  App._onStaleRefresh = function() {
    return loadAllFromCloud().then(function() { renderAll(); updateSyncStatus('online'); });
  };
  setupVisibilityListener();

  loadFoodData();
  initStatRange();
  renderDraftPickers();
  setDate(currentDateBJ(), true);
  renderAll();

  loadSupabaseSDK().then(function() {
    initSupabase();
    return restoreSession();
  }).then(function(sessionResult) {
    if (sessionResult && sessionResult.success) {
      setUserDisplay((App.currentUser && App.currentUser.email) || '用户');
      updateSyncStatus('online');
      initRealtimeChannel();
      return loadAllFromCloud().then(function() {
        pushLocalToCloud();
        refreshObservation();
        renderAll();
        updateSyncStatus('online');
      }).catch(function(e) {
        Logger.warn('加载云端辅食数据失败，继续使用本地数据', e);
        renderAll();
      });
    }
    clearUserDisplay();
    updateSyncStatus('offline');
    renderAll();
    if (!sessionStorage.getItem('bt_skip_login')) {
      setTimeout(function() {
        showLogin(sessionResult && sessionResult.reason === 'decrypt_failed' ? '安全升级，请重新登录' : '');
      }, 0);
    }
    return null;
  }).catch(function(e) {
    Logger.warn('SDK 加载或会话恢复失败', e);
    clearUserDisplay();
    updateSyncStatus('offline');
    renderAll();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
