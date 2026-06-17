# 版本记录

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
