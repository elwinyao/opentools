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
