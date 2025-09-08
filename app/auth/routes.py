import datetime

from flask import render_template, request, session, redirect, url_for, flash

from app import db
from app.auth import bp
from app.models.user import User


@bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        user = User.query.filter_by(username=username, is_active=True).first()

        if user and user.check_password(password):
            session['user_id'] = user.id
            user.last_login = datetime.datetime.now()
            db.session.commit()

            flash('登录成功!')
            return redirect(url_for('main.dashboard'))
        else:
            flash('用户名或密码错误')

    return render_template('login.html')


@bp.route('/logout')
def logout():
    session.clear()
    flash('已退出登录')
    return redirect(url_for('auth.login'))
