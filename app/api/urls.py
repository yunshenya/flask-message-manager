import datetime

from flask import jsonify, request

from app import db, socketio
from app.api import bp
from app.auth.decorators import login_required
from app.models.config_data import ConfigData
from app.models.url_data import UrlData


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
            # label字段由后端系统设置，创建时默认为空
            label='',
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
        url.stopped_at = None
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'URL "{url.name}" count reset successfully',
            'url_data': url.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/urls/by-label/<string:label>', methods=['GET'])
@login_required
def get_urls_by_label(label):
    """根据标签查询URL列表"""
    try:
        config_id = request.args.get('config_id', type=int)
        include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'

        # 构建查询
        query = UrlData.query.filter(UrlData.label == label)

        # 如果指定了配置ID，则按配置过滤
        if config_id:
            query = query.filter(UrlData.config_id == config_id)

        # 是否包含非激活的URL
        if not include_inactive:
            query = query.filter(UrlData.is_active == True)

        urls = query.order_by(UrlData.id).all()

        return jsonify({
            'label': label,
            'config_id': config_id,
            'urls': [url.to_dict() for url in urls],
            'total': len(urls),
            'active': len([url for url in urls if url.is_active]),
            'completed': len([url for url in urls if url.current_count >= url.max_num]),
            'running': len([url for url in urls if url.is_running])
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/urls/labels', methods=['GET'])
@login_required
def get_all_labels():
    """获取所有不同的标签列表"""
    try:
        config_id = request.args.get('config_id', type=int)

        # 构建查询
        query = db.session.query(UrlData.label).filter(
            UrlData.label != '',
            UrlData.label.isnot(None)
        ).distinct()

        # 如果指定了配置ID，则按配置过滤
        if config_id:
            query = query.filter(UrlData.config_id == config_id)

        labels = [row[0] for row in query.all()]

        # 统计每个标签的URL数量
        label_stats = []
        for label in labels:
            count_query = UrlData.query.filter(UrlData.label == label)
            if config_id:
                count_query = count_query.filter(UrlData.config_id == config_id)

            total = count_query.count()
            active = count_query.filter(UrlData.is_active == True).count()
            running = count_query.filter(UrlData.is_running == True).count()
            completed = count_query.filter(UrlData.current_count >= UrlData.max_num).count()

            label_stats.append({
                'label': label,
                'total': total,
                'active': active,
                'running': running,
                'completed': completed
            })

        return jsonify({
            'config_id': config_id,
            'labels': label_stats,
            'total_labels': len(labels)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500



@bp.route('/urls/labels/<string:label>', methods=['DELETE'])
@login_required
def delete_label(label):
    """删除指定标签（将所有使用该标签的URL的标签设为空）"""
    try:
        config_id = request.args.get('config_id', type=int)

        # 构建查询
        query = UrlData.query.filter(UrlData.label == label)

        # 如果指定了配置ID，则按配置过滤
        if config_id:
            query = query.filter(UrlData.config_id == config_id)

        urls = query.all()

        if not urls:
            return jsonify({
                'error': f'No URLs found with label "{label}"'
            }), 404

        # 清空标签
        updated_count = 0
        for url in urls:
            url.label = ''
            url.updated_at = datetime.datetime.now()
            updated_count += 1

        db.session.commit()

        return jsonify({
            'message': f'Successfully deleted label "{label}" from {updated_count} URLs',
            'updated_count': updated_count,
            'label': label,
            'config_id': config_id
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/url/<int:url_id>/remove-label', methods=['POST'])
@login_required
def remove_url_label(url_id):
    """删除单个URL的标签"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        old_label = url.label
        url.label = ''
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'Label removed from URL "{url.name}"',
            'url_data': url.to_dict(),
            'old_label': old_label
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/url/<int:url_id>/activate', methods=['POST'])
@login_required
def activate_url(url_id):
    """激活单个URL"""
    try:
        url = db.session.get(UrlData, url_id)
        if not url:
            return jsonify({'error': 'URL not found'}), 404

        url.is_active = True
        url.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'群聊 "{url.name}" 已激活',
            'url_data': url.to_dict()
        })
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



@bp.route('/config/<int:config_id>/urls/inactive', methods=['GET'])
@login_required
def get_inactive_urls(config_id):
    """获取配置下的所有未激活URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_active=False).order_by(UrlData.id).all()

        return jsonify({
            'config_id': config_id,
            'urls': [url.to_dict() for url in urls],
            'total': len(urls)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/config/<int:config_id>/urls/batch-activate', methods=['POST'])
@login_required
def batch_activate_urls(config_id):
    """批量激活配置下的所有未激活URL"""
    try:
        config = db.session.get(ConfigData, config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404

        urls = UrlData.query.filter_by(config_id=config_id, is_active=False).all()

        activated_count = 0
        for url in urls:
            url.is_active = True
            url.updated_at = datetime.datetime.now()
            activated_count += 1

        db.session.commit()

        return jsonify({
            'message': f'成功激活 {activated_count} 个群聊',
            'activated_count': activated_count
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500