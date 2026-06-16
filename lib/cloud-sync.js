// ==================== 云端同步模块 ====================
// 依赖：app-namespace.js, supabase-client.js（App.sbClient）
// 外部依赖：updateSyncStatus(), saveData(), getDayData()

// 从云端加载单日数据（智能合并：云端 updatedAt 更新才覆盖本地）
async function loadDayFromCloud(dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  var result = await App.sbClient
    .from('baby_records')
    .select('*')
    .eq('user_id', App.currentUser.id)
    .eq('record_date', dateStr)
    .order('start_time', { ascending: true });

  if (result.error) throw result.error;
  var cloudRecords = (result.data || []).map(function(row) {
    return {
      id: row.id,
      type: row.type,
      start: row.start_time || '',
      end: row.end_time || '',
      detail: row.detail || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  });

  // 智能合并：云端为准，逐条比对 updatedAt
  var localRecords = App.allData[dateStr] || [];
  var cloudIdMap = {};
  cloudRecords.forEach(function(cr) { cloudIdMap[cr.id] = cr; });

  var merged = [];
  localRecords.forEach(function(lr) {
    var cr = cloudIdMap[lr.id];
    if (!cr) return; // 云端已删除，跳过
    var cloudTime = cr.updatedAt ? new Date(cr.updatedAt).getTime() : 0;
    var localTime = lr.updatedAt ? new Date(lr.updatedAt).getTime() : 0;
    if (cloudTime > localTime) {
      merged.push(cr);
    } else {
      merged.push(lr);
    }
    delete cloudIdMap[cr.id];
  });

  Object.keys(cloudIdMap).forEach(function(id) {
    merged.push(cloudIdMap[id]);
  });

  App.allData[dateStr] = merged.sort(function(a, b) {
    return (a.start || '99:99').localeCompare(b.start || '99:99');
  });
  saveData();
}

// 从云端加载当月数据（精确范围：1日 ~ 最后一天）
async function loadMonthFromCloud(year, month) {
  if (!App.sbClient || !App.currentUser) return;
  var m = ('0' + month).slice(-2);
  var firstDay = year + '-' + m + '-01';
  var daysInMonth = new Date(year, month, 0).getDate();
  var lastDay = year + '-' + m + '-' + ('0' + daysInMonth).slice(-2);
  updateSyncStatus('syncing');
  try {
    var allRecords = [];
    var from = 0;
    var pageSize = 1000;
    var hasMore = true;

    while (hasMore) {
      var result = await App.sbClient
        .from('baby_records')
        .select('*')
        .eq('user_id', App.currentUser.id)
        .gte('record_date', firstDay)
        .lte('record_date', lastDay)
        .order('record_date', { ascending: true })
        .order('start_time', { ascending: true })
        .range(from, from + pageSize - 1);

      if (result.error) throw result.error;
      if (result.data && result.data.length > 0) {
        allRecords = allRecords.concat(result.data);
        from += pageSize;
        if (result.data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // 先按日期分组，构建 { dateStr: [record, ...] }
    var cloudByDate = {};
    allRecords.forEach(function(row) {
      var d = row.record_date;
      if (!cloudByDate[d]) cloudByDate[d] = [];
      cloudByDate[d].push({
        id: row.id,
        type: row.type,
        start: row.start_time || '',
        end: row.end_time || '',
        detail: row.detail || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    });

    // 按日期合并：先对本地记录建 Map 索引，O(1) 查找替代 O(n) for 循环
    Object.keys(cloudByDate).forEach(function(d) {
      if (!App.allData[d]) {
        App.allData[d] = cloudByDate[d];
        return;
      }

      // 本地记录 → Map<id, index>
      var localMap = {};
      for (var i = 0; i < App.allData[d].length; i++) {
        localMap[App.allData[d][i].id] = i;
      }

      // 用 Map 做 O(1) 查找合并
      var cloudRecs = cloudByDate[d];
      for (var j = 0; j < cloudRecs.length; j++) {
        var cr = cloudRecs[j];
        var localIdx = localMap[cr.id];
        if (localIdx !== undefined) {
          var localTime = App.allData[d][localIdx].updatedAt ? new Date(App.allData[d][localIdx].updatedAt).getTime() : 0;
          var cloudTime = cr.updatedAt ? new Date(cr.updatedAt).getTime() : 0;
          if (cloudTime > localTime) App.allData[d][localIdx] = cr;
          // 已处理，从 Map 中移除标记
          delete localMap[cr.id];
        } else {
          App.allData[d].push(cr);
        }
      }
      // 注意：本地独有的记录（仍留在 localMap 中）保持不变，无需处理

      // 最终一次性排序，替代之前每次插入都排序
      App.allData[d].sort(function(a, b) {
        return (a.start || '99:99').localeCompare(b.start || '99:99');
      });
    });

    saveData();
    updateSyncStatus('online');
  } catch(e) {
    Logger.warn('按月加载云端数据失败', e);
    updateSyncStatus('offline');
  }
}

// 从云端加载所有数据（分页拉取）
async function loadFromCloud(mode) {
  if (!App.sbClient || !App.currentUser) return;
  mode = mode || 'merge';
  updateSyncStatus('syncing');
  try {
    var allRecords = [];
    var from = 0;
    var pageSize = 1000;
    var hasMore = true;

    while (hasMore) {
      var result = await App.sbClient
        .from('baby_records')
        .select('*')
        .eq('user_id', App.currentUser.id)
        .order('record_date', { ascending: false })
        .range(from, from + pageSize - 1);

      if (result.error) throw result.error;
      if (result.data && result.data.length > 0) {
        allRecords = allRecords.concat(result.data);
        from += pageSize;
        if (result.data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    var cloudData = {};
    allRecords.forEach(function(row) {
      var d = row.record_date;
      if (!cloudData[d]) cloudData[d] = [];
      cloudData[d].push({
        id: row.id,
        type: row.type,
        start: row.start_time || '',
        end: row.end_time || '',
        detail: row.detail || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    });

    Object.keys(cloudData).forEach(function(d) {
      cloudData[d].sort(function(a, b) {
        return (a.start || '99:99').localeCompare(b.start || '99:99');
      });
    });

    if (mode === 'replace') {
      App.allData = cloudData;
    } else {
      var merged = {};
      Object.keys(App.allData).forEach(function(d) { merged[d] = App.allData[d].slice(); });
      Object.keys(cloudData).forEach(function(d) {
        if (!merged[d]) {
          merged[d] = cloudData[d];
        } else {
          var cloudIds = {};
          cloudData[d].forEach(function(r) { cloudIds[r.id] = true; });
          merged[d] = merged[d].filter(function(r) { return !cloudIds[r.id]; });
          merged[d] = merged[d].concat(cloudData[d]);
          merged[d].sort(function(a, b) {
            return (a.start || '99:99').localeCompare(b.start || '99:99');
          });
        }
      });
      App.allData = merged;
    }

    saveData();
    updateSyncStatus('online');
  } catch(e) {
    Logger.warn('全量加载云端数据失败', e);
    updateSyncStatus('offline');
  }
}

// 单条记录同步到云端 (upsert)
async function syncRecordToCloud(record, dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  try {
    var row = {
      id: record.id,
      user_id: App.currentUser.id,
      record_date: dateStr,
      type: record.type,
      start_time: record.start || '',
      end_time: record.end || '',
      detail: record.detail || '',
      updated_at: toBJISOString()
    };
    var result = await App.sbClient
      .from('baby_records')
      .upsert(row, { onConflict: 'id' });

    if (result.error) throw result.error;
  } catch(e) {
    Logger.warn('单条同步到云端失败，加入重试队列', e);
    addToSyncQueue({ action: 'upsert', record: record, date: dateStr });
  }
}

// 从云端删除记录
async function deleteRecordFromCloud(recordId) {
  if (!App.sbClient || !App.currentUser) return;
  try {
    var result = await App.sbClient
      .from('baby_records')
      .delete()
      .eq('id', recordId)
      .eq('user_id', App.currentUser.id);

    if (result.error) throw result.error;
  } catch(e) {
    Logger.warn('云端删除记录失败，加入重试队列', e);
    addToSyncQueue({ action: 'delete', id: recordId });
  }
}

// 批量删除某天记录
async function deleteDayFromCloud(dateStr) {
  if (!App.sbClient || !App.currentUser) return;
  try {
    var result = await App.sbClient
      .from('baby_records')
      .delete()
      .eq('record_date', dateStr)
      .eq('user_id', App.currentUser.id);

    if (result.error) throw result.error;
  } catch(e) {
    Logger.warn('批量删除云端记录失败', e);
  }
}

// ==================== 同步重试队列 ====================
function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem(App.SYNC_QUEUE_KEY) || '[]'); } catch(e) { return []; }
}

function addToSyncQueue(item) {
  var queue = getSyncQueue();
  queue.push({ ...item, ts: Date.now() });
  localStorage.setItem(App.SYNC_QUEUE_KEY, JSON.stringify(queue));
}

async function processSyncQueue() {
  if (!App.sbClient || !App.currentUser) return;
  var queue = getSyncQueue();
  if (queue.length === 0) return;
  updateSyncStatus('syncing');
  var remaining = [];
  for (var i = 0; i < queue.length; i++) {
    var item = queue[i];
    try {
      if (item.action === 'upsert') {
        await syncRecordToCloud(item.record, item.date);
      } else if (item.action === 'delete') {
        await deleteRecordFromCloud(item.id);
      }
    } catch(e) {
      remaining.push(item);
    }
  }
  localStorage.setItem(App.SYNC_QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0) {
    updateSyncStatus('online');
  }
}
