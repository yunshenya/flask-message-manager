import datetime
from flask import jsonify, request
from app.api import bp
from app import db
from app.models.config_data import ConfigData
from app.auth.decorators import login_required, admin_required

@bp.route('/machines', methods=['GET'])
@login_required
def get_machines():
    """获取所有机器列表"""
    try:
        machines = ConfigData.query.order_by(ConfigData.id).all()
        return jsonify([machine.to_dict() for machine in machines])
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/machines', methods=['POST'])
@admin_required
def create_machine():
    """创建新机器配置"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required_fields = ['message', 'pade_code', 'name', 'description']
        for field in required_fields:
            if field not in data or not data[field].strip():
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # 检查机器代码是否已存在
        existing_machine = ConfigData.query.filter_by(pade_code=data['pade_code']).first()
        if existing_machine:
            return jsonify({'error': f'Machine code "{data["pade_code"]}" already exists'}), 409

        # 创建新机器配置
        new_machine = ConfigData(
            message=data['message'].strip(),
            pade_code=data['pade_code'].strip(),
            description=data.get('description', '').strip() or None,
            success_time_min=data.get('success_time_min', 5),
            success_time_max=data.get('success_time_max', 10),
            reset_time=data.get('reset_time', 0),
            is_active=True
        )

        db.session.add(new_machine)
        db.session.commit()

        return jsonify({
            'message': f'Machine "{new_machine.message}" created successfully',
            'machine': new_machine.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/<int:machine_id>', methods=['GET'])
@login_required
def get_machine(machine_id):
    """获取单个机器信息"""
    try:
        machine = db.session.get(ConfigData, machine_id)
        if not machine:
            return jsonify({'error': 'Machine not found'}), 404

        return jsonify({'machine': machine.to_dict()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/<int:machine_id>', methods=['PUT'])
@admin_required
def update_machine(machine_id):
    """更新机器配置"""
    try:
        machine = db.session.get(ConfigData, machine_id)
        if not machine:
            return jsonify({'error': 'Machine not found'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 更新字段
        if 'message' in data:
            machine.message = data['message'].strip()
        if 'pade_code' in data:
            # 检查新代码是否已被其他机器使用
            existing = ConfigData.query.filter(
                ConfigData.pade_code == data['pade_code'],
                ConfigData.id != machine_id
            ).first()
            if existing:
                return jsonify({'error': f'Machine code "{data["pade_code"]}" already exists'}), 409
            machine.pade_code = data['pade_code'].strip()
        if 'description' in data:
            machine.description = data['description'].strip() or None
        if 'success_time_min' in data:
            machine.success_time_min = data['success_time_min']
        if 'success_time_max' in data:
            machine.success_time_max = data['success_time_max']
        if 'reset_time' in data:
            machine.reset_time = data['reset_time']
        if 'name' in data:
            machine.name = data['name']
        if 'is_active' in data:
            machine.is_active = data['is_active']

        machine.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': 'Machine updated successfully',
            'machine': machine.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/<int:machine_id>/toggle', methods=['POST'])
@admin_required
def toggle_machine_status(machine_id):
    """切换机器激活状态"""
    try:
        machine = db.session.get(ConfigData, machine_id)
        if not machine:
            return jsonify({'error': 'Machine not found'}), 404

        machine.is_active = not machine.is_active
        machine.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'Machine "{machine.message}" {"activated" if machine.is_active else "deactivated"} successfully',
            'machine': machine.to_dict()
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/<int:machine_id>', methods=['DELETE'])
@admin_required
def delete_machine(machine_id):
    try:
        machine = db.session.get(ConfigData, machine_id)
        if not machine:
            return jsonify({'error': 'Machine not found'}), 404

        machine_name = machine.message
        db.session.delete(machine)
        db.session.commit()

        return jsonify({
            'message': f'Machine "{machine_name}" and all its URLs deleted successfully'
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/<int:machine_id>/stats', methods=['GET'])
@login_required
def get_machine_stats(machine_id):
    """获取机器统计信息"""
    try:
        machine = db.session.get(ConfigData, machine_id)
        if not machine:
            return jsonify({'error': 'Machine not found'}), 404

        urls = machine.urls
        active_urls = [url for url in urls if url.is_active]

        stats = {
            'machine': machine.to_dict(),
            'total_urls': len(urls),
            'active_urls': len(active_urls),
            'available_urls': len([url for url in active_urls if url.can_execute()]),
            'completed_urls': len([url for url in active_urls if url.current_count >= url.max_num]),
            'total_executions': sum(url.current_count for url in active_urls),
            'max_possible_executions': sum(url.max_num for url in active_urls)
        }

        return jsonify(stats)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/batch-start', methods=['POST'])
@login_required
def batch_start_machines():
    """批量启动机器"""
    try:
        from app.utils.vmos import start_app
        from app.config import Config

        data = request.json
        machine_ids = data.get('machine_ids', [])

        if not machine_ids:
            # 如果没有指定机器ID，启动所有激活的机器
            machines = ConfigData.query.filter_by(is_active=True).all()
        else:
            machines = ConfigData.query.filter(
                ConfigData.id.in_(machine_ids),
                ConfigData.is_active == True
            ).all()

        results = []
        for machine in machines:
            if machine.pade_code:
                try:
                    # 调用VMOS API启动机器
                    response = start_app([machine.pade_code], pkg_name=Config.PKG_NAME)
                    results.append({
                        'machine_id': machine.id,
                        'machine_name': machine.message,
                        'status': 'success',
                        'message': 'Started successfully',
                        'response': response
                    })
                except Exception as e:
                    results.append({
                        'machine_id': machine.id,
                        'machine_name': machine.message,
                        'status': 'error',
                        'message': str(e)
                    })

        return jsonify({
            'message': f'Batch start completed for {len(results)} machines',
            'results': results
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@bp.route('/machines/batch-stop', methods=['POST'])
@login_required
def batch_stop_machines():
    """批量停止机器"""
    try:
        from app.utils.vmos import stop_app

        data = request.json
        machine_ids = data.get('machine_ids', [])

        if not machine_ids:
            # 如果没有指定机器ID，停止所有机器
            machines = ConfigData.query.all()
        else:
            machines = ConfigData.query.filter(ConfigData.id.in_(machine_ids)).all()

        results = []
        for machine in machines:
            if machine.pade_code:
                try:
                    # 调用VMOS API停止机器
                    response = stop_app([machine.pade_code])
                    results.append({
                        'machine_id': machine.id,
                        'machine_name': machine.message,
                        'status': 'success',
                        'message': 'Stopped successfully',
                        'response': response
                    })
                except Exception as e:
                    results.append({
                        'machine_id': machine.id,
                        'machine_name': machine.message,
                        'status': 'error',
                        'message': str(e)
                    })

        return jsonify({
            'message': f'Batch stop completed for {len(results)} machines',
            'results': results
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500