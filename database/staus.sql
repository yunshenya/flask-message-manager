ALTER TABLE url_data
    ADD COLUMN IF NOT EXISTS label TEXT,
    ADD COLUMN IF NOT EXISTS status TEXT;

-- 修改现有字段为可空并设置默认值
ALTER TABLE url_data
    ALTER COLUMN label DROP NOT NULL,
    ALTER COLUMN status DROP NOT NULL;

-- 设置默认值为空字符串（对于现有的NULL值）
UPDATE url_data SET label = '' WHERE label IS NULL;
UPDATE url_data SET status = '' WHERE status IS NULL;



CREATE INDEX IF NOT EXISTS idx_url_data_label ON url_data(label);
CREATE INDEX IF NOT EXISTS idx_url_data_status ON url_data(status);