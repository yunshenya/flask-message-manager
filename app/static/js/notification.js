// 通知系统类
class NotificationSystem {
    constructor() {
        this.container = null;
        this.confirmOverlay = null;
        this.notificationId = 0;
        this.init();
    }

    init() {
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        this.container.id = 'notificationContainer';
        document.body.appendChild(this.container);

        this.confirmOverlay = document.createElement('div');
        this.confirmOverlay.className = 'confirm-overlay';
        this.confirmOverlay.id = 'confirmOverlay';
        this.confirmOverlay.innerHTML = `
            <div class="confirm-dialog">
                <div class="confirm-icon" id="confirmIcon"></div>
                <div class="confirm-title" id="confirmTitle"></div>
                <div class="confirm-message" id="confirmMessage"></div>
                <div class="confirm-buttons" id="confirmButtons"></div>
            </div>
        `;
        document.body.appendChild(this.confirmOverlay);
    }

    showNotification(type = 'info', title = '', message = '', duration = 5000) {
        const notification = this.createNotification(type, title, message);
        this.container.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        if (duration > 0) {
            setTimeout(() => {
                this.hideNotification(notification);
            }, duration);
        }

        return notification;
    }

    createNotification(type, title, message) {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.id = `notification-${++this.notificationId}`;

        notification.innerHTML = `
            <div class="notification-icon"></div>
            <div class="notification-content">
                ${title ? `<div class="notification-title">${title}</div>` : ''}
                <div class="notification-message">${message}</div>
            </div>
            <button class="notification-close" onclick="window.notificationSystem.hideNotification(this.parentNode)"></button>
        `;

        return notification;
    }

    hideNotification(notification) {
        notification.classList.remove('show');
        notification.classList.add('hide');

        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }

    showConfirm(title, message, type = 'primary', options = {}) {
        return new Promise((resolve) => {
            const iconMap = {
                danger: '⚠️',
                primary: '❓',
                secondary: 'ℹ️',
                warning: '⚠️',
                info: 'ℹ️'
            };

            document.getElementById('confirmIcon').textContent = iconMap[type] || '❓';
            document.getElementById('confirmTitle').textContent = title;
            document.getElementById('confirmMessage').textContent = message;

            const buttonsContainer = document.getElementById('confirmButtons');
            buttonsContainer.innerHTML = '';

            const confirmButton = document.createElement('button');
            confirmButton.className = `confirm-button ${type}`;
            confirmButton.textContent = options.confirmText || '确认';
            confirmButton.onclick = () => {
                this.hideConfirm();
                resolve(true);
            };

            const cancelButton = document.createElement('button');
            cancelButton.className = 'confirm-button secondary';
            cancelButton.textContent = options.cancelText || '取消';
            cancelButton.onclick = () => {
                this.hideConfirm();
                resolve(false);
            };

            buttonsContainer.appendChild(cancelButton);
            buttonsContainer.appendChild(confirmButton);

            this.confirmOverlay.classList.add('show');

            const handleKeydown = (e) => {
                if (e.key === 'Escape') {
                    this.hideConfirm();
                    resolve(false);
                    document.removeEventListener('keydown', handleKeydown);
                }
            };
            document.addEventListener('keydown', handleKeydown);

            this.confirmOverlay.onclick = (e) => {
                if (e.target === this.confirmOverlay) {
                    this.hideConfirm();
                    resolve(false);
                }
            };
        });
    }

    hideConfirm() {
        this.confirmOverlay.classList.remove('show');
        this.confirmOverlay.onclick = null;
    }

    success(title, message, duration) {
        return this.showNotification('success', title, message, duration);
    }

    error(title, message, duration) {
        return this.showNotification('error', title, message, duration);
    }

    warning(title, message, duration) {
        return this.showNotification('warning', title, message, duration);
    }

    info(title, message, duration) {
        return this.showNotification('info', title, message, duration);
    }
}

// 创建全局实例
// 安全的便捷函数
window.showSuccess = (title, message) => {
    if (window.notificationSystem) {
        return window.notificationSystem.success(title, message);
    }
};

window.showError = (title, message) => {
    if (window.notificationSystem) {
        return window.notificationSystem.error(title, message);
    }
};

window.showWarning = (title, message) => {
    if (window.notificationSystem) {
        return window.notificationSystem.warning(title, message);
    }
};

window.showInfo = (title, message) => {
    if (window.notificationSystem) {
        return window.notificationSystem.info(title, message);
    }
};

window.showConfirm = (title, message, type = 'primary') => {
    if (window.notificationSystem) {
        return window.notificationSystem.showConfirm(title, message, type);
    }
    return Promise.resolve(confirm(`${title}: ${message}`));
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        window.notificationSystem = new NotificationSystem();
    });
} else {
    window.notificationSystem = new NotificationSystem();
}