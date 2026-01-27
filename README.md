# Mulan Music (木兰音乐) 🎵

Mulan Music 是一款基于 Electron 和 React 开发的高颜值本地音乐播放器。它结合了现代化的 UI 设计与流畅的用户体验，致力于为用户提供一个纯粹、美观的本地音乐聆听环境。

---

## ✨ 核心特性

- **🌊 全新海洋蓝 (Ocean Blue) 主题**：抛弃了高饱和度的紫色调，采用更清爽、护眼的 "Ocean Blue" 配色方案 (Sky-400 & Indigo-400)，减少视觉疲劳，带来更专业的现代感。
- **🚀 极致性能体验**：
  - **增量渲染 (Infinite Scroll)**：歌手列表采用无限滚动技术，支持海量数据流畅加载，拒绝卡顿。
  - **视图即时切换**：采用 CSS 显隐策略重构视图管理，实现 Songs/Artists 界面间的零延迟瞬时切换，并完美保留滚动位置。
  - **智能缓存系统**：在项目根目录 (`/cache`) 建立本地缓存，大幅提升二次启动速度，避免重复扫描。
- **📜 增强型歌词解析**：
  - **智能双语合并**：优化 LRC 解析算法，自动识别并合并同一时间戳的原文与翻译，确保原文聚焦准确，翻译作为副标题显示。
  - **丝滑滚动**：歌词随节奏精准滚动，支持平滑动画。
  - **个性化定制**：支持实时调整歌词字体大小、对齐方式。
  - **桌面歌词**：支持悬浮桌面歌词窗口，工作听歌两不误。
- **🔍 智能曲库管理**：
  - **本地扫描**：快速扫描并导入本地音频文件，自动解析元数据（封面、标题、艺术家等）。
  - **分类浏览**：支持按歌曲、艺术家进行分类，轻松管理海量收藏。
  - **实时搜索**：极速检索，瞬间定位你想听的歌曲。
- **🏝️ 灵动岛播放条**：位于底部的交互式播放条，集成了核心控制功能，轻量且高效。

---

## 🛠️ 技术栈

- **核心框架**：[Electron](https://www.electronjs.org/) (跨平台桌面应用)
- **前端框架**：[React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **构建工具**：[electron-vite](https://electron-vite.org/)
- **样式处理**：[Tailwind CSS](https://tailwindcss.com/)
- **图标系统**：[Lucide React](https://lucide.dev/)
- **音频元数据解析**：[music-metadata](https://github.com/borewit/music-metadata)
- **布局/动画**：Tailwind CSS Animations & Transitions

---

## 🚀 快速开始

### 前置要求

确保你的开发环境中已安装 [Node.js](https://nodejs.org/) (建议 v16+) 和 `npm`。

### 安装步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/your-username/mulan_music.git
   cd mulan_music
   ```

2. **安装依赖**
   ```bash
   npm install
   ```

3. **启动开发模式**
   ```bash
   npm run dev
   ```

4. **构建打包 (Windows)**
   ```bash
   npm run build:win
   ```
   *打包后的安装文件将位于 `dist` 目录下。*

---

## 📂 项目结构

```text
mulan_music/
├── src/
│   ├── main/           # Electron 主进程 (窗口管理、系统交互)
│   ├── preload/        # 预加载脚本 (安全地桥接主进程与渲染进程)
│   └── renderer/       # 渲染进程 (React 前端应用)
│       ├── src/
│       │   ├── components/  # 复用组件 (如桌面歌词)
│       │   ├── utils/       # 工具类 (如歌词解析器)
│       │   ├── App.tsx      # 应用核心逻辑与主视图
│       │   └── index.css    # 全局样式与 Tailwind 配置
│       └── index.html
├── electron-vite.config.ts  # 构建配置
├── tailwind.config.js       # 样式配置
└── package.json             # 依赖与脚本
```

---

## 📝 待办事项 (Roadmap)

- [ ] 支持歌词在线搜索与下载
- [ ] 播放列表管理（创建、重命名、删除）
- [ ] 均衡器 (Equalizer) 设置
- [ ] 多语言界面支持
- [ ] macOS 与 Linux 平台的完整构建支持

---

## 📄 开源协议

本项目基于 [MIT License](LICENSE) 协议。

---

## 🤝 贡献与反馈

如果你有任何建议或发现了 Bug，欢迎提交 [Issue](https://github.com/your-username/mulan_music/issues) 或 Pull Request。

感谢支持 **Mulan Music**！让每一首歌都值得更美的呈现。
