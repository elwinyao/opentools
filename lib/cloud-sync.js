// ==================== 云端同步模块 ====================
// 依赖：supabase-client.js (supabaseFetch)
// 外部依赖：currentUser, allData, updateSyncStatus(), saveData(), getDayData()
// 外部需定义：SYNC_QUEUE_KEY, STORAGE_KEY

// 从云端加载单日数据（智能合并：云端 updatedAt 更新才覆盖本地） 
async function loadDayFromCloud(dateStr) {
  var url = '/rest/v1/baby_records?select=*'
    + '&user_id=eq.' + encodeURIComponent(currentUser.id)
    + '&record_date=eq.' + dateStr
    + '&order=start_time.asc';
  var result = await supabaseFetch(url);
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
  // 1. 云端有、本地没有 → 加入本地
  // 2. 两边都有、云端更新 → 云端覆盖本地
  // 3. 两边都有、本地更新 → 保留本地（本地编辑了但尚未同步到云端）
  // 4. 本地有、云端没有 → 云端已删除，本地同步删除
  var localRecords = allData[dateStr] || [];
  var cloudIdMap = {};
  cloudRecords.forEach(function(cr) { cloudIdMap[cr.id] = cr; });

  var merged = [];
  localRecords.forEach(function(lr) {
    var cr = cloudIdMap[lr.id];
    if (!cr) {
      // 云端没有 → 该记录已在云端被删除，跳过（不保留）
      return;
    }
    // 两边都有：比较 updatedAt
    var cloudTime = cr.updatedAt ? new Date(cr.updatedAt).getTime() : 0;
    var localTime = lr.updatedAt ? new Date(lr.updatedAt).getTime() : 0;
    if (cloudTime > localTime) {
      // 云端版本更新，覆盖本地
      merged.push(cr);
    } else {
      // 保留本地版本
      merged.push(lr);
    }
    delete cloudIdMap[cr.id];
  });

  // 云端有但本地没有的新记录，加入
  Object.keys(cloudIdMap).forEach(function(id) {
    merged.push(cloudIdMap[id]);
  });

  allData[dateStr] = merged.sort(function(a, b) {
    return (a.start || '99:99').localeCompare(b.start || '99:99');
  });
  saveData();
}

// 从云端加载当月数据（模糊匹配 record_date like YYYY-MM-%）
async function loadMonthFromCloud(year, month) {
  if (!currentUser) return;
  var prefix = year + '-' + ('0' + month).slice(-2);
  updateSyncStatus('syncing');
  try {
    var allRecords = [];
    var from = 0;
    var pageSize = 1000;
    var hasMore = true;

    while (hasMore) {
      var url = '/rest/v1/baby_records?select=*'
        + '&user_id=eq.' + encodeURIComponent(currentUser.id)
        + '&record_date=like.' + prefix + '-*'
        + '&order=record_date.asc,start_time.asc'
        + '&limit=' + pageSize
        + '&offset=' + from;
      var result = await supabaseFetch(url);
      if (result.error) throw result.error;
      if (result.data && result.data.length > 0) {
        allRecords = allRecords.concat(result.data);
        from += pageSize;
        if (result.data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // 转为 { date: [records] } 并合并到本地
    allRecords.forEach(function(row) {
      var d = row.record_date;
      var r = {
        id: row.id,
        type: row.type,
        start: row.start_time || '',
        end: row.end_time || '',
        detail: row.detail || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
      if (!allData[d]) allData[d] = [];
      // 查找并替换或追加
      var idx = -1;
      for (var i = 0; i < allData[d].length; i++) {
        if (allData[d][i].id === r.id) { idx = i; break; }
      }
      if (idx >= 0) {
        var localTime = allData[d][idx].updatedAt ? new Date(allData[d][idx].updatedAt).getTime() : 0;
        var cloudTime = r.updatedAt ? new Date(r.updatedAt).getTime() : 0;
        if (cloudTime > localTime) allData[d][idx] = r;
      } else {
        allData[d].push(r);
      }
      // 按 start 排序
      allData[d].sort(function(a, b) {
        return (a.start || '99:99').localeCompare(b.start || '99:99');
      });
    });

    saveData();
    updateSyncStatus('online');
  } catch(e) {
    updateSyncStatus('offline');
  }
}

// 从云端加载所有数据（分页拉取）
// mode: 'replace' 直接用云端数据替换本地（初始化时使用）
//       'merge'   云端覆盖同名id，保留本地独有的记录（默认）
async function loadFromCloud(mode) {
  if (!currentUser) return;
  mode = mode || 'merge';
  updateSyncStatus('syncing');
  try {
    var allRecords = [];
    var from = 0;
    var pageSize = 1000;
    var hasMore = true;

    while (hasMore) {
      var url = '/rest/v1/baby_records?select=*'
        + '&user_id=eq.' + encodeURIComponent(currentUser.id)
        + '&order=record_date.desc'
        + '&limit=' + pageSize
        + '&offset=' + from;
      var result = await supabaseFetch(url);
      if (result.error) throw result.error;
      if (result.data && result.data.length > 0) {
        allRecords = allRecords.concat(result.data);
        from += pageSize;
        if (result.data.length < pageSize) hasMore = false;
      } else {
        hasMore = false;
      }
    }

    // 将云端扁平记录转为 { date: [records] } 结构
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

    // 按日期排序记录
    Object.keys(cloudData).forEach(function(d) {
      cloudData[d].sort(function(a, b) {
        return (a.start || '99:99').localeCompare(b.start || '99:99');
      });
    });

    if (mode === 'replace') {
      // 直接用云端数据替换本地
      allData = cloudData;
    } else {
      // 智能合并：云端数据优先，但保留本地独有的记录
      var merged = {};
      Object.keys(allData).forEach(function(d) { merged[d] = allData[d].slice(); });
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
      allData = merged;
    }

    saveData();
    updateSyncStatus('online');
  } catch(e) {
    updateSyncStatus('offline');
  }
}

// 单条记录同步到云端 (upsert)
async function syncRecordToCloud(record, dateStr) {
  if (!currentUser) return;
  try {
    var result = await supabaseFetch('/rest/v1/baby_records?id=eq.' + record.id, {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: {
        user_id: currentUser.id,
        record_date: dateStr,
        type: record.type,
        start_time: record.start || '',
        end_time: record.end || '',
        detail: record.detail || '',
        updated_at: toBJISOString()
      }
    });
    if (result.error || !result.data || result.data.length === 0) {
      result = await supabaseFetch('/rest/v1/baby_records', {
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: {
          id: record.id,
          user_id: currentUser.id,
          record_date: dateStr,
          type: record.type,
          start_time: record.start || '',
          end_time: record.end || '',
          detail: record.detail || '',
          created_at: record.createdAt || toBJISOString(),
          updated_at: toBJISOString()
        }
      });
      if (result.error) throw result.error;
    }
  } catch(e) {
    addToSyncQueue({ action: 'upsert', record: record, date: dateStr });
  }
}

// 从云端删除记录
async function deleteRecordFromCloud(recordId) {
  if (!currentUser) return;
  try {
    var result = await supabaseFetch('/rest/v1/baby_records?id=eq.' + recordId + '&user_id=eq.' + encodeURIComponent(currentUser.id), {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    });
    if (result.error) throw result.error;
  } catch(e) {
    addToSyncQueue({ action: 'delete', id: recordId });
  }
}

// 批量删除某天记录
async function deleteDayFromCloud(dateStr) {
  if (!currentUser) return;
  try {
    var result = await supabaseFetch('/rest/v1/baby_records?record_date=eq.' + dateStr + '&user_id=eq.' + encodeURIComponent(currentUser.id), {
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' }
    });
    if (result.error) throw result.error;
  } catch(e) {
    // 批量删除失败静默处理
  }
}

// ==================== 同步重试队列 ====================
function getSyncQueue() {
  try { return JSON.parse(localStorage.getItem(SYNC_QUEUE_KEY) || '[]'); } catch(e) { return []; }
}

function addToSyncQueue(item) {
  var queue = getSyncQueue();
  queue.push({ ...item, ts: Date.now() });
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
}

async function processSyncQueue() {
  if (!currentUser) return;
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
  localStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(remaining));
  if (remaining.length === 0) {
    updateSyncStatus('online');
  }
}
