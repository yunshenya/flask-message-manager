import threading
from typing import Dict, Any

from flask import current_app
from loguru import logger


def _apply_to_flask_config(key: str, value: Any):
    """将配置应用到Flask配置中"""
    try:
        # 更新Flask配置
        current_app.config[key] = value

        # 特殊配置的处理
        if key == 'DEBUG':
            current_app.debug = bool(value)
            logger.info(f"Flask调试模式已{'启用' if value else '禁用'}")

    except Exception as e:
        logger.warning(f"应用配置到Flask失败 {key}: {e}")


def _convert_value(value: str) -> Any:
    """转换配置值到适当的类型"""
    if value is None:
        return None

    if isinstance(value, str):
        value_lower = value.lower()
        # 布尔值转换
        if value_lower in ('true', 'false'):
            return value_lower == 'true'
        # 数字转换
        if value.isdigit():
            return int(value)
        # 小数转换
        try:
            if '.' in value:
                return float(value)
        except ValueError:
            pass

    return value


class DynamicConfigManager:
    """动态配置管理器 - 支持运行时修改配置"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if not hasattr(self, '_initialized'):
            self._config_cache: Dict[str, Any] = {}
            self._watchers: Dict[str, list] = {}  # 配置变更监听器
            self._lock = threading.RLock()
            self._initialized = True
            logger.info("动态配置管理器已初始化")

    def get_config(self, key: str, default: Any = None) -> Any:
        """获取配置值（优先从缓存获取）"""
        with self._lock:
            # 首先检查缓存
            if key in self._config_cache:
                return self._config_cache[key]

            # 从数据库获取
            try:
                from app.models.system_config import SystemConfig
                config = SystemConfig.query.filter_by(key=key).first()
                if config:
                    value = _convert_value(config.value)
                    self._config_cache[key] = value
                    return value
                else:
                    # 如果数据库中没有，尝试从原始配置获取
                    if hasattr(current_app.config, key):
                        value = current_app.config[key]
                        self._config_cache[key] = value
                        return value
                    return default
            except Exception as e:
                logger.error(f"获取配置 {key} 失败: {e}")
                return default

    def set_config(self, key: str, value: Any, notify_watchers: bool = True):
        """设置配置值并立即生效"""
        with self._lock:
            old_value = self._config_cache.get(key)

            # 转换并存储到缓存
            converted_value = _convert_value(value)
            self._config_cache[key] = converted_value

            # 应用到Flask配置（如果适用）
            _apply_to_flask_config(key, converted_value)

            # 通知监听器
            if notify_watchers and key in self._watchers:
                for callback in self._watchers[key]:
                    try:
                        callback(key, old_value, converted_value)
                    except Exception as e:
                        logger.error(f"配置变更回调执行失败: {e}")

            logger.info(f"配置 {key} 已更新: {old_value} -> {converted_value}")

    def reload_config(self, key: str):
        """重新加载指定配置"""
        with self._lock:
            if key in self._config_cache:
                del self._config_cache[key]
            return self.get_config(key)

    def reload_all_configs(self):
        """重新加载所有配置"""
        with self._lock:
            self._config_cache.clear()
            logger.info("所有配置缓存已清除，将重新加载")

    def add_watcher(self, key: str, callback):
        """添加配置变更监听器"""
        with self._lock:
            if key not in self._watchers:
                self._watchers[key] = []
            self._watchers[key].append(callback)
            logger.debug(f"为配置 {key} 添加了监听器")

    def remove_watcher(self, key: str, callback):
        """移除配置变更监听器"""
        with self._lock:
            if key in self._watchers and callback in self._watchers[key]:
                self._watchers[key].remove(callback)
                if not self._watchers[key]:
                    del self._watchers[key]


# 全局实例
dynamic_config = DynamicConfigManager()


def get_dynamic_config(key: str, default: Any = None) -> Any:
    """获取动态配置的便捷函数"""
    return dynamic_config.get_config(key, default)


def set_dynamic_config(key: str, value: Any):
    """设置动态配置的便捷函数"""
    dynamic_config.set_config(key, value)


# 配置变更回调示例
def on_debug_change(old_value: Any, new_value: Any):
    """调试模式变更回调"""
    logger.info(f"调试模式从 {old_value} 变更为 {new_value}")


def on_database_change(key: str):
    """数据库配置变更回调"""
    logger.warning(f"数据库配置已变更，建议重启应用以完全生效: {key}")


def on_api_key_change(key: str):
    """API密钥变更回调"""
    logger.info(f"API密钥已更新: {key}")


# 注册默认监听器
def register_default_watchers():
    """注册默认的配置监听器"""
    dynamic_config.add_watcher('DEBUG', on_debug_change)
    dynamic_config.add_watcher('DATABASE_URL', on_database_change)
    dynamic_config.add_watcher('API_SECRET_TOKEN', on_api_key_change)
    dynamic_config.add_watcher('ACCESS_KEY', on_api_key_change)
    dynamic_config.add_watcher('SECRET_ACCESS', on_api_key_change)