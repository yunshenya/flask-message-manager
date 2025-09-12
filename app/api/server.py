import datetime

from flask import jsonify, request
from loguru import logger

from app import db, socketio
from app.api import bp
from app.auth.decorators import token_required
from app.models import UrlData, ConfigData
from app.utils.dynamic_config import get_dynamic_config


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
        1007: lambda: logger.info("应用启动"),
        1009: lambda: logger.info("xxx"),
        1124: lambda: logger.info("xxx")
    }

    handler = handlers.get(task_type)
    if handler:
        handler()
    else:
        logger.info(f"其他接口回调: {data}")

    return "ok"



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



@bp.route("/update_last_time", methods=["POST"])
@token_required
def update_last_time():
    try:
        url_id = request.json.get('url_id')
        last_time = request.json.get('last_time')
        url = UrlData.query.filter(UrlData.id == url_id).one()

        if not url:
            return jsonify({
                'error': f'No URLs found "{url_id}"'
            }), 404

        url.last_time = last_time
        db.session.commit()
        return jsonify({
            'message': f'Successfully update {url_id} last time',
            'url_id': url_id
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500



@bp.route('/update_phone_number', methods=['POST'])
@token_required
def update_phone_number():
    pade_code = request.json.get('pade_code')
    phone_number = request.json.get('phone_number')
    config = ConfigData.query.filter_by(pade_code=pade_code).first()
    if config:
        config.phone_number = phone_number
        db.session.commit()
        socketio.emit('machine_info_update', {
            'machine_id': config.id,
            'is_running': config.is_running,
            'phone_number': phone_number
        })
        return jsonify({
            "message": f'Successfully update {pade_code} phone number',
            'phone_number': phone_number
        }), 200
    return jsonify({'error': 'Config not found'}), 404


def get_current_api_token():
    """动态获取当前的API令牌"""
    try:
        return get_dynamic_config('API_SECRET_TOKEN')
    except ImportError:
        from app import Config
        return Config.API_SECRET_TOKEN



@bp.route('/batch-update-label', methods=['POST'])
@token_required
def batch_update_labels():
    """批量更新URL标签"""
    try:
        data = request.json
        if not data or 'updates' not in data:
            return jsonify({'error': 'Missing updates data'}), 400

        updates = data['updates']

        updated_count = 0
        results = []

        for update in updates:
            if 'url_id' not in update or 'label' not in update:
                results.append({
                    'url_id': update.get('url_id', 'unknown'),
                    'status': 'error',
                    'message': 'Missing url_id or label'
                })
                continue

            url_id = int(update['url_id'])
            label = update['label']

            url = db.session.get(UrlData, url_id)
            if not url:
                results.append({
                    'url_id': url_id,
                    'status': 'error',
                    'message': 'URL not found'
                })
                continue

            url.label = label
            url.updated_at = datetime.datetime.now()
            updated_count += 1

            results.append({
                'url_id': url_id,
                'status': 'success',
                'message': f'Label updated to "{label}"',
                'url_name': url.name
            })

        db.session.commit()

        return jsonify({
            'message': f'Batch update completed: {updated_count} URLs updated',
            'updated_count': updated_count,
            'total_requests': len(updates),
            'results': results
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500