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
        alert('操作失败: ' + error.message);
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
        updateUrlList(urlsData.urls);

        // 加载标签统计
        await loadLabelStats();

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

    if (urls.length === 0) {
        urlList.innerHTML = '<div style="padding: 2rem; text-align: center; color: #666;">当前机器暂无URL配置</div>';
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
        alert('请先选择一台机器');
        return;
    }

    try {
        const response = await apiCall(`/api/urls/by-label/${encodeURIComponent(label)}?config_id=${currentConfigId}`);

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
        alert('筛选失败');
    }
}

function clearFilter() {
    const filterInfo = document.getElementById('filterInfo');
    if (filterInfo) {
        filterInfo.innerHTML = '';
    }

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
        document.getElementById('editName').value = urlData.original_name || urlData.name;
        document.getElementById('editDuration').value = urlData.duration;
        document.getElementById('editMaxNum').value = urlData.max_num;
        document.getElementById('editIsActive').checked = urlData.is_active;
        document.getElementById('editLabel').value = urlData.label || '(暂无标签)';

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
        await apiCall(`/api/url/${currentEditingUrlId}`, {
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
    if (!currentConfigId) {
        alert('请先选择一台机器');
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
        alert('请先选择一台机器');
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
        await apiCall(`/api/url/${urlId}`, {
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
    if (!confirm(`确定要重置URL "${urlName}" 的执行计数吗？这将同时停止其运行状态。`)) {
        return;
    }

    try {
        await apiCall(`/api/url/${urlId}/reset`, {
            method: 'POST'
        });

        alert('URL计数重置成功!');
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function resetAllUrls() {
    if (!currentConfigId) {
        alert('请先选择一台机器');
        return;
    }

    if (!confirm('确定要重置当前机器所有URL的执行计数吗？这将同时停止所有URL的运行状态。')) return;

    try {
        const result = await apiCall(`/api/config/${currentConfigId}/reset`, { method: 'POST' });
        alert(result.message);
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
        alert('当前机器没有配置代码');
        return;
    }

    try {
        const result = await apiCall(`/api/start`, {
            method: 'POST',
            body: JSON.stringify({ pade_code: currentConfigData.pade_code })
        });

        console.log('启动成功:', result);
        await loadDashboardData();
        alert('当前机器启动成功!');
    } catch (error) {
        console.error('启动失败:', error);
        alert('当前机器启动失败');
    }
}

async function stopCurrentMachine() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        alert('当前机器没有配置代码');
        return;
    }

    try {
        const result = await apiCall(`/api/stop`, {
            method: 'POST',
            body: JSON.stringify({ pade_code: currentConfigData.pade_code })
        });

        console.log('停止成功:', result);
        await loadDashboardData();
        alert('当前机器停止成功!');
    } catch (error) {
        console.error('停止失败:', error);
        alert('当前机器停止失败');
    }
}

async function startAllMachines() {
    if (!availableMachines.length) {
        alert('没有可用的机器');
        return;
    }

    if (!confirm('确定要启动所有机器吗？')) {
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

    alert(`批量启动完成: 成功 ${successCount} 台，失败 ${failCount} 台`);
    await loadDashboardData();
}

async function stopAllMachines() {
    if (!availableMachines.length) {
        alert('没有可用的机器');
        return;
    }

    if (!confirm('确定要停止所有机器吗？')) return;

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

    alert(`批量停止完成: 成功 ${successCount} 台，失败 ${failCount} 台`);
    await loadDashboardData();
}

// ================================
// 机器管理功能
// ================================
function showMachineManagement() {
    document.getElementById('machineManagementModal').style.display = 'block';
    loadMachineManagementList();
}

function hideMachineManagement() {
    document.getElementById('machineManagementModal').style.display = 'none';
}

function showEditMachineModal() {
    document.getElementById('editMachineModal').style.display = 'block';
}

function hideEditMachineModal() {
    document.getElementById('editMachineModal').style.display = 'none';
    currentEditingMachineId = null;
}

async function editMachine(machineId) {
    try {
        const response = await apiCall(`/api/machines/${machineId}`);
        const machine = response.machine;

        currentEditingMachineId = machineId;

        document.getElementById('editMachineId').value = machine.id;
        document.getElementById('editMachineName').value = machine.name || '';
        document.getElementById('editMachineMessage').value = machine.message || '';
        document.getElementById('editMachineCode').value = machine.pade_code || '';
        document.getElementById('editMachineDesc').value = machine.description || '';
        document.getElementById('editSuccessTimeMin').value = machine.success_time[0];
        document.getElementById('editSuccessTimeMax').value = machine.success_time[1];
        document.getElementById('editResetTime').value = machine.reset_time;
        document.getElementById('editIsActive').checked = machine.is_active;

        showEditMachineModal();
    } catch (error) {
        console.error('获取机器信息失败:', error);
        alert('获取机器信息失败');
    }
}

async function saveEditedMachine(event) {
    event.preventDefault();

    if (!currentEditingMachineId) {
        alert('无效的编辑操作');
        return;
    }

    const data = {
        name: document.getElementById('editMachineName').value,
        message: document.getElementById('editMachineMessage').value,
        pade_code: document.getElementById('editMachineCode').value,
        description: document.getElementById('editMachineDesc').value,
        success_time_min: parseInt(document.getElementById('editSuccessTimeMin').value),
        success_time_max: parseInt(document.getElementById('editSuccessTimeMax').value),
        reset_time: parseInt(document.getElementById('editResetTime').value),
        is_active: document.getElementById('editIsActive').checked
    };

    try {
        await apiCall(`/api/machines/${currentEditingMachineId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        alert('机器更新成功!');
        hideEditMachineModal();
        await loadMachineManagementList();
        await loadMachineList();
        updateCurrentMachineInfo();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function editCurrentMachine() {
    if (!currentConfigId) {
        alert('请先选择一台机器');
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
        console.error('加载机器管理列表失败:', error);
    }
}

async function toggleMachine(machineId) {
    try {
        const result = await apiCall(`/api/machines/${machineId}/toggle`, {
            method: 'POST'
        });

        alert(result.message);
        await loadMachineManagementList();
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

        alert(result.message);

        if (currentConfigId === machineId) {
            currentConfigId = null;
            currentConfigData = null;
        }

        await loadMachineManagementList();
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
        alert('请先选择一台机器');
        return;
    }

    loadDashboardData().then(() => {
        alert("数据刷新完成");
    }).catch(error => {
        alert("刷新失败");
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