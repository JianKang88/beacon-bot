"""
从需求文档中提取怪物/UI截图作为模板图片
运行: python extract_templates.py <需求文档.docx路径>
"""

import zipfile
import shutil
import sys
from pathlib import Path


def extract_images_from_docx(docx_path, output_dir):
    """从docx文件中提取所有图片"""
    docx_path = Path(docx_path)
    output_dir = Path(output_dir)

    if not docx_path.exists():
        print(f"文件不存在: {docx_path}")
        return

    output_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(docx_path, 'r') as z:
        media_files = [f for f in z.namelist() if f.startswith('word/media/')]

        if not media_files:
            print("文档中没有图片")
            return

        for f in media_files:
            data = z.read(f)
            filename = Path(f).name
            dest = output_dir / filename
            with open(dest, 'wb') as out:
                out.write(data)
            print(f"  提取: {filename} ({len(data)} bytes)")

    print(f"\n共提取 {len(media_files)} 个图片到 {output_dir}")


def rename_templates(template_dir):
    """根据需求文档的顺序重命名模板图片"""
    template_dir = Path(template_dir)

    # 需求文档中的图片顺序（根据pandoc提取的文本推断）:
    # image1-5: 登录/加载界面截图
    # image6-7: 大世界路径截图
    # image8-14: 副本内场景截图
    # image15: 副本选择界面
    # image16: 副本场景（炮台+增益）
    # image17: 近战骷髅
    # image18: 哥布林法师
    # image19: 精英骷髅
    # image20: 持盾骷髅
    # image21: 骷髅法师
    # image22-27: 商城/背包/结算截图

    rename_map = {
        'image17.png': 'monster_skeleton.png',        # 近战骷髅
        'image18.png': 'monster_goblin_mage.png',     # 哥布林法师
        'image19.png': 'monster_elite_skeleton.png',  # 精英骷髅
        'image20.png': 'monster_shield_skeleton.png', # 持盾骷髅
        'image21.png': 'monster_mage_skeleton.png',  # 骷髅法师
        'image16.png': 'scene_dungeon_cannon.png',    # 副本炮台场景
        'image22.png': 'ui_dungeon_select.png',       # 副本选择
        'image23.png': 'ui_settlement.png',            # 结算界面
        'image24.png': 'ui_shop.png',                  # 商城界面
        'image25.png': 'ui_backpack.png',              # 背包界面
        'image26.png': 'ui_start.png',                 # 开始界面
        'image27.png': 'ui_play.png',                  # Play界面
    }

    for old_name, new_name in rename_map.items():
        old_path = template_dir / old_name
        new_path = template_dir / new_name
        if old_path.exists():
            shutil.copy2(old_path, new_path)
            print(f"  重命名: {old_name} -> {new_name}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("用法: python extract_templates.py <需求文档.docx路径>")
        print("示例: python extract_templates.py 灯塔需求.docx")
        sys.exit(1)

    docx_path = sys.argv[1]
    template_dir = Path(__file__).parent / 'templates'

    print(f"从 {docx_path} 提取图片...")
    extract_images_from_docx(docx_path, template_dir)

    print(f"\n重命名模板图片...")
    rename_templates(template_dir)

    print("\n完成！模板图片已保存到 templates/ 目录")
