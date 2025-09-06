import datetime

from flask import jsonify, request
from loguru import logger

from app import Config, db, socketio
from app.api import bp
from app.auth.decorators import login_required, token_required
from app.models import UrlData, ConfigData
from app.utils.vmos import stop_app, start_app


@bp.route("/callback", methods=["POST"])
def callback():
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
        1000: lambda: logger.info("xxx"),
        1002: lambda: logger.info("xxx"),
        1003: lambda: logger.info("xxx"),
        1004: lambda: logger.info("xxx"),
        1006: lambda: logger.info("xxx"),
        1007: lambda: logger.info("xxx"),
        1009: lambda: logger.info("xxx"),
        1124: lambda: logger.info("xxx")
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
            stopped_urls = []
            for url in urls:
                if url.stop_running():
                    stopped_urls.append(url.to_dict())

            db.session.commit()

            # 推送所有停止的URL事件
            for url_data in stopped_urls:
                socketio.emit('url_stopped', {
                    'url_id': url_data['id'],
                    'config_id': config.id,
                    'url_data': url_data,
                    'timestamp': datetime.datetime.now().isoformat()
                })

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
            started_urls = []
            for url in urls:
                if url.start_running():
                    started_count += 1
                    started_urls.append(url.to_dict())

            db.session.commit()

            # 推送所有启动的URL事件
            for url_data in started_urls:
                socketio.emit('url_started', {
                    'url_id': url_data['id'],
                    'config_id': config.id,
                    'url_data': url_data,
                    'timestamp': datetime.datetime.now().isoformat()
                })

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

        if not url.is_running:
            url.start_running()

        if url.execute():
            db.session.commit()

            # 添加这部分 - 实时推送更新
            socketio.emit('url_executed', {
                'url_id': url_id,
                'config_id': url.config_id,
                'url_data': url.to_dict()
            })

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

            # 添加 WebSocket 推送
            socketio.emit('url_started', {
                'url_id': url_id,
                'config_id': url.config_id,
                'url_data': url.to_dict(),
                'timestamp': datetime.datetime.now().isoformat()
            })

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

        # 如果URL已经停止，直接返回成功
        if not url.is_running:
            return jsonify({
                'message': f'URL "{url.name}" already stopped',
                'url_data': url.to_dict()
            })

        if url.stop_running():
            db.session.commit()

            # WebSocket 推送
            socketio.emit('url_stopped', {
                'url_id': url_id,
                'config_id': url.config_id,
                'url_data': url.to_dict(),
                'timestamp': datetime.datetime.now().isoformat()
            })

            return jsonify({
                'message': f'URL "{url.name}" stopped successfully',
                'url_data': url.to_dict()
            })
        else:
            return jsonify({
                'error': 'Failed to stop URL'
            }), 500

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
        started_urls = []
        for url in urls:
            if url.start_running():
                started_count += 1
                started_urls.append(url.to_dict())

        db.session.commit()

        # 批量推送启动事件
        for url_data in started_urls:
            socketio.emit('url_started', {
                'url_id': url_data['id'],
                'config_id': config_id,
                'url_data': url_data,
                'timestamp': datetime.datetime.now().isoformat()
            })

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
        stopped_urls = []
        for url in urls:
            if url.stop_running():
                stopped_count += 1
                stopped_urls.append(url.to_dict())

        db.session.commit()

        # 批量推送停止事件
        for url_data in stopped_urls:
            socketio.emit('url_stopped', {
                'url_id': url_data['id'],
                'config_id': config_id,
                'url_data': url_data,
                'timestamp': datetime.datetime.now().isoformat()
            })

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
    """添加URL标签 - 只有后端系统可以调用"""
    try:
        data = request.json
        if not data or 'url_id' not in data or 'label' not in data:
            return jsonify({'error': 'Missing url_id or label parameter'}), 400

        url_id = int(data['url_id'])
        label = data['label']

        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        url.label = label
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        # 添加这部分 - 实时推送标签更新
        socketio.emit('label_updated', {
            'url_id': url_id,
            'config_id': url.config_id,
            'label': label,
            'url_data': url.to_dict()
        })

        return jsonify({
            'message': f'URL "{url.name}" label updated successfully',
            'url_data': url.to_dict()
        }), 200
    except ValueError:
        return jsonify({'error': 'Invalid url_id format'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route("/update_status", methods=["POST"])
@token_required
def update_status():
    """更新URL状态 - 只有后端系统可以调用"""
    try:
        data = request.json
        if not data or 'url_id' not in data or 'status' not in data:
            return jsonify({'error': 'Missing url_id or status parameter'}), 400

        url_id = int(data['url_id'])
        status = data['status']

        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        url.status = status
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        # 添加这部分 - 实时推送状态更新
        socketio.emit('status_updated', {
            'url_id': url_id,
            'config_id': url.config_id,
            'status': status,
            'url_data': url.to_dict()
        })

        return jsonify({
            'message': f'URL "{url.name}" status updated successfully',
            'url_data': url.to_dict()
        }), 200
    except ValueError:
        return jsonify({'error': 'Invalid url_id format'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/delete_label', methods=['DELETE'])
@token_required
def delete_label_token():
    try:
        url_id = request.json.get('url_id')
        url = UrlData.query.filter(UrlData.id == url_id).one()

        if not url:
            return jsonify({
                'error': f'No URLs found "{url_id}"'
            }), 404

        url.label = ''
        url.updated_at = datetime.datetime.now()
        db.session.commit()
        return jsonify({
            'message': f'Successfully deleted {url_id} label',
            'url_id': url_id
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route("/config/<int:config_id>/running-durations", methods=["GET"])
@login_required
def get_running_durations(config_id):
    """获取配置下所有运行中URL的时长"""
    try:
        running_urls = UrlData.query.filter_by(
            config_id=config_id,
            is_running=True
        ).all()

        durations = []
        for url in running_urls:
            durations.append({
                'url_id': url.id,
                'name': url.name,
                'started_at': url.started_at.isoformat() if url.started_at else None,
                'running_duration': url.get_running_duration()
            })

        return jsonify({
            'config_id': config_id,
            'running_urls_count': len(durations),
            'durations': durations,
            'total_running_time': sum(d['running_duration'] for d in durations)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500