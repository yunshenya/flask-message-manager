import os
from dotenv import load_dotenv

basedir = os.path.abspath(os.path.dirname(__file__))
load_dotenv(os.path.join(basedir, '..', '.env'))


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or '1234567'
    DATABASE_URL = os.environ.get('DATABASE_URL') or \
                   'postgresql://postgres:1332@localhost:5432/postgres'
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS_str = os.getenv('SQLALCHEMY_TRACK_MODIFICATIONS')
    SQLALCHEMY_TRACK_MODIFICATIONS = SQLALCHEMY_TRACK_MODIFICATIONS_str.lower() == 'true' if SQLALCHEMY_TRACK_MODIFICATIONS_str else False
    PKG_NAME = os.environ.get('PKG_NAME')
    TG_PKG_NAME = os.environ.get('TG_PKG_NAME')
    API_SECRET_TOKEN = os.getenv("API_SECRET_TOKEN")
    DEBUG_str = os.getenv('DEBUG')
    DEBUG = DEBUG_str.lower() == 'true' if DEBUG_str else False
    ACCESS_KEY = os.getenv('ACCESS_KEY')
    SECRET_ACCESS = os.getenv('SECRET_ACCESS')
    success_time_min = os.getenv('SUCCESS_TIME_MIN')
    success_time_max = os.getenv('SUCCESS_TIME_MAX')
    reset_time = os.getenv('RESET_TIME')

    @classmethod
    def get_dynamic_config(cls, key: str, default=None):
        """获取动态配置，优先从动态配置管理器获取"""
        try:
            from app.utils.dynamic_config import get_dynamic_config
            return get_dynamic_config(key, default)
        except ImportError:
            # 降级到静态配置
            return getattr(cls, key, default)

    @classmethod
    def update_dynamic_config(cls, key: str, value):
        """更新动态配置"""
        try:
            from app.utils.dynamic_config import set_dynamic_config
            set_dynamic_config(key, value)
            # 同时更新类属性（向后兼容）
            setattr(cls, key, value)
        except ImportError:
            # 降级到静态配置
            setattr(cls, key, value)