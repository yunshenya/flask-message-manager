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
    const cleanMessage = message
        .replace(/\\n/g, '\n')    // 将 \n 转换回真正的换行符
        .replace(/\\r/g, '\r')    // 将 \r 转换回真正的回车符
        .replace(/\\t/g, '\t')    // 将 \t 转换回真正的制表符
        .replace(/\\'/g, "'")     // 将 \' 转换回单引号
        .replace(/\\"/g, '"')     // 将 \" 转换回双引号
        .replace(/\\\\/g, '\\');  // 将 \\ 转换回反斜杠

    const cleanMachineName = machineName
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');

    document.getElementById('messageDetailTitle').textContent = `${cleanMachineName} - 消息详情`;
    document.getElementById('messageDetailContent').textContent = cleanMessage;
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
                <label>消息列表:</label>
                <textarea 
                    id="batchMessagesInput" 
                    rows="10" 
                    placeholder="请输入消息，例如：&#10;早上好--------打卡&#10;晚安--------结束--------你好"
                    style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; resize: vertical;"
                ></textarea>
                <small style="color: #666;">支持的格式：使用"--------"分隔消息</small>
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

    let newMessages;

    if (input.includes('--------')) {
        newMessages = input.split('--------')
            .map(msg => msg.trim())
            .filter(msg => msg);
    } else {
        newMessages = [input.trim()];
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
async function clearAllMessages() {
    if (currentMessages.length === 0) {
        showInfo('提示', '当前没有消息需要清空');
        return;
    }

    if (await showConfirm("清理",`确定要清空所有 ${currentMessages.length} 条消息吗？此操作不可撤销。`)) {
        currentMessages = [];
        updateHiddenMessageField();
        renderMessageList();
        showSuccess('清空成功', '所有消息已清空');
    }
}


function editMessage(index) {
    const currentMsg = currentMessages[index];
    showEditMessageModal(index, currentMsg);
}

// 显示编辑消息的模态框
function showEditMessageModal(index, currentMessage) {
    // 创建模态框HTML
    const modalHTML = `
        <div id="editMessageModal" style="
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100%; 
            height: 100%; 
            background: rgba(0,0,0,0.6); 
            z-index: 2000; 
            display: flex; 
            align-items: center; 
            justify-content: center;
            backdrop-filter: blur(2px);
        ">
            <div style="
                background: white; 
                padding: 2rem; 
                border-radius: 12px; 
                width: 90%; 
                max-width: 500px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                animation: modalSlideIn 0.3s ease-out;
            ">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                    <h3 style="margin: 0; color: #333; display: flex; align-items: center; gap: 0.5rem;">
                        ✏️ 编辑消息
                    </h3>
                    <button onclick="closeEditMessageModal()" style="
                        background: none; 
                        border: none; 
                        font-size: 1.5rem; 
                        cursor: pointer; 
                        color: #999;
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        transition: all 0.2s ease;
                    " onmouseover="this.style.background='#f0f0f0'; this.style.color='#666';" 
                       onmouseout="this.style.background='none'; this.style.color='#999';">×</button>
                </div>
                
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #555;">
                        消息内容:
                    </label>
                    <textarea 
                        id="editMessageInput" 
                        style="
                            width: 100%; 
                            min-height: 120px; 
                            padding: 1rem; 
                            border: 2px solid #e1e5e9; 
                            border-radius: 8px; 
                            font-size: 1rem;
                            line-height: 1.5;
                            resize: vertical;
                            font-family: inherit;
                            transition: border-color 0.3s ease;
                            box-sizing: border-box;
                        "
                        placeholder="请输入消息内容..."
                        onfocus="this.style.borderColor='#007bff'; this.style.outline='none';"
                        onblur="this.style.borderColor='#e1e5e9';"
                    >${currentMessage}</textarea>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                        <small style="color: #666;">提示: 支持多行文本，按Ctrl+Enter快速保存</small>
                        <span id="charCount" style="color: #999; font-size: 0.85rem;">${currentMessage.length} 字符</span>
                    </div>
                </div>

                <div style="
                    display: flex; 
                    gap: 1rem; 
                    justify-content: flex-end;
                    padding-top: 1rem;
                    border-top: 1px solid #eee;
                ">
                    <button onclick="closeEditMessageModal()" style="
                        padding: 0.75rem 1.5rem; 
                        border: 2px solid #6c757d; 
                        background: white; 
                        color: #6c757d; 
                        border-radius: 8px; 
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.background='#6c757d'; this.style.color='white';"
                       onmouseout="this.style.background='white'; this.style.color='#6c757d';">
                        取消
                    </button>
                    <button onclick="saveEditedMessage(${index})" style="
                        padding: 0.75rem 1.5rem; 
                        border: 2px solid #28a745; 
                        background: #28a745; 
                        color: white; 
                        border-radius: 8px; 
                        cursor: pointer;
                        font-weight: 500;
                        transition: all 0.3s ease;
                    " onmouseover="this.style.background='#218838'; this.style.borderColor='#218838';"
                       onmouseout="this.style.background='#28a745'; this.style.borderColor='#28a745';">
                        💾 保存修改
                    </button>
                </div>
            </div>
        </div>

        <style>
        @keyframes modalSlideIn {
            from {
                opacity: 0;
                transform: translateY(-20px) scale(0.95);
            }
            to {
                opacity: 1;
                transform: translateY(0) scale(1);
            }
        }
        </style>
    `;

    // 移除已存在的模态框
    const existingModal = document.getElementById('editMessageModal');
    if (existingModal) {
        existingModal.remove();
    }

    // 添加到页面
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 聚焦到输入框并选中所有文本
    setTimeout(() => {
        const input = document.getElementById('editMessageInput');
        if (input) {
            input.focus();
            input.select();

            // 添加字符计数功能
            const updateCharCount = () => {
                const charCount = document.getElementById('charCount');
                if (charCount) {
                    const length = input.value.length;
                    charCount.textContent = `${length} 字符`;

                    // 根据长度变色
                    if (length > 200) {
                        charCount.style.color = '#dc3545';
                    } else if (length > 100) {
                        charCount.style.color = '#ffc107';
                    } else {
                        charCount.style.color = '#999';
                    }
                }
            };

            input.addEventListener('input', updateCharCount);

            // 添加快捷键支持
            input.addEventListener('keydown', (e) => {
                // Ctrl+Enter 快速保存
                if (e.ctrlKey && e.key === 'Enter') {
                    e.preventDefault();
                    saveEditedMessage(index);
                }
                // Escape 取消
                if (e.key === 'Escape') {
                    e.preventDefault();
                    closeEditMessageModal();
                }
            });
        }
    }, 100);

    // 点击背景关闭
    document.getElementById('editMessageModal').addEventListener('click', (e) => {
        if (e.target.id === 'editMessageModal') {
            closeEditMessageModal();
        }
    });
}

// 关闭编辑模态框
function closeEditMessageModal() {
    const modal = document.getElementById('editMessageModal');
    if (modal) {
        // 添加淡出动画
        modal.style.animation = 'modalSlideOut 0.2s ease-in forwards';
        setTimeout(() => {
            modal.remove();
        }, 200);
    }
}

// 保存编辑后的消息
function saveEditedMessage(index) {
    const input = document.getElementById('editMessageInput');
    if (!input) return;

    const trimmedMsg = input.value.trim();

    // 验证输入
    if (!trimmedMsg) {
        showError('输入错误', '消息内容不能为空');
        input.focus();
        return;
    }

    if (trimmedMsg.length > 500) {
        showError('输入错误', '消息内容不能超过500个字符');
        input.focus();
        return;
    }

    // 检查是否与其他消息重复（排除当前编辑的消息）
    const otherMessages = currentMessages.filter((_, i) => i !== index);
    if (otherMessages.includes(trimmedMsg)) {
        showWarning('重复消息', '该消息已存在，请输入不同的内容');
        input.focus();
        input.select();
        return;
    }

    // 检查是否有实际修改
    if (trimmedMsg === currentMessages[index]) {
        showInfo('提示', '消息内容没有变化');
        closeEditMessageModal();
        return;
    }

    // 保存修改
    currentMessages[index] = trimmedMsg;
    updateHiddenMessageField();
    renderMessageList();
    closeEditMessageModal();

    showSuccess('编辑成功', `消息已更新为: "${trimmedMsg.length > 20 ? trimmedMsg.substring(0, 20) + '...' : trimmedMsg}"`);
}

// 添加淡出动画样式
const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = `
@keyframes modalSlideOut {
    from {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
    to {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
    }
}
`;
document.head.appendChild(fadeOutStyle);


async function removeMessage(index) {
    const message = currentMessages[index];
    const shortMessage = message.length > 10 ?
        message.substring(0, 3) + "..." + message.substring(message.length - 2) :
        message;

    if (await showConfirm("删除", `确定要删除消息 "${shortMessage}" 吗？`)) {
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