# 宝宝成长助手 (Baby Growth Tracker)

## 项目概述

**宝宝成长助手** 是一个面向父母的 **PWA（渐进式 Web 应用）**，用于记录婴儿日常生活数据，包括作息记录、身长体重等成长指标以及疫苗接种进度。项目采用 **纯前端 + Supabase 云端同步** 的架构，支持离线使用（通过 Service Worker 缓存）和多设备数据同步。

### 核心特性

- **PWA 支持**：可安装到手机桌面，离线也能正常使用
- **云端同步**：基于 Supabase 实现多设备数据实时同步
- **离线优先**：Service Worker 缓存静态资源与 API 响应，网络恢复后自动同步
- **安全登录**：支持 Supabase Auth 登录，本地加密存储 Token
- **模块化设计**：作息、成长、疫苗三大核心功能模块独立开发

---

## 项目结构

```
opentools/
├── index.html              # 入口页面（首页）
├── index.css               # 首页样式
├── index.js                # 首页逻辑（登录状态管理、初始化）
├── server.js               # 本地调试 HTTP 服务器
├── sw.js                   # Service Worker（缓存策略、离线支持）
├── manifest.json           # PWA 应用清单
├── supabase-setup.sql      # Supabase 数据库建表脚本
├── CHANGELOG.md            # 版本更新日志
├── icons/                  # PWA 图标资源
│   ├── icon-192.png
│   └── icon-512.png
├── lib/                    # 公共库
│   ├── common.css          # 公共样式
│   ├── common-bundle.js    # 公共 JS 库（合并打包）
│   ├── data-io.js          # 数据导入/导出
│   ├── excel-export.js     # Excel 导出
│   └── supabase-js.min.js  # Supabase JS SDK
├── baby-tracker/           # 作息记录模块
│   ├── baby-tracker.html
│   ├── baby-tracker.css
│   ├── monthly.js          # 月度汇总逻辑
│   └── page-bundle.js      # 页面 JS（合并打包）
├── growth-tracker/         # 成长记录模块
│   ├── growth-tracker.html
│   ├── growth-tracker.css
│   ├── growth-tracker.js
│   ├── wfl_boys.json       # WHO 身长别体重 LMS 参考数据（男）
│   ├── wfl_girls.json      # WHO 身长别体重 LMS 参考数据（女）
│   ├── bmi_boys.json       # WHO 0~2岁 BMI LMS 参考数据（男）
│   └── bmi_girls.json      # WHO 0~2岁 BMI LMS 参考数据（女）
├── vaccine-tracker/        # 疫苗接种模块
│   ├── vaccine-tracker.html
│   ├── vaccine-tracker.css
│   └── vaccine-tracker.js
└── health-tracker/         # 健康记录模块（独立页面，未在首页导航）
    ├── health-tracker.html
    └── health-tracker.js

# 独立工具（非本项目一部分）
├── attendance-tracker.html # 考勤记录工具（独立单文件应用，用于记录工作出勤）
```

---

## 功能模块详解

### 1. 首页 (index.html)

- 项目入口，展示功能导航卡片
- 用户登录/登出管理
- 快速路径恢复会话（sessionStorage + 加密存储）
- 三大功能入口：作息记录、成长记录、疫苗接种

### 2. 作息记录 (baby-tracker)

记录宝宝日常作息，包括：
- 喝奶（记录奶量）
- 小睡（记录开始/结束时间）
- 玩耍
- 拉臭臭 / 换尿被
- 洗澡
- 其他

支持时间轴查看与月度汇总统计。

### 3. 成长记录 (growth-tracker)

记录宝宝的身长、体重、头围等生长指标：
- 支持出生日 / 预产期双模式（默认按纠正月龄评估）
- 按天记录生长数据
- 成长趋势图展示，含 WHO 派生体格指标：
  - **身长别体重 WFL (z 分数)**：0~2 岁首选，区分消瘦 / 超重 SD 区间带
  - **BMI 身体质量指数 (z 分数)**：支持当前 / 纠正月龄双线切换，含消瘦 / 超重风险 SD 区间带
  - **原始 BMI (kg/m²)** 趋势线
  - **Ponderal 指数 PI (kg/m³)**：固定量程 + 区间带（迟缓 / 偏低 / 正常 / 偏胖）
- 趋势图底部附「指标说明」表（最佳使用期与作用）

### 4. 疫苗接种 (vaccine-tracker)

基于国家免疫规划，跟踪疫苗接种进度：
- 按月龄推荐疫苗
- 记录接种日期、批号、医院
- 支持跳过 / 自定义疫苗
- 内置自费疫苗预设库（五联、13价肺炎、ACYW135流脑结合、甲肝灭活、轮状、流感、Hib），添加时自动带出名称/剂次/月龄，支持免费/自费类型标记

### 5. 健康记录 (health-tracker)

记录宝宝的健康相关信息（如发烧、吃药等）。

> **注意**：health-tracker 为独立页面，**未在首页导航中**，需直接访问 `health-tracker/health-tracker.html`。

---

### 独立工具：考勤记录 (attendance-tracker.html)

**非本项目核心功能**，是一个独立的单文件 PWA 应用，用于记录工作出勤情况：
- 日历视图标记工作日/休息日/加班日/法定节假日
- 农历/节气/节日自动显示
- 年度汇总统计（出勤、加班、法定变工作日等）
- 数据导入/导出（JSON）
- 本地存储，无需登录

---

## 技术架构

### 前端技术栈

| 技术 | 用途 |
|------|------|
| HTML5 + CSS3 | 页面结构与样式 |
| JavaScript (ES6+) | 业务逻辑 |
| PWA | 离线支持、桌面安装 |
| Service Worker | 资源缓存、API 缓存 |
| Supabase JS SDK | 认证与数据库操作 |

### 后端 / 云服务

| 服务 | 用途 |
|------|------|
| Supabase Auth | 用户认证（邮箱/密码注册 + 登录） |
| Supabase Postgres | 数据存储 |
| Supabase Realtime | 实时数据同步 |
| Supabase RLS | 行级安全策略（用户只能访问自己的数据） |

### 数据库表结构

| 表名 | 说明 |
|------|------|
| `baby_records` | 作息记录（喝奶、小睡、玩耍、拉臭臭、换尿布、洗澡、其他） |
| `baby_profile` | 宝宝档案（出生日/预产期，支持 actual/due 双模式，含 `sex` 男孩/女孩） |
| `baby_growth_records` | 成长记录（身高、体重、头围，按天记录） |
| `baby_vaccines` | 疫苗接种记录（23剂国家免疫规划 + 自定义疫苗，支持免费/自费标记、批号、医院、接种日期） |

所有表均启用 **Row Level Security (RLS)**，确保用户数据隔离。

**关键设计细节**：
- 主键 `id` 使用前端 `generateId()` 生成（随机 15 位 hex ≈ 2^60，**非毫秒时间戳**）
- 所有表设置 `REPLICA IDENTITY FULL`，Realtime DELETE 事件包含完整旧记录
- `baby_records`、`baby_growth_records`、`baby_profile`、`baby_vaccines` 均加入 `supabase_realtime` 发布，支持多设备实时同步
- `baby_vaccines` 有唯一约束 `idx_baby_vaccines_user_key_unique`（同一用户同一疫苗剂次仅一条）
- 自动更新 `updated_at` 触发器（UTC 时间，与前端 `toISOString()` 对齐）

---

## 运行方式

### 本地开发

```bash
# 启动本地服务器（Node.js）
node server.js

# 浏览器访问
http://localhost:3456
```

### 部署

项目为纯静态文件，可部署到任意静态托管平台（如 Vercel、Netlify、GitHub Pages 等）。

### Supabase 配置

在 `supabase-setup.sql` 中执行数据库建表脚本，即可完成所有表结构、索引、RLS 策略及 Realtime 配置。

---

## 缓存策略 (Service Worker)

| 请求类型 | 策略 |
|----------|------|
| Supabase API GET (`/rest/v1/`) | Network First + 缓存回退（24小时 TTL，`api-cache`） |
| 静态资源 (CSS/JS/图标/字体) | Cache First + 后台更新（`baby-tracker-v66`） |
| HTML 页面导航 | Network First，离线时回退到缓存（`baby-tracker-v66`） |
| 外部 CDN (fonts.googleapis.com, cdn.jsdelivr.net 等) | 不拦截，直接网络请求 |

**缓存版本**：静态缓存 `baby-tracker-v66`（随版本号递增，激活时清理旧版本）；API 缓存 `api-cache`（按 URL 键缓存，登出时通过 postMessage 清空，防止换账号读到上一账号数据）

---

## 安全设计

- **Token 加密存储**：登录 Token 使用加密方式存储在本地
- **快速路径恢复**：通过 sessionStorage 快速恢复会话，避免重复解密
- **Token 刷新并发互斥（单飞）**：所有刷新请求共享同一个 Promise，同一时刻最多 1 个刷新请求在途——多标签页/多调用方并发时直接复用结果，杜绝 refresh token 单次使用+轮换制下并发必 400 的问题；刷新直接显式传本地 `refresh_token`（不依赖 SDK 内部会话状态），400/401 凭证失效即判死引导重新登录，网络类错误（超时/断网）不误杀会话
- **请求超时与错误友好化**：所有 Supabase 请求统一 20s 超时（`fetchWithTimeout`），超时/网络失败经 `friendlyNetworkError` 转为中文提示，不再裸显英文异常
- **离线同步队列**：写入/删除失败自动入队（按表分发），每 30s 重试直至成功；互踢（SDK `SIGNED_OUT` 事件）只清会话凭证、队列保留，未同步数据重新登录后继续上传
- **登出清数据视图**：主动登出时清空本机各模块数据与同步队列，防止换账号时旧数据串显（云端已同步数据重新登录后可恢复）
- **登出清缓存**：登出时通知 Service Worker 清空 API 缓存，防止换账号时数据串连
- **RLS 隔离**：所有数据库操作通过 Supabase RLS 策略，确保用户只能访问自己的记录；写入显式携带 `user_id`（与 JWT `auth.uid()` 一致），与数据库 `DEFAULT auth.uid()` 双保险
