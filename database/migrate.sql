-- 为url_data表添加运行状态字段
ALTER TABLE url_data
    ADD COLUMN IF NOT EXISTS is_running BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS started_at TIMESTAMP NULL,
    ADD COLUMN IF NOT EXISTS stopped_at TIMESTAMP NULL;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_url_data_running ON url_data(is_running);
CREATE INDEX IF NOT EXISTS idx_url_data_started_at ON url_data(started_at);

-- 为字段添加注释
COMMENT ON COLUMN url_data.is_running IS 'URL是否正在运行';
COMMENT ON COLUMN url_data.started_at IS '开始运行时间';
COMMENT ON COLUMN url_data.stopped_at IS '停止运行时间';

-- 创建运行状态管理函数
CREATE OR REPLACE FUNCTION start_url_execution(url_id_param INTEGER)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET is_running = TRUE,
        started_at = CURRENT_TIMESTAMP,
        stopped_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = url_id_param AND current_count < max_num;
END;
$$ LANGUAGE plpgsql;

-- 停止URL运行状态
CREATE OR REPLACE FUNCTION stop_url_execution(url_id_param INTEGER)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET is_running = FALSE,
        stopped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = url_id_param;
END;
$$ LANGUAGE plpgsql;

-- 批量停止配置下的所有URL运行状态
CREATE OR REPLACE FUNCTION stop_config_urls(config_id_param INTEGER)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET is_running = FALSE,
        stopped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE config_id = config_id_param AND is_running = TRUE;
END;
$$ LANGUAGE plpgsql;

-- 批量启动配置下的可用URL
CREATE OR REPLACE FUNCTION start_config_urls(config_id_param INTEGER)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET is_running = TRUE,
        started_at = CURRENT_TIMESTAMP,
        stopped_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE config_id = config_id_param
      AND is_active = TRUE
      AND current_count < max_num;
END;
$$ LANGUAGE plpgsql;

-- 更新现有的URL执行函数
CREATE OR REPLACE FUNCTION update_url_execution(url_id_param INTEGER)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET last_time = CURRENT_TIMESTAMP,
        current_count = current_count + 1,
        updated_at = CURRENT_TIMESTAMP,
        -- 如果达到最大次数，自动停止运行
        is_running = CASE
                         WHEN current_count + 1 >= max_num THEN FALSE
                         ELSE is_running
            END,
        stopped_at = CASE
                         WHEN current_count + 1 >= max_num THEN CURRENT_TIMESTAMP
                         ELSE stopped_at
            END
    WHERE id = url_id_param;
END;
$$ LANGUAGE plpgsql;

-- 重置URL计数时同时重置运行状态
CREATE OR REPLACE FUNCTION reset_url_counts(config_id_param INTEGER DEFAULT NULL)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET current_count = 0,
        last_time = NULL,
        is_running = FALSE,
        started_at = NULL,
        stopped_at = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE (config_id_param IS NULL OR config_id = config_id_param);
END;
$$ LANGUAGE plpgsql;