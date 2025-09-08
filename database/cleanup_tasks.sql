-- 创建清理任务表
CREATE TABLE IF NOT EXISTS cleanup_tasks (
                                             id SERIAL PRIMARY KEY,
                                             name VARCHAR(100) NOT NULL,
    description TEXT,
    schedule_time TIME NOT NULL, -- 每日执行时间
    is_enabled BOOLEAN DEFAULT TRUE,
    cleanup_types VARCHAR(200) NOT NULL, -- JSON数组：["status", "label", "counts"]
    target_configs TEXT, -- JSON数组：配置ID列表，空表示全部
    last_run TIMESTAMP,
    next_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_cleanup_tasks_enabled ON cleanup_tasks(is_enabled);
CREATE INDEX IF NOT EXISTS idx_cleanup_tasks_next_run ON cleanup_tasks(next_run);

-- 添加更新时间触发器
DROP TRIGGER IF EXISTS update_cleanup_tasks_updated_at ON cleanup_tasks;
CREATE TRIGGER update_cleanup_tasks_updated_at
    BEFORE UPDATE ON cleanup_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 创建清理执行函数
CREATE OR REPLACE FUNCTION execute_cleanup_task(
    cleanup_types_param VARCHAR(200),
    target_configs_param TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
cleanup_array TEXT[];
    config_array INTEGER[];
    affected_rows INTEGER := 0;
    temp_count INTEGER;
BEGIN
    -- 解析清理类型
SELECT string_to_array(replace(replace(cleanup_types_param, '[', ''), ']', ''), ',') INTO cleanup_array;

-- 解析目标配置（如果有）
IF target_configs_param IS NOT NULL AND target_configs_param != '' THEN
SELECT ARRAY(
           SELECT CAST(trim(both '"' from unnest(string_to_array(replace(replace(target_configs_param, '[', ''), ']', ''), ','))) AS INTEGER)
        ) INTO config_array;
END IF;

    -- 清理状态
    IF 'status' = ANY(cleanup_array) THEN
UPDATE url_data
SET status = '', updated_at = CURRENT_TIMESTAMP
WHERE status IS NOT NULL AND status != ''
        AND (config_array IS NULL OR config_id = ANY(config_array));
GET DIAGNOSTICS temp_count = ROW_COUNT;
affected_rows := affected_rows + temp_count;
END IF;

    -- 清理标签
    IF 'label' = ANY(cleanup_array) THEN
UPDATE url_data
SET label = '', updated_at = CURRENT_TIMESTAMP
WHERE label IS NOT NULL AND label != ''
        AND (config_array IS NULL OR config_id = ANY(config_array));
GET DIAGNOSTICS temp_count = ROW_COUNT;
affected_rows := affected_rows + temp_count;
END IF;

    -- 清理运行次数
    IF 'counts' = ANY(cleanup_array) THEN
UPDATE url_data
SET current_count = 0,
    last_time = NULL,
    is_running = FALSE,
    started_at = NULL,
    stopped_at = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE (config_array IS NULL OR config_id = ANY(config_array));
GET DIAGNOSTICS temp_count = ROW_COUNT;
affected_rows := affected_rows + temp_count;
END IF;

RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;