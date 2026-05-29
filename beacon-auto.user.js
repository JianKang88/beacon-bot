// ==UserScript==
// @name         灯塔自动化 v5.3 - iframe修复版
// @namespace    beacon-auto
// @version      5.3.0
// @description  灯塔游戏全自动化：登录→寻路→副本→打怪→结算→刷碎片→商城→循环
// @author       BeaconAuto
// @match        https://app.thebeacon.gg/*
// @match        https://play.thebeacon.gg/*
// @match        https://*.thebeacon.gg/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  // 防止重复初始化
  if (window.__beaconAutoLoaded) return;
  window.__beaconAutoLoaded = true;

  // 检测是否在iframe中
  const isInIframe = window.self !== window.top;
  const currentUrl = window.location.href;

  // 过滤无关页面：只在thebeacon.gg相关页面运行
  if (!currentUrl.includes('thebeacon.gg')) {
    return;
  }

  console.log('[Beacon] v5.2 初始化 | iframe=' + isInIframe + ' url=' + currentUrl);

  // ============================================================
  // 全局配置
  // ============================================================
  const CFG = {
    // 时间配置（毫秒）
    keyHoldTime: 300,
    keyReleaseTime: 100,
    moveStepDelay: 500,
    actionDelay: 800,
    fightDelay: 600,
    collectDelay: 400,
    doorOpenDelay: 1500,
    transitionDelay: 3000,

    // 移动配置
    walkDuration: 800,
    walkStepsPerSegment: 3,

    // 颜色扫描
    colorScanStep: 4,

    // 怪物颜色特征（需根据实际游戏画面校准）
    monsterColors: [
      { rMin: 200, rMax: 255, gMin: 200, gMax: 255, bMin: 200, bMax: 255, name: '骷髅' },
      { rMin: 30, rMax: 100, gMin: 150, gMax: 255, bMin: 30, bMax: 100, name: '哥布林' },
      { rMin: 200, rMax: 255, gMin: 30, gMax: 80, bMin: 30, bMax: 80, name: '精英骷髅' },
      { rMin: 30, rMax: 80, gMin: 100, gMax: 180, bMin: 200, bMax: 255, name: '持盾骷髅' },
      { rMin: 150, rMax: 220, gMin: 30, gMax: 80, bMin: 180, bMax: 255, name: '骷髅法师' },
    ],

    // 增益颜色（金色/黄色）
    buffColor: { rMin: 220, rMax: 255, gMin: 200, gMax: 255, bMin: 0, bMax: 60 },

    // 出口大门颜色（发光蓝/白色）
    exitDoorColor: { rMin: 100, rMax: 200, gMin: 200, gMax: 255, bMin: 200, bMax: 255 },

    // 陷阱颜色
    spikeColor: { rMin: 150, rMax: 220, gMin: 150, gMax: 220, bMin: 150, bMax: 220 },
    cannonColor: { rMin: 140, rMax: 200, gMin: 20, gMax: 80, bMin: 180, bMax: 255 },

    // 碎片阈值
    fragmentThreshold: 1000,

    // Canvas轮询
    canvasPollInterval: 2000,
  };

  // ============================================================
  // 工具函数
  // ============================================================
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  // ============================================================
  // 键盘控制模块（WASD）
  // ============================================================
  class KeyboardController {
    constructor() {
      this.target = document.body;
    }

    // 按下并释放单个键
    async pressKey(key, duration) {
      duration = duration || CFG.keyHoldTime;
      const code = 'Key' + key.toUpperCase();
      const opts = {
        key: key.toLowerCase(), code: code,
        keyCode: key.charCodeAt(0), which: key.charCodeAt(0),
        bubbles: true, cancelable: true, repeat: false
      };
      this.target.dispatchEvent(new KeyboardEvent('keydown', opts));
      await sleep(duration);
      this.target.dispatchEvent(new KeyboardEvent('keyup', opts));
      await sleep(CFG.keyReleaseTime);
    }

    // 持续移动
    async walk(direction, duration) {
      duration = duration || CFG.walkDuration;
      const key = direction.toUpperCase();
      const code = 'Key' + key;
      const opts = {
        key: key.toLowerCase(), code: code,
        keyCode: key.charCodeAt(0), which: key.charCodeAt(0),
        bubbles: true, cancelable: true, repeat: false
      };
      this.target.dispatchEvent(new KeyboardEvent('keydown', opts));
      await sleep(duration);
      this.target.dispatchEvent(new KeyboardEvent('keyup', opts));
      await sleep(CFG.moveStepDelay);
    }

    // 多步移动
    async walkSteps(direction, steps, durationPerStep) {
      steps = steps || CFG.walkStepsPerSegment;
      durationPerStep = durationPerStep || CFG.walkDuration;
      for (let i = 0; i < steps; i++) {
        await this.walk(direction, durationPerStep);
        await sleep(rand(100, 300));
      }
    }

    // 攻击（空格）
    async attack() {
      await this.pressKey(' ', 200);
    }

    // 交互（E）
    async interact() {
      await this.pressKey('e', 300);
    }

    // 逃跑（Esc）
    async escape() {
      await this.pressKey('Escape', 200);
    }
  }

  // ============================================================
  // Canvas像素识别模块
  // ============================================================
  class PixelScanner {
    constructor() {
      this._canvas = null;
      this._ctx = null;
    }

    // 查找Canvas
    findCanvas(diagnostic) {
      let canvases = document.querySelectorAll('canvas');
      if (diagnostic) {
        console.log('[Beacon] Canvas数:', canvases.length, '| url:', window.location.href, '| iframe:', isInIframe);
      }

      // 不在iframe中时，尝试查找iframe内的Canvas
      if (canvases.length === 0 && !isInIframe) {
        const iframes = document.querySelectorAll('iframe');
        if (diagnostic) console.log('[Beacon] iframe数:', iframes.length);
        for (const iframe of iframes) {
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            canvases = doc.querySelectorAll('canvas');
            if (canvases.length > 0) {
              if (diagnostic) console.log('[Beacon] iframe中找到Canvas:', canvases.length);
              break;
            }
          } catch (e) {
            if (diagnostic) console.log('[Beacon] iframe跨域:', iframe.src || '未知');
          }
        }
      }

      if (canvases.length === 0) return null;

      // 选最大的Canvas
      let best = null, bestScore = 0;
      for (const c of canvases) {
        const aw = c.width || 0, ah = c.height || 0;
        const rect = c.getBoundingClientRect();
        const cw = rect.width || 0, ch = rect.height || 0;
        const score = (aw * ah) + (cw * ch);
        if (diagnostic) {
          console.log('[Beacon] Canvas: attr=' + aw + 'x' + ah + ' css=' + Math.round(cw) + 'x' + Math.round(ch) + ' score=' + score);
        }
        if (score > bestScore) { bestScore = score; best = c; }
      }
      return best;
    }

    // 获取上下文
    getContext(canvas) {
      if (!canvas) return null;
      try {
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) return ctx;
      } catch (e) {}
      try {
        const ctx = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (ctx) return ctx;
      } catch (e) {}
      try {
        const ctx = canvas.getContext('webgl', { preserveDrawingBuffer: true });
        if (ctx) return ctx;
      } catch (e) {}
      return null;
    }

    // 获取有效尺寸
    getSize(canvas) {
      if (!canvas) return { w: 0, h: 0 };
      let w = canvas.width || 0, h = canvas.height || 0;
      if (w === 0 || h === 0) {
        const r = canvas.getBoundingClientRect();
        w = Math.round(r.width) || 0;
        h = Math.round(r.height) || 0;
      }
      return { w, h };
    }

    // 刷新Canvas
    refresh() {
      this._canvas = this.findCanvas(false);
      this._ctx = this._canvas ? this.getContext(this._canvas) : null;
      return !!this._canvas;
    }

    // 颜色区域扫描
    scanColor(colorCfg, region) {
      if (!this._ctx || !this._canvas) return null;
      const size = this.getSize(this._canvas);
      if (size.w === 0 || size.h === 0) return null;

      const sx = region ? region.sx : Math.floor(size.w * 0.1);
      const sy = region ? region.sy : Math.floor(size.h * 0.1);
      const sw = region ? region.sw : Math.floor(size.w * 0.8);
      const sh = region ? region.sh : Math.floor(size.h * 0.8);

      try {
        const data = this._ctx.getImageData(sx, sy, sw, sh);
        const matches = [];
        const step = CFG.colorScanStep;

        for (let y = 0; y < sh; y += step) {
          for (let x = 0; x < sw; x += step) {
            const i = (y * data.width + x) * 4;
            const r = data.data[i], g = data.data[i + 1], b = data.data[i + 2];
            if (r >= colorCfg.rMin && r <= colorCfg.rMax &&
                g >= colorCfg.gMin && g <= colorCfg.gMax &&
                b >= colorCfg.bMin && b <= colorCfg.bMax) {
              matches.push({ x: sx + x, y: sy + y });
            }
          }
        }

        if (matches.length >= 3) {
          let cx = 0, cy = 0;
          for (const m of matches) { cx += m.x; cy += m.y; }
          return { x: Math.round(cx / matches.length), y: Math.round(cy / matches.length), count: matches.length };
        }
        return null;
      } catch (e) {
        return null;
      }
    }

    // 扫描怪物
    scanMonsters() {
      for (const mc of CFG.monsterColors) {
        const result = this.scanColor(mc);
        if (result) return { ...result, type: mc.name };
      }
      return null;
    }

    // 扫描增益
    scanBuff() { return this.scanColor(CFG.buffColor); }

    // 扫描出口
    scanExitDoor() { return this.scanColor(CFG.exitDoorColor); }

    // 扫描陷阱
    scanTraps() {
      return { spike: this.scanColor(CFG.spikeColor), cannon: this.scanColor(CFG.cannonColor) };
    }

    // 屏幕中心
    getCenter() {
      if (!this._canvas) return null;
      const s = this.getSize(this._canvas);
      return { x: Math.floor(s.w / 2), y: Math.floor(s.h / 2) };
    }

    // 采样区域平均颜色
    sampleArea(cx, cy, radius) {
      if (!this._ctx || !this._canvas) return null;
      try {
        const data = this._ctx.getImageData(cx - radius, cy - radius, radius * 2, radius * 2);
        let rS = 0, gS = 0, bS = 0, cnt = 0;
        for (let y = 0; y < radius * 2; y += 4) {
          for (let x = 0; x < radius * 2; x += 4) {
            const i = (y * data.width + x) * 4;
            rS += data.data[i]; gS += data.data[i + 1]; bS += data.data[i + 2]; cnt++;
          }
        }
        return { r: Math.round(rS / cnt), g: Math.round(gS / cnt), b: Math.round(bS / cnt) };
      } catch (e) { return null; }
    }
  }

  // ============================================================
  // 鼠标控制模块
  // ============================================================
  class MouseController {
    async clickCanvas(x, y) {
      const scanner = window.__beaconScanner;
      if (!scanner || !scanner._canvas) return false;
      const canvas = scanner._canvas;
      const rect = canvas.getBoundingClientRect();
      const size = scanner.getSize(canvas);
      const sx = rect.left + (x / size.w) * rect.width;
      const sy = rect.top + (y / size.h) * rect.height;
      const cfg = { bubbles: true, cancelable: true, view: window, clientX: sx, clientY: sy };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...cfg, button: 0, pointerId: 1 }));
      canvas.dispatchEvent(new MouseEvent('mousedown', cfg));
      await sleep(50);
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...cfg, button: 0, pointerId: 1 }));
      canvas.dispatchEvent(new MouseEvent('mouseup', cfg));
      canvas.dispatchEvent(new MouseEvent('click', cfg));
      await sleep(CFG.actionDelay);
      return true;
    }

    async clickCenter() {
      const scanner = window.__beaconScanner;
      if (!scanner) return false;
      const c = scanner.getCenter();
      if (c) return this.clickCanvas(c.x, c.y);
      return false;
    }
  }

  // ============================================================
  // 日志系统
  // ============================================================
  class Logger {
    constructor() { this.container = null; }

    init(el) { this.container = el; }

    log(msg, type) {
      type = type || 'info';
      const ts = new Date().toLocaleTimeString();
      const icons = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', fight: '⚔️', move: '🚶', loot: '💰' };
      const text = '[' + ts + '] ' + (icons[type] || '') + ' ' + msg;
      console.log('[Beacon] ' + msg);

      if (this.container) {
        const div = document.createElement('div');
        div.textContent = text;
        const colors = { error: '#f44336', warn: '#ff9800', success: '#4CAF50', info: '#64B5F6', fight: '#EF5350', move: '#66BB6A', loot: '#FFD54F' };
        div.style.color = colors[type] || '#ccc';
        div.style.cssText += 'padding:1px 0;font-size:10px;border-bottom:1px solid rgba(255,255,255,0.03);';
        this.container.insertBefore(div, this.container.firstChild);
        while (this.container.children.length > 200) this.container.removeChild(this.container.lastChild);
      }
    }
  }

  // ============================================================
  // 主自动化引擎
  // ============================================================
  class BeaconAutomation {
    constructor() {
      this.keyboard = new KeyboardController();
      this.scanner = new PixelScanner();
      this.mouse = new MouseController();
      this.logger = new Logger();
      window.__beaconScanner = this.scanner;

      this.isRunning = false;
      this.currentPhase = 'idle';
      this.stats = { dungeons: 0, monsters: 0, buffs: 0, deaths: 0, totalRuns: 0, startTime: null };
      this._stopRequested = false;

      this.createUI();
      this.logger.log('灯塔自动化v5.3已加载' + (isInIframe ? ' [iframe内]' : ''), 'success');
      this.logger.log('页面: ' + currentUrl, 'info');
      this.logger.log('等待游戏Canvas...', 'info');

      this.startCanvasMonitor();
    }

    // Canvas监控
    startCanvasMonitor() {
      this._monitorTimer = setInterval(() => {
        if (!this.isRunning && this.scanner.refresh()) {
          const s = this.scanner.getSize(this.scanner._canvas);
          this.logger.log('Canvas检测到! ' + s.w + 'x' + s.h, 'success');
          clearInterval(this._monitorTimer);
          this.run();
        }
      }, CFG.canvasPollInterval);
    }

    // ============================================================
    // UI面板
    // ============================================================
    createUI() {
      const panel = document.createElement('div');
      panel.id = 'beacon-panel';
      panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
          <b style="font-size:12px;color:#FFD54F;">&#128293; 灯塔自动化 v5.3</b>
          <div style="display:flex;gap:3px;">
            <button id="b-diag" style="background:rgba(33,150,243,0.3);border:1px solid #2196F3;color:#2196F3;cursor:pointer;font-size:9px;padding:1px 5px;border-radius:3px;">诊断</button>
            <button id="b-min" style="background:none;border:none;color:#0f0;cursor:pointer;font-size:14px;">-</button>
          </div>
        </div>
        <div id="b-phase" style="color:#FFD54F;padding:2px 6px;background:rgba(255,213,79,0.1);border-radius:3px;font-size:10px;margin-bottom:3px;">阶段: 等待中</div>
        <div id="b-stats" style="display:flex;gap:5px;font-size:9px;color:#888;flex-wrap:wrap;margin-bottom:3px;">
          <span>副本:<b id="s-dung">0</b></span>
          <span>怪物:<b id="s-mon">0</b></span>
          <span>增益:<b id="s-buf">0</b></span>
          <span>死亡:<b id="s-die">0</b></span>
          <span>轮次:<b id="s-run">0</b></span>
          <span>时间:<b id="s-time">00:00</b></span>
        </div>
        <div id="b-logs" style="max-height:180px;overflow-y:auto;font-size:9px;background:rgba(0,0,0,0.4);padding:3px;border-radius:3px;margin-bottom:4px;"></div>
        <div style="display:flex;gap:4px;">
          <button id="b-start" style="flex:1;padding:6px;background:#4CAF50;color:#fff;border:none;border-radius:3px;cursor:pointer;font-weight:bold;font-size:11px;">▶ 开始</button>
          <button id="b-stop" style="flex:1;padding:6px;background:#f44336;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;">■ 停止</button>
        </div>
      `;

      const style = document.createElement('style');
      style.textContent = `
        #beacon-panel{position:fixed;top:8px;right:8px;width:260px;background:linear-gradient(135deg,rgba(8,8,18,0.97),rgba(15,15,30,0.97));color:#ddd;font-family:'Segoe UI',monospace;font-size:10px;padding:8px;border-radius:6px;z-index:999999;border:1px solid rgba(255,213,79,0.2);box-shadow:0 2px 16px rgba(0,0,0,0.8);user-select:none}
        #beacon-panel button:hover{opacity:0.85}
        #beacon-panel button:active{transform:scale(0.97)}
        #b-logs::-webkit-scrollbar{width:2px}
        #b-logs::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:1px}
      `;
      document.head.appendChild(style);
      document.body.appendChild(panel);
      this.logger.init(document.getElementById('b-logs'));

      document.getElementById('b-start').onclick = () => this.run();
      document.getElementById('b-stop').onclick = () => this.stop();
      document.getElementById('b-diag').onclick = () => this.diagnose();

      let min = false;
      document.getElementById('b-min').onclick = () => {
        min = !min;
        document.getElementById('b-logs').style.display = min ? 'none' : '';
        document.getElementById('b-stats').style.display = min ? 'none' : '';
        document.querySelectorAll('#b-start,#b-stop,#b-diag').forEach(b => b.style.display = min ? 'none' : '');
        document.getElementById('b-min').textContent = min ? '+' : '-';
      };
    }

    setPhase(name, color) {
      this.currentPhase = name;
      const el = document.getElementById('b-phase');
      if (el) { el.textContent = '阶段: ' + name; if (color) el.style.color = color; }
    }

    updateStats() {
      const m = { dung: 's-dung', mon: 's-mon', buf: 's-buf', die: 's-die', run: 's-run' };
      const v = { dung: this.stats.dungeons, mon: this.stats.monsters, buf: this.stats.buffs, die: this.stats.deaths, run: this.stats.totalRuns };
      for (const [k, id] of Object.entries(m)) {
        const el = document.getElementById(id);
        if (el) el.textContent = v[k];
      }
      if (this.stats.startTime) {
        const s = Math.floor((Date.now() - this.stats.startTime) / 1000);
        const el = document.getElementById('s-time');
        if (el) el.textContent = Math.floor(s / 60).toString().padStart(2, '0') + ':' + (s % 60).toString().padStart(2, '0');
      }
    }

    // 诊断
    diagnose() {
      this.logger.log('--- 诊断 ---', 'info');
      const c = this.scanner.findCanvas(true);
      if (c) {
        const s = this.scanner.getSize(c);
        this.logger.log('Canvas: ' + s.w + 'x' + s.h, 'success');
        const ctx = this.scanner.getContext(c);
        if (ctx) {
          const center = this.scanner.sampleArea(Math.floor(s.w / 2), Math.floor(s.h / 2), 20);
          if (center) this.logger.log('中心色: rgb(' + center.r + ',' + center.g + ',' + center.b + ')', 'info');
        } else {
          this.logger.log('无法获取上下文(WebGL?)', 'error');
        }
      } else {
        this.logger.log('未找到Canvas', 'error');
        if (!isInIframe) {
          const iframes = document.querySelectorAll('iframe');
          this.logger.log('iframe数: ' + iframes.length, 'info');
          iframes.forEach((f, i) => {
            this.logger.log('iframe[' + i + ']: ' + (f.src || f.getAttribute('src') || '无src'), 'info');
          });
        }
      }
      this.logger.log('--- 诊断结束 ---', 'info');
    }

    // ============================================================
    // 主循环
    // ============================================================
    async run() {
      if (this.isRunning) return;
      this.isRunning = true;
      this._stopRequested = false;
      this.stats.totalRuns++;
      this.stats.startTime = Date.now();
      this.updateStats();
      this.logger.log('========== 自动化开始 (第' + this.stats.totalRuns + '轮) ==========', 'success');

      if (!this.scanner.refresh()) {
        this.logger.log('等待Canvas...', 'warn');
        this.setPhase('等待游戏', '#ff9800');
        await this.waitForCanvas();
      }

      this.logger.log('Canvas就绪，开始主流程', 'success');

      while (!this._stopRequested) {
        try {
          await this.mainLoop();
        } catch (e) {
          this.logger.log('异常: ' + e.message, 'error');
          await sleep(3000);
        }
      }

      this.logger.log('自动化已停止', 'warn');
      this.isRunning = false;
      this.setPhase('已停止', '#f44336');
    }

    stop() {
      this._stopRequested = true;
      this.isRunning = false;
    }

    async waitForCanvas() {
      while (!this._stopRequested) {
        if (this.scanner.refresh()) {
          this.logger.log('Canvas已就绪', 'success');
          return;
        }
        await sleep(CFG.canvasPollInterval);
      }
    }

    // ============================================================
    // 状态机
    // ============================================================
    async mainLoop() {
      this.scanner.refresh();
      if (!this.scanner._canvas) {
        this.setPhase('等待游戏', '#ff9800');
        await this.waitForCanvas();
        return;
      }

      const scene = this.detectScene();
      switch (scene) {
        case 'login': await this.handleLogin(); break;
        case 'world': await this.handleWorld(); break;
        case 'dungeon_select': await this.handleDungeonSelect(); break;
        case 'dungeon': await this.handleDungeon(); break;
        case 'settlement': await this.handleSettlement(); break;
        default:
          this.logger.log('未知场景，等待...', 'warn');
          await sleep(2000);
      }
    }

    // 场景检测
    detectScene() {
      if (!this.scanner._canvas) return 'unknown';
      const monster = this.scanner.scanMonsters();
      if (monster) return 'dungeon';
      const exit = this.scanner.scanExitDoor();
      if (exit) return 'dungeon';
      const buff = this.scanner.scanBuff();
      if (buff) return 'dungeon';
      return 'world';
    }

    // 登录处理
    async handleLogin() {
      this.setPhase('登录', '#2196F3');
      this.logger.log('登录界面，尝试点击', 'info');
      const buttons = document.querySelectorAll('button, [role="button"], a');
      for (const btn of buttons) {
        const text = (btn.textContent || '').toUpperCase();
        if (text.includes('START') || text.includes('PLAY')) {
          this.logger.log('找到按钮: ' + text, 'success');
          btn.click();
          await sleep(CFG.transitionDelay);
          return;
        }
      }
      await this.mouse.clickCenter();
      await sleep(CFG.transitionDelay);
    }

    // 大世界寻路
    async handleWorld() {
      this.setPhase('大世界寻路', '#66BB6A');
      this.logger.log('开始寻路: D→W→A→W', 'move');

      this.logger.log('D键移动', 'move');
      await this.keyboard.walkSteps('d', 4, 800);
      await sleep(500);

      this.logger.log('W键移动', 'move');
      await this.keyboard.walkSteps('w', 3, 800);
      await sleep(500);

      this.logger.log('A键移动', 'move');
      await this.keyboard.walkSteps('a', 3, 800);
      await sleep(500);

      this.logger.log('W键走向副本', 'move');
      await this.keyboard.walkSteps('w', 5, 800);
      await sleep(1000);

      this.logger.log('按E进入副本', 'success');
      await this.keyboard.interact();
      await sleep(CFG.transitionDelay);
    }

    // 副本选择
    async handleDungeonSelect() {
      this.setPhase('副本选择', '#AB47BC');
      this.logger.log('默认选择确认', 'info');
      await this.keyboard.pressKey('Enter', 300);
      await sleep(CFG.actionDelay);
      await this.mouse.clickCenter();
      await sleep(CFG.transitionDelay);
    }

    // 副本战斗（核心）
    async handleDungeon() {
      this.setPhase('副本战斗', '#EF5350');
      this.stats.dungeons++;
      this.updateStats();
      this.logger.log('--- 进入副本 ---', 'fight');

      let inDungeon = true;
      let buffCollected = false;

      while (inDungeon && !this._stopRequested) {
        this.scanner.refresh();
        if (!this.scanner._canvas) { await sleep(1000); continue; }

        // 1. 怪物
        const monster = this.scanner.scanMonsters();
        if (monster) {
          this.logger.log('发现' + monster.type + '! (' + monster.x + ',' + monster.y + ')', 'fight');
          await this.moveToward(monster.x, monster.y);
          for (let i = 0; i < 5; i++) {
            await this.keyboard.attack();
            await sleep(CFG.fightDelay);
            this.scanner.refresh();
            if (!this.scanner.scanMonsters()) {
              this.logger.log('击杀!', 'success');
              this.stats.monsters++;
              this.updateStats();
              break;
            }
          }
          continue;
        }

        // 2. 增益
        if (!buffCollected) {
          const buff = this.scanner.scanBuff();
          if (buff) {
            this.logger.log('增益! (' + buff.x + ',' + buff.y + ')', 'loot');
            await this.moveToward(buff.x, buff.y);
            await this.keyboard.interact();
            this.stats.buffs++;
            this.updateStats();
            await sleep(CFG.collectDelay);
            buffCollected = true;
            continue;
          }
        }

        // 3. 出口
        const exit = this.scanner.scanExitDoor();
        if (exit) {
          this.logger.log('出口! (' + exit.x + ',' + exit.y + ')', 'success');
          await this.moveToward(exit.x, exit.y);
          await this.keyboard.interact();
          await sleep(CFG.doorOpenDelay);
          buffCollected = false;
          await sleep(CFG.transitionDelay);
          continue;
        }

        // 4. 陷阱
        const traps = this.scanner.scanTraps();
        if (traps.spike || traps.cannon) {
          const trap = traps.spike || traps.cannon;
          this.logger.log('陷阱! 躲避', 'warn');
          await this.dodgeTrap(trap);
          continue;
        }

        // 5. 探索
        this.logger.log('探索...', 'move');
        await this.keyboard.walk('w', 600);
        await sleep(CFG.moveStepDelay);

        this.scanner.refresh();
        if (!this.scanner._canvas) {
          this.logger.log('副本结束', 'info');
          inDungeon = false;
        }
      }
    }

    // 向目标移动
    async moveToward(tx, ty) {
      const c = this.scanner.getCenter();
      if (!c) return;
      const dx = tx - c.x, dy = ty - c.y;
      if (Math.abs(dx) > 30) {
        if (dx > 0) await this.keyboard.walk('d', 400);
        else await this.keyboard.walk('a', 400);
      }
      if (Math.abs(dy) > 30) {
        if (dy > 0) await this.keyboard.walk('s', 400);
        else await this.keyboard.walk('w', 400);
      }
    }

    // 躲避陷阱
    async dodgeTrap(trap) {
      const c = this.scanner.getCenter();
      if (!c) return;
      const dx = trap.x - c.x, dy = trap.y - c.y;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > 0) await this.keyboard.walk('a', 500);
        else await this.keyboard.walk('d', 500);
      } else {
        if (dy > 0) await this.keyboard.walk('w', 500);
        else await this.keyboard.walk('s', 500);
      }
      await sleep(300);
    }

    // 结算
    async handleSettlement() {
      this.setPhase('结算', '#FFD54F');
      this.logger.log('副本结算', 'loot');
      await sleep(CFG.transitionDelay);

      const fragments = this.detectFragments();
      this.logger.log('碎片: ' + fragments, 'info');

      if (fragments >= CFG.fragmentThreshold) {
        this.logger.log('碎片>=1000，前往商城', 'success');
        await this.handleShop();
      } else {
        this.logger.log('碎片不足，继续刷', 'info');
        await this.returnToDungeon();
      }
    }

    detectFragments() {
      const els = document.querySelectorAll('[class*="fragment"],[class*="shard"],[class*="currency"],[class*="token"]');
      for (const el of els) {
        const num = parseInt((el.textContent || '').replace(/[^0-9]/g, ''));
        if (!isNaN(num) && num > 0) return num;
      }
      return 0;
    }

    // 商城购买
    async handleShop() {
      this.setPhase('商城', '#FFD54F');
      this.logger.log('打开商城', 'info');
      await this.keyboard.pressKey('b', 300);
      await sleep(CFG.actionDelay);
      await this.mouse.clickCenter();
      await sleep(CFG.actionDelay);
      await this.keyboard.pressKey('Enter', 300);
      await sleep(CFG.actionDelay);
      this.logger.log('已购买，开背包', 'success');
      await this.handleInventory();
    }

    // 背包开箱
    async handleInventory() {
      this.setPhase('背包', '#FFD54F');
      this.logger.log('打开背包', 'info');
      await this.keyboard.pressKey('i', 300);
      await sleep(CFG.actionDelay);
      await this.mouse.clickCenter();
      await sleep(CFG.actionDelay);
      // 跳过动画
      const size = this.scanner.getSize(this.scanner._canvas);
      if (size.w > 0) await this.mouse.clickCanvas(Math.floor(size.w * 0.9), Math.floor(size.h * 0.05));
      await sleep(CFG.actionDelay);
      this.logger.log('开箱完成', 'success');
      await this.keyboard.pressKey('Escape', 200);
      await sleep(500);
      await this.returnToDungeon();
    }

    // 返回副本
    async returnToDungeon() {
      this.setPhase('返回副本', '#66BB6A');
      this.logger.log('返回副本入口', 'move');
      await this.keyboard.walkSteps('w', 5, 800);
      await sleep(500);
      await this.keyboard.interact();
      await sleep(CFG.transitionDelay);
    }
  }

  // ============================================================
  // 启动
  // ============================================================
  console.log('[Beacon] 灯塔自动化 v5.3.0 已加载');
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new BeaconAutomation());
  } else {
    new BeaconAutomation();
  }
})();
