import datetime
from typing import List

from sqlalchemy.orm import relationship, Mapped

from app import db


class ConfigData(db.Model):
    __tablename__ = 'config_data'
    id = db.Column(db.Integer, primary_key=True)
    success_time_min = db.Column(db.Integer, nullable=False, default=5)
    success_time_max = db.Column(db.Integer, nullable=False, default=10)
    reset_time = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now())
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now())
    is_active = db.Column(db.Boolean, default=True)
    description = db.Column(db.Text)
    pade_code = db.Column(db.Text)
    name = db.Column(db.Text)
    message = db.Column(db.Text)

    urls: Mapped[List["UrlData"]] = relationship(backref='config', cascade='all, delete-orphan')

    def to_dict(self):
        return {
            'id': self.id,
            'success_time': [self.success_time_min, self.success_time_max],
            'reset_time': self.reset_time,
            'description': self.description,
            'is_active': self.is_active,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'urldata': [url.to_dict() for url in self.urls if url.is_active],
            'pade_code': self.pade_code,
            'message': self.message,
            'name': self.name,
        }