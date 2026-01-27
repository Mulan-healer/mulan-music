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
      webSecurity: true
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

  protocol.handle('atom', async (request) => {
    try {
      const url = new URL(request.url)
      let filePath = decodeURIComponent(url.pathname)
      
      // On Windows, pathname starts with /C:/... so we need to remove the leading /
      if (process.platform === 'win32') {
        // Check if it starts with / and a drive letter (e.g. /C:)
        if (filePath.match(/^\/[a-zA-Z]:/)) {
          filePath = filePath.slice(1)
        }
      }
      
      const stats = await fs.promises.stat(filePath)
      const range = request.headers.get('Range')
      
      const ext = path.extname(filePath).toLowerCase()
      const mimeTypes: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.flac': 'audio/flac',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg'
      }
      const contentType = mimeTypes[ext] || 'audio/mpeg'
      
      if (range) {
        const parts = range.replace(/bytes=/, "").split("-")
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1
        const chunksize = (end - start) + 1
        
        const stream = fs.createReadStream(filePath, { start, end })
        
        return new Response(stream as any, {
          status: 206,
          statusText: 'Partial Content',
          headers: {
            'Content-Range': `bytes ${start}-${end}/${stats.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType,
          }
        })
      } else {
        const stream = fs.createReadStream(filePath)
        return new Response(stream as any, {
          headers: {
            'Content-Length': stats.size.toString(),
            'Content-Type': contentType,
          }
        })
      }
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
    // Changed cache version to v4 to force re-scan for lyrics and external lrc files
    // Use project root cache folder if available (requested by user), otherwise fallback to userData
    const localCacheDir = path.join(process.cwd(), 'cache')
    let cachePath = path.join(app.getPath('userData'), 'songs_cache_v4.json')
    
    try {
      if (fs.existsSync(localCacheDir)) {
        cachePath = path.join(localCacheDir, 'songs_cache_v4.json')
        console.log('Using local cache path:', cachePath)
      }
    } catch (e) {
      console.error('Failed to check local cache dir:', e)
    }

    let cache: Record<string, any> = {}
    
    try {
      if (fs.existsSync(cachePath)) {
        cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'))
      }
    } catch (e) {
      console.error('Failed to load songs cache:', e)
    }

    const CHUNK_SIZE = 50
    let processedCount = 0
    let totalFiles = 0
    let currentChunk: any[] = []

    const processFile = async (filePath: string, stats: fs.Stats) => {
      const cachedSong = cache[filePath]
      let songData: any

      if (cachedSong && cachedSong.mtime === stats.mtimeMs) {
        songData = cachedSong.data
      } else {
        try {
          // Parse with default options
          const metadata = await mm.parseFile(filePath)
          
          let lyrics = null
          
          // 1. Try standard common lyrics (most reliable)
          if (metadata.common.lyrics && metadata.common.lyrics.length > 0) {
            const lyricEntry = metadata.common.lyrics[0]
            lyrics = typeof lyricEntry === 'string' ? lyricEntry : (lyricEntry as any).text
          } 
          
          // 2. Fallback: Check native ID3v2 tags directly
          if (!lyrics && metadata.native) {
            const id3Tags = (metadata.native as any)['ID3v2.3'] || (metadata.native as any)['ID3v2.4'] || []
            
            // Search for USLT (Unsynchronized lyrics)
            const uslt = id3Tags.find((t: any) => t.id === 'USLT')
            if (uslt && uslt.value && uslt.value.text) {
              lyrics = uslt.value.text
            }

            // Search for SYLT (Synchronized lyrics) - rare but possible fallback
            if (!lyrics) {
               const sylt = id3Tags.find((t: any) => t.id === 'SYLT')
               if (sylt && sylt.value && sylt.value.text) {
                 lyrics = sylt.value.text
               }
            }
          }

          // 3. Fallback: Look for external .lrc file
          if (!lyrics) {
            const lrcPath = filePath.replace(/\.[^.]+$/, '.lrc')
            if (fs.existsSync(lrcPath)) {
              try {
                lyrics = fs.readFileSync(lrcPath, 'utf-8')
              } catch (e) {
                console.error('Failed to read external lrc file:', e)
              }
            }
          }

          songData = {
            id: filePath,
            path: filePath,
            title: metadata.common.title || path.basename(filePath),
            artist: metadata.common.artist || 'Unknown Artist',
            album: metadata.common.album || 'Unknown Album',
            duration: metadata.format.duration,
            lyrics: lyrics,
            hasCover: !!metadata.common.picture
          }

          cache[filePath] = {
            mtime: stats.mtimeMs,
            data: songData
          }
        } catch (error) {
          songData = {
            id: filePath,
            path: filePath,
            title: path.basename(filePath),
            artist: 'Unknown Artist',
            album: 'Unknown Album',
            duration: 0
          }
        }
      }

      currentChunk.push(songData)
      processedCount++

      if (currentChunk.length >= CHUNK_SIZE) {
        event.sender.send('songs-data-chunk', {
          songs: currentChunk,
          isComplete: false,
          progress: totalFiles > 0 ? Math.floor((processedCount / totalFiles) * 100) : 0
        })
        currentChunk = []
      }
    }

    const scanDirectory = async (dir: string) => {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })
      
      const tasks = entries.map(async (entry) => {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
          await scanDirectory(fullPath)
        } else if (
          entry.name.endsWith('.mp3') ||
          entry.name.endsWith('.m4a') ||
          entry.name.endsWith('.flac') ||
          entry.name.endsWith('.wav')
        ) {
          totalFiles++
          const stats = await fs.promises.stat(fullPath)
          await processFile(fullPath, stats)
        }
      })
      
      await Promise.all(tasks)
    }

    // First pass to get total count (optional but helpful for progress)
    // For now, we'll just scan and send
    await scanDirectory(folderPath)

    // Send final chunk
    if (currentChunk.length > 0 || processedCount === totalFiles) {
      event.sender.send('songs-data-chunk', {
        songs: currentChunk,
        isComplete: true,
        progress: 100
      })
    }

    // Save updated cache
    try {
      fs.writeFileSync(cachePath, JSON.stringify(cache))
    } catch (e) {
      console.error('Failed to save songs cache:', e)
    }

    return { total: processedCount }
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
