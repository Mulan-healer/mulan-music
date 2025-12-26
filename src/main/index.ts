import { app, shell, BrowserWindow, ipcMain, dialog, protocol, net, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'

// Register 'atom' as a privileged scheme to allow it to behave like a standard protocol
// This is necessary for audio streaming and seeking to work correctly.
protocol.registerSchemesAsPrivileged([
  { scheme: 'atom', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false // Temporarily disable for local file access troubleshooting
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

let desktopLyricsWindow: BrowserWindow | null = null

function createDesktopLyricsWindow(): void {
  if (desktopLyricsWindow) return

  desktopLyricsWindow = new BrowserWindow({
    width: 800,
    height: 100,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    skipTaskbar: true,
    resizable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  // Position it at the bottom center of the screen
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.workAreaSize
  desktopLyricsWindow.setPosition(
    Math.floor((width - 800) / 2),
    Math.floor(height - 150)
  )

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    desktopLyricsWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/desktop-lyrics`)
  } else {
    desktopLyricsWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'desktop-lyrics' })
  }

  desktopLyricsWindow.on('closed', () => {
    desktopLyricsWindow = null
  })
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  ipcMain.on('toggle-desktop-lyrics', (_, visible: boolean) => {
    if (visible) {
      createDesktopLyricsWindow()
    } else {
      desktopLyricsWindow?.close()
    }
  })

  ipcMain.on('update-lyrics', (_, data) => {
    desktopLyricsWindow?.webContents.send('lyrics-data', data)
  })

  ipcMain.on('set-lyrics-window-ignore-mouse', (_, ignore: boolean) => {
    desktopLyricsWindow?.setIgnoreMouseEvents(ignore, { forward: true })
  })

  protocol.handle('atom', (request) => {
    try {
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname)
      
      // On Windows, the pathname starts with a slash (e.g., "/C:/path/to/file")
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }
      
      return net.fetch(pathToFileURL(filePath).toString())
    } catch (error) {
      console.error('Protocol error:', error)
      return new Response('Error loading resource', { status: 500 })
    }
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('select-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    })
    if (canceled) return null
    const folderPath = filePaths[0]
    
    // Save the folder path to config
    try {
      const configPath = path.join(app.getPath('userData'), 'config.json')
      let config = {}
      if (fs.existsSync(configPath)) {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
      }
      config = { ...config, lastFolderPath: folderPath }
      fs.writeFileSync(configPath, JSON.stringify(config))
    } catch (error) {
      console.error('Failed to save config:', error)
    }

    return folderPath
  })

  ipcMain.handle('get-last-folder', () => {
    try {
      const configPath = path.join(app.getPath('userData'), 'config.json')
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
        return config.lastFolderPath || null
      }
    } catch (error) {
      console.error('Failed to read config:', error)
    }
    return null
  })

  ipcMain.handle('get-songs', async (event, folderPath: string) => {
      const mm = await import('music-metadata')
      const cachePath = path.join(app.getPath('userData'), 'songs_cache_v2.json')
      let cache: Record<string, any> = {}
      
      try {
        if (fs.existsSync(cachePath)) {
          cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
        }
      } catch (e) {
        console.error('Failed to load songs cache:', e)
      }

      const fileList: { path: string, mtime: number }[] = []

      const getFileList = (dir: string) => {
        const files = fs.readdirSync(dir)
        for (const file of files) {
          const filePath = path.join(dir, file)
          const stats = fs.statSync(filePath)
          if (stats.isDirectory()) {
            getFileList(filePath)
          } else if (
            file.endsWith('.mp3') ||
            file.endsWith('.m4a') ||
            file.endsWith('.flac') ||
            file.endsWith('.wav')
          ) {
            fileList.push({ path: filePath, mtime: stats.mtimeMs })
          }
        }
      }

      getFileList(folderPath)

      const totalFiles = fileList.length
      let processedCount = 0
      const CHUNK_SIZE = 50
      let currentChunk: any[] = []

      // Concurrency limit for parsing
      const CONCURRENCY = 15
      const chunks = []
      for (let i = 0; i < fileList.length; i += CONCURRENCY) {
        chunks.push(fileList.slice(i, i + CONCURRENCY))
      }

      for (const chunk of chunks) {
        await Promise.all(chunk.map(async (file) => {
          const cachedSong = cache[file.path]
          let songData: any

          if (cachedSong && cachedSong.mtime === file.mtime) {
            songData = cachedSong.data
          } else {
            try {
              const metadata = await mm.parseFile(file.path)
              
              let lyrics = null
              if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
                const lyricEntry = metadata.common.lyrics[0]
                lyrics = typeof lyricEntry === 'string' ? lyricEntry : (lyricEntry as any).text
              } else if ((metadata.native as any)['ID3v2.3'] || (metadata.native as any)['ID3v2.4']) {
                const native = (metadata.native as any)['ID3v2.3'] || (metadata.native as any)['ID3v2.4']
                const uslt = native?.find((t: any) => t.id === 'USLT')
                if (uslt) lyrics = uslt.value.text
              }

              songData = {
                id: file.path,
                path: file.path,
                title: metadata.common.title || path.basename(file.path),
                artist: metadata.common.artist || 'Unknown Artist',
                album: metadata.common.album || 'Unknown Album',
                duration: metadata.format.duration,
                lyrics: lyrics,
                hasCover: !!metadata.common.picture // Just a flag
              }

              cache[file.path] = {
                mtime: file.mtime,
                data: songData
              }
            } catch (error) {
              songData = {
                id: file.path,
                path: file.path,
                title: path.basename(file.path),
                artist: 'Unknown Artist',
                album: 'Unknown Album',
                duration: 0
              }
            }
          }

          currentChunk.push(songData)
          processedCount++

          if (currentChunk.length >= CHUNK_SIZE || processedCount === totalFiles) {
            event.sender.send('songs-data-chunk', {
              songs: currentChunk,
              isComplete: processedCount === totalFiles,
              progress: Math.floor((processedCount / totalFiles) * 100)
            })
            currentChunk = []
          }
        }))
      }

      // Save updated cache (without covers)
      try {
        fs.writeFileSync(cachePath, JSON.stringify(cache))
      } catch (e) {
        console.error('Failed to save songs cache:', e)
      }

      return { total: totalFiles } // Handled via events now
    })

  ipcMain.handle('get-song-cover', async (_, filePath: string) => {
    try {
      const mm = await import('music-metadata')
      const metadata = await mm.parseFile(filePath)
      if (metadata.common.picture && metadata.common.picture.length > 0) {
        const pic = metadata.common.picture[0]
        return `data:${pic.format};base64,${pic.data.toString('base64')}`
      }
    } catch (e) {
      console.error('Failed to get cover:', e)
    }
    return null
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
