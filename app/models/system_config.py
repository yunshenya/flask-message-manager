import datetime
import os
from typing import Dict, Any

from app import db


class SystemConfig(db.Model):
    __tablename__ = 'system_configs'

    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), unique=True, nullable=False)
    value = db.Column(db.Text)
    description = db.Column(db.Text)
    category = db.Column(db.String(50), nullable=False, default='general')
    is_sensitive = db.Column(db.Boolean, default=False)  # 敏感信息标记
    created_at = db.Column(db.DateTime, default=datetime.datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now)

    def to_dict(self):
        return {
            'id': self.id,
            'key': self.key,
            'value': self.value if not self.is_sensitive else '***HIDDEN***',
            'description': self.description,
            'category': self.category,
            'is_sensitive': self.is_sensitive,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }

    @classmethod
    def get_config(cls, key: str, default=None):
        """获取配置值"""
        config = cls.query.filter_by(key=key).first()
        return config.value if config else default

    @classmethod
    def set_config(cls, key: str, value: str, description: str = '', category: str = 'general', is_sensitive: bool = False):
        """设置配置值"""
        config = cls.query.filter_by(key=key).first()
        if config:
            config.value = value
            config.description = description
            config.category = category
            config.is_sensitive = is_sensitive
            config.updated_at = datetime.datetime.now()
        else:
            config = cls(
                key=key,
                value=value,
                description=description,
                category=category,
                is_sensitive=is_sensitive
            )
            db.session.add(config)
        return config

    @classmethod
    def initialize_default_configs(cls):
        """初始化默认配置"""
        default_configs = [
            # 数据库配置
            {
                'key': 'DATABASE_URL',
                'value': os.getenv('DATABASE_URL', 'postgresql://postgres:1332@localhost:5432/postgres'),
                'description': 'PostgreSQL数据库连接URL',
                'category': 'database',
                'is_sensitive': True
            },
            {
                'key': 'SQLALCHEMY_TRACK_MODIFICATIONS',
                'value': os.getenv('SQLALCHEMY_TRACK_MODIFICATIONS', 'false'),
                'description': '是否跟踪SQLAlchemy对象修改',
                'category': 'database',
                'is_sensitive': False
            },

            # 安全配置
            {
                'key': 'SECRET_KEY',
                'value': os.getenv('SECRET_KEY', '1234567'),
                'description': 'Flask应用密钥，用于会话加密',
                'category': 'security',
                'is_sensitive': True
            },
            {
                'key': 'API_SECRET_TOKEN',
                'value': os.getenv('API_SECRET_TOKEN', ''),
                'description': 'API访问密钥',
                'category': 'security',
                'is_sensitive': True
            },

            # 应用配置
            {
                'key': 'PKG_NAME',
                'value': os.getenv('PKG_NAME', ''),
                'description': 'Android应用包名',
                'category': 'app',
                'is_sensitive': False
            },
            {
                'key': 'TG_PKG_NAME',
                'value': os.getenv('TG_PKG_NAME', ''),
                'description': 'Telegram应用包名',
                'category': 'app',
                'is_sensitive': False
            },
            {
                'key': 'DEBUG',
                'value': os.getenv('DEBUG', 'false'),
                'description': '是否启用调试模式',
                'category': 'app',
                'is_sensitive': False
            },

            # VMOS配置
            {
                'key': 'ACCESS_KEY',
                'value': os.getenv('ACCESS_KEY', ''),
                'description': 'VMOS API访问密钥',
                'category': 'vmos',
                'is_sensitive': True
            },
            {
                'key': 'SECRET_ACCESS',
                'value': os.getenv('SECRET_ACCESS', ''),
                'description': 'VMOS API密钥',
                'category': 'vmos',
                'is_sensitive': True
            }
        ]

        for config_data in default_configs:
            existing = cls.query.filter_by(key=config_data['key']).first()
            if not existing:
                cls.set_config(**config_data)

    @classmethod
    def export_to_env_format(cls) -> str:
        """导出为.env格式"""
        configs = cls.query.order_by(cls.category, cls.key).all()

        env_content = []
        current_category = None

        for config in configs:
            if current_category != config.category:
                if current_category is not None:
                    env_content.append('')
                env_content.append(f'# {config.category.upper()} 配置')
                current_category = config.category

            if config.description:
                env_content.append(f'# {config.description}')

            env_content.append(f'{config.key}={config.value}')
            env_content.append('')

        return '\n'.join(env_content)

    @classmethod
    def get_configs_by_category(cls) -> Dict[str, Any]:
        """按分类获取配置"""
        configs = cls.query.order_by(cls.category, cls.key).all()
        result = {}

        for config in configs:
            if config.category not in result:
                result[config.category] = []
            result[config.category].append(config.to_dict())

        return result