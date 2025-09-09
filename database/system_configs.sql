-- 创建系统配置表
CREATE TABLE IF NOT EXISTS system_configs (
                                              id SERIAL PRIMARY KEY,
                                              key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    category VARCHAR(50) NOT NULL DEFAULT 'general',
    is_sensitive BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_system_configs_key ON system_configs(key);
CREATE INDEX IF NOT EXISTS idx_system_configs_category ON system_configs(category);
CREATE INDEX IF NOT EXISTS idx_system_configs_sensitive ON system_configs(is_sensitive);

-- 添加更新时间触发器
DROP TRIGGER IF EXISTS update_system_configs_updated_at ON system_configs;
CREATE TRIGGER update_system_configs_updated_at
    BEFORE UPDATE ON system_configs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 添加表注释
COMMENT ON TABLE system_configs IS '系统配置表';
COMMENT ON COLUMN system_configs.key IS '配置项名称';
COMMENT ON COLUMN system_configs.value IS '配置值';
COMMENT ON COLUMN system_configs.description IS '配置描述';
COMMENT ON COLUMN system_configs.category IS '配置分类';
COMMENT ON COLUMN system_configs.is_sensitive IS '是否为敏感信息';

-- 插入默认配置（如果不存在）
INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'DATABASE_URL',
       COALESCE(current_setting('app.database_url', true), 'postgresql://postgres:1332@localhost:5432/postgres'),
       'PostgreSQL数据库连接URL',
       'database',
       true
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'DATABASE_URL');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'SECRET_KEY',
       COALESCE(current_setting('app.secret_key', true), '1234567'),
       'Flask应用密钥，用于会话加密',
       'security',
       true
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'SECRET_KEY');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'API_SECRET_TOKEN',
       COALESCE(current_setting('app.api_secret_token', true), '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'),
       'API访问密钥',
       'security',
       true
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'API_SECRET_TOKEN');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'PKG_NAME',
       COALESCE(current_setting('app.pkg_name', true), 'com.a8jbctzav.cj02cuuma'),
       'Android应用包名',
       'app',
       false
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'PKG_NAME');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'TG_PKG_NAME',
       COALESCE(current_setting('app.tg_pkg_name', true), 'org.telegram.messenger.web'),
       'Telegram应用包名',
       'app',
       false
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'TG_PKG_NAME');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'DEBUG',
       COALESCE(current_setting('app.debug', true), 'false'),
       '是否启用调试模式',
       'app',
       false
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'DEBUG');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'SQLALCHEMY_TRACK_MODIFICATIONS',
       COALESCE(current_setting('app.sqlalchemy_track_modifications', true), 'false'),
       '是否跟踪SQLAlchemy对象修改',
       'database',
       false
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'SQLALCHEMY_TRACK_MODIFICATIONS');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'ACCESS_KEY',
       COALESCE(current_setting('app.access_key', true), 'nx9xwcQ5KEap2nUqrJZTBoxJK7G61uvj'),
       'VMOS API访问密钥',
       'vmos',
       true
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'ACCESS_KEY');

INSERT INTO system_configs (key, value, description, category, is_sensitive)
SELECT 'SECRET_ACCESS',
       COALESCE(current_setting('app.secret_access', true), '7xf9Q8D9VRBhzjWhgzwHx2AB'),
       'VMOS API密钥',
       'vmos',
       true
    WHERE NOT EXISTS (SELECT 1 FROM system_configs WHERE key = 'SECRET_ACCESS');