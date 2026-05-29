/**
 * 单窗口测试版 - Background Script
 * 简化的后台管理，只控制单个窗口
 */

// 全局状态
let isRunning = false;
let currentState = 'IDLE';
let logs = [];

// 添加日志
function addLog(level, message) {
  const log = {
    time: new Date().toLocaleTimeString(),
    level,
    message
  };
  logs.push(log);
  console.log(`[${log.time}] ${level}: ${message}`);
  
  // 只保留最近100条日志
  if (logs.length > 100) {
    logs = logs.slice(-100);
  }
}

// 获取活动标签页
async function getGameTab() {
  const tabs = await chrome.tabs.query({
    url: 'https://app.thebeacon.gg/*',
    active: true,
    currentWindow: true
  });
  return tabs[0] || null;
}

// 发送命令到content script
async function sendCommand(command, data = {}) {
  const tab = await getGameTab();
  if (!tab) {
    addLog('ERROR', '未找到游戏标签页，请确保已打开 https://app.thebeacon.gg');
    return { success: false, error: '未找到游戏标签页，请确保已打开游戏页面' };
  }
  
  // 先检查content script是否已注入
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'PING' });
  } catch (e) {
    // Content script 未注入，尝试手动注入
    addLog('INFO', '正在注入内容脚本...');
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      addLog('INFO', '内容脚本注入成功');
      // 等待脚本初始化
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (injectError) {
      addLog('ERROR', `注入脚本失败: ${injectError.message}`);
      return { success: false, error: '无法注入自动化脚本，请刷新页面后重试' };
    }
  }
  
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'COMMAND',
      command,
      data
    });
    return response || { success: false, error: '无响应' };
  } catch (e) {
    addLog('ERROR', `发送命令失败: ${e.message}`);
    return { success: false, error: `通信失败: ${e.message}，请刷新页面后重试` };
  }
}

// 开始自动化
async function startAutomation() {
  if (isRunning) {
    addLog('WARN', '已经在运行中');
    return { success: false, error: '已经在运行中' };
  }
  
  addLog('INFO', '开始自动化测试');
  isRunning = true;
  currentState = 'STARTING';
  
  const result = await sendCommand('start');
  if (!result.success) {
    isRunning = false;
    currentState = 'ERROR';
  }
  
  return result;
}

// 停止自动化
async function stopAutomation() {
  addLog('INFO', '停止自动化');
  isRunning = false;
  currentState = 'STOPPED';
  
  return await sendCommand('stop');
}

// 获取状态
function getStatus() {
  return {
    isRunning,
    currentState,
    logs: logs.slice(-20) // 返回最近20条日志
  };
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, data } = message;
  
  switch (type) {
    case 'START':
      startAutomation().then(sendResponse);
      return true;
      
    case 'STOP':
      stopAutomation().then(sendResponse);
      return true;
      
    case 'GET_STATUS':
      sendResponse(getStatus());
      return true;
      
    case 'STATE_UPDATE':
      // 接收来自content script的状态更新
      currentState = data.state;
      addLog('INFO', `状态更新: ${data.state}`);
      sendResponse({ success: true });
      return true;
      
    case 'LOG':
      // 接收来自content script的日志
      addLog(data.level, data.message);
      sendResponse({ success: true });
      return true;
  }
});

// 初始化
addLog('INFO', '单窗口测试版已加载');
