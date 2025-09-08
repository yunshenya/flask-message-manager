import datetime
from flask import jsonify, request

from app import db
from app.api import bp
from app.auth.decorators import admin_required
from app.models.cleanup_task import CleanupTask
from app.models.config_data import ConfigData


@bp.route('/cleanup-tasks', methods=['GET'])
@admin_required
def get_cleanup_tasks():
    """获取所有清理任务"""
    try:
        tasks = CleanupTask.query.order_by(CleanupTask.id).all()
        return jsonify([task.to_dict() for task in tasks])
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/cleanup-tasks', methods=['POST'])
@admin_required
def create_cleanup_task():
    """创建清理任务"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required_fields = ['name', 'schedule_time', 'cleanup_types']
        for field in required_fields:
            if field not in data:
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # 解析时间
        try:
            schedule_time = datetime.datetime.strptime(data['schedule_time'], '%H:%M').time()
        except ValueError:
            return jsonify({'error': 'Invalid time format, use HH:MM'}), 400

        # 验证清理类型
        valid_types = ['status', 'label', 'counts']
        cleanup_types = data['cleanup_types']
        if not all(t in valid_types for t in cleanup_types):
            return jsonify({'error': f'Invalid cleanup types. Valid: {valid_types}'}), 400

        task = CleanupTask(
            name=data['name'],
            description=data.get('description', ''),
            schedule_time=schedule_time,
            is_enabled=data.get('is_enabled', True)
        )

        task.set_cleanup_types_list(cleanup_types)
        task.set_target_configs_list(data.get('target_configs'))
        task.calculate_next_run()

        db.session.add(task)
        db.session.commit()

        return jsonify({
            'message': 'Cleanup task created successfully',
            'task': task.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/cleanup-tasks/<int:task_id>', methods=['PUT'])
@admin_required
def update_cleanup_task(task_id):
    """更新清理任务"""
    try:
        task = db.session.get(CleanupTask, task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'name' in data:
            task.name = data['name']
        if 'description' in data:
            task.description = data['description']
        if 'schedule_time' in data:
            try:
                task.schedule_time = datetime.datetime.strptime(data['schedule_time'], '%H:%M').time()
                task.calculate_next_run()
            except ValueError:
                return jsonify({'error': 'Invalid time format, use HH:MM'}), 400
        if 'is_enabled' in data:
            task.is_enabled = data['is_enabled']
        if 'cleanup_types' in data:
            valid_types = ['status', 'label', 'counts']
            if not all(t in valid_types for t in data['cleanup_types']):
                return jsonify({'error': f'Invalid cleanup types. Valid: {valid_types}'}), 400
            task.set_cleanup_types_list(data['cleanup_types'])
        if 'target_configs' in data:
            task.set_target_configs_list(data['target_configs'])

        task.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': 'Task updated successfully',
            'task': task.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/cleanup-tasks/<int:task_id>', methods=['DELETE'])
@admin_required
def delete_cleanup_task(task_id):
    """删除清理任务"""
    try:
        task = db.session.get(CleanupTask, task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404

        task_name = task.name
        db.session.delete(task)
        db.session.commit()

        return jsonify({'message': f'Task "{task_name}" deleted successfully'})

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/cleanup-tasks/<int:task_id>/toggle', methods=['POST'])
@admin_required
def toggle_cleanup_task(task_id):
    """切换清理任务状态"""
    try:
        task = db.session.get(CleanupTask, task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404

        task.is_enabled = not task.is_enabled
        task.updated_at = datetime.datetime.now()

        if task.is_enabled:
            task.calculate_next_run()
        else:
            task.next_run = None

        db.session.commit()

        return jsonify({
            'message': f'Task "{task.name}" {"enabled" if task.is_enabled else "disabled"}',
            'task': task.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/cleanup-tasks/<int:task_id>/execute', methods=['POST'])
@admin_required
def execute_cleanup_task(task_id):
    """手动执行清理任务"""
    try:
        task = db.session.get(CleanupTask, task_id)
        if not task:
            return jsonify({'error': 'Task not found'}), 404

        # 执行清理
        result = db.session.execute(
            "SELECT execute_cleanup_task(:cleanup_types, :target_configs)",
            {
                'cleanup_types': task.cleanup_types,
                'target_configs': task.target_configs
            }
        )
        affected_rows = result.scalar()

        # 更新任务执行时间
        task.last_run = datetime.datetime.now()
        task.calculate_next_run()
        db.session.commit()

        return jsonify({
            'message': f'Task executed successfully. {affected_rows} records affected.',
            'affected_rows': affected_rows,
            'task': task.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/cleanup-tasks/configs', methods=['GET'])
@admin_required
def get_available_configs():
    """获取可用的配置列表"""
    try:
        configs = ConfigData.query.filter_by(is_active=True).all()
        return jsonify([
            {
                'id': config.id,
                'name': config.name or config.message,
                'pade_code': config.pade_code
            }
            for config in configs
        ])
    except Exception as e:
        return jsonify({'error': str(e)}), 500