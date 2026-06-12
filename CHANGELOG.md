# 宝宝作息记录 - 更新日志

## v2.4 (2026-06-12)
- **架构重构**：代码模块化拆分，不再全部写在一个 HTML 内
  - `lib/` 公共库：supabase-config、supabase-client、supabase-auth、cloud-sync、storage、utils、data-io、excel-export
  - `baby-tracker/` 页面专属：baby-tracker.html + baby-tracker.css + baby-tracker.js
- **新增入口汇总页面** `index.html`：多个功能入口卡片，统一登录，支持跳转
- 预留入口：成长曲线、疫苗接种、成长相册（即将推出）

## v2.3 (2026-06-12)
- 月度汇总 & Excel 导出：拉臭臭、换尿布、洗澡拆分为独立三列（不再合并为"洗护"）
- 月度汇总 & Excel 导出：总睡眠(分钟)移到长睡次数右边，总玩耍(分钟)移到玩耍次数右边
- PC 端页面宽度自适应（max-width 1400px，width 95%），月度汇总表格更舒展
- 换尿布图标从 🧷 改为 🩲

## v2.2
- 新增"辅食"类型，归为吃喝类
- 拉臭臭/换尿布/洗澡归类为"洗护"（紫色配色）
- 当日汇总增加总奶量卡片
- "其他"独立灰色配色

## v2.1
- "其他"类型支持自定义文本输入
- 修复 CSS display 与 hidden 属性冲突
- 优化添加记录后 UI 状态保持

## v2.0
- 初始版本
- 喝奶、喝水、小睡、长睡、玩耍、拉臭臭、换尿布、洗澡、其他类型
- 每日记录、月度汇总、时间轴
- Excel 导出、JSON 导入/导出
- Supabase 云端同步
