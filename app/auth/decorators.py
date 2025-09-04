from functools import wraps
from flask import session, request, jsonify, redirect, url_for, flash
from app import db
from app.models.user import User

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json:
                return jsonify({'error': 'Authentication required', 'login_url': '/login'}), 401
            return redirect(url_for('auth.login'))
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if request.is_json:
                return jsonify({'error': 'Authentication required', 'login_url': '/login'}), 401
            return redirect(url_for('auth.login'))

        user = db.session.get(User, session['user_id'])
        if not user or not user.is_admin:
            if request.is_json:
                return jsonify({'error': 'Admin access required'}), 403
            flash('需要管理员权限')
            return redirect(url_for('main.dashboard'))
        return f(*args, **kwargs)
    return decorated_function