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

function showMessageDetail(message, machineName) {
    document.getElementById('messageDetailTitle').textContent = `${machineName} - 消息详情`;
    document.getElementById('messageDetailContent').textContent = message;
    document.getElementById('messageDetailModal').style.display = 'block';
}

function hideMessageDetail() {
    document.getElementById('messageDetailModal').style.display = 'none';
}

function showBatchImportModal() {
    const modal = document.createElement('div');
    modal.id = 'batchImportModal';
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: rgba(0,0,0,0.5); z-index: 2000; display: flex; 
        align-items: center; justify-content: center;
    `;

    modal.innerHTML = `
        <div style="background: white; padding: 2rem; border-radius: 8px; width: 90%; max-width: 600px; max-height: 80vh; overflow-y: auto;">
            <h3>批量导入消息</h3>
            <div style="margin-bottom: 1rem;">
                <label>消息列表 (每行一条消息):</label>
                <textarea 
                    id="batchMessagesInput" 
                    rows="10" 
                    placeholder="请输入消息，每行一条，例如：&#10;哈咯----签到&#10;早上好----打卡&#10;晚安----结束"
                    style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; resize: vertical;"
                ></textarea>
                <small style="color: #666;">支持的格式：每行一条消息，或使用"----"分隔的单行文本</small>
            </div>
            <div style="text-align: right; border-top: 1px solid #eee; padding-top: 1rem;">
                <button type="button" class="btn btn-secondary" onclick="closeBatchImportModal()" style="margin-right: 1rem;">取消</button>
                <button type="button" class="btn btn-primary" onclick="processBatchImport()">导入消息</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

function closeBatchImportModal() {
    const modal = document.getElementById('batchImportModal');
    if (modal) {
        modal.remove();
    }
}

function processBatchImport() {
    const input = document.getElementById('batchMessagesInput').value;
    if (!input.trim()) {
        showError('输入错误', '请输入消息内容');
        return;
    }

    let newMessages = [];

    // 尝试按行分割
    const lines = input.split('\n').map(line => line.trim()).filter(line => line);
    if (lines.length > 1) {
        newMessages = lines;
    } else {
        // 如果只有一行，尝试按"----"分割
        newMessages = input.split('----').map(msg => msg.trim()).filter(msg => msg);
    }

    if (newMessages.length === 0) {
        showError('解析错误', '无法解析消息内容');
        return;
    }

    // 过滤重复消息
    const uniqueMessages = newMessages.filter(msg => !currentMessages.includes(msg));

    if (uniqueMessages.length === 0) {
        showWarning('导入提示', '所有消息都已存在，没有新消息被添加');
        closeBatchImportModal();
        return;
    }

    // 添加新消息
    currentMessages.push(...uniqueMessages);
    updateHiddenMessageField();
    renderMessageList();
    closeBatchImportModal();

    showSuccess('导入成功', `成功导入 ${uniqueMessages.length} 条新消息${newMessages.length !== uniqueMessages.length ? `，跳过 ${newMessages.length - uniqueMessages.length} 条重复消息` : ''}`);
}

// 清空所有消息 - 通用函数
function clearAllMessages() {
    if (currentMessages.length === 0) {
        showInfo('提示', '当前没有消息需要清空');
        return;
    }

    if (confirm(`确定要清空所有 ${currentMessages.length} 条消息吗？此操作不可撤销。`)) {
        currentMessages = [];
        updateHiddenMessageField();
        renderMessageList();
        showSuccess('清空成功', '所有消息已清空');
    }
}


function editMessage(index) {
    const currentMsg = currentMessages[index];
    const newMsg = prompt('编辑消息:', currentMsg);

    if (newMsg === null) return; // 用户取消

    const trimmedMsg = newMsg.trim();
    if (!trimmedMsg) {
        showError('输入错误', '消息内容不能为空');
        return;
    }

    // 检查是否与其他消息重复（排除当前编辑的消息）
    const otherMessages = currentMessages.filter((_, i) => i !== index);
    if (otherMessages.includes(trimmedMsg)) {
        showWarning('重复消息', '该消息已存在，请输入不同的内容');
        return;
    }

    currentMessages[index] = trimmedMsg;
    updateHiddenMessageField();
    renderMessageList();

    showSuccess('编辑成功', '消息已更新');
}


function removeMessage(index) {
    const message = currentMessages[index];
    if (confirm(`确定要删除消息 "${message}" 吗？`)) {
        currentMessages.splice(index, 1);
        updateHiddenMessageField();
        renderMessageList();
        showSuccess('删除成功', '消息已删除');
    }
}

// 上移消息 - 通用函数
function moveMessageUp(index) {
    if (index > 0) {
        [currentMessages[index], currentMessages[index - 1]] = [currentMessages[index - 1], currentMessages[index]];
        updateHiddenMessageField();
        renderMessageList();
    }
}


function moveMessageDown(index) {
    if (index < currentMessages.length - 1) {
        [currentMessages[index], currentMessages[index + 1]] = [currentMessages[index + 1], currentMessages[index]];
        updateHiddenMessageField();
        renderMessageList();
    }
}