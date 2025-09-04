import datetime
from flask import jsonify, request
from app.api import bp
from app import db
from app.models.config_data import ConfigData
from app.models.url_data import UrlData
from app.auth.decorators import login_required, token_required


@bp.route('/config', methods=['GET'])
@token_required
def get_config():
    """获取配置数据"""
    pade_code = request.args.get('pade_code')
    print(pade_code)
    config_id = request.args.get('config_id', type=int)
    if config_id:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404
        return jsonify(config.to_dict()), 200
    else:
        config = ConfigData.query.filter_by(is_active=True).first()
        if config:
            return jsonify({
                'success_time': [config.success_time_min, config.success_time_max],
                'reset_time': config.reset_time,
                'urldata': [url.to_dict() for url in config.urls if url.is_active]
            })
        return jsonify({'success_time': [5, 10], 'reset_time': 0, 'urldata': []}), 200


@bp.route('/config/<int:config_id>/urls', methods=['GET'])
@login_required
def get_config_urls(config_id):
    """获取配置的所有URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        query = UrlData.query.filter_by(config_id=config_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)

        urls = query.order_by(UrlData.id).all()

        return jsonify({
            'config_id': config_id,
            'urls': [url.to_dict() for url in urls],
            'total': len(urls),
            'active': len([url for url in urls if url.is_active]),
            'available': len([url for url in urls if url.can_execute() and url.is_active]),
            'pade_code': config.pade_code
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/config/<int:config_id>/status', methods=['GET'])
@login_required
def get_config_status(config_id):
    """获取配置状态统计"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_active=True).all()

        stats = {
            'config': config.to_dict(),
            'total_urls': len(urls),
            'available_urls': len([url for url in urls if url.can_execute()]),
            'completed_urls': len([url for url in urls if url.current_count >= url.max_num]),
            'total_executions': sum(url.current_count for url in urls),
            'max_possible_executions': sum(url.max_num for url in urls)
        }

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/config/<int:config_id>/reset', methods=['POST'])
@login_required
def reset_config_counts(config_id):
    """重置配置的URL计数"""
    try:
        urls = UrlData.query.filter_by(config_id=config_id).all()
        for url in urls:
            url.current_count = 0
            url.last_time = None
            url.updated_at = datetime.datetime.now()

        db.session.commit()
        return jsonify({'message': f'Reset {len(urls)} URLs successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
