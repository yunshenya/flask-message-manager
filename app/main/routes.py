from flask import render_template, redirect, url_for, session
from app.main import bp
from app import db
from app.models.user import User
from app.auth.decorators import login_required

@bp.route('/')
def index():
    if 'user_id' in session:
        return redirect(url_for('main.dashboard'))
    return redirect(url_for('auth.login'))

@bp.route('/dashboard')
@login_required
def dashboard():
    user = db.session.get(User, session['user_id'])
    return render_template('dashboard.html', current_user=user)

@bp.route("/favicon.ico")
def favicon():
    return redirect(url_for('static', filename='img/favicon.ico'), code=301)