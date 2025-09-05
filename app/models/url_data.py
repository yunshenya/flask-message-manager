import datetime

from sqlalchemy import TEXT

from app import db

class UrlData(db.Model):
    __tablename__ = 'url_data'

    id = db.Column(db.Integer, primary_key=True)
    config_id = db.Column(db.Integer, db.ForeignKey('config_data.id', ondelete='CASCADE'))
    url = db.Column(db.String(500), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    duration = db.Column(db.Integer, nullable=False, default=30)
    last_time = db.Column(db.DateTime, nullable=True, default=datetime.datetime.now())
    max_num = db.Column(db.Integer, nullable=False, default=3)
    current_count = db.Column(db.Integer, default=0)
    is_active = db.Column(db.Boolean, default=True)

    # 新增运行状态字段
    is_running = db.Column(db.Boolean, default=False)
    started_at = db.Column(db.DateTime, nullable=True)
    stopped_at = db.Column(db.DateTime, nullable=True)

    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now())
    status = db.Column(TEXT, nullable=True, default='')  # 修改为可空，默认空字符串
    label = db.Column(TEXT, nullable=True, default='')   # 修改为可空，默认空字符串

    def to_dict(self):
        # 构建显示名称：如果有label且不为空，则在名称后添加label
        display_name = self.name
        if self.label and self.label.strip():
            display_name = f"{self.name} ({self.label.strip()})"

        return {
            'id': self.id,
            'url': self.url,
            'name': display_name,  # 使用包含label的显示名称
            'original_name': self.name,  # 保留原始名称
            'label': self.label or '',  # 确保label不为None
            'duration': self.duration,
            'Last_time': self.last_time.isoformat() if self.last_time else None,
            'max_num': self.max_num,
            'current_count': self.current_count,
            'is_active': self.is_active,
            'can_execute': self.current_count < self.max_num,
            'telegram_channel': self.url.replace('https://t.me/', '@') if self.url.startswith('https://t.me/') else self.url,
            # 新增运行状态信息
            'is_running': self.is_running,
            'started_at': self.started_at.isoformat() if self.started_at else None,
            'stopped_at': self.stopped_at.isoformat() if self.stopped_at else None,
            'running_duration': self.get_running_duration(),
            'status': self.status or '',  # 确保status不为None
        }

    def can_execute(self):
        return self.current_count < self.max_num

    def execute(self):
        """执行URL并更新计数，如果达到最大次数则自动停止运行"""
        if self.can_execute():
            self.current_count += 1
            self.last_time = datetime.datetime.now()
            self.updated_at = datetime.datetime.now()

            # 如果达到最大次数，自动停止运行
            if self.current_count >= self.max_num:
                self.is_running = False
                self.stopped_at = datetime.datetime.now()

            return True
        return False

    def start_running(self):
        """开始运行状态"""
        if self.can_execute() and self.is_active:
            self.is_running = True
            self.started_at = datetime.datetime.now()
            self.stopped_at = None
            self.updated_at = datetime.datetime.now()
            return True
        return False

    def stop_running(self):
        """停止运行状态"""
        if self.is_running:
            self.is_running = False
            self.stopped_at = datetime.datetime.now()
            self.updated_at = datetime.datetime.now()
            return True
        return False

    def reset_counts(self):
        """重置计数和运行状态"""
        self.current_count = 0
        self.last_time = None
        self.is_running = False
        self.started_at = None
        self.stopped_at = None
        self.updated_at = datetime.datetime.now()

    def get_running_duration(self):
        """获取运行时长（秒）"""
        if not self.started_at:
            return 0

        end_time = self.stopped_at if self.stopped_at else datetime.datetime.now()
        duration = (end_time - self.started_at).total_seconds()
        return int(duration)