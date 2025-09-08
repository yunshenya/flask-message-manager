from flask import jsonify, request, session

from app import db
from app.api import bp
from app.auth.decorators import login_required, admin_required
from app.models.user import User


@bp.route('/users', methods=['POST'])
@admin_required
def api_create_user():
    """API创建用户 - 需要管理员权限"""
    try:
        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 验证必填字段
        required_fields = ['username', 'password']
        for field in required_fields:
            if field not in data or not data[field].strip():
                return jsonify({'error': f'Missing required field: {field}'}), 400

        username = data['username'].strip()
        password = data['password']
        email = data.get('email', '').strip() or None
        is_admin = data.get('is_admin', False)

        # 验证用户名长度
        if len(username) < 3 or len(username) > 80:
            return jsonify({'error': 'Username must be between 3 and 80 characters'}), 400

        # 验证密码强度
        if len(password) < 6:
            return jsonify({'error': 'Password must be at least 6 characters long'}), 400

        # 检查用户名是否已存在
        existing_user = User.query.filter_by(username=username).first()
        if existing_user:
            return jsonify({'error': f'Username "{username}" already exists'}), 409

        # 检查邮箱是否已存在（如果提供了邮箱）
        if email:
            existing_email = User.query.filter_by(email=email).first()
            if existing_email:
                return jsonify({'error': f'Email "{email}" already exists'}), 409

        # 创建新用户
        new_user = User(
            username=username,
            password_hash=User.hash_password(password),
            email=email,
            is_admin=is_admin,
            is_active=True
        )

        db.session.add(new_user)
        db.session.commit()

        return jsonify({
            'message': f'User "{username}" created successfully',
            'user': new_user.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@bp.route('/users', methods=['GET'])
@admin_required
def api_get_users():
    """获取用户列表 - 需要管理员权限"""
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search = request.args.get('search', '', type=str)

        # 限制每页数量
        per_page = min(per_page, 100)

        query = User.query

        # 搜索功能
        if search:
            query = query.filter(
                User.username.ilike(f'%{search}%') |
                User.email.ilike(f'%{search}%')
            )

        # 分页
        pagination = query.paginate(
            page=page,
            per_page=per_page,
            error_out=False
        )

        users = pagination.items

        return jsonify({
            'users': [user.to_dict() for user in users],
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': pagination.total,
                'pages': pagination.pages,
                'has_next': pagination.has_next,
                'has_prev': pagination.has_prev
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/profile', methods=['GET'])
@login_required
def api_get_profile():
    """获取当前用户资料"""
    try:
        user = db.session.get(User, session['user_id'])
        if not user:
            return jsonify({'error': 'User not found'}), 404

        return jsonify({
            'user': user.to_dict()
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@bp.route('/profile', methods=['PUT'])
@login_required
def api_update_profile():
    """更新当前用户资料"""
    try:
        user = db.session.get(User, session['user_id'])
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.json
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        # 更新邮箱
        if 'email' in data:
            email = data['email'].strip() or None
            if email:
                # 检查邮箱是否被其他用户使用
                existing_email = User.query.filter(User.email == email, User.id != user.id).first()
                if existing_email:
                    return jsonify({'error': f'Email "{email}" already exists'}), 409

            user.email = email

        # 更新密码
        if 'current_password' in data and 'new_password' in data:
            current_password = data['current_password']
            new_password = data['new_password']

            # 验证当前密码
            if not user.check_password(current_password):
                return jsonify({'error': 'Current password is incorrect'}), 400

            # 验证新密码
            if len(new_password) < 6:
                return jsonify({'error': 'New password must be at least 6 characters long'}), 400

            user.password_hash = User.hash_password(new_password)

        db.session.commit()

        return jsonify({
            'message': 'Profile updated successfully',
            'user': user.to_dict()
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
