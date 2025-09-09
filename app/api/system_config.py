import os
import datetime
import shutil
from flask import jsonify, request

from app import db
from app.api import bp
from app.auth.decorators import admin_required
from app.models.system_config import SystemConfig


@bp.route('/system-configs', methods=['GET'])
@admin_required
def get_system_configs():
    """获取系统配置列表"""
    try:
        configs = SystemConfig.get_configs_by_category()
        return jsonify({
            'configs': configs,
            'categories': {
                'database': '数据库配置',
                'security': '安全配置',
                'app': '应用配置',
                'vmos': 'VMOS配置',
                'general': '通用配置'
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs/<int:config_id>', methods=['PUT'])
@admin_required
def update_system_config(config_id):
    """更新系统配置"""
    try:
        config = db.session.get(SystemConfig, config_id)
        if not config:
            return jsonify({'error': 'Configuration not found'}), 404

        data = request.json
        if not data or 'value' not in data:
            return jsonify({'error': 'Missing value parameter'}), 400

        old_value = config.value
        config.value = data['value']

        if 'description' in data:
            config.description = data['description']

        config.updated_at = datetime.datetime.now()
        db.session.commit()

        return jsonify({
            'message': f'配置 {config.key} 已更新',
            'config': config.to_dict(),
            'old_value': old_value if not config.is_sensitive else '***HIDDEN***'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs', methods=['POST'])
@admin_required
def create_system_config():
    """创建新的系统配置"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required_fields = ['key', 'value']
        for field in required_fields:
            if field not in data or not data[field].strip():
                return jsonify({'error': f'Missing required field: {field}'}), 400

        # 检查配置是否已存在
        existing = SystemConfig.query.filter_by(key=data['key']).first()
        if existing:
            return jsonify({'error': f'Configuration "{data["key"]}" already exists'}), 409

        config = SystemConfig.set_config(
            key=data['key'].strip(),
            value=data['value'],
            description=data.get('description', '').strip(),
            category=data.get('category', 'general'),
            is_sensitive=data.get('is_sensitive', False)
        )

        db.session.commit()

        return jsonify({
            'message': f'配置 {config.key} 已创建',
            'config': config.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs/<int:config_id>', methods=['DELETE'])
@admin_required
def delete_system_config(config_id):
    """删除系统配置"""
    try:
        config = db.session.get(SystemConfig, config_id)
        if not config:
            return jsonify({'error': 'Configuration not found'}), 404

        config_key = config.key
        db.session.delete(config)
        db.session.commit()

        return jsonify({
            'message': f'配置 {config_key} 已删除'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs/export-env', methods=['GET'])
@admin_required
def export_env_file():
    """导出为.env文件格式"""
    try:
        env_content = SystemConfig.export_to_env_format()

        response = jsonify({
            'content': env_content,
            'filename': f'.env.backup.{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}',
            'message': '配置导出成功'
        })

        return response

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs/backup-env', methods=['POST'])
@admin_required
def backup_and_update_env():
    """备份当前.env文件并更新配置"""
    try:
        env_file_path = '.env'
        backup_path = None
        # 创建备份
        if os.path.exists(env_file_path):
            backup_path = f'.env.backup.{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}'
            shutil.copy2(env_file_path, backup_path)
            backup_created = True
        else:
            backup_created = False

        # 导出新配置到.env文件
        env_content = SystemConfig.export_to_env_format()

        with open(env_file_path, 'w', encoding='utf-8') as f:
            f.write(env_content)

        return jsonify({
            'message': '配置已更新到.env文件',
            'backup_created': backup_created,
            'backup_path': backup_path if backup_created else None,
            'env_updated': True
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs/sync-from-env', methods=['POST'])
@admin_required
def sync_from_env():
    """从.env文件同步配置到数据库"""
    try:
        env_file_path = '.env'

        if not os.path.exists(env_file_path):
            return jsonify({'error': '.env file not found'}), 404

        updated_count = 0
        created_count = 0

        with open(env_file_path, 'r', encoding='utf-8') as f:
            for line_num, line in enumerate(f, 1):
                line = line.strip()

                # 跳过空行和注释
                if not line or line.startswith('#'):
                    continue

                # 解析环境变量
                if '=' in line:
                    key, value = line.split('=', 1)
                    key = key.strip()
                    value = value.strip()

                    existing = SystemConfig.query.filter_by(key=key).first()
                    if existing:
                        if existing.value != value:
                            existing.value = value
                            existing.updated_at = datetime.datetime.now()
                            updated_count += 1
                    else:
                        # 根据key推断配置分类和敏感性
                        category = 'general'
                        is_sensitive = False

                        if 'DATABASE' in key or 'DB_' in key:
                            category = 'database'
                            is_sensitive = True
                        elif 'SECRET' in key or 'PASSWORD' in key or 'TOKEN' in key or 'KEY' in key:
                            category = 'security'
                            is_sensitive = True
                        elif 'PKG' in key or 'DEBUG' in key:
                            category = 'app'
                        elif 'ACCESS' in key or 'VMOS' in key:
                            category = 'vmos'
                            is_sensitive = True

                        SystemConfig.set_config(
                            key=key,
                            value=value,
                            description=f'从.env文件同步 (行 {line_num})',
                            category=category,
                            is_sensitive=is_sensitive
                        )
                        created_count += 1

        db.session.commit()

        return jsonify({
            'message': f'从.env文件同步完成',
            'created_count': created_count,
            'updated_count': updated_count,
            'total_processed': created_count + updated_count
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/system-configs/test-config/<config_key>', methods=['POST'])
@admin_required
def test_config(config_key):
    """测试特定配置的连接性"""
    try:
        config = SystemConfig.query.filter_by(key=config_key).first()
        if not config:
            return jsonify({'error': 'Configuration not found'}), 404

        test_result = {'success': False, 'message': '未实现测试'}

        # 根据配置类型进行不同的测试
        if config_key == 'DATABASE_URL':
            try:
                from sqlalchemy import create_engine, text
                engine = create_engine(config.value)
                with engine.connect() as conn:
                    result = conn.execute(text("SELECT 1"))
                    if result.fetchone():
                        test_result = {'success': True, 'message': '数据库连接成功'}
            except Exception as e:
                test_result = {'success': False, 'message': f'数据库连接失败: {str(e)}'}

        elif config_key in ['ACCESS_KEY', 'SECRET_ACCESS']:
            try:
                from app.utils.vmos import get_phone_list
                result = get_phone_list()
                if result and 'data' in result:
                    test_result = {'success': True, 'message': f'VMOS API连接成功，获取到 {len(result["data"])} 台设备'}
                else:
                    test_result = {'success': False, 'message': 'VMOS API连接失败或返回无效数据'}
            except Exception as e:
                test_result = {'success': False, 'message': f'VMOS API测试失败: {str(e)}'}

        return jsonify({
            'config_key': config_key,
            'test_result': test_result
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500