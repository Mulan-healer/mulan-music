# Mulan Music 🎵 | 木兰音乐

[English](./README.md) | [简体中文](./README.md)

A beautiful, smooth, and modern local music player built with **Electron**, **React**, and **Tailwind CSS**.
一款基于 **Electron**、**React** 和 **Tailwind CSS** 构建的精美、流畅且现代的本地音乐播放器。

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.3-pink.svg)

---

## ✨ Features | 功能亮点

- 📂 **Local Folder Scanning | 本地扫描**: Easily import your music collection. / 轻松导入您的音乐收藏。
- 🖼️ **Batch Cover Loading | 批量封面加载**: High-performance cover art loading with play-priority optimization. / 高性能封面加载，支持播放优先级优化。
- 🎤 **Smooth Lyrics Scroll | 丝滑歌词滚动**: APlayer-inspired silky smooth lyric scrolling with automatic centering and translation support. / 仿 APlayer 的丝滑歌词滚动，支持自动居中和翻译显示。
- 🎨 **Modern UI | 现代 UI**: Clean, responsive interface with beautiful glassmorphism effects. / 纯净、响应式的界面，带有精美的毛玻璃效果。
- ⚙️ **Customizable Settings | 自定义设置**: Adjustable font sizes, alignment, and translation toggles. / 可调节字体大小、对齐方式及翻译开关。
- 🚀 **Auto-versioning | 自动版本管理**: Automatic version patching during the build process. / 构建过程中自动更新版本号。

## 🛠️ Tech Stack | 技术栈

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Metadata**: [music-metadata](https://github.com/borewit/music-metadata)

## 🚀 Getting Started | 快速上手

### Prerequisites | 前提条件

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (comes with Node.js)

### Installation | 安装

1. Clone the repository | 克隆仓库:
   ```bash
   git clone https://github.com/Mulan-healer/mulan-music.git
   cd mulan-music
   ```

2. Install dependencies | 安装依赖:
   ```bash
   npm install
   ```

3. Run in development mode | 开发模式运行:
   ```bash
   npm run dev
   ```

### Building for Windows | 构建 Windows 版本

To package the app into a Windows installer (`.exe`) | 将应用打包为 Windows 安装程序:

```bash
npm run build:win
```
The output will be in the `dist` folder. / 输出文件将位于 `dist` 文件夹中。

## 📝 License | 开源协议

This project is licensed under the MIT License. / 本项目遵循 MIT 开源协议。
