import datetime
import json
import os

from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

app = Flask(__name__)

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:1332@localhost:5432/postgres')
app.config['SQLALCHEMY_DATABASE_URI'] = DATABASE_URL
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 初始化数据库
db = SQLAlchemy(app)

# 定义用户模型
class ConfigData(db.Model):
    __tablename__ = 'config_data'

    id = db.Column(db.Integer, primary_key=True)
    success_time_min = db.Column(db.Integer, nullable=False, default=5)
    success_time_max = db.Column(db.Integer, nullable=False, default=10)
    reset_time = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now(), onupdate=datetime.datetime.now())
    is_active = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text)
    # extra_config = db.Column(JSONB, default={})  # 如果需要的话取消注释

    # 关联关系
    urls = db.relationship('UrlData', backref='config', cascade='all, delete-orphan')

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
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now(), onupdate=datetime.datetime.now())

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

    @property
    def is_telegram_url(self):
        """检查是否为 Telegram URL"""
        return self.url.startswith('https://t.me/')

    @property
    def telegram_username(self):
        """提取 Telegram 用户名/频道名"""
        if self.is_telegram_url:
            return self.url.replace('https://t.me/', '')
        return None

    def can_execute(self):
        """检查是否还能执行"""
        return self.current_count < self.max_num

    def execute(self):
        """执行并更新计数"""
        if self.can_execute():
            self.current_count += 1
            self.last_time = datetime.datetime.now()
            self.updated_at = datetime.datetime.now()
            return True
        return False

# 调用数据库中的函数（修正版本）
def get_config_json(config_id=None):
    """调用数据库中的 get_config_json 函数"""
    try:
        if config_id:
            result = db.session.execute(
                text("SELECT get_config_json(:config_id)"),
                {'config_id': config_id}
            ).scalar()
        else:
            result = db.session.execute(text("SELECT get_config_json()")).scalar()

        return result
    except Exception as E:
        print(f"数据库函数调用错误: {E}")
        # 如果数据库函数不存在，使用ORM方式作为fallback
        return get_config_json_orm(config_id)

def get_config_json_orm(config_id=None):
    """使用ORM方式获取配置数据（fallback）"""
    try:
        if config_id:
            config = ConfigData.query.filter_by(id=config_id, is_active=True).first()
        else:
            config = ConfigData.query.filter_by(is_active=True).first()

        if config:
            return {
                'success_time': [config.success_time_min, config.success_time_max],
                'reset_time': config.reset_time,
                'urldata': [url.to_dict() for url in config.urls if url.is_active]
            }
        else:
            return {'success_time': [5, 10], 'reset_time': 0, 'urldata': []}
    except Exception as e:
        print(f"ORM查询错误: {e}")
        return {'success_time': [5, 10], 'reset_time': 0, 'urldata': []}

def update_url_execution(url_id):
    """调用数据库中的 update_url_execution 函数"""
    try:
        db.session.execute(
            text("SELECT update_url_execution(:url_id)"),
            {'url_id': url_id}
        )
        db.session.commit()
        return True
    except Exception as E:
        print(f"数据库函数调用错误: {E}")
        db.session.rollback()
        # 使用ORM方式作为fallback
        try:
            url = UrlData.query.get(url_id)
            if url and url.execute():
                db.session.commit()
                return True
        except Exception as orm_error:
            print(f"ORM更新错误: {orm_error}")
            db.session.rollback()
        return False

def reset_url_counts(config_id=None):
    """调用数据库中的 reset_url_counts 函数"""
    try:
        if config_id:
            db.session.execute(
                text("SELECT reset_url_counts(:config_id)"),
                {'config_id': config_id}
            )
        else:
            db.session.execute(text("SELECT reset_url_counts()"))
        db.session.commit()
        return True
    except Exception as E:
        print(f"数据库函数调用错误: {E}")
        db.session.rollback()
        # 使用ORM方式作为fallback
        try:
            query = UrlData.query
            if config_id:
                query = query.filter_by(config_id=config_id)

            query.update({
                'current_count': 0,
                'last_time': None,
                'updated_at': datetime.datetime.now()
            })
            db.session.commit()
            return True
        except Exception as orm_error:
            print(f"ORM重置错误: {orm_error}")
            db.session.rollback()
            return False

# 使用视图查询（修正版本）
def get_config_with_urls():
    """查询 config_with_urls 视图"""
    try:
        result = db.session.execute(text("""
                                            SELECT config_id, success_time_min, success_time_max,
                                                reset_time, description, urldata::text
                                            FROM config_with_urls
                                            ORDER BY config_id
                                            """)).fetchall()

        configs = []
        for row in result:
            config = {
                'config_id': row[0],
                'success_time': [row[1], row[2]],
                'reset_time': row[3],
                'description': row[4],
                'urldata': json.loads(row[5]) if row[5] else []
            }
            configs.append(config)

        return configs
    except Exception as e:
        print(f"视图查询错误: {e}")
        # 使用ORM方式作为fallback
        try:
            configs = ConfigData.query.filter_by(is_active=True).all()
            return [config.to_dict() for config in configs]
        except Exception as orm_error:
            print(f"ORM查询错误: {orm_error}")
            return []

def init_sample_data():
    """初始化示例数据"""
    try:
        # 检查是否已有配置
        config = ConfigData.query.first()
        if not config:
            config = ConfigData(
                success_time_min=5,
                success_time_max=10,
                reset_time=0,
                description='默认配置数据'
            )
            db.session.add(config)
            db.session.flush()  # 获取ID但不提交

        # 检查是否已有URL数据
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
        print("示例数据初始化完成!")
        return True
    except Exception as e:
        print(f"初始化数据时出错: {e}")
        db.session.rollback()
        return False

# API路由
@app.route('/')
def index():
    """首页"""
    return jsonify({
        'message': 'Flask Message Manager API',
        'status': 'running',
        'endpoints': {
            'config': '/api/config',
            'config_full': '/api/config/full',
            'config_by_id': '/api/config/{id}',
            'create_config': 'POST /api/config',
            'execute_url': 'POST /api/url/{id}/execute',
            'reset_config': 'POST /api/config/{id}/reset',
            'update_extra': 'PUT /api/config/{id}/extra',
            'search_configs': '/api/configs/search',
            'telegram_channels': '/api/config/{id}/telegram',
            'available_urls': '/api/urls/available',
            'config_status': '/api/config/{id}/status',
            'url_management': {
                'create_url': 'POST /api/url',
                'get_url': 'GET /api/url/{id}',
                'update_url': 'PUT /api/url/{id}',
                'delete_url': 'DELETE /api/url/{id}',
                'reset_url': 'POST /api/url/{id}/reset',
                'get_config_urls': 'GET /api/config/{id}/urls',
                'batch_create': 'POST /api/config/{id}/urls/batch'
            }
        }
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    """获取配置数据"""
    config_id = request.args.get('config_id', type=int)
    config_json = get_config_json(config_id)
    return jsonify(config_json)

@app.route('/api/config/full', methods=['GET'])
def get_config_full():
    """获取完整配置数据（使用视图）"""
    configs = get_config_with_urls()
    return jsonify(configs)

@app.route('/api/config/<int:config_id>', methods=['GET'])
def get_config_by_id(config_id):
    """通过ORM获取特定配置"""
    config = ConfigData.query.filter_by(id=config_id, is_active=True).first()
    if not config:
        return jsonify({'error': 'Config not found'}), 404

    return jsonify(config.to_dict())

@app.route('/api/config', methods=['POST'])
def create_config():
    """创建新配置"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        config = ConfigData(
            success_time_min=data.get('success_time_min', 5),
            success_time_max=data.get('success_time_max', 10),
            reset_time=data.get('reset_time', 0),
            description=data.get('description')
        )

        # 如果有URL数据
        if 'urldata' in data:
            for url_data in data['urldata']:
                url = UrlData(
                    url=url_data['url'],
                    name=url_data['name'],
                    duration=url_data.get('duration', 30),
                    max_num=url_data.get('max_num', 3)
                )
                config.urls.append(url)

        db.session.add(config)
        db.session.commit()

        return jsonify(config.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/url/<int:url_id>/execute', methods=['POST'])
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

    # 使用数据库函数或ORM更新
    success = update_url_execution(url_id)

    if success:
        # 重新获取更新后的数据

        url = db.session.get(UrlData, url_id)
        return jsonify({
            'message': f'Successfully executed {url.name}',
            'url': url.url,
            'current_count': url.current_count,
            'remaining': url.max_num - url.current_count,
            'last_time': url.last_time.isoformat() if url.last_time else None
        })
    else:
        return jsonify({'error': 'Failed to update URL execution'}), 500

@app.route('/api/config/<int:config_id>/reset', methods=['POST'])
def reset_config_counts(config_id):
    """重置配置的URL计数"""
    success = reset_url_counts(config_id)
    if success:
        return jsonify({'message': 'Counts reset successfully'})
    else:
        return jsonify({'error': 'Failed to reset counts'}), 500

@app.route('/api/config/<int:config_id>/extra', methods=['PUT'])
def update_config_extra(config_id):
    """更新配置的额外JSON数据"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        config = ConfigData.query.get(config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        # 使用description字段存储JSON（如果没有extra_config字段）
        if config.description:
            try:
                desc_data = json.loads(config.description)
                desc_data.update(data)
                config.description = json.dumps(desc_data, ensure_ascii=False)
            except json.JSONDecodeError:
                config.description = json.dumps(data, ensure_ascii=False)
        else:
            config.description = json.dumps(data, ensure_ascii=False)

        db.session.commit()
        return jsonify(config.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/configs/search', methods=['GET'])
def search_configs():
    """根据字段搜索配置"""
    try:
        description = request.args.get('description')

        query = ConfigData.query.filter_by(is_active=True)

        if description:
            query = query.filter(ConfigData.description.ilike(f'%{description}%'))

        configs = query.all()
        return jsonify([config.to_dict() for config in configs])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/<int:config_id>/telegram', methods=['GET'])
def get_telegram_channels(config_id):
    """获取所有Telegram频道"""
    try:
        channels = UrlData.query.filter(
            UrlData.config_id == config_id,
            UrlData.is_active == True,
            UrlData.url.like('https://t.me/%')
        ).all()

        return jsonify({
            'telegram_channels': [
                {
                    **url.to_dict(),
                    'telegram_username': url.telegram_username
                } for url in channels
            ],
            'count': len(channels)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/urls/available', methods=['GET'])
def get_available_urls():
    """获取所有可执行的URL"""
    try:
        config_id = request.args.get('config_id', 1, type=int)

        urls = UrlData.query.filter(
            UrlData.config_id == config_id,
            UrlData.is_active == True,
            UrlData.current_count < UrlData.max_num
        ).order_by(UrlData.current_count.asc()).all()

        return jsonify({
            'available_urls': [url.to_dict() for url in urls],
            'count': len(urls)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/<int:config_id>/status', methods=['GET'])
def get_config_status(config_id):
    """获取配置状态统计"""
    try:
        config = ConfigData.query.get(config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_active=True).all()

        stats = {
            'config': config.to_dict(),
            'total_urls': len(urls),
            'available_urls': len([url for url in urls if url.can_execute()]),
            'completed_urls': len([url for url in urls if url.current_count >= url.max_num]),
            'total_executions': sum(url.current_count for url in urls),
            'max_possible_executions': sum(url.max_num for url in urls),
            'execution_progress': {
                url.name: {
                    'current': url.current_count,
                    'max': url.max_num,
                    'percentage': (url.current_count / url.max_num * 100) if url.max_num > 0 else 0,
                    'last_time': url.last_time.isoformat() if url.last_time else None
                } for url in urls
            }
        }

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== 新增的URL管理API ====================

@app.route('/api/url', methods=['POST'])
def create_url():
    """创建新的URL数据"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 验证必填字段
        required_fields = ['config_id', 'url', 'name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # 检查config_id是否存在
        config = db.session.get(ConfigData, data['config_id'])
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        # 创建新URL
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

@app.route('/api/url/<int:url_id>', methods=['PUT'])
def update_url(url_id):
    """更新URL数据"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        # 更新字段
        if 'url' in data:
            url.url = data['url']
        if 'name' in data:
            url.name = data['name']
        if 'duration' in data:
            url.duration = data['duration']
        if 'max_num' in data:
            url.max_num = data['max_num']
        if 'is_active' in data:
            url.is_active = data['is_active']
        if 'current_count' in data:
            url.current_count = data['current_count']

        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': 'URL updated successfully',
            'url_data': url.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/url/<int:url_id>', methods=['DELETE'])
def delete_url(url_id):
    """删除URL数据（软删除）"""
    try:
        url = UrlData.query.get(url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        # 软删除：设置is_active为False
        url.is_active = False
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({'message': f'URL {url.name} deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/url/<int:url_id>', methods=['GET'])
def get_url_by_id(url_id):
    """获取特定URL的详细信息"""
    try:
        url = UrlData.query.get(url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        return jsonify(url.to_dict())
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/config/<int:config_id>/urls', methods=['GET'])
def get_config_urls(config_id):
    """获取配置的所有URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        # 获取查询参数
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
        url_type = request.args.get('type')  # 'telegram' 或 'all'

        query = UrlData.query.filter_by(config_id=config_id)

        if not include_inactive:
            query = query.filter_by(is_active=True)

        if url_type == 'telegram':
            query = query.filter(UrlData.url.like('https://t.me/%'))

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

@app.route('/api/config/<int:config_id>/urls/batch', methods=['POST'])
def batch_create_urls(config_id):
    """批量创建URL"""
    try:
        data = request.json
        if not data or 'urls' not in data:
            return jsonify({'error': 'No URLs data provided'}), 400

        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        created_urls = []
        errors = []

        for i, url_data in enumerate(data['urls']):
            try:
                # 验证必填字段
                if 'url' not in url_data or 'name' not in url_data:
                    errors.append(f'URL {i+1}: Missing url or name')
                    continue

                new_url = UrlData(
                    config_id=config_id,
                    url=url_data['url'],
                    name=url_data['name'],
                    duration=url_data.get('duration', 30),
                    max_num=url_data.get('max_num', 3),
                    is_active=url_data.get('is_active', True)
                )

                db.session.add(new_url)
                created_urls.append(url_data['name'])
            except Exception as e:
                errors.append(f'URL {i+1}: {str(e)}')

        db.session.commit()

        result = {
            'message': f'Created {len(created_urls)} URLs',
            'created': created_urls
        }

        if errors:
            result['errors'] = errors

        return jsonify(result), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@app.route('/api/url/<int:url_id>/reset', methods=['POST'])
def reset_single_url(url_id):
    """重置单个URL的执行计数"""
    try:
        url = UrlData.query.get(url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        url.current_count = 0
        url.last_time = None
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'Reset count for {url.name}',
            'url_data': url.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    with app.app_context():
        try:
            # 创建表（如果不存在）
            db.create_all()
            print("数据库表创建成功!")

            # 初始化示例数据
            init_sample_data()

            # 测试配置数据获取
            config_data = get_config_json()
            print("配置数据获取成功:", config_data)

            print("\n可用API端点:")
            print("=== 基础配置API ===")
            print("- GET / - API文档和状态")
            print("- GET /api/config - 获取配置数据")
            print("- GET /api/config/full - 获取完整配置（视图）")
            print("- GET /api/config/{id} - 获取特定配置")
            print("- POST /api/config - 创建新配置")
            print("- POST /api/url/{id}/execute - 执行特定URL")
            print("- POST /api/config/{id}/reset - 重置计数")
            print("- PUT /api/config/{id}/extra - 更新额外配置")
            print("- GET /api/configs/search - 搜索配置")
            print("- GET /api/config/{id}/telegram - 获取Telegram频道")
            print("- GET /api/urls/available - 获取可执行的URL")
            print("- GET /api/config/{id}/status - 获取状态统计")
            print("\n=== URL数据管理API ===")
            print("- POST /api/url - 创建新URL")
            print("- GET /api/url/{id} - 获取URL详情")
            print("- PUT /api/url/{id} - 更新URL")
            print("- DELETE /api/url/{id} - 删除URL（软删除）")
            print("- POST /api/url/{id}/reset - 重置单个URL计数")
            print("- GET /api/config/{id}/urls - 获取配置的所有URL")
            print("- POST /api/config/{id}/urls/batch - 批量创建URL")

        except Exception as e:
            print(f"初始化时出错: {e}")

    app.run(debug=True, host='0.0.0.0', port=5000)