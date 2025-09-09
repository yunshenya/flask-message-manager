// 全局变量
let currentEditingMachineId = null;
// 全局变量存储消息列表
let currentMessages = [];

// 显示编辑机器模态框
function showEditMachineModal() {
    // 清空当前消息列表
    currentMessages = [];

    // 如果有现有消息，解析并添加到列表
    const existingMessage = document.getElementById('editMachineMessage').value;
    if (existingMessage) {
        currentMessages = existingMessage.split('----').map(msg => msg.trim()).filter(msg => msg);
    }

    // 渲染消息列表
    renderMessageList();

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
    } else if (tabName === 'system-config') {
        loadSystemConfigs().then(r => {
            console.log('系统配置已加载');
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
        const includeInactive = document.getElementById('showInactiveCheckbox')?.checked || false;
        const endpoint = includeInactive ? '/api/machines/all?include_inactive=true' : '/api/machines';

        const response = await apiCall(endpoint);
        const machines = response.machines || response;

        displayMachines(machines);

        // 更新统计信息
        if (response.total_count !== undefined) {
            updateMachineStats(response);
        }

    } catch (error) {
        document.getElementById('machinesTable').innerHTML = '<p>加载失败</p>';
    }
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
        const response = await apiCall(`/api/machines/${machineId}`);
        const machine = response.machine;

        currentEditingMachineId = machineId;

        // 填充基本信息
        document.getElementById('editMachineId').value = machine.id;
        document.getElementById('editMachineName').value = machine.name || '';
        document.getElementById('editMachineCode').value = machine.pade_code || '';
        document.getElementById('editMachineDesc').value = machine.description || '';
        document.getElementById('editSuccessTimeMin').value = machine.success_time[0];
        document.getElementById('editSuccessTimeMax').value = machine.success_time[1];
        document.getElementById('editResetTime').value = machine.reset_time;
        document.getElementById('editIsActive').checked = machine.is_active;

        // 处理消息字段 - 先设置值再解析
        const messageField = document.getElementById('editMachineMessage');
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

// ================================
// 系统配置管理功能
// ================================

let systemConfigs = {};
let currentEditingConfigId = null;

async function exportToEnvFile() {
    try {
        const result = await apiCall('/api/system-configs/export-env');

        // 创建下载链接
        const blob = new Blob([result.content], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showSuccess('导出成功', `配置已导出为 ${result.filename}`);
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function backupAndUpdateEnv() {
    if (!await showConfirm('确认更新',
        '确定要备份当前.env文件并用数据库配置更新吗？\n' +
        '这将覆盖现有的.env文件，建议先导出备份。', 'warning')) {
        return;
    }

    try {
        const result = await apiCall('/api/system-configs/backup-env', {
            method: 'POST'
        });

        let message = result.message;
        if (result.backup_created) {
            message += `\n备份文件: ${result.backup_path}`;
        }

        showSuccess('更新成功', message);
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function initializeSystemConfigs() {
    if (!await showConfirm('确认初始化',
        '确定要初始化系统配置吗？\n' +
        '这将从当前环境变量创建默认配置。', 'primary')) {
        return;
    }

    try {
        // 调用同步功能来初始化配置
        await syncFromEnvFile();
    } catch (error) {
        showError('初始化失败', '无法初始化系统配置');
    }
}

async function loadSystemConfigs() {
    try {
        const response = await apiCall('/api/system-configs');
        systemConfigs = response.configs;
        displaySystemConfigs(response.configs, response.categories);
    } catch (error) {
        document.getElementById('systemConfigsTable').innerHTML = '<p>加载系统配置失败</p>';
    }
}

function displaySystemConfigs(configs, categories) {
    const tableDiv = document.getElementById('systemConfigsTable');

    if (Object.keys(configs).length === 0) {
        tableDiv.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: #666;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">⚙️</div>
                <h4>暂无系统配置</h4>
                <p>点击"初始化配置"创建默认配置</p>
                <button class="btn btn-success" onclick="initializeSystemConfigs()">🔧 初始化配置</button>
            </div>
        `;
        return;
    }

    let html = `
        <div style="margin-bottom: 2rem;">
            <div style="display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem;">
                <button class="btn btn-success btn-sm" onclick="showAddSystemConfigModal()">➕ 新增配置</button>
                <button class="btn btn-info btn-sm" onclick="syncFromEnvFile()">📥 从.env同步</button>
                <button class="btn btn-warning btn-sm" onclick="exportToEnvFile()">📤 导出.env</button>
                <button class="btn btn-danger btn-sm" onclick="backupAndUpdateEnv()">💾 备份并更新.env</button>
            </div>
        </div>
    `;

    // 按分类显示配置
    Object.entries(configs).forEach(([category, configList]) => {
        const categoryName = categories[category] || category;
        const categoryIcon = getCategoryIcon(category);

        html += `
            <div style="margin-bottom: 2rem; border: 1px solid #dee2e6; border-radius: 8px; overflow: hidden;">
                <div style="background: #f8f9fa; padding: 1rem; border-bottom: 1px solid #dee2e6;">
                    <h4 style="margin: 0; color: #333; display: flex; align-items: center; gap: 0.5rem;">
                        ${categoryIcon} ${categoryName}
                        <span style="font-size: 0.8rem; background: #6c757d; color: white; padding: 0.2rem 0.5rem; border-radius: 12px;">
                            ${configList.length} 项
                        </span>
                    </h4>
                </div>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead style="background: #f8f9fa;">
                            <tr>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #dee2e6; width: 200px;">配置项</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #dee2e6;">值</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #dee2e6; width: 250px;">描述</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #dee2e6; width: 120px;">更新时间</th>
                                <th style="padding: 0.75rem; text-align: left; border-bottom: 1px solid #dee2e6; width: 200px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${configList.map(config => `
                                <tr style="border-bottom: 1px solid #f0f0f0;">
                                    <td style="padding: 0.75rem; font-family: monospace; font-weight: bold; color: #495057;">
                                        ${config.key}
                                        ${config.is_sensitive ? '<span style="color: #dc3545; font-size: 0.8rem;">🔒</span>' : ''}
                                    </td>
                                    <td style="padding: 0.75rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                        ${config.is_sensitive
            ? '<span style="color: #6c757d; font-style: italic;">***敏感信息已隐藏***</span>'
            : `<span style="font-family: monospace; background: #f8f9fa; padding: 0.2rem 0.4rem; border-radius: 3px;">${config.value}</span>`
        }
                                    </td>
                                    <td style="padding: 0.75rem; color: #6c757d; font-size: 0.9rem;">
                                        ${config.description || '-'}
                                    </td>
                                    <td style="padding: 0.75rem; font-size: 0.85rem; color: #6c757d;">
                                        ${config.updated_at ? new Date(config.updated_at).toLocaleString() : '-'}
                                    </td>
                                    <td style="padding: 0.75rem;">
                                        <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
                                            <button class="btn btn-info btn-sm" onclick="editSystemConfig(${config.id})" title="编辑">✏️</button>
                                            ${getTestButton(config.key)}
                                            <button class="btn btn-danger btn-sm" onclick="deleteSystemConfig(${config.id}, '${config.key.replace(/'/g, '&#39;')}')" title="删除">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    tableDiv.innerHTML = html;
}

function getCategoryIcon(category) {
    const icons = {
        'database': '🗄️',
        'security': '🔐',
        'app': '📱',
        'vmos': '☁️',
        'general': '⚙️'
    };
    return icons[category] || '⚙️';
}

function getTestButton(configKey) {
    const testableConfigs = ['DATABASE_URL', 'ACCESS_KEY', 'SECRET_ACCESS'];
    if (testableConfigs.includes(configKey)) {
        return `<button class="btn btn-warning btn-sm" onclick="testSystemConfig('${configKey}')" title="测试连接">🧪</button>`;
    }
    return '';
}

async function showAddSystemConfigModal() {
    // 清空表单
    document.getElementById('systemConfigId').value = '';
    document.getElementById('systemConfigKey').value = '';
    document.getElementById('systemConfigValue').value = '';
    document.getElementById('systemConfigDescription').value = '';
    document.getElementById('systemConfigCategory').value = 'general';
    document.getElementById('systemConfigSensitive').checked = false;

    document.getElementById('addSystemConfigModal').style.display = 'block';
}

function hideAddSystemConfigModal() {
    document.getElementById('addSystemConfigModal').style.display = 'none';
    currentEditingConfigId = null;
}

async function saveSystemConfig(event) {
    event.preventDefault();

    const configId = document.getElementById('systemConfigId').value;
    const isEdit = !!configId;

    const data = {
        key: document.getElementById('systemConfigKey').value.trim(),
        value: document.getElementById('systemConfigValue').value,
        description: document.getElementById('systemConfigDescription').value.trim(),
        category: document.getElementById('systemConfigCategory').value,
        is_sensitive: document.getElementById('systemConfigSensitive').checked
    };

    // 验证必填字段
    if (!data.key || !data.value) {
        showError('输入错误', '配置项和值不能为空');
        return;
    }

    try {
        if (isEdit) {
            await apiCall(`/api/system-configs/${configId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            showSuccess('更新成功', '系统配置已更新');
        } else {
            await apiCall('/api/system-configs', {
                method: 'POST',
                body: JSON.stringify(data)
            });
            showSuccess('创建成功', '系统配置已创建');
        }

        hideAddSystemConfigModal();
        await loadSystemConfigs();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function editSystemConfig(configId) {
    try {
        // 在现有数据中查找配置
        let config = null;
        Object.values(systemConfigs).forEach(categoryConfigs => {
            const found = categoryConfigs.find(c => c.id === configId);
            if (found) config = found;
        });

        if (!config) {
            showError('配置不存在', '找不到指定的配置项');
            return;
        }

        currentEditingConfigId = configId;

        // 填充表单
        document.getElementById('systemConfigId').value = config.id;
        document.getElementById('systemConfigKey').value = config.key;
        document.getElementById('systemConfigValue').value = config.is_sensitive ? '' : config.value;
        document.getElementById('systemConfigDescription').value = config.description || '';
        document.getElementById('systemConfigCategory').value = config.category;
        document.getElementById('systemConfigSensitive').checked = config.is_sensitive;

        // 如果是敏感信息，添加提示
        if (config.is_sensitive) {
            const valueInput = document.getElementById('systemConfigValue');
            valueInput.placeholder = '留空表示不修改敏感信息';
        }

        document.getElementById('addSystemConfigModal').style.display = 'block';
    } catch (error) {
        showError('加载失败', '获取配置信息失败');
    }
}

async function deleteSystemConfig(configId, configKey) {
    if (!await showConfirm('确认删除', `确定要删除配置项 "${configKey}" 吗？此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        const result = await apiCall(`/api/system-configs/${configId}`, {
            method: 'DELETE'
        });
        showSuccess('删除成功', result.message);
        await loadSystemConfigs();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

async function testSystemConfig(configKey) {
    try {
        showInfo('测试中', `正在测试 ${configKey} 配置...`);

        const result = await apiCall(`/api/system-configs/test-config/${configKey}`, {
            method: 'POST'
        });

        if (result.test_result.success) {
            showSuccess('测试成功', result.test_result.message);
        } else {
            showError('测试失败', result.test_result.message);
        }
    } catch (error) {
        showError('测试失败', '无法执行配置测试');
    }
}

async function syncFromEnvFile() {
    if (!await showConfirm('确认同步', '确定要从.env文件同步配置吗？这将更新数据库中的配置。', 'primary')) {
        return;
    }

    try {
        const result = await apiCall('/api/system-configs/sync-from-env', {
            method: 'POST'
        });

        showSuccess('同步成功',
            `从.env文件同步完成\n` +
            `新增: ${result.created_count} 项\n` +
            `更新: ${result.updated_count} 项\n` +
            `总计: ${result.total_processed} 项`
        );

        await loadSystemConfigs();
    } catch (error) {
        // 错误已在apiCall中处理
    }
}

// 显示未激活机器列表
async function showInactiveMachines() {
    try {
        // 强制重新获取最新数据，不使用缓存
        const machines = await apiCall(`/api/machines/inactive?_t=${Date.now()}`);

        console.log('显示未激活机器，获取到:', machines); // 调试日志

        if (machines.length === 0) {
            showInfo('提示', '没有找到未激活的机器');
            return;
        }

        displayInactiveMachines(machines);
        document.getElementById('inactiveMachinesModal').style.display = 'block';
    } catch (error) {
        console.error('获取未激活机器失败:', error);
        showError('获取失败', '无法获取未激活机器列表');
    }
}

// 显示未激活机器模态框
function displayInactiveMachines(machines) {
    const listDiv = document.getElementById('inactiveMachinesList');

    // 过滤掉可能已经激活的机器（双重检查）
    const actuallyInactiveMachines = machines.filter(machine => !machine.is_active);

    if (actuallyInactiveMachines.length === 0) {
        hideInactiveMachinesModal();
        showInfo('提示', '所有机器都已激活！');
        return;
    }

    const tableHTML = `
        <div style="margin-bottom: 1rem;">
            <h4>未激活的机器 (${actuallyInactiveMachines.length} 台)</h4>
            <p style="color: #666;">以下机器当前处于未激活状态，您可以选择激活它们：</p>
        </div>
        <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse;">
                <thead style="background: #f8f9fa;">
                    <tr>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">ID</th>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">名称</th>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">消息</th>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">代码</th>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">描述</th>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">创建时间</th>
                        <th style="padding: 0.75rem; border: 1px solid #ddd;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${actuallyInactiveMachines.map(machine => {
        const message = machine.message || '-';
        return `
                            <tr id="inactive-machine-${machine.id}" style="background: #fff8dc;" data-machine-id="${machine.id}">
                                <td style="padding: 0.75rem; border: 1px solid #ddd;">${machine.id}</td>
                                <td style="padding: 0.75rem; border: 1px solid #ddd;">${machine.name || '-'}</td>
                                <td style="padding: 0.75rem; border: 1px solid #ddd;">
                                    <span style="cursor: pointer; color: #007bff; text-decoration: underline;" 
                                          onclick="showMessageDetail('${message.replace(/'/g, '&#39;')}', '${(machine.name || '机器' + machine.id).replace(/'/g, '&#39;')}')">
                                        ${message.length > 20 ? message.substring(0, 20) + '...' : message}
                                    </span>
                                </td>
                                <td style="padding: 0.75rem; border: 1px solid #ddd; font-family: monospace;">${machine.pade_code}</td>
                                <td style="padding: 0.75rem; border: 1px solid #ddd;">${machine.description || '-'}</td>
                                <td style="padding: 0.75rem; border: 1px solid #ddd; font-size: 0.85em;">${new Date(machine.created_at).toLocaleString()}</td>
                                <td style="padding: 0.75rem; border: 1px solid #ddd;">
                                    <button class="btn btn-success btn-sm" onclick="activateMachineWithRemove(${machine.id}, '${(machine.name || machine.message).replace(/'/g, '&#39;')}')" 
                                            style="background: linear-gradient(45deg, #28a745, #20c997); border: none; color: white; margin: 2px;">
                                        ✅ 激活
                                    </button>
                                    <button class="btn btn-info btn-sm" onclick="editMachine(${machine.id}); hideInactiveMachinesModal();" style="margin: 2px;">
                                        ✏️ 编辑
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteMachineWithRemove(${machine.id}, '${(machine.name || machine.message).replace(/'/g, '&#39;')}')" style="margin: 2px;">
                                        🗑️ 删除
                                    </button>
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 1rem; text-align: center;">
            <button class="btn btn-success" onclick="batchActivateMachines()" 
                    style="background: linear-gradient(45deg, #28a745, #20c997); border: none;">
                ⚡ 批量激活所有机器 (${actuallyInactiveMachines.length})
            </button>
        </div>
    `;

    listDiv.innerHTML = tableHTML;
}

async function activateMachineWithRemove(machineId, machineName) {
    if (!await showConfirm('确认激活', `确定要激活机器 "${machineName}" 吗？`, 'primary')) {
        return;
    }

    try {
        // 先从界面移除该项目（立即反馈）
        const machineElement = document.getElementById(`inactive-machine-${machineId}`);
        if (machineElement) {
            machineElement.style.opacity = '0.5';
            machineElement.style.pointerEvents = 'none';
        }

        const result = await apiCall(`/api/machines/${machineId}/activate`, {
            method: 'POST'
        });

        // 立即从DOM中移除
        if (machineElement) {
            machineElement.remove();
        }

        showSuccess('激活成功', result.message);

        // 检查是否还有未激活的机器
        const remainingMachines = document.querySelectorAll('#inactiveMachinesList [id^="inactive-machine-"]');
        if (remainingMachines.length === 0) {
            hideInactiveMachinesModal();
            showInfo('完成', '所有机器都已激活！');
        } else {
            // 更新标题中的数量
            const titleElement = document.querySelector('#inactiveMachinesList h4');
            if (titleElement) {
                titleElement.textContent = `未激活的机器 (${remainingMachines.length} 台)`;
            }

            // 更新批量激活按钮
            const batchBtn = document.querySelector('#inactiveMachinesList .btn[onclick="batchActivateMachines()"]');
            if (batchBtn) {
                batchBtn.innerHTML = `⚡ 批量激活所有机器 (${remainingMachines.length})`;
            }
        }

        // 后台刷新主机器列表
        await loadMachines();

    } catch (error) {
        console.error('激活机器失败:', error);
        // 恢复元素状态
        if (machineElement) {
            machineElement.style.opacity = '1';
            machineElement.style.pointerEvents = 'auto';
        }
    }
}

async function deleteMachineWithRemove(machineId, machineName) {
    if (!await showConfirm('确认删除', `确定要删除机器 "${machineName}" 吗？这将同时删除该机器的所有URL配置！此操作不可撤销。`, 'danger')) {
        return;
    }

    try {
        // 先从界面移除该项目
        const machineElement = document.getElementById(`inactive-machine-${machineId}`);
        if (machineElement) {
            machineElement.style.opacity = '0.5';
        }

        const result = await apiCall(`/api/machines/${machineId}`, {
            method: 'DELETE'
        });

        // 立即从DOM中移除
        if (machineElement) {
            machineElement.remove();
        }

        showSuccess('删除成功', result.message);

        // 检查是否还有项目
        const remainingMachines = document.querySelectorAll('#inactiveMachinesList [id^="inactive-machine-"]');
        if (remainingMachines.length === 0) {
            hideInactiveMachinesModal();
        }

        // 后台刷新主机器列表
        loadMachines();

    } catch (error) {
        console.error('删除机器失败:', error);
        // 恢复元素状态
        if (machineElement) {
            machineElement.style.opacity = '1';
        }
    }
}


// 激活单个机器
async function activateMachine(machineId, machineName) {
    if (!await showConfirm('确认激活', `确定要激活机器 "${machineName}" 吗？激活后该机器将重新出现在主列表中。`, 'primary')) {
        return;
    }

    try {
        // 先从界面移除该项目（立即反馈）
        const machineElement = document.querySelector(`tr[data-machine-id="${machineId}"]`) ||
            document.getElementById(`inactive-machine-${machineId}`);
        if (machineElement) {
            machineElement.style.opacity = '0.5';
            machineElement.style.pointerEvents = 'none';
        }

        const result = await apiCall(`/api/machines/${machineId}/activate`, {
            method: 'POST'
        });

        // 立即从DOM中移除
        if (machineElement) {
            machineElement.remove();
        }

        showSuccess('激活成功', result.message);

        // 检查是否还有未激活的机器
        await checkAndUpdateInactiveMachinesList();

        // 刷新主机器列表
        await loadMachines();

    } catch (error) {
        console.error('激活机器失败:', error);
        // 恢复元素状态
        if (machineElement) {
            machineElement.style.opacity = '1';
            machineElement.style.pointerEvents = 'auto';
        }
    }
}

async function checkAndUpdateInactiveMachinesList() {
    // 检查未激活机器窗口是否还开着
    const modal = document.getElementById('inactiveMachinesModal');
    if (!modal || modal.style.display === 'none') {
        return; // 窗口已关闭，无需刷新
    }

    try {
        // 强制获取最新的未激活机器数据
        const machines = await apiCall(`/api/machines/inactive?_t=${Date.now()}`);

        console.log('刷新未激活机器列表，获取到:', machines); // 调试日志

        if (machines.length === 0) {
            // 没有未激活机器了，关闭窗口
            hideInactiveMachinesModal();
            showInfo('提示', '所有机器都已激活！');
            return;
        }

        // 更新显示
        displayInactiveMachines(machines);

    } catch (error) {
        console.error('刷新未激活机器列表失败:', error);
        // 发生错误时关闭窗口
        hideInactiveMachinesModal();
    }
}

// 批量激活所有未激活机器
async function batchActivateMachines() {
    if (!await showConfirm('确认批量激活', '确定要激活所有未激活的机器吗？', 'primary')) {
        return;
    }

    try {
        const machines = await apiCall('/api/machines/inactive');
        let successCount = 0;
        let failCount = 0;

        for (const machine of machines) {
            try {
                await apiCall(`/api/machines/${machine.id}/activate`, {
                    method: 'POST'
                });
                successCount++;
            } catch (error) {
                console.error(`激活机器 ${machine.id} 失败:`, error);
                failCount++;
            }
        }

        showSuccess('批量激活完成', `成功激活 ${successCount} 台机器，失败 ${failCount} 台`);

        // 关闭模态框
        hideInactiveMachinesModal();

        // 刷新主机器列表
        await loadMachines();

    } catch (error) {
        console.error('批量激活失败:', error);
    }
}

// 隐藏未激活机器模态框
function hideInactiveMachinesModal() {
    document.getElementById('inactiveMachinesModal').style.display = 'none';
}


// 更新机器统计信息显示
function updateMachineStats(stats) {
    const statsDiv = document.getElementById('machineStats');
    if (statsDiv) {
        statsDiv.innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1rem;">
                <div style="background: #e3f2fd; padding: 1rem; border-radius: 4px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #1976d2;">${stats.total_count}</div>
                    <div>总机器数</div>
                </div>
                <div style="background: #e8f5e8; padding: 1rem; border-radius: 4px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #388e3c;">${stats.active_count}</div>
                    <div>已激活</div>
                </div>
                <div style="background: #fff3e0; padding: 1rem; border-radius: 4px; text-align: center;">
                    <div style="font-size: 1.5rem; font-weight: bold; color: #f57c00;">${stats.inactive_count}</div>
                    <div>未激活</div>
                </div>
            </div>
        `;
    }
}


// 页面加载时的初始化
document.addEventListener('DOMContentLoaded', function() {
    // 监听显示未激活机器复选框的变化
    const checkbox = document.getElementById('showInactiveCheckbox');
    if (checkbox) {
        checkbox.addEventListener('change', function() {
            const isChecked = this.checked;
            showInfo('显示模式', isChecked ? '现在显示所有机器（包括未激活）' : '现在只显示激活的机器');
        });
    }
});

function displayMachines(machines) {
    const tableDiv = document.getElementById('machinesTable');

    if (machines.length === 0) {
        tableDiv.innerHTML = '<p>暂无机器配置</p>';
        return;
    }

    tableDiv.innerHTML = `
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
                        <th style="width: 220px;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    ${machines.map(machine => {
        const message = machine.message || '-';
        const displayMessage = message.length > 5 ? message.substring(0, 5) + '...' : message;
        const isInactive = !machine.is_active;

        return `
                            <tr ${isInactive ? 'class="inactive-machine-row"' : ''}>
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
                                    <span class="machine-status ${machine.is_active ? 'status-active' : 'inactive-status-badge'}">
                                        ${machine.is_active ? '激活' : '未激活'}
                                    </span>
                                </td>
                                <td style="width: 100px;">${machine.success_time[0]}-${machine.success_time[1]}秒</td>
                                <td style="width: 140px; font-size: 0.85em;">${new Date(machine.created_at).toLocaleString()}</td>
                                <td style="width: 220px;">
                                    ${isInactive ?
            `<button class="btn btn-success btn-sm activate-btn" onclick="activateMachine(${machine.id}, '${(machine.name || machine.message).replace(/'/g, '&#39;')}')" style="margin: 2px;">✅ 激活</button>`
            : ''
        }
                                    <button class="btn btn-info btn-sm" onclick="editMachine(${machine.id})" style="margin: 2px;">编辑</button>
                                    ${!isInactive ?
            `<button class="btn btn-warning btn-sm" onclick="toggleMachine(${machine.id})" style="margin: 2px;">禁用</button>`
            : ''
        }
                                    <button class="btn btn-danger btn-sm" onclick="deleteMachine(${machine.id}, '${(machine.name || machine.message).replace(/'/g, '&#39;')}')" style="margin: 2px;">删除</button>
                                </td>
                            </tr>
                        `;
    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}




// 渲染消息列表UI
function renderMessageList() {
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
}

// 添加新消息
function addNewMessage() {
    const input = document.getElementById('newMessageInput');
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
    updateHiddenMessageField();
    renderMessageList();

    showSuccess('添加成功', `消息 "${message}" 已添加`);
}


// 处理输入框回车事件
function handleMessageInputKeyPress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        addNewMessage();
    }
}

// 更新隐藏的消息字段
function updateHiddenMessageField() {
    const hiddenField = document.getElementById('editMachineMessage');
    if (hiddenField) {
        hiddenField.value = currentMessages.join('----');
    }
}

