-- 创建users表
CREATE TABLE IF NOT EXISTS users (
                                     id SERIAL PRIMARY KEY,
                                     username VARCHAR(80) UNIQUE NOT NULL,
                                     password_hash VARCHAR(128) NOT NULL,
                                     email VARCHAR(120) UNIQUE,
                                     is_admin BOOLEAN DEFAULT FALSE,
                                     is_active BOOLEAN DEFAULT TRUE,
                                     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                     last_login TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);

-- 创建默认管理员用户
INSERT INTO users (username, password_hash, email, is_admin)
VALUES ('admin', 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d', 'admin@example.com', TRUE)
ON CONFLICT (username) DO NOTHING;