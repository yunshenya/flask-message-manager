import datetime
import threading
import time

from loguru import logger

from app import db
from app.models.cleanup_task import CleanupTask


def _execute_task(task: CleanupTask):
    """执行单个清理任务"""
    logger.info(f"开始执行清理任务: {task.name}")

    try:
        # 执行清理
        result = db.session.execute(
            "SELECT execute_cleanup_task(:cleanup_types, :target_configs)",
            {
                'cleanup_types': task.cleanup_types,
                'target_configs': task.target_configs
            }
        )
        affected_rows = result.scalar()

        # 更新任务状态
        task.last_run = datetime.datetime.now()
        task.calculate_next_run()
        db.session.commit()

        logger.success(f"清理任务 {task.name} 执行完成，影响 {affected_rows} 条记录")

    except Exception as e:
        db.session.rollback()
        logger.error(f"清理任务 {task.name} 执行失败: {e}")
        raise


class CleanupScheduler:
    def __init__(self, app=None):
        self.app = app
        self._running = False
        self._thread = None

    def init_app(self, app):
        """初始化应用"""
        self.app = app

    def start(self):
        """启动调度器"""
        if self._running:
            logger.warning("清理调度器已在运行中")
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self._thread.start()
        logger.info("清理调度器已启动")

    def stop(self):
        """停止调度器"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        logger.info("清理调度器已停止")

    def _run_scheduler(self):
        """调度器主循环"""
        while self._running:
            try:
                self._check_and_execute_tasks()
            except Exception as e:
                logger.error(f"清理调度器执行出错: {e}")

            # 每分钟检查一次
            time.sleep(60)

    def _check_and_execute_tasks(self):
        """检查并执行到期的任务"""
        with self.app.app_context():
            now = datetime.datetime.now()

            # 查找需要执行的任务
            tasks = CleanupTask.query.filter(
                CleanupTask.is_enabled == True,
                CleanupTask.next_run <= now
            ).all()

            for task in tasks:
                try:
                    _execute_task(task)
                except Exception as e:
                    logger.error(f"执行清理任务 {task.name} 失败: {e}")


# 创建全局实例
cleanup_scheduler = CleanupScheduler()