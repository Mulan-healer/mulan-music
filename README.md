# Mulan Music 🎵

A beautiful, smooth, and modern local music player built with **Electron**, **React**, and **Tailwind CSS**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Version](https://img.shields.io/badge/version-0.1.3-pink.svg)

## ✨ Features

- 📂 **Local Folder Scanning**: Easily import your music collection.
- 🖼️ **Batch Cover Loading**: High-performance cover art loading with play-priority optimization.
- 🎤 **Smooth Lyrics Scroll**: APlayer-inspired silky smooth lyric scrolling with automatic centering and translation support.
- 🎨 **Modern UI**: Clean, responsive interface with beautiful glassmorphism effects.
- ⚙️ **Customizable Settings**: Adjustable font sizes, alignment, and translation toggles.
- 🚀 **Auto-versioning**: Automatic version patching during the build process.

## 🛠️ Tech Stack

- **Framework**: [Electron](https://www.electronjs.org/)
- **Frontend**: [React](https://reactjs.org/) + [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Metadata**: [music-metadata](https://github.com/borewit/music-metadata)

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm (comes with Node.js)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/mulan-music.git
   cd mulan-music
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

### Building for Windows

To package the app into a Windows installer (`.exe`):

```bash
npm run build:win
```
The output will be in the `dist` folder.

## 📝 License

This project is licensed under the MIT License.
