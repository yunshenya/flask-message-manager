import datetime
import json
from typing import List, Optional
from loguru import logger
from app import db


class CleanupTask(db.Model):
    __tablename__ = 'cleanup_tasks'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    schedule_time = db.Column(db.Time, nullable=False)
    is_enabled = db.Column(db.Boolean, default=True)
    cleanup_types = db.Column(db.String(200), nullable=False)  # JSON数组
    target_configs = db.Column(db.Text)  # JSON数组
    last_run = db.Column(db.DateTime)
    next_run = db.Column(db.DateTime)
    created_at = db.Column(db.DateTime, default=datetime.datetime.now)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.now)

    def get_cleanup_types_list(self) -> List[str]:
        """获取清理类型列表"""
        try:
            return json.loads(self.cleanup_types)
        except Exception as e:
            logger.error(e)
            return []

    def set_cleanup_types_list(self, types: List[str]):
        """设置清理类型列表"""
        self.cleanup_types = json.dumps(types)

    def get_target_configs_list(self) -> Optional[List[int]]:
        """获取目标配置列表"""
        if not self.target_configs:
            return None
        try:
            return json.loads(self.target_configs)
        except Exception as e:
            logger.error(e)
            return None

    def set_target_configs_list(self, configs: Optional[List[int]]):
        """设置目标配置列表"""
        if configs:
            self.target_configs = json.dumps(configs)
        else:
            self.target_configs = None

    def calculate_next_run(self):
        """计算下次运行时间"""
        now = datetime.datetime.now()
        today = now.date()

        # 组合今天的日期和设定的时间
        scheduled_today = datetime.datetime.combine(today, self.schedule_time)

        if scheduled_today > now:
            # 今天还没到执行时间
            self.next_run = scheduled_today
        else:
            # 今天已经过了执行时间，设置为明天
            tomorrow = today + datetime.timedelta(days=1)
            self.next_run = datetime.datetime.combine(tomorrow, self.schedule_time)

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'description': self.description,
            'schedule_time': self.schedule_time.strftime('%H:%M') if self.schedule_time else None,
            'is_enabled': self.is_enabled,
            'cleanup_types': self.get_cleanup_types_list(),
            'target_configs': self.get_target_configs_list(),
            'last_run': self.last_run.isoformat() if self.last_run else None,
            'next_run': self.next_run.isoformat() if self.next_run else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None
        }