// ==================== Supabase 配置 ====================
// 所有子页面共享此配置，挂载在 App 命名空间下
//
// 说明：Supabase anon key 设计为公开的，安全性完全由 RLS（Row Level Security）保证。
// 数据库已启用 RLS，所有操作均通过 auth.uid() = user_id 约束，未认证用户无法访问任何数据。
// 详见：supabase-setup.sql
App.SUPABASE_URL = 'https://jdlyqpvvfmsesdlicdbp.supabase.co';
App.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable__nR2mqJcII6bQ8kuoos69g_cLNg3y6M';
