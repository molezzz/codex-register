/**
 * 注册页面 JavaScript
 */

// API 基础路径
const API_BASE = '/api';

// 状态
let currentTask = null;
let currentBatch = null;
let logPollingInterval = null;
let batchPollingInterval = null;
let isBatchMode = false;

// DOM 元素
const registrationForm = document.getElementById('registration-form');
const emailServiceSelect = document.getElementById('email-service');
const proxyInput = document.getElementById('proxy');
const regModeSelect = document.getElementById('reg-mode');
const batchCountGroup = document.getElementById('batch-count-group');
const batchCountInput = document.getElementById('batch-count');
const batchOptions = document.getElementById('batch-options');
const intervalMinInput = document.getElementById('interval-min');
const intervalMaxInput = document.getElementById('interval-max');
const startBtn = document.getElementById('start-btn');
const cancelBtn = document.getElementById('cancel-btn');
const taskStatusCard = document.getElementById('task-status-card');
const batchStatusCard = document.getElementById('batch-status-card');
const consoleLog = document.getElementById('console-log');
const clearLogBtn = document.getElementById('clear-log-btn');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initEventListeners();
});

// 事件监听
function initEventListeners() {
    // 注册表单提交
    registrationForm.addEventListener('submit', handleStartRegistration);

    // 注册模式切换
    regModeSelect.addEventListener('change', handleModeChange);

    // 取消按钮
    cancelBtn.addEventListener('click', handleCancelTask);

    // 清空日志
    clearLogBtn.addEventListener('click', () => {
        consoleLog.innerHTML = '<div class="log-line info">[*] 日志已清空</div>';
    });
}

// 模式切换
function handleModeChange(e) {
    const mode = e.target.value;
    isBatchMode = mode === 'batch';

    batchCountGroup.style.display = isBatchMode ? 'block' : 'none';
    batchOptions.style.display = isBatchMode ? 'block' : 'none';
}

// 开始注册
async function handleStartRegistration(e) {
    e.preventDefault();

    const emailService = emailServiceSelect.value;
    const proxy = proxyInput.value.trim() || null;

    // 禁用开始按钮
    startBtn.disabled = true;
    cancelBtn.disabled = false;

    // 清空日志
    consoleLog.innerHTML = '';

    if (isBatchMode) {
        await handleBatchRegistration(emailService, proxy);
    } else {
        await handleSingleRegistration(emailService, proxy);
    }
}

// 单次注册
async function handleSingleRegistration(emailService, proxy) {
    addLog('info', '[*] 正在启动注册任务...');

    try {
        const response = await fetch(`${API_BASE}/registration/start`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                email_service_type: emailService,
                proxy: proxy,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            currentTask = data;
            addLog('info', `[*] 任务已创建: ${data.task_uuid}`);
            showTaskStatus(data);

            // 开始轮询日志
            startLogPolling(data.task_uuid);
        } else {
            addLog('error', `[Error] 启动失败: ${data.detail || '未知错误'}`);
            resetButtons();
        }
    } catch (error) {
        addLog('error', `[Error] 网络错误: ${error.message}`);
        resetButtons();
    }
}

// 批量注册
async function handleBatchRegistration(emailService, proxy) {
    const count = parseInt(batchCountInput.value) || 5;
    const intervalMin = parseInt(intervalMinInput.value) || 5;
    const intervalMax = parseInt(intervalMaxInput.value) || 30;

    addLog('info', `[*] 正在启动批量注册任务 (数量: ${count})...`);

    try {
        const response = await fetch(`${API_BASE}/registration/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                count: count,
                email_service_type: emailService,
                proxy: proxy,
                interval_min: intervalMin,
                interval_max: intervalMax,
            }),
        });

        const data = await response.json();

        if (response.ok) {
            currentBatch = data;
            addLog('info', `[*] 批量任务已创建: ${data.batch_id}`);
            addLog('info', `[*] 共 ${data.count} 个任务已加入队列`);
            showBatchStatus(data);

            // 开始轮询批量状态
            startBatchPolling(data.batch_id);
        } else {
            addLog('error', `[Error] 启动失败: ${data.detail || '未知错误'}`);
            resetButtons();
        }
    } catch (error) {
        addLog('error', `[Error] 网络错误: ${error.message}`);
        resetButtons();
    }
}

// 取消任务
async function handleCancelTask() {
    if (isBatchMode && currentBatch) {
        try {
            const response = await fetch(`${API_BASE}/registration/batch/${currentBatch.batch_id}/cancel`, {
                method: 'POST',
            });

            if (response.ok) {
                addLog('warning', '[!] 批量任务取消请求已提交');
                stopBatchPolling();
                resetButtons();
            }
        } catch (error) {
            addLog('error', `[Error] 取消失败: ${error.message}`);
        }
    } else if (currentTask) {
        try {
            const response = await fetch(`${API_BASE}/registration/tasks/${currentTask.task_uuid}/cancel`, {
                method: 'POST',
            });

            if (response.ok) {
                addLog('warning', '[!] 任务已取消');
                stopLogPolling();
                resetButtons();
            }
        } catch (error) {
            addLog('error', `[Error] 取消失败: ${error.message}`);
        }
    }
}

// 开始轮询日志
function startLogPolling(taskUuid) {
    let lastLogLine = '';

    logPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/registration/tasks/${taskUuid}/logs`);
            const data = await response.json();

            if (response.ok) {
                // 更新任务状态
                updateTaskStatus(data.status);

                // 添加新日志
                const logs = data.logs || [];
                logs.forEach(log => {
                    if (log !== lastLogLine) {
                        const logType = getLogType(log);
                        addLog(logType, log);
                        lastLogLine = log;
                    }
                });

                // 检查任务是否完成
                if (['completed', 'failed', 'cancelled'].includes(data.status)) {
                    stopLogPolling();
                    resetButtons();

                    if (data.status === 'completed') {
                        addLog('success', '[*] 注册成功！');
                    } else if (data.status === 'failed') {
                        addLog('error', '[Error] 注册失败');
                    }
                }
            }
        } catch (error) {
            console.error('轮询日志失败:', error);
        }
    }, 1000);
}

// 停止轮询日志
function stopLogPolling() {
    if (logPollingInterval) {
        clearInterval(logPollingInterval);
        logPollingInterval = null;
    }
}

// 开始轮询批量状态
function startBatchPolling(batchId) {
    batchPollingInterval = setInterval(async () => {
        try {
            const response = await fetch(`${API_BASE}/registration/batch/${batchId}`);
            const data = await response.json();

            if (response.ok) {
                updateBatchProgress(data);

                // 检查是否完成
                if (data.finished) {
                    stopBatchPolling();
                    resetButtons();

                    addLog('info', `[*] 批量任务完成！成功: ${data.success}, 失败: ${data.failed}`);
                }
            }
        } catch (error) {
            console.error('轮询批量状态失败:', error);
        }
    }, 2000);
}

// 停止轮询批量状态
function stopBatchPolling() {
    if (batchPollingInterval) {
        clearInterval(batchPollingInterval);
        batchPollingInterval = null;
    }
}

// 显示任务状态
function showTaskStatus(task) {
    taskStatusCard.style.display = 'block';
    batchStatusCard.style.display = 'none';
    document.getElementById('task-id').textContent = task.task_uuid;
    updateTaskStatus(task.status);
}

// 更新任务状态
function updateTaskStatus(status) {
    const statusBadge = document.getElementById('task-status-badge');
    const statusText = document.getElementById('task-status');

    const statusMap = {
        'pending': { text: '等待中', class: '' },
        'running': { text: '运行中', class: 'running' },
        'completed': { text: '已完成', class: 'completed' },
        'failed': { text: '失败', class: 'failed' },
        'cancelled': { text: '已取消', class: '' },
    };

    const info = statusMap[status] || { text: status, class: '' };
    statusBadge.textContent = info.text;
    statusBadge.className = 'status-badge ' + info.class;
    statusText.textContent = info.text;
}

// 显示批量状态
function showBatchStatus(batch) {
    batchStatusCard.style.display = 'block';
    taskStatusCard.style.display = 'none';
    document.getElementById('batch-progress').textContent = `0/${batch.count}`;
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('batch-success').textContent = '0';
    document.getElementById('batch-failed').textContent = '0';
    document.getElementById('batch-remaining').textContent = batch.count;
}

// 更新批量进度
function updateBatchProgress(data) {
    const progress = data.completed / data.total * 100;
    document.getElementById('batch-progress').textContent = data.progress;
    document.getElementById('progress-bar').style.width = `${progress}%`;
    document.getElementById('batch-success').textContent = data.success;
    document.getElementById('batch-failed').textContent = data.failed;
    document.getElementById('batch-remaining').textContent = data.total - data.completed;

    // 记录日志
    if (data.completed > 0) {
        addLog('info', `[*] 进度: ${data.progress}, 成功: ${data.success}, 失败: ${data.failed}`);
    }
}

// 添加日志
function addLog(type, message) {
    const line = document.createElement('div');
    line.className = `log-line ${type}`;
    line.textContent = message;
    consoleLog.appendChild(line);

    // 自动滚动到底部
    consoleLog.scrollTop = consoleLog.scrollHeight;
}

// 获取日志类型
function getLogType(log) {
    if (log.includes('[Error]') || log.includes('失败') || log.includes('错误')) {
        return 'error';
    }
    if (log.includes('[!]') || log.includes('警告')) {
        return 'warning';
    }
    if (log.includes('成功') || log.includes('完成')) {
        return 'success';
    }
    return 'info';
}

// 重置按钮状态
function resetButtons() {
    startBtn.disabled = false;
    cancelBtn.disabled = true;
    currentTask = null;
    currentBatch = null;
}
