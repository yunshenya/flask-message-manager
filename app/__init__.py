from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_socketio import SocketIO
from app.config import Config

db = SQLAlchemy()
migrate = Migrate()
socketio = SocketIO()

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    db.init_app(app)
    migrate.init_app(app, db)

    # 修改 SocketIO 配置，解决升级问题
    socketio.init_app(app,
                        cors_allowed_origins="*",
                        async_mode='eventlet',  # 指定异步模式
                        logger=True,            # 启用日志
                        engineio_logger=True,   # 启用引擎日志
                        ping_timeout=60,        # 增加超时时间
                        ping_interval=25,       # 设置心跳间隔
                        transports=['websocket', 'polling']  # 明确指定传输方式
                        )

    from app.main import bp as main_bp
    app.register_blueprint(main_bp)

    from app.auth import bp as auth_bp
    app.register_blueprint(auth_bp, url_prefix='/auth')

    from app.api import bp as api_bp
    app.register_blueprint(api_bp, url_prefix='/api')

    from app.admin import bp as admin_bp
    app.register_blueprint(admin_bp, url_prefix='/admin')

    return app

from app import models