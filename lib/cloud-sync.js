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
  var cloudRecords = (result.data || []).map(mapCloudRecord);

  // 修复：await 之后重新读取本地数据，确保拿到最新快照
  // 手机端 PWA 场景下，Service Worker 可能在 await 期间修改了 App.allData
  // 如果用 await 前的快照做合并，会覆盖掉在此期间新增的本地数据
  var localRecords = (App.allData[dateStr] || []).slice();

  // SW 离线回退返回 503 会触发 SDK 抛错 → 走 catch 路径 → 不执行合并
  // 此处无需额外空数组保护

  var cloudIdMap = {};
  cloudRecords.forEach(function(cr) { cloudIdMap[cr.id] = cr; });

  var merged = [];
  localRecords.forEach(function(lr) {
    var cr = cloudIdMap[lr.id];
    if (!cr) {
      // 本地有但云端没有：
      //   - 没有 updatedAt → 本地新增未同步，保留
      //   - 有 updatedAt → 已同步过的记录，云端已删除，丢弃
      if (!lr.updatedAt) {
        merged.push(lr);
      }
      return;
    }
    var cloudTime = cr.updatedAt ? new Date(cr.updatedAt).getTime() : 0;
    var localTime = lr.updatedAt ? new Date(lr.updatedAt).getTime() : 0;
    if (cloudTime > localTime) {
      merged.push(cr);
    } else {
      merged.push(lr);
    }
    delete cloudIdMap[cr.id];
  });

  // 云端有但本地没有的新记录
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
    var pageSize = App.CONFIG.SUPABASE_PAGE_SIZE;
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
      cloudByDate[d].push(mapCloudRecord(row));
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
      // 本地独有的记录（仍留在 localMap 中）：有 updatedAt 的说明云端已删除，丢弃
      // 无 updatedAt 的是本地新增未同步，保留
      var kept = [];
      for (var k = 0; k < App.allData[d].length; k++) {
        var rec = App.allData[d][k];
        var isLocalOnly = localMap[rec.id] !== undefined;
        if (isLocalOnly && rec.updatedAt) {
          // 已同步过的记录但云端不存在 → 云端已删除，丢弃
          continue;
        }
        kept.push(rec);
      }
      App.allData[d] = kept;

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
    var pageSize = App.CONFIG.SUPABASE_PAGE_SIZE;
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
      cloudData[d].push(mapCloudRecord(row));
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
      updated_at: record.updatedAt || toBJISOString()
    };
    var result = await App.sbClient
      .from('baby_records')
      .upsert(row, { onConflict: 'id' });

    if (result.error) throw result.error;
    // 同步成功后补写 updatedAt，标记该记录已同步到云端
    // 合并逻辑依赖此标记区分“本地新增未同步”和“已同步被云端删除”
    record.updatedAt = toBJISOString();
    saveData();
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

// 按需启停同步队列处理器：仅在已登录且队列非空时运行
function startSyncQueueProcessor() {
  if (App._syncQueueTimer) return;
  App._syncQueueTimer = setInterval(function() {
    if (!App.currentUser || getSyncQueue().length === 0) {
      clearInterval(App._syncQueueTimer);
      App._syncQueueTimer = null;
      return;
    }
    processSyncQueue();
  }, App.CONFIG.SYNC_QUEUE_INTERVAL_MS);
  // 立即执行一次
  processSyncQueue();
}
