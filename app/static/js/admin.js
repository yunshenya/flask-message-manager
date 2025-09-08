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
    } else if (tabName === 'cleanup') {
        loadCleanupTasks().then(r => {});
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


// ================================
// 清理任务管理功能
// ================================

let availableConfigs = [];

async function loadCleanupTasks() {
    try {
        const tasks = await apiCall('/api/cleanup-tasks');
        displayCleanupTasks(tasks);
    } catch (error) {
        document.getElementById('cleanupTasksTable').innerHTML = '<p>加载失败</p>';
    }
}

function displayCleanupTasks(tasks) {
    const tableDiv = document.getElementById('cleanupTasksTable');

    if (tasks.length === 0) {
        tableDiv.innerHTML = '<p>暂无清理任务</p>';
        return;
    }

    tableDiv.innerHTML = `
        <div style="overflow-x: auto;">
            <table style="min-width: 1000px;">
                <thead>
                    <tr>
                        <th style="width: 60px;">ID</th>
                        <th style="width: 150px;">任务名称</th>
                        <th style="width: 100px;">执行时间</th>
                        <th style="width: 120px;">清理内容</th>
                        <th style="width: 100px;">目标机器</th>
                        <th style="width: 80px;">状态</th>
                        <th style="width: 140px;">下次运行</th>
                        <th style="width: 140px;">上次运行</th>
                        <th style="width: 200px;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${tasks.map(task => {
        const cleanupTypeNames = {
            'status': '状态',
            'label': '标签',
            'counts': '次数'
        };
        const cleanupTypesText = task.cleanup_types.map(t => cleanupTypeNames[t] || t).join(', ');
        const targetText = task.target_configs ? `${task.target_configs.length}台机器` : '全部机器';

        return `
                            <tr>
                                <td>${task.id}</td>
                                <td title="${task.description || ''}">${task.name}</td>
                                <td>${task.schedule_time}</td>
                                <td>${cleanupTypesText}</td>
                                <td>${targetText}</td>
                                <td>
                                    <span class="machine-status ${task.is_enabled ? 'status-active' : 'status-inactive'}">
                                        ${task.is_enabled ? '启用' : '禁用'}
                                    </span>
                                </td>
                                <td style="font-size: 0.85em;">
                                    ${task.next_run ? new Date(task.next_run).toLocaleString() : '-'}
                                </td>
                                <td style="font-size: 0.85em;">
                                    ${task.last_run ? new Date(task.last_run).toLocaleString() : '从未执行'}
                                </td>
                                <td>
                                    <button class="btn btn-info btn-sm" onclick="editCleanupTask(${task.id})" style="margin: 2px;">编辑</button>
                                    <button class="btn btn-warning btn-sm" onclick="toggleCleanupTask(${task.id})" style="margin: 2px;">
                                        ${task.is_enabled ? '禁用' : '启用'}
                                    </button>
                                    <button class="btn btn-success btn-sm" onclick="executeCleanupTask(${task.id})" style="margin: 2px;">立即执行</button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteCleanupTask(${task.id}, '${task.name.replace(/'/g, '&#39;')}')" style="margin: 2px;">删除</button>
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

async function showAddCleanupTaskModal() {
    // 清空表单
    document.getElementById('cleanupTaskId').value = '';
    document.getElementById('cleanupTaskTime').value = '03:00';
    document.getElementById('cleanupTaskEnabled').checked = true;

    // 清空复选框
    document.getElementById('cleanupStatus').checked = false;
    document.getElementById('cleanupLabel').checked = false;
    document.getElementById('cleanupCounts').checked = false;

    // 加载可用配置
    await loadAvailableConfigs();

    document.getElementById('addCleanupTaskModal').style.display = 'block';
}

function hideAddCleanupTaskModal() {
    document.getElementById('addCleanupTaskModal').style.display = 'none';
}

async function loadAvailableConfigs() {
    try {
        availableConfigs = await apiCall('/api/cleanup-tasks/configs');
        const select = document.getElementById('cleanupTargetConfigs');
        select.innerHTML = '<option value="">全部机器</option>';

        availableConfigs.forEach(config => {
            const option = document.createElement('option');
            option.value = config.id;
            option.textContent = `${config.name} (${config.pade_code})`;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('加载配置列表失败:', error);
    }
}

async function saveCleanupTask(event) {
    event.preventDefault();

    const taskId = document.getElementById('cleanupTaskId').value;
    const isEdit = !!taskId;

    // 获取清理类型
    const cleanupTypes = [];
    if (document.getElementById('cleanupStatus').checked) cleanupTypes.push('status');
    if (document.getElementById('cleanupLabel').checked) cleanupTypes.push('label');
    if (document.getElementById('cleanupCounts').checked) cleanupTypes.push('counts');

    if (cleanupTypes.length === 0) {
        showError('输入错误', '请至少选择一种清理内容');
        return;
    }

    // 获取目标配置
    const select = document.getElementById('cleanupTargetConfigs');
    const selectedOptions = Array.from(select.selectedOptions);
    const selectedValues = selectedOptions
        .map(option => option.value)
        .filter(value => value !== '');

    let targetConfigs;

    // 如果没有选择任何机器，或者选择了"全部机器"，则传递所有可用配置的ID
    if (selectedValues.length === 0) {
        targetConfigs = availableConfigs.map(config => config.id);
    } else {
        targetConfigs = selectedValues.map(value => parseInt(value));
    }

    // 自动生成任务名称
    const timeStr = document.getElementById('cleanupTaskTime').value;
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
        description: `自动生成的清理任务：每日${timeStr}清理${typesText}`,
        schedule_time: document.getElementById('cleanupTaskTime').value,
        cleanup_types: cleanupTypes,
        target_configs: targetConfigs, // 总是传递具体的ID列表
        is_enabled: document.getElementById('cleanupTaskEnabled').checked
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

        hideAddCleanupTaskModal();
        await loadCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function editCleanupTask(taskId) {
    try {
        const task = await apiCall(`/api/cleanup-tasks/${taskId}`, {
            method: 'GET'
        });

        console.log('获取到的任务数据:', task); // 调试用

        // 先加载可用配置
        await loadAvailableConfigs();

        // 填充表单
        document.getElementById('cleanupTaskId').value = task.id;
        document.getElementById('cleanupTaskTime').value = task.schedule_time;
        document.getElementById('cleanupTaskEnabled').checked = task.is_enabled;

        // 清空所有复选框
        document.getElementById('cleanupStatus').checked = false;
        document.getElementById('cleanupLabel').checked = false;
        document.getElementById('cleanupCounts').checked = false;

        // 设置清理类型
        if (task.cleanup_types && Array.isArray(task.cleanup_types)) {
            if (task.cleanup_types.includes('status')) {
                document.getElementById('cleanupStatus').checked = true;
            }
            if (task.cleanup_types.includes('label')) {
                document.getElementById('cleanupLabel').checked = true;
            }
            if (task.cleanup_types.includes('counts')) {
                document.getElementById('cleanupCounts').checked = true;
            }
        }

        // 设置目标配置选择
        const select = document.getElementById('cleanupTargetConfigs');
        // 先清空所有选择
        Array.from(select.options).forEach(option => {
            option.selected = false;
        });

        // 如果有目标配置，设置选中状态
        if (task.target_configs && Array.isArray(task.target_configs)) {
            Array.from(select.options).forEach(option => {
                if (option.value && task.target_configs.includes(parseInt(option.value))) {
                    option.selected = true;
                }
            });
        }

        console.log('表单设置完成'); // 调试用
        document.getElementById('addCleanupTaskModal').style.display = 'block';

    } catch (error) {
        console.error('编辑任务失败:', error); // 调试用
        showError('加载失败', '获取任务信息失败: ' + error.message);
    }
}

async function toggleCleanupTask(taskId) {
    try {
        const result = await apiCall(`/api/cleanup-tasks/${taskId}/toggle`, {
            method: 'POST'
        });
        showInfo('状态更新', result.message);
        await loadCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function executeCleanupTask(taskId) {
    if (!await showConfirm('确认执行', '确定要立即执行这个清理任务吗？', 'primary')) {
        return;
    }

    try {
        const result = await apiCall(`/api/cleanup-tasks/${taskId}/execute`, {
            method: 'POST'
        });
        showSuccess('执行成功', result.message);
        await loadCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function deleteCleanupTask(taskId, taskName) {
    if (!await showConfirm('确认删除', `确定要删除清理任务 "${taskName}" 吗？此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        const result = await apiCall(`/api/cleanup-tasks/${taskId}`, {
            method: 'DELETE'
        });
        showSuccess('删除成功', result.message);
        await loadCleanupTasks();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}
