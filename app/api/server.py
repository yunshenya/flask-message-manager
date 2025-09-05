from flask import jsonify, request
from loguru import logger

from app import Config, db
from app.api import bp
from app.auth.decorators import login_required, token_required
from app.models import UrlData
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
    result = stop_app([pad_code], package_name=Config.PKG_NAME)
    logger.success(f"{pad_code}: 停止成功, {result}")
    return jsonify({"message": "停止成功", "msg": result})



@bp.route("/start", methods=["post"])
@login_required
def start():
    data = request.get_json()
    if not data:
        return jsonify({"error": "请提供 JSON 数据"}), 400
    pad_code: str = data.get("pade_code")
    if not pad_code:
        return jsonify({"error": "padcode 参数缺失"}), 400
    result = start_app([pad_code], pkg_name= Config.PKG_NAME)
    logger.success(f"{pad_code}: 启动成功, {result}")
    return jsonify({"message": "启动成功", "msg": result})


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

        if url.execute():
            db.session.commit()
            return jsonify({
                'message': f'Successfully executed {url.name}',
                'url': url.url,
                'current_count': url.current_count,
                'remaining': url.max_num - url.current_count,
                'last_time': url.last_time.isoformat() if url.last_time else None
            })

        return jsonify({'error': 'Failed to execute'}), 500

    except ValueError:
        return jsonify({'error': 'Invalid url_id format'}), 400
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500