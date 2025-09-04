from flask import jsonify, request
from loguru import logger

from app import Config
from app.api import bp
from app.auth.decorators import login_required
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

    # 定义处理函数映射
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

    # 执行对应的处理函数
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
    stop_app([pad_code])
    logger.success(f"{pad_code}: 停止成功")
    return jsonify({"message": "停止成功", "padcode": pad_code})



@bp.route("/start", methods=["post"])
def start():
    data = request.get_json()
    if not data:
        return jsonify({"error": "请提供 JSON 数据"}), 400
    pad_code: str = data.get("pade_code")
    if not pad_code:
        return jsonify({"error": "padcode 参数缺失"}), 400
    start_app([pad_code], pkg_name= Config.PKG_NAME)
    logger.success(f"{pad_code}: 启动成功")
    return jsonify({"message": "启动成功", "padcode": pad_code})