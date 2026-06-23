// ==================== Supabase 客户端（基于官方 @supabase/supabase-js SDK） ====================
// CDN: lib/supabase-js.min.js（按需懒加载，不阻塞首屏渲染）
// 依赖：app-namespace.js, supabase-config.js（App.SUPABASE_URL, App.SUPABASE_PUBLISHABLE_KEY）

// ==================== SDK 按需懒加载 ====================
var _sbSdkPromise = null;

function loadSupabaseSDK() {
  if (_sbSdkPromise) return _sbSdkPromise;
  // 如果已经加载过（旧版同步引入的降级路径），直接 resolve
  if (typeof supabase !== 'undefined' && typeof supabase.createClient === 'function') {
    _sbSdkPromise = Promise.resolve();
    return _sbSdkPromise;
  }
  _sbSdkPromise = new Promise(function(resolve, reject) {
    var s = document.createElement('script');
    // 使用 bundle 同步执行时捕获的基础路径（由 app-namespace 设置 App.__libBase）
    s.src = (typeof App !== 'undefined' && App.__libBase ? App.__libBase : 'lib/') + 'supabase-js.min.js';
    s.onload = function() { resolve(); };
    s.onerror = function() { reject(new Error('Supabase SDK 加载失败')); };
    document.head.appendChild(s);
  });
  return _sbSdkPromise;
}

function initSupabase() {
  if (App.sbClient) return true;
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    Logger.error('Supabase SDK 未加载，请确保引入 CDN');
    return false;
  }
  App.sbClient = supabase.createClient(App.SUPABASE_URL, App.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: true, persistSession: true },
    realtime: { params: { eventsPerSecond: 10 } },
    global: {
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }
  });

  // 监听 SDK Auth 状态变化，替代手动 Token 管理（减少 Auth Egress）
  App.sbClient.auth.onAuthStateChange(function(event, session) {
    if (event === 'TOKEN_REFRESHED' && session) {
      App.currentUser.access_token = session.access_token;
      App.currentUser.refresh_token = session.refresh_token;
      App.currentUser.loginAt = Date.now();
      if (typeof saveUserSecure === 'function') saveUserSecure(App.currentUser);
    } else if (event === 'SIGNED_OUT') {
      App.currentUser = null;
      if (typeof clearUserSecure === 'function') clearUserSecure();
      sessionStorage.removeItem('bt_session_verified');
      if (typeof updateSyncStatus === 'function') updateSyncStatus('offline');
      if (typeof clearUserDisplay === 'function') clearUserDisplay();
    }
  });

  // SDK v2 的 realtime 对象提供 isConnected() 查询方法；定期轮询同步连接状态
  if (App.sbClient.realtime && !App._realtimeStatusTimer) {
    App._realtimeStatusTimer = setInterval(function() {
      var connected = false;
      try { connected = App.sbClient.realtime.isConnected(); } catch(e) {}
      var newStatus = connected ? 'connected' : 'disconnected';
      if (App._realtimeStatus !== newStatus) {
        App._realtimeStatus = newStatus;
        if (typeof updateSyncStatus === 'function') updateSyncStatus(App.syncStatus);
      }
      // 兜底：轮询发现断开时主动重建 channel（微信后台挂起后 WebSocket 可能异常）
      if (newStatus === 'disconnected') _autoReconnectRealtime();
    }, App.CONFIG.REALTIME_STATUS_POLL_MS);
  }

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
      App._realtimeStatus = 'connected';
      if (typeof updateSyncStatus === 'function') updateSyncStatus(App.syncStatus);
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      App._realtimeStatus = 'disconnected';
      if (typeof updateSyncStatus === 'function') updateSyncStatus(App.syncStatus);
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
  // _realtimeStatus 由 supabase.realtime.onClose 事件自动更新，无需手动设置
  App._realtimePendingChanges = [];
  if (App._realtimeDebounceTimer) {
    clearTimeout(App._realtimeDebounceTimer);
    App._realtimeDebounceTimer = null;
  }
}

// 自动重连 Realtime：仅在确认断开时主动重建 channel（防抖 + 最大次数限制）
function _autoReconnectRealtime() {
  if (!App.currentUser || !App.sbClient) return;
  if (App._realtimeStatus !== 'disconnected') return;
  if (App._reconnectCooldown && (Date.now() - App._reconnectCooldown) < App.CONFIG.REALTIME_RECONNECT_COOLDOWN_MS) return;
  if (!App._reconnectCount) App._reconnectCount = 0;
  if (App._reconnectCount >= App.CONFIG.REALTIME_MAX_RECONNECT_ATTEMPTS) return;
  App._reconnectCooldown = Date.now();
  App._reconnectCount++;
  initRealtimeChannel();
  // 重连成功后重置计数
  setTimeout(function() { App._reconnectCount = 0; }, App.CONFIG.REALTIME_RECONNECT_COOLDOWN_MS * 2);
}
