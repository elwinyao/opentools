// ==================== 应用配置常量 ====================
// 集中管理所有魔数，替代散落在各文件中的硬编码字面量
// 依赖：app-namespace.js（需在此之前加载）
App.CONFIG = {
  // 登录态过期时间（毫秒）
  LOGIN_EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,       // 7 天

  // Supabase 分页查询每页大小
  SUPABASE_PAGE_SIZE: 1000,

  // 同步队列处理间隔（毫秒）
  SYNC_QUEUE_INTERVAL_MS: 30000,                    // 30 秒

  // 时间轴"现在"线更新间隔（毫秒）
  TIMELINE_UPDATE_INTERVAL_MS: 60000,               // 1 分钟

  // Realtime 变更去抖延迟（毫秒）
  REALTIME_DEBOUNCE_MS: 500,

  // Realtime WebSocket 每秒最大事件数：婴儿作息场景低频，设为 2 降低带宽消耗
  REALTIME_EVENTS_PER_SECOND: 2,

  // Realtime 连接状态轮询间隔（毫秒）：定时检查 isConnected() 同步 UI 状态
  REALTIME_STATUS_POLL_MS: 60000,                      // 60 秒

  // Realtime 自动重连冷却时间（毫秒）：防抖，避免频繁 removeChannel + subscribe
  REALTIME_RECONNECT_COOLDOWN_MS: 15000,               // 15 秒

  // Realtime 自动重连最大尝试次数：超过后停止主动重连，依赖轮询自然恢复
  REALTIME_MAX_RECONNECT_ATTEMPTS: 3,

  // 数据自动刷新间隔（毫秒）：页面切回可见时，距上次刷新超过此间隔则自动拉取云端数据
  DATA_REFRESH_INTERVAL_MS: 30 * 60 * 1000,          // 30 分钟

  // Realtime 页面隐藏延迟关闭（毫秒）：避免快速切换标签页导致反复创建/销毁 Channel
  REALTIME_HIDDEN_CLOSE_DELAY_MS: 30000,             // 30 秒

  // "其他"分类筛选：排除五大预置分类（吃喝/睡眠/玩耍/洗护/学习），覆盖自定义类型
  ZIDINGYI_EXCLUDE: { he: true, shui: true, wan: true, xihu: true, xuexi: true }
};
