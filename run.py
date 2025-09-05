from app import create_app, db
from app.models import User, ConfigData, UrlData

app = create_app()

def init_database():
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

            # 创建默认机器配置
            existing_configs = ConfigData.query.count()
            if existing_configs == 0:
                machines = [
                    {
                        'message': '主服务器',
                        'pade_code': 'AC32010960163',
                        'description': '主要业务服务器',
                        'success_time_min': 5,
                        'success_time_max': 10,
                        'reset_time': 0
                    },
                    {
                        'message': '备用服务器',
                        'pade_code': 'AC32010960164',
                        'description': '备用业务服务器',
                        'success_time_min': 6,
                        'success_time_max': 12,
                        'reset_time': 0
                    },
                    {
                        'message': '测试服务器',
                        'pade_code': 'AC32010960165',
                        'description': '测试环境服务器',
                        'success_time_min': 3,
                        'success_time_max': 8,
                        'reset_time': 0
                    }
                ]

                config_ids = []
                for machine_data in machines:
                    config = ConfigData(**machine_data, is_active=True)
                    db.session.add(config)
                    db.session.flush()  # 获取ID
                    config_ids.append(config.id)
                    print(f"创建机器配置: {machine_data['message']} ({machine_data['pade_code']})")

                telegram_urls = [
                    {'url': 'https://t.me/baolidb', 'name': '保利担保', 'duration': 30, 'max_num': 3},
                    {'url': 'https://t.me/zhonghua2014tianxiang', 'name': '中华天象', 'duration': 30, 'max_num': 3},
                    {'url': 'https://t.me/lianheshequ424', 'name': '联合社区', 'duration': 30, 'max_num': 3},
                    {'url': 'https://t.me/make_friends1', 'name': 'make_friends', 'duration': 30, 'max_num': 3}
                ]

                # 为主服务器添加所有URL
                for url_data in telegram_urls:
                    url = UrlData(
                        config_id=config_ids[0],
                        **url_data
                    )
                    db.session.add(url)

                # 为备用服务器添加部分URL
                for url_data in telegram_urls[:2]:
                    url = UrlData(
                        config_id=config_ids[1],
                        **url_data
                    )
                    db.session.add(url)

                # 为测试服务器添加一个测试URL
                test_url = UrlData(
                    config_id=config_ids[2],
                    url='https://t.me/test_channel',
                    name='测试频道',
                    duration=15,
                    max_num=1
                )
                db.session.add(test_url)

                print(f"为 {len(config_ids)} 台机器创建了URL配置")

            db.session.commit()
            print("数据库初始化完成!")

            # 显示统计信息
            machine_count = ConfigData.query.count()
            url_count = UrlData.query.count()
            user_count = User.query.count()

            print(f"系统统计: {machine_count} 台机器, {url_count} 个URL, {user_count} 个用户")
            return True

    except Exception as e:
        print(f"初始化数据库时出错: {e}")
        db.session.rollback()
        return False

if __name__ == '__main__':
    if init_database():
        print("访问地址: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)