# -*- coding: utf-8 -*-
"""
Beacon (The Beacon) Automation Script v1.0
Python + Playwright + OpenCV Template Matching
Full loop: World Path -> Dungeon Select -> Combat -> Settlement -> Fragment -> Shop -> Loop
"""

import time
import cv2
import numpy as np
import os
import sys
import io
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, BrowserContext

# Fix encoding for Windows
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ================= Config =================

SCREEN_W, SCREEN_H = 1920, 1080

CHROME_PROFILE = os.path.join(os.environ.get('TEMP', 'C:\\Temp'), 'BeaconBot_ChromeProfile')
GAME_URL = 'https://play.thebeacon.gg/'

TEMPLATE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'templates')

MATCH_THRESHOLD = 0.7

KEY_HOLD = 0.3
MOVE_DELAY = 0.5
ACTION_DELAY = 1.0
FIGHT_DELAY = 0.4
TRANSITION_WAIT = 3.0
SETTLEMENT_WAIT = 5.0

WORLD_PATH = [
    ('d', 1.5),
    ('w', 2.0),
    ('a', 1.0),
    ('w', 3.0),
]

FRAGMENT_THRESHOLD = 1000

# ================= Template Manager =================

class TemplateManager:
    """Manage all template images"""

    def __init__(self, template_dir):
        self.template_dir = Path(template_dir)
        self.templates = {}
        self._load_templates()

    def _load_templates(self):
        if not self.template_dir.exists():
            print(f"[WARN] Template dir not found: {self.template_dir}")
            return

        for f in self.template_dir.glob('*.png'):
            name = f.stem
            img = cv2.imread(str(f), cv2.IMREAD_COLOR)
            if img is not None:
                self.templates[name] = img
                h, w = img.shape[:2]
                print(f"  Template loaded: {name} ({w}x{h})")

    def get(self, name):
        return self.templates.get(name)

    def match(self, screenshot, template_name, threshold=None, region=None):
        tpl = self.get(template_name)
        if tpl is None:
            return False, 0, 0, 0

        threshold = threshold or MATCH_THRESHOLD

        if region:
            x1, y1, x2, y2 = region
            search_area = screenshot[y1:y2, x1:x2]
            offset_x, offset_y = x1, y1
        else:
            search_area = screenshot
            offset_x, offset_y = 0, 0

        result = cv2.matchTemplate(search_area, tpl, cv2.TM_CCOEFF_NORMED)
        min_val, max_val, min_loc, max_loc = cv2.minMaxLoc(result)

        if max_val >= threshold:
            h, w = tpl.shape[:2]
            cx = max_loc[0] + w // 2 + offset_x
            cy = max_loc[1] + h // 2 + offset_y
            return True, cx, cy, max_val

        return False, 0, 0, max_val


# ================= Vision Detector =================

class VisionDetector:
    """OpenCV template matching based vision detection"""

    def __init__(self, tpl_manager):
        self.tm = tpl_manager

    def capture(self, page):
        bytes_data = page.screenshot()
        arr = np.frombuffer(bytes_data, np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)

    def find_any_monster(self, screenshot):
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
        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
        mask_bright = cv2.inRange(hsv, np.array([0, 100, 200]), np.array([180, 255, 255]))
        contours, _ = cv2.findContours(mask_bright, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area > 5000:
                x, y, w, h = cv2.boundingRect(cnt)
                if h > w * 0.5 and h > 100:
                    cx = x + w // 2
                    cy = y + h // 2
                    return True, cx, cy

        return False, 0, 0

    def find_buffs(self, screenshot):
        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
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

        buffs.sort(key=lambda b: b[2], reverse=True)
        return buffs[:3] if buffs else []

    def find_traps(self, screenshot):
        traps = {'spikes': [], 'cannonballs': []}

        gray = cv2.cvtColor(screenshot, cv2.COLOR_BGR2GRAY)
        _, mask_gray = cv2.threshold(gray, 150, 255, cv2.THRESH_BINARY)
        contours_gray, _ = cv2.findContours(mask_gray, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours_gray:
            area = cv2.contourArea(cnt)
            if 500 < area < 3000:
                x, y, w, h = cv2.boundingRect(cnt)
                if w > h * 2 or h > w * 2:
                    traps['spikes'].append((x + w // 2, y + h // 2))

        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
        mask_purple = cv2.inRange(hsv, np.array([120, 80, 80]), np.array([160, 255, 255]))
        contours_purple, _ = cv2.findContours(mask_purple, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for cnt in contours_purple:
            area = cv2.contourArea(cnt)
            if 100 < area < 2000:
                x, y, w, h = cv2.boundingRect(cnt)
                ratio = w / max(h, 1)
                if 0.7 < ratio < 1.3:
                    traps['cannonballs'].append((x + w // 2, y + h // 2))

        return traps

    def is_settlement_screen(self, screenshot):
        gray = cv2.cvtColor(screenshot, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray)

        if mean_brightness < 40:
            return True

        hsv = cv2.cvtColor(screenshot, cv2.COLOR_BGR2HSV)
        h, w = screenshot.shape[:2]
        center_region = screenshot[h//4:3*h//4, w//4:3*w//4]
        center_gray = cv2.cvtColor(center_region, cv2.COLOR_BGR2GRAY)
        bright_pixels = np.sum(center_gray > 200) / center_gray.size

        if bright_pixels > 0.3 and mean_brightness < 80:
            return True

        return False

    def detect_fragments(self, screenshot):
        h, w = screenshot.shape[:2]
        shard_region = screenshot[30:100, w - 250:w - 30]

        gray = cv2.cvtColor(shard_region, cv2.COLOR_BGR2GRAY)
        _, binary = cv2.threshold(gray, 200, 255, cv2.THRESH_BINARY)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        digits = []
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            if 5 < ch < 30 and 3 < cw < 20:
                digits.append((x, y, cw, ch))

        if not digits:
            return 0

        digits.sort(key=lambda d: d[0])

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


# ================= Action Controller =================

class ActionController:
    """Control character movement and interaction"""

    def __init__(self, page: Page):
        self.page = page
        self.center_x = SCREEN_W // 2
        self.center_y = SCREEN_H // 2

    def hold_key(self, key, duration):
        self.page.keyboard.down(key)
        time.sleep(duration)
        self.page.keyboard.up(key)
        time.sleep(MOVE_DELAY)

    def press_key(self, key):
        self.page.keyboard.press(key)
        time.sleep(ACTION_DELAY)

    def click(self, x, y):
        self.page.mouse.click(x, y)
        time.sleep(ACTION_DELAY)

    def click_center(self):
        self.click(self.center_x, self.center_y)

    def move_toward(self, target_x, target_y):
        dx = target_x - self.center_x
        dy = target_y - self.center_y

        if abs(dx) > 50:
            key = 'd' if dx > 0 else 'a'
            duration = min(abs(dx) / 300, 1.5)
            self.hold_key(key, duration)

        if abs(dy) > 50:
            key = 's' if dy > 0 else 'w'
            duration = min(abs(dy) / 300, 1.5)
            self.hold_key(key, duration)

    def dodge_away(self, threat_x, threat_y):
        dx = threat_x - self.center_x
        dy = threat_y - self.center_y

        if abs(dx) > abs(dy):
            key = 'a' if dx > 0 else 'd'
        else:
            key = 'w' if dy > 0 else 's'

        self.hold_key(key, 0.5)

    def attack_target(self, target_x, target_y):
        self.move_toward(target_x, target_y)
        time.sleep(0.3)
        self.click(target_x, target_y)
        time.sleep(FIGHT_DELAY)


# ================= Bot Engine (State Machine) =================

class BeaconBot:
    """Beacon Automation Engine"""

    def __init__(self):
        self.tm = TemplateManager(TEMPLATE_DIR)
        self.vision = VisionDetector(self.tm)
        self.action = None
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
        print(f"Runtime: {mins}m {secs}s")
        print(f"Dungeons: {self.stats['dungeons']} | Kills: {self.stats['monsters']} | Buffs: {self.stats['buffs']}")
        print(f"Deaths: {self.stats['deaths']} | Shops: {self.stats['shops']}")
        print(f"{'='*50}\n")

    # Phase 1: World Path
    def run_world_path(self):
        print("\n[World] Starting pathfinding...")

        for direction, duration in WORLD_PATH:
            print(f"  Hold {direction.upper()} for {duration}s")
            self.action.hold_key(direction, duration)

        print("  Arrived at dungeon entrance, press E to interact")
        self.action.press_key('f')
        time.sleep(TRANSITION_WAIT)

    # Phase 2: Dungeon Select
    def select_dungeon(self):
        print("\n[Dungeon] Selecting dungeon...")

        screenshot = self.vision.capture(self.action.page)

        found, x, y, score = self.tm.match(screenshot, 'image22', threshold=0.5)
        if found:
            print(f"  Found Start button ({x},{y}), clicking")
            self.action.click(x, y)
        else:
            print("  Start button not found, clicking default position")
            self.action.click(SCREEN_W // 2, SCREEN_H * 3 // 4)

        time.sleep(TRANSITION_WAIT)

    # Phase 3: Dungeon Combat (Core)
    def run_dungeon(self):
        print("\n[Dungeon] Entering dungeon, starting combat loop")
        self.stats['dungeons'] += 1

        self.action.hold_key('w', 1.5)

        max_iterations = 200
        iteration = 0

        while iteration < max_iterations:
            iteration += 1
            screenshot = self.vision.capture(self.action.page)

            # Check settlement screen
            if self.vision.is_settlement_screen(screenshot):
                print("  Settlement screen detected, dungeon complete")
                time.sleep(SETTLEMENT_WAIT)
                break

            # Priority 1: Detect monster -> Attack
            monster = self.vision.find_any_monster(screenshot)
            if monster:
                name, mx, my, score = monster
                print(f"  Monster found: {name} ({mx},{my}) conf={score:.2f}")
                self.action.attack_target(mx, my)
                self.stats['monsters'] += 1
                self.print_stats()
                continue

            # Priority 2: Detect buff -> Collect
            buffs = self.vision.find_buffs(screenshot)
            if buffs:
                bx, by, _ = buffs[0]
                print(f"  Buff found ({bx},{by})")
                self.action.move_toward(bx, by)
                time.sleep(0.5)
                self.action.click(bx, by)
                self.stats['buffs'] += 1
                time.sleep(1.0)
                continue

            # Priority 3: Detect exit door -> Enter
            found_exit, ex, ey = self.vision.find_exit_door(screenshot)
            if found_exit:
                print(f"  Exit door found ({ex},{ey})")
                self.action.move_toward(ex, ey)
                time.sleep(0.5)
                self.action.press_key('f')
                time.sleep(2.0)
                print("  Passed through exit, entering next area")
                continue

            # Priority 4: Detect traps -> Dodge
            traps = self.vision.find_traps(screenshot)
            if traps['spikes']:
                sx, sy = traps['spikes'][0]
                print(f"  Spike trap detected ({sx},{sy}), dodging")
                self.action.dodge_away(sx, sy)
                continue
            if traps['cannonballs']:
                cx, cy = traps['cannonballs'][0]
                print(f"  Cannonball detected ({cx},{cy}), dodging")
                self.action.dodge_away(cx, cy)
                continue

            # No target: explore forward
            self.action.hold_key('w', 0.5)
            time.sleep(0.3)

        print(f"  Dungeon ended (iteration {iteration})")

    # Phase 4: Settlement & Fragment Detection
    def handle_settlement(self):
        print("\n[Settlement] Checking fragments...")

        time.sleep(2)
        screenshot = self.vision.capture(self.action.page)
        fragments = self.vision.detect_fragments(screenshot)

        print(f"  Current fragments: {fragments}")

        if fragments >= FRAGMENT_THRESHOLD:
            print(f"  Fragments >= {FRAGMENT_THRESHOLD}! Going to shop")
            self.handle_shop()
        else:
            print(f"  Not enough fragments, continue farming")

    # Phase 5: Shop Purchase
    def handle_shop(self):
        print("\n[Shop] Starting purchase flow")
        self.stats['shops'] += 1

        self.action.click(SCREEN_W - 120, SCREEN_H - 100)
        time.sleep(ACTION_DELAY)

        self.action.click(SCREEN_W // 2, SCREEN_H // 2)
        time.sleep(ACTION_DELAY)

        self.action.click(SCREEN_W // 2, SCREEN_H // 2 + 50)
        time.sleep(ACTION_DELAY)

        self.action.press_key('Escape')
        time.sleep(ACTION_DELAY)

        self.action.click(SCREEN_W - 120, SCREEN_H - 160)
        time.sleep(ACTION_DELAY)

        self.action.click(SCREEN_W // 2, SCREEN_H // 2)
        time.sleep(ACTION_DELAY)

        self.action.click(SCREEN_W - 100, 50)
        time.sleep(ACTION_DELAY)

        self.action.press_key('Escape')
        time.sleep(ACTION_DELAY)

        print("  Purchase and unboxing complete")

    # Main Loop
    def run(self):
        print("\n" + "=" * 50)
        print("  Beacon Bot v1.0 Starting")
        print("  Make sure game is at world spawn point")
        print("=" * 50)

        with sync_playwright() as p:
            print("\n[Init] Launching browser...")
            browser = p.chromium.launch_persistent_context(
                user_data_dir=CHROME_PROFILE,
                headless=False,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--window-size=' + str(SCREEN_W) + ',' + str(SCREEN_H),
                ]
            )

            pages = browser.pages
            if pages:
                page = pages[0]
            else:
                page = browser.new_page()

            if 'thebeacon.gg' not in page.url:
                print("[Init] Navigating to game page...")
                page.goto(GAME_URL, wait_until='domcontentloaded')
                print("[Init] Waiting 5s for game to load...")
                time.sleep(5)

            self.action = ActionController(page)

            print("[Init] Ready, starting automation in 5s...")
            time.sleep(5)

            try:
                loop_count = 0
                while True:
                    loop_count += 1
                    print(f"\n{'#'*50}")
                    print(f"  Loop #{loop_count}")
                    print(f"{'#'*50}")

                    self.run_world_path()
                    self.select_dungeon()
                    self.run_dungeon()
                    self.handle_settlement()
                    self.print_stats()

            except KeyboardInterrupt:
                print("\n[Stop] User interrupted")
                self.print_stats()
            finally:
                browser.close()


# ================= Entry Point =================

if __name__ == '__main__':
    print("Beacon Bot v1.0")
    print("=" * 50)

    if not os.path.exists(TEMPLATE_DIR):
        print(f"[ERROR] Template dir not found: {TEMPLATE_DIR}")
        print("Please create templates/ directory with monster screenshots")
        print("Or run extract_templates.py to extract from requirements doc")
        exit(1)

    bot = BeaconBot()
    bot.run()
