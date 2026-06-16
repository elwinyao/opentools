// ==================== Supabase 客户端（基于官方 @supabase/supabase-js SDK） ====================
// CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2
// 依赖：app-namespace.js, supabase-config.js（App.SUPABASE_URL, App.SUPABASE_PUBLISHABLE_KEY）

function initSupabase() {
  if (App.sbClient) return true;
  if (typeof supabase === 'undefined') {
    Logger.error('Supabase SDK 未加载，请确保引入 CDN');
    return false;
  }
  App.sbClient = supabase.createClient(App.SUPABASE_URL, App.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { params: { eventsPerSecond: 10 } },
    global: {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }
  });
  return true;
}

// ==================== Realtime 订阅 ====================

// 初始化 Realtime 订阅
function initRealtimeChannel() {
  if (!App.sbClient || !App.currentUser || !App.currentUser.id) return;
  if (App._realtimeChannel) {
    // 已订阅则先取消
    App.sbClient.removeChannel(App._realtimeChannel);
    App._realtimeChannel = null;
  }

  var channel = App.sbClient.channel('baby_records_changes');
  App._realtimeChannel = channel;

  channel.on('postgres_changes',
    { event: '*', schema: 'public', table: 'baby_records', filter: 'user_id=eq.' + App.currentUser.id },
    function(payload) {
      _handleRealtimePayload(payload);
    }
  );

  channel.subscribe(function(status) {
    if (status === 'SUBSCRIBED') {
      // 订阅成功
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
      // SDK 会自动重连
    }
  });
}

// 处理 Realtime 推送
function _handleRealtimePayload(payload) {
  var changeEvent = {
    eventType: payload.eventType,
    schema: payload.schema,
    table: payload.table,
    commit_timestamp: payload.commit_timestamp || '',
    record: payload.new || payload.old || null,
    old_record: payload.old || null
  };

  if (!changeEvent.record) return;

  // 500ms 去抖合并
  App._realtimePendingChanges.push(changeEvent);
  if (App._realtimeDebounceTimer) clearTimeout(App._realtimeDebounceTimer);
  App._realtimeDebounceTimer = setTimeout(function() {
    var changes = App._realtimePendingChanges.slice();
    App._realtimePendingChanges = [];
    App._realtimeDebounceTimer = null;
    for (var i = 0; i < App._realtimeCallbacks.length; i++) {
      try { App._realtimeCallbacks[i](changes); } catch(e) {}
    }
  }, App.CONFIG.REALTIME_DEBOUNCE_MS);
}

function subscribeRealtime(callback) {
  if (typeof callback !== 'function') return;
  for (var i = 0; i < App._realtimeCallbacks.length; i++) {
    if (App._realtimeCallbacks[i] === callback) return;
  }
  App._realtimeCallbacks.push(callback);
}

function unsubscribeRealtime(callback) {
  App._realtimeCallbacks = App._realtimeCallbacks.filter(function(cb) { return cb !== callback; });
}

function closeRealtimeChannel() {
  if (App._realtimeChannel && App.sbClient) {
    App.sbClient.removeChannel(App._realtimeChannel);
    App._realtimeChannel = null;
  }
  App._realtimePendingChanges = [];
  if (App._realtimeDebounceTimer) {
    clearTimeout(App._realtimeDebounceTimer);
    App._realtimeDebounceTimer = null;
  }
}
