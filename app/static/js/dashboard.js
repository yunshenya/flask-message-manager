// JavaScript代码用于动态交互
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

// 编辑URL相关的全局变量
let currentEditingUrlId = null;
let currentConfigData = null; // 存储当前配置数据
let executingUrls = new Set(); // 存储正在执行的URL ID
let systemRunningMap = new Map(); // 存储每个URL的系统运行状态 urlId -> boolean

// 编辑URL函数
async function editUrl(urlId) {
    try {
        // 获取URL详细信息
        const response = await apiCall(`/api/url/${urlId}`);
        const urlData = response.url_data;

        currentEditingUrlId = urlId;

        // 填充编辑表单
        document.getElementById('editUrlId').value = urlData.id;
        document.getElementById('editUrl').value = urlData.url;
        document.getElementById('editName').value = urlData.name;
        document.getElementById('editDuration').value = urlData.duration;
        document.getElementById('editMaxNum').value = urlData.max_num;
        document.getElementById('editIsActive').checked = urlData.is_active;

        // 显示编辑模态框
        showEditUrlModal();
    } catch (error) {
        console.error('获取URL信息失败:', error);
        alert('获取URL信息失败');
    }
}

// 显示编辑模态框
function showEditUrlModal() {
    document.getElementById('editUrlModal').style.display = 'block';
}

// 隐藏编辑模态框
function hideEditUrlModal() {
    document.getElementById('editUrlModal').style.display = 'none';
    currentEditingUrlId = null;
}

// 保存编辑后的URL
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

        alert('URL更新成功!' + JSON.stringify(result));
        hideEditUrlModal();
        await loadDashboardData(); // 重新加载数据
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// 删除URL函数
async function deleteUrl(urlId, urlName) {
    if (!confirm(`确定要删除URL "${urlName}" 吗？此操作不可撤销。`)) {
        return;
    }

    try {
        const result = await apiCall(`/api/url/${urlId}`, {
            method: 'DELETE'
        });

        alert('URL删除成功!');
        await loadDashboardData(); // 重新加载数据
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// 重置单个URL计数
async function resetUrlCount(urlId, urlName) {
    if (!confirm(`确定要重置URL "${urlName}" 的执行计数吗？`)) {
        return;
    }

    try {
        const result = await apiCall(`/api/url/${urlId}/reset`, {
            method: 'POST'
        });

        // 从执行中集合移除（如果存在）
        executingUrls.delete(urlId);

        // 重置系统运行状态
        systemRunningMap.delete(urlId);

        alert('URL计数重置成功!');
        await loadDashboardData(); // 重新加载数据
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function loadDashboardData() {
    try {
        const [statusData, urlsData] = await Promise.all([
            apiCall('/api/config/1/status'),
            apiCall('/api/config/1/urls')
        ]);

        // 保存配置数据
        currentConfigData = statusData.config;

        // 安全地更新统计数据
        const totalUrlsEl = document.getElementById('totalUrls');
        const availableUrlsEl = document.getElementById('availableUrls');
        const totalExecutionsEl = document.getElementById('totalExecutions');
        const completedUrlsEl = document.getElementById('completedUrls');

        if (totalUrlsEl) totalUrlsEl.textContent = statusData.total_urls;
        if (availableUrlsEl) availableUrlsEl.textContent = statusData.available_urls;
        if (totalExecutionsEl) totalExecutionsEl.textContent = statusData.total_executions;
        if (completedUrlsEl) completedUrlsEl.textContent = statusData.completed_urls;

        // 更新URL列表
        const urlList = document.getElementById('urlList');
        if (!urlList) {
            console.error('urlList element not found');
            return;
        }

        console.log('当前systemRunningMap状态:', Object.fromEntries(systemRunningMap));

        urlList.innerHTML = urlsData.urls.map(url => {
            const isExecuting = executingUrls.has(url.id);
            const isSystemRunning = systemRunningMap.get(url.id) || false;

            console.log(`URL ${url.name} (ID: ${url.id}): can_execute=${url.can_execute}, isExecuting=${isExecuting}, isSystemRunning=${isSystemRunning}, Map有这个ID吗:${systemRunningMap.has(url.id)}`);

            let buttonContent;

            if (!url.can_execute) {
                // URL已完成最大执行次数，显示已完成状态
                buttonContent = `<span class="btn btn-info btn-sm">已完成 (${url.current_count}/${url.max_num})</span>`;
            } else {
                // URL可以执行，显示按钮
                let buttonText, buttonClass, buttonDisabled;

                if (isExecuting) {
                    buttonText = '执行中...';
                    buttonClass = 'btn btn-warning btn-sm';
                    buttonDisabled = 'disabled';
                } else if (isSystemRunning) {
                    buttonText = '已启动';
                    buttonClass = 'btn btn-success btn-sm';
                    buttonDisabled = '';
                } else {
                    buttonText = '未执行';
                    buttonClass = 'btn btn-secondary btn-sm';
                    buttonDisabled = '';
                }

                buttonContent = `<button class="${buttonClass}" onclick="executeUrlAndStart(${url.id})" ${buttonDisabled}>${buttonText}</button>`;
            }

            return `
            <div class="url-item">
                <div class="url-info">
                    <div class="url-name">${url.name}</div>
                    <div class="url-link">${url.url}</div>
                    <div class="url-meta">
                        <small>持续: ${url.duration}秒 | 最大次数: ${url.max_num} | 当前: ${url.current_count} | 状态: ${url.is_active ? '激活' : '禁用'}</small>
                    </div>
                </div>
                <div class="url-stats">
                    <span>${url.current_count}/${url.max_num}</span>
                    <div class="progress">
                        <div class="progress-bar" style="width: ${(url.current_count / url.max_num) * 100}%"></div>
                    </div>
                    <div class="url-actions">
                        ${buttonContent}
                        <button class="btn btn-info btn-sm" onclick="editUrl(${url.id})">编辑</button>
                        <button class="btn btn-secondary btn-sm" onclick="resetUrlCount(${url.id}, '${url.name}')">重置</button>
                        <button class="btn btn-warning btn-sm" onclick="deleteUrl(${url.id}, '${url.name}')">删除</button>
                    </div>
                </div>
            </div>
        `}).join('');
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

// 修改后的执行URL函数，执行后自动启动机器
async function executeUrlAndStart(urlId) {
    // 检查是否已经在执行中
    if (executingUrls.has(urlId)) {
        console.log(`URL ${urlId} is already executing`);
        return;
    }

    try {
        // 添加到执行中的URL集合
        executingUrls.add(urlId);

        // 重新渲染按钮状态
        await loadDashboardData();

        // 先执行URL
        const result = await apiCall(`/api/url/${urlId}/execute`, { method: 'POST' });

        systemRunningMap.set(urlId, true);

        alert('执行成功: ' + result.message);

    } catch (error) {
        console.error('执行失败:', error);
    } finally {
        // 无论成功失败，都从执行中集合移除
        executingUrls.delete(urlId);

        // 重新加载数据
        await loadDashboardData();
    }
}


// 批量执行所有可用URL
async function executeAvailable() {
    if (!confirm('确定要执行所有可用的URL吗？')) return;

    try {
        // 获取当前URL数据
        const urlsData = await apiCall('/api/config/1/urls');
        const availableUrls = urlsData.urls.filter(url => url.can_execute && url.is_active);

        if (availableUrls.length === 0) {
            alert('没有可执行的URL');
            return;
        }

        let successCount = 0;
        let failCount = 0;

        // 首先将所有要执行的URL添加到执行中状态
        availableUrls.forEach(url => {
            executingUrls.add(url.id);
        });

        // 立即更新UI显示所有URL为"执行中"状态
        await loadDashboardData();

        // 逐个执行可用的URL
        for (let i = 0; i < availableUrls.length; i++) {
            const url = availableUrls[i];

            try {
                const result = await apiCall(`/api/url/${url.id}/execute`, { method: 'POST' });
                systemRunningMap.set(url.id, true); // 设置为已启动状态
                successCount++;

                console.log(`✓ URL ${url.name} 执行成功`);

            } catch (error) {
                console.error(`✗ URL ${url.name} 执行失败:`, error);
                failCount++;
            }

            // 从执行中移除当前URL并更新UI
            executingUrls.delete(url.id);
            await loadDashboardData();

            // 如果不是最后一个，稍微延迟一下以便用户看到状态变化
            if (i < availableUrls.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }

        // 执行完成后启动机器
        if (successCount > 0 && currentConfigData && currentConfigData.pade_code) {
            console.log('正在启动机器...');
            await startMachine(currentConfigData.pade_code);
        }

        alert(`批量执行完成！\n成功: ${successCount}个\n失败: ${failCount}个`);

    } catch (error) {
        console.error('批量执行失败:', error);
        // 清理所有执行状态
        executingUrls.clear();
        await loadDashboardData();
        alert('批量执行过程中发生错误，请查看控制台日志');
    }
}

// 启动全部机器
async function startAllMachines() {

    if (!currentConfigData || !currentConfigData.pade_code) {
        alert('没有找到机器配置信息');
        return;
    }

    if (!confirm('确定要启动机器吗？这将标记所有可用的URL为已启动状态。')) {
        return;
    }

    try {
        // 启动机器
        await startMachine(currentConfigData.pade_code);
        await executeAvailable()
        // 获取当前URL数据
        const urlsData = await apiCall('/api/config/1/urls');
        const availableUrls = urlsData.urls.filter(url => url.can_execute && url.is_active);
        availableUrls.forEach(url => {
            console.log(`正在设置URL ${url.id} 为已启动状态`);
            systemRunningMap.set(url.id, true);
        });

        console.log('设置完成后的systemRunningMap:', Object.fromEntries(systemRunningMap));

        // 更新界面
        await loadDashboardData();
    } catch (error) {
        console.error('启动机器失败:', error);
        alert('启动机器失败，请检查网络连接和配置');
    }
}

// 停止全部机器
async function stopAllMachines() {
    if (!currentConfigData || !currentConfigData.pade_code) {
        alert('没有找到机器配置信息');
        return;
    }

    if (!confirm('确定要停止机器吗？这将重置所有URL的运行状态。')) return;

    try {
        await stopMachine(currentConfigData.pade_code);
        alert('机器停止成功！');
    } catch (error) {
        console.error('停止机器失败:', error);
    }
}

async function resetAllUrls() {
    if (!confirm('确定要重置所有URL的执行计数吗？')) return;

    try {
        const result = await apiCall('/api/config/1/reset', { method: 'POST' });

        // 清空执行中的URL集合
        executingUrls.clear();

        // 清空所有系统运行状态
        systemRunningMap.clear();

        alert(result.message);
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

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

function refreshData() {
    loadDashboardData().then(r => {
        alert("刷新数据完成");
    });
}

// 启动机器函数
async function startMachine(padeCode = null) {
    // 如果没有传递 padeCode，使用配置中的
    const code = padeCode || (currentConfigData ? currentConfigData.pade_code : null);

    if (!code) {
        alert('请提供 pade_code 参数');
        return;
    }

    try {
        const result = await apiCall(`/api/start`, {
            method: 'POST',
            body: JSON.stringify({
                pade_code: code
            })
        });

        console.log('启动成功: ' + result.message + ' (设备: ' + code + ')');
        await loadDashboardData();
    } catch (error) {
        console.error('启动失败:', error);
        throw error; // 重新抛出错误以便上层处理
    }
}

// 停止机器函数
async function stopMachine(padeCode = null) {
    const code = padeCode || (currentConfigData ? currentConfigData.pade_code : null);

    if (!code) {
        alert('请提供 pade_code 参数');
        return;
    }

    try {
        const result = await apiCall(`/api/stop`, {
            method: 'POST',
            body: JSON.stringify({
                pade_code: code
            })
        });

        // 停止成功后，清空所有URL的系统运行状态
        systemRunningMap.clear();

        console.log('停止成功: ' + result.message + ' (设备: ' + code + ')');
        await loadDashboardData();
    } catch (error) {
        console.error('停止失败:', error);
        throw error; // 重新抛出错误以便上层处理
    }
}

// 页面加载时初始化数据
document.addEventListener('DOMContentLoaded', loadDashboardData);