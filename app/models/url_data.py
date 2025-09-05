import datetime
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
    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now())

    def to_dict(self):
        return {
            'id': self.id,
            'url': self.url,
            'name': self.name,
            'duration': self.duration,
            'Last_time': self.last_time.isoformat() if self.last_time else None,
            'max_num': self.max_num,
            'current_count': self.current_count,
            'is_active': self.is_active,
            'can_execute': self.current_count < self.max_num,
            'telegram_channel': self.url.replace('https://t.me/', '@') if self.url.startswith('https://t.me/') else self.url
        }

    def can_execute(self):
        return self.current_count < self.max_num

    def execute(self):
        if self.can_execute():
            self.current_count += 1
            self.last_time = datetime.datetime.now()
            self.updated_at = datetime.datetime.now()
            return True
        return False