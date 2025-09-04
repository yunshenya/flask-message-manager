-- 删除可能存在的错误记录
DELETE FROM users WHERE username = 'admin';

-- 重新创建管理员用户
INSERT INTO users (username, password_hash, email, is_admin, is_active)
VALUES (
           'admin',
           'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
           'admin@example.com',
           TRUE,
           TRUE
       );