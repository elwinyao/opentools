// ==================== 云端同步模块 ====================
// 依赖：supabase-client.js (supabaseFetch)
// 外部依赖：currentUser, allData, updateSyncStatus(), saveData(), getDayData()
// 外部需定义：SYNC_QUEUE_KEY, STORAGE_KEY

// 从云端加载所有数据（分页拉取，智能合并）
async function loadFromCloud() {
  if (!currentUser) return;
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
        updated_at: new Date().toISOString()
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
          created_at: record.createdAt || new Date().toISOString(),
          updated_at: new Date().toISOString()
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
