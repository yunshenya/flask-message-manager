import datetime
from typing import Any

from flask import jsonify, request
from app.api import bp
from app import db, Config
from app.models import UrlData
from app.models.config_data import ConfigData
from app.auth.decorators import login_required, admin_required
from app.utils.vmos import get_phone_list


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
                    response = stop_app([machine.pade_code], package_name=Config.PKG_NAME)
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


@bp.route('/machines/sync-new', methods=['POST'])
@admin_required
def sync_new_machines():
    """从VMOS API同步新机器"""
    try:
        vmos_response = get_phone_list()
        if not vmos_response or 'data' not in vmos_response:
            return jsonify({'error': 'Failed to fetch machines from VMOS API'}), 500

        vmos_machines: Any = vmos_response['data']

        existing_codes = set(machine.pade_code for machine in ConfigData.query.all() if machine.pade_code)

        # 找出新机器
        new_machines = []
        for vmos_machine in vmos_machines:
            pade_code = vmos_machine.get('padCode')
            if pade_code and pade_code not in existing_codes:
                new_machines.append(vmos_machine)

        if not new_machines:
            return jsonify({
                'message': 'No new machines found',
                'new_machines_count': 0,
                'existing_machines_count': len(existing_codes)
            })

        # 默认的Telegram URL配置
        default_telegram_urls = [
            {'url': 'https://t.me/baolidb', 'name': '保利担保', 'duration': 30, 'max_num': 3},
            {'url': 'https://t.me/zhonghua2014tianxiang', 'name': '中华天象', 'duration': 30, 'max_num': 3},
            {'url': 'https://t.me/lianheshequ424', 'name': '联合社区', 'duration': 30, 'max_num': 3},
            {'url': 'https://t.me/make_friends1', 'name': 'make_friends', 'duration': 30, 'max_num': 3}
        ]

        created_machines = []

        # 创建新机器配置
        for vmos_machine in new_machines:
            try:
                new_machine = ConfigData(
                    message='哈咯----签到',
                    pade_code=vmos_machine.get('padCode'),
                    name=vmos_machine.get('padName', f"Machine-{vmos_machine.get('padCode', 'Unknown')}"),
                    description=vmos_machine.get('goodName', ''),
                    success_time_min=5,
                    success_time_max=10,
                    reset_time=0,
                    is_active=True
                )

                db.session.add(new_machine)
                db.session.flush()  # 获取生成的ID

                # 为新机器创建默认URL配置
                for url_data in default_telegram_urls:
                    url = UrlData(
                        config_id=new_machine.id,
                        url=url_data['url'],
                        name=url_data['name'],
                        duration=url_data['duration'],
                        max_num=url_data['max_num'],
                        is_active=True
                    )
                    db.session.add(url)

                created_machines.append({
                    'id': new_machine.id,
                    'name': new_machine.name,
                    'pade_code': new_machine.pade_code,
                    'description': new_machine.description,
                    'urls_created': len(default_telegram_urls)
                })

            except Exception as e:
                db.session.rollback()
                return jsonify({
                    'error': f'Failed to create machine {vmos_machine.get("padCode", "Unknown")}: {str(e)}'
                }), 500

        db.session.commit()

        return jsonify({
            'message': f'Successfully synchronized {len(created_machines)} new machines',
            'new_machines_count': len(created_machines),
            'existing_machines_count': len(existing_codes),
            'created_machines': created_machines,
            'total_machines': len(existing_codes) + len(created_machines)
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to sync new machines: {str(e)}'}), 500


@bp.route('/machines/vmos-list', methods=['GET'])
@admin_required
def get_vmos_machines_list():
    try:
        vmos_response = get_phone_list()
        if not vmos_response or 'data' not in vmos_response:
            return jsonify({'error': 'Failed to fetch machines from VMOS API'}), 500

        vmos_machines: Any = vmos_response['data']

        # 获取现有机器的pade_code列表
        existing_codes = set(machine.pade_code for machine in ConfigData.query.all() if machine.pade_code)

        # 分类机器
        existing_machines = []
        new_machines = []

        for vmos_machine in vmos_machines:
            pade_code = vmos_machine.get('padCode')
            machine_info = {
                'padCode': pade_code,
                'padName': vmos_machine.get('padName', ''),
                'goodName': vmos_machine.get('goodName', ''),
                'status': vmos_machine.get('status', ''),
                'createTime': vmos_machine.get('createTime', ''),
                'expireTime': vmos_machine.get('expireTime', ''),
            }

            if pade_code in existing_codes:
                existing_machines.append(machine_info)
            else:
                new_machines.append(machine_info)

        return jsonify({
            'total_vmos_machines': len(vmos_machines),
            'existing_machines_count': len(existing_machines),
            'new_machines_count': len(new_machines),
            'existing_machines': existing_machines,
            'new_machines': new_machines
        })

    except Exception as e:
        return jsonify({'error': f'Failed to get VMOS machines list: {str(e)}'}), 500