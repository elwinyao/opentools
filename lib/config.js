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

  // Realtime 连接状态轮询间隔（毫秒）：定时检查 isConnected() 同步 UI 状态
  REALTIME_STATUS_POLL_MS: 30000,                      // 30 秒

  // Token 静默刷新间隔（毫秒）
  TOKEN_REFRESH_INTERVAL_MS: 50 * 60 * 1000,        // 50 分钟（JWT 默认 60 分钟过期，提前 10 分钟刷新）

  // 数据自动刷新间隔（毫秒）：页面切回可见时，距上次刷新超过此间隔则自动拉取云端数据
  DATA_REFRESH_INTERVAL_MS: 30 * 60 * 1000,          // 30 分钟

  // "其他"分类筛选：排除五大预置分类（吃喝/睡眠/玩耍/洗护/学习），覆盖自定义类型
  ZIDINGYI_EXCLUDE: { he: true, shui: true, wan: true, xihu: true, xuexi: true }
};
