-- =====================================================
-- 宝宝作息记录 - Supabase 数据库建表脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 1. 创建记录表
CREATE TABLE IF NOT EXISTS baby_records (
  id          BIGINT PRIMARY KEY,                  -- 毫秒时间戳，与前端 Date.now() 一致
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,                       -- '2026-06-12'
  type        TEXT NOT NULL,                       -- '喝奶','小睡','玩耍','拉臭臭','换尿布','洗澡','其他'
  start_time  TEXT DEFAULT '',                     -- '08:30'
  end_time    TEXT DEFAULT '',                     -- '09:00'
  detail      TEXT DEFAULT '',                     -- 奶量(ml) / 备注
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 创建索引（提升查询性能）
CREATE INDEX IF NOT EXISTS idx_baby_records_user_date
  ON baby_records(user_id, record_date DESC);

CREATE INDEX IF NOT EXISTS idx_baby_records_user_type
  ON baby_records(user_id, type);

-- 3. 启用 Row Level Security
ALTER TABLE baby_records ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略：用户只能读取自己的记录
CREATE POLICY "Users can read own records"
  ON baby_records
  FOR SELECT
  USING (auth.uid() = user_id);

-- 5. RLS 策略：用户只能插入自己的记录
CREATE POLICY "Users can insert own records"
  ON baby_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 6. RLS 策略：用户只能更新自己的记录
CREATE POLICY "Users can update own records"
  ON baby_records
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. RLS 策略：用户只能删除自己的记录
CREATE POLICY "Users can delete own records"
  ON baby_records
  FOR DELETE
  USING (auth.uid() = user_id);

-- 8. (可选) 自动更新 updated_at 的触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_baby_records_updated_at
  BEFORE UPDATE ON baby_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
