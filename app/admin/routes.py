from flask import render_template, request, redirect, url_for, flash, session
from app.admin import bp
from app import db
from app.models.user import User
from app.auth.decorators import admin_required

@bp.route('/')
@admin_required
def admin_panel():
    """管理员面板"""
    users = User.query.all()
    return render_template('admin.html', users=users, session=session)

@bp.route('/create-user', methods=['POST'])
@admin_required
def create_user():
    """创建新用户"""
    try:
        username = request.form['username']
        password = request.form['password']
        email = request.form.get('email')
        is_admin = 'is_admin' in request.form

        # 检查用户名是否已存在
        if User.query.filter_by(username=username).first():
            flash('用户名已存在')
            return redirect(url_for('admin.admin_panel'))

        user = User(
            username=username,
            password_hash=User.hash_password(password),
            email=email,
            is_admin=is_admin
        )

        db.session.add(user)
        db.session.commit()

        flash(f'用户 {username} 创建成功')
    except Exception as e:
        db.session.rollback()
        flash(f'创建用户失败: {str(e)}')

    return redirect(url_for('admin.admin_panel'))

@bp.route('/toggle-user/<int:user_id>')
@admin_required
def toggle_user_status(user_id):
    """切换用户状态"""
    try:
        user = db.session.get(User, user_id)
        if user and user.id != session['user_id']:
            user.is_active = not user.is_active
            db.session.commit()
            flash(f'用户 {user.username} 已{"激活" if user.is_active else "禁用"}')
        else:
            flash('无法操作当前用户')
    except Exception as e:
        db.session.rollback()
        flash(f'操作失败: {str(e)}')

    return redirect(url_for('admin.admin_panel'))

@bp.route('/delete-user/<int:user_id>')
@admin_required
def delete_user(user_id):
    """删除用户"""
    try:
        user = db.session.get(User, user_id)
        if user and user.id != session['user_id']:
            username = user.username
            db.session.delete(user)
            db.session.commit()
            flash(f'用户 {username} 已删除')
        else:
            flash('无法删除当前用户')
    except Exception as e:
        db.session.rollback()
        flash(f'删除失败: {str(e)}')

    return redirect(url_for('admin.admin_panel'))