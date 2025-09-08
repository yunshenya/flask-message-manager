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

// 隐藏消息详情
function hideMessageDetail() {
    document.getElementById('messageDetailModal').style.display = 'none';
}