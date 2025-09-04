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

        // 更新统计数据
        document.getElementById('totalUrls').textContent = statusData.total_urls;
        document.getElementById('availableUrls').textContent = statusData.available_urls;
        document.getElementById('totalExecutions').textContent = statusData.total_executions;
        document.getElementById('completedUrls').textContent = statusData.completed_urls;

        // 更新URL列表
        const urlList = document.getElementById('urlList');
        urlList.innerHTML = urlsData.urls.map(url => `
            <div class="url-item">
                <div class="url-info">
                    <div class="url-name">${url.name}</div>
                    <div class="url-link">${url.url}</div>
                    <div class="url-meta">
                        <small>持续: ${url.duration}秒 | 最大次数: ${url.max_num} | 状态: ${url.is_active ? '激活' : '禁用'}</small>
                    </div>
                </div>
                <div class="url-stats">
                    <span>${url.current_count}/${url.max_num}</span>
                    <div class="progress">
                        <div class="progress-bar" style="width: ${(url.current_count / url.max_num) * 100}%"></div>
                    </div>
                    <div class="url-actions">
                        ${url.can_execute ?
            `<button class="btn btn-primary btn-sm" onclick="executeUrl(${url.id}})">执行</button>` :
            `<span class="btn btn-warning btn-sm">已完成</span>`
        }
                        <button class="btn btn-info btn-sm" onclick="editUrl(${url.id})">编辑</button>
                        <button class="btn btn-info btn-sm" onclick="start(${url.pade_code})" >开始</button>
                        <button class="btn btn-secondary btn-sm" onclick="resetUrlCount(${url.id}, '${url.name}')">重置</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteUrl(${url.id}, '${url.name}')">删除</button>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('加载数据失败:', error);
    }
}

async function executeUrl(urlId) {
    try {
        const result = await apiCall(`/api/url/${urlId}/execute`, { method: 'POST' });
        alert('执行成功: ' + result.message);
        await loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function resetAllUrls() {
    if (!confirm('确定要重置所有URL的执行计数吗？')) return;

    try {
        const result = await apiCall('/api/config/1/reset', { method: 'POST' });
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
        alert("刷星数据")
    });
}

// 页面加载时初始化数据
document.addEventListener('DOMContentLoaded', loadDashboardData);


async function start(pade_code) {
    if (!pade_code) {
        alert('请提供pade_code参数');
        return;
    }

    try {
        const result = await apiCall(`/api/start`, {
            method: 'POST',
            body: JSON.stringify({
                pade_code: pade_code  // 发送JSON数据
            })
        });

        alert('启动成功: ' + result.message);
        isSystemRunning = true;
        updateSystemControls();
        await loadDashboardData();
    } catch (error) {
        console.error('启动失败:', error);
    }
}