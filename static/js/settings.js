/**
 * 设置页面 JavaScript
 */

// API 基础路径
const API_BASE = '/api';

// DOM 元素
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const proxyForm = document.getElementById('proxy-form');
const registrationForm = document.getElementById('registration-form');
const testProxyBtn = document.getElementById('test-proxy-btn');
const backupBtn = document.getElementById('backup-btn');
const cleanupBtn = document.getElementById('cleanup-btn');
const addEmailServiceBtn = document.getElementById('add-email-service-btn');
const addServiceModal = document.getElementById('add-service-modal');
const addServiceForm = document.getElementById('add-service-form');
const closeServiceModalBtn = document.getElementById('close-service-modal');
const cancelAddServiceBtn = document.getElementById('cancel-add-service');
const serviceTypeSelect = document.getElementById('service-type');
const serviceConfigFields = document.getElementById('service-config-fields');
const emailServicesTable = document.getElementById('email-services-table');

// Outlook 批量导入相关
const toggleImportBtn = document.getElementById('toggle-import-btn');
const outlookImportBody = document.getElementById('outlook-import-body');
const outlookImportBtn = document.getElementById('outlook-import-btn');
const clearImportBtn = document.getElementById('clear-import-btn');
const outlookImportData = document.getElementById('outlook-import-data');
const importResult = document.getElementById('import-result');

// 批量操作
const batchDeleteBtn = document.getElementById('batch-delete-btn');
const selectAllCheckbox = document.getElementById('select-all-services');

// 选中的服务 ID
let selectedServiceIds = [];

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    loadSettings();
    loadEmailServices();
    loadDatabaseInfo();
    initEventListeners();
});

// 初始化标签页
function initTabs() {
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            document.getElementById(`${tab}-tab`).classList.add('active');
        });
    });
}

// 事件监听
function initEventListeners() {
    // 代理表单
    proxyForm.addEventListener('submit', handleSaveProxy);

    // 测试代理
    testProxyBtn.addEventListener('click', handleTestProxy);

    // 注册配置表单
    registrationForm.addEventListener('submit', handleSaveRegistration);

    // 备份数据库
    backupBtn.addEventListener('click', handleBackup);

    // 清理数据
    cleanupBtn.addEventListener('click', handleCleanup);

    // 添加邮箱服务
    addEmailServiceBtn.addEventListener('click', () => {
        addServiceModal.classList.add('active');
        loadServiceConfigFields(serviceTypeSelect.value);
    });

    closeServiceModalBtn.addEventListener('click', () => {
        addServiceModal.classList.remove('active');
    });

    cancelAddServiceBtn.addEventListener('click', () => {
        addServiceModal.classList.remove('active');
    });

    addServiceModal.addEventListener('click', (e) => {
        if (e.target === addServiceModal) {
            addServiceModal.classList.remove('active');
        }
    });

    // 服务类型切换
    serviceTypeSelect.addEventListener('change', (e) => {
        loadServiceConfigFields(e.target.value);
    });

    // 添加服务表单
    addServiceForm.addEventListener('submit', handleAddService);

    // Outlook 批量导入展开/折叠
    if (toggleImportBtn) {
        toggleImportBtn.addEventListener('click', () => {
            const isHidden = outlookImportBody.style.display === 'none';
            outlookImportBody.style.display = isHidden ? 'block' : 'none';
            toggleImportBtn.textContent = isHidden ? '收起' : '展开';
        });
    }

    // Outlook 批量导入
    if (outlookImportBtn) {
        outlookImportBtn.addEventListener('click', handleOutlookBatchImport);
    }

    // 清空导入数据
    if (clearImportBtn) {
        clearImportBtn.addEventListener('click', () => {
            outlookImportData.value = '';
            importResult.style.display = 'none';
        });
    }

    // 全选/取消全选
    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const checkboxes = document.querySelectorAll('.service-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateSelectedServices();
        });
    }

    // 批量删除
    if (batchDeleteBtn) {
        batchDeleteBtn.addEventListener('click', handleBatchDelete);
    }
}

// 加载设置
async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        const data = await response.json();

        // 代理设置
        document.getElementById('proxy-enabled').checked = data.proxy?.enabled || false;
        document.getElementById('proxy-type').value = data.proxy?.type || 'http';
        document.getElementById('proxy-host').value = data.proxy?.host || '127.0.0.1';
        document.getElementById('proxy-port').value = data.proxy?.port || 7890;
        document.getElementById('proxy-username').value = data.proxy?.username || '';

        // 注册配置
        document.getElementById('max-retries').value = data.registration?.max_retries || 3;
        document.getElementById('timeout').value = data.registration?.timeout || 120;
        document.getElementById('password-length').value = data.registration?.default_password_length || 12;
        document.getElementById('sleep-min').value = data.registration?.sleep_min || 5;
        document.getElementById('sleep-max').value = data.registration?.sleep_max || 30;

    } catch (error) {
        console.error('加载设置失败:', error);
    }
}

// 加载邮箱服务
async function loadEmailServices() {
    try {
        const response = await fetch(`${API_BASE}/email-services`);
        const data = await response.json();

        renderEmailServices(data.services);
    } catch (error) {
        console.error('加载邮箱服务失败:', error);
    }
}

// 渲染邮箱服务
function renderEmailServices(services) {
    if (services.length === 0) {
        emailServicesTable.innerHTML = '<tr><td colspan="7" style="text-align: center;">暂无配置</td></tr>';
        batchDeleteBtn.style.display = 'none';
        return;
    }

    emailServicesTable.innerHTML = services.map(service => `
        <tr data-service-id="${service.id}">
            <td><input type="checkbox" class="service-checkbox" data-id="${service.id}" onchange="updateSelectedServices()"></td>
            <td>${escapeHtml(service.name)}</td>
            <td>${getServiceTypeText(service.service_type)}</td>
            <td><span class="status-badge ${service.enabled ? 'completed' : ''}">${service.enabled ? '已启用' : '已禁用'}</span></td>
            <td>${service.priority}</td>
            <td>${formatDate(service.last_used)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="testService(${service.id})">测试</button>
                <button class="btn btn-sm ${service.enabled ? 'btn-warning' : 'btn-primary'}" onclick="toggleService(${service.id}, ${!service.enabled})">
                    ${service.enabled ? '禁用' : '启用'}
                </button>
                <button class="btn btn-sm btn-danger" onclick="deleteService(${service.id})">删除</button>
            </td>
        </tr>
    `).join('');

    // 更新批量删除按钮状态
    updateSelectedServices();
}

// 加载数据库信息
async function loadDatabaseInfo() {
    try {
        const response = await fetch(`${API_BASE}/settings/database`);
        const data = await response.json();

        document.getElementById('db-size').textContent = `${data.database_size_mb} MB`;
        document.getElementById('db-accounts').textContent = data.accounts_count;
        document.getElementById('db-services').textContent = data.email_services_count;
        document.getElementById('db-tasks').textContent = data.tasks_count;

    } catch (error) {
        console.error('加载数据库信息失败:', error);
    }
}

// 保存代理设置
async function handleSaveProxy(e) {
    e.preventDefault();

    const data = {
        enabled: document.getElementById('proxy-enabled').checked,
        type: document.getElementById('proxy-type').value,
        host: document.getElementById('proxy-host').value,
        port: parseInt(document.getElementById('proxy-port').value),
        username: document.getElementById('proxy-username').value || null,
        password: document.getElementById('proxy-password').value || null,
    };

    try {
        const response = await fetch(`${API_BASE}/settings/proxy`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            alert('代理设置已保存');
        } else {
            const result = await response.json();
            alert('保存失败: ' + (result.detail || '未知错误'));
        }
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// 测试代理
async function handleTestProxy() {
    testProxyBtn.disabled = true;
    testProxyBtn.textContent = '测试中...';

    try {
        // 这里应该调用一个测试代理的 API
        // 暂时模拟
        await new Promise(resolve => setTimeout(resolve, 1000));
        alert('代理测试功能待实现');
    } finally {
        testProxyBtn.disabled = false;
        testProxyBtn.textContent = '测试连接';
    }
}

// 保存注册配置
async function handleSaveRegistration(e) {
    e.preventDefault();

    const data = {
        max_retries: parseInt(document.getElementById('max-retries').value),
        timeout: parseInt(document.getElementById('timeout').value),
        default_password_length: parseInt(document.getElementById('password-length').value),
        sleep_min: parseInt(document.getElementById('sleep-min').value),
        sleep_max: parseInt(document.getElementById('sleep-max').value),
    };

    try {
        const response = await fetch(`${API_BASE}/settings/registration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            alert('注册配置已保存');
        } else {
            const result = await response.json();
            alert('保存失败: ' + (result.detail || '未知错误'));
        }
    } catch (error) {
        alert('保存失败: ' + error.message);
    }
}

// 备份数据库
async function handleBackup() {
    backupBtn.disabled = true;
    backupBtn.textContent = '备份中...';

    try {
        const response = await fetch(`${API_BASE}/settings/database/backup`, {
            method: 'POST',
        });

        const data = await response.json();

        if (response.ok) {
            alert(`备份成功: ${data.backup_path}`);
        } else {
            alert('备份失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        alert('备份失败: ' + error.message);
    } finally {
        backupBtn.disabled = false;
        backupBtn.textContent = '备份数据库';
    }
}

// 清理数据
async function handleCleanup() {
    if (!confirm('确定要清理过期数据吗？此操作不可恢复。')) {
        return;
    }

    cleanupBtn.disabled = true;
    cleanupBtn.textContent = '清理中...';

    try {
        const response = await fetch(`${API_BASE}/settings/database/cleanup?days=30`, {
            method: 'POST',
        });

        const data = await response.json();

        if (response.ok) {
            alert(data.message);
            loadDatabaseInfo();
        } else {
            alert('清理失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        alert('清理失败: ' + error.message);
    } finally {
        cleanupBtn.disabled = false;
        cleanupBtn.textContent = '清理过期数据';
    }
}

// 加载服务配置字段
async function loadServiceConfigFields(serviceType) {
    try {
        const response = await fetch(`${API_BASE}/email-services/types`);
        const data = await response.json();

        const typeInfo = data.types.find(t => t.value === serviceType);
        if (!typeInfo) return;

        serviceConfigFields.innerHTML = typeInfo.config_fields.map(field => `
            <div class="form-group">
                <label for="config-${field.name}">${field.label}</label>
                <input type="${field.name.includes('password') || field.name.includes('token') ? 'password' : 'text'}"
                       id="config-${field.name}"
                       name="${field.name}"
                       value="${field.default || ''}"
                       ${field.required ? 'required' : ''}>
            </div>
        `).join('');

    } catch (error) {
        console.error('加载配置字段失败:', error);
    }
}

// 添加邮箱服务
async function handleAddService(e) {
    e.preventDefault();

    const formData = new FormData(addServiceForm);
    const config = {};

    serviceConfigFields.querySelectorAll('input').forEach(input => {
        config[input.name] = input.value;
    });

    const data = {
        service_type: formData.get('service_type'),
        name: formData.get('name'),
        config: config,
        enabled: true,
        priority: 0,
    };

    try {
        const response = await fetch(`${API_BASE}/email-services`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            addServiceModal.classList.remove('active');
            addServiceForm.reset();
            loadEmailServices();
            alert('邮箱服务已添加');
        } else {
            const result = await response.json();
            alert('添加失败: ' + (result.detail || '未知错误'));
        }
    } catch (error) {
        alert('添加失败: ' + error.message);
    }
}

// 测试服务
async function testService(id) {
    try {
        const response = await fetch(`${API_BASE}/email-services/${id}/test`, {
            method: 'POST',
        });

        const data = await response.json();

        if (data.success) {
            alert('服务连接正常');
        } else {
            alert('服务连接失败: ' + data.message);
        }
    } catch (error) {
        alert('测试失败: ' + error.message);
    }
}

// 切换服务状态
async function toggleService(id, enabled) {
    try {
        const endpoint = enabled ? 'enable' : 'disable';
        const response = await fetch(`${API_BASE}/email-services/${id}/${endpoint}`, {
            method: 'POST',
        });

        if (response.ok) {
            loadEmailServices();
        } else {
            const data = await response.json();
            alert('操作失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        alert('操作失败: ' + error.message);
    }
}

// 删除服务
async function deleteService(id) {
    if (!confirm('确定要删除此邮箱服务配置吗？')) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/email-services/${id}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            loadEmailServices();
        } else {
            const data = await response.json();
            alert('删除失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getServiceTypeText(type) {
    const typeMap = {
        'tempmail': 'Tempmail.lol',
        'outlook': 'Outlook',
        'custom_domain': '自定义域名',
    };
    return typeMap[type] || type;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}
