# -*- coding: utf-8 -*-
"""
Beacon Bot - EXE Build Script
Package Python project into standalone executable using PyInstaller
"""

import subprocess
import sys
import shutil
import os
from pathlib import Path

# Fix encoding for Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

def build():
    """Build EXE"""
    print("=" * 50)
    print("Beacon Bot - EXE Builder")
    print("=" * 50)

    # Check PyInstaller
    try:
        import PyInstaller
        print("[OK] PyInstaller installed")
    except ImportError:
        print("Installing PyInstaller...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)

    # Clean old build dirs
    for d in ['build', 'dist']:
        if Path(d).exists():
            shutil.rmtree(d)
            print(f"[OK] Cleaned {d}/")

    # PyInstaller config
    cmd = [
        'pyinstaller',
        '--name=beacon_bot',
        '--onefile',
        '--windowed',
        '--icon=NONE',
        '--add-data=templates;templates',
        '--hidden-import=playwright',
        '--hidden-import=playwright.sync_api',
        '--hidden-import=cv2',
        '--hidden-import=numpy',
        '--hidden-import=easyocr',
        'beacon_bot.py'
    ]

    print("\nBuilding EXE...")
    print("This may take a few minutes, please wait...")
    print("-" * 50)

    result = subprocess.run(cmd, capture_output=False)

    if result.returncode == 0:
        print("\n" + "=" * 50)
        print("[OK] Build successful!")
        print("=" * 50)
        print(f"\nOutput: dist/beacon_bot.exe")
        print("\nUsage:")
        print("1. Copy dist/ folder to any location")
        print("2. Run beacon_bot.exe")
        print("3. Make sure game is open at world spawn point")
    else:
        print("\n[FAIL] Build failed, check error messages")
        return 1

    return 0

if __name__ == '__main__':
    sys.exit(build())
