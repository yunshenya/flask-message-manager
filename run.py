from app import create_app, db
from app.models import User, ConfigData, UrlData

app = create_app()

def init_database():
    """初始化数据库和默认用户"""
    try:
        with app.app_context():
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
                    message = "哈咯----签到",
                    success_time_min=5,
                    success_time_max=10,
                    reset_time=0,
                    description='默认配置数据',
                    pade_code='AC32010960163',

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
    if init_database():
        print("📍 访问地址: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)