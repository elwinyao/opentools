# 版本记录

## V2.42 (2026-08-15) — 疫苗页移除「恢复内置」按钮，自费标签仅显示在疫苗条目右侧
- `vaccine-tracker.html`：工具栏去掉「↩ 恢复内置」按钮（内置疫苗已不再自动写入，用户自建即可，无需恢复入口）；`vaccine-tracker.js?v=3` → `?v=4` 刷新缓存
- `vaccine-tracker.js`：
  - 分组标题（月龄旁）不再显示「自费」标签，仅保留「已调整」标签；自费标记只在疫苗条目右侧（`.custom-tag`）展示
  - 删除死代码：`BUILTIN_VACCINE_SCHEDULE` 内置疫苗数组、`restoreBuiltinVaccines()` 函数、事件委托中 `restore-builtin` 绑定
- `vaccine-tracker.css`：删除不再使用的 `.btn-restore`（含 hover 与媒体查询引用）、`.group-custom-tag` 样式
- 说明：疫苗条目右侧的「💛 自费」标签保留不动，免费疫苗仍不显示标签
- `sw.js CACHE_NAME` → `baby-tracker-v34`

## V2.41 (2026-08-15) — 疫苗新增可自由选择免费 / 自费
- 背景：此前「添加疫苗」的所有新增项都固定标记为自费（`is_custom: true`），不符合部分新增为免费疫苗的场景
- `vaccine-tracker.html`：
  - 「登记 / 编辑」弹窗（`vaccineModal`）新增「疫苗类型」下拉：💚 免费 / 💛 自费
  - 「添加疫苗」弹窗（`customVaccineModal`）新增同样的「疫苗类型」下拉（默认自费，与旧行为一致）
  - `vaccine-tracker.js?v=2` → `?v=3` 刷新缓存
- `vaccine-tracker.js`：
  - 打开添加弹窗时重置类型为默认自费；编辑弹窗按记录 `is_custom` 回填类型
  - 保存（编辑 / 预设批量添加 / 单个自定义）时按所选类型写入 `is_custom`：自费 → `true`（显示「自费」标签），免费 → `false`（与内置免费疫苗外观一致，不显示标签）
- 兼容性：内置免费疫苗 `is_custom: false` 不受影响；云端同步字段 `is_custom` 已存在，无需改表
- `sw.js CACHE_NAME` → `baby-tracker-v33`

## V2.40 (2026-08-14) — growth 文字颜色与其余页面统一（去绿入蓝灰）
- `growth-tracker.css`：以下文字颜色由成长绿 #2E8B57 改为与 baby/vaccine 一致的色调：
  - `.card-title`（宝宝档案 / 新增记录 / 成长趋势 / 历史记录 四个卡片标题）→ 深蓝 #1A3C6D（与 baby `.add-card h3`、vaccine `.vaccine-group-title` 一致）
  - `.profile-summary-value`（折叠态当前月龄 / 纠正月龄的值）→ 深蓝 #1A3C6D（与 baby `.date-text`、vaccine `.stat-total` 等大数值一致）
  - `.record-item .rec-date .age-badge`（历史记录日期下的月龄小字）→ 灰 #888（与 baby `.record-time`、vaccine `.vaccine-schedule` 等辅助小字一致）
  - `.record-item .rec-values .val .delta.up`（历史记录增长变化值）→ 通用语义绿 #2E7D32（与 vaccine 页“已完成”绿一致，非 growth 主题绿）
- 说明：历史记录主数值 `.val` 原本已是 #333（与 `.vaccine-name` #333 一致），未改；`.trend-block-title` #666、`.age-panel` 渐变背景白字等与其余页面风格一致，未改
- `growth-tracker.html`：`growth-tracker.css?v=8` → `?v=9` 刷新缓存
- `sw.js CACHE_NAME` → `baby-tracker-v32`

## V2.39 (2026-08-14) — growth 顶部色调与其他页面统一
- `growth-tracker.html`：`<div class="header header-green">` → `<div class="header">`（去掉绿色渐变，与其他页面一致使用 common.css 蓝色渐变 #4472C4→#5B9BD5）；`theme-color` #2E8B57 → #4472C4（移动端状态栏色调统一）；`growth-tracker.css?v=7` → `?v=8` 刷新缓存
- `growth-tracker.css`：删除不再引用的 `.header-green` 规则（页内内容区绿色主题变量保留，不影响 header）
- 说明：growth 头部中间的用户邮箱/仅本设备显示（`setUserDisplay`/`clearUserDisplay` → `userDisplayText`）与 baby/vaccine 的 `monthDisplayText` 显示内容完全一致（`👤 邮箱` / `📱 仅本设备`），仅元素 id 命名不同，无需改动
- `sw.js CACHE_NAME` → `baby-tracker-v31`

## V2.38 (2026-08-14) — Realtime 配置去掉隐式缺省，三个页面统一显式声明
- `lib/common-bundle.js`：`initRealtimeChannel()` 移除 `baby_records` 缺省回退——未调用 `setRealtimeConfig` 配置订阅表与 channel 名时直接不建立订阅，杜绝隐式默认；`setRealtimeConfig` 注释同步更新
- `baby-tracker/init.js`：新增 `setRealtimeConfig({ channelName: 'baby_records_changes', tables: ['baby_records'] })` 显式声明订阅，行为不变
- 效果：baby / growth / vaccine 三个页面均由页面自身显式配置 channel 名 + 订阅表，公共库不再有任何硬编码表名，新增页面只需配置一处
- `sw.js CACHE_NAME` → `baby-tracker-v30`

## V2.37 (2026-08-14) — growth / vaccine Realtime 统一走公共库
- `lib/common-bundle.js`：
  - `initRealtimeChannel()` 泛化：支持按 `App._realtimeTables` 订阅多张表、按 `App._realtimeChannelName` 自定义 channel 名（缺省仍为 `baby_records_changes` + `baby_records`，作息页行为不变）
  - 新增 `setRealtimeConfig({channelName, tables})` 供页面一次性配置订阅
  - `_autoReconnectRealtime()` / `setupVisibilityListener()` 取消按函数名分发，统一重建 `App._realtimeChannel`（含 `disconnected` 判断）；`_autoRefreshDataIfStale()` 支持 `App._onStaleRefresh` 自定义刷新函数
  - `logout()` 不再硬编码 `unsubscribeRealtime(handleRealtimeChange)`，改为清空全部回调，三个页面通用
- `growth-tracker.js`：删除 `initGrowthRealtime` / `closeGrowthRealtime`，改为 `setRealtimeConfig`（订阅 `baby_growth_records` + `baby_profile`）+ `subscribeRealtime(handleGrowthRealtimeChanges)`（按 `evt.table` 路由到 records / profile 处理）+ `initRealtimeChannel`；页面内 `visibilitychange` 移除，统一走 `setupVisibilityListener`
- `vaccine-tracker.js`：删除 `initVaccineRealtime` / `closeVaccineRealtime`，同样改为公共库注册模式并新增调用 `setupVisibilityListener`（此前未接入，页面切回时无统一刷新）
- 效果：三个页面 Realtime 订阅、重连、可见性刷新、登出清理全部收敛到 `common-bundle.js` 一处维护
- `sw.js CACHE_NAME` → `baby-tracker-v29`

## V2.36 (2026-08-14) — Realtime 重连优化（growth / vaccine）
- `lib/common-bundle.js`：`_autoReconnectRealtime()` 与 `setupVisibilityListener()` 按页面类型分发重建通道——growth / vaccine 页面不再误建 `baby_records` 通道（此前公共库 60s 轮询兜底重建的是作息页通道，对这两个页面无效且浪费连接），改为各自重建 `App._growthRealtimeChannel` / `App._vaccineRealtimeChannel`
- `growth-tracker.js` / `vaccine-tracker.js`：页面切回可见时，除通道缺失外，`App._realtimeStatus === 'disconnected'` 也触发重建（此前仅靠 SDK 内部重连恢复，微信后台挂起等场景恢复慢）
- 行为不变部分：断线后仍优先由 supabase-js 内置指数退避重连（1s 起步、最长 60s 间隔）自动恢复，本改动为兜底增强
- `sw.js CACHE_NAME` → `baby-tracker-v28`

## V2.35 (2026-08-14) — baby_records 补开 Realtime 发布
- `supabase-setup.sql`：`baby_records` 补上加入 `supabase_realtime` 发布的幂等 DO 块（此前仅设置了 `REPLICA IDENTITY FULL`，前端 `common-bundle.js` 的 `initRealtimeChannel()` 订阅一直存在但收不到事件）
- 提醒：已有数据库需在 SQL Editor 执行新增片段 `ALTER PUBLICATION supabase_realtime ADD TABLE baby_records;`（或下面的幂等 DO 块），作息页多设备实时同步才会真正生效

## V2.34 (2026-08-14) — growth 页开通 Realtime 实时同步
- `growth-tracker.js`：新增 `initGrowthRealtime()`，订阅 `baby_growth_records`（记录）与 `baby_profile`（档案）两张表的 `postgres_changes`（按 `user_id` 过滤），登录成功 / 会话恢复 / 页面切回可见时自动建立，通道丢失自动重连
- `growth-tracker.js`：新增 `handleGrowthRealtimePayload()`（记录按 id 合并、`updatedAt` 大者胜、DELETE 本地移除，300ms 防抖后保存+重渲染）与 `handleGrowthProfilePayload()`（档案按 `updatedAt` 新者胜）
- `growth-tracker.js`：`updateSyncStatus` 升级，Realtime 断开时显示「已同步(WS断开)」（复用 `lib/common.css` 的 `sync-dot.realtime-off`）
- `supabase-setup.sql`：`baby_growth_records` / `baby_profile` 设置 `REPLICA IDENTITY FULL` 并加入 `supabase_realtime` 发布（幂等 DO 块，重复执行不报错）；`baby_vaccines` 同步改为幂等写法
- 提醒：已有数据库需在 SQL Editor 重跑新增的 Realtime 片段（`ALTER TABLE ... REPLICA IDENTITY FULL` + `ALTER PUBLICATION supabase_realtime ADD TABLE ...`）
- `sw.js CACHE_NAME` → `baby-tracker-v27`

## V2.33 (2026-08-14) — vaccine 取消自动写入内置免疫规划疫苗
- `vaccine-tracker.js`：删除 `ensureVaccineInit()` 及 `init()` 中的调用，不再在首次进入（或本地数据为空）时自动把 23 剂国家免疫规划疫苗写入本地存储；新用户进入页面为空列表，可手动添加（含自费疫苗预设模板）或通过菜单「恢复内置疫苗」一键补全
- `vaccine-tracker.js`：`BUILTIN_VACCINE_SCHEDULE` 保留，仅用于 `restoreBuiltinVaccines()`（手动恢复）；删除死代码 `App._vaccineInitialized`
- 已写入的历史数据不受影响，不会被清除
- `sw.js CACHE_NAME` → `baby-tracker-v26`

## V2.32 (2026-08-14) — growth / vaccine 数据加载体验改造（参考 baby-tracker 秒开模式）
- `growth-tracker.js` / `vaccine-tracker.js`：去掉首屏「正在同步云端数据...」加载占位，改为始终先渲染本地数据（秒开），云端数据后台加载、到达后静默更新，避免闪跳
- `growth-tracker.js` / `vaccine-tracker.js`：云端加载失败不再强制降级 offline（原来 online 就保持 online，仅原本 offline 才置 offline），删除 `showLoadingState()`
- `vaccine-tracker.js`：`loadVaccinesFromCloud()` 去除开头/结尾强制 `syncing`→`online` 状态切换，改为成功才置 online
- `vaccine-tracker.js`：页面切回可见的全量刷新增加 30 分钟节流（`App._lastVaccineRefresh` + `DATA_REFRESH_INTERVAL_MS`），避免每次切回都全量拉取
- `sw.js CACHE_NAME` → `baby-tracker-v25`

## V2.31 (2026-08-14) — 子页面新增返回首页入口
- `vaccine-tracker.html` / `growth-tracker.html` / `baby-tracker.html`：header 中新增「🏠 首页」入口（`<a class="logout-link" href="../index.html">`），复用登录按钮样式
- `vaccine-tracker.css` / `growth-tracker.css` / `baby-tracker.html` 内联样式：`.logout-link` 补充 `text-decoration:none;display:inline-block` 适配链接
- `sw.js CACHE_NAME` → `baby-tracker-v24`

## V2.30 (2026-08-14) — 新增疫苗接种页 + 登录样式统一 + 折叠态纠正月龄 + 页面闪跳修复
- **新增疫苗接种页面**（`vaccine-tracker/`）：23 剂国家免疫规划疫苗清单，支持接种状态标记（未种/已种/跳过）、接种日期/批次/医院记录、自定义疫苗添加
  - `supabase-setup.sql`：新增 `baby_vaccines` 表 DDL（含索引、`idx_baby_vaccines_user_key_unique` 唯一约束、RLS 四个策略、`updated_at` 触发器、Realtime 发布）
  - `index.html` / `index.css`：首页新增疫苗接种入口卡片
  - `sw.js`：`STATIC_ASSETS` 补充 vaccine-tracker 三件套
- **growth-tracker 档案折叠态显示纠正月龄**：`#profileSummary` 由单行改为两行，折叠时展示「实际月龄」+「纠正月龄」摘要；未到预产期时显示孕期周数（`dueAgeSummary()`）
  - `growth-tracker.html`、`growth-tracker.css`（v5→7）、`growth-tracker.js`（v10→11）
- **统一登录/同步状态样式**：growth-tracker 的 `.sync-status` 由绝对定位悬浮改为与其他页面一致的流内居中，补齐 `.month-display` / `.logout-link` / `.sync-status` 样式及 iOS `@supports` 回退
  - `growth-tracker.css`（v6→7）
- **修复页面闪跳（vaccine-tracker + growth-tracker）**：有本地会话时先渲染本地数据、云端数据返回后再渲染一次导致内容闪跳
  - 根因：`init()` 同步 `renderAll()` 渲染本地数据，异步 `restoreSession()` 成功后云端数据返回再次渲染
  - 修复：新增 `showLoadingState()` 加载占位（统计栏「共 - 条/剂」+ ⏳「正在同步云端数据...」），有会话时先占位、云端返回后统一渲染；无会话/云端加载失败时兜底渲染本地数据
  - `vaccine-tracker.js`（v2）、`growth-tracker.js`（v11→12）
- **版本号**：`sw.js CACHE_NAME` → `baby-tracker-v23`；`growth-tracker.js?v=12`、`growth-tracker.css?v=7`、`vaccine-tracker.js?v=2`

## V2.29 (2026-08-02) — crypto.randomUUID() 非安全上下文兼容
- **问题**：HTTP 局域网部署（非 HTTPS/localhost）下 `crypto.randomUUID()` 不可用，导致登录时加密存储 access_token 失败，用户无法登录
- **修复**：新增 `_randomUUID()` 兼容函数，优先使用 `crypto.randomUUID()`，不可用时用 `crypto.getRandomValues` 手动拼 UUID v4
- **改动文件**（4 个）：
  - `lib/common-bundle.js`：新增 `_randomUUID()` + 替换 `_getKeyMaterial` 和 `generateId` 中的调用
  - `lib/crypto-utils.js`：新增 `_randomUUID()` + 替换 `_getKeyMaterial` 中的调用
  - `lib/utils.js`：新增 `_randomUUID()` + 替换 `generateId` 中的调用

## V2.28 (2026-07-16) — SW 修复移动网络 null response 白屏
- **`sw.js` 三处 `event.respondWith()` 加兜底 Response**：防止移动网络透明代理使 `fetch()` 返回 null 导致白屏
  - 导航处理器：`caches.match('/')` 后追加 `.then()` 兜底 503
  - 静态资源处理器：`cached || fetchPromise` 后追加 `|| new Response(404)`
  - Supabase API 处理器：`return response` 改为 `return response || new Response(502)`
- 修复场景：中国移动 5G 透明代理/流量优化网关使 SW 内 `fetch()` 异常返回 null

## V2.27 (2026-06-23) — Auth 优化 + Realtime 延迟关闭

**预计减少 50-60% Auth Egress 调用**

- **B1. 移除手动定时刷新** ⭐ 最关键：删除 `scheduleTokenRefresh()` + `silentTokenRefresh()` + `_touchLoginAt()` 三个函数
  - 之前双重刷新：SDK `autoRefreshToken` + 手动 `setInterval` → 每个周期至少 2 次 Auth API 调用（`verifyAccessToken` + `refreshAccessToken`）
  - 现在只依赖 SDK 的 `autoRefreshToken` 机制，Auth 调用减少约 50%
  - 删除 `TOKEN_REFRESH_INTERVAL_MS` 配置项（已无用）
  - 涉及文件：`common-bundle.js`、`utils.js`、`config.js`
  - 移除 `index.js`、`init.js`、`page-bundle.js` 中所有 `scheduleTokenRefresh()` 调用

- **B2. 优化 visibilitychange 刷新策略**：`setupVisibilityListener()` 的 `visible` 分支移除 `silentTokenRefresh()` 调用
  - 切回页面时不再触发 `verifyAccessToken()` + `refreshAccessToken()` 链
  - 只保留数据刷新 `_autoRefreshDataIfStale()` + Realtime 重建 `initRealtimeChannel()`
  - `common-bundle.js` / `utils.js` 同步更新

- **B3. 延长快速路径有效期**：`_tryQuickPath()` 中 `bt_session_verified` TTL 从 5 分钟 → **15 分钟**
  - 与 Token 有效期对齐，减少页面刷新/重载时的 Auth API 调用

- **B4. 简化 init 阶段 Auth 调用**：`index.js` 的 `_backgroundInit()` 移除 `refreshAccessToken()` + `verifyAccessToken()` 验证链
  - `restoreSession()` 已通过 `_restoreFromSDK()` / `_handleSessionOk()` 完成 Token 验证
  - 不再额外发起最多 2 次 Auth API 调用，恢复会话后直接初始化 Realtime

- **B5. 利用 SDK onAuthStateChange 替代手动管理**：在 `initSupabase()` 中注册 `onAuthStateChange` 监听
  - `TOKEN_REFRESHED` 事件：自动更新 `App.currentUser` Token 并持久化存储
  - `SIGNED_OUT` 事件：自动清除登录态
  - SDK 统一管理 Token 生命周期，不再需要手动 `refreshAccessToken()`、`verifyAccessToken()` 等
  - `common-bundle.js` / `supabase-client.js` 同步注册


- **优化重连策略参数**：降低轮询频率、延长冷却时间、限制最大重连次数，避免网络抖动时频繁重建 WebSocket
  - `REALTIME_STATUS_POLL_MS`：30s → 60s（减少 isConnected() 调用频率）
  - `REALTIME_RECONNECT_COOLDOWN_MS`：5s → 15s（增加防抖冷却）
  - 新增 `REALTIME_MAX_RECONNECT_ATTEMPTS: 3`：连续重连 3 次后停止主动重连，依赖轮询自然恢复
  - `_autoReconnectRealtime()`：增加 `_reconnectCount` 计数 + 冷却期后自动重置
  - `common-bundle.js` / `supabase-client.js` 同步更新
- **页面不可见时延迟关闭 Realtime**：用户切到其他 App/标签页时延迟 30 秒再关闭 WebSocket，切回时按需重建
  - `common-bundle.js`：`setupVisibilityListener()` `hidden` 分支改为启动 30 秒定时器，超时后才调用 `closeRealtimeChannel()`
  - `visible` 分支取消定时器，仅当 Channel 不存在时才重建 `initRealtimeChannel()`（避免快速切换反复创建/销毁）
  - `closeRealtimeChannel()` 增加清理延迟定时器，防止悬空定时器
  - 新增配置 `REALTIME_HIDDEN_CLOSE_DELAY_MS: 30000`
  - **效果**：快速切出切回（30 秒内）复用 Channel，零开销；长时间后台正常关闭节省资源

- **index.html 彻底移除 Realtime 逻辑**：入口页只确认登录态，不订阅 Realtime
  - `index.js`：移除 `subscribeRealtime()` + `initRealtimeChannel()` + `handleRealtimeChange()` + `setupVisibilityListener()` 调用
  - 修复 `_tryQuickPath()` 残留引用 `TOKEN_REFRESH_INTERVAL_MS` → `LOGIN_EXPIRY_MS`（`common-bundle.js` / `supabase-auth.js`）





## V2.25 (2026-06-22) — 降低 Realtime Egress 消耗
- **移除 `index.html` 的 Realtime 预连接**：入口页不需要实时数据订阅，移除 `subscribeRealtime()` + `initRealtimeChannel()` 调用，避免闲置页面消耗 WebSocket 流量
  - `index.js`：`onLoginSuccess()` 和 `_backgroundInit()` 中均移除 Realtime 初始化
- **Token 失效时关闭 Realtime channel**：之前 `silentTokenRefresh()` / `refreshTokenAndCloud()` 清除登录态后未关闭 channel，导致已退登用户仍保持 WebSocket 连接消耗 egress
  - `common-bundle.js`：`silentTokenRefresh()` token 失效分支增加 `closeRealtimeChannel()` + 清空 `_realtimeCallbacks`
  - `page-bundle.js`：`refreshTokenAndCloud()` token 失效分支同步增加
  - `index.js`：`_backgroundInit()` token 失效分支同步增加（防御性）
- **减少不必要的 Realtime 自动重连**：`setupVisibilityListener()` 每次页面切回前台都触发 `_autoReconnectRealtime()` 过于激进，改为仅依赖 30s 轮询检测断连后重连
  - `common-bundle.js`：`setupVisibilityListener()` 中移除 `_autoReconnectRealtime()` 调用
  - `utils.js`：同步移除

## V2.24 (2026-06-21) — Realtime WS 断开自动重连
- **新增 `_autoReconnectRealtime()` 函数**：轮询发现 `isConnected()` 返回 `false` 或页面从后台切回前台时，主动调用 `initRealtimeChannel()` 重建 channel
  - `common-bundle.js`：轮询 `setInterval` 回调中、`setupVisibilityListener()` 中均增加重连触发
  - `supabase-client.js`：同步更新轮询回调 + 新增 `_autoReconnectRealtime()` 函数
  - `utils.js`：`setupVisibilityListener()` 中增加 `_autoReconnectRealtime()` 调用（防御性检测函数存在）
- **防抖机制**：`REALTIME_RECONNECT_COOLDOWN_MS`（默认 5000ms）内不重复重建，避免频繁 `removeChannel` + `subscribe`
  - `config.js` / `common-bundle.js`：新增 `REALTIME_RECONNECT_COOLDOWN_MS: 5000` 配置项

## V2.23 (2026-06-20) — 微信打开 index.html 性能优化
- **移除 preconnect/dns-prefetch/preload**：微信 X5 内核对这些标签处理不当，`preconnect` 境外 Supabase 域名会阻塞页面渲染，`preload` 199KB SDK 会抢占带宽
  - `index.html`：移除 `<link rel="preconnect">`、`<link rel="dns-prefetch">`、`<link rel="preload">` 三行
- **首屏不阻塞 SDK 加载**：`index.js` 的 `init()` 不再 `await loadSupabaseSDK()` + `await restoreSession()`，改为先渲染首屏，再通过 `_backgroundInit()` 异步加载
  - 快速路径（sessionStorage 有 token）立即恢复 UI，SDK 后台加载
  - 无快速路径仍先渲染首屏，再后台加载 SDK 做完整会话恢复
- **微信中跳过 Service Worker 注册**：`common-bundle.js` / `utils.js` 的 `registerSW()` 检测 `MicroMessenger` UA，微信不支持 PWA，跳过避免无意义网络请求

## V2.22 (2026-06-20) — 简化 Realtime 重连 + index.html 状态精简
- **移除手动 Realtime 重连逻辑**：Supabase SDK v2 的 `channel.subscribe()` 内置自动重连（Phoenix Channels 协议），不再需要在 visibilitychange 中手动 `closeRealtimeChannel()` + `initRealtimeChannel()`
  - `common-bundle.js`：删除 `_reconnectRealtimeIfNeeded()` 函数，`setupVisibilityListener()` 中不再调用
  - `lib/config.js` / `common-bundle.js`：移除 `REALTIME_RECONNECT_COOLDOWN_MS` 配置项
  - 连接状态同步仍保留：`setInterval` + `isConnected()` 轮询 + `channel.subscribe(cb)` 状态回调双重保障
- **index.html 不展示绿点**：`index.js` 的 `updateSyncStatus()` 中绿点始终隐藏，首页只显示登录后的用户邮箱

## V2.21 (2026-06-20) — Realtime WebSocket 连接状态可视化
- **新增 Realtime 连接状态显示**：用户可在 Header 看到 WebSocket 是否正常连接
  - `app-namespace.js` / `common-bundle.js`：新增 `App._realtimeStatus`（`'connected'` / `'disconnected'`）
  - `supabase-client.js` / `common-bundle.js`：`initSupabase()` 中使用 `setInterval` + `realtime.isConnected()` 轮询 WebSocket 连接状态（3 秒间隔），搭配 `channel.subscribe(cb)` 回调双重保障
  - `channel.subscribe()` 回调恢复更新 `_realtimeStatus`（SUBSCRIBED→connected，ERROR/TIMED_OUT/CLOSED→disconnected）
  - `closeRealtimeChannel()` 不再手动设置 `_realtimeStatus`（由轮询 + subscribe 回调自动更新）
  - `lib/config.js` / `common-bundle.js`：新增 `REALTIME_STATUS_POLL_MS: 3000` 配置项
  - `common.css`：新增 `.sync-dot.realtime-off { background:#FFA500 }`（橙色，表示 WS 断开）
  - 三个页面的 `updateSyncStatus()` 合并显示逻辑：
    - 🟢 绿点 "已同步" = 云端在线 + WS 已连接
    - 🟠 橙点 "已同步(WS断开)" = 云端在线 + WS 断开（能拉取数据但收不到实时推送）
    - 🟡 黄点闪烁 "同步中..." = 正在同步
    - 🔴 红点 "离线/未登录" = 云端离线或未登录
  - `index.html`：首页 Header 新增 `sync-dot` 指示点，登录后可见
- **修复 visibilitychange 多监听器冲突**：common-bundle.js 和子页面（init.js/page-bundle.js）各自注册 visibilitychange 监听器，共享 `App._lastDataRefresh` 时间戳，common-bundle 抢先消费导致子页面的 30min 数据刷新永远被跳过，用户切回后看到旧数据
  - `common-bundle.js`：`_autoRefreshDataIfStale()` 拉取成功后调用 `App._onDataRefreshed()` 回调通知子页面渲染 UI
  - `init.js` / `page-bundle.js`：visibilitychange 中移除 30min 数据刷新和 Realtime 重连逻辑（由 common-bundle 统一处理），初始化时注册 `App._onDataRefreshed = function() { renderRecords(); renderSummary(); }`

## V2.20 (2026-06-20) — 登录过期引导 + 进入子页面自动刷新数据 + 30分钟数据自动刷新 + Realtime 重连
- **修复登录过期后刷新页面不弹登录弹窗**：四个 token 刷新/验证路径均补齐过期引导逻辑
  - `refreshTokenAndCloud()`（page-bundle.js）：对齐 init.js，token 失效后清除登录态 + `showLogin('登录已过期，请重新登录')`
  - `init()` 快速路径（page-bundle.js + index.js + init.js）：`reason === 'quick'` 不再跳过 token 验证和云端数据加载
  - `silentTokenRefresh()`（utils.js + common-bundle.js）：定时器/visibilitychange 触发的静默刷新，失败后同样清除登录态 + 引导登录
  - 原因：原 page-bundle.js 版本 token 失效仅 `updateSyncStatus('offline')`，无弹窗；快速路径跳过验证；静默刷新失败静默返回
- **修复从 index.html 进入 baby-tracker 不自动刷新云端数据**：init.js 快速路径恢复会话后跳过 `refreshTokenAndCloud()`，导致只展示 localStorage 缓存旧数据
  - 修复：快速路径统一走 `refreshTokenAndCloud()`，初始化时自动从云端拉取最新数据
- **修复 sw.js STATIC_ASSETS 缺少 /index.js**：Service Worker 预缓存列表未包含 index.js，离线时入口页面脚本无法加载
- **新增数据过期自动刷新**：已登录用户页面切回可见时，若距上次刷新超过 30 分钟，自动拉取云端数据并渲染
  - 新增配置 `App.CONFIG.DATA_REFRESH_INTERVAL_MS = 30 * 60 * 1000`
  - 新增 `App._lastDataRefresh` 时间戳，每次刷新成功后更新
  - `setupVisibilityListener()`（common-bundle.js）新增 `_autoRefreshDataIfStale()` 静默拉取
  - init.js / page-bundle.js 的 visibilitychange 监听器新增过期检测 + `refreshData()` 拉取并渲染 UI
  - `refreshData()` / `refreshTokenAndCloud()` 成功后均设置 `App._lastDataRefresh`
  - 覆盖场景：页面长时间不活跃（锁屏/切后台）后恢复时数据过期，自动刷新无需手动操作
- **新增 visibilitychange Realtime WebSocket 自动重连**：页面切回可见时，已登录用户主动销毁旧 channel 并重建，确保能收到其他设备的实时推送
  - `common-bundle.js`：新增 `_reconnectRealtimeIfNeeded()` 函数，`setupVisibilityListener()` 中调用
  - `utils.js`：`setupVisibilityListener()` 内联相同重连逻辑（因脚本加载顺序独立实现）
  - `init.js` / `page-bundle.js`：visibilitychange visible 分支末尾加入 `closeRealtimeChannel()` + `initRealtimeChannel()`
  - 覆盖场景：手机锁屏/切后台后 WebSocket 被系统挂起，切回时即时重建连接，无需等待 Supabase SDK 底层自动重连

## V2.19 (2026-06-17) — 云端删除同步修复 + 保存去阻塞 + 刷新防重入
- **修复已删除记录在其他终端/刷新后仍显示**：loadDayFromCloud / loadMonthFromCloud 合并逻辑中，本地有但云端没有的记录不再无条件保留
  - 原因：原逻辑 `if (!cr) merged.push(lr)` 无条件保留本地独有记录，导致云端已删除的记录通过刷新重新出现
  - 修复：区分「本地新增未同步」（无 updatedAt）和「已同步过」（有 updatedAt），前者保留，后者丢弃（说明云端已删除）
  - 涉及：cloud-sync.js 和 common-bundle.js 中的 loadDayFromCloud 和 loadMonthFromCloud
- **修复保存/编辑记录延迟感**：addRecord() / saveEdit() 将 renderRecords() + renderSummary() 移到 syncRecordToCloud() 之前执行
  - 原因：UI 渲染原本在 `await syncRecordToCloud()` 之后，用户需等待云端网络请求完成（几百毫秒到数秒）才能看到记录变化
  - 修复：flushSave() 同步写 localStorage 后立即刷新 UI，云端写入改为异步 fire-and-forget（移除 await）
  - 兜底：syncRecordToCloud 失败时自动 addToSyncQueue，startSyncQueueProcessor 每 30 秒重试队列中的失败项
- delete r._origEnd 标记清理在 renderRecords 之前执行，避免渲染拿到残留标记
- **刷新按钮防快速重复点击**：refreshData() 新增 _refreshInProgress 标记，正在同步中时忽略后续点击，完成或失败后自动重置
- **"其他"筛选改为反选逻辑**：点击"其他"筛选 not in（吃喝/睡眠/玩耍/洗护/学习）的记录，覆盖用户自定义类型

## V2.18 (2026-06-17) — CSP script-src 'unsafe-inline' 移除
- **CSP 安全策略生效**：移除 index.html 和 baby-tracker.html 中 script-src 的 'unsafe-inline'，CSP 开始真正防御 XSS
  - 所有内联 `<script>` 标签已外移为独立 .js 文件（index.html → index.js）
  - 所有 HTML onclick/onchange 已替换为 data-action + _bindActions() 事件委托
  - 所有 innerHTML 动态 HTML 已替换为 createElement + textContent
- 源文件修复（与 page-bundle.js 对齐）：
  - render.js：renderRecords() empty-state、renderTimeline() seg-label → createElement
  - records.js：renderTypeGrid() → createElement + addEventListener
- login-modal.js / common-bundle.js：LoginModalManager.init() innerHTML 模板 → createElement
- baby-tracker.html：移除 `<script>init();</script>` 内联调用，改为 DOMContentLoaded 自动触发
- 新增 index.js：入口页面独立脚本（从 index.html 内联 script 提取）

## V2.17 (2026-06-17)
- 安全加固：消除 page-bundle.js 中三处 innerHTML 使用，统一改为 createElement + textContent
  - renderTimeline()：seg-label 改用 createElement('span') + textContent，防止自定义类型注入
  - renderRecords()：empty-state 改用 createElement，保持代码风格一致
  - renderTypeGrid()：移除 innerHTML + onclick 字符串拼接，改为 createElement + addEventListener，消除 CSP unsafe-inline 依赖
- 消除 baby-tracker.html 中约 20 处 HTML onclick/onchange 内联事件：改为 data-action 属性 + _bindActions() 集中绑定
  - 新增 _bindActions() 函数，在 init() 中统一用 addEventListener 绑定所有按钮事件
  - 涉及：登录/退出、Tab 切换、日期导航、刷新、添加记录、导出/导入、清空当天、月份切换、时间轴筛选等
- page-bundle.js / init.js / baby-tracker.html 同步更新

## V2.16 (2026-06-17)
- 移除登录弹窗双实例：删除 index.html 和 baby-tracker.html 中的 `<login-modal>` 标签，只保留 `<div id="loginModalContainer">`
- 移除 login-modal.js 和 common-bundle.js 中的 Custom Elements 注册代码（`customElements.define('login-modal', ...)`），降级方案无实际使用者
- 简化 showLogin()/hideLogin()：移除 document.querySelector('login-modal') Web Component 兼容路径，统一使用 LoginModalManager
- 修复 beforeunload/pagehide 重复调用 flushSave：新增 flushSaveOnExit() 带 _flushedOnExit 标记防重入
- 清理 page-bundle.js / init.js 中残留的 Web Component 事件监听代码
- login-modal.js / common-bundle.js / supabase-auth.js / index.html / baby-tracker.html / init.js / page-bundle.js 同步更新

## V2.15 (2026-06-17)
- 修复前端 updatedAt 与数据库触发器 now() 时区不一致风险：toBJISOString 改为输出 UTC ISO 字符串 (Date.toISOString())，与 PostgreSQL TIMESTAMPTZ now() 对齐
- 原实现手动拼接北京时间 +08:00，与数据库触发器 now() (UTC) 可能产生时区偏差；改为 UTC 后 new Date().getTime() 时间戳比较完全一致
- nowBJ() / currentDateBJ() 不受影响，仍用于 UI 日期展示（北京时间）
- utils.js / common-bundle.js 同步更新

## V2.14 (2026-06-17)
- 优化 renderMonthlySummary：thead 结构固定不变（16 列标题），只渲染一次，后续翻月仅更新 tbody，减少 DOM 重建开销
- 优化 processSyncQueue 定时器：改为按需启停（startSyncQueueProcessor），仅在已登录且同步队列非空时才运行 setInterval，队列清空或用户未登录时自动停止，避免每 30 秒空转
- addRecord / deleteRecord / saveEdit / clearDay 写入数据后调用 startSyncQueueProcessor，确保有积压时立即启动处理
- monthly.js / cloud-sync.js / common-bundle.js / init.js / page-bundle.js / records.js 同步更新

## V2.13 (2026-06-17)
- 修复手机端刷新数据按钮数据丢失：loadDayFromCloud 合并逻辑在 await 后用 .slice() 重新读取本地数据快照，避免旧快照覆盖新增数据
- 修复本地独有记录被丢弃：合并逻辑中本地有但云端没有的记录保留而非丢弃
- saveData()/flushSave() 移除 requestIdleCallback，改用 setTimeout(0)：手机端 PWA/WebView 中 requestIdleCallback 调度不可靠，可能导致数据迟迟不写入 localStorage
- SW 离线回退改为 503 而非 200 + 空数组：避免 Supabase SDK 收到空数组后 loadDayFromCloud 误合并导致本地数据丢失
- cloud-sync.js / storage.js / common-bundle.js / sw.js 同步更新
- 重构 restoreSession()：6 层 if-else 嵌套改为 switch 状态机 + 独立 handler 函数，消除重复 SDK fallback 逻辑，提高可读性和可维护性
- supabase-auth.js / common-bundle.js 同步重构

## V2.12.3 (2026-06-17)
- 修复 iPhone 编辑保存后页面仍显示"编辑中"状态不更新：saveEdit() 移除 requestAnimationFrame 延迟，云端写入完成后再刷新 UI
- 修复编辑/新增/删除操作后页面数据不更新：addRecord/saveEdit/deleteRecord 改用 flushSave() 立即写 localStorage + await 等待云端写入完成后再渲染
- 修复手机点击刷新按钮显示离线：refreshData() 移除 verifyAccessToken/refreshAccessToken 显式调用，Supabase SDK autoRefreshToken 已自动处理 token 刷新，避免 iPhone 上多次网络往返导致失败
- records.js 源文件同步更新，与 page-bundle.js 合并产物保持一致
- 修复删除记录后其他终端 Realtime 未同步：handleRealtimeChange 中 DELETE 事件单独处理，兼容 Supabase 默认 REPLICA IDENTITY 只返回主键的情况；supabase-setup.sql 新增 REPLICA IDENTITY FULL 设置

## V2.12.2 (2026-06-16)
- 修复 GitHub Pages 子目录部署下资源 404：lib/supabase-js.min.js、sw.js、manifest 图标路径错误
- lib/common-bundle.js 路径解析改为同步捕获 document.currentScript，存入 App.__libBase 统一使用
- 修复 document.currentScript 在异步上下文为 null 导致路径回退失效的问题
- manifest.json 所有路径改为相对路径（./），scope/start_url 改为 ./
- 废弃 apple-mobile-web-app-capable 改为 mobile-web-app-capable
- index.html 和 attendance-tracker.html 添加内联 SVG favicon（🍼 / 📋）
- 性能优化：sessionStorage 引入 bt_session_verified 标记（5 分钟 TTL），跳过冗余 Supabase token 刷新 API 调用
- restoreSession() 快速路径：已验证且未过期时直接恢复 session，无需网络请求
- baby-tracker init() 重构：先渲染 UI 框架，再异步恢复 session（UI 优先渲染）
- logout() 和 skipLogin() 清除 bt_session_verified 标记

## V2.12.1 (2026-06-16)
- SW 缓存策略扩展至 Supabase API：GET 请求 Network First + api-cache 离线回退，断网可看最近数据
- 魔数集中管理：新建 lib/config.js，消除 6 处散落魔数（登录态过期、分页大小、同步间隔等）
- 双页面 registerSW() 去重：统一移入 lib/utils.js，index.html 和 baby-tracker 复用
- baby-tracker 文件拆分：baby-tracker.js → init / records / render / monthly / realtime.js
- 新增 lib/login-modal.js、lib/supabase-js.min.js
- lib/config.js 加载顺序在 app-namespace.js 之后、logger.js 之前

## V2.12 (2026-06-16)
- 新增 Service Worker (sw.js)：Cache First + Network First 混合缓存策略，支持离线访问和推送通知预留
- 新增 Web App Manifest (manifest.json)：支持 PWA 安装，standalone 模式，图标和主题色配置
- 新增应用图标 (icons/icon-192.png, icon-512.png)
- 新增统一日志系统 (lib/logger.js)：fatal / error / warn / info 四级日志
- 新增应用命名空间 (lib/app-namespace.js)：集中管理跨文件共享状态和常量
- 新增 Token 加密存储 (lib/crypto-utils.js)：基于 Web Crypto API AES-GCM 加密 refresh_token
- 新增公共样式库 (lib/common.css)：抽取复用样式
- 新增 .gitignore 配置文件
- 优化 index.html：重构加载流程，集成新工具库
- 优化 Supabase 相关模块 (supabase-auth.js, supabase-client.js, supabase-config.js, cloud-sync.js)
- 优化工具库 (lib/utils.js)：抽取公共方法
- 修复 baby-tracker 子页面资源 503 问题：HTML 引用改为绝对路径 (/lib/*)，消除相对路径歧义
- 修复 SW 缓存旧版 HTML 导致路径错误：缓存版本升级为 baby-tracker-v2
- server.js 新增无后缀 URL 自动 fallback .html（如 /baby-tracker/baby-tracker）
- 删除未使用的 lib/time-picker.css 和 lib/time-picker.js

## V2.11 (2026-06-15)
- 引入 Supabase Realtime WebSocket 实时数据同步
- lib/supabase-client.js 新增 Realtime 模块：WebSocket 连接、phx_join 订阅、心跳保活
- 支持监听 baby_records 表的 INSERT / UPDATE / DELETE 事件
- 变更事件 500ms 去抖合并，智能判断是否需要刷新当前 UI
- 断线自动重连，指数退避（1s → 2s → 4s → ... → 最大 30s）
- 页面 visibilitychange 时自动检查并重连 WebSocket
- baby-tracker 登录后自动订阅 Realtime，登出时优雅关闭
- index.html 登录后预连接 Realtime（为子页面预热）

## V2.10.4 (2026-06-15)
- baby-tracker 未登录时，从 index 跳转、手动刷新、自动刷新均弹出登录弹窗
- 用户点击"仅本设备使用"后不再弹窗（sessionStorage 标记）
- Supabase REST API 请求添加 Time-Zone: Asia/Shanghai 头
- 时间轴"现在"刻度线每分钟自动移动（北京时间）
- 查看非今日日期时，时间轴"现在"线自动隐藏
- 切换到月度汇总时，自动从云端拉取当月数据
- 月度汇总翻页时同样异步拉取云端数据

## V2.10.3 (2026-06-14)
- 删除版本强制刷新逻辑（checkVersion），不再校验版本号
- 新增每间隔 1 小时静默刷新页面机制，支持跳出再进入场景
- scheduleHourlyRefresh 抽取到 lib/utils.js 公共库，index.html 和 baby-tracker 复用

## V2.10.2 (2026-06-14)
- 当日概览"洗护次数"拆分为：拉臭臭次数、换尿布次数、洗澡次数，各独立显示
- 概览网格调整为 3 列布局，适配新增的 9 项指标

## V2.10.1 (2026-06-14)
- 优化版本检测：刷新页面时不检测，仅在用户操作时（切换日期、增删改记录等）触发版本检测和自动刷新

## V2.10 (2026-06-14)
- 修复页面初始化时 loadDayFromCloud 重复调用两次的问题

## V2.9 (2026-06-14)
- 修复 24:00 时间兼容：编辑时展示为 23:59，保存时自动还原（<input type="time"> 不支持 24:00）
- 修复 00:00 结束时间误触发跨天拆分，不再在第二天生成冗余记录
- 云端同步智能合并：以云端为准，逐条比对 updatedAt；本地有云端没有的记录同步删除
- 新建/编辑记录写入 updatedAt 字段，确保合并逻辑有效
- 切换日期时自动清除分类筛选状态，后台静默加载该日期云端数据
- 页面版本检测机制：代码更新时自动提示用户刷新页面

## V2.8 (2026-06-14)
- 标题栏取消粘性定位，上下滑动时不再固定
- 喝奶/喝水/辅食添加及编辑记录时唤起数字键盘（inputmode="decimal"）
- 修复 iOS 输入框自动缩放问题：viewport 添加 maximum-scale=1.0, user-scalable=no

## V2.7 (2026-06-13)
- 性能优化：首屏脚本异步加载，xlsx CDN 按需加载（首次导出时动态引入）
- init() 优化：先渲染 UI 框架 + 本地数据，后台异步刷新云端数据（stale-while-revalidate）
- loadDayFromCloud 移至 lib/cloud-sync.js，loadXlsxModule 保留在 lib/utils.js
- 时长/奶量为 0 时不展示单位（0h → 0，0ml → 0），非 0 正常展示
- 时间轴分类筛选：点击右上角图例可筛选时间轴和今日记录，再次点击取消
- 时间轴图例自适应：iPhone 12 Pro 下紧凑排列，无滚动条、不换行

## V2.6 (2026-06-13)
- 新增类型：外出（🌳，归类为玩耍）、学习（📖，独立归类）
- 当日概览：总玩耍时长合并计算玩耍+外出；新增学习时长显示
- 月度汇总新增列：外出次数（总玩耍右边）、学习时间(分钟)（洗澡次数右边）
- Excel 导出同步新增外出次数、学习时间(分钟)列
- 新增 .xuexi 配色（橙色 #ED7D31），时间轴图例新增"学习"
- 删除选中"其他"类型时的自动聚焦逻辑

## V2.5 (2026-06-12)
- 添加记录跨24点自动拆分：结束时间<开始时间时，自动拆为当天~24:00 + 第二天00:00~结束
- 编辑记录同样支持跨天拆分
- 已登录时直接从 Supabase 读取数据，不读本地缓存
- 云端加载改为 replace 模式（覆盖本地），初始化时以云端数据为准
- 优化 init() 异常处理：网络错误时降级读取本地数据，保留登录态

## V2.4 (2026-06-12)
- 优化 iPad Air 布局：导出栏按钮自适应换行，不再挤在一起
- 优化 iPad Air 布局：时间输入框（开始/结束）自适应宽度，不超出边框
- index.html 仅保留"作息记录"入口，删除其他预留入口
- baby-tracker 支持未登录使用（移除强制弹登录窗）
- index.html 未登录时展示登录弹窗，可选择"仅本设备使用"

## V2.3 及更早
- 宝宝作息记录功能完善
- 月度汇总、时间轴、数据导入导出
- Supabase 云端同步支持
