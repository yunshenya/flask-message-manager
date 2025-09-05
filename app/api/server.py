import datetime

from flask import jsonify, request
from loguru import logger

from app import Config, db
from app.api import bp
from app.auth.decorators import login_required, token_required
from app.models import UrlData, ConfigData
from app.utils.vmos import stop_app, start_app


@bp.route("/callback", methods=["POST"])
def callback_v2():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Invalid JSON data"}), 400
    task_business_type = data.get("taskBusinessType")
    try:
        task_type = int(task_business_type)
    except (ValueError, TypeError):
        logger.info(f"其他接口回调: {data}")
        return "ok"
    handlers = {
        1000: lambda: print("xxx"),
        1002: lambda: print("xxx"),
        1003: lambda: print("xxx"),
        1004: lambda: print("xxx"),
        1006: lambda: print("xxx"),
        1007: lambda: print("xxx"),
        1009: lambda: print("xxx"),
        1124: lambda: print("xxx")
    }

    handler = handlers.get(task_type)
    if handler:
        handler()
    else:
        logger.info(f"其他接口回调: {data}")

    return "ok"


@bp.route("/stop", methods=["post"])
@login_required
def stop():
    data = request.get_json()
    if not data:
        return jsonify({"error": "请提供 JSON 数据"}), 400
    pad_code: str = data.get("pade_code")
    if not pad_code:
        return jsonify({"error": "padcode 参数缺失"}), 400

    try:
        # 停止VMOS应用
        result = stop_app([pad_code], package_name=Config.PKG_NAME)
        logger.success(f"{pad_code}: 停止成功, {result}")
        result_tg = stop_app([pad_code], package_name=Config.TG_PKG_NAME)
        logger.success(f"{pad_code}: 停止成功, {result_tg}")

        # 更新数据库中的运行状态
        config = ConfigData.query.filter_by(pade_code=pad_code).first()
        if config:
            # 停止该配置下所有URL的运行状态
            urls = UrlData.query.filter_by(config_id=config.id, is_running=True).all()
            for url in urls:
                url.stop_running()
            db.session.commit()
            logger.info(f"已停止配置 {config.id} 下 {len(urls)} 个URL的运行状态")

        return jsonify({"message": "停止成功", "msg": result})
    except Exception as e:
        db.session.rollback()
        logger.error(f"停止失败: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/start", methods=["post"])
@login_required
def start():
    data = request.get_json()
    if not data:
        return jsonify({"error": "请提供 JSON 数据"}), 400
    pad_code: str = data.get("pade_code")
    if not pad_code:
        return jsonify({"error": "padcode 参数缺失"}), 400

    try:
        # 启动VMOS应用
        result = start_app([pad_code], pkg_name=Config.PKG_NAME)
        logger.success(f"{pad_code}: 启动成功, {result}")

        # 更新数据库中的运行状态
        config = ConfigData.query.filter_by(pade_code=pad_code).first()
        if config:
            # 启动该配置下所有可用URL的运行状态
            urls = UrlData.query.filter_by(
                config_id=config.id,
                is_active=True
            ).filter(UrlData.current_count < UrlData.max_num).all()

            started_count = 0
            for url in urls:
                if url.start_running():
                    started_count += 1

            db.session.commit()
            logger.info(f"已启动配置 {config.id} 下 {started_count} 个URL的运行状态")

        return jsonify({"message": "启动成功", "msg": result})
    except Exception as e:
        db.session.rollback()
        logger.error(f"启动失败: {e}")
        return jsonify({"error": str(e)}), 500


@bp.route("/add_execute_num", methods=["POST"])
@token_required
def add_execute_num():
    """增加URL执行次数"""
    try:
        data = request.json
        if not data or 'url_id' not in data:
            return jsonify({'error': 'Missing url_id parameter'}), 400

        url_id = int(data['url_id'])
        url = db.session.get(UrlData, url_id)

        if not url:
            return jsonify({'error': 'URL not found'}), 404

        if not url.can_execute():
            return jsonify({
                'error': 'URL has reached maximum execution count',
                'current_count': url.current_count,
                'max_num': url.max_num
            }), 400

        # 如果URL不在运行状态，先启动它
        if not url.is_running:
            url.start_running()

        if url.execute():
            db.session.commit()
            return jsonify({
                'message': f'Successfully executed {url.name}',
                'url': url.url,
                'current_count': url.current_count,
                'remaining': url.max_num - url.current_count,
                'last_time': url.last_time.isoformat() if url.last_time else None,
                'is_running': url.is_running,
                'running_duration': url.get_running_duration()
            })

        return jsonify({'error': 'Failed to execute'}), 500

    except ValueError:
        return jsonify({'error': 'Invalid url_id format'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route("/url/<int:url_id>/start", methods=["POST"])
@login_required
def start_url(url_id):
    """启动单个URL"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        if url.start_running():
            db.session.commit()
            return jsonify({
                'message': f'URL "{url.name}" started successfully',
                'url_data': url.to_dict()
            })
        else:
            return jsonify({
                'error': 'Cannot start URL - either inactive or already completed'
            }), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route("/url/<int:url_id>/stop", methods=["POST"])
@login_required
def stop_url(url_id):
    """停止单个URL"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        if url.stop_running():
            db.session.commit()
            return jsonify({
                'message': f'URL "{url.name}" stopped successfully',
                'url_data': url.to_dict()
            })
        else:
            return jsonify({
                'error': 'URL is not running'
            }), 400

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route("/config/<int:config_id>/start-urls", methods=["POST"])
@login_required
def start_config_urls(config_id):
    """启动配置下的所有可用URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(
            config_id=config_id,
            is_active=True
        ).filter(UrlData.current_count < UrlData.max_num).all()

        started_count = 0
        for url in urls:
            if url.start_running():
                started_count += 1

        db.session.commit()
        return jsonify({
            'message': f'Started {started_count} URLs successfully',
            'total_available': len(urls),
            'started': started_count
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route("/config/<int:config_id>/stop-urls", methods=["POST"])
@login_required
def stop_config_urls(config_id):
    """停止配置下的所有运行中的URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_running=True).all()

        stopped_count = 0
        for url in urls:
            if url.stop_running():
                stopped_count += 1

        db.session.commit()
        return jsonify({
            'message': f'Stopped {stopped_count} URLs successfully',
            'total_running': len(urls),
            'stopped': stopped_count
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route("/add_label", methods=["POST"])
@token_required
def add_label():
    url_id = request.json['url_id']
    label = request.json['label']
    url = db.session.get(UrlData, url_id)
    if not url:
        return jsonify({'error': 'URL not found'}), 404

    url.label = label
    url.updated_at = datetime.datetime.now()
    db.session.commit()

    return jsonify({
        'message': f'URL "{url.name}" add label successfully',
        'url_data': url.to_dict()
    })


@bp.route("/status", methods=["POST"])
@token_required
def add_label():
    url_id = request.json['url_id']
    status = request.json['status']
    url = db.session.get(UrlData, url_id)
    if not url:
        return jsonify({'error': 'URL not found'}), 404

    url.status = status
    url.updated_at = datetime.datetime.now()
    db.session.commit()

    return jsonify({
        'message': f'URL "{url.name}" add status successfully',
        'url_data': url.to_dict()
    })
