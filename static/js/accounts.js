/**
 * 账号管理页面 JavaScript
 */

// API 基础路径
const API_BASE = '/api';

// 状态
let currentPage = 1;
let pageSize = 20;
let totalAccounts = 0;
let selectedAccounts = new Set();

// DOM 元素
const accountsTable = document.getElementById('accounts-table');
const totalAccountsEl = document.getElementById('total-accounts');
const activeAccountsEl = document.getElementById('active-accounts');
const expiredAccountsEl = document.getElementById('expired-accounts');
const failedAccountsEl = document.getElementById('failed-accounts');
const filterStatus = document.getElementById('filter-status');
const filterService = document.getElementById('filter-service');
const searchInput = document.getElementById('search-input');
const refreshBtn = document.getElementById('refresh-btn');
const batchDeleteBtn = document.getElementById('batch-delete-btn');
const exportBtn = document.getElementById('export-btn');
const exportMenu = document.getElementById('export-menu');
const selectAllCheckbox = document.getElementById('select-all');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');
const detailModal = document.getElementById('detail-modal');
const modalBody = document.getElementById('modal-body');
const closeModalBtn = document.getElementById('close-modal');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadAccounts();
    initEventListeners();
});

// 事件监听
function initEventListeners() {
    // 筛选
    filterStatus.addEventListener('change', () => {
        currentPage = 1;
        loadAccounts();
    });

    filterService.addEventListener('change', () => {
        currentPage = 1;
        loadAccounts();
    });

    // 搜索
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentPage = 1;
            loadAccounts();
        }, 300);
    });

    // 刷新
    refreshBtn.addEventListener('click', () => {
        loadStats();
        loadAccounts();
    });

    // 批量删除
    batchDeleteBtn.addEventListener('click', handleBatchDelete);

    // 全选
    selectAllCheckbox.addEventListener('change', (e) => {
        const checkboxes = accountsTable.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const id = parseInt(cb.dataset.id);
            if (e.target.checked) {
                selectedAccounts.add(id);
            } else {
                selectedAccounts.delete(id);
            }
        });
        updateBatchButtons();
    });

    // 分页
    prevPageBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            loadAccounts();
        }
    });

    nextPageBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(totalAccounts / pageSize);
        if (currentPage < totalPages) {
            currentPage++;
            loadAccounts();
        }
    });

    // 导出
    exportBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportMenu.classList.toggle('active');
    });

    document.querySelectorAll('#export-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const format = e.target.dataset.format;
            exportAccounts(format);
            exportMenu.classList.remove('active');
        });
    });

    // 关闭模态框
    closeModalBtn.addEventListener('click', () => {
        detailModal.classList.remove('active');
    });

    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.classList.remove('active');
        }
    });

    // 点击其他地方关闭下拉菜单
    document.addEventListener('click', () => {
        exportMenu.classList.remove('active');
    });
}

// 加载统计信息
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/accounts/stats/summary`);
        const data = await response.json();

        totalAccountsEl.textContent = data.total || 0;
        activeAccountsEl.textContent = data.by_status?.active || 0;
        expiredAccountsEl.textContent = data.by_status?.expired || 0;
        failedAccountsEl.textContent = data.by_status?.failed || 0;
    } catch (error) {
        console.error('加载统计信息失败:', error);
    }
}

// 加载账号列表
async function loadAccounts() {
    const params = new URLSearchParams({
        page: currentPage,
        page_size: pageSize,
    });

    if (filterStatus.value) {
        params.append('status', filterStatus.value);
    }

    if (filterService.value) {
        params.append('email_service', filterService.value);
    }

    if (searchInput.value.trim()) {
        params.append('search', searchInput.value.trim());
    }

    try {
        const response = await fetch(`${API_BASE}/accounts?${params}`);
        const data = await response.json();

        totalAccounts = data.total;
        renderAccounts(data.accounts);
        updatePagination();
    } catch (error) {
        console.error('加载账号列表失败:', error);
        accountsTable.innerHTML = '<tr><td colspan="7" style="text-align: center;">加载失败</td></tr>';
    }
}

// 渲染账号列表
function renderAccounts(accounts) {
    if (accounts.length === 0) {
        accountsTable.innerHTML = '<tr><td colspan="7" style="text-align: center;">暂无数据</td></tr>';
        return;
    }

    accountsTable.innerHTML = accounts.map(account => `
        <tr>
            <td><input type="checkbox" data-id="${account.id}" ${selectedAccounts.has(account.id) ? 'checked' : ''}></td>
            <td>${account.id}</td>
            <td>${escapeHtml(account.email)}</td>
            <td>${escapeHtml(account.email_service)}</td>
            <td><span class="status-badge ${account.status}">${getStatusText(account.status)}</span></td>
            <td>${formatDate(account.registered_at)}</td>
            <td>
                <button class="btn btn-sm btn-secondary" onclick="viewAccount(${account.id})">查看</button>
                <button class="btn btn-sm btn-danger" onclick="deleteAccount(${account.id}, '${escapeHtml(account.email)}')">删除</button>
            </td>
        </tr>
    `).join('');

    // 绑定复选框事件
    accountsTable.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            if (e.target.checked) {
                selectedAccounts.add(id);
            } else {
                selectedAccounts.delete(id);
            }
            updateBatchButtons();
        });
    });
}

// 更新分页
function updatePagination() {
    const totalPages = Math.ceil(totalAccounts / pageSize);

    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;

    pageInfo.textContent = `第 ${currentPage} 页 / 共 ${totalPages} 页`;
}

// 更新批量操作按钮
function updateBatchButtons() {
    batchDeleteBtn.disabled = selectedAccounts.size === 0;
}

// 查看账号详情
async function viewAccount(id) {
    try {
        const response = await fetch(`${API_BASE}/accounts/${id}`);
        const account = await response.json();

        const tokensResponse = await fetch(`${API_BASE}/accounts/${id}/tokens`);
        const tokens = await tokensResponse.json();

        modalBody.innerHTML = `
            <div class="info-grid">
                <div class="info-item">
                    <span class="label">邮箱</span>
                    <span class="value">${escapeHtml(account.email)}</span>
                </div>
                <div class="info-item">
                    <span class="label">邮箱服务</span>
                    <span class="value">${escapeHtml(account.email_service)}</span>
                </div>
                <div class="info-item">
                    <span class="label">状态</span>
                    <span class="value">${getStatusText(account.status)}</span>
                </div>
                <div class="info-item">
                    <span class="label">注册时间</span>
                    <span class="value">${formatDate(account.registered_at)}</span>
                </div>
                <div class="info-item">
                    <span class="label">Account ID</span>
                    <span class="value">${escapeHtml(account.account_id || '-')}</span>
                </div>
                <div class="info-item">
                    <span class="label">Workspace ID</span>
                    <span class="value">${escapeHtml(account.workspace_id || '-')}</span>
                </div>
                <div class="info-item">
                    <span class="label">Access Token</span>
                    <span class="value" style="font-size: 0.75rem; word-break: break-all;">${escapeHtml(tokens.access_token || '-')}</span>
                </div>
                <div class="info-item">
                    <span class="label">Refresh Token</span>
                    <span class="value" style="font-size: 0.75rem; word-break: break-all;">${escapeHtml(tokens.refresh_token || '-')}</span>
                </div>
            </div>
        `;

        detailModal.classList.add('active');
    } catch (error) {
        alert('加载账号详情失败: ' + error.message);
    }
}

// 删除账号
async function deleteAccount(id, email) {
    if (!confirm(`确定要删除账号 ${email} 吗？`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/accounts/${id}`, {
            method: 'DELETE',
        });

        if (response.ok) {
            loadStats();
            loadAccounts();
        } else {
            const data = await response.json();
            alert('删除失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 批量删除
async function handleBatchDelete() {
    if (selectedAccounts.size === 0) return;

    if (!confirm(`确定要删除选中的 ${selectedAccounts.size} 个账号吗？`)) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/accounts/batch-delete`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                ids: Array.from(selectedAccounts),
            }),
        });

        const data = await response.json();

        if (response.ok) {
            alert(`成功删除 ${data.deleted_count} 个账号`);
            selectedAccounts.clear();
            loadStats();
            loadAccounts();
        } else {
            alert('删除失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        alert('删除失败: ' + error.message);
    }
}

// 导出账号
function exportAccounts(format) {
    const params = new URLSearchParams();

    if (filterStatus.value) {
        params.append('status', filterStatus.value);
    }

    if (filterService.value) {
        params.append('email_service', filterService.value);
    }

    window.location.href = `${API_BASE}/accounts/export/${format}?${params}`;
}

// 工具函数
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusText(status) {
    const statusMap = {
        'active': '活跃',
        'expired': '过期',
        'banned': '封禁',
        'failed': '失败',
    };
    return statusMap[status] || status;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN');
}
