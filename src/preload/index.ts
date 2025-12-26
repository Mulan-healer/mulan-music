import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getSongs: (folderPath: string) => ipcRenderer.invoke('get-songs', folderPath),
  getLastFolder: () => ipcRenderer.invoke('get-last-folder'),
  getSongCover: (filePath: string) => ipcRenderer.invoke('get-song-cover', filePath),
  onSongsDataChunk: (callback: (data: any) => void) => {
    ipcRenderer.on('songs-data-chunk', (_, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('songs-data-chunk')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
