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
let currentConfigId = null;
let currentConfigData = null;
let systemRunningMap = new Map();
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
            option.textContent = `${machine.pade_code}`;
            select.appendChild(option);
        });

        // 如果没有选中的机器，默认选择第一台
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
        systemRunningMap.clear(); // 清除运行状态
        updateCurrentMachineInfo();
        loadDashboardData().then(r => {});
    }
}

function updateCurrentMachineInfo() {
    const infoDiv = document.getElementById('currentMachineInfo');
    const statusSpan = document.getElementById('currentMachineStatus');
    const codeSpan = document.getElementById('currentMachineCode');

    if (!currentConfigId || !availableMachines.length) {
        infoDiv.style.display = 'none';
        return;
    }

    const machine = availableMachines.find(m => m.id === currentConfigId);
    if (machine) {
        codeSpan.textContent = machine.pade_code || '无代码';
        statusSpan.textContent = machine.is_active ? '激活' : '禁用';
        statusSpan.className = `machine-status ${machine.is_active ? 'status-active' : 'status-inactive'}`;
        infoDiv.style.display = 'flex';
    } else {
        infoDiv.style.display = 'none';
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
        const isSystemRunning = systemRunningMap.get(url.id) || false;
        const progressPercent = (url.current_count / url.max_num) * 100;

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
    const machineName = currentConfigData ? currentConfigData.pade_code : '未选择';
    document.title = `消息管理系统 - ${machineName} (${time})`;
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
    if (!currentConfigId) {
        alert('请先选择一台机器');
        return;
    }

    if (!confirm('确定要重置当前机器所有URL的执行计数吗？')) return;

    try {
        const result = await apiCall(`/api/config/${currentConfigId}/reset`, { method: 'POST' });
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

        // 标记所有可用URL为运行状态
        const urlsData = await apiCall(`/api/config/${currentConfigId}/urls`);
        urlsData.urls.forEach(url => {
            if (url.can_execute && url.is_active) {
                systemRunningMap.set(url.id, true);
            }
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

        systemRunningMap.clear();
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
            console.error(`启动机器 ${machine.pade_code} 失败:`, error);
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
            console.error(`停止机器 ${machine.pade_code} 失败:`, error);
            failCount++;
        }
    }

    systemRunningMap.clear();
    alert(`批量停止完成: 成功 ${successCount} 台，失败 ${failCount} 台`);
    await loadDashboardData();
}

// ================================
// 机器管理功能
// ================================
function showMachineManagement() {
    document.getElementById('machineManagementModal').style.display = 'block';
    loadMachineManagementList().then(r => {});
}

function hideMachineManagement() {
    document.getElementById('machineManagementModal').style.display = 'none';
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
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">代码</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">状态</th>
                        <th style="padding: 0.5rem; border: 1px solid #ddd;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${machines.map(machine => `
                        <tr>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">${machine.id}</td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">${machine.name}</td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">${machine.pade_code}</td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">
                                <span class="machine-status ${machine.is_active ? 'status-active' : 'status-inactive'}">
                                    ${machine.is_active ? '激活' : '禁用'}
                                </span>
                            </td>
                            <td style="padding: 0.5rem; border: 1px solid #ddd;">
                                <button class="btn btn-warning btn-sm" onclick="toggleMachine(${machine.id})">
                                    ${machine.is_active ? '禁用' : '激活'}
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="deleteMachine(${machine.id}, '${machine.pade_code}')">删除</button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error('加载机器管理列表失败:', error);
    }
}

async function addMachine(event) {
    event.preventDefault();

    const data = {
        name:  document.getElementById('newMachineName').value,
        message : document.getElementById('newMachineMessage').value,
        pade_code: document.getElementById('newMachineCode').value,
        description: document.getElementById('newMachineDesc').value
    };

    try {
        const result = await apiCall('/api/machines', {
            method: 'POST',
            body: JSON.stringify(data)
        });

        alert('机器添加成功!');
        document.querySelector('#machineManagementModal form').reset();
        await loadMachineManagementList();
        await loadMachineList();
    } catch (error) {
        // 错误已在apiCall中处理
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

        // 如果删除的是当前选中的机器，重置选择
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
        if (document.hidden || !currentConfigId) return; // 页面隐藏或未选择机器时不刷新

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
    // 初始加载机器列表
    await loadMachineList();

    // 如果有机器可用，加载第一台机器的数据
    if (currentConfigId) {
        await loadDashboardData();
    }

    // 启动实时监控
    startMonitoring(5000); // 5秒刷新一次

    // 页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && currentConfigId) {
            loadDashboardData(); // 页面显示时立即刷新
        }
    });
});

// 页面卸载时清理
window.addEventListener('beforeunload', () => {
    stopMonitoring();
});