import datetime
import hashlib
import os
from functools import wraps
from typing import Any

from flask import Flask, jsonify, request, render_template_string, session, redirect, url_for, flash
from flask_sqlalchemy import SQLAlchemy

app = Flask(__name__)
app.secret_key = os.getenv('SECRET_KEY', '1234567')

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:1332@localhost:5432/postgres')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 初始化数据库
db = SQLAlchemy(app)

# ==================== 用户模型 ====================
class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=True)
    is_admin = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    last_login = db.Column(db.DateTime)

    @staticmethod
    def hash_password(password):
        return hashlib.sha256(password.encode()).hexdigest()

    def check_password(self, password):
        return self.password_hash == self.hash_password(password)

    def to_dict(self):
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'is_admin': self.is_admin,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }

# 原有模型保持不变
class ConfigData(db.Model):
    __tablename__ = 'config_data'

    id = db.Column(db.Integer, primary_key=True)
    success_time_min = db.Column(db.Integer, nullable=False, default=5)
    success_time_max = db.Column(db.Integer, nullable=False, default=10)
    reset_time = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now())
    is_active = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text)

    urls : Any = db.relationship('UrlData', backref='config', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'success_time': [self.success_time_min, self.success_time_max],
            'reset_time': self.reset_time,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'urldata': [url.to_dict() for url in self.urls if url.is_active]
        }

class UrlData(db.Model):
    __tablename__ = 'url_data'

    id = db.Column(db.Integer, primary_key=True)
    config_id = db.Column(db.Integer, db.ForeignKey('config_data.id', ondelete='CASCADE'))
    url = db.Column(db.String(500), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    duration = db.Column(db.Integer, nullable=False, default=30)
    last_time = db.Column(db.DateTime)
    max_num = db.Column(db.Integer, nullable=False, default=3)
    current_count = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now())

    def to_dict(self):
        return {
            'id': self.id,
            'url': self.url,
            'name': self.name,
            'duration': self.duration,
            'last_time': self.last_time.isoformat() if self.last_time else None,
            'max_num': self.max_num,
            'current_count': self.current_count,
            'is_active': self.is_active,
            'can_execute': self.current_count < self.max_num,
            'telegram_channel': self.url.replace('https://t.me/', '@') if self.url.startswith('https://t.me/') else self.url
        }

    def can_execute(self):
        return self.current_count < self.max_num

    def execute(self):
        if self.can_execute():
            self.current_count += 1
            self.last_time = datetime.datetime.now()
            self.updated_at = datetime.datetime.now()
            return True
        return False

# ==================== 认证装饰器 ====================
def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json:
                return jsonify({'error': 'Authentication required', 'login_url': '/login'}), 401
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json:
                return jsonify({'error': 'Authentication required', 'login_url': '/login'}), 401
            return redirect(url_for('login'))

        user = db.session.get(User, session['user_id'])
        if not user or not user.is_admin:
            if request.is_json:
                return jsonify({'error': 'Admin access required'}), 403
            flash('需要管理员权限')
            return redirect(url_for('dashboard'))
        return f(*args, **kwargs)
    return decorated_function

# ==================== HTML模板 ====================
LOGIN_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>消息管理系统 - 登录</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 400px; margin: 100px auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { text-align: center; color: #333; margin-bottom: 30px; }
        .form-group { margin-bottom: 20px; }
        label { display: block; margin-bottom: 5px; color: #555; }
        input[type="text"], input[type="password"] { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 12px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
        button:hover { background: #0056b3; }
        .alert { padding: 10px; margin-bottom: 20px; border-radius: 4px; }
        .alert-danger { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>消息管理系统</h1>
        {% with messages = get_flashed_messages() %}
            {% if messages %}
                {% for message in messages %}
                    <div class="alert alert-danger">{{ message }}</div>
                {% endfor %}
            {% endif %}
        {% endwith %}
        <form method="POST">
            <div class="form-group">
                <label for="username">用户名:</label>
                <input type="text" id="username" name="username" required>
            </div>
            <div class="form-group">
                <label for="password">密码:</label>
                <input type="password" id="password" name="password" required>
            </div>
            <button type="submit">登录</button>
        </form>
    </div>
</body>
</html>
'''

DASHBOARD_TEMPLATE = '''
<!DOCTYPE html>
<html>
<head>
    <title>消息管理系统 - 仪表板</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
        .header { background: #007bff; color: white; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
        .header h1 { margin: 0; }
        .user-info { display: flex; align-items: center; gap: 1rem; }
        .container { max-width: 1200px; margin: 2rem auto; padding: 0 2rem; }
        .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .stat-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }
        .stat-number { font-size: 2rem; font-weight: bold; color: #007bff; }
        .stat-label { color: #666; margin-top: 0.5rem; }
        .actions { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
        .action-card { background: white; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .action-card h3 { margin-top: 0; color: #333; }
        .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 0.25rem; }
        .btn-primary { background: #007bff; color: white; }
        .btn-success { background: #28a745; color: white; }
        .btn-warning { background: #ffc107; color: black; }
        .btn-danger { background: #dc3545; color: white; }
        .btn:hover { opacity: 0.8; }
        .url-list { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .url-item { padding: 1rem; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
        .url-item:last-child { border-bottom: none; }
        .url-info { flex: 1; }
        .url-name { font-weight: bold; color: #333; }
        .url-link { color: #666; font-size: 0.9rem; }
        .url-stats { display: flex; gap: 1rem; align-items: center; }
        .progress { background: #e9ecef; height: 6px; border-radius: 3px; overflow: hidden; width: 100px; }
        .progress-bar { background: #007bff; height: 100%; transition: width 0.3s; }
        .alert { padding: 1rem; margin-bottom: 1rem; border-radius: 4px; }
        .alert-success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .alert-danger { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <div class="header">
        <h1>消息管理系统</h1>
        <div class="user-info">
            <span>欢迎, {{ current_user.username }}</span>
            {% if current_user.is_admin %}<span class="btn btn-warning">管理员</span>{% endif %}
            <a href="{{ url_for('logout') }}" class="btn btn-danger">退出</a>
        </div>
    </div>

    <div class="container">
        {% with messages = get_flashed_messages() %}
            {% if messages %}
                {% for message in messages %}
                    <div class="alert alert-success">{{ message }}</div>
                {% endfor %}
            {% endif %}
        {% endwith %}

        <div class="stats">
            <div class="stat-card">
                <div class="stat-number" id="totalUrls">-</div>
                <div class="stat-label">总URL数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="availableUrls">-</div>
                <div class="stat-label">可执行URL</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalExecutions">-</div>
                <div class="stat-label">总执行次数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="completedUrls">-</div>
                <div class="stat-label">已完成URL</div>
            </div>
        </div>

        <div class="actions">
            <div class="action-card">
                <h3>URL管理</h3>
                <a href="#" onclick="showAddUrlModal()" class="btn btn-success">添加URL</a>
                <a href="#" onclick="refreshData()" class="btn btn-primary">刷新数据</a>
                <a href="#" onclick="resetAllUrls()" class="btn btn-warning">重置所有计数</a>
            </div>
            <div class="action-card">
                <h3>批量操作</h3>
                <a href="#" onclick="showBatchAddModal()" class="btn btn-success">批量添加</a>
                <a href="#" onclick="executeAvailable()" class="btn btn-primary">执行可用URL</a>
                <a href="/admin" class="btn btn-warning">系统管理</a>
            </div>
        </div>

        <div class="url-list" id="urlList">
            <!-- URL列表将通过JavaScript动态加载 -->
        </div>
    </div>

    <!-- 添加URL模态框 -->
    <div id="addUrlModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000;">
        <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 2rem; border-radius: 8px; width: 90%; max-width: 500px;">
            <h3>添加新URL</h3>
            <form onsubmit="addUrl(event)">
                <div style="margin-bottom: 1rem;">
                    <label>URL:</label>
                    <input type="url" id="newUrl" required style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label>名称:</label>
                    <input type="text" id="newName" required style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label>持续时间(秒):</label>
                    <input type="number" id="newDuration" value="30" min="1" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="margin-bottom: 1rem;">
                    <label>最大执行次数:</label>
                    <input type="number" id="newMaxNum" value="3" min="1" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;">
                </div>
                <div style="text-align: right;">
                    <button type="button" onclick="hideAddUrlModal()" class="btn btn-danger">取消</button>
                    <button type="submit" class="btn btn-success">添加</button>
                </div>
            </form>
        </div>
    </div>

    <script>
        // JavaScript代码用于动态交互
        const API_BASE = '';

        async function apiCall(url, options = {}) {
            try {
                const response = await fetch(url, {
                    ...options,
                    headers: {
                        'Content-Type': 'application/json',
                        ...options.headers
                    }
                });
                
                if (!response.ok) {
                    if (response.status === 401) {
                        window.location.href = '/login';
                        return;
                    }
                    throw new Error(`HTTP ${response.status}`);
                }
                
                return await response.json();
            } catch (error) {
                console.error('API调用错误:', error);
                alert('操作失败: ' + error.message);
                throw error;
            }
        }

        async function loadDashboardData() {
            try {
                const [statusData, urlsData] = await Promise.all([
                    apiCall('/api/config/1/status'),
                    apiCall('/api/config/1/urls')
                ]);

                // 更新统计数据
                document.getElementById('totalUrls').textContent = statusData.total_urls;
                document.getElementById('availableUrls').textContent = statusData.available_urls;
                document.getElementById('totalExecutions').textContent = statusData.total_executions;
                document.getElementById('completedUrls').textContent = statusData.completed_urls;

                // 更新URL列表
                const urlList = document.getElementById('urlList');
                urlList.innerHTML = urlsData.urls.map(url => `
                    <div class="url-item">
                        <div class="url-info">
                            <div class="url-name">${url.name}</div>
                            <div class="url-link">${url.url}</div>
                        </div>
                        <div class="url-stats">
                            <span>${url.current_count}/${url.max_num}</span>
                            <div class="progress">
                                <div class="progress-bar" style="width: ${(url.current_count / url.max_num) * 100}%"></div>
                            </div>
                            ${url.can_execute ? 
                                `<button class="btn btn-primary" onclick="executeUrl(${url.id})">执行</button>` : 
                                `<span class="btn btn-warning">已完成</span>`
                            }
                            <button class="btn btn-danger" onclick="editUrl(${url.id})">编辑</button>
                        </div>
                    </div>
                `).join('');
            } catch (error) {
                console.error('加载数据失败:', error);
            }
        }

        async function executeUrl(urlId) {
            try {
                const result = await apiCall(`/api/url/${urlId}/execute`, { method: 'POST' });
                alert('执行成功: ' + result.message);
                loadDashboardData();
            } catch (error) {
                // 错误已在apiCall中处理
            }
        }

        async function resetAllUrls() {
            if (!confirm('确定要重置所有URL的执行计数吗？')) return;
            
            try {
                const result = await apiCall('/api/config/1/reset', { method: 'POST' });
                alert(result.message);
                loadDashboardData();
            } catch (error) {
                // 错误已在apiCall中处理
            }
        }

        function showAddUrlModal() {
            document.getElementById('addUrlModal').style.display = 'block';
        }

        function hideAddUrlModal() {
            document.getElementById('addUrlModal').style.display = 'none';
        }

        async function addUrl(event) {
            event.preventDefault();
            
            const data = {
                config_id: 1,
                url: document.getElementById('newUrl').value,
                name: document.getElementById('newName').value,
                duration: parseInt(document.getElementById('newDuration').value),
                max_num: parseInt(document.getElementById('newMaxNum').value)
            };

            try {
                const result = await apiCall('/api/url', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                
                alert('URL添加成功!');
                hideAddUrlModal();
                document.querySelector('#addUrlModal form').reset();
                loadDashboardData();
            } catch (error) {
                // 错误已在apiCall中处理
            }
        }

        function refreshData() {
            loadDashboardData();
        }

        // 页面加载时初始化数据
        document.addEventListener('DOMContentLoaded', loadDashboardData);
    </script>
</body>
</html>
'''

# ==================== 认证路由 ====================
@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        user = User.query.filter_by(username=username, is_active=True).first()

        if user and user.check_password(password):
            session['user_id'] = user.id
            user.last_login = datetime.datetime.now()
            db.session.commit()

            flash('登录成功!')
            return redirect(url_for('dashboard'))
        else:
            flash('用户名或密码错误')

    return render_template_string(LOGIN_TEMPLATE)

@app.route('/logout')
def logout():
    session.clear()
    flash('已退出登录')
    return redirect(url_for('login'))

@app.route('/dashboard')
@login_required
def dashboard():
    user = db.session.get(User, session['user_id'])
    return render_template_string(DASHBOARD_TEMPLATE, current_user=user)

@app.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return redirect(url_for('login'))

# ==================== API路由（需要认证） ====================
@app.route('/api/config', methods=['GET'])
@login_required
def get_config():
    """获取配置数据"""
    config_id = request.args.get('config_id', type=int)
    if config_id:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404
        return jsonify(config.to_dict())
    else:
        config = ConfigData.query.filter_by(is_active=True).first()
        if config:
            return jsonify({
                'success_time': [config.success_time_min, config.success_time_max],
                'reset_time': config.reset_time,
                'urldata': [url.to_dict() for url in config.urls if url.is_active]
            })
        return jsonify({'success_time': [5, 10], 'reset_time': 0, 'urldata': []})

@app.route('/api/url', methods=['POST'])
@login_required
def create_url():
    """创建新的URL数据"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required_fields = ['config_id', 'url', 'name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        config = db.session.get(ConfigData, data['config_id'])
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        new_url = UrlData(
            config_id=data['config_id'],
            url=data['url'],
            name=data['name'],
            duration=data.get('duration', 30),
            max_num=data.get('max_num', 3),
            is_active=data.get('is_active', True)
        )

        db.session.add(new_url)
        db.session.commit()

        return jsonify({
            'message': 'URL created successfully',
            'url_data': new_url.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/url/<int:url_id>/execute', methods=['POST'])
@login_required
def execute_url(url_id):
    """执行URL并更新计数"""
    url = db.session.get(UrlData, url_id)
    if not url:
        return jsonify({'error': 'URL not found'}), 404

    if not url.can_execute():
        return jsonify({
            'error': 'URL has reached maximum execution count',
            'current_count': url.current_count,
            'max_num': url.max_num
        }), 400

    if url.execute():
        db.session.commit()
        return jsonify({
            'message': f'Successfully executed {url.name}',
            'url': url.url,
            'current_count': url.current_count,
            'remaining': url.max_num - url.current_count,
            'last_time': url.last_time.isoformat() if url.last_time else None
        })

    return jsonify({'error': 'Failed to execute'}), 500

@app.route('/api/config/<int:config_id>/urls', methods=['GET'])
@login_required
def get_config_urls(config_id):
    """获取配置的所有URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        query = UrlData.query.filter_by(config_id=config_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)

        urls = query.order_by(UrlData.id).all()

        return jsonify({
            'config_id': config_id,
            'urls': [url.to_dict() for url in urls],
            'total': len(urls),
            'active': len([url for url in urls if url.is_active]),
            'available': len([url for url in urls if url.can_execute() and url.is_active])
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/<int:config_id>/status', methods=['GET'])
@login_required
def get_config_status(config_id):
    """获取配置状态统计"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_active=True).all()

        stats = {
            'config': config.to_dict(),
            'total_urls': len(urls),
            'available_urls': len([url for url in urls if url.can_execute()]),
            'completed_urls': len([url for url in urls if url.current_count >= url.max_num]),
            'total_executions': sum(url.current_count for url in urls),
            'max_possible_executions': sum(url.max_num for url in urls)
        }

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/<int:config_id>/reset', methods=['POST'])
@login_required
def reset_config_counts(config_id):
    """重置配置的URL计数"""
    try:
        urls = UrlData.query.filter_by(config_id=config_id).all()
        for url in urls:
            url.current_count = 0
            url.last_time = None
            url.updated_at = datetime.datetime.now()

        db.session.commit()
        return jsonify({'message': f'Reset {len(urls)} URLs successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# ==================== 用户管理API ====================
@app.route('/api/users', methods=['POST'])
@admin_required
def api_create_user():
    """API创建用户 - 需要管理员权限"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 验证必填字段
        required_fields = ['username', 'password']
        for field in required_fields:
            if field not in data or not data[field].strip():
                return jsonify({'error': f'Missing required field: {field}'}), 400

        username = data['username'].strip()
        password = data['password']
        email = data.get('email', '').strip() or None
        is_admin = data.get('is_admin', False)

        # 验证用户名长度
        if len(username) < 3 or len(username) > 80:
            return jsonify({'error': 'Username must be between 3 and 80 characters'}), 400

        # 验证密码强度
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters long'}), 400

        # 检查用户名是否已存在
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            return jsonify({'error': f'Username "{username}" already exists'}), 409

        # 检查邮箱是否已存在（如果提供了邮箱）
        if email:
            existing_email = User.query.filter_by(email=email).first()
            if existing_email:
                return jsonify({'error': f'Email "{email}" already exists'}), 409

        # 创建新用户
        new_user = User(
            username=username,
            password_hash=User.hash_password(password),
            email=email,
            is_admin=is_admin,
            is_active=True
        )

        db.session.add(new_user)
        db.session.commit()

        return jsonify({
            'message': f'User "{username}" created successfully',
            'user': new_user.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users', methods=['GET'])
@admin_required
def api_get_users():
    """获取用户列表 - 需要管理员权限"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '', type=str)

        # 限制每页数量
        per_page = min(per_page, 100)

        query = User.query

        # 搜索功能
        if search:
            query = query.filter(
                User.username.ilike(f'%{search}%') |
                User.email.ilike(f'%{search}%')
            )

        # 分页
        pagination = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )

        users = pagination.items

        return jsonify({
            'users': [user.to_dict() for user in users],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['GET'])
@admin_required
def api_get_user(user_id):
    """获取特定用户信息 - 需要管理员权限"""
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'user': user.to_dict()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['PUT'])
@admin_required
def api_update_user(user_id):
    """更新用户信息 - 需要管理员权限"""
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 防止修改当前登录用户的管理员权限
        current_user_id = session.get('user_id')
        if user_id == current_user_id and 'is_admin' in data and not data['is_admin']:
            return jsonify({'error': 'Cannot remove admin privileges from yourself'}), 403

        # 更新用户名
        if 'username' in data:
            username = data['username'].strip()
            if len(username) < 3 or len(username) > 80:
                return jsonify({'error': 'Username must be between 3 and 80 characters'}), 400

            # 检查用户名是否被其他用户使用
            existing_user = User.query.filter(User.username == username, User.id != user_id).first()
            if existing_user:
                return jsonify({'error': f'Username "{username}" already exists'}), 409

            user.username = username

        # 更新邮箱
        if 'email' in data:
            email = data['email'].strip() or None
            if email:
                # 检查邮箱是否被其他用户使用
                existing_email = User.query.filter(User.email == email, User.id != user_id).first()
                if existing_email:
                    return jsonify({'error': f'Email "{email}" already exists'}), 409

            user.email = email

        # 更新密码
        if 'password' in data and data['password']:
            password = data['password']
            if len(password) < 6:
                return jsonify({'error': 'Password must be at least 6 characters long'}), 400

            user.password_hash = User.hash_password(password)

        # 更新管理员状态
        if 'is_admin' in data:
            user.is_admin = bool(data['is_admin'])

        # 更新激活状态
        if 'is_active' in data:
            # 防止禁用当前登录用户
            if user_id == current_user_id and not data['is_active']:
                return jsonify({'error': 'Cannot deactivate yourself'}), 403

            user.is_active = bool(data['is_active'])

        db.session.commit()

        return jsonify({
            'message': f'User "{user.username}" updated successfully',
            'user': user.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>', methods=['DELETE'])
@admin_required
def api_delete_user(user_id):
    """删除用户 - 需要管理员权限"""
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # 防止删除当前登录用户
        current_user_id = session.get('user_id')
        if user_id == current_user_id:
            return jsonify({'error': 'Cannot delete yourself'}), 403

        username = user.username
        db.session.delete(user)
        db.session.commit()

        return jsonify({
            'message': f'User "{username}" deleted successfully'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/users/<int:user_id>/toggle-status', methods=['POST'])
@admin_required
def api_toggle_user_status(user_id):
    """切换用户激活状态 - 需要管理员权限"""
    try:
        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        # 防止禁用当前登录用户
        current_user_id = session.get('user_id')
        if user_id == current_user_id:
            return jsonify({'error': 'Cannot change your own status'}), 403

        user.is_active = not user.is_active
        status = 'activated' if user.is_active else 'deactivated'

        db.session.commit()

        return jsonify({
            'message': f'User "{user.username}" {status} successfully',
            'user': user.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile', methods=['GET'])
@login_required
def api_get_profile():
    """获取当前用户资料"""
    try:
        user = db.session.get(User, session['user_id'])
        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'user': user.to_dict()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/profile', methods=['PUT'])
@login_required
def api_update_profile():
    """更新当前用户资料"""
    try:
        user = db.session.get(User, session['user_id'])
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 更新邮箱
        if 'email' in data:
            email = data['email'].strip() or None
            if email:
                # 检查邮箱是否被其他用户使用
                existing_email = User.query.filter(User.email == email, User.id != user.id).first()
                if existing_email:
                    return jsonify({'error': f'Email "{email}" already exists'}), 409

            user.email = email

        # 更新密码
        if 'current_password' in data and 'new_password' in data:
            current_password = data['current_password']
            new_password = data['new_password']

            # 验证当前密码
            if not user.check_password(current_password):
                return jsonify({'error': 'Current password is incorrect'}), 400

            # 验证新密码
            if len(new_password) < 6:
                return jsonify({'error': 'New password must be at least 6 characters long'}), 400

            user.password_hash = User.hash_password(new_password)

        db.session.commit()

        return jsonify({
            'message': 'Profile updated successfully',
            'user': user.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

# ==================== 管理员路由 ====================
@app.route('/admin')
@admin_required
def admin_panel():
    """管理员面板"""
    users = User.query.all()
    return render_template_string('''
    <!DOCTYPE html>
    <html>
    <head>
        <title>系统管理</title>
        <meta charset="UTF-8">
        <style>
            body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
            .header { background: #dc3545; color: white; padding: 1rem 2rem; margin: -20px -20px 20px; display: flex; justify-content: space-between; align-items: center; }
            .container { max-width: 1000px; margin: 0 auto; }
            .card { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 2rem; }
            .btn { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 0.25rem; }
            .btn-primary { background: #007bff; color: white; }
            .btn-success { background: #28a745; color: white; }
            .btn-danger { background: #dc3545; color: white; }
            table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
            th, td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #ddd; }
            th { background: #f8f9fa; }
            .form-group { margin-bottom: 1rem; }
            label { display: block; margin-bottom: 0.5rem; color: #555; }
            input, select { width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>系统管理</h1>
            <a href="{{ url_for('dashboard') }}" class="btn btn-primary">返回仪表板</a>
        </div>
        
        <div class="container">
            <div class="card">
                <h2>创建用户</h2>
                <form method="POST" action="{{ url_for('create_user') }}">
                    <div class="form-group">
                        <label>用户名:</label>
                        <input type="text" name="username" required>
                    </div>
                    <div class="form-group">
                        <label>密码:</label>
                        <input type="password" name="password" required>
                    </div>
                    <div class="form-group">
                        <label>邮箱:</label>
                        <input type="email" name="email">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" name="is_admin"> 管理员权限
                        </label>
                    </div>
                    <button type="submit" class="btn btn-success">创建用户</button>
                </form>
            </div>
            
            <div class="card">
                <h2>用户管理</h2>
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>用户名</th>
                            <th>邮箱</th>
                            <th>管理员</th>
                            <th>状态</th>
                            <th>最后登录</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        {% for user in users %}
                        <tr>
                            <td>{{ user.id }}</td>
                            <td>{{ user.username }}</td>
                            <td>{{ user.email or '-' }}</td>
                            <td>{{ '是' if user.is_admin else '否' }}</td>
                            <td>{{ '激活' if user.is_active else '禁用' }}</td>
                            <td>{{ user.last_login.strftime('%Y-%m-%d %H:%M') if user.last_login else '从未' }}</td>
                            <td>
                                {% if user.id != session.user_id %}
                                    <a href="{{ url_for('toggle_user_status', user_id=user.id) }}" 
                                       class="btn btn-warning">
                                       {{ '禁用' if user.is_active else '激活' }}
                                    </a>
                                    <a href="{{ url_for('delete_user', user_id=user.id) }}" 
                                       class="btn btn-danger"
                                       onclick="return confirm('确定删除用户 {{ user.username }} 吗？')">
                                       删除
                                    </a>
                                {% endif %}
                            </td>
                        </tr>
                        {% endfor %}
                    </tbody>
                </table>
            </div>
        </div>
    </body>
    </html>
    ''', users=users, session=session)

@app.route('/admin/create-user', methods=['POST'])
@admin_required
def create_user():
    """创建新用户"""
    try:
        username = request.form['username']
        password = request.form['password']
        email = request.form.get('email')
        is_admin = 'is_admin' in request.form

        # 检查用户名是否已存在
        if User.query.filter_by(username=username).first():
            flash('用户名已存在')
            return redirect(url_for('admin_panel'))

        user = User(
            username=username,
            password_hash=User.hash_password(password),
            email=email,
            is_admin=is_admin
        )

        db.session.add(user)
        db.session.commit()

        flash(f'用户 {username} 创建成功')
    except Exception as e:
        db.session.rollback()
        flash(f'创建用户失败: {str(e)}')

    return redirect(url_for('admin_panel'))

@app.route('/admin/toggle-user/<int:user_id>')
@admin_required
def toggle_user_status(user_id):
    """切换用户状态"""
    try:
        user = db.session.get(User, user_id)
        if user and user.id != session['user_id']:
            user.is_active = not user.is_active
            db.session.commit()
            flash(f'用户 {user.username} 已{"激活" if user.is_active else "禁用"}')
        else:
            flash('无法操作当前用户')
    except Exception as e:
        db.session.rollback()
        flash(f'操作失败: {str(e)}')

    return redirect(url_for('admin_panel'))

@app.route('/admin/delete-user/<int:user_id>')
@admin_required
def delete_user(user_id):
    """删除用户"""
    try:
        user = db.session.get(User, user_id)
        if user and user.id != session['user_id']:
            username = user.username
            db.session.delete(user)
            db.session.commit()
            flash(f'用户 {username} 已删除')
        else:
            flash('无法删除当前用户')
    except Exception as e:
        db.session.rollback()
        flash(f'删除失败: {str(e)}')

    return redirect(url_for('admin_panel'))

# ==================== 初始化函数 ====================
def init_database():
    """初始化数据库和默认用户"""
    try:
        db.create_all()

        # 创建默认管理员用户
        admin_user = User.query.filter_by(username='admin').first()
        if not admin_user:
            admin_user = User(
                username='admin',
                password_hash=User.hash_password('admin123'),
                email='admin@example.com',
                is_admin=True
            )
            db.session.add(admin_user)
            print("创建默认管理员用户: admin / admin123")

        # 创建默认配置
        config = ConfigData.query.first()
        if not config:
            config = ConfigData(
                success_time_min=5,
                success_time_max=10,
                reset_time=0,
                description='默认配置数据'
            )
            db.session.add(config)
            db.session.flush()

        # 创建示例URL数据
        if UrlData.query.count() == 0:
            telegram_urls = [
                {'url': 'https://t.me/baolidb', 'name': '保利担保', 'duration': 30, 'max_num': 3},
                {'url': 'https://t.me/zhonghua2014tianxiang', 'name': '中华天象', 'duration': 30, 'max_num': 3},
                {'url': 'https://t.me/lianheshequ424', 'name': '联合社区', 'duration': 30, 'max_num': 3},
                {'url': 'https://t.me/make_friends1', 'name': 'make_friends', 'duration': 30, 'max_num': 3}
            ]

            for url_data in telegram_urls:
                url = UrlData(
                    config_id=config.id,
                    **url_data
                )
                db.session.add(url)

        db.session.commit()
        print("数据库初始化完成!")
        return True

    except Exception as e:
        print(f"初始化数据库时出错: {e}")
        db.session.rollback()
        return False

if __name__ == '__main__':
    with app.app_context():
        if init_database():
            print("📍 访问地址: http://localhost:5000")
        app.run(debug=True, host='0.0.0.0', port=5000)