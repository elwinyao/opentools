// ==================== 应用命名空间 ====================
// 所有跨文件共享的状态和常量集中在此命名空间下
// 替代分散的全局 var 声明，消除隐式耦合
window.App = {
  // === 配置常量 ===
  STORAGE_KEY: 'baby_tracker_data',
  USER_KEY: 'baby_tracker_user',
  SYNC_QUEUE_KEY: 'baby_tracker_sync_queue',

  // === 认证状态 ===
  /** @type {Object|null} { id, email, access_token, refresh_token, loginAt } */
  currentUser: null,

  // === 业务数据 ===
  /** @type {Object<string, Array>} { '2026-06-16': [{id,type,start,end,detail,...}] } */
  allData: {},

  // === Supabase 客户端（由 supabase-client.js 初始化） ===
  /** @type {Object|null} */
  sbClient: null,

  // === Realtime 内部状态 ===
  _realtimeChannel: null,
  _realtimeCallbacks: [],
  _realtimePendingChanges: [],
  _realtimeDebounceTimer: null,

  // === Token 刷新 ===
  _tokenRefreshTimer: null,
  _tokenRefreshInterval: 25 * 60 * 1000,

  // === 懒加载标记 ===
  _xlsxLoaded: false,
  _xlsxLoading: false,    // 防止重复加载时多次弹出错误提示

  // === 页面级变量（由各页面脚本设置） ===
  // baby-tracker 专属
  TYPES: null,       // 由 baby-tracker.js 设置
  currentDate: null,
  selectedType: null,
  customTypeText: null,
  currentTab: null,
  summaryYear: null,
  summaryMonth: null,
  syncStatus: null,
  activeFilter: null,

  // === 初始化防重 ===
  _initCalled: false
};
