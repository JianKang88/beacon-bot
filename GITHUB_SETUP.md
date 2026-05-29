# GitHub Actions 自动打包教程

## 步骤1：注册GitHub账号

1. 打开 https://github.com/signup
2. 用邮箱注册（免费）
3. 验证邮箱

## 步骤2：创建新仓库

1. 登录GitHub
2. 点击右上角 **+** → **New repository**
3. 仓库名称填：`beacon-bot`
4. 选择 **Public**（公开）
5. 勾选 **Add a README file**
6. 点击 **Create repository**

## 步骤3：上传文件

### 方式A：网页上传（简单）

1. 进入你的仓库页面
2. 点击 **Add file** → **Upload files**
3. 把以下文件拖进去：
   - `beacon_bot.py`
   - `build_exe.py`
   - `extract_templates.py`
   - `requirements.txt`
   - `README.md`
   - `.github/workflows/build.yml` （先创建文件夹再上传）
   - `templates/` 文件夹里的所有图片
4. 点击 **Commit changes**

### 方式B：命令行（如果你有git）

```bash
git clone https://github.com/你的用户名/beacon-bot.git
cd beacon-bot
# 复制所有文件到这里
git add .
git commit -m "初始提交"
git push origin main
```

## 步骤4：触发自动打包

1. 在仓库页面，点击 **Actions** 标签
2. 你会看到 **Build EXE** 工作流
3. 点击 **Run workflow** → **Run workflow**
4. 等待2-3分钟

## 步骤5：下载exe

### 方式A：从Artifacts下载

1. 点击完成的 workflow 运行记录
2. 滚动到底部 **Artifacts** 区域
3. 点击 **灯塔自动化-exe** 下载

### 方式B：从Release下载（推荐）

1. 点击仓库的 **Releases** 标签
2. 找到最新版本
3. 下载 `灯塔自动化.exe`

## 文件结构要求

上传后你的仓库应该长这样：

```
beacon-bot/
├── .github/
│   └── workflows/
│       └── build.yml          # GitHub Actions配置
├── templates/
│   ├── image16.png            # 怪物模板图片
│   ├── image17.png
│   ├── image18.png
│   ├── image19.png
│   ├── image20.png
│   └── image21.png
├── beacon_bot.py              # 主程序
├── build_exe.py               # 打包脚本
├── extract_templates.py       # 模板提取
├── requirements.txt           # 依赖列表
└── README.md                  # 说明文档
```

## 常见问题

**Q: 打包失败了怎么办？**
A: 点击失败的 workflow，查看日志，通常是缺少文件

**Q: 怎么更新exe？**
A: 修改代码后 push 到仓库，会自动重新打包

**Q: 可以私有仓库吗？**
A: 可以，但GitHub Actions在私有仓库有免费额度限制

**Q: 下载的exe报毒？**
A: PyInstaller打包的exe有时会被误报，添加信任即可
