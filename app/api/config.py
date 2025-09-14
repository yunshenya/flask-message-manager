import datetime

from flask import jsonify, request

from app import db, socketio
from app.api import bp
from app.auth.decorators import login_required, token_required
from app.models.config_data import ConfigData
from app.models.url_data import UrlData


@bp.route('/config', methods=['GET'])
@token_required
def get_config():
    pade_code = request.args.get('pade_code')
    config = ConfigData.query.filter_by(pade_code=pade_code).first()
    if config:
        return jsonify({
            'success_time': [config.success_time_min, config.success_time_max],
            'reset_time': config.reset_time,
            'message': config.message,
            'urldata': [url.to_dict() for url in config.urls if url.is_active]
        })
    return jsonify({'error': 'Config not found'}), 404


@bp.route('/config/<int:config_id>/urls', methods=['GET'])
@login_required
def get_config_urls(config_id):
    """获取配置的所有URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        # 分页参数
        page = request.args.get('page', 1, type=int)
        per_page = min(request.args.get('per_page', 5, type=int), 100)  # 默认20条，最多100条
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        # 构建查询
        query = UrlData.query.filter_by(config_id=config_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)

        # 分页查询
        pagination = query.order_by(UrlData.id).paginate(
            page=page, per_page=per_page, error_out=False
        )

        urls = pagination.items

        return jsonify({
            'config_id': config_id,
            'urls': [url.to_dict() | {'pade_code': config.pade_code} for url in urls],
            'pagination': {
                'page': pagination.page,           # 当前页
                'per_page': pagination.per_page,   # 每页数量
                'total': pagination.total,         # 总记录数
                'pages': pagination.pages,         # 总页数
                'has_next': pagination.has_next,   # 是否有下一页
                'has_prev': pagination.has_prev    # 是否有上一页
            },
            # 统计信息
            'total': pagination.total,
            'active': UrlData.query.filter_by(config_id=config_id, is_active=True).count(),
            'inactive': UrlData.query.filter_by(config_id=config_id, is_active=False).count(),
            'available': UrlData.query.filter_by(config_id=config_id, is_active=True).filter(UrlData.current_count < UrlData.max_num).count(),
            'running': UrlData.query.filter_by(config_id=config_id, is_running=True).count(),
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
            'running_urls': len([url for url in urls if url.is_running]),
            'total_executions': sum(url.current_count for url in urls),
            'max_possible_executions': sum(url.max_num for url in urls),
            'total_running_time': sum(url.get_running_duration() for url in urls if url.is_running)
        }

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/config/<int:config_id>/reset', methods=['POST'])
@login_required
def reset_config_counts(config_id):
    """重置配置的URL计数和运行状态"""
    try:
        urls = UrlData.query.filter_by(config_id=config_id).all()
        for url in urls:
            url.reset_counts()
        db.session.commit()
        return jsonify({'message': f'Reset {len(urls)} URLs successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/config/<int:config_id>/start-all', methods=['POST'])
@login_required
def start_all_config_urls(config_id):
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


@bp.route('/config/<int:config_id>/stop-all', methods=['POST'])
@login_required
def stop_all_config_urls(config_id):
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


@bp.route('/config/<int:config_id>/running-status', methods=['GET'])
@login_required
def get_config_running_status(config_id):
    """获取配置的详细运行状态"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_active=True).all()

        running_urls = []
        completed_urls = []
        pending_urls = []

        for url in urls:
            url_data = url.to_dict()
            if url.is_running:
                running_urls.append(url_data)
            elif url.current_count >= url.max_num:
                completed_urls.append(url_data)
            else:
                pending_urls.append(url_data)

        return jsonify({
            'config_id': config_id,
            'config_name': config.message,
            'summary': {
                'total': len(urls),
                'running': len(running_urls),
                'completed': len(completed_urls),
                'pending': len(pending_urls),
                'total_running_time': sum(url.get_running_duration() for url in urls if url.is_running)
            },
            'details': {
                'running_urls': running_urls,
                'completed_urls': completed_urls,
                'pending_urls': pending_urls
            }
        })

    except Exception as e:
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