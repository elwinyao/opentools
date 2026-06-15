// ==================== Supabase 原生 REST API 客户端 ====================
// 不依赖 CDN SDK，直接用 fetch 调用 Supabase REST API
// 依赖：supabase-config.js（SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY）
//       需在外部声明 currentUser 变量

function initSupabase() {
  return true;
}

// 通用 fetch 封装（REST API / Data API）
function supabaseFetch(path, options) {
  options = options || {};
  var headers = {
    'apikey': SUPABASE_PUBLISHABLE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    'Time-Zone': 'Asia/Shanghai'
  };
  // 如果用户已登录，用用户的 access_token 做鉴权
  if (typeof currentUser !== 'undefined' && currentUser && currentUser.access_token) {
    headers['Authorization'] = 'Bearer ' + currentUser.access_token;
  }
  if (options.headers) {
    Object.keys(options.headers).forEach(function(k) { headers[k] = options.headers[k]; });
  }
  return fetch(SUPABASE_URL + path, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  }).then(function(res) {
    if (!res.ok) {
      return res.json().then(function(err) {
        throw new Error(err.message || err.msg || 'HTTP ' + res.status);
      }).catch(function() {
        throw new Error('HTTP ' + res.status);
      });
    }
    // 204 No Content
    if (res.status === 204) return { data: null, error: null };
    return res.json().then(function(data) {
      return { data: data, error: null };
    });
  }).catch(function(err) {
    return { data: null, error: err };
  });
}

// ==================== Supabase Realtime WebSocket 模块 ====================
// 订阅 baby_records 表的 INSERT / UPDATE / DELETE 事件
// 外部需提供：handleRealtimeChange(payload) 回调函数

var _realtimeWs = null;
var _realtimeCallbacks = [];
var _realtimeReconnectTimer = null;
var _realtimeRetryDelay = 1000;
var _realtimeShouldReconnect = false;
var _realtimeHeartbeatTimer = null;

// 从 SUPABASE_URL 推导 WebSocket URL
// https://xxx.supabase.co → wss://xxx.supabase.co/realtime/v1/websocket
function _realtimeWsUrl() {
  return SUPABASE_URL.replace('https://', 'wss://').replace('http://', 'ws://')
    + '/realtime/v1/websocket?apikey=' + SUPABASE_PUBLISHABLE_KEY
    + '&vsn=1.0.0';
}

// 初始化 Realtime 连接
function initRealtimeChannel() {
  if (!currentUser || !currentUser.id) return;
  if (_realtimeWs && _realtimeWs.readyState === WebSocket.OPEN) return;

  _realtimeShouldReconnect = true;
  _realtimeRetryDelay = 1000;
  _ensureVisibilityHandler();
  _doRealtimeConnect();
}

// 实际建立 WebSocket 连接
function _doRealtimeConnect() {
  if (!_realtimeShouldReconnect) return;
  if (_realtimeWs) {
    try { _realtimeWs.close(); } catch(e) {}
    _realtimeWs = null;
  }

  var wsUrl = _realtimeWsUrl();
  var ws = new WebSocket(wsUrl);
  _realtimeWs = ws;
  var joinPayloadSent = false;

  ws.onopen = function() {
    // 加入 realtime channel，订阅当前用户的 baby_records 变更
    var topic = 'realtime:public:baby_records:user_id=eq.' + currentUser.id;
    var joinMsg = {
      topic: topic,
      event: 'phx_join',
      type: 'phx_join',
      payload: {
        config: {
          broadcast: { self: false },
          postgres_changes: [
            { event: 'INSERT', schema: 'public', table: 'baby_records', filter: 'user_id=eq.' + currentUser.id },
            { event: 'UPDATE', schema: 'public', table: 'baby_records', filter: 'user_id=eq.' + currentUser.id },
            { event: 'DELETE', schema: 'public', table: 'baby_records', filter: 'user_id=eq.' + currentUser.id }
          ]
        }
      },
      ref: '1'
    };
    ws.send(JSON.stringify(joinMsg));
    joinPayloadSent = true;

    // 启动心跳（每 30 秒发送 ping 保持连接）
    _startHeartbeat(ws);
  };

  ws.onmessage = function(event) {
    var msg;
    try { msg = JSON.parse(event.data); } catch(e) { return; }

    // Supabase Realtime 的 phx_reply 确认
    if (msg.event === 'phx_reply' && msg.payload && msg.payload.status === 'ok') {
      // 订阅成功，重置重试延迟
      _realtimeRetryDelay = 1000;
      return;
    }

    // Postgres Changes 事件
    if (msg.event === 'postgres_changes' || (msg.payload && msg.payload.data)) {
      var payload = msg.payload || msg;
      // 提取变更数据
      var changeData = payload.data;
      if (!changeData) return;
      var changeType = payload.type || msg.event;
      var changeEvent = {
        eventType: changeType,
        schema: changeData.schema || payload.schema,
        table: changeData.table || payload.table,
        commit_timestamp: payload.commit_timestamp || '',
        record: null,
        old_record: null
      };

      // INSERT / UPDATE: data 在 data.record 或 data 本身
      if (changeType === 'INSERT' && changeData.record) {
        changeEvent.record = changeData.record;
      } else if (changeType === 'UPDATE' && changeData.record) {
        changeEvent.record = changeData.record;
        changeEvent.old_record = changeData.old_record || null;
      } else if (changeType === 'DELETE' && changeData.old_record) {
        changeEvent.record = changeData.old_record;
      } else if (changeData.columns || changeData.record) {
        // 兼容不同的 payload 格式
        changeEvent.record = changeData.record || changeData;
      }

      if (changeEvent.record) {
        _dispatchRealtimeChange(changeEvent);
      }
    }
  };

  ws.onerror = function(e) {
    // WebSocket 错误，将由 onclose 处理重连
  };

  ws.onclose = function(e) {
    _stopHeartbeat();
    _realtimeWs = null;
    if (!_realtimeShouldReconnect) return;
    // 指数退避重连：1s → 2s → 4s → 8s → ... 最大 30s
    _realtimeReconnectTimer = setTimeout(function() {
      _doRealtimeConnect();
      _realtimeRetryDelay = Math.min(_realtimeRetryDelay * 2, 30000);
    }, _realtimeRetryDelay);
  };
}

// 心跳保活
function _startHeartbeat(ws) {
  _stopHeartbeat();
  _realtimeHeartbeatTimer = setInterval(function() {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'hb' }));
    }
  }, 30000);
}

function _stopHeartbeat() {
  if (_realtimeHeartbeatTimer) {
    clearInterval(_realtimeHeartbeatTimer);
    _realtimeHeartbeatTimer = null;
  }
}

// 注册 Realtime 变更回调
function subscribeRealtime(callback) {
  if (typeof callback !== 'function') return;
  // 去重
  for (var i = 0; i < _realtimeCallbacks.length; i++) {
    if (_realtimeCallbacks[i] === callback) return;
  }
  _realtimeCallbacks.push(callback);
}

// 注销 Realtime 变更回调
function unsubscribeRealtime(callback) {
  _realtimeCallbacks = _realtimeCallbacks.filter(function(cb) { return cb !== callback; });
}

// 分发变更事件给所有注册的回调（带去抖合并）
var _realtimePendingChanges = [];
var _realtimeDebounceTimer = null;
function _dispatchRealtimeChange(changeEvent) {
  _realtimePendingChanges.push(changeEvent);
  // 500ms 去抖：合并短时间内的多次变更
  if (_realtimeDebounceTimer) clearTimeout(_realtimeDebounceTimer);
  _realtimeDebounceTimer = setTimeout(function() {
    var changes = _realtimePendingChanges.slice();
    _realtimePendingChanges = [];
    _realtimeDebounceTimer = null;
    for (var i = 0; i < _realtimeCallbacks.length; i++) {
      try { _realtimeCallbacks[i](changes); } catch(e) {}
    }
  }, 500);
}

// 关闭 Realtime 连接
function closeRealtimeChannel() {
  _realtimeShouldReconnect = false;
  _stopHeartbeat();
  if (_realtimeReconnectTimer) {
    clearTimeout(_realtimeReconnectTimer);
    _realtimeReconnectTimer = null;
  }
  if (_realtimeWs) {
    try {
      // 发送 leave 消息优雅退出
      if (_realtimeWs.readyState === WebSocket.OPEN) {
        var topic = 'realtime:public:baby_records:user_id=eq.' + (currentUser ? currentUser.id : '');
        _realtimeWs.send(JSON.stringify({ topic: topic, event: 'phx_leave', type: 'phx_leave', payload: {}, ref: 'leave' }));
      }
      _realtimeWs.close();
    } catch(e) {}
    _realtimeWs = null;
  }
  _realtimePendingChanges = [];
  if (_realtimeDebounceTimer) {
    clearTimeout(_realtimeDebounceTimer);
    _realtimeDebounceTimer = null;
  }
}

// 页面可见性变化时检查 WebSocket 状态
function _onVisibilityChange() {
  if (document.hidden) return;
  if (!_realtimeShouldReconnect) return;
  if (!currentUser || !currentUser.id) return;
  if (!_realtimeWs || _realtimeWs.readyState !== WebSocket.OPEN) {
    _realtimeRetryDelay = 1000;
    _doRealtimeConnect();
  }
}

// 注册 visibilitychange 事件（只注册一次）
var _visibilityHandlerRegistered = false;
function _ensureVisibilityHandler() {
  if (_visibilityHandlerRegistered) return;
  _visibilityHandlerRegistered = true;
  document.addEventListener('visibilitychange', _onVisibilityChange);
}
