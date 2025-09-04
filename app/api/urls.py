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