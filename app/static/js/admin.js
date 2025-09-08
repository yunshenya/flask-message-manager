// 全局变量
let currentEditingMachineId = null;

// 显示编辑机器模态框
function showEditMachineModal() {
    document.getElementById('editMachineModal').style.display = 'block';
}

// 隐藏编辑机器模态框
function hideEditMachineModal() {
    document.getElementById('editMachineModal').style.display = 'none';
    currentEditingMachineId = null;
}

// 保存编辑的机器
async function saveEditedMachine(event) {
    event.preventDefault();

    if (!currentEditingMachineId) {
        showError('编辑失败', '无效的编辑操作');
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
        const result = await apiCall(`/api/machines/${currentEditingMachineId}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });

        showSuccess('更新成功', '机器配置已成功更新');
        hideEditMachineModal();
        await loadMachines();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// 标签页切换功能
function switchTab(tabName) {
    // 隐藏所有标签页内容
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => content.classList.remove('active'));

    // 移除所有标签的活动状态
    const tabs = document.querySelectorAll('.tab');
    tabs.forEach(tab => tab.classList.remove('active'));

    // 显示选中的标签页内容
    document.getElementById(tabName + '-tab').classList.add('active');

    // 设置选中的标签为活动状态
    event.target.classList.add('active');

    // 如果切换到机器管理，加载机器列表
    if (tabName === 'machines') {
        loadMachines().then(r => {
        });
    }
}

// API调用辅助函数
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
            throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API调用错误:', error);
        showError('操作失败', error.message);
        throw error;
    }
}

// 加载机器列表
async function loadMachines() {
    try {
        const machines = await apiCall('/api/machines');
        displayMachines(machines);
    } catch (error) {
        document.getElementById('machinesTable').innerHTML = '<p>加载失败</p>';
    }
}

// 显示机器列表
function displayMachines(machines) {
    const tableDiv = document.getElementById('machinesTable');

    if (machines.length === 0) {
        tableDiv.innerHTML = '<p>暂无机器配置</p>';
        return;
    }

    const tableHTML = `
            <div style="overflow-x: auto;">
                <table style="min-width: 1000px;">
                    <thead>
                        <tr>
                            <th style="width: 60px;">ID</th>
                            <th style="width: 120px;">名称</th>
                            <th style="width: 150px;">消息</th>
                            <th style="width: 150px;">代码</th>
                            <th style="width: 200px;">描述</th>
                            <th style="width: 80px;">状态</th>
                            <th style="width: 100px;">时间配置</th>
                            <th style="width: 140px;">创建时间</th>
                            <th style="width: 200px;">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${machines.map(machine => {
        const message = machine.message || '-';
        const displayMessage = message.length > 5 ? message.substring(0, 5) + '...' : message;
        return `
                            <tr>
                                <td style="width: 60px;">${machine.id}</td>
                                <td style="width: 120px; word-wrap: break-word;">${machine.name || '-'}</td>
                                <td style="width: 150px;">
                                    <span class="message-link" onclick="showMessageDetail('${message.replace(/'/g, '&#39;')}', '${(machine.name || '机器' + machine.id).replace(/'/g, '&#39;')}')">
                                        ${displayMessage}
                                    </span>
                                </td>
                                <td style="width: 150px; font-family: monospace; font-size: 0.85em;">${machine.pade_code}</td>
                                <td style="width: 200px; word-wrap: break-word;">${machine.description || '-'}</td>
                                <td style="width: 80px;">
                                    <span class="machine-status ${machine.is_active ? 'status-active' : 'status-inactive'}">
                                        ${machine.is_active ? '激活' : '禁用'}
                                    </span>
                                </td>
                                <td style="width: 100px;">${machine.success_time[0]}-${machine.success_time[1]}秒</td>
                                <td style="width: 140px; font-size: 0.85em;">${new Date(machine.created_at).toLocaleString()}</td>
                                <td style="width: 200px;">
                                    <button class="btn btn-info" onclick="editMachine(${machine.id})" style="margin: 2px;">编辑</button>
                                    <button class="btn btn-warning" onclick="toggleMachine(${machine.id})" style="margin: 2px;">
                                        ${machine.is_active ? '禁用' : '激活'}
                                    </button>
                                    <button class="btn btn-danger" onclick="deleteMachine(${machine.id}, '${(machine.name || machine.message).replace(/'/g, '&#39;')}')" style="margin: 2px;">删除</button>
                                </td>
                            </tr>
                        `
    }).join('')}
                    </tbody>
                </table>
            </div>
        `;

    tableDiv.innerHTML = tableHTML;
}

// 切换机器状态
async function toggleMachine(machineId) {
    try {
        const result = await apiCall(`/api/machines/${machineId}/toggle`, {
            method: 'POST'
        });

        showInfo("请求返回", result.message);
        await loadMachines();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function editMachine(machineId) {
    try {
        // 获取机器信息
        const response = await apiCall(`/api/machines/${machineId}`);
        const machine = response.machine;

        currentEditingMachineId = machineId;

        // 填充编辑表单
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
        showError("失败", '获取机器信息失败');
    }
}

// 删除机器
async function deleteMachine(machineId, machineName) {
    if (!await showConfirm("删除", `确定要删除机器 "${machineName}" 吗？这将同时删除该机器的所有URL配置！此操作不可撤销。`)) {
        return;
    }

    try {
        const result = await apiCall(`/api/machines/${machineId}`, {
            method: 'DELETE'
        });

        showInfo("提示", result.message);
        await loadMachines();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// 刷新机器列表
async function refreshMachines() {
    await loadMachines();
    showInfo("提示", '机器列表已刷新');
}

// 批量启动机器
async function batchStartMachines() {
    if (!await showConfirm('确认启动', '确定要启动所有激活的机器吗？', 'primary')) return;

    try {
        const result = await apiCall('/api/machines/batch-start', {
            method: 'POST',
            body: JSON.stringify({})
        });

        showInfo("返回值", result.message);
        console.log('批量启动结果:', result.results);
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// 批量停止机器
async function batchStopMachines() {
    if (!await showConfirm('确认停止', '确定要停止所有机器吗？', 'danger')) return;

    try {
        const result = await apiCall('/api/machines/batch-stop', {
            method: 'POST',
            body: JSON.stringify({})
        });

        showInfo("返回值", result.message);
        console.log('批量停止结果:', result.results);
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

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

            // 刷新机器列表
            await loadMachineList();

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
        const syncBtn = document.querySelector('button[onclick="syncNewMachines()"]');
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = '🔄 同步新机器';
        }
    }
}

async function syncNewMachinesFromModal() {
    // 关闭模态框
    document.getElementById('vmosMachinesModal').style.display = 'none';

    // 执行同步
    await syncNewMachines();
}

function hideVmosMachinesModal() {
    document.getElementById('vmosMachinesModal').style.display = 'none';
}

async function confirmToggleUser(userId, username, isActiveStr, toggleUrl) {
    const isActive = isActiveStr === 'True';
    const action = isActive ? '禁用' : '激活';
    const type = isActive ? 'danger' : 'primary';

    if (await showConfirm(`确认${action}`, `确定要${action}用户 "${username}" 吗？`, type)) {
        try {
            showInfo('处理中', `正在${action}用户...`);
            window.location.href = toggleUrl;
        } catch (error) {
            showError(`${action}失败`, `${action}用户时发生错误`);
        }
    }
}

async function confirmDeleteUser(userId, username, deleteUrl) {
    if (await showConfirm('确认删除', `确定删除用户 "${username}" 吗？此操作不可撤销。`, 'danger')) {
        try {
            showInfo('处理中', '正在删除用户...');
            window.location.href = deleteUrl;
        } catch (error) {
            showError('删除失败', '删除用户时发生错误');
        }
    }
}