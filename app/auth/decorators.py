import os
from functools import wraps
from flask import session, request, jsonify, redirect, url_for, flash
from app import db
from app.models.user import User


SECRET_TOKEN = os.getenv('API_SECRET_TOKEN', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9')

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


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'token' in request.headers:
            auth_header = request.headers['token']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401

        if not token:
            return jsonify({'error': 'Token is missing'}), 401

        if token != SECRET_TOKEN:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated
