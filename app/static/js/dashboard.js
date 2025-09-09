let socket = null;
let isWebSocketConnected = false;
let durationUpdateInterval = null;
let runningUrls = new Map();
let isWebSocketInitialized = false;
let lastNotificationTime = new Map();
document.addEventListener('DOMContentLoaded', async () => {
    // 首先初始化 WebSocket
    initWebSocket();

    await loadMachineList();

    if (currentConfigId) {
        await loadDashboardData();
    }


    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // 页面隐藏时停止更新
            stopDurationUpdates();
            console.log('页面隐藏，停止实时更新');
        } else {
            // 页面显示时恢复更新并强制刷新
            console.log('页面显示，恢复实时更新');
            if (isWebSocketConnected && currentConfigId) {
                startDurationUpdates();
                // 强制刷新确保状态同步
                loadDashboardData().then(() => {
                    console.log('状态同步完成');
                }).catch(error => {
                    console.error('状态同步失败:', error);
                });
            } else if (currentConfigId) {
                loadDashboardData().then(() => {
                    console.log('数据刷新完成（WebSocket未连接）');
                });
            }
        }
    });
});

// WebSocket 初始化函数
function initWebSocket() {
    console.log('正在初始化 WebSocket...');

    if (typeof io === 'undefined') {
        console.error('Socket.IO 库未加载，请检查网络连接');
        showError('连接错误', 'Socket.IO 库加载失败，实时更新功能不可用');
        return;
    }

    try {
        if (socket) {
            socket.disconnect();
            socket = null;
        }

        // 修改连接配置，解决升级问题
        socket = io('/', {
            transports: ['polling', 'websocket'],
            upgrade: true,
            timeout: 20000,
            forceNew: true,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            maxHttpBufferSize: 1e6,
            pingTimeout: 60000,
            pingInterval: 25000
        });

        setupWebSocketEvents();
        isWebSocketInitialized = true;
    } catch (error) {
        console.error('WebSocket 初始化失败:', error);
        showError('连接失败', 'WebSocket 连接初始化失败');
    }
}

// 设置 WebSocket 事件监听
function setupWebSocketEvents() {
    socket.on('connect', function () {
        console.log('WebSocket 连接成功');
        isWebSocketConnected = true;

        // 防止重复通知
        if (shouldShowNotification('connect')) {
            showSuccess('连接成功', 'WebSocket 实时更新已启用');
        }

        startDurationUpdates();
    });

    socket.on('disconnect', function (reason) {
        console.log('WebSocket 连接断开:', reason);
        isWebSocketConnected = false;
        isWebSocketInitialized = false;

        if (shouldShowNotification('disconnect')) {
            showWarning('连接断开', 'WebSocket 连接已断开，正在尝试重连...');
        }

        stopDurationUpdates();
    });

    socket.on('connect_error', function (error) {
        console.error('WebSocket 连接错误:', error);
        if (shouldShowNotification('error')) {
            showError('连接错误', 'WebSocket 连接失败，请检查网络');
        }
    });

    // 监听 URL 执行更新
    socket.on('url_executed', function (data) {
        if (data.config_id === currentConfigId) {
            updateSingleUrlItem(data.url_data);
            updateStatsFromSocket().then(r => {
            });
            updateRunningUrlsCache(data.url_data);
        }
    });

    // 监听状态更新
    socket.on('status_updated', function (data) {
        if (data.config_id === currentConfigId) {
            updateUrlStatus(data.url_id, data.status);
        }
    });

    // 监听标签更新
    socket.on('label_updated', function (data) {
        if (data.config_id === currentConfigId) {
            loadDashboardData().then(r => {
            });
            loadLabelStats().then(r => {
            });
        }
    });

    // 监听URL启动事件
    socket.on('url_started', function (data) {
        if (data.config_id === currentConfigId) {
            updateRunningUrlsCache(data.url_data);
            updateSingleUrlItem(data.url_data);
        }
    });

    // 监听URL停止事件
    socket.on('url_stopped', function (data) {
        if (data.config_id === currentConfigId) {
            removeFromRunningUrlsCache(data.url_id);
            updateSingleUrlItem(data.url_data);
        }
    });
}

function shouldShowNotification(type, urlId = null) {
    const now = Date.now();
    const key = urlId ? `${type}_${urlId}` : type;
    const lastTime = lastNotificationTime.get(key) || 0;

    // 同类型通知间隔至少2秒
    if (now - lastTime < 2000) {
        return false;
    }

    lastNotificationTime.set(key, now);
    return true;
}

// 启动运行时长更新
function startDurationUpdates() {
    // 如果已经有定时器在运行，先清除
    if (durationUpdateInterval) {
        clearInterval(durationUpdateInterval);
    }

    // 每秒更新一次运行时长
    durationUpdateInterval = setInterval(() => {
        updateAllRunningDurations();
    }, 1000);
}

// 停止运行时长更新
function stopDurationUpdates() {
    if (durationUpdateInterval) {
        clearInterval(durationUpdateInterval);
        durationUpdateInterval = null;
    }
}

// 更新运行中URL的缓存
function updateRunningUrlsCache(urlData) {
    if (urlData.is_running && urlData.started_at) {
        runningUrls.set(urlData.id, {
            id: urlData.id,
            name: urlData.name,
            started_at: new Date(urlData.started_at),
            running_duration: urlData.running_duration || 0
        });
    } else {
        removeFromRunningUrlsCache(urlData.id);
    }
}

// 从运行中URL缓存移除
function removeFromRunningUrlsCache(urlId) {
    if (runningUrls.has(urlId)) {
        const urlInfo = runningUrls.get(urlId);
        runningUrls.delete(urlId);
        console.log(`➖ 从缓存移除已停止群聊: ${urlInfo.name}`);
    }
}

// 更新所有运行中URL的时长显示
function updateAllRunningDurations() {
    if (runningUrls.size === 0) return;

    const now = new Date();

    runningUrls.forEach((urlInfo, urlId) => {
        const runningSeconds = Math.floor((now - urlInfo.started_at) / 1000);
        updateDurationDisplay(urlId, runningSeconds);
    });
}

// 更新单个URL的时长显示
function updateDurationDisplay(urlId, runningSeconds) {
    const urlItem = document.querySelector(`[data-url-id="${urlId}"]`);
    if (!urlItem) return;

    let durationElement = urlItem.querySelector('.running-duration');
    if (!durationElement) {
        const metaElement = urlItem.querySelector('.url-meta small');
        if (metaElement) {
            durationElement = document.createElement('span');
            durationElement.className = 'running-duration';
            durationElement.style.cssText = `
                font-size: 0.75rem;
                color: #28a745;
                font-weight: bold;
                background: #d4edda;
                padding: 0.1rem 0.3rem;
                border-radius: 3px;
                margin-left: 0.5rem;
            `;
            metaElement.appendChild(durationElement);
        }
    }

    if (durationElement) {
        const formattedDuration = formatDuration(runningSeconds);
        durationElement.textContent = `运行: ${formattedDuration}`;
    }
}

// 格式化时长显示
function formatDuration(seconds) {
    if (seconds < 0) return '0秒';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    let result = '';
    if (hours > 0) result += `${hours}时`;
    if (minutes > 0) result += `${minutes}分`;
    result += `${secs}秒`;

    return result;
}

// 初始化运行中URL缓存
function initializeRunningUrlsCache(urls) {
    runningUrls.clear();

    urls.forEach(url => {
        if (url.is_running && url.started_at) {
            updateRunningUrlsCache(url);
        }
    });
}


function updateSingleUrlItem(urlData) {
    const urlItem = document.querySelector(`[data-url-id="${urlData.id}"]`);
    if (!urlItem) {
        loadDashboardData().then(r => {
        });
        return;
    }

    // 更新计数显示
    const countDisplay = urlItem.querySelector('.count-display');
    if (countDisplay) {
        countDisplay.textContent = `${urlData.current_count}/${urlData.max_num}`;
    }

    // 更新进度条
    const progressBar = urlItem.querySelector('.progress-bar');
    if (progressBar) {
        const progressPercent = (urlData.current_count / urlData.max_num) * 100;
        progressBar.style.width = `${Math.min(progressPercent, 100)}%`;

        if (progressPercent >= 100) {
            progressBar.classList.add('completed');
            urlItem.classList.add('completed');
        }
    }

    // 更新运行状态
    if (urlData.is_running) {
        urlItem.classList.add('running');
    } else {
        urlItem.classList.remove('running');
    }

    // 添加更新动画
    urlItem.style.background = '#e8f5e8';
    setTimeout(() => {
        urlItem.style.background = '';
    }, 1000);
}

// 添加状态更新函数
function updateUrlStatus(urlId, status) {
    const statusElement = document.getElementById(`status-${urlId}`);
    if (statusElement) {
        const contentElement = statusElement.querySelector('.status-content');
        if (contentElement) {
            contentElement.textContent = status || '暂无状态信息';
            contentElement.className = `status-content ${status ? '' : 'empty'}`;
        }

        // 更新状态显示框样式
        if (status && status.trim()) {
            statusElement.classList.add('has-status');
            statusElement.classList.remove('empty');
        } else {
            statusElement.classList.remove('has-status');
            statusElement.classList.add('empty');
        }

        // 添加更新动画
        statusElement.classList.add('updating');
        setTimeout(() => {
            statusElement.classList.remove('updating');
        }, 400);
    }
}

// 添加统计数据更新函数
async function updateStatsFromSocket() {
    try {
        const statusData = await apiCall(`/api/config/${currentConfigId}/status`);
        updateStatistics(statusData);
    } catch (error) {
        console.error('更新统计数据失败:', error);
    }
}


async function loadDashboardData() {
    if (!currentConfigId) {
        console.warn('没有选中的机器');
        return;
    }

    try {
        // 检查是否显示未激活群聊
        const includeInactive = document.getElementById('showInactiveUrlsCheckbox')?.checked || false;
        const urlsEndpoint = includeInactive
            ? `/api/config/${currentConfigId}/urls?include_inactive=true`
            : `/api/config/${currentConfigId}/urls`;

        console.log('加载数据，包含未激活:', includeInactive); // 调试日志

        const [statusData, urlsData] = await Promise.all([
            apiCall(`/api/config/${currentConfigId}/status`),
            apiCall(urlsEndpoint)
        ]);

        console.log('获取到的URL数据:', urlsData); // 调试日志

        currentConfigData = statusData.config;

        // 更新基础统计
        updateStatistics(statusData);

        // 更新URL统计（包含未激活数量）
        updateUrlStatistics(urlsData);

        // 根据当前筛选状态决定显示哪些URL
        let urlsToDisplay;
        if (currentFilter.isActive && currentFilter.type === 'label') {
            await applyCurrentFilter();
            const filteredResponse = await apiCall(`/api/urls/by-label/${encodeURIComponent(currentFilter.value)}?config_id=${currentConfigId}`);
            urlsToDisplay = filteredResponse.urls;
        } else {
            updateUrlList(urlsData.urls);
            urlsToDisplay = urlsData.urls;
        }

        // 初始化运行中URL缓存
        initializeRunningUrlsCache(urlsToDisplay);

        // 加载标签统计
        await loadLabelStats();

        lastUpdateTime = Date.now();
        updatePageTitle();

    } catch (error) {
        console.error('加载数据失败:', error);
    }
}


function updateUrlList(urls) {
    const urlList = document.getElementById('urlList');
    if (!urlList) return;

    if (urls.length === 0) {
        const emptyMessage = currentFilter.isActive
            ? `没有找到标签为 "${currentFilter.value}" 的群聊的配置信息`
            : '当前机器暂无群聊配置';
        urlList.innerHTML = `<div style="padding: 2rem; text-align: center; color: #666;">${emptyMessage}</div>`;
        return;
    }

    urlList.innerHTML = urls.map(url => {
        const progressPercent = (url.current_count / url.max_num) * 100;
        let statusButton = getStatusButton(url);
        let runningInfo = getRunningInfo(url);

        const hasLabel = url.label && url.label.trim();
        const isInactive = !url.is_active;
        const labelClass = hasLabel ? 'url-item-labeled' : '';
        const inactiveClass = isInactive ? 'url-item-inactive' : '';

        return `
            <div class="url-item ${url.current_count >= url.max_num ? 'completed' : ''} ${url.is_running ? 'running' : ''} ${labelClass} ${inactiveClass}" data-url-id="${url.id}">
                <div class="url-info">
                    <div class="url-name">
                        ${url.name}
                        ${hasLabel ? `<span class="url-label-badge">${url.label}</span>` : ''}
                        ${isInactive ? `<span class="url-inactive-badge">未激活</span>` : ''}
                        ${!isInactive ? runningInfo : ''}
                    </div>
                    <div class="url-link">${url.url}</div>
                    
                    ${!isInactive ? `
                    <div class="status-display ${url.status && url.status.trim() ? 'has-status' : 'empty'}" id="status-${url.id}">
                        <div class="status-indicator ${url.is_running ? 'active' : ''}"></div>
                        <div class="status-label">状态</div>
                        <div class="status-content ${url.status && url.status.trim() ? '' : 'empty'}">
                            ${url.status && url.status.trim() ? url.status : '暂无状态信息'}
                        </div>
                    </div>
                    ` : ''}
                    
                    <div class="url-meta">
                        <small>
                            持续: ${url.duration}秒 | 
                            最大次数: ${url.max_num} | 
                            当前: ${url.current_count} | 
                            状态: ${url.is_active ? '激活' : '未激活'}
                            ${url.Last_time ? ' | 最后执行: ' + new Date(url.Last_time).toLocaleString() : ''}
                            ${url.is_running && url.started_at ? `<span class="running-duration" style="font-size: 0.75rem; color: #28a745; font-weight: bold; background: #d4edda; padding: 0.1rem 0.3rem; border-radius: 3px; margin-left: 0.5rem;">运行: ${formatDuration(url.running_duration || 0)}</span>` : ''}
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
                        ${isInactive ?
            `<button class="btn btn-success btn-sm" onclick="activateUrl(${url.id}, '${url.name.replace(/'/g, '&#39;')}')" title="激活群聊" style="background: linear-gradient(45deg, #28a745, #20c997);">✅ 激活</button>`
            : statusButton
        }
                        ${!isInactive ? getControlButtons(url) : ''}
                        ${hasLabel && !isInactive ? `<button class="btn btn-warning btn-sm" onclick="removeUrlLabel(${url.id}, '${url.name.replace(/'/g, '&#39;')}', '${url.label.replace(/'/g, '&#39;')}')" title="删除标签">🏷️删除标签</button>` : ''}
                        <button class="btn btn-info btn-sm" onclick="editUrl(${url.id})">编辑</button>
                        ${!isInactive ? `<button class="btn btn-secondary btn-sm" onclick="resetUrlCount(${url.id}, '${url.name}')">重置</button>` : ''}
                        <button class="btn btn-warning btn-sm" onclick="deleteUrl(${url.id}, '${url.name}')">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}


window.addEventListener('beforeunload', () => {
    stopDurationUpdates();
    if (socket) {
        socket.disconnect();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化 WebSocket
    initWebSocket();

    await loadMachineList();

    if (currentConfigId) {
        await loadDashboardData();
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentConfigId) {
            loadDashboardData();
        }
    });
});


// 多机器仪表板管理系统
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
        showError("失败", '操作失败: ' + error.message);
        throw error;
    }
}

// 全局变量
let currentEditingUrlId = null;
let currentEditingMachineId = null;
let currentConfigId = null;
let currentConfigData = null;
let monitoringInterval = null;
let lastUpdateTime = Date.now();
let availableMachines = [];

let currentFilter = {
    type: null,
    value: null,
    isActive: false
};


async function loadMachineList() {
    try {
        const machines = await apiCall('/api/machines');
        availableMachines = machines;

        const select = document.getElementById('machineSelect');
        select.innerHTML = '';

        if (machines.length === 0) {
            select.innerHTML = '<option value="">无可用机器</option>';
            return;
        }

        machines.forEach(machine => {
            const option = document.createElement('option');
            option.value = machine.id;
            const machineName = machine.name || '未命名';
            const machineCode = machine.pade_code || '无代码';
            option.textContent = `${machineName} (${machineCode})`;
            select.appendChild(option);
        });

        if (!currentConfigId && machines.length > 0) {
            currentConfigId = machines[0].id;
            select.value = currentConfigId;
            updateCurrentMachineInfo();
        }

    } catch (error) {
        console.error('加载机器列表失败:', error);
        document.getElementById('machineSelect').innerHTML = '<option value="">加载失败</option>';
    }
}

async function refreshMachineList() {
    const refreshIcon = document.getElementById('refreshIcon');
    refreshIcon.classList.add('loading-indicator');
    refreshIcon.textContent = '';

    try {
        await loadMachineList();
    } finally {
        refreshIcon.classList.remove('loading-indicator');
        refreshIcon.textContent = '🔄';
    }
}

function switchMachine() {
    const select = document.getElementById('machineSelect');
    const newConfigId = parseInt(select.value);

    if (newConfigId && newConfigId !== currentConfigId) {
        currentConfigId = newConfigId;
        // 切换机器时清除筛选状态
        clearFilterInternal();
        updateCurrentMachineInfo();
        loadDashboardData().then(r => {
        });
    }
}

function updateCurrentMachineInfo() {
    const infoDiv = document.getElementById('currentMachineInfo');
    const statusSpan = document.getElementById('currentMachineStatus');
    const codeSpan = document.getElementById('currentMachineCode');
    const editBtn = document.getElementById('editCurrentBtn');

    if (!currentConfigId || !availableMachines.length) {
        infoDiv.style.display = 'none';
        editBtn.style.display = 'none';
        return;
    }

    const machine = availableMachines.find(m => m.id === currentConfigId);
    if (machine) {
        codeSpan.textContent = machine.pade_code || '无代码';
        statusSpan.textContent = machine.is_active ? '激活' : '禁用';
        statusSpan.className = `machine-status ${machine.is_active ? 'status-active' : 'status-inactive'}`;
        infoDiv.style.display = 'flex';
        editBtn.style.display = 'inline-block';
    } else {
        infoDiv.style.display = 'none';
        editBtn.style.display = 'none';
    }
}


async function applyCurrentFilter() {
    if (!currentFilter.isActive || !currentFilter.value) {
        return;
    }

    try {
        const response = await apiCall(`/api/urls/by-label/${encodeURIComponent(currentFilter.value)}?config_id=${currentConfigId}`);
        updateUrlList(response.urls);
    } catch (error) {
        console.error('应用筛选失败:', error);
        // 如果筛选失败，清除筛选状态
        clearFilterInternal();
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


function getStatusButton(url) {
    if (!url.can_execute) {
        return `<span class="btn btn-success btn-sm">✓ 已完成</span>`;
    } else if (url.is_running) {
        return `<span class="btn btn-primary btn-sm">🔄 运行中</span>`;
    } else {
        return `<span class="btn btn-secondary btn-sm">⏸ 等待中</span>`;
    }
}

function getRunningInfo(url) {
    if (url.is_running) {
        return `<span class="execution-status status-executing">运行中</span>`;
    } else if (url.current_count >= url.max_num) {
        return `<span class="execution-status status-completed">已完成</span>`;
    } else if (url.stopped_at) {
        return `<span class="execution-status status-pending">已停止</span>`;
    } else {
        return `<span class="execution-status status-pending">等待中</span>`;
    }
}

function getControlButtons(url) {
    if (!url.can_execute) {
        return '';
    }

    if (url.is_running) {
        return `<button class="btn btn-warning btn-sm" onclick="stopUrl(${url.id}, '${url.name}')">停止</button>`;
    } else {
        return `<button class="btn btn-success btn-sm" onclick="startUrl(${url.id}, '${url.name}')">启动</button>`;
    }
}

function updatePageTitle() {
    const time = new Date(lastUpdateTime).toLocaleTimeString();
    const machineName = currentConfigData ? (currentConfigData.name || currentConfigData.pade_code) : '未选择';
    document.title = `消息管理系统 - ${machineName} (${time})`;
}


async function loadLabelStats() {
    if (!currentConfigId) return;

    try {
        const response = await apiCall(`/api/urls/labels?config_id=${currentConfigId}`);
        updateLabelStats(response.labels);
    } catch (error) {
        console.error('加载标签统计失败:', error);
    }
}

function updateLabelStats(labelStats) {
    const statsContainer = document.getElementById('labelStats');
    if (!statsContainer) return;

    if (labelStats.length === 0) {
        statsContainer.innerHTML = '<p style="color: #666; text-align: center;">暂无标签数据</p>';
        return;
    }

    const statsHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem;">
            ${labelStats.map(stat => `
                <div class="label-stat-card" style="background: white; padding: 1rem; border-radius: 4px; border-left: 4px solid #17a2b8;">
                    <div style="font-weight: bold; color: #333; margin-bottom: 0.5rem;">${stat.label}</div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #666;">
                        <span>总计: ${stat.total}</span>
                        <span>激活: ${stat.active}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 0.9rem; color: #666; margin-top: 0.25rem;">
                        <span>运行中: ${stat.running}</span>
                        <span>已完成: ${stat.completed}</span>
                    </div>
                    <button class="btn btn-sm btn-info" onclick="filterByLabel('${stat.label}')" style="width: 100%; margin-top: 0.5rem; font-size: 0.75rem;">
                        筛选此标签
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteLabel('${stat.label}')" style="font-size: 0.75rem;">
                            🗑️ 删除标签
                            </button>
                </div>
            `).join('')}
        </div>
    `;

    statsContainer.innerHTML = statsHTML;
}

async function filterByLabel(label) {
    if (!currentConfigId) {
        showInfo("提示", '请先选择一台机器');
        return;
    }

    try {
        const response = await apiCall(`/api/urls/by-label/${encodeURIComponent(label)}?config_id=${currentConfigId}`);

        // 设置筛选状态
        currentFilter.type = 'label';
        currentFilter.value = label;
        currentFilter.isActive = true;

        updateUrlList(response.urls);

        const filterInfo = document.getElementById('filterInfo');
        if (filterInfo) {
            filterInfo.innerHTML = `
                <div class="alert alert-info" style="margin-bottom: 1rem;">
                    <strong>当前筛选：</strong>标签 "${label}" (${response.total} 个URL)
                    <button onclick="clearFilter()" class="btn btn-sm btn-secondary" style="margin-left: 1rem;">清除筛选</button>
                </div>
            `;
        }

    } catch (error) {
        console.error('按标签筛选失败:', error);
        showError("失败", '筛选失败');
    }
}


function clearFilterInternal() {
    currentFilter.type = null;
    currentFilter.value = null;
    currentFilter.isActive = false;

    const filterInfo = document.getElementById('filterInfo');
    if (filterInfo) {
        filterInfo.innerHTML = '';
    }
}

function clearFilter() {
    clearFilterInternal();
    loadDashboardData().then(r => {
    });
}

// ================================
// URL运行控制功能
// ================================
async function startUrl(urlId, urlName) {
    try {
        const result = await apiCall(`/api/url/${urlId}/start`, {
            method: 'POST'
        });

        console.log(`URL "${urlName}" 启动成功:`, result);
        await loadDashboardData();
    } catch (error) {
        console.error(`启动URL "${urlName}" 失败:`, error);
    }
}

async function stopUrl(urlId, urlName) {
    try {
        const result = await apiCall(`/api/url/${urlId}/stop`, {
            method: 'POST'
        });

        console.log(`群聊 "${urlName}" 停止成功:`, result);
        await loadDashboardData();
    } catch (error) {
        console.error(`停止群聊 "${urlName}" 失败:`, error);
    }
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
        document.getElementById('editUrlIsActive').checked = urlData.is_active;

        showEditUrlModal();
    } catch (error) {
        console.error('获取群聊信息失败:', error);
        showError("失败", '获取群聊信息失败');
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
        showError("失败", '无效的编辑操作');
        return;
    }

    const data = {
        url: document.getElementById('editUrl').value,
        name: document.getElementById('editName').value,
        duration: parseInt(document.getElementById('editDuration').value),
        max_num: parseInt(document.getElementById('editMaxNum').value),
        is_active: document.getElementById('editUrlIsActive').checked
    };

    try {
        await apiCall(`/api/url/${currentEditingUrlId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        showSuccess("成功", '群聊更新成功!');
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
    if (!currentConfigId) {
        showInfo("提示", '请先选择一台机器');
        return;
    }
    document.getElementById('addUrlModal').style.display = 'block';
}

function hideAddUrlModal() {
    document.getElementById('addUrlModal').style.display = 'none';
}

async function addUrl(event) {
    event.preventDefault();

    if (!currentConfigId) {
        showInfo("提示", '请先选择一台机器');
        return;
    }

    const data = {
        config_id: currentConfigId,
        url: document.getElementById('newUrl').value,
        name: document.getElementById('newName').value,
        duration: parseInt(document.getElementById('newDuration').value),
        max_num: parseInt(document.getElementById('newMaxNum').value)
    };

    try {
        await apiCall('/api/url', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        showSuccess("成功", '添加成功');
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
    if (!await showConfirm('确认删除', `确定要删除群聊 "${urlName}" 吗？此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        await apiCall(`/api/url/${urlId}`, {
            method: 'DELETE'
        });

        showSuccess("成功", '群聊删除成功!');
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// 重置功能
// ================================
async function resetUrlCount(urlId, urlName) {
    if (!await showConfirm('确认重置', `确定要重置群聊 "${urlName}" 的执行计数吗？这将同时停止其运行状态。`, 'primary')) {
        return;
    }

    try {
        await apiCall(`/api/url/${urlId}/reset`, {
            method: 'POST'
        });

        showSuccess("成功" + '群聊发送计数重置成功!');
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function resetAllUrls() {
    if (!currentConfigId) {
        showInfo("提示", '请先选择一台机器');
        return;
    }

    if (!await showConfirm('确认重置', '确定要重置当前机器所有群聊的执行计数吗？这将同时停止所有群聊的运行状态。', 'danger')) return;

    try {
        const result = await apiCall(`/api/config/${currentConfigId}/reset`, {method: 'POST'});
        showInfo("提示", result.message);
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// 机器控制功能
// ================================
async function startCurrentMachine() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        showError("配置出错", '当前机器没有配置代码');
        return;
    }

    try {
        const result = await apiCall(`/api/start`, {
            method: 'POST',
            body: JSON.stringify({pade_code: currentConfigData.pade_code})
        });
        console.log('启动成功:', result);
        await loadDashboardData();
        showSuccess('成功', '当前机器启动成功');
    } catch (error) {
        console.error('启动失败:', error);
        showError("启动失败", '当前机器启动失败');
    }
}

async function stopCurrentMachine() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        showError("配置错误", '当前机器没有配置代码');
        return;
    }

    try {
        const result = await apiCall(`/api/stop`, {
            method: 'POST',
            body: JSON.stringify({pade_code: currentConfigData.pade_code})
        });

        console.log('停止成功:', result);
        await loadDashboardData();
        showSuccess("成功", '当前机器停止成功!');
    } catch (error) {
        console.error('停止失败:', error);
        showError("失败", '当前机器停止失败');
    }
}

async function startAllMachines() {
    if (!availableMachines.length) {
        showError("失败", '没有可用的机器');
        return;
    }

    if (!await showConfirm('确认启动', '确定要启动当前的所有机器吗？', 'danger')) {
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const machine of availableMachines) {
        if (!machine.pade_code || !machine.is_active) continue;

        try {
            await apiCall(`/api/start`, {
                method: 'POST',
                body: JSON.stringify({pade_code: machine.pade_code})
            });
            successCount++;
        } catch (error) {
            console.error(`启动机器 ${machine.name || machine.pade_code} 失败:`, error);
            failCount++;
        }
    }

    showSuccess("成功", `批量启动完成: 成功 ${successCount} 台，失败 ${failCount} 台`);
    await loadDashboardData();
}

async function stopAllMachines() {
    if (!availableMachines.length) {
        showError("错误", '没有可用的机器');
        return;
    }

    if (!await showConfirm('确认停止', '确定要停止所有机器吗？', 'danger')) return;

    let successCount = 0;
    let failCount = 0;

    for (const machine of availableMachines) {
        if (!machine.pade_code) continue;

        try {
            await apiCall(`/api/stop`, {
                method: 'POST',
                body: JSON.stringify({pade_code: machine.pade_code})
            });
            successCount++;
        } catch (error) {
            console.error(`停止机器 ${machine.name || machine.pade_code} 失败:`, error);
            failCount++;
        }
    }

    showSuccess("成功", `批量停止完成: 成功 ${successCount} 台，失败 ${failCount} 台`);
    await loadDashboardData();
}

// ================================
// 机器管理功能
// ================================
function showMachineManagement() {
    document.getElementById('machineManagementModal').style.display = 'block';
    // 每次打开都重新加载最新数据
    loadMachineManagementList().then(r => {
        console.log('机器管理列表已刷新');
    });
}

function hideMachineManagement() {
    document.getElementById('machineManagementModal').style.display = 'none';
}

function showEditMachineModal() {
    // 渲染消息列表UI
    setTimeout(() => {
        renderMessageList();
    }, 100);

    document.getElementById('dashboardEditMachineModal').style.display = 'block';
}

function hideEditMachineModal() {
    document.getElementById('dashboardEditMachineModal').style.display = 'none';
    currentEditingMachineId = null;
}

async function editMachine(machineId) {
    try {
        const response = await apiCall(`/api/machines/${machineId}`);
        const machine = response.machine;

        currentEditingMachineId = machineId;

        document.getElementById('dashboardEditMachineId').value = machine.id;
        document.getElementById('dashboardEditMachineName').value = machine.name || '';
        document.getElementById('dashboardEditMachineMessage').value = machine.message || '';
        document.getElementById('dashboardEditMachineCode').value = machine.pade_code || '';
        document.getElementById('dashboardEditMachineDesc').value = machine.description || '';
        document.getElementById('dashboardEditSuccessTimeMin').value = machine.success_time[0];
        document.getElementById('dashboardEditSuccessTimeMax').value = machine.success_time[1];
        document.getElementById('dashboardEditResetTime').value = machine.reset_time;
        document.getElementById('dashboardEditMachineIsActive').checked = machine.is_active;

        showEditMachineModal();
    } catch (error) {
        console.error('获取机器信息失败:', error);
        showError("失败", '获取机器信息失败');
    }
}

async function saveEditedMachine(event) {
    event.preventDefault();

    if (!currentEditingMachineId) {
        showError("失败", '无效的编辑操作');
        return;
    }

    const data = {
        name: document.getElementById('dashboardEditMachineName').value,
        message: document.getElementById('dashboardEditMachineMessage').value,
        pade_code: document.getElementById('dashboardEditMachineCode').value,
        description: document.getElementById('dashboardEditMachineDesc').value,
        success_time_min: parseInt(document.getElementById('dashboardEditSuccessTimeMin').value),
        success_time_max: parseInt(document.getElementById('dashboardEditSuccessTimeMax').value),
        reset_time: parseInt(document.getElementById('dashboardEditResetTime').value),
        is_active: document.getElementById('dashboardEditMachineIsActive').checked
    };

    try {
        await apiCall(`/api/machines/${currentEditingMachineId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        showSuccess("成功", '机器更新成功!');
        hideEditMachineModal();
        // 刷新机器管理列表
        await loadMachineManagementList();
        // 刷新下拉列表
        await loadMachineList();
        updateCurrentMachineInfo();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function editCurrentMachine() {
    if (!currentConfigId) {
        showError("操作失败", '请先选择一台机器');
        return;
    }
    await editMachine(currentConfigId);
}

async function loadMachineManagementList() {
    try {
        const machines = await apiCall('/api/machines');
        const listDiv = document.getElementById('machineList');

        if (machines.length === 0) {
            listDiv.innerHTML = '<p>暂无机器配置</p>';
            return;
        }

        listDiv.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr style="background: #f8f9fa;">
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">ID</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">名称</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">消息</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">代码</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">状态</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${machines.map(machine => {
            const message = machine.message || '-';
            const displayMessage = message.length > 10 ? message.substring(0, 10) + '...' : message;
            return `
                        <tr>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">${machine.id}</td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">${machine.name || '-'}</td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">
                                <span style="cursor: pointer; color: #007bff; text-decoration: underline;" onclick="showMessageDetail('${message.replace(/'/g, '&#39;')}', '${(machine.name || '机器' + machine.id).replace(/'/g, '&#39;')}')">
                                    ${displayMessage}
                                </span>
                            </td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">${machine.pade_code}</td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">
                                <span class="machine-status ${machine.is_active ? 'status-active' : 'status-inactive'}">
                                    ${machine.is_active ? '激活' : '禁用'}
                                </span>
                            </td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">
                                <button class="btn btn-info btn-sm" onclick="editMachine(${machine.id})">编辑</button>
                                <button class="btn btn-warning btn-sm" onclick="toggleMachine(${machine.id})">
                                    ${machine.is_active ? '禁用' : '激活'}
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="deleteMachine(${machine.id}, '${(machine.name || machine.pade_code).replace(/'/g, '&#39;')}')">删除</button>
                            </td>
                        </tr>
                    `
        }).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        showError('操作失败', error);
    }
}

async function toggleMachine(machineId) {
    try {
        const result = await apiCall(`/api/machines/${machineId}/toggle`, {
            method: 'POST'
        });

        showInfo("提示", result.message);
        // 刷新机器管理列表
        await loadMachineManagementList();
        // 刷新下拉列表
        await loadMachineList();
        updateCurrentMachineInfo();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function deleteMachine(machineId, machineName) {
    if (!await showConfirm('确认删除', `确定要删除机器 "${machineName}" 吗？这将同时删除该机器的所有群聊配置！此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        const result = await apiCall(`/api/machines/${machineId}`, {
            method: 'DELETE'
        });

        showSuccess("删除成功", result.message);

        if (currentConfigId === machineId) {
            currentConfigId = null;
            currentConfigData = null;
        }

        // 刷新机器管理列表
        await loadMachineManagementList();
        // 刷新下拉列表
        await loadMachineList();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}


function stopMonitoring() {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
    }
    console.log('实时监控已停止');
}

function refreshData() {
    if (!currentConfigId) {
        showInfo("提示", '请先选择一台机器');
        return;
    }

    loadDashboardData().then(() => {
        showSuccess("成功", "数据刷新完成");
    }).catch(error => {
        showError("失败", error);
    });
}


document.addEventListener('DOMContentLoaded', async () => {
    await loadMachineList();

    if (currentConfigId) {
        await loadDashboardData();
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentConfigId) {
            loadDashboardData();
        }
    });
});

window.addEventListener('beforeunload', () => {
    stopMonitoring();
});


async function syncNewMachines() {
    if (!await showConfirm('确认同步', '确定要从VMOS同步新机器吗？这将自动添加新机器到系统中。', 'primary')) {
        return;
    }

    try {
        // 显示加载状态
        const syncBtn = document.querySelector('button[onclick="syncNewMachines()"]');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="loading-indicator"></span> 同步中...';
        }

        const result = await apiCall('/api/machines/sync-new', {
            method: 'POST'
        });

        if (result.new_machines_count > 0) {
            showSuccess("成功", `同步成功！添加了 ${result.new_machines_count} 台新机器\n` +
                `现有机器: ${result.existing_machines_count} 台\n` +
                `总计机器: ${result.total_machines} 台`);

            console.log('新增机器详情:', result.created_machines);

            // 刷新下拉列表中的机器列表
            await loadMachineList();

            // 重要：同时刷新机器管理模态框中的列表
            await loadMachineManagementList();

            // 如果当前没有选中机器，选择第一台新机器
            if (!currentConfigId && result.created_machines.length > 0) {
                currentConfigId = result.created_machines[0].id;
                document.getElementById('machineSelect').value = currentConfigId;
                updateCurrentMachineInfo();
                await loadDashboardData();
            }
        } else {
            showInfo("提示", `没有发现新机器\n当前系统中已有 ${result.existing_machines_count} 台机器`);
        }

    } catch (error) {
        console.error('同步新机器失败:', error);
        showError("错误", '同步新机器失败，请检查网络连接或稍后重试');
    } finally {
        // 恢复按钮状态
        const syncBtn = document.querySelector('button[onclick="syncNewMachines()"]');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '🔄 同步新机器';
        }
    }
}


async function syncNewMachinesFromModal() {
    // 关闭VMOS模态框
    document.getElementById('vmosMachinesModal').style.display = 'none';

    try {
        // 显示加载状态
        const syncBtn = document.querySelector('button[onclick="syncNewMachinesFromModal()"]');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<span class="loading-indicator"></span> 同步中...';
        }

        // 执行同步
        const result = await apiCall('/api/machines/sync-new', {
            method: 'POST'
        });

        if (result.new_machines_count > 0) {
            showSuccess("成功", `同步成功！添加了 ${result.new_machines_count} 台新机器\n` +
                `现有机器: ${result.existing_machines_count} 台\n` +
                `总计机器: ${result.total_machines} 台`);

            console.log('新增机器详情:', result.created_machines);

            // 刷新下拉列表中的机器列表
            await loadMachineList();

            // 重要：刷新机器管理模态框中的列表
            await loadMachineManagementList();

            // 如果当前没有选中机器，选择第一台新机器
            if (!currentConfigId && result.created_machines.length > 0) {
                currentConfigId = result.created_machines[0].id;
                document.getElementById('machineSelect').value = currentConfigId;
                updateCurrentMachineInfo();
                await loadDashboardData();
            }
        } else {
            showInfo("提示", `没有发现新机器\n当前系统中已有 ${result.existing_machines_count} 台机器`);
        }

    } catch (error) {
        console.error('同步新机器失败:', error);
        showError("失败", '同步新机器失败，请检查网络连接或稍后重试');
    } finally {
        // 恢复按钮状态
        const syncBtn = document.querySelector('button[onclick="syncNewMachinesFromModal()"]');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '✅ 添加这些新机器到系统';
        }
    }
}

function hideVmosMachinesModal() {
    document.getElementById('vmosMachinesModal').style.display = 'none';
}

async function deleteLabel(label) {
    if (!currentConfigId) {
        showError("提示", '请先选择一台机器');
        return;
    }

    if (!await showConfirm('确认删除', `确定要删除标签 "${label}" 吗？这将清空所有使用该标签的群聊的标签信息。`, 'danger')) {
        return;
    }

    try {
        const response = await apiCall(`/api/urls/labels/${encodeURIComponent(label)}?config_id=${currentConfigId}`, {
            method: 'DELETE'
        });

        showSuccess("成功", `标签 "${label}" 已删除，共影响 ${response.updated_count} 个URL`);

        // 刷新数据
        await loadLabelStats();
        await loadDashboardData();

    } catch (error) {
        console.error('删除标签失败:', error);
        showError("失败", '删除标签失败');
    }
}

async function removeUrlLabel(urlId, urlName, currentLabel) {
    if (!await showConfirm('确认删除', `确定要删除群聊 "${urlName}" 的标签 "${currentLabel}" 吗？`, 'danger')) {
        return;
    }

    try {
        const result = await apiCall(`/api/url/${urlId}/remove-label`, {
            method: 'POST'
        });
        console.log(result);
        showSuccess("成功", `已删除群聊 "${urlName}" 的标签`);
        await loadDashboardData();
        await loadLabelStats();
    } catch (error) {
        console.error('删除群聊标签失败:', error);
        showError('删除群聊标签失败:', error)
    }
}

// ================================
// 仪表板清理管理功能
// ================================

let dashboardAvailableConfigs = [];

function showCleanupManagement() {
    document.getElementById('cleanupManagementModal').style.display = 'block';
    loadDashboardCleanupTasks().then(() => {
        console.log('清理任务列表已加载');
    });
}

function hideCleanupManagement() {
    document.getElementById('cleanupManagementModal').style.display = 'none';
}

async function loadDashboardCleanupTasks() {
    try {
        const tasks = await apiCall('/api/cleanup-tasks');
        displayDashboardCleanupTasks(tasks);
    } catch (error) {
        document.getElementById('dashboardCleanupTasksList').innerHTML = '<p style="color: #dc3545; text-align: center;">加载清理任务失败</p>';
    }
}

function displayDashboardCleanupTasks(tasks) {
    const listDiv = document.getElementById('dashboardCleanupTasksList');

    if (tasks.length === 0) {
        listDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #666;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">🧹</div>
                <h4>暂无清理任务</h4>
                <p>点击"新增任务"创建您的第一个清理任务</p>
                <button class="btn btn-success" onclick="showDashboardAddCleanupTaskModal()">➕ 创建清理任务</button>
            </div>
        `;
        return;
    }

    const cleanupTypeNames = {
        'status': '📊 状态',
        'label': '🏷️ 标签',
        'counts': '🔄 次数'
    };

    listDiv.innerHTML = tasks.map(task => {
        const cleanupTypesText = task.cleanup_types.map(t => cleanupTypeNames[t] || t).join(' ');
        const targetText = task.target_configs ? `${task.target_configs.length}台机器` : '全部机器';
        const isEnabled = task.is_enabled;

        return `
            <div class="cleanup-task-item" style="background: white; border: 1px solid #dee2e6; border-radius: 8px; padding: 1.5rem; margin-bottom: 1rem; transition: all 0.2s ease; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                    <div>
                        <h4 style="margin: 0 0 0.5rem 0; color: #333; display: flex; align-items: center; gap: 0.5rem;">
                            🧹 ${task.name}
                            <span class="machine-status ${isEnabled ? 'status-active' : 'status-inactive'}" style="font-size: 0.75rem;">
                                ${isEnabled ? '✅ 启用' : '❌ 禁用'}
                            </span>
                        </h4>
                        <p style="margin: 0; color: #666; font-size: 0.9rem;">${task.description || '无描述'}</p>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn-info btn-sm" onclick="editDashboardCleanupTask(${task.id})" title="编辑任务">✏️</button>
                        <button class="btn btn-warning btn-sm" onclick="toggleDashboardCleanupTask(${task.id})" title="${isEnabled ? '禁用' : '启用'}任务">
                            ${isEnabled ? '⏸️' : '▶️'}
                        </button>
                        <button class="btn btn-success btn-sm" onclick="executeDashboardCleanupTask(${task.id})" title="立即执行">🚀</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteDashboardCleanupTask(${task.id}, '${task.name.replace(/'/g, '&#39;')}')" title="删除任务">🗑️</button>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: #e3f2fd; padding: 0.75rem; border-radius: 4px; border-left: 4px solid #2196f3;">
                        <div style="font-weight: bold; color: #1976d2; margin-bottom: 0.25rem;">⏰ 执行时间</div>
                        <div style="font-size: 1.1rem; font-weight: bold;">${task.schedule_time}</div>
                    </div>
                    <div style="background: #f3e5f5; padding: 0.75rem; border-radius: 4px; border-left: 4px solid #9c27b0;">
                        <div style="font-weight: bold; color: #7b1fa2; margin-bottom: 0.25rem;">🧹 清理内容</div>
                        <div>${cleanupTypesText}</div>
                    </div>
                    <div style="background: #e8f5e8; padding: 0.75rem; border-radius: 4px; border-left: 4px solid #4caf50;">
                        <div style="font-weight: bold; color: #388e3c; margin-bottom: 0.25rem;">🖥️ 目标范围</div>
                        <div>${targetText}</div>
                    </div>
                </div>
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; font-size: 0.85rem;">
                    <div style="color: #666;">
                        <strong>📅 下次运行:</strong> 
                        ${task.next_run ? new Date(task.next_run).toLocaleString() : '未安排'}
                    </div>
                    <div style="color: #666;">
                        <strong>📝 上次运行:</strong> 
                        ${task.last_run ? new Date(task.last_run).toLocaleString() : '从未执行'}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function showDashboardAddCleanupTaskModal() {
    // 清空表单
    document.getElementById('dashboardCleanupTaskId').value = '';
    document.getElementById('dashboardCleanupTaskTime').value = '03:00';
    document.getElementById('dashboardCleanupTaskEnabled').checked = true;

    // 清空复选框
    document.getElementById('dashboardCleanupStatus').checked = false;
    document.getElementById('dashboardCleanupLabel').checked = false;
    document.getElementById('dashboardCleanupCounts').checked = false;

    // 加载可用配置
    await loadDashboardAvailableConfigs();

    document.getElementById('dashboardAddCleanupTaskModal').style.display = 'block';
}

function hideDashboardAddCleanupTaskModal() {
    document.getElementById('dashboardAddCleanupTaskModal').style.display = 'none';
}

async function loadDashboardAvailableConfigs() {
    try {
        dashboardAvailableConfigs = await apiCall('/api/cleanup-tasks/configs');
        const select = document.getElementById('dashboardCleanupTargetConfigs');
        select.innerHTML = '<option value="">全部机器</option>';

        dashboardAvailableConfigs.forEach(config => {
            const option = document.createElement('option');
            option.value = config.id;
            option.textContent = `${config.name} (${config.pade_code})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('加载配置列表失败:', error);
    }
}

async function saveDashboardCleanupTask(event) {
    event.preventDefault();

    const taskId = document.getElementById('dashboardCleanupTaskId').value;
    const isEdit = !!taskId;

    // 获取清理类型
    const cleanupTypes = [];
    if (document.getElementById('dashboardCleanupStatus').checked) cleanupTypes.push('status');
    if (document.getElementById('dashboardCleanupLabel').checked) cleanupTypes.push('label');
    if (document.getElementById('dashboardCleanupCounts').checked) cleanupTypes.push('counts');

    if (cleanupTypes.length === 0) {
        showError('输入错误', '请至少选择一种清理内容');
        return;
    }

    // 获取目标配置
    const select = document.getElementById('dashboardCleanupTargetConfigs');
    const selectedOptions = Array.from(select.selectedOptions);
    const selectedValues = selectedOptions
        .map(option => option.value)
        .filter(value => value !== '');

    let targetConfigs;

    // 如果没有选择任何机器，或者选择了"全部机器"，则传递所有可用配置的ID
    if (selectedValues.length === 0) {
        // 确保 dashboardAvailableConfigs 已加载
        if (!dashboardAvailableConfigs || dashboardAvailableConfigs.length === 0) {
            await loadDashboardAvailableConfigs();
        }
        targetConfigs = dashboardAvailableConfigs.map(config => config.id);
    } else {
        targetConfigs = selectedValues.map(value => parseInt(value));
    }

    // 根据时间和清理类型自动生成任务名称
    const timeStr = document.getElementById('dashboardCleanupTaskTime').value;
    const typeNames = {
        'status': '状态',
        'label': '标签',
        'counts': '次数'
    };
    const typesText = cleanupTypes.map(t => typeNames[t]).join('+');
    const targetText = selectedValues.length === 0 ? '全部机器' : `${targetConfigs.length}台机器`;
    const autoName = `${timeStr} 清理${typesText} (${targetText})`;

    const data = {
        name: autoName,
        description: `每日${timeStr}清理${typesText}`,
        schedule_time: document.getElementById('dashboardCleanupTaskTime').value,
        cleanup_types: cleanupTypes,
        target_configs: targetConfigs,
        is_enabled: document.getElementById('dashboardCleanupTaskEnabled').checked
    };

    try {
        if (isEdit) {
            await apiCall(`/api/cleanup-tasks/${taskId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            showSuccess('更新成功', '清理任务已更新');
        } else {
            await apiCall('/api/cleanup-tasks', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showSuccess('创建成功', '清理任务已创建');
        }

        hideDashboardAddCleanupTaskModal();
        await loadDashboardCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function editDashboardCleanupTask(taskId) {
    try {
        const task = await apiCall(`/api/cleanup-tasks/${taskId}`);

        // 填充表单
        document.getElementById('dashboardCleanupTaskId').value = task.id;
        document.getElementById('dashboardCleanupTaskTime').value = task.schedule_time;
        document.getElementById('dashboardCleanupTaskEnabled').checked = task.is_enabled;

        // 设置清理类型
        document.getElementById('dashboardCleanupStatus').checked = task.cleanup_types.includes('status');
        document.getElementById('dashboardCleanupLabel').checked = task.cleanup_types.includes('label');
        document.getElementById('dashboardCleanupCounts').checked = task.cleanup_types.includes('counts');

        // 加载配置并设置选中状态
        await loadDashboardAvailableConfigs();
        if (task.target_configs) {
            const select = document.getElementById('dashboardCleanupTargetConfigs');
            Array.from(select.options).forEach(option => {
                option.selected = task.target_configs.includes(parseInt(option.value));
            });
        }

        document.getElementById('dashboardAddCleanupTaskModal').style.display = 'block';
    } catch (error) {
        showError('加载失败', '获取任务信息失败');
    }
}

async function toggleDashboardCleanupTask(taskId) {
    try {
        const result = await apiCall(`/api/cleanup-tasks/${taskId}/toggle`, {
            method: 'POST'
        });
        showInfo('状态更新', result.message);
        await loadDashboardCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function executeDashboardCleanupTask(taskId) {
    if (!await showConfirm('确认执行', '确定要立即执行这个清理任务吗？此操作将清理相应的数据。', 'primary')) {
        return;
    }

    try {
        const result = await apiCall(`/api/cleanup-tasks/${taskId}/execute`, {
            method: 'POST'
        });
        showSuccess('执行成功', result.message);
        await loadDashboardCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function deleteDashboardCleanupTask(taskId, taskName) {
    if (!await showConfirm('确认删除', `确定要删除清理任务 "${taskName}" 吗？此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        const result = await apiCall(`/api/cleanup-tasks/${taskId}`, {
            method: 'DELETE'
        });
        showSuccess('删除成功', result.message);
        await loadDashboardCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}



// 显示未激活群聊列表
async function showInactiveUrls() {
    if (!currentConfigId) {
        showError('错误', '请先选择一台机器');
        return;
    }

    try {
        // 强制重新获取最新数据，不使用缓存
        const response = await apiCall(`/api/config/${currentConfigId}/urls/inactive?_t=${Date.now()}`);

        console.log('显示未激活群聊，获取到:', response); // 调试日志

        if (response.urls.length === 0) {
            showInfo('提示', '当前机器没有未激活的群聊');
            return;
        }

        displayInactiveUrls(response.urls);
        document.getElementById('inactiveUrlsModal').style.display = 'block';
    } catch (error) {
        console.error('获取未激活群聊失败:', error);
        showError('获取失败', '无法获取未激活群聊列表');
    }
}

// 显示未激活群聊模态框
function displayInactiveUrls(urls) {
    const listDiv = document.getElementById('inactiveUrlsList');

    // 过滤掉可能已经激活的群聊（双重检查）
    const actuallyInactiveUrls = urls.filter(url => !url.is_active);

    if (actuallyInactiveUrls.length === 0) {
        hideInactiveUrlsModal();
        showInfo('提示', '所有群聊都已激活！');
        return;
    }

    const contentHTML = `
        <div style="margin-bottom: 1rem;">
            <h4>未激活的群聊 (${actuallyInactiveUrls.length} 个)</h4>
            <p style="color: #666;">以下群聊当前处于未激活状态，您可以选择激活它们：</p>
        </div>
        
        <div style="max-height: 400px; overflow-y: auto;">
            ${actuallyInactiveUrls.map(url => {
        return `
                    <div id="inactive-url-${url.id}" style="background: #fff8dc; border: 1px solid #ffc107; border-radius: 4px; padding: 1rem; margin-bottom: 0.5rem; border-left: 4px solid #ffc107;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div style="flex: 1;">
                                <div style="font-weight: bold; color: #856404; margin-bottom: 0.5rem;">
                                    ${url.name}
                                    ${url.label ? `<span style="background: #17a2b8; color: white; padding: 0.1rem 0.3rem; border-radius: 3px; font-size: 0.75rem; margin-left: 0.5rem;">${url.label}</span>` : ''}
                                </div>
                                <div style="font-size: 0.9rem; color: #666; margin-bottom: 0.5rem;">${url.url}</div>
                                <div style="font-size: 0.8rem; color: #666;">
                                    持续: ${url.duration}秒 | 最大次数: ${url.max_num} | 当前: ${url.current_count}
                                    ${url.Last_time ? ' | 最后执行: ' + new Date(url.Last_time).toLocaleString() : ''}
                                </div>
                            </div>
                            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                                <button class="btn btn-success btn-sm" onclick="activateUrlWithRemove(${url.id}, '${url.name.replace(/'/g, '&#39;')}')" 
                                        style="background: linear-gradient(45deg, #28a745, #20c997); border: none; color: white;">
                                    ✅ 激活
                                </button>
                                <button class="btn btn-info btn-sm" onclick="editUrl(${url.id}); hideInactiveUrlsModal();">
                                    ✏️ 编辑
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="deleteUrlWithRemove(${url.id}, '${url.name.replace(/'/g, '&#39;')}')">
                                    🗑️ 删除
                                </button>
                            </div>
                        </div>
                    </div>
                `;
    }).join('')}
        </div>
        
        <div style="margin-top: 1rem; text-align: center; border-top: 1px solid #ddd; padding-top: 1rem;">
            <button class="btn btn-success" onclick="batchActivateUrls()" 
                    style="background: linear-gradient(45deg, #28a745, #20c997); border: none;">
                ⚡ 批量激活所有群聊 (${actuallyInactiveUrls.length})
            </button>
        </div>
    `;

    listDiv.innerHTML = contentHTML;
}

// 激活单个群聊
async function activateUrl(urlId, urlName) {
    if (!await showConfirm('确认激活', `确定要激活群聊 "${urlName}" 吗？激活后该群聊将重新出现在主列表中。`, 'primary')) {
        return;
    }

    try {
        const result = await apiCall(`/api/url/${urlId}/activate`, {
            method: 'POST'
        });

        showSuccess('激活成功', result.message);

        // 关键修复：强制刷新未激活群聊列表
        await refreshInactiveUrlsList();

        // 重新加载主界面数据
        await loadDashboardData();

    } catch (error) {
        console.error('激活群聊失败:', error);
    }
}

// 批量激活所有未激活群聊
async function batchActivateUrls() {
    if (!currentConfigId) {
        showError('错误', '请先选择一台机器');
        return;
    }

    if (!await showConfirm('确认批量激活', '确定要激活当前机器的所有未激活群聊吗？', 'primary')) {
        return;
    }

    try {
        const result = await apiCall(`/api/config/${currentConfigId}/urls/batch-activate`, {
            method: 'POST'
        });

        showSuccess('批量激活完成', result.message);

        // 关闭未激活群聊窗口
        hideInactiveUrlsModal();

        // 重新加载主界面数据
        await loadDashboardData();

    } catch (error) {
        console.error('批量激活失败:', error);
    }
}

// 隐藏未激活群聊模态框
function hideInactiveUrlsModal() {
    document.getElementById('inactiveUrlsModal').style.display = 'none';
}



function updateUrlStatistics(urlsData) {
    const urlStats = document.getElementById('urlStats');
    if (!urlStats) return;

    const stats = {
        total: urlsData.total || 0,
        active: urlsData.active || 0,
        inactive: urlsData.inactive || 0,
        available: urlsData.available || 0,
        running: urlsData.running || 0
    };

    urlStats.innerHTML = `
        <div class="stat-card">
            <div class="stat-number" style="color: #007bff;">${stats.total}</div>
            <div class="stat-label">总群聊数</div>
        </div>
        <div class="stat-card" style="border-left: 4px solid #28a745;">
            <div class="stat-number" style="color: #28a745;">${stats.active}</div>
            <div class="stat-label">已激活</div>
        </div>
        <div class="stat-card" style="border-left: 4px solid #ffc107;">
            <div class="stat-number" style="color: #f57c00;">${stats.inactive}</div>
            <div class="stat-label">未激活群聊</div>
        </div>
        <div class="stat-card" style="border-left: 4px solid #17a2b8;">
            <div class="stat-number" style="color: #17a2b8;">${stats.available}</div>
            <div class="stat-label">可执行</div>
        </div>
        <div class="stat-card" style="border-left: 4px solid #6f42c1;">
            <div class="stat-number" style="color: #6f42c1;">${stats.running}</div>
            <div class="stat-label">运行中</div>
        </div>
    `;

    // 更新按钮样式
    setTimeout(updateInactiveUrlsButton, 100);
}

// 页面加载时的初始化增强
document.addEventListener('DOMContentLoaded', function() {
    // 监听显示未激活群聊复选框的变化
    const urlCheckbox = document.getElementById('showInactiveUrlsCheckbox');
    if (urlCheckbox) {
        urlCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            showInfo('显示模式', isChecked ? '现在显示所有群聊（包括未激活）' : '现在只显示激活的群聊');
        });
    }

    // 初始化统计区域
    const urlStats = document.getElementById('urlStats');
    if (urlStats && !urlStats.innerHTML.trim()) {
        urlStats.innerHTML = `
            <div class="stat-card">
                <div class="stat-number" id="totalUrls">-</div>
                <div class="stat-label">总群数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="availableUrls">-</div>
                <div class="stat-label">可发送消息群聊</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="totalExecutions">-</div>
                <div class="stat-label">总执行次数</div>
            </div>
            <div class="stat-card">
                <div class="stat-number" id="completedUrls">-</div>
                <div class="stat-label">已完成群聊</div>
            </div>
        `;
    }
});

// 键盘快捷键支持
document.addEventListener('keydown', function(e) {
    // Ctrl + Shift + I: 显示未激活群聊
    if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        showInactiveUrls().then(r => {});
    }

    // Ctrl + Shift + A: 切换显示未激活群聊
    if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        const checkbox = document.getElementById('showInactiveUrlsCheckbox');
        if (checkbox) {
            checkbox.checked = !checkbox.checked;
            checkbox.dispatchEvent(new Event('change'));
        }
    }
});



async function getFullUrlStatistics() {
    if (!currentConfigId) return null;

    try {
        // 获取包含未激活群聊的完整数据
        const response = await apiCall(`/api/config/${currentConfigId}/urls?include_inactive=true`);

        console.log('完整统计数据:', response); // 调试日志

        return {
            total: response.total || 0,
            active: response.active || 0,
            inactive: response.inactive || 0,
            available: response.available || 0,
            running: response.running || 0
        };
    } catch (error) {
        console.error('获取统计信息失败:', error);
        return null;
    }
}



function updateInactiveUrlsButton() {
    const button = document.querySelector('.btn[onclick="showInactiveUrls()"]');
    if (!button) return;

    // 检查是否有未激活群聊
    const inactiveCountElement = document.querySelector('#urlStats .stat-card:nth-child(3) .stat-number');
    const inactiveCount = inactiveCountElement ? parseInt(inactiveCountElement.textContent) : 0;

    if (inactiveCount > 0) {
        button.classList.add('has-inactive');
        button.innerHTML = `📋 未激活群聊 <span style="background: rgba(255,255,255,0.3); padding: 0.1rem 0.3rem; border-radius: 10px; font-size: 0.8rem; margin-left: 0.5rem;">${inactiveCount}</span>`;
    } else {
        button.classList.remove('has-inactive');
        button.innerHTML = '📋 未激活群聊';
    }
}

// 页面初始化时设置按钮更新
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(updateInactiveUrlsButton, 1000);
});



async function refreshInactiveUrlsList() {
    // 检查未激活群聊窗口是否还开着
    const modal = document.getElementById('inactiveUrlsModal');
    if (!modal || modal.style.display === 'none') {
        return; // 窗口已关闭，无需刷新
    }

    if (!currentConfigId) {
        hideInactiveUrlsModal();
        return;
    }

    try {
        const response = await apiCall(`/api/config/${currentConfigId}/urls/inactive`);

        console.log('刷新未激活列表，获取到:', response); // 调试日志

        if (response.urls.length === 0) {
            // 没有未激活群聊了，关闭窗口
            hideInactiveUrlsModal();
            showInfo('提示', '所有群聊都已激活！');
            return;
        }

        // 更新显示
        displayInactiveUrls(response.urls);

    } catch (error) {
        console.error('刷新未激活群聊列表失败:', error);
        // 发生错误时关闭窗口
        hideInactiveUrlsModal();
    }
}




async function activateUrlWithRemove(urlId, urlName) {
    if (!await showConfirm('确认激活', `确定要激活群聊 "${urlName}" 吗？`, 'primary')) {
        return;
    }

    try {
        // 先从界面移除该项目（立即反馈）
        const urlElement = document.getElementById(`inactive-url-${urlId}`);
        if (urlElement) {
            urlElement.style.opacity = '0.5';
            urlElement.style.pointerEvents = 'none';
        }

        const result = await apiCall(`/api/url/${urlId}/activate`, {
            method: 'POST'
        });

        // 立即从DOM中移除
        if (urlElement) {
            urlElement.remove();
        }

        showSuccess('激活成功', result.message);

        // 检查是否还有未激活的群聊
        const remainingItems = document.querySelectorAll('#inactiveUrlsList [id^="inactive-url-"]');
        if (remainingItems.length === 0) {
            hideInactiveUrlsModal();
            showInfo('完成', '所有群聊都已激活！');
        } else {
            // 更新标题中的数量
            const titleElement = document.querySelector('#inactiveUrlsList h4');
            if (titleElement) {
                titleElement.textContent = `未激活的群聊 (${remainingItems.length} 个)`;
            }

            // 更新批量激活按钮
            const batchBtn = document.querySelector('#inactiveUrlsList .btn[onclick="batchActivateUrls()"]');
            if (batchBtn) {
                batchBtn.innerHTML = `⚡ 批量激活所有群聊 (${remainingItems.length})`;
            }
        }

        // 后台刷新主界面数据
        loadDashboardData();

    } catch (error) {
        console.error('激活群聊失败:', error);
        // 恢复元素状态
        if (urlElement) {
            urlElement.style.opacity = '1';
            urlElement.style.pointerEvents = 'auto';
        }
    }
}

// 7. 新增：删除并立即从列表移除的函数
async function deleteUrlWithRemove(urlId, urlName) {
    if (!await showConfirm('确认删除', `确定要删除群聊 "${urlName}" 吗？此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        // 先从界面移除该项目
        const urlElement = document.getElementById(`inactive-url-${urlId}`);
        if (urlElement) {
            urlElement.style.opacity = '0.5';
        }

        await apiCall(`/api/url/${urlId}`, {
            method: 'DELETE'
        });

        // 立即从DOM中移除
        if (urlElement) {
            urlElement.remove();
        }

        showSuccess('删除成功', `群聊 "${urlName}" 已删除`);

        // 检查是否还有项目
        const remainingItems = document.querySelectorAll('#inactiveUrlsList [id^="inactive-url-"]');
        if (remainingItems.length === 0) {
            hideInactiveUrlsModal();
        }

        // 后台刷新主界面数据
        loadDashboardData();

    } catch (error) {
        console.error('删除群聊失败:', error);
        // 恢复元素状态
        if (urlElement) {
            urlElement.style.opacity = '1';
        }
    }
}

// 在 app/static/js/dashboard.js 中添加的多消息管理功能

// 修改仪表板的编辑机器函数，支持多消息编辑
async function editMachine(machineId) {
    try {
        const response = await apiCall(`/api/machines/${machineId}`);
        const machine = response.machine;

        currentEditingMachineId = machineId;

        // 填充基本信息
        document.getElementById('dashboardEditMachineId').value = machine.id;
        document.getElementById('dashboardEditMachineName').value = machine.name || '';
        document.getElementById('dashboardEditMachineCode').value = machine.pade_code || '';
        document.getElementById('dashboardEditMachineDesc').value = machine.description || '';
        document.getElementById('dashboardEditSuccessTimeMin').value = machine.success_time[0];
        document.getElementById('dashboardEditSuccessTimeMax').value = machine.success_time[1];
        document.getElementById('dashboardEditResetTime').value = machine.reset_time;
        document.getElementById('dashboardEditMachineIsActive').checked = machine.is_active;

        // 处理消息字段 - 先设置隐藏字段值再解析
        const messageField = document.getElementById('dashboardEditMachineMessage');
        messageField.value = machine.message || '';

        // 解析消息为数组
        const messages = machine.message ? machine.message.split('----').map(msg => msg.trim()).filter(msg => msg) : [];
        currentMessages = messages;

        showEditMachineModal();
    } catch (error) {
        console.error('获取机器信息失败:', error);
        showError("失败", '获取机器信息失败');
    }
}

// 仪表板版本的渲染消息列表函数
function renderDashboardMessageList() {
    const container = document.getElementById('dashboardMessagesContainer');
    if (!container) {
        // 如果容器不存在，说明是在管理页面，使用管理页面的渲染函数
        renderMessageList();
        return;
    }

    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label style="font-weight: bold; color: #333;">发送的消息列表:</label>
            <small style="display: block; color: #666; margin-top: 0.25rem;">
                可以添加多条消息，系统会自动用"----"连接
            </small>
        </div>
        
        <div id="dashboardMessagesList" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem; background: #f8f9fa;">
            ${currentMessages.length === 0 ?
        '<p style="color: #666; text-align: center; margin: 1rem 0;">暂无消息，请点击下方按钮添加</p>' :
        currentMessages.map((msg, index) => `
                    <div class="message-item" style="display: flex; align-items: center; padding: 0.5rem; margin-bottom: 0.5rem; background: white; border-radius: 4px; border: 1px solid #e0e0e0;">
                        <span style="flex: 1; padding-right: 1rem; word-break: break-all;">${msg}</span>
                        <div style="display: flex; gap: 0.25rem;">
                            <button type="button" class="btn btn-info btn-sm" onclick="editMessage(${index})" title="编辑">✏️</button>
                            <button type="button" class="btn btn-warning btn-sm" onclick="moveMessageUp(${index})" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="btn btn-warning btn-sm" onclick="moveMessageDown(${index})" title="下移" ${index === currentMessages.length - 1 ? 'disabled' : ''}>↓</button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="removeMessage(${index})" title="删除">🗑️</button>
                        </div>
                    </div>
                `).join('')
    }
        </div>
        
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem; align-items: flex-end;">
            <div style="flex: 1;">
                <input 
                    type="text" 
                    id="dashboardNewMessageInput" 
                    placeholder="输入新消息内容..."
                    style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;"
                    onkeypress="handleDashboardMessageInputKeyPress(event)"
                >
            </div>
            <button type="button" class="btn btn-success btn-sm" onclick="addNewDashboardMessage()">➕ 添加消息</button>
        </div>
    `;

    // 更新消息计数
    const countElement = document.getElementById('dashboardMessageCount');
    if (countElement) {
        countElement.textContent = currentMessages.length;
    }
}

// 仪表板版本的添加新消息函数
function addNewDashboardMessage() {
    const input = document.getElementById('dashboardNewMessageInput') || document.getElementById('newMessageInput');
    const message = input.value.trim();

    if (!message) {
        showError('输入错误', '请输入消息内容');
        return;
    }

    if (currentMessages.includes(message)) {
        showWarning('重复消息', '该消息已存在，请输入不同的内容');
        return;
    }

    currentMessages.push(message);
    input.value = '';
    updateDashboardHiddenMessageField();
    renderDashboardMessageList();

    showSuccess('添加成功', `消息 "${message}" 已添加`);
}

// 仪表板版本的处理输入框回车事件
function handleDashboardMessageInputKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addNewDashboardMessage();
    }
}

// 仪表板版本的更新隐藏消息字段
function updateDashboardHiddenMessageField() {
    const hiddenField = document.getElementById('dashboardEditMachineMessage');
    if (hiddenField) {
        hiddenField.value = currentMessages.join('----');
    }
}

// 通用函数：智能检测当前环境并调用相应的渲染函数
function renderMessageList() {
    // 检测当前是在管理页面还是仪表板页面
    const dashboardContainer = document.getElementById('dashboardMessagesContainer');
    const adminContainer = document.getElementById('messagesContainer');

    if (dashboardContainer) {
        renderDashboardMessageList();
    } else if (adminContainer) {
        renderAdminMessageList();
    }
}

// 管理页面版本的渲染函数
function renderAdminMessageList() {
    const container = document.getElementById('messagesContainer');
    if (!container) return;

    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <label style="font-weight: bold; color: #333;">发送的消息列表:</label>
        </div>
        
        <div id="messagesList" style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem; background: #f8f9fa;">
            ${currentMessages.length === 0 ?
        '<p style="color: #666; text-align: center; margin: 1rem 0;">暂无消息，请点击下方按钮添加</p>' :
        currentMessages.map((msg, index) => `
                    <div class="message-item" style="display: flex; align-items: center; padding: 0.5rem; margin-bottom: 0.5rem; background: white; border-radius: 4px; border: 1px solid #e0e0e0;">
                        <span style="flex: 1; padding-right: 1rem; word-break: break-all;">${msg}</span>
                        <div style="display: flex; gap: 0.25rem;">
                            <button type="button" class="btn btn-info btn-sm" onclick="editMessage(${index})" title="编辑">✏️</button>
                            <button type="button" class="btn btn-warning btn-sm" onclick="moveMessageUp(${index})" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="btn btn-warning btn-sm" onclick="moveMessageDown(${index})" title="下移" ${index === currentMessages.length - 1 ? 'disabled' : ''}>↓</button>
                            <button type="button" class="btn btn-danger btn-sm" onclick="removeMessage(${index})" title="删除">🗑️</button>
                        </div>
                    </div>
                `).join('')
    }
        </div>
        
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem; align-items: flex-end;">
            <div style="flex: 1;">
                <input 
                    type="text" 
                    id="newMessageInput" 
                    placeholder="输入新消息内容..."
                    style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px;"
                    onkeypress="handleMessageInputKeyPress(event)"
                >
            </div>
            <button type="button" class="btn btn-success btn-sm" onclick="addNewMessage()">➕ 添加消息</button>
        </div>
    `;

    // 更新消息计数
    const countElement = document.getElementById('messageCount');
    if (countElement) {
        countElement.textContent = currentMessages.length;
    }
}

// 通用的添加新消息函数
function addNewMessage() {
    // 检测当前环境
    const dashboardInput = document.getElementById('dashboardNewMessageInput');
    const adminInput = document.getElementById('newMessageInput');

    if (dashboardInput) {
        addNewDashboardMessage();
    } else if (adminInput) {
        const message = adminInput.value.trim();

        if (!message) {
            showError('输入错误', '请输入消息内容');
            return;
        }

        if (currentMessages.includes(message)) {
            showWarning('重复消息', '该消息已存在，请输入不同的内容');
            return;
        }

        currentMessages.push(message);
        adminInput.value = '';
        updateHiddenMessageField();
        renderMessageList();

        showSuccess('添加成功', `消息 "${message}" 已添加`);
    }
}

// 通用的更新隐藏消息字段函数
function updateHiddenMessageField() {
    // 检测当前环境并更新相应的隐藏字段
    const dashboardField = document.getElementById('dashboardEditMachineMessage');
    const adminField = document.getElementById('editMachineMessage');

    const messageText = currentMessages.join('----');

    if (dashboardField) {
        dashboardField.value = messageText;
    }
    if (adminField) {
        adminField.value = messageText;
    }
}

// 通用的处理输入框回车事件
function handleMessageInputKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addNewMessage();
    }
}

