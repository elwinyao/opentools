-- =====================================================
-- 宝宝作息记录 - Supabase 数据库建表脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- =====================================================

-- 1. 创建记录表
CREATE TABLE IF NOT EXISTS baby_records (
  id          BIGINT PRIMARY KEY,                  -- 前端 generateId() 生成（随机 15 位 hex ≈ 2^60，非毫秒时间戳）
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

-- 3. 设置 REPLICA IDENTITY 为 FULL（Realtime DELETE 事件会包含完整旧记录）
ALTER TABLE baby_records REPLICA IDENTITY FULL;

-- 3.1 加入实时发布（Realtime postgres_changes 订阅；幂等：已加入时跳过，重复执行不报错）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'baby_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE baby_records;
  END IF;
END $$;

-- 4. 启用 Row Level Security
ALTER TABLE baby_records ENABLE ROW LEVEL SECURITY;

-- 5. RLS 策略：用户只能读取自己的记录
CREATE POLICY "Users can read own records"
  ON baby_records
  FOR SELECT
  USING (auth.uid() = user_id);

-- 6. RLS 策略：用户只能插入自己的记录
CREATE POLICY "Users can insert own records"
  ON baby_records
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 7. RLS 策略：用户只能更新自己的记录
CREATE POLICY "Users can update own records"
  ON baby_records
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. RLS 策略：用户只能删除自己的记录
CREATE POLICY "Users can delete own records"
  ON baby_records
  FOR DELETE
  USING (auth.uid() = user_id);

-- 9. (可选) 自动更新 updated_at 的触发器
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

-- =====================================================
-- 宝宝成长记录（月龄基准 + 身高体重）- Supabase 建表脚本
-- 在 Supabase SQL Editor 中执行以下脚本
-- =====================================================

-- 1. 宝宝档案表（每用户一条：实际出生日 / 预产期）
CREATE TABLE IF NOT EXISTS baby_profile (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_type  TEXT NOT NULL DEFAULT 'actual',   -- actual=已出生 due=孕期(按预产期)
  birth_date  DATE,                             -- 实际出生日
  due_date    DATE,                             -- 预产期
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 成长记录表（身高体重头围，按天记录）
CREATE TABLE IF NOT EXISTS baby_growth_records (
  id          BIGINT PRIMARY KEY,               -- 前端 generateId() 生成（随机 15 位 hex ≈ 2^60，非毫秒时间戳）
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,                    -- 测量日期 '2026-06-12'
  height_cm   NUMERIC(5,1),                     -- 身高 cm
  weight_kg   NUMERIC(5,2),                     -- 体重 kg
  head_cm     NUMERIC(5,1),                     -- 头围 cm
  note        TEXT DEFAULT '',                  -- 备注
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2b. 老表升级：已创建过 baby_growth_records 时补充头围列
ALTER TABLE baby_growth_records
  ADD COLUMN IF NOT EXISTS head_cm NUMERIC(5,1);

-- 3. 创建索引（提升查询性能）
CREATE INDEX IF NOT EXISTS idx_baby_growth_user_date
  ON baby_growth_records(user_id, record_date DESC);

-- 4. 启用 Row Level Security
ALTER TABLE baby_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE baby_growth_records ENABLE ROW LEVEL SECURITY;

-- 5. RLS 策略：baby_profile（用户只能访问自己的档案）
CREATE POLICY "Users can read own profile"
  ON baby_profile FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON baby_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON baby_profile FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own profile"
  ON baby_profile FOR DELETE
  USING (auth.uid() = user_id);

-- 6. RLS 策略：baby_growth_records（用户只能访问自己的成长记录）
CREATE POLICY "Users can read own growth"
  ON baby_growth_records FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own growth"
  ON baby_growth_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own growth"
  ON baby_growth_records FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own growth"
  ON baby_growth_records FOR DELETE
  USING (auth.uid() = user_id);

-- 7. 自动更新 updated_at 的触发器
CREATE TRIGGER trg_baby_profile_updated_at
  BEFORE UPDATE ON baby_profile
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_baby_growth_updated_at
  BEFORE UPDATE ON baby_growth_records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 宝宝疫苗接种 - Supabase 数据库建表脚本（合并到主脚本）
-- =====================================================

-- 1. 疫苗接种记录表
CREATE TABLE IF NOT EXISTS baby_vaccines (
  id                    BIGINT PRIMARY KEY,            -- 前端 generateId() 生成
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vaccine_key           TEXT NOT NULL,                 -- 疫苗标识（如 hepB_1, bcg, custom_xxx）
  vaccine_name          TEXT NOT NULL,                 -- 疫苗名称（如 "乙肝疫苗(第1剂)"）
  dose_number           INTEGER DEFAULT 1,             -- 第几剂
  schedule_age          TEXT DEFAULT '',               -- 建议接种月龄描述（如 "出生时"、"2月龄"）
  schedule_months       INTEGER DEFAULT 0,             -- 建议接种月龄（数字，用于排序）
  status                TEXT DEFAULT 'pending',        -- pending=未接种 / done=已接种 / skipped=已跳过
  vaccinated_date       DATE,                          -- 实际接种日期
  lot_number            TEXT DEFAULT '',               -- 疫苗批号
  hospital              TEXT DEFAULT '',               -- 接种机构
  note                  TEXT DEFAULT '',               -- 备注
  is_custom             BOOLEAN DEFAULT false,         -- 是否为自费疫苗
  disease               TEXT DEFAULT '',               -- 预防疾病
  vaccine_icon          TEXT DEFAULT '💉',             -- 疫苗图标
  custom_schedule_months INTEGER,                      -- 调整后的建议月龄（null=未调整）
  custom_schedule_age   TEXT,                           -- 调整后的月龄描述
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_baby_vaccines_user
  ON baby_vaccines(user_id, schedule_months);

CREATE INDEX IF NOT EXISTS idx_baby_vaccines_status
  ON baby_vaccines(user_id, status);

-- 3. 唯一约束：同一用户同一疫苗剂次只有一条记录
CREATE UNIQUE INDEX IF NOT EXISTS idx_baby_vaccines_user_key_unique
  ON baby_vaccines(user_id, vaccine_key);

-- 4. REPLICA IDENTITY FULL（Realtime DELETE 事件包含完整旧记录）
ALTER TABLE baby_vaccines REPLICA IDENTITY FULL;

-- 5. 启用 Row Level Security
ALTER TABLE baby_vaccines ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略：用户只能操作自己的数据
CREATE POLICY "Users can read own vaccines"
  ON baby_vaccines FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vaccines"
  ON baby_vaccines FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vaccines"
  ON baby_vaccines FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vaccines"
  ON baby_vaccines FOR DELETE
  USING (auth.uid() = user_id);

-- 7. 自动更新 updated_at 触发器（复用已有的 update_updated_at_column 函数）
CREATE TRIGGER trg_baby_vaccines_updated_at
  BEFORE UPDATE ON baby_vaccines
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 8. 启用 Realtime（幂等：已加入时跳过，重复执行不报错）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'baby_vaccines'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE baby_vaccines;
  END IF;
END $$;

-- =====================================================
-- 宝宝成长记录 - 启用 Realtime（幂等，重复执行不报错）
-- =====================================================

-- 1. REPLICA IDENTITY FULL：Realtime DELETE 事件包含完整旧记录
ALTER TABLE baby_growth_records REPLICA IDENTITY FULL;
ALTER TABLE baby_profile REPLICA IDENTITY FULL;

-- 2. 加入实时发布（baby_growth_records 记录表 + baby_profile 档案表）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'baby_growth_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE baby_growth_records;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'baby_profile'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE baby_profile;
  END IF;
END $$;
