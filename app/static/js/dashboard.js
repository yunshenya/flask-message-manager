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
                </div>
                <div class="url-stats">
                    <span>${url.current_count}/${url.max_num}</span>
                    <div class="progress">
                        <div class="progress-bar" style="width: ${(url.current_count / url.max_num) * 100}%"></div>
                    </div>
                    ${url.can_execute ?
            `<button class="btn btn-primary" onclick="executeUrl(${url.id})">执行</button>` :
            `<span class="btn btn-warning">已完成</span>`
        }
                    <button class="btn btn-danger" onclick="editUrl(${url.id})">编辑</button>
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
        loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function resetAllUrls() {
    if (!confirm('确定要重置所有URL的执行计数吗？')) return;

    try {
        const result = await apiCall('/api/config/1/reset', { method: 'POST' });
        alert(result.message);
        loadDashboardData();
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
        loadDashboardData();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

function refreshData() {
    loadDashboardData();
}

// 页面加载时初始化数据
document.addEventListener('DOMContentLoaded', loadDashboardData);