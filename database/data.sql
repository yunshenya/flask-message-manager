-- ================================
-- 数据库初始化脚本
-- ================================

-- 如果数据库不存在则创建
-- CREATE DATABASE your_database_name;

-- 使用数据库
-- \c your_database_name;

-- ================================
-- 主配置表
-- ================================
CREATE TABLE IF NOT EXISTS config_data (
                                           id SERIAL PRIMARY KEY,
                                           success_time_min INTEGER NOT NULL DEFAULT 5,
                                           success_time_max INTEGER NOT NULL DEFAULT 10,
                                           reset_time INTEGER NOT NULL DEFAULT 0,
                                           created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                           updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                           is_active BOOLEAN DEFAULT TRUE,
                                           description TEXT
);

-- 为配置表添加注释
COMMENT ON TABLE config_data IS '主配置数据表';
COMMENT ON COLUMN config_data.success_time_min IS '成功时间范围最小值';
COMMENT ON COLUMN config_data.success_time_max IS '成功时间范围最大值';
COMMENT ON COLUMN config_data.reset_time IS '重置时间';
COMMENT ON COLUMN config_data.is_active IS '配置是否激活';

-- ================================
-- URL数据表
-- ================================
CREATE TABLE IF NOT EXISTS url_data (
                                        id SERIAL PRIMARY KEY,
                                        config_id INTEGER REFERENCES config_data(id) ON DELETE CASCADE,
                                        url VARCHAR(500) NOT NULL,
                                        name VARCHAR(200) NOT NULL,
                                        duration INTEGER NOT NULL DEFAULT 30,
                                        last_time TIMESTAMP,
                                        max_num INTEGER NOT NULL DEFAULT 3,
                                        current_count INTEGER DEFAULT 0,
                                        is_active BOOLEAN DEFAULT TRUE,
                                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 为URL数据表添加注释
COMMENT ON TABLE url_data IS 'URL配置数据表';
COMMENT ON COLUMN url_data.config_id IS '关联的配置ID';
COMMENT ON COLUMN url_data.url IS 'URL地址';
COMMENT ON COLUMN url_data.name IS '名称标识';
COMMENT ON COLUMN url_data.duration IS '持续时间（秒）';
COMMENT ON COLUMN url_data.last_time IS '最后执行时间';
COMMENT ON COLUMN url_data.max_num IS '最大执行次数';
COMMENT ON COLUMN url_data.current_count IS '当前执行次数';

-- ================================
-- 索引创建
-- ================================
CREATE INDEX IF NOT EXISTS idx_config_data_active ON config_data(is_active);
CREATE INDEX IF NOT EXISTS idx_url_data_config_id ON url_data(config_id);
CREATE INDEX IF NOT EXISTS idx_url_data_active ON url_data(is_active);
CREATE INDEX IF NOT EXISTS idx_url_data_url ON url_data(url);
CREATE INDEX IF NOT EXISTS idx_url_data_name ON url_data(name);
CREATE INDEX IF NOT EXISTS idx_url_data_last_time ON url_data(last_time);

-- ================================
-- 触发器：自动更新时间戳
-- ================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为配置表添加更新时间触发器
DROP TRIGGER IF EXISTS update_config_data_updated_at ON config_data;
CREATE TRIGGER update_config_data_updated_at
    BEFORE UPDATE ON config_data
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 为URL数据表添加更新时间触发器
DROP TRIGGER IF EXISTS update_url_data_updated_at ON url_data;
CREATE TRIGGER update_url_data_updated_at
    BEFORE UPDATE ON url_data
    FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ================================
-- 插入初始数据
-- ================================

-- 插入配置数据
INSERT INTO config_data (success_time_min, success_time_max, reset_time, description)
VALUES (5, 10, 0, '默认配置数据')
ON CONFLICT DO NOTHING;

-- 获取刚插入的配置ID（或现有的第一个配置ID）
-- 插入URL数据示例（取消注释以使用）
/*
INSERT INTO url_data (config_id, url, name, duration, max_num) VALUES
    (1, 'https://t.me/baolidb', '保利担保', 30, 3),
    (1, 'https://t.me/zhonghua2014tianxiang', '中华天象', 30, 3),
    (1, 'https://t.me/lianheshequ424', '联合社区', 30, 3),
    (1, 'https://t.me/make_friends1', 'make_friends', 30, 3)
ON CONFLICT DO NOTHING;
*/

-- ================================
-- 查询数据的视图
-- ================================
CREATE OR REPLACE VIEW config_with_urls AS
SELECT
    c.id as config_id,
    c.success_time_min,
    c.success_time_max,
    c.reset_time,
    c.description,
    c.is_active as config_active,
    c.created_at as config_created_at,
    c.updated_at as config_updated_at,
    COALESCE(
                    JSON_AGG(
                    JSON_BUILD_OBJECT(
                            'id', u.id,
                            'url', u.url,
                            'name', u.name,
                            'duration', u.duration,
                            'last_time', u.last_time,
                            'max_num', u.max_num,
                            'current_count', u.current_count,
                            'is_active', u.is_active
                    ) ORDER BY u.id
                            ) FILTER (WHERE u.id IS NOT NULL),
                    '[]'::json
    ) as urldata
FROM config_data c
         LEFT JOIN url_data u ON c.id = u.config_id AND u.is_active = TRUE
WHERE c.is_active = TRUE
GROUP BY c.id, c.success_time_min, c.success_time_max, c.reset_time,
         c.description, c.is_active, c.created_at, c.updated_at;

-- ================================
-- 常用查询函数
-- ================================

-- 获取完整配置数据（JSON格式）
CREATE OR REPLACE FUNCTION get_config_json(config_id_param INTEGER DEFAULT NULL)
    RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT JSON_BUILD_OBJECT(
                   'success_time', ARRAY[success_time_min, success_time_max],
                   'reset_time', reset_time,
                   'urldata', urldata
           ) INTO result
    FROM config_with_urls
    WHERE (config_id_param IS NULL OR config_id = config_id_param)
    LIMIT 1;

    RETURN COALESCE(result, '{"success_time":[5,10],"reset_time":0,"urldata":[]}'::JSON);
END;
$$ LANGUAGE plpgsql;

-- 更新URL的最后执行时间和计数
CREATE OR REPLACE FUNCTION update_url_execution(url_id_param INTEGER)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET last_time = CURRENT_TIMESTAMP,
        current_count = current_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = url_id_param;
END;
$$ LANGUAGE plpgsql;

-- 重置URL执行计数
CREATE OR REPLACE FUNCTION reset_url_counts(config_id_param INTEGER DEFAULT NULL)
    RETURNS VOID AS $$
BEGIN
    UPDATE url_data
    SET current_count = 0,
        last_time = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE (config_id_param IS NULL OR config_id = config_id_param);
END;
$$ LANGUAGE plpgsql;

-- ================================
-- 示例查询语句
-- ================================

-- 查看配置数据（视图）
-- SELECT * FROM config_with_urls;

-- 获取JSON格式的配置
-- SELECT get_config_json();
-- SELECT get_config_json(1);

-- 查看所有URL数据
-- SELECT * FROM url_data WHERE is_active = TRUE ORDER BY id;

-- 查看特定配置的URL数据
-- SELECT * FROM url_data WHERE config_id = 1 AND is_active = TRUE;

-- 更新URL执行记录
-- SELECT update_url_execution(1);

-- 重置所有计数
-- SELECT reset_url_counts();

-- 重置特定配置的计数
-- SELECT reset_url_counts(1);

-- ================================
-- 数据维护
-- ================================

-- 清理过期数据（可根据需要调整时间）
-- DELETE FROM url_data WHERE updated_at < CURRENT_TIMESTAMP - INTERVAL '30 days' AND is_active = FALSE;

-- 备份重要数据
-- COPY config_data TO '/path/to/config_backup.csv' DELIMITER ',' CSV HEADER;
-- COPY url_data TO '/path/to/url_backup.csv' DELIMITER ',' CSV HEADER;