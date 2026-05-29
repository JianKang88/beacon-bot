"""
灯塔(The Beacon) 自动化脚本 v1.0
基于 Python + Playwright + OpenCV 模板匹配
完整闭环：大世界寻路 → 副本选择 → 战斗打怪 → 结算 → 碎片检测 → 商城购买 → 循环

使用前：
1. 安装依赖: pip install -r requirements.txt
2. 安装浏览器: playwright install chromium
3. 首次运行会自动校准坐标，请确保游戏已打开在大世界出生点
"""

import time
import cv2
import numpy as np
import os
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, BrowserContext

# ================= 配置区域 =================

# 屏幕分辨率（根据你的显示器设置）
SCREEN_W, SCREEN_H = 1920, 1080

# Playwright 浏览器配置
CHROME_PROFILE = os.path.join(os.environ.get('TEMP', 'C:\\Temp'), 'BeaconBot_ChromeProfile')
GAME_URL = 'https://play.thebeacon.gg/'

# 模板图片目录
TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')

# 模板匹配阈值（0-1，越高越严格）
MATCH_THRESHOLD = 0.7

# 时间配置（秒）
KEY_HOLD = 0.3
MOVE_DELAY = 0.5
ACTION_DELAY = 1.0
FIGHT_DELAY = 0.4
TRANSITION_WAIT = 3.0
SETTLEMENT_WAIT = 5.0

# 大世界寻路参数（按住方向键的持续时间，秒）
WORLD_PATH = [
    ('d', 1.5),   # 步骤1: D键走到建筑位置
    ('w', 2.0),   # 步骤2: W键走到告示牌位置
    ('a', 1.0),   # 步骤3: A键走到侧面位置
    ('w', 3.0),   # 步骤4: W键走向副本入口
]

# 碎片阈值
FRAGMENT_THRESHOLD = 1000

# ================= 模板管理器 =================

class TemplateManager:
    """管理所有模板图片，支持热加载"""

    def __init__(self, template_dir):
        self.template_dir = Path(template_dir)
        self.templates = {}
        self._load_templates()

    def _load_templates(self):
        """加载模板目录中的所有图片"""
        if not self.template_dir.exists():
            print(f"[警告] 模板目录不存在: {self.template_dir}")
            return

        for f in self.template_dir.glob('*.png'):
            name = f.stem
            img = cv2.imread(str(f), cv2.IMREAD_COLOR)
            if img is not None:
                self.templates[name] = img
                h, w = img.shape[:2]
                print(f"  模板加载: {name} ({w}x{h})")

    def get(self, name):
        return self.templates.get(name)

    def match(self, screenshot, template_name, threshold=None, region=None):
        """
        在截图中匹配模板
        返回: (匹配成功, 中心坐标x, 中心坐标y, 置信度) 或 (False, 0, 0, 0)
        """
        tpl = self.get(template_name)
        if tpl is None:
            return False, 0, 0, 0

        threshold = threshold or MATCH_THRESHOLD

        # 裁剪搜索区域
        if region:
            x1, y1, x2, y2 = region
            search_area = screenshot[y1:y2, x1:x2]
            offset_x, offset_y = x1, y1
        else:
            search_area = screenshot
            offset_x, offset_y = 0, 0

        # 模板匹配
        result = cv2.matchTemplate(search_area, tpl, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

        if max_val >= threshold:
            h, w = tpl.shape[:2]
            cx = max_loc[0] + w // 2 + offset_x
            cy = max_loc[1] + h // 2 + offset_y
            return True, cx, cy, max_val

        return False, 0, 0, max_val


# ================= 视觉检测器 =================

class VisionDetector:
    """基于OpenCV模板匹配的视觉检测"""

    def __init__(self, tpl_manager):
        self.tm = tpl_manager

    def capture(self, page):
        """截取当前页面"""
        bytes_data = page.screenshot()
        arr = np.frombuffer(bytes_data, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

    def find_any_monster(self, screenshot):
        """检测任意怪物（遍历所有怪物模板）"""
        monster_templates = ['image17', 'image18', 'image19', 'image20', 'image21']
        best_match = None
        best_score = 0

        for name in monster_templates:
            found, x, y, score = self.tm.match(screenshot, name, threshold=0.6)
            if found and score > best_score:
                best_match = (name, x, y, score)
                best_score = score

        return best_match

    def find_exit_door(self, screenshot):
        """检测发光出口大门（通过颜色特征）"""
        # 转HSV，检测发光效果（高亮度、高饱和度）
        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)

        # 发光效果通常是高亮度高饱和度
        mask_bright = cv2.inRange(hsv, np.array([0, 100, 200]), np.array([180, 255, 255]))

        # 查找亮色区域的轮廓
        contours, _ = cv2.findContours(mask_bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 5000:  # 过滤小光点
                x, y, w, h = cv2.boundingRect(cnt)
                # 出口大门通常是较大的垂直矩形
                if h > w * 0.5 and h > 100:
                    cx = x + w // 2
                    cy = y + h // 2
                    return True, cx, cy

        return False, 0, 0

    def find_buffs(self, screenshot):
        """检测增益物品（紫色/粉色发光球）"""
        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)

        # 紫色/粉色范围
        mask = cv2.inRange(hsv, np.array([130, 80, 150]), np.array([180, 255, 255]))

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        buffs = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if 200 < area < 5000:
                x, y, w, h = cv2.boundingRect(cnt)
                cx = x + w // 2
                cy = y + h // 2
                buffs.append((cx, cy, area))

        # 按面积排序，返回最大的几个
        buffs.sort(key=lambda b: b[2], reverse=True)
        return buffs[:3] if buffs else []

    def find_traps(self, screenshot):
        """检测陷阱（地刺=灰色矩形，炮弹=紫色圆形）"""
        traps = {'spikes': [], 'cannonballs': []}

        # 地刺：灰色金属色
        gray = cv2.cvtColor(screenshot, cv2.COLOR_BGR2GRAY)
        _, mask_gray = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        contours_gray, _ = cv2.findContours(mask_gray, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours_gray:
            area = cv2.contourArea(cnt)
            if 500 < area < 3000:
                x, y, w, h = cv2.boundingRect(cnt)
                if w > h * 2 or h > w * 2:  # 矩形特征
                    traps['spikes'].append((x + w // 2, y + h // 2))

        # 炮弹：紫色
        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
        mask_purple = cv2.inRange(hsv, np.array([120, 80, 80]), np.array([160, 255, 255]))
        contours_purple, _ = cv2.findContours(mask_purple, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours_purple:
            area = cv2.contourArea(cnt)
            if 100 < area < 2000:
                x, y, w, h = cv2.boundingRect(cnt)
                ratio = w / max(h, 1)
                if 0.7 < ratio < 1.3:  # 近似圆形
                    traps['cannonballs'].append((x + w // 2, y + h // 2))

        return traps

    def is_settlement_screen(self, screenshot):
        """检测是否在结算界面（通过画面特征判断）"""
        # 结算界面特征：画面较暗，有特定UI元素
        gray = cv2.cvtColor(screenshot, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray)

        # 如果画面很暗，可能是加载或结算
        if mean_brightness < 40:
            return True

        # 检测是否有"结算"相关的UI文字区域（简化版：检测大面积白色UI区域）
        # 这里用亮度阈值判断是否有结算弹窗
        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
        # 检测屏幕中央是否有亮色UI弹窗
        h, w = screenshot.shape[:2]
        center_region = screenshot[h//4:3*h//4, w//4:3*w//4]
        center_gray = cv2.cvtColor(center_region, cv2.COLOR_BGR2GRAY)
        bright_pixels = np.sum(center_gray > 200) / center_gray.size

        if bright_pixels > 0.3 and mean_brightness < 80:
            return True

        return False

    def detect_fragments(self, screenshot):
        """检测碎片数量（从右上角区域OCR）"""
        # 截取右上角碎片区域
        h, w = screenshot.shape[:2]
        shard_region = screenshot[30:100, w - 250:w - 30]

        # 简单OCR：提取白色/亮色文字
        gray = cv2.cvtColor(shard_region, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)

        # 查找数字轮廓
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        digits = []
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            if 5 < ch < 30 and 3 < cw < 20:
                digits.append((x, y, cw, ch))

        if not digits:
            return 0

        # 按x坐标排序（从左到右）
        digits.sort(key=lambda d: d[0])

        # 简单数字识别（基于轮廓面积比）
        try:
            import easyocr
            reader = easyocr.Reader(['en'], gpu=False)
            result = reader.readtext(shard_region, detail=0)
            if result:
                text = ''.join(filter(str.isdigit, str(result[0])))
                return int(text) if text.isdigit() else 0
        except:
            pass

        return 0


# ================= 动作控制器 =================

class ActionController:
    """控制角色移动和交互"""

    def __init__(self, page: Page):
        self.page = page
        self.center_x = SCREEN_W // 2
        self.center_y = SCREEN_H // 2

    def hold_key(self, key, duration):
        """长按方向键移动"""
        self.page.keyboard.down(key)
        time.sleep(duration)
        self.page.keyboard.up(key)
        time.sleep(MOVE_DELAY)

    def press_key(self, key):
        """按一下键"""
        self.page.keyboard.press(key)
        time.sleep(ACTION_DELAY)

    def click(self, x, y):
        """点击屏幕坐标"""
        self.page.mouse.click(x, y)
        time.sleep(ACTION_DELAY)

    def click_center(self):
        """点击屏幕中心"""
        self.click(self.center_x, self.center_y)

    def move_toward(self, target_x, target_y):
        """向目标方向移动"""
        dx = target_x - self.center_x
        dy = target_y - self.center_y

        # 根据目标相对位置决定方向
        if abs(dx) > 50:
            key = 'd' if dx > 0 else 'a'
            duration = min(abs(dx) / 300, 1.5)
            self.hold_key(key, duration)

        if abs(dy) > 50:
            key = 's' if dy > 0 else 'w'
            duration = min(abs(dy) / 300, 1.5)
            self.hold_key(key, duration)

    def dodge_away(self, threat_x, threat_y):
        """远离威胁"""
        dx = threat_x - self.center_x
        dy = threat_y - self.center_y

        if abs(dx) > abs(dy):
            key = 'a' if dx > 0 else 'd'
        else:
            key = 'w' if dy > 0 else 's'

        self.hold_key(key, 0.5)

    def attack_target(self, target_x, target_y):
        """攻击目标：先靠近再攻击"""
        self.move_toward(target_x, target_y)
        time.sleep(0.3)
        # 点击目标位置攻击
        self.click(target_x, target_y)
        time.sleep(FIGHT_DELAY)


# ================= 自动化引擎（状态机） =================

class BeaconBot:
    """灯塔自动化主引擎"""

    def __init__(self):
        self.tm = TemplateManager(TEMPLATE_DIR)
        self.vision = VisionDetector(self.tm)
        self.action = None  # 延迟初始化，需要page
        self.stats = {
            'dungeons': 0,
            'monsters': 0,
            'buffs': 0,
            'deaths': 0,
            'shops': 0,
            'start_time': time.time()
        }

    def print_stats(self):
        elapsed = time.time() - self.stats['start_time']
        mins = int(elapsed // 60)
        secs = int(elapsed % 60)
        print(f"\n{'='*50}")
        print(f"运行时间: {mins}分{secs}秒")
        print(f"副本数: {self.stats['dungeons']} | 怪物击杀: {self.stats['monsters']} | 增益拾取: {self.stats['buffs']}")
        print(f"死亡次数: {self.stats['deaths']} | 商城购买: {self.stats['shops']}")
        print(f"{'='*50}\n")

    # ============================================================
    # 阶段1: 大世界寻路
    # ============================================================
    def run_world_path(self):
        """大世界固定路线寻路: D→W→A→W→副本入口"""
        print("\n[大世界] 开始寻路...")

        for direction, duration in WORLD_PATH:
            print(f"  按住 {direction.upper()} 键 {duration}秒")
            self.action.hold_key(direction, duration)

        # 到达副本入口，按F/E交互
        print("  到达副本入口，按E交互")
        self.action.press_key('f')
        time.sleep(TRANSITION_WAIT)

    # ============================================================
    # 阶段2: 副本选择
    # ============================================================
    def select_dungeon(self):
        """副本选择：默认选项直接确认"""
        print("\n[副本选择] 默认选项确认")

        # 截图确认是否在副本选择界面
        screenshot = self.vision.capture(self.action.page)

        # 尝试匹配Start按钮
        found, x, y, score = self.tm.match(screenshot, 'image22', threshold=0.5)
        if found:
            print(f"  找到Start按钮 ({x},{y}), 点击")
            self.action.click(x, y)
        else:
            # 备选：点击屏幕中下方（通常是确认按钮位置）
            print("  未找到Start按钮，点击默认位置")
            self.action.click(SCREEN_W // 2, SCREEN_H * 3 // 4)

        time.sleep(TRANSITION_WAIT)

    # ============================================================
    # 阶段3: 副本战斗（核心）
    # ============================================================
    def run_dungeon(self):
        """副本内完整流程：战斗→拾取→开门→通关"""
        print("\n[副本] 进入副本，开始战斗循环")
        self.stats['dungeons'] += 1

        # 出生后先向上移动
        self.action.hold_key('w', 1.5)

        max_iterations = 200  # 防止无限循环
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            screenshot = self.vision.capture(self.action.page)

            # --- 检测结算界面 ---
            if self.vision.is_settlement_screen(screenshot):
                print("  检测到结算界面，副本结束")
                time.sleep(SETTLEMENT_WAIT)
                break

            # --- 优先级1: 检测怪物 → 攻击 ---
            monster = self.vision.find_any_monster(screenshot)
            if monster:
                name, mx, my, score = monster
                print(f"  发现怪物 {name} ({mx},{my}) 置信度={score:.2f}")
                self.action.attack_target(mx, my)
                self.stats['monsters'] += 1
                self.print_stats()
                continue

            # --- 优先级2: 检测增益 → 拾取 ---
            buffs = self.vision.find_buffs(screenshot)
            if buffs:
                bx, by, _ = buffs[0]
                print(f"  发现增益 ({bx},{by})")
                self.action.move_toward(bx, by)
                time.sleep(0.5)
                self.action.click(bx, by)
                self.stats['buffs'] += 1
                time.sleep(COLLECT_DELAY := 1.0)
                continue

            # --- 优先级3: 检测出口大门 → 进入 ---
            found_exit, ex, ey = self.vision.find_exit_door(screenshot)
            if found_exit:
                print(f"  发现出口大门 ({ex},{ey})")
                self.action.move_toward(ex, ey)
                time.sleep(0.5)
                self.action.press_key('f')
                time.sleep(DOOR_WAIT := 2.0)
                print("  通过出口，进入下一区域")
                continue

            # --- 优先级4: 检测陷阱 → 躲避 ---
            traps = self.vision.find_traps(screenshot)
            if traps['spikes']:
                sx, sy = traps['spikes'][0]
                print(f"  发现地刺陷阱 ({sx},{sy})，躲避")
                self.action.dodge_away(sx, sy)
                continue
            if traps['cannonballs']:
                cx, cy = traps['cannonballs'][0]
                print(f"  发现炮弹 ({cx},{cy})，躲避")
                self.action.dodge_away(cx, cy)
                continue

            # --- 无目标: 向前探索 ---
            self.action.hold_key('w', 0.5)
            time.sleep(0.3)

        print(f"  副本结束 (迭代{iteration}次)")

    # ============================================================
    # 阶段4: 结算与碎片检测
    # ============================================================
    def handle_settlement(self):
        """结算后检测碎片，决定是否购买"""
        print("\n[结算] 检测碎片数量")

        time.sleep(2)  # 等待结算UI稳定
        screenshot = self.vision.capture(self.action.page)
        fragments = self.vision.detect_fragments(screenshot)

        print(f"  当前碎片: {fragments}")

        if fragments >= FRAGMENT_THRESHOLD:
            print(f"  碎片 >= {FRAGMENT_THRESHOLD}! 前往商城购买")
            self.handle_shop()
        else:
            print(f"  碎片不足，继续刷副本")

    # ============================================================
    # 阶段5: 商城购买
    # ============================================================
    def handle_shop(self):
        """商城购买宝箱 → 背包开启 → 跳过动画"""
        print("\n[商城] 开始购买流程")
        self.stats['shops'] += 1

        # 打开商城（按B键或点击商城图标）
        # 商城图标通常在屏幕右侧
        self.action.click(SCREEN_W - 120, SCREEN_H - 100)
        time.sleep(ACTION_DELAY)

        # 购买1000碎片宝箱（点击宝箱位置）
        self.action.click(SCREEN_W // 2, SCREEN_H // 2)
        time.sleep(ACTION_DELAY)

        # 确认购买
        self.action.click(SCREEN_W // 2, SCREEN_H // 2 + 50)
        time.sleep(ACTION_DELAY)

        # 关闭商城
        self.action.press_key('Escape')
        time.sleep(ACTION_DELAY)

        # 打开背包
        self.action.click(SCREEN_W - 120, SCREEN_H - 160)
        time.sleep(ACTION_DELAY)

        # 使用宝箱（点击背包中的宝箱）
        self.action.click(SCREEN_W // 2, SCREEN_H // 2)
        time.sleep(ACTION_DELAY)

        # 跳过动画（右上角跳过按钮）
        self.action.click(SCREEN_W - 100, 50)
        time.sleep(ACTION_DELAY)

        # 关闭背包
        self.action.press_key('Escape')
        time.sleep(ACTION_DELAY)

        print("  购买和开箱完成")

    # ============================================================
    # 主循环
    # ============================================================
    def run(self):
        """主循环：完整闭环"""
        print("\n" + "=" * 50)
        print("  灯塔自动化 v1.0 启动")
        print("  请确保游戏已在大世界出生点")
        print("=" * 50)

        with sync_playwright() as p:
            # 启动浏览器（保留OKX钱包登录状态）
            print("\n[启动] 启动浏览器...")
            browser = p.chromium.launch_persistent_context(
                user_data_dir=CHROME_PROFILE,
                headless=False,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=' + str(SCREEN_W) + ',' + str(SCREEN_H),
                ]
            )

            # 获取或创建页面
            pages = browser.pages
            if pages:
                page = pages[0]
            else:
                page = browser.new_page()

            # 如果不在游戏页面，导航过去
            if 'thebeacon.gg' not in page.url:
                print(f"[启动] 导航到游戏页面...")
                page.goto(GAME_URL, wait_until='domcontentloaded')
                print("[启动] 等待5秒让游戏加载...")
                time.sleep(5)

            # 初始化动作控制器
            self.action = ActionController(page)

            print("[启动] 准备就绪，5秒后开始自动化...")
            time.sleep(5)

            try:
                loop_count = 0
                while True:
                    loop_count += 1
                    print(f"\n{'#'*50}")
                    print(f"  第 {loop_count} 轮循环")
                    print(f"{'#'*50}")

                    # 1. 大世界寻路 → 副本入口
                    self.run_world_path()

                    # 2. 副本选择
                    self.select_dungeon()

                    # 3. 副本战斗
                    self.run_dungeon()

                    # 4. 结算与碎片检测
                    self.handle_settlement()

                    # 打印统计
                    self.print_stats()

            except KeyboardInterrupt:
                print("\n[停止] 用户中断")
                self.print_stats()
            finally:
                browser.close()


# ================= 入口 =================

if __name__ == '__main__':
    print("灯塔自动化 v1.0")
    print("=" * 50)

    # 检查模板目录
    if not os.path.exists(TEMPLATE_DIR):
        print(f"[错误] 模板目录不存在: {TEMPLATE_DIR}")
        print("请创建 templates/ 目录并放入怪物截图")
        print("或运行 extract_templates.py 从需求文档提取")
        exit(1)

    bot = BeaconBot()
    bot.run()
