from flask import Flask
from flask_migrate import Migrate
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy

from app.config import Config
from app.utils.dynamic_config import register_default_watchers

db = SQLAlchemy()
migrate = Migrate()
socketio = SocketIO()


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    socketio.init_app(app,
                      cors_allowed_origins="*",
                      async_mode='eventlet',
                      logger=False,
                      engineio_logger=False,
                      ping_timeout=30,      # 减少ping超时时间
                      ping_interval=10,     # 减少ping间隔
                      transports=['websocket', 'polling'],
                      max_http_buffer_size=1e6,
                      # 添加以下配置以提高性能
                      compression=True,     # 启用压缩
                      cookie=False,         # 禁用cookie（减少开销）
                      )

    from app.services.cleanup_scheduler import cleanup_scheduler
    cleanup_scheduler.init_app(app)

    from app.main import bp as main_bp
    app.register_blueprint(main_bp)

    from app.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    from app.api import bp as api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    from app.admin import bp as admin_bp
    app.register_blueprint(admin_bp, url_prefix='/admin')

    # 初始化动态配置管理器
    with app.app_context():
        try:
            register_default_watchers()
        except ImportError:
            pass  # 如果动态配置不可用，继续使用静态配置

    return app


from app import models