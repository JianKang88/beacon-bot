/**
 * 灯塔游戏自动化 - 图像识别版
 * 核心思路：在Canvas上直接进行模板匹配，找到目标后点击
 */

// ============================================================
// 配置
// ============================================================
const CONFIG = {
  matchThreshold: 0.75,    // 模板匹配阈值（75%相似度）
  searchStep: 4,           // 搜索步长（像素）
  clickDelay: 500,         // 点击后等待时间
};

// ============================================================
// 图像识别核心
// ============================================================
class ImageMatcher {
  constructor() {
    this.gameCanvas = null;
    this.templates = {};
    this.debug = true;
  }

  // 日志
  log(msg) {
    console.log(`[Beacon] ${msg}`);
    this.showLog(msg);
  }

  // 显示日志到页面
  showLog(msg) {
    const logEl = document.querySelector('#beacon-logs');
    if (logEl) {
      const line = document.createElement('div');
      line.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
      logEl.insertBefore(line, logEl.firstChild);
      while (logEl.children.length > 10) logEl.removeChild(logEl.lastChild);
    }
  }

  // 获取游戏Canvas
  getCanvas() {
    this.gameCanvas = document.querySelector('canvas');
    return this.gameCanvas;
  }

  // 加载模板图片
  async loadTemplate(name, url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        // 创建临时canvas获取像素数据
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const data = ctx.getImageData(0, 0, img.width, img.height);
        this.templates[name] = {
          width: img.width,
          height: img.height,
          data: data.data
        };
        this.log(`模板加载成功: ${name} (${img.width}x${img.height})`);
        resolve(true);
      };
      img.onerror = () => {
        this.log(`模板加载失败: ${name}`);
        resolve(false);
      };
      img.src = url;
    });
  }

  // 在Canvas上查找模板
  findTemplate(templateName) {
    const canvas = this.getCanvas();
    if (!canvas) {
      this.log('未找到游戏Canvas');
      return null;
    }

    const template = this.templates[templateName];
    if (!template) {
      this.log(`模板不存在: ${templateName}`);
      return null;
    }

    try {
      const ctx = canvas.getContext('2d');
      const canvasData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      // 在Canvas中央区域搜索（START按钮通常在中央偏下）
      const searchRegion = {
        startX: Math.floor(canvas.width * 0.3),
        endX: Math.floor(canvas.width * 0.7),
        startY: Math.floor(canvas.height * 0.5),
        endY: Math.floor(canvas.height * 0.8)
      };

      let bestMatch = null;
      let bestScore = 0;

      // 遍历搜索区域
      for (let y = searchRegion.startY; y <= searchRegion.endY - template.height; y += CONFIG.searchStep) {
        for (let x = searchRegion.startX; x <= searchRegion.endX - template.width; x += CONFIG.searchStep) {
          const score = this.compareRegion(
            canvasData.data, canvas.width,
            template.data, template.width, template.height,
            x, y
          );

          if (score > bestScore) {
            bestScore = score;
            bestMatch = { x, y, score };
          }
        }
      }

      if (bestScore >= CONFIG.matchThreshold) {
        // 返回匹配位置的中心点（相对于Canvas）
        const centerX = bestMatch.x + template.width / 2;
        const centerY = bestMatch.y + template.height / 2;
        this.log(`找到 ${templateName}: 相似度 ${(bestScore * 100).toFixed(1)}%, 位置 (${Math.round(centerX)}, ${Math.round(centerY)})`);
        return { x: centerX, y: centerY, score: bestScore };
      } else {
        this.log(`未找到 ${templateName}: 最高相似度 ${(bestScore * 100).toFixed(1)}%`);
        return null;
      }

    } catch (error) {
      this.log(`模板匹配出错: ${error.message}`);
      return null;
    }
  }

  // 比较区域相似度
  compareRegion(canvasPixels, canvasWidth, templatePixels, tplWidth, tplHeight, startX, startY) {
    let totalDiff = 0;
    let count = 0;
    const step = 3; // 采样步长

    for (let y = 0; y < tplHeight; y += step) {
      for (let x = 0; x < tplWidth; x += step) {
        const canvasIdx = ((startY + y) * canvasWidth + (startX + x)) * 4;
        const tplIdx = (y * tplWidth + x) * 4;

        // RGB差异
        const rDiff = Math.abs(canvasPixels[canvasIdx] - templatePixels[tplIdx]);
        const gDiff = Math.abs(canvasPixels[canvasIdx + 1] - templatePixels[tplIdx + 1]);
        const bDiff = Math.abs(canvasPixels[canvasIdx + 2] - templatePixels[tplIdx + 2]);

        totalDiff += (rDiff + gDiff + bDiff) / 3;
        count++;
      }
    }

    // 相似度 = 1 - 平均差异/255
    return Math.max(0, 1 - (totalDiff / count / 255));
  }

  // 点击Canvas上的指定位置
  async clickAt(x, y) {
    const canvas = this.getCanvas();
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    
    // Canvas坐标转屏幕坐标
    const screenX = rect.left + (x / canvas.width) * rect.width;
    const screenY = rect.top + (y / canvas.height) * rect.height;

    this.log(`点击位置: (${Math.round(screenX)}, ${Math.round(screenY)})`);

    // 触发点击事件
    const events = [
      new MouseEvent('mousemove', { bubbles: true, clientX: screenX, clientY: screenY }),
      new PointerEvent('pointerdown', { bubbles: true, clientX: screenX, clientY: screenY, button: 0 }),
      new MouseEvent('mousedown', { bubbles: true, clientX: screenX, clientY: screenY, button: 0 }),
      new PointerEvent('pointerup', { bubbles: true, clientX: screenX, clientY: screenY, button: 0 }),
      new MouseEvent('mouseup', { bubbles: true, clientX: screenX, clientY: screenY, button: 0 }),
      new MouseEvent('click', { bubbles: true, clientX: screenX, clientY: screenY, button: 0 }),
    ];

    // 在Canvas上触发
    for (const event of events) {
      canvas.dispatchEvent(event);
    }

    // 也在document上触发（某些游戏监听document）
    for (const event of events) {
      document.dispatchEvent(event);
    }

    await this.sleep(CONFIG.clickDelay);
    return true;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================
// 自动化控制
// ============================================================
class BeaconAutomation {
  constructor() {
    this.matcher = new ImageMatcher();
    this.isRunning = false;
    this.createUI();
  }

  // 创建UI
  createUI() {
    const ui = document.createElement('div');
    ui.id = 'beacon-ui';
    ui.style.cssText = `
      position: fixed; top: 10px; right: 10px; width: 320px;
      background: rgba(0,0,0,0.95); color: #0f0; font-family: monospace;
      font-size: 12px; padding: 15px; border-radius: 8px; z-index: 999999;
      border: 2px solid #0f0; box-shadow: 0 4px 20px rgba(0,255,0,0.3);
    `;
    ui.innerHTML = `
      <div style="font-weight:bold;font-size:14px;margin-bottom:10px;border-bottom:1px solid #0f0;padding-bottom:5px;">
        🎯 灯塔自动化 - 图像识别版
      </div>
      <div id="beacon-status" style="color:#ff0;margin-bottom:10px;">状态: 就绪</div>
      <div id="beacon-logs" style="max-height:150px;overflow-y:auto;font-size:11px;margin-bottom:10px;">
        <div style="color:#666;">等待启动...</div>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="btn-start" style="flex:1;padding:8px;background:#0f0;color:#000;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
          开始
        </button>
        <button id="btn-stop" style="flex:1;padding:8px;background:#f00;color:#fff;border:none;border-radius:4px;cursor:pointer;">
          停止
        </button>
      </div>
    `;
    document.body.appendChild(ui);

    // 绑定按钮
    ui.querySelector('#btn-start').onclick = () => this.start();
    ui.querySelector('#btn-stop').onclick = () => this.stop();
  }

  // 更新状态
  setStatus(text) {
    const el = document.querySelector('#beacon-status');
    if (el) el.textContent = `状态: ${text}`;
  }

  // 开始自动化
  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.setStatus('运行中');

    this.matcher.log('=== 开始自动化 ===');

    // 1. 加载START按钮模板
    const templateLoaded = await this.matcher.loadTemplate(
      'start_button',
      chrome.runtime.getURL('templates/start_button.png')
    );

    if (!templateLoaded) {
      this.matcher.log('模板加载失败，无法继续');
      this.stop();
      return;
    }

    // 2. 查找START按钮
    const result = this.matcher.findTemplate('start_button');

    if (result) {
      // 3. 点击START按钮
      await this.matcher.clickAt(result.x, result.y);
      
      // 4. 等待游戏加载
      this.matcher.log('等待游戏加载...');
      await this.matcher.sleep(3000);

      // 5. 检查是否进入游戏
      const canvas = this.matcher.getCanvas();
      if (canvas) {
        this.matcher.log('成功进入游戏！');
        this.setStatus('游戏中');
        // TODO: 继续游戏自动化...
      } else {
        this.matcher.log('游戏加载超时');
      }
    } else {
      this.matcher.log('未找到START按钮');
    }

    this.stop();
  }

  // 停止自动化
  stop() {
    this.isRunning = false;
    this.setStatus('已停止');
    this.matcher.log('自动化已停止');
  }
}

// ============================================================
// 初始化
// ============================================================
let automation = null;

function init() {
  console.log('[Beacon] 初始化图像识别自动化...');
  automation = new BeaconAutomation();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// 监听消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'COMMAND') {
    if (message.command === 'start') {
      automation.start().then(() => sendResponse({ success: true }));
      return true;
    }
    if (message.command === 'stop') {
      automation.stop();
      sendResponse({ success: true });
      return true;
    }
  }
});
