// 改进版仪表板 - 保留所有编辑功能
const API_BASE = '';

async function apiCall(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/auth/login';
                return;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API调用错误:', error);
        alert('操作失败: ' + error.message);
        throw error;
    }
}

// 全局变量
let currentEditingUrlId = null;
let currentConfigData = null;
let systemRunningMap = new Map();
let monitoringInterval = null;
let lastUpdateTime = Date.now();

// ================================
// 数据加载和状态监控
// ================================
async function loadDashboardData() {
    try {
        const [statusData, urlsData] = await Promise.all([
            apiCall('/api/config/1/status'),
            apiCall('/api/config/1/urls')
        ]);

        currentConfigData = statusData.config;
        updateStatistics(statusData);
        updateUrlList(urlsData.urls);
        lastUpdateTime = Date.now();
        updatePageTitle();

    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

function updateStatistics(statusData) {
    const elements = {
        totalUrls: document.getElementById('totalUrls'),
        availableUrls: document.getElementById('availableUrls'),
        totalExecutions: document.getElementById('totalExecutions'),
        completedUrls: document.getElementById('completedUrls')
    };

    if (elements.totalUrls) elements.totalUrls.textContent = statusData.total_urls;
    if (elements.availableUrls) elements.availableUrls.textContent = statusData.available_urls;
    if (elements.totalExecutions) elements.totalExecutions.textContent = statusData.total_executions;
    if (elements.completedUrls) elements.completedUrls.textContent = statusData.completed_urls;
}

function updateUrlList(urls) {
    const urlList = document.getElementById('urlList');
    if (!urlList) return;

    urlList.innerHTML = urls.map(url => {
        const isSystemRunning = systemRunningMap.get(url.id) || false;
        const progressPercent = (url.current_count / url.max_num) * 100;

        // 基于数据库状态显示按钮
        let statusButton = getStatusButton(url, isSystemRunning);

        return `
            <div class="url-item ${url.current_count >= url.max_num ? 'completed' : ''}">
                <div class="url-info">
                    <div class="url-name">${url.name}</div>
                    <div class="url-link">${url.url}</div>
                    <div class="url-meta">
                        <small>
                            持续: ${url.duration}秒 | 
                            最大次数: ${url.max_num} | 
                            当前: ${url.current_count} | 
                            状态: ${url.is_active ? '激活' : '禁用'}
                            ${url.Last_time ? ' | 最后执行: ' + new Date(url.Last_time).toLocaleString() : ''}
                        </small>
                    </div>
                </div>
                <div class="url-stats">
                    <span class="count-display">${url.current_count}/${url.max_num}</span>
                    <div class="progress">
                        <div class="progress-bar ${progressPercent >= 100 ? 'completed' : ''}" 
                             style="width: ${Math.min(progressPercent, 100)}%"></div>
                    </div>
                    <div class="url-actions">
                        ${statusButton}
                        <button class="btn btn-info btn-sm" onclick="editUrl(${url.id})">编辑</button>
                        <button class="btn btn-secondary btn-sm" onclick="resetUrlCount(${url.id}, '${url.name}')">重置</button>
                        <button class="btn btn-warning btn-sm" onclick="deleteUrl(${url.id}, '${url.name}')">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function getStatusButton(url, isSystemRunning) {
    if (!url.can_execute) {
        return `<span class="btn btn-success btn-sm">✓ 已完成</span>`;
    } else if (isSystemRunning) {
        return `<span class="btn btn-primary btn-sm">🔄 运行中</span>`;
    } else {
        return `<span class="btn btn-secondary btn-sm">⏸ 等待中</span>`;
    }
}

function updatePageTitle() {
    const time = new Date(lastUpdateTime).toLocaleTimeString();
    document.title = `消息管理系统 (${time})`;
}

// ================================
// URL编辑功能
// ================================
async function editUrl(urlId) {
    try {
        const response = await apiCall(`/api/url/${urlId}`);
        const urlData = response.url_data;

        currentEditingUrlId = urlId;

        document.getElementById('editUrlId').value = urlData.id;
        document.getElementById('editUrl').value = urlData.url;
        document.getElementById('editName').value = urlData.name;
        document.getElementById('editDuration').value = urlData.duration;
        document.getElementById('editMaxNum').value = urlData.max_num;
        document.getElementById('editIsActive').checked = urlData.is_active;

        showEditUrlModal();
    } catch (error) {
        console.error('获取URL信息失败:', error);
        alert('获取URL信息失败');
    }
}

function showEditUrlModal() {
    document.getElementById('editUrlModal').style.display = 'block';
}

function hideEditUrlModal() {
    document.getElementById('editUrlModal').style.display = 'none';
    currentEditingUrlId = null;
}

async function saveEditedUrl(event) {
    event.preventDefault();

    if (!currentEditingUrlId) {
        alert('无效的编辑操作');
        return;
    }

    const data = {
        url: document.getElementById('editUrl').value,
        name: document.getElementById('editName').value,
        duration: parseInt(document.getElementById('editDuration').value),
        max_num: parseInt(document.getElementById('editMaxNum').value),
        is_active: document.getElementById('editIsActive').checked
    };

    try {
        const result = await apiCall(`/api/url/${currentEditingUrlId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        alert('URL更新成功!');
        hideEditUrlModal();
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// URL添加功能
// ================================
function showAddUrlModal() {
    document.getElementById('addUrlModal').style.display = 'block';
}

function hideAddUrlModal() {
    document.getElementById('addUrlModal').style.display = 'none';
}

async function addUrl(event) {
    event.preventDefault();

    const data = {
        config_id: 1,
        url: document.getElementById('newUrl').value,
        name: document.getElementById('newName').value,
        duration: parseInt(document.getElementById('newDuration').value),
        max_num: parseInt(document.getElementById('newMaxNum').value)
    };

    try {
        const result = await apiCall('/api/url', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        alert('URL添加成功!');
        hideAddUrlModal();
        document.querySelector('#addUrlModal form').reset();
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// URL删除功能
// ================================
async function deleteUrl(urlId, urlName) {
    if (!confirm(`确定要删除URL "${urlName}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        const result = await apiCall(`/api/url/${urlId}`, {
            method: 'DELETE'
        });

        alert('URL删除成功!');
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// 重置功能
// ================================
async function resetUrlCount(urlId, urlName) {
    if (!confirm(`确定要重置URL "${urlName}" 的执行计数吗？`)) {
        return;
    }

    try {
        const result = await apiCall(`/api/url/${urlId}/reset`, {
            method: 'POST'
        });

        systemRunningMap.delete(urlId);
        alert('URL计数重置成功!');
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function resetAllUrls() {
    if (!confirm('确定要重置所有URL的执行计数吗？')) return;

    try {
        const result = await apiCall('/api/config/1/reset', { method: 'POST' });
        systemRunningMap.clear();
        alert(result.message);
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// 机器控制功能
// ================================
async function startMachine(padeCode = null) {
    const code = padeCode || (currentConfigData ? currentConfigData.pade_code : null);
    if (!code) {
        alert('请提供 pade_code 参数');
        return;
    }

    try {
        const result = await apiCall(`/api/start`, {
            method: 'POST',
            body: JSON.stringify({ pade_code: code })
        });

        // 标记所有可用URL为运行状态
        const urlsData = await apiCall('/api/config/1/urls');
        urlsData.urls.forEach(url => {
            if (url.can_execute && url.is_active) {
                systemRunningMap.set(url.id, true);
            }
        });

        console.log('启动成功:', result);
        await loadDashboardData();
        alert('机器启动成功!');
    } catch (error) {
        console.error('启动失败:', error);
        alert('机器启动失败');
    }
}

async function stopMachine(padeCode = null) {
    const code = padeCode || (currentConfigData ? currentConfigData.pade_code : null);
    if (!code) {
        alert('请提供 pade_code 参数');
        return;
    }

    try {
        const result = await apiCall(`/api/stop`, {
            method: 'POST',
            body: JSON.stringify({ pade_code: code })
        });

        systemRunningMap.clear();
        console.log('停止成功:', result);
        await loadDashboardData();
        alert('机器停止成功!');
    } catch (error) {
        console.error('停止失败:', error);
        alert('机器停止失败');
    }
}

async function startAllMachines() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        alert('没有找到机器配置信息');
        return;
    }

    if (!confirm('确定要启动机器吗？')) {
        return;
    }

    try {
        await startMachine(currentConfigData.pade_code);
    } catch (error) {
        console.error('启动机器失败:', error);
        alert('启动机器失败，请检查网络连接和配置');
    }
}

async function stopAllMachines() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        alert('没有找到机器配置信息');
        return;
    }

    if (!confirm('确定要停止机器吗？')) return;

    try {
        await stopMachine(currentConfigData.pade_code);
    } catch (error) {
        console.error('停止机器失败:', error);
        alert('机器停止失败');
    }
}

// ================================
// 实时监控功能
// ================================
function startMonitoring(intervalMs = 5000) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }

    console.log(`开始实时监控，刷新间隔: ${intervalMs}ms`);

    monitoringInterval = setInterval(async () => {
        if (document.hidden) return; // 页面隐藏时不刷新

        try {
            await loadDashboardData();
        } catch (error) {
            console.error('监控刷新失败:', error);
        }
    }, intervalMs);
}

function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    console.log('实时监控已停止');
}

function refreshData() {
    loadDashboardData().then(() => {
        alert("数据刷新完成");
    }).catch(error => {
        alert("刷新失败");
    });
}

// ================================
// 页面初始化
// ================================
document.addEventListener('DOMContentLoaded', () => {
    // 初始加载
    loadDashboardData().then(r => {});

    // 启动实时监控
    startMonitoring(5000); // 5秒刷新一次

    // 页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            loadDashboardData().then(r => {}); // 页面显示时立即刷新
        }
    });
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    stopMonitoring();
});