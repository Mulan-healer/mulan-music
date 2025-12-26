import { useState, useEffect, useRef, useMemo } from 'react'
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, Search, 
  Home, Radio, LayoutGrid, Music2, Mic2, ListMusic, 
  FolderOpen, Heart, Repeat, Shuffle, ChevronLeft, Users
} from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface LyricLine {
  time: number
  text: string
  translation?: string
}

interface Song {
  id: string
  path: string
  title: string
  artist: string
  album: string
  duration: number
  cover?: string | null
  hasCover?: boolean
  lyrics?: string | null
}

export default function App() {
  const [view, setView] = useState<'songs' | 'artists' | 'playlists'>('songs')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [loadedCoverCount, setLoadedCoverCount] = useState(0)
  const [currentSong, setCurrentSong] = useState<Song | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [volume, setVolume] = useState(0.5)
  const [showLyrics, setShowLyrics] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [parsedLyrics, setParsedLyrics] = useState<LyricLine[]>([])
  const [currentLyricIndex, setCurrentLyricIndex] = useState(-1)
  const [lyricOffset, setLyricOffset] = useState(0)
  const [lyricFontSize, setLyricFontSize] = useState(48)
  const [lyricAlign, setLyricAlign] = useState<'center' | 'left'>('left')
  const [showTranslation, setShowTranslation] = useState(true)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null)
  const activeLyricRef = useRef<HTMLParagraphElement | null>(null)

  const parseLRC = (lrcContent: string): LyricLine[] => {
    const lines = lrcContent.split('\n')
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/
    const chineseRegex = /[\u4e00-\u9fa5]/
    const japaneseRegex = /[\u3040-\u30ff]/ // Hiragana and Katakana
    const foreignRegex = /[a-zA-Z0-9\uac00-\ud7af\u3040-\u30ff\u0400-\u04ff]/u // Eng, Num, Kor, Jap, Rus

    const rawLines: { time: number; text: string }[] = []
    lines.forEach(line => {
      const match = timeRegex.exec(line)
      if (match) {
        const minutes = parseInt(match[1])
        const seconds = parseInt(match[2])
        const msMatch = match[3]
        const milliseconds = parseInt(msMatch.padEnd(3, '0'))
        const time = minutes * 60 + seconds + milliseconds / 1000
        const text = line.replace(timeRegex, '').trim()
        if (text) rawLines.push({ time, text })
      }
    })

    const result: LyricLine[] = []
    const creditKeywords = [
      '作词', '作曲', '编曲', '制作人', '监制', '录音', '混音', '母带', '演唱', '歌手',
      'Lyrics', 'Lyricist', 'Composer', 'Arranger', 'Producer', 'Artist', 'Vocals', 'Words', 'Music'
    ]

    rawLines.forEach(line => {
      const text = line.text
      const isCreditLine = creditKeywords.some(kw => text.includes(kw))
      const isMetadataLine = isCreditLine || 
                        (text.includes('(') && text.includes(')')) || 
                        (text.includes(' - ')) ||
                        text.startsWith('ti:') || 
                        text.startsWith('ar:') || 
                        text.startsWith('al:') ||
                        text.startsWith('by:')

  // 1. Standard Merge (same timestamp)
  const lastLine = result[result.length - 1]
  if (lastLine && Math.abs(lastLine.time - line.time) < 0.1 && !isMetadataLine) {
    if (showTranslation) {
      lastLine.translation = text
    } else {
      lastLine.translation = text 
    }
    return
  }

      if (isMetadataLine) {
        if (isCreditLine && (text.includes('  ') || text.includes(' / '))) {
          const parts = text.split(/\s{2,}| \/ | \| /).filter(p => p.trim().length > 0)
          parts.forEach(part => {
            result.push({ time: line.time, text: part.trim() })
          })
        } else {
          result.push({ time: line.time, text: text })
        }
        return
      }

      // 2. Explicit Delimiters (Highest priority)
      const delimiters = [' / ', ' // ', ' | ', '  ']
      for (const delimiter of delimiters) {
        const idx = text.indexOf(delimiter)
        if (idx !== -1) {
          const original = text.substring(0, idx).trim()
          const translation = text.substring(idx + delimiter.length).trim()
          if (original && translation) {
            result.push({ time: line.time, text: original, translation: translation })
            return
          }
        }
      }

      // 3. Special handling for Japanese + Chinese on same line
      // Often separated by a single space or multiple spaces
      if (japaneseRegex.test(text)) {
        const parts = text.split(/\s+/).filter(p => p.length > 0)
        if (parts.length >= 2) {
          // If first part has Japanese and second part is primarily Chinese without Japanese
          const firstPart = parts[0]
          const restPart = parts.slice(1).join(' ')
          if (japaneseRegex.test(firstPart) && !japaneseRegex.test(restPart) && chineseRegex.test(restPart)) {
            result.push({ time: line.time, text: firstPart, translation: restPart })
            return
          }
          // If first few parts together have Japanese and last part is Chinese
          for (let i = 1; i < parts.length; i++) {
            const prefix = parts.slice(0, i).join(' ')
            const suffix = parts.slice(i).join(' ')
            if (japaneseRegex.test(prefix) && !japaneseRegex.test(suffix) && chineseRegex.test(suffix)) {
              result.push({ time: line.time, text: prefix, translation: suffix })
              return
            }
          }
        }
      }

      // 4. Strict Language Separation Logic
      // Find indices of all Chinese and Foreign characters
      const chineseIndices: number[] = []
      const foreignIndices: number[] = []

      for (let i = 0; i < text.length; i++) {
        if (chineseRegex.test(text[i])) chineseIndices.push(i)
        else if (foreignRegex.test(text[i])) foreignIndices.push(i)
      }

      if (chineseIndices.length > 0 && foreignIndices.length > 0) {
        const firstChinese = chineseIndices[0]
        const lastChinese = chineseIndices[chineseIndices.length - 1]
        const firstForeign = foreignIndices[0]
        const lastForeign = foreignIndices[foreignIndices.length - 1]

        // Case A: Foreign then Chinese (e.g., "Heat Waves 热浪")
        if (lastForeign < firstChinese) {
          const foreignPart = text.substring(0, firstChinese).trim()
          const chinesePart = text.substring(firstChinese).trim()
          
          const isLikelyMixed = foreignPart.split(' ').length <= 3 && !text.includes('  ')
          
          if (!isLikelyMixed || foreignIndices.length > 5) {
            result.push({
              time: line.time,
              text: foreignPart,
              translation: chinesePart
            })
            return
          }
        }
        // Case B: Chinese then Foreign (e.g., "不亏不欠 We don't owe")
        else if (lastChinese < firstForeign) {
          const chinesePart = text.substring(0, firstForeign).trim()
          const foreignPart = text.substring(firstForeign).trim()
          
          const isLikelyMixed = foreignPart.split(' ').length <= 2 && !text.includes('  ')

          if (!isLikelyMixed || foreignIndices.length > 5) {
            result.push({
              time: line.time,
              text: chinesePart,
              translation: foreignPart
            })
            return
          }
        }
      }

      // Fallback
      result.push({ time: line.time, text: text })
    })

    return result
  }

  useEffect(() => {
    const removeListener = (window as any).api.onSongsDataChunk((data: { songs: Song[], isComplete: boolean, progress: number }) => {
      setSongs(prev => {
        const newSongs = [...prev]
        data.songs.forEach(song => {
          if (!newSongs.find(s => s.id === song.id)) {
            newSongs.push(song)
          }
        })
        return newSongs
      })
    })

    const loadLastFolder = async () => {
      const lastFolder = await (window as any).api.getLastFolder()
      if (lastFolder) {
        setSongs([]) // Clear current list for fresh scan
        await (window as any).api.getSongs(lastFolder)
      }
    }
    loadLastFolder()

    return () => removeListener()
  }, [])

  // Progressive cover loading logic
  useEffect(() => {
    if (songs.length === 0) {
      setLoadedCoverCount(0)
      return
    }

    const timer = setTimeout(() => {
      setSongs(prevSongs => {
        let nextBatchSize = 0
        let delay = 0

        if (loadedCoverCount === 0) {
          // First batch: 20 songs immediately (well, after first render)
          nextBatchSize = 20
          delay = 0
        } else {
          // Subsequent batches: 50 songs every 2 seconds
          nextBatchSize = 50
          delay = 2000
        }

        const startIdx = loadedCoverCount
        const endIdx = Math.min(startIdx + nextBatchSize, prevSongs.length)

        if (startIdx >= prevSongs.length) return prevSongs

        const batch = prevSongs.slice(startIdx, endIdx)
        
        // Load covers for this batch asynchronously via IPC
        Promise.all(batch.map(async (song) => {
          if (!song.cover && song.hasCover) {
            const cover = await (window as any).api.getSongCover(song.path)
            if (cover) {
              setSongs(currentSongs => currentSongs.map(s => s.id === song.id ? { ...s, cover } : s))
            }
          }
        }))

        setLoadedCoverCount(endIdx)
        return prevSongs
      })
    }, loadedCoverCount === 0 ? 0 : 2000)

    return () => clearTimeout(timer)
  }, [songs.length, loadedCoverCount])

  useEffect(() => {
    const fetchCover = async () => {
      if (currentSong && !currentSong.cover && currentSong.hasCover) {
        const cover = await (window as any).api.getSongCover(currentSong.path)
        if (cover) {
          setCurrentSong(prev => prev ? { ...prev, cover } : null)
          // Also update in the list so it's cached in memory
          setSongs(prev => prev.map(s => s.id === currentSong.id ? { ...s, cover } : s))
        }
      }
    }
    fetchCover()
  }, [currentSong?.id])

  useEffect(() => {
    if (currentSong?.lyrics) {
      setParsedLyrics(parseLRC(currentSong.lyrics))
    } else {
      setParsedLyrics([])
    }
    setCurrentLyricIndex(-1)
  }, [currentSong])

  useEffect(() => {
    const updateOffset = () => {
      if (showLyrics && activeLyricRef.current && lyricsContainerRef.current) {
        const container = lyricsContainerRef.current
        const activeElement = activeLyricRef.current
        
        const containerHeight = container.clientHeight
        const activeTop = activeElement.offsetTop
        const activeHeight = activeElement.clientHeight
        
        const newOffset = (containerHeight / 2) - activeTop - (activeHeight / 2)
        setLyricOffset(newOffset)
      }
    }

    updateOffset()
    window.addEventListener('resize', updateOffset)
    return () => window.removeEventListener('resize', updateOffset)
  }, [currentLyricIndex, showLyrics])

  const filteredSongs = useMemo(() => {
    return songs.filter(song => 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.album.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [songs, searchQuery])

  const artists = useMemo(() => {
    const map = new Map<string, { name: string, songCount: number, cover?: string | null }>()
    songs.forEach(song => {
      const existing = map.get(song.artist)
      if (existing) {
        existing.songCount++
        if (!existing.cover && song.cover) existing.cover = song.cover
      } else {
        map.set(song.artist, { name: song.artist, songCount: 1, cover: song.cover })
      }
    })
    
    const artistList = Array.from(map.values())
    if (!searchQuery) return artistList.sort((a, b) => a.name.localeCompare(b.name))
    
    return artistList
      .filter(artist => artist.name.toLowerCase().includes(searchQuery.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [songs, searchQuery])

  const artistSongs = useMemo(() => {
    if (!selectedArtist) return []
    const songsByArtist = songs.filter(s => s.artist === selectedArtist)
    if (!searchQuery) return songsByArtist
    
    return songsByArtist.filter(song => 
      song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      song.album.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [songs, selectedArtist, searchQuery])

  const currentPlaylist = useMemo(() => {
    if (view === 'artists' && selectedArtist) return artistSongs
    if (view === 'songs') return filteredSongs
    return songs
  }, [view, selectedArtist, artistSongs, filteredSongs, songs])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume])

  const handleSelectFolder = async () => {
    const folderPath = await (window as any).api.selectFolder()
    if (folderPath) {
      setSongs([]) // Clear list for new folder
      await (window as any).api.getSongs(folderPath)
    }
  }

  const togglePlay = async () => {
    if (!currentSong && currentPlaylist.length > 0) {
      await playSong(currentPlaylist[0])
      return
    }
    if (isPlaying) {
      audioRef.current?.pause()
      setIsPlaying(false)
    } else {
      try {
        await audioRef.current?.play()
        setIsPlaying(true)
      } catch (error) {
        console.error("Playback error:", error)
      }
    }
  }

  const playSong = async (song: Song) => {
    setCurrentSong(song)
    setIsPlaying(true)
    if (audioRef.current) {
      try {
        // Reverting to file:// protocol as webSecurity is disabled
        // On Windows, the path needs to be formatted as file:///C:/path/to/file
        const normalizedPath = song.path.replace(/\\/g, '/')
        const audioUrl = `file:///${normalizedPath}`
        
        console.log("Playing with URL:", audioUrl)
        
        audioRef.current.src = audioUrl
        audioRef.current.load()
        await audioRef.current.play()
      } catch (error) {
        console.error("Playback error:", error)
        setIsPlaying(false)
      }
    }
  }

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime
      const duration = audioRef.current.duration
      setCurrentTime(current)
      if (duration > 0) {
        setProgress((current / duration) * 100)
      }

      // Update current lyric index
      if (parsedLyrics.length > 0) {
        let index = -1
        for (let i = 0; i < parsedLyrics.length; i++) {
          if (current >= parsedLyrics[i].time) {
            index = i
          } else {
            break
          }
        }
        if (index !== currentLyricIndex) {
          setCurrentLyricIndex(index)
        }
      }
    }
  }

  const skipNext = () => {
    if (!currentSong || currentPlaylist.length === 0) return
    const currentIndex = currentPlaylist.findIndex(s => s.id === currentSong.id)
    if (currentIndex === -1) {
      // If current song not in current playlist, just play the first one
      playSong(currentPlaylist[0])
    } else if (currentIndex < currentPlaylist.length - 1) {
      playSong(currentPlaylist[currentIndex + 1])
    } else {
      playSong(currentPlaylist[0])
    }
  }

  const skipBack = () => {
    if (!currentSong || currentPlaylist.length === 0) return
    const currentIndex = currentPlaylist.findIndex(s => s.id === currentSong.id)
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
    } else if (currentIndex === -1) {
      playSong(currentPlaylist[0])
    } else if (currentIndex > 0) {
      playSong(currentPlaylist[currentIndex - 1])
    } else {
      playSong(currentPlaylist[currentPlaylist.length - 1])
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const seekTo = (parseFloat(e.target.value) / 100) * (audioRef.current?.duration || 0)
    if (audioRef.current) {
      audioRef.current.currentTime = seekTo
      setProgress(parseFloat(e.target.value))
    }
  }

  const formatTime = (seconds: number) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex h-screen bg-[#1a1a1a] text-white overflow-hidden select-none">
      <audio 
        ref={audioRef} 
        onTimeUpdate={handleTimeUpdate} 
        onEnded={skipNext}
        onError={(e) => console.error("Audio element error:", e)}
      />

      {/* Sidebar */}
      <aside className="w-64 bg-[#252525] flex flex-col border-r border-white/10">
        <div className="p-6">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center">
              <Music2 size={20} />
            </div>
            <span className="font-bold text-xl tracking-tight">Mulan Music</span>
          </div>

          <nav className="space-y-1">
            <NavItem icon={<Home size={18} />} label="Listen Now" active />
            <NavItem icon={<Radio size={18} />} label="Radio" />
            <NavItem icon={<LayoutGrid size={18} />} label="Browse" />
          </nav>

          <div className="mt-8">
            <h3 className="px-3 text-xs font-semibold text-white/40 uppercase tracking-wider mb-2">Library</h3>
            <nav className="space-y-1">
              <button 
                onClick={() => { setView('artists'); setSelectedArtist(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  view === 'artists' ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Mic2 size={18} />
                <span>Artists</span>
              </button>
              <button 
                onClick={() => { setView('songs'); setSelectedArtist(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  view === 'songs' ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <Music2 size={18} />
                <span>Songs</span>
              </button>
              <button 
                onClick={() => { setView('playlists'); setSelectedArtist(null); }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
                  view === 'playlists' ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
                )}
              >
                <ListMusic size={18} />
                <span>Playlists</span>
              </button>
              <button 
                onClick={handleSelectFolder}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-white/70 hover:bg-white/10 hover:text-white transition-colors text-sm font-medium"
              >
                <FolderOpen size={18} />
                <span>Open Folder</span>
              </button>
            </nav>
          </div>

          {currentSong && (
            <div className="mt-auto p-4 bg-white/5 rounded-xl m-4 border border-white/5">
              <div className="aspect-square w-full bg-white/10 rounded-lg mb-3 overflow-hidden">
                {currentSong.cover ? (
                  <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music2 className="w-full h-full p-8 text-white/10" />
                )}
              </div>
              <div className="text-sm font-semibold truncate">{currentSong.title}</div>
              <div className="text-xs text-white/40 truncate">{currentSong.artist}</div>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 flex items-center justify-between px-8 border-b border-white/5">
          <div className="relative w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={16} />
            <input 
              type="text" 
              placeholder="Search" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border-none rounded-full py-1.5 pl-10 pr-4 text-sm focus:ring-1 focus:ring-pink-500 transition-all"
            />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-8 py-6 relative">
          {showLyrics ? (
            currentSong ? (
              <div className="fixed top-0 left-64 right-0 bottom-24 z-40 flex flex-col bg-black animate-in fade-in slide-in-from-bottom-4 duration-500 overflow-hidden">
                <header className="sticky top-0 z-20 h-24 flex items-center justify-between px-12 flex-shrink-0 bg-black pt-8">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg overflow-hidden shadow-2xl border border-white/10">
                      {currentSong.cover ? (
                        <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Music2 className="w-full h-full p-2 bg-white/10" />
                      )}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold truncate max-w-md">{currentSong.title}</h2>
                      <p className="text-sm text-white/60 truncate">{currentSong.artist}</p>
                    </div>
                  </div>
                </header>

                <div className={cn(
                  "absolute right-12 top-32 z-30 flex flex-col bg-white/5 rounded-2xl backdrop-blur-xl border border-white/10 transition-all duration-300 overflow-hidden w-12",
                  showSettings ? "max-h-[400px] opacity-100" : "h-12 opacity-100"
                )}>
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className={cn(
                      "w-full h-12 flex items-center justify-center text-white transition-colors flex-shrink-0",
                      showSettings ? "bg-white/10" : "hover:bg-white/10"
                    )}
                    title={showSettings ? "Close Settings" : "Open Settings"}
                  >
                    <LayoutGrid size={20} />
                  </button>
                  
                  <div className={cn(
                    "flex flex-col gap-2 p-2 transition-all duration-300",
                    showSettings ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"
                  )}>
                    <button 
                      onClick={() => setShowTranslation(!showTranslation)}
                      className={cn(
                        "w-full py-2 rounded-lg transition-colors text-xs font-bold flex items-center justify-center",
                        showTranslation ? "bg-pink-500 text-white" : "hover:bg-white/10 text-white/60"
                      )}
                      title="Toggle Translation"
                    >
                      译
                    </button>
                    <div className="h-px bg-white/10 mx-1" />
                    <button 
                      onClick={() => setLyricFontSize(prev => Math.min(prev + 4, 80))}
                      className="w-full py-2 rounded-lg hover:bg-white/10 text-white/60 flex items-center justify-center font-bold"
                      title="Increase Font Size"
                    >
                      A+
                    </button>
                    <button 
                      onClick={() => setLyricFontSize(prev => Math.max(prev - 4, 24))}
                      className="w-full py-2 rounded-lg hover:bg-white/10 text-white/60 flex items-center justify-center font-bold"
                      title="Decrease Font Size"
                    >
                      A-
                    </button>
                    <button 
                      onClick={() => setLyricAlign(lyricAlign === 'center' ? 'left' : 'center')}
                      className="w-full py-2 rounded-lg hover:bg-white/10 text-white/60 flex items-center justify-center text-[10px] font-bold"
                      title="Toggle Alignment"
                    >
                      {lyricAlign === 'center' ? 'Left' : 'Center'}
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-hidden px-12 py-12 flex flex-col items-center relative" ref={lyricsContainerRef}>
                  <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#1a1a1a] via-[#1a1a1a]/80 to-transparent z-20 pointer-events-none" />
                  <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/80 to-transparent z-20 pointer-events-none" />
                  
                  <div 
                    className={cn(
                      "max-w-4xl w-full transition-transform duration-500 ease-out absolute left-0 right-0 mx-auto",
                      lyricAlign === 'center' ? 'text-center' : 'text-left px-12'
                    )}
                    style={{ 
                      transform: `translateY(${lyricOffset}px)`,
                    }}
                  >
                    {parsedLyrics.length > 0 ? (
                      <div className="space-y-10 py-[40vh]">
                        {parsedLyrics.map((line, i) => (
                          <div 
                            key={i} 
                            ref={i === currentLyricIndex ? activeLyricRef : null}
                            className={cn(
                              "flex flex-col gap-2 transition-all duration-500 cursor-default",
                              i === currentLyricIndex 
                                ? "scale-105 blur-none opacity-100" 
                                : "blur-[1px] opacity-40 hover:opacity-60"
                            )}
                          >
                            <p 
                              style={{ fontSize: `${i === currentLyricIndex ? lyricFontSize : lyricFontSize * 0.8}px` }}
                              className={cn(
                                "font-bold tracking-tight transition-all duration-500 leading-tight",
                                i === currentLyricIndex ? "text-white" : "text-white/80"
                              )}
                            >
                              {line.text}
                            </p>
                            {showTranslation && line.translation && (
                              <p 
                                style={{ fontSize: `${i === currentLyricIndex ? lyricFontSize * 0.6 : lyricFontSize * 0.5}px` }}
                                className={cn(
                                  "font-medium transition-all duration-500 leading-tight",
                                  i === currentLyricIndex ? "text-white/80" : "text-white/40"
                                )}
                              >
                                {line.translation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-white/40 italic text-2xl">
                        <Mic2 size={64} className="mb-6 opacity-20" />
                        <p>{currentSong.lyrics ? "Parsing lyrics..." : "No lyrics found for this song."}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="fixed top-0 left-64 right-0 bottom-24 z-40 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md animate-in fade-in duration-300">
                <Music2 size={64} className="mb-6 text-white/20 animate-pulse" />
                <p className="text-white/60 text-xl font-medium">No song playing</p>
                <button 
                  onClick={() => setShowLyrics(false)}
                  className="mt-8 px-6 py-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors text-sm"
                >
                  Go Back
                </button>
              </div>
            )
          ) : null}

          {view === 'songs' && (
            <>
              <h2 className="text-3xl font-bold mb-6">Songs</h2>
              <div className="space-y-1">
                {songs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-white/30">
                    <Music2 size={48} className="mb-4" />
                    <p>No songs found. Open a folder to start listening.</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-white/40 text-xs uppercase border-b border-white/5">
                        <th className="py-3 px-2 font-semibold">#</th>
                        <th className="py-3 px-2 font-semibold">Title</th>
                        <th className="py-3 px-2 font-semibold">Album</th>
                        <th className="py-3 px-2 font-semibold text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSongs.map((song, index) => (
                        <tr 
                          key={song.id}
                          onClick={() => playSong(song)}
                          className={cn(
                            "group hover:bg-white/5 transition-colors cursor-pointer",
                            currentSong?.id === song.id && "bg-white/10"
                          )}
                        >
                          <td className="py-3 px-2 text-white/40 w-10">{index + 1}</td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-white/10 rounded flex-shrink-0 overflow-hidden">
                                {song.cover ? (
                                  <img src={song.cover} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <Music2 className="w-full h-full p-2 text-white/20" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className={cn("font-medium truncate", currentSong?.id === song.id && "text-pink-500")}>
                                  {song.title}
                                </div>
                                <div className="text-xs text-white/40 truncate">{song.artist}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-white/40 text-sm truncate">{song.album}</td>
                          <td className="py-3 px-2 text-white/40 text-sm text-right">
                            {formatTime(song.duration)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}

          {view === 'artists' && !selectedArtist && (
            <>
              <h2 className="text-3xl font-bold mb-6">Artists</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                {artists.map(artist => (
                  <div 
                    key={artist.name}
                    onClick={() => setSelectedArtist(artist.name)}
                    className="group cursor-pointer"
                  >
                    <div className="aspect-square rounded-full overflow-hidden mb-3 bg-white/5 shadow-xl transition-transform group-hover:scale-105 duration-300 relative">
                      {artist.cover ? (
                        <img src={artist.cover} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Users size={64} className="text-white/10" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play size={32} fill="white" className="text-white" />
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold truncate">{artist.name}</div>
                      <div className="text-xs text-white/40">{artist.songCount} songs</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {view === 'artists' && selectedArtist && (
            <>
              <div className="flex items-center gap-4 mb-8">
                <button 
                  onClick={() => setSelectedArtist(null)}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors"
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className="text-3xl font-bold">{selectedArtist}</h1>
              </div>
              <div className="space-y-1">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-white/40 text-xs uppercase border-b border-white/5">
                      <th className="py-3 px-2 font-semibold">#</th>
                      <th className="py-3 px-2 font-semibold">Title</th>
                      <th className="py-3 px-2 font-semibold">Album</th>
                      <th className="py-3 px-2 font-semibold text-right">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {artistSongs.map((song, index) => (
                      <tr 
                        key={song.id}
                        onClick={() => playSong(song)}
                        className={cn(
                          "group hover:bg-white/5 transition-colors cursor-pointer",
                          currentSong?.id === song.id && "bg-white/10"
                        )}
                      >
                        <td className="py-3 px-2 text-white/40 w-10">{index + 1}</td>
                        <td className="py-3 px-2">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-white/10 rounded flex-shrink-0 overflow-hidden">
                              {song.cover ? (
                                <img src={song.cover} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Music2 className="w-full h-full p-2 text-white/20" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className={cn("font-medium truncate", currentSong?.id === song.id && "text-pink-500")}>
                                {song.title}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-2 text-white/40 text-sm truncate">{song.album}</td>
                        <td className="py-3 px-2 text-white/40 text-sm text-right">
                          {formatTime(song.duration)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {view === 'playlists' && (
            <div className="h-full flex flex-col items-center justify-center text-white/20">
              <ListMusic size={64} className="mb-4" />
              <h2 className="text-xl font-medium">Playlists Coming Soon</h2>
            </div>
          )}
        </div>
      </main>

      {/* Player Bar */}
      <footer className="fixed bottom-0 left-0 right-0 h-24 bg-[#252525]/80 backdrop-blur-xl border-t border-white/10 px-4 flex items-center z-50">
        {/* Current Song Info */}
        <div className="w-1/3 flex items-center gap-4">
          {currentSong && (
            <>
              <div className="w-14 h-14 bg-white/10 rounded shadow-lg overflow-hidden flex-shrink-0">
                {currentSong.cover ? (
                  <img src={currentSong.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Music2 className="w-full h-full p-3 text-white/20" />
                )}
              </div>
              <div className="min-w-0">
                <div className="font-bold truncate hover:underline cursor-pointer">{currentSong.title}</div>
                <div className="text-xs text-white/40 truncate hover:text-white/60 cursor-pointer">{currentSong.artist}</div>
              </div>
              <button className="text-white/40 hover:text-pink-500 transition-colors ml-2">
                <Heart size={18} />
              </button>
            </>
          )}
        </div>

        {/* Controls */}
        <div className="w-1/3 flex flex-col items-center gap-2">
          <div className="flex items-center gap-6">
            <button className="text-white/40 hover:text-white transition-colors">
              <Shuffle size={18} />
            </button>
            <button 
              onClick={skipBack}
              className="text-white/70 hover:text-white transition-colors"
            >
              <SkipBack size={24} fill="currentColor" />
            </button>
            <button 
              onClick={togglePlay}
              className="w-10 h-10 bg-white text-black rounded-full flex items-center justify-center hover:scale-105 transition-transform"
            >
              {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" className="ml-1" />}
            </button>
            <button 
              onClick={skipNext}
              className="text-white/70 hover:text-white transition-colors"
            >
              <SkipForward size={24} fill="currentColor" />
            </button>
            <button className="text-white/40 hover:text-white transition-colors">
              <Repeat size={18} />
            </button>
          </div>
          
          <div className="w-full flex items-center gap-3 text-[10px] text-white/40">
            <span>{formatTime(audioRef.current?.currentTime || 0)}</span>
            <input 
              type="range" 
              min="0" 
              max="100" 
              value={progress}
              onChange={handleSeek}
              className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-pink-500"
            />
            <span>{formatTime(audioRef.current?.duration || 0)}</span>
          </div>
        </div>

        {/* Volume & Extra */}
        <div className="w-1/3 flex items-center justify-end gap-4">
          <button 
            onClick={() => setShowLyrics(!showLyrics)}
            className={cn(
              "text-white/40 hover:text-white transition-colors p-2 rounded-md",
              showLyrics && "bg-white/10 text-pink-500"
            )}
          >
            <Mic2 size={18} />
          </button>
          <div className="flex items-center gap-2 w-32">
            <Volume2 size={18} className="text-white/40" />
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(parseFloat(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-white"
            />
          </div>
        </div>
      </footer>
    </div>
  )
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode, label: string, active?: boolean }) {
  return (
    <button className={cn(
      "w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm font-medium",
      active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
    )}>
      {icon}
      <span>{label}</span>
    </button>
  )
}
