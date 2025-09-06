// 显示消息详情
function showMessageDetail(message, machineName) {
    document.getElementById('messageDetailTitle').textContent = `${machineName} - 消息详情`;
    document.getElementById('messageDetailContent').textContent = message;
    document.getElementById('messageDetailModal').style.display = 'block';
}

// 隐藏消息详情
function hideMessageDetail() {
    document.getElementById('messageDetailModal').style.display = 'none';
}

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
        showError("失败",'操作失败: ' + error.message);
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

// 新增：筛选状态管理
let currentFilter = {
    type: null, // 'label' 或 null
    value: null, // 筛选值
    isActive: false
};

// ================================
// 机器管理功能
// ================================
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
        loadDashboardData();
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

// ================================
// 数据加载和状态监控
// ================================
async function loadDashboardData() {
    if (!currentConfigId) {
        console.warn('没有选中的机器');
        return;
    }

    try {
        const [statusData, urlsData] = await Promise.all([
            apiCall(`/api/config/${currentConfigId}/status`),
            apiCall(`/api/config/${currentConfigId}/urls`)
        ]);

        currentConfigData = statusData.config;
        updateStatistics(statusData);

        // 根据当前筛选状态决定显示哪些URL
        if (currentFilter.isActive && currentFilter.type === 'label') {
            // 如果有筛选状态，应用筛选
            await applyCurrentFilter();
        } else {
            // 没有筛选，显示所有URL
            updateUrlList(urlsData.urls);
        }

        // 加载标签统计
        await loadLabelStats();

        lastUpdateTime = Date.now();
        updatePageTitle();

    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

// 新增：应用当前筛选
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

function updateUrlList(urls) {
    const urlList = document.getElementById('urlList');
    if (!urlList) return;

    if (urls.length === 0) {
        const emptyMessage = currentFilter.isActive
            ? `没有找到标签为 "${currentFilter.value}" 的URL`
            : '当前机器暂无URL配置';
        urlList.innerHTML = `<div style="padding: 2rem; text-align: center; color: #666;">${emptyMessage}</div>`;
        return;
    }

    urlList.innerHTML = urls.map(url => {
        const progressPercent = (url.current_count / url.max_num) * 100;
        let statusButton = getStatusButton(url);
        let runningInfo = getRunningInfo(url);

        // 为有标签的URL添加特殊样式
        const hasLabel = url.label && url.label.trim();
        const labelClass = hasLabel ? 'url-item-labeled' : '';

        return `
            <div class="url-item ${url.current_count >= url.max_num ? 'completed' : ''} ${url.is_running ? 'running' : ''} ${labelClass}">
                <div class="url-info">
                    <div class="url-name">
                        ${url.name}
                        ${hasLabel ? `<span class="url-label-badge">${url.label}</span>` : ''}
                        ${runningInfo}
                    </div>
                    <div class="url-link">${url.url}</div>
                    
                    <!-- 实时状态显示 -->
                    <div class="status-display ${url.status && url.status.trim() ? 'has-status' : 'empty'}" id="status-${url.id}">
                        <div class="status-indicator ${url.is_running ? 'active' : ''}"></div>
                        <div class="status-label">状态</div>
                        <div class="status-content ${url.status && url.status.trim() ? '' : 'empty'}">
                            ${url.status && url.status.trim() ? url.status : '暂无状态信息'}
                        </div>
                    </div>
                    
                    <div class="url-meta">
                        <small>
                            持续: ${url.duration}秒 | 
                            最大次数: ${url.max_num} | 
                            当前: ${url.current_count} | 
                            状态: ${url.is_active ? '激活' : '禁用'}
                            ${url.Last_time ? ' | 最后执行: ' + new Date(url.Last_time).toLocaleString() : ''}
                            ${getRunningDurationInfo(url)}
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
                        ${getControlButtons(url)}
                        <button class="btn btn-info btn-sm" onclick="editUrl(${url.id})">编辑</button>
                        <button class="btn btn-secondary btn-sm" onclick="resetUrlCount(${url.id}, '${url.name}')">重置</button>
                        <button class="btn btn-warning btn-sm" onclick="deleteUrl(${url.id}, '${url.name}')">删除</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
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

function getRunningDurationInfo(url) {
    if (!url.started_at || !url.running_duration) {
        return '';
    }

    if (url.running_duration > 0) {
        const hours = Math.floor(url.running_duration / 3600);
        const minutes = Math.floor((url.running_duration % 3600) / 60);
        const seconds = url.running_duration % 60;

        let duration = '';
        if (hours > 0) duration += `${hours}时`;
        if (minutes > 0) duration += `${minutes}分`;
        duration += `${seconds}秒`;

        const statusText = url.is_running ? '运行时长' : '运行了';
        return ` | ${statusText}: ${duration}`;
    }

    return '';
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

// ================================
// 标签统计功能
// ================================
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
        showError("失败",'筛选失败');
    }
}

// 内部清除筛选函数（不触发数据重新加载）
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
    loadDashboardData();
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

        console.log(`URL "${urlName}" 停止成功:`, result);
        await loadDashboardData();
    } catch (error) {
        console.error(`停止URL "${urlName}" 失败:`, error);
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
        console.error('获取URL信息失败:', error);
        showError("失败", '获取URL信息失败');
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

        showSuccess("成功", 'URL更新成功!');
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
    if (!await showConfirm('确认删除', `确定要删除URL "${urlName}" 吗？此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        await apiCall(`/api/url/${urlId}`, {
            method: 'DELETE'
        });

        showSuccess("成功", 'URL删除成功!');
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// ================================
// 重置功能
// ================================
async function resetUrlCount(urlId, urlName) {
    if (!await showConfirm('确认重置', `确定要重置URL "${urlName}" 的执行计数吗？这将同时停止其运行状态。`, 'warning')) {
        return;
    }

    try {
        await apiCall(`/api/url/${urlId}/reset`, {
            method: 'POST'
        });

        showSuccess("成功" + 'URL计数重置成功!');
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

    if (!await showConfirm('确认重置', '确定要重置当前机器所有URL的执行计数吗？这将同时停止所有URL的运行状态。', 'warning')) return;

    try {
        const result = await apiCall(`/api/config/${currentConfigId}/reset`, { method: 'POST' });
        showInfo("提示",result.message);
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
            body: JSON.stringify({ pade_code: currentConfigData.pade_code })
        });
        console.log('启动成功:', result);
        await loadDashboardData();
        showSuccess('成功', '当前机器启动成功');
    } catch (error) {
        console.error('启动失败:', error);
        showError("启动失败",'当前机器启动失败');
    }
}

async function stopCurrentMachine() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        showError("配置错误",'当前机器没有配置代码');
        return;
    }

    try {
        const result = await apiCall(`/api/stop`, {
            method: 'POST',
            body: JSON.stringify({ pade_code: currentConfigData.pade_code })
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

    if (!await showConfirm('确认重置', '确定要重置当前机器所有URL的执行计数吗？这将同时停止所有URL的运行状态。', 'secondary')) {
        return;
    }

    let successCount = 0;
    let failCount = 0;

    for (const machine of availableMachines) {
        if (!machine.pade_code || !machine.is_active) continue;

        try {
            await apiCall(`/api/start`, {
                method: 'POST',
                body: JSON.stringify({ pade_code: machine.pade_code })
            });
            successCount++;
        } catch (error) {
            console.error(`启动机器 ${machine.name || machine.pade_code} 失败:`, error);
            failCount++;
        }
    }

    showSuccess("成功",`批量启动完成: 成功 ${successCount} 台，失败 ${failCount} 台`);
    await loadDashboardData();
}

async function stopAllMachines() {
    if (!availableMachines.length) {
        showError("错误",'没有可用的机器');
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
                body: JSON.stringify({ pade_code: machine.pade_code })
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
        showError("操作失败",'请先选择一台机器');
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
                    `}).join('')}
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

        showInfo("提示",result.message);
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
    if (!confirm(`确定要删除机器 "${machineName}" 吗？这将同时删除该机器的所有URL配置！`)) {
        return;
    }

    try {
        const result = await apiCall(`/api/machines/${machineId}`, {
            method: 'DELETE'
        });

        showInfo("提示",result.message);

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

// ================================
// 实时监控功能
// ================================
function startMonitoring(intervalMs = 5000) {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }

    console.log(`开始实时监控，刷新间隔: ${intervalMs}ms`);

    monitoringInterval = setInterval(async () => {
        if (document.hidden || !currentConfigId) return;

        try {
            // 实时监控时保持筛选状态
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
    if (!currentConfigId) {
        showInfo("提示",'请先选择一台机器');
        return;
    }

    loadDashboardData().then(() => {
        showSuccess("成功", "数据刷新完成");
    }).catch(error => {
        showError("失败", "刷新失败");
    });
}

// ================================
// 页面初始化
// ================================
document.addEventListener('DOMContentLoaded', async () => {
    await loadMachineList();

    if (currentConfigId) {
        await loadDashboardData();
    }

    startMonitoring(5000);

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
    if (!await showConfirm('确认同步', '确定要从VMOS API同步新机器吗？这将自动添加新机器到系统中。', 'primary')) {
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
            showInfo("提示",`没有发现新机器\n当前系统中已有 ${result.existing_machines_count} 台机器`);
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

async function showVmosMachinesList() {
    try {
        // 显示加载状态
        const vmosModal = document.getElementById('vmosMachinesModal');
        vmosModal.style.display = 'block';

        const contentDiv = document.getElementById('vmosMachinesContent');
        contentDiv.innerHTML = '<p style="text-align: center; color: #666;">加载中...</p>';

        const result = await apiCall('/api/machines/vmos-list');

        // 构建HTML内容
        let html = `
            <div style="margin-bottom: 1rem;">
                <h4>VMOS机器列表概览</h4>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                    <div style="background: #e3f2fd; padding: 1rem; border-radius: 4px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #1976d2;">${result.total_vmos_machines}</div>
                        <div>VMOS总机器数</div>
                    </div>
                    <div style="background: #e8f5e8; padding: 1rem; border-radius: 4px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #388e3c;">${result.existing_machines_count}</div>
                        <div>已存在机器</div>
                    </div>
                    <div style="background: #fff3e0; padding: 1rem; border-radius: 4px; text-align: center;">
                        <div style="font-size: 1.5rem; font-weight: bold; color: #f57c00;">${result.new_machines_count}</div>
                        <div>新发现机器</div>
                    </div>
                </div>
            </div>
        `;

        if (result.new_machines_count > 0) {
            html += `
                <div style="margin-bottom: 2rem;">
                    <h5 style="color: #f57c00;">🆕 新发现的机器 (${result.new_machines_count} 台)</h5>
                    <div style="max-height: 300px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8f9fa; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">机器代码</th>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">机器名称</th>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">类型</th>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">状态</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            result.new_machines.forEach(machine => {
                html += `
                    <tr>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee; font-family: monospace;">${machine.padCode}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${machine.padName || '-'}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${machine.goodName || '-'}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee;">
                            <span style="padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.8rem; background: #fff3cd; color: #856404;">
                                ${machine.status || '未知'}
                            </span>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                    <div style="margin-top: 1rem; text-align: center;">
                        <button class="btn btn-success" onclick="syncNewMachinesFromModal()" style="margin-right: 1rem;">
                            ✅ 添加这些新机器到系统
                        </button>
                    </div>
                </div>
            `;
        }

        if (result.existing_machines_count > 0) {
            html += `
                <div>
                    <h5 style="color: #388e3c;">✅ 已存在的机器 (${result.existing_machines_count} 台)</h5>
                    <div style="max-height: 200px; overflow-y: auto; border: 1px solid #ddd; border-radius: 4px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <thead style="background: #f8f9fa; position: sticky; top: 0;">
                                <tr>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">机器代码</th>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">机器名称</th>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">类型</th>
                                    <th style="padding: 0.5rem; border-bottom: 1px solid #ddd; text-align: left;">状态</th>
                                </tr>
                            </thead>
                            <tbody>
            `;

            result.existing_machines.forEach(machine => {
                html += `
                    <tr style="background: #f9f9f9;">
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee; font-family: monospace;">${machine.padCode}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${machine.padName || '-'}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee;">${machine.goodName || '-'}</td>
                        <td style="padding: 0.5rem; border-bottom: 1px solid #eee;">
                            <span style="padding: 0.2rem 0.5rem; border-radius: 3px; font-size: 0.8rem; background: #d4edda; color: #155724;">
                                ${machine.status || '已存在'}
                            </span>
                        </td>
                    </tr>
                `;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
        }

        contentDiv.innerHTML = html;

    } catch (error) {
        console.error('获取VMOS机器列表失败:', error);
        document.getElementById('vmosMachinesContent').innerHTML =
            '<p style="color: #dc3545; text-align: center;">获取VMOS机器列表失败</p>';
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
            showSuccess("成功",`同步成功！添加了 ${result.new_machines_count} 台新机器\n` +
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
            showInfo("提示",`没有发现新机器\n当前系统中已有 ${result.existing_machines_count} 台机器`);
        }

    } catch (error) {
        console.error('同步新机器失败:', error);
        showError("失败",'同步新机器失败，请检查网络连接或稍后重试');
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