import datetime

from flask import jsonify, request
from app.api import bp
from app import db
from app.models.config_data import ConfigData
from app.models.url_data import UrlData
from app.auth.decorators import login_required

@bp.route('/url', methods=['POST'])
@login_required
def create_url():
    """创建新的URL数据"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required_fields = ['config_id', 'url', 'name']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        config = db.session.get(ConfigData, data['config_id'])
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        new_url = UrlData(
            config_id=data['config_id'],
            url=data['url'],
            name=data['name'],
            duration=data.get('duration', 30),
            max_num=data.get('max_num', 3),
            is_active=data.get('is_active', True)
        )

        db.session.add(new_url)
        db.session.commit()

        return jsonify({
            'message': 'URL created successfully',
            'url_data': new_url.to_dict()
        }), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/url/<int:url_id>/execute', methods=['POST'])
@login_required
def execute_url(url_id):
    """执行URL并更新计数"""
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


@bp.route('/url/<int:url_id>', methods=['GET'])
@login_required
def get_url(url_id):
    """获取单个URL信息"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        return jsonify({
            'url_data': url.to_dict()
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/url/<int:url_id>', methods=['PUT'])
@login_required
def update_url(url_id):
    """更新URL信息"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 更新字段
        if 'url' in data:
            url.url = data['url']
        if 'name' in data:
            url.name = data['name']
        if 'duration' in data:
            url.duration = data['duration']
        if 'max_num' in data:
            url.max_num = data['max_num']
        if 'is_active' in data:
            url.is_active = data['is_active']

        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': 'URL updated successfully',
            'url_data': url.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/url/<int:url_id>', methods=['DELETE'])
@login_required
def delete_url(url_id):
    """删除URL"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        name = url.name
        db.session.delete(url)
        db.session.commit()

        return jsonify({
            'message': f'URL "{name}" deleted successfully'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/url/<int:url_id>/reset', methods=['POST'])
@login_required
def reset_url_count(url_id):
    """重置单个URL计数"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        url.current_count = 0
        url.last_time = None
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'URL "{url.name}" count reset successfully',
            'url_data': url.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500