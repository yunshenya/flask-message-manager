from typing import Any

from app import create_app, db
from app.models import User, ConfigData, UrlData
from app.utils.vmos import get_phone_list
from waitress import serve

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

            existing_configs = ConfigData.query.count()
            data_list: Any = get_phone_list()["data"]
            machines = []
            if existing_configs == 0:
                for data in data_list:
                    machines.append(
                        {
                            'message': '哈咯----签到',
                            'pade_code': data['padCode'],
                            'description': f'{data["goodName"]}',
                            'success_time_min': 5,
                            'success_time_max': 10,
                            'reset_time': 0,
                            'name': data['padName'],
                        }
                    )
                config_ids = []
                for machine_data in machines:
                    config = ConfigData(**machine_data, is_active=True)
                    db.session.add(config)
                    db.session.flush()  # 获取ID
                    config_ids.append(config.id)
                    print(f"创建机器配置: {machine_data['name']} ({machine_data['pade_code']})")

                telegram_urls = [
                    {'url': 'https://t.me/baolidb', 'name': '保利担保', 'duration': 30, 'max_num': 3},
                    {'url': 'https://t.me/zhonghua2014tianxiang', 'name': '中华天象', 'duration': 30, 'max_num': 3},
                    {'url': 'https://t.me/lianheshequ424', 'name': '联合社区', 'duration': 30, 'max_num': 3},
                    {'url': 'https://t.me/make_friends1', 'name': 'make_friends', 'duration': 30, 'max_num': 3}
                ]

                for ids in config_ids:
                    for url_data in telegram_urls:
                        url = UrlData(
                            config_id=ids,
                            **url_data
                        )
                        db.session.add(url)

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
    serve(app, host='0.0.0.0', port=5000)