"""
打包脚本：将Python项目打包成独立的exe可执行文件
使用PyInstaller一键生成，无需用户安装Python
"""

import subprocess
import sys
import shutil
from pathlib import Path

def build():
    """打包exe"""
    print("=" * 50)
    print("灯塔自动化 - EXE打包工具")
    print("=" * 50)
    
    # 检查PyInstaller
    try:
        import PyInstaller
        print("✓ PyInstaller已安装")
    except ImportError:
        print("正在安装PyInstaller...")
        subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"], check=True)
    
    # 清理旧的build目录
    for d in ['build', 'dist']:
        if Path(d).exists():
            shutil.rmtree(d)
            print(f"✓ 清理 {d}/")
    
    # PyInstaller配置
    cmd = [
        'pyinstaller',
        '--name=灯塔自动化',
        '--onefile',  # 打包成单个exe
        '--windowed',  # 不显示控制台窗口
        '--icon=NONE',
        '--add-data=templates;templates',  # 包含模板图片
        '--hidden-import=playwright',
        '--hidden-import=playwright.sync_api',
        '--hidden-import=cv2',
        '--hidden-import=numpy',
        '--hidden-import=easyocr',
        'beacon_bot.py'
    ]
    
    print("\n开始打包...")
    print("这可能需要几分钟，请耐心等待...")
    print("-" * 50)
    
    result = subprocess.run(cmd, capture_output=False)
    
    if result.returncode == 0:
        print("\n" + "=" * 50)
        print("✓ 打包成功！")
        print("=" * 50)
        print(f"\n可执行文件位置: dist/灯塔自动化.exe")
        print("\n使用方式:")
        print("1. 将整个dist文件夹复制到任意位置")
        print("2. 双击'灯塔自动化.exe'运行")
        print("3. 确保游戏已打开在大世界出生点")
    else:
        print("\n✗ 打包失败，请检查错误信息")
        return 1
    
    return 0

if __name__ == '__main__':
    sys.exit(build())
