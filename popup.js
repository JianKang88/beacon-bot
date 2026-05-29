/**
 * Popup 脚本 - 单窗口测试版
 */

// 状态
let isRunning = false;
let startTime = null;
let refreshInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    loadStatus();
    
    // 绑定按钮事件
    document.getElementById('btn-start').addEventListener('click', startAutomation);
    document.getElementById('btn-stop').addEventListener('click', stopAutomation);
    document.getElementById('btn-clear-logs').addEventListener('click', clearLogs);
    document.getElementById('btn-refresh').addEventListener('click', loadStatus);
    
    // 定时刷新
    refreshInterval = setInterval(() => {
        loadStatus();
        updateRunTime();
    }, 1000);
});

// 加载状态
async function loadStatus() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_STATUS' });
        if (response) {
            updateUI(response);
        }
    } catch (e) {
        console.error('加载状态失败:', e);
        addLog('ERROR', '无法连接到后台服务');
    }
}

// 更新UI
function updateUI(status) {
    isRunning = status.isRunning;
    
    // 更新状态文本
    const statusText = document.getElementById('status-text');
    const currentState = document.getElementById('current-state');
    const btnStart = document.getElementById('btn-start');
    const btnStop = document.getElementById('btn-stop');
    
    if (isRunning) {
        statusText.textContent = '运行中';
        statusText.className = 'status-value running';
        btnStart.disabled = true;
        btnStop.disabled = false;
        
        if (!startTime) {
            startTime = Date.now();
        }
    } else {
        statusText.textContent = '已停止';
        statusText.className = 'status-value stopped';
        btnStart.disabled = false;
        btnStop.disabled = true;
        startTime = null;
    }
    
    currentState.textContent = status.currentState || '空闲';
    
    // 更新日志
    if (status.logs && status.logs.length > 0) {
        updateLogs(status.logs);
    }
}

// 更新日志显示
function updateLogs(logs) {
    const logsList = document.getElementById('logs-list');
    const logCount = document.getElementById('log-count');
    
    // 清空并重新渲染
    logsList.innerHTML = logs.map(log => `
        <div class="log-item">
            <span class="log-time">${log.time}</span>
            <span class="log-level-${log.level.toLowerCase()}">[${log.level}]</span>
            <span class="log-message">${log.message}</span>
        </div>
    `).join('');
    
    logCount.textContent = `${logs.length} 条`;
    
    // 滚动到底部
    logsList.scrollTop = logsList.scrollHeight;
}

// 添加单条日志
function addLog(level, message) {
    const time = new Date().toLocaleTimeString();
    const logsList = document.getElementById('logs-list');
    
    const logItem = document.createElement('div');
    logItem.className = 'log-item';
    logItem.innerHTML = `
        <span class="log-time">${time}</span>
        <span class="log-level-${level.toLowerCase()}">[${level}]</span>
        <span class="log-message">${message}</span>
    `;
    
    logsList.appendChild(logItem);
    logsList.scrollTop = logsList.scrollHeight;
    
    // 更新计数
    const count = logsList.children.length;
    document.getElementById('log-count').textContent = `${count} 条`;
}

// 更新运行时间
function updateRunTime() {
    if (!isRunning || !startTime) {
        document.getElementById('run-time').textContent = '00:00';
        return;
    }
    
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const seconds = (elapsed % 60).toString().padStart(2, '0');
    
    document.getElementById('run-time').textContent = `${minutes}:${seconds}`;
}

// 开始自动化
async function startAutomation() {
    try {
        addLog('INFO', '正在启动...');
        const response = await chrome.runtime.sendMessage({ type: 'START' });
        
        if (response && response.success) {
            isRunning = true;
            startTime = Date.now();
            addLog('INFO', '自动化已启动');
            loadStatus();
        } else {
            addLog('ERROR', response.error || '启动失败');
        }
    } catch (e) {
        addLog('ERROR', '启动失败: ' + e.message);
    }
}

// 停止自动化
async function stopAutomation() {
    try {
        addLog('INFO', '正在停止...');
        const response = await chrome.runtime.sendMessage({ type: 'STOP' });
        
        if (response && response.success) {
            isRunning = false;
            startTime = null;
            addLog('INFO', '自动化已停止');
            loadStatus();
        }
    } catch (e) {
        addLog('ERROR', '停止失败: ' + e.message);
    }
}

// 清空日志
function clearLogs() {
    document.getElementById('logs-list').innerHTML = `
        <div class="log-item">
            <span class="log-time">--:--:--</span>
            <span class="log-message">日志已清空</span>
        </div>
    `;
    document.getElementById('log-count').textContent = '0 条';
}

// 清理
window.addEventListener('unload', () => {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});
