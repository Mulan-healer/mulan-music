import { useState, useEffect, useRef, useMemo } from 'react'
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, Search, 
  Home, Radio, LayoutGrid, Music2, Mic2, ListMusic, 
  FolderOpen, Heart, Repeat, Shuffle, ChevronLeft, Users
} from 'lucide-react'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { LyricsParser, type LyricLine } from './utils/LyricsParser'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

import DesktopLyrics from './components/DesktopLyrics'

function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-white/5 rounded-lg", className)} />
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-300 font-bold text-[15px]",
        active 
          ? "bg-white/10 text-white shadow-[0_10px_20px_rgba(0,0,0,0.2)] border border-white/5" 
          : "text-white/30 hover:bg-white/5 hover:text-white/60"
      )}
    >
      <div className={cn(
        "transition-colors",
        active ? "text-pink-500" : "text-inherit"
      )}>
        {icon}
      </div>
      <span>{label}</span>
      {active && (
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-pink-500 shadow-[0_0_10px_#EC4899]" />
      )}
    </button>
  )
}

export default function App() {
  const [isDesktopLyrics, setIsDesktopLyrics] = useState(window.location.hash === '#desktop-lyrics')

  useEffect(() => {
    const handleHashChange = () => {
      setIsDesktopLyrics(window.location.hash === '#desktop-lyrics')
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  if (isDesktopLyrics) {
    return <DesktopLyrics />
  }

  const [view, setView] = useState<'songs' | 'artists' | 'playlists'>('songs')
  const [selectedArtist, setSelectedArtist] = useState<string | null>(null)
  const [songs, setSongs] = useState<Song[]>([])
  const [isScanning, setIsScanning] = useState(false)
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

  const [isLoadingCovers, setIsLoadingCovers] = useState(false)

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
      if (data.isComplete) {
        setIsScanning(false)
      }
    })

    const loadLastFolder = async () => {
      const lastFolder = await (window as any).api.getLastFolder()
      if (lastFolder) {
        setSongs([]) // Clear current list for fresh scan
        setIsScanning(true)
        await (window as any).api.getSongs(lastFolder)
      }
    }
    loadLastFolder()

    return () => removeListener()
  }, [])

  // Optimized Progressive cover loading logic
  useEffect(() => {
    if (songs.length === 0 || isLoadingCovers) {
      if (songs.length === 0) setLoadedCoverCount(0)
      return
    }

    const startIdx = loadedCoverCount
    if (startIdx >= songs.length) return

    const timer = setTimeout(() => {
      const nextBatchSize = startIdx === 0 ? 10 : 30 // Reduced batch size for smoother UI
      const endIdx = Math.min(startIdx + nextBatchSize, songs.length)
      const batch = songs.slice(startIdx, endIdx)
      
      const loadBatchCovers = async () => {
        setIsLoadingCovers(true)
        const coverUpdates: Record<string, string> = {}
        
        try {
          // Process in parallel but update state once for the entire batch
          await Promise.all(batch.map(async (song) => {
            if (!song.cover && song.hasCover) {
              const cover = await (window as any).api.getSongCover(song.path)
              if (cover) {
                coverUpdates[song.id] = cover
              }
            }
          }))

          if (Object.keys(coverUpdates).length > 0) {
            setSongs(currentSongs => {
              // Only trigger state update if there are actual changes
              let changed = false
              const nextSongs = currentSongs.map(s => {
                if (coverUpdates[s.id]) {
                  changed = true
                  return { ...s, cover: coverUpdates[s.id] }
                }
                return s
              })
              return changed ? nextSongs : currentSongs
            })
          }
        } finally {
          setLoadedCoverCount(endIdx)
          setIsLoadingCovers(false)
        }
      }

      loadBatchCovers()
    }, startIdx === 0 ? 0 : 800) // Reduced delay between batches

    return () => clearTimeout(timer)
  }, [songs.length, loadedCoverCount, isLoadingCovers])

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
      setParsedLyrics(LyricsParser.parse(currentSong.lyrics))
    } else {
      setParsedLyrics([])
    }
    setCurrentLyricIndex(-1)
  }, [currentSong])

  useEffect(() => {
    if (currentLyricIndex !== -1 && parsedLyrics[currentLyricIndex]) {
      const currentLyric = parsedLyrics[currentLyricIndex]
      // @ts-ignore
      window.api.updateLyrics({
        text: currentLyric.text,
        translation: currentLyric.translation
      })
    }
  }, [currentLyricIndex, parsedLyrics])

  useEffect(() => {
    const updateOffset = () => {
      if (showLyrics && activeLyricRef.current && lyricsContainerRef.current) {
        const container = lyricsContainerRef.current
        const activeElement = activeLyricRef.current
        
        const containerHeight = container.clientHeight
        const activeTop = activeElement.offsetTop
        const activeHeight = activeElement.clientHeight
        
        const newOffset = (containerHeight * 0.4) - activeTop - (activeHeight / 2)
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
      setIsScanning(true)
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
        // Use URL constructor for safer path handling
        const audioUrl = `atom:///${song.path.replace(/\\/g, '/')}`
        
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
    <div className="relative h-screen bg-background text-white overflow-hidden select-none font-inter">
      <audio 
        ref={audioRef} 
        onTimeUpdate={handleTimeUpdate} 
        onEnded={skipNext}
        onError={(e) => console.error("Audio element error:", e)}
      />

      {/* Dynamic Background */}
      <div className="fixed inset-0 z-0">
        <div 
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-110 blur-[100px] opacity-20"
          style={{ backgroundImage: currentSong?.cover ? `url(${currentSong.cover})` : 'none' }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
      </div>

      <div className="relative z-10 flex h-full">
        {/* Floating Sidebar (Dock Style) */}
        <aside className="w-64 flex flex-col m-4 mr-0 glass-panel rounded-2xl overflow-hidden transition-all duration-500">
          <div className="p-6 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-10 px-2">
              <div className="w-10 h-10 bg-gradient-to-br from-pink-500 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-pink-500/20 animate-float">
                <Music2 size={24} className="text-white" />
              </div>
              <span className="font-outfit font-bold text-2xl tracking-tight text-gradient">Mulan</span>
            </div>

            <nav className="space-y-2">
              <NavItem icon={<Home size={20} />} label="Listen Now" active={view === 'songs' && !selectedArtist} onClick={() => { setView('songs'); setSelectedArtist(null); }} />
              <NavItem icon={<LayoutGrid size={20} />} label="Browse" />
              <NavItem icon={<Radio size={20} />} label="Radio" />
            </nav>

            <div className="mt-10">
              <h3 className="px-4 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Library</h3>
              <nav className="space-y-2">
                <NavItem 
                  icon={<Mic2 size={20} />} 
                  label="Artists" 
                  active={view === 'artists'} 
                  onClick={() => { setView('artists'); setSelectedArtist(null); }} 
                />
                <NavItem 
                  icon={<Music2 size={20} />} 
                  label="Songs" 
                  active={view === 'songs'} 
                  onClick={() => { setView('songs'); setSelectedArtist(null); }} 
                />
                <NavItem 
                  icon={<ListMusic size={20} />} 
                  label="Playlists" 
                  active={view === 'playlists'} 
                  onClick={() => { setView('playlists'); setSelectedArtist(null); }} 
                />
                <NavItem 
                  icon={<FolderOpen size={20} />} 
                  label="Open Folder" 
                  onClick={handleSelectFolder} 
                />
              </nav>
            </div>

            {currentSong && !showLyrics && (
              <div className="mt-auto group cursor-pointer relative pt-4">
                <div className="absolute inset-0 bg-white/5 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative glass-card p-3">
                  <div className="aspect-square w-full rounded-lg mb-3 overflow-hidden shadow-2xl">
                    {currentSong.cover ? (
                      <img src={currentSong.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                        <Music2 size={40} className="text-white/10" />
                      </div>
                    )}
                  </div>
                  <div className="px-1">
                    <div className="text-sm font-bold truncate text-white/90">{currentSong.title}</div>
                    <div className="text-xs text-white/40 truncate mt-0.5">{currentSong.artist}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          <header className="h-20 flex items-center justify-between px-8">
            <div className="relative w-96 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-pink-500 transition-colors" size={18} />
              <input 
                type="text" 
                placeholder="Search your library..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white/5 border border-white/5 rounded-2xl py-2.5 pl-12 pr-4 text-sm focus:bg-white/10 focus:border-pink-500/50 focus:ring-0 transition-all outline-none backdrop-blur-md"
              />
            </div>
            
            <div className="flex items-center gap-4">
              <button className="p-2.5 rounded-xl hover:bg-white/5 transition-colors text-white/60">
                <Heart size={20} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-8 pb-32 no-scrollbar">
            {currentSong && showLyrics && (
              <div className="fixed inset-0 z-[100] flex flex-col bg-background animate-in fade-in slide-in-from-bottom-8 duration-700 overflow-hidden">
                {/* Lyrics Background */}
                <div className="absolute inset-0 z-0">
                  <div 
                    className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-125 blur-[120px] opacity-40"
                    style={{ backgroundImage: currentSong.cover ? `url(${currentSong.cover})` : 'none' }}
                  />
                  <div className="absolute inset-0 bg-background/60" />
                </div>

                <header className="relative z-20 h-32 flex items-center justify-between px-16 flex-shrink-0">
                  <div className="flex items-center gap-8">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 group">
                      {currentSong.cover ? (
                        <img src={currentSong.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                      ) : (
                        <Music2 className="w-full h-full p-4 bg-white/5" />
                      )}
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-4xl font-outfit font-extrabold truncate max-w-2xl tracking-tight drop-shadow-2xl">{currentSong.title}</h2>
                      <p className="text-xl font-medium text-white/40 truncate drop-shadow-lg">{currentSong.artist}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowLyrics(false)}
                    className="p-4 rounded-full bg-white/5 hover:bg-white/10 transition-all border border-white/10 group"
                  >
                    <ChevronLeft size={32} className="group-hover:-translate-x-1 transition-transform" />
                  </button>
                </header>

                <div className={cn(
                  "absolute right-16 top-40 z-[110] flex flex-col glass-panel rounded-2xl transition-all duration-500 overflow-hidden w-14",
                  showSettings ? "max-h-[500px] opacity-100" : "max-h-14 opacity-100"
                )}>
                  <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="p-4 hover:bg-white/10 transition-colors text-white/60 hover:text-white flex items-center justify-center"
                  >
                    <LayoutGrid size={24} />
                  </button>
                  
                  <div className={cn(
                    "flex flex-col gap-3 p-2.5 transition-all duration-500",
                    showSettings ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8 pointer-events-none"
                  )}>
                    <button 
                      onClick={() => setShowTranslation(!showTranslation)}
                      className={cn(
                        "w-full py-3 rounded-xl transition-all text-sm font-bold flex items-center justify-center",
                        showTranslation ? "bg-pink-500 text-white shadow-lg shadow-pink-500/30" : "hover:bg-white/10 text-white/40"
                      )}
                    >
                      译
                    </button>
                    <div className="h-px bg-white/10 mx-2" />
                    <button 
                      onClick={() => setLyricFontSize(prev => Math.min(prev + 4, 80))}
                      className="w-full py-3 rounded-xl hover:bg-white/10 text-white/40 flex items-center justify-center font-bold"
                    >
                      A+
                    </button>
                    <button 
                      onClick={() => setLyricFontSize(prev => Math.max(prev - 4, 24))}
                      className="w-full py-3 rounded-xl hover:bg-white/10 text-white/40 flex items-center justify-center font-bold"
                    >
                      A-
                    </button>
                    <button 
                      onClick={() => setLyricAlign(lyricAlign === 'center' ? 'left' : 'center')}
                      className="w-full py-3 rounded-xl hover:bg-white/10 text-white/40 flex items-center justify-center text-[10px] font-black uppercase tracking-widest"
                    >
                      {lyricAlign === 'center' ? 'Left' : 'Cent'}
                    </button>
                  </div>
                </div>

                <div 
                  ref={lyricsContainerRef}
                  className="relative z-10 flex-1 overflow-y-hidden px-16 flex flex-col"
                >
                  <div 
                    className="transition-all duration-1000 ease-out"
                    style={{ transform: `translateY(${lyricOffset}px)` }}
                  >
                    {parsedLyrics.length > 0 ? (
                      <div className={cn(
                        "flex flex-col gap-12 py-[40vh]",
                        lyricAlign === 'center' ? 'items-center text-center' : 'items-start text-left'
                      )}>
                        {parsedLyrics.map((line, i) => (
                          <div 
                            key={i} 
                            ref={i === currentLyricIndex ? activeLyricRef : null}
                            className={cn(
                              "flex flex-col gap-3 transition-all duration-700 cursor-pointer group origin-left",
                              i === currentLyricIndex 
                                ? "scale-110 opacity-100" 
                                : "opacity-10 hover:opacity-30 blur-[1px] hover:blur-none"
                            )}
                            onClick={() => {
                              if (audioRef.current) audioRef.current.currentTime = line.time;
                            }}
                          >
                            <p 
                              style={{ fontSize: `${i === currentLyricIndex ? lyricFontSize : lyricFontSize * 0.85}px` }}
                              className={cn(
                                "font-syne font-black tracking-tighter transition-all duration-700 leading-[1.1] relative",
                                i === currentLyricIndex 
                                  ? "text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.4)]" 
                                  : "text-white/80"
                              )}
                            >
                              <span className={cn(
                                "relative z-10",
                                i === currentLyricIndex ? "text-gradient bg-gradient-to-r from-white via-white to-white/50" : ""
                              )}>
                                {line.text}
                              </span>
                              {i === currentLyricIndex && (
                                <span className="absolute -left-8 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-pink-500 shadow-[0_0_20px_#EC4899] animate-pulse" />
                              )}
                            </p>
                            {showTranslation && line.translation && (
                              <p 
                                style={{ fontSize: `${i === currentLyricIndex ? lyricFontSize * 0.55 : lyricFontSize * 0.45}px` }}
                                className={cn(
                                  "font-inter font-bold transition-all duration-700 leading-tight",
                                  i === currentLyricIndex ? "text-white/60" : "text-white/15"
                                )}
                              >
                                {line.translation}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="h-[80vh] flex flex-col items-center justify-center text-white/20">
                        <Mic2 size={120} className="mb-8 opacity-10 animate-pulse" />
                        <p className="text-2xl font-bold tracking-widest uppercase">No Lyrics Available</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className={cn("py-8", showLyrics && "hidden")}>
                {view === 'songs' && !selectedArtist && (
                  <>
                    <h2 className="text-4xl font-outfit font-black mb-8 text-gradient">Songs</h2>
                    <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
                      {isScanning && songs.length === 0 ? (
                        <div className="p-6 space-y-4">
                          {[...Array(8)].map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                              <Skeleton className="w-6 h-4" />
                              <Skeleton className="w-12 h-12 rounded-xl" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="w-1/3 h-4" />
                                <Skeleton className="w-1/4 h-3" />
                              </div>
                              <Skeleton className="w-24 h-4" />
                              <Skeleton className="w-12 h-4" />
                            </div>
                          ))}
                        </div>
                      ) : songs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-96 text-white/10">
                          <Music2 size={80} className="mb-6 opacity-20" />
                          <p className="text-xl font-medium">Your library is empty</p>
                          <button 
                            onClick={handleSelectFolder}
                            className="mt-6 px-6 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl text-white/60 text-sm font-bold transition-all border border-white/5"
                          >
                            Select Music Folder
                          </button>
                        </div>
                      ) : (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">
                              <th className="py-4 px-6 font-medium w-16">#</th>
                              <th className="py-4 px-6 font-medium">Title</th>
                              <th className="py-4 px-6 font-medium">Album</th>
                              <th className="py-4 px-6 font-medium w-20"><ListMusic size={14} /></th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredSongs.map((song, index) => (
                              <tr 
                                key={song.id} 
                                onClick={() => playSong(song)}
                                className={cn(
                                  "group cursor-pointer transition-all duration-300",
                                  currentSong?.id === song.id ? "bg-white/5" : "hover:bg-white/[0.02]"
                                )}
                              >
                                <td className="py-4 px-6 text-white/20 font-mono text-xs w-16">
                                  {currentSong?.id === song.id && isPlaying ? (
                                    <div className="flex items-end gap-0.5 h-3">
                                      <div className="w-0.5 bg-pink-500 animate-[music-bar_0.6s_ease-in-out_infinite]" />
                                      <div className="w-0.5 bg-pink-500 animate-[music-bar_0.8s_ease-in-out_infinite]" />
                                      <div className="w-0.5 bg-pink-500 animate-[music-bar_0.5s_ease-in-out_infinite]" />
                                    </div>
                                  ) : index + 1}
                                </td>
                                <td className="py-4 px-6">
                                  <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg border border-white/5 flex-shrink-0 group-hover:scale-110 transition-transform">
                                      {song.cover ? (
                                        <img src={song.cover} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                          <Music2 size={20} className="text-white/10" />
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <div className={cn(
                                        "font-bold truncate transition-colors",
                                        currentSong?.id === song.id ? "text-pink-500" : "text-white/90"
                                      )}>
                                        {song.title}
                                      </div>
                                      <div className="text-xs text-white/30 truncate mt-0.5 hover:text-white/60 transition-colors">{song.artist}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-4 px-6 text-sm text-white/30 truncate max-w-[200px] font-medium">{song.album}</td>
                                <td className="py-4 px-6 text-xs text-white/20 font-mono">{formatTime(song.duration)}</td>
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
                    <h2 className="text-4xl font-outfit font-black mb-8 text-gradient">Artists</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
                      {isScanning && artists.length === 0 ? (
                        [...Array(12)].map((_, i) => (
                          <div key={i} className="space-y-4">
                            <Skeleton className="aspect-square rounded-[2rem]" />
                            <Skeleton className="w-2/3 h-5" />
                            <Skeleton className="w-1/3 h-3" />
                          </div>
                        ))
                      ) : artists.map(artist => (
                        <div 
                          key={artist.name}
                          onClick={() => {
                            setSelectedArtist(artist.name)
                            setView('artists')
                          }}
                          className="group cursor-pointer"
                        >
                          <div className="aspect-square rounded-[2rem] overflow-hidden mb-4 shadow-2xl transition-all duration-500 group-hover:-translate-y-2 group-hover:shadow-pink-500/10 border border-white/5">
                            {artist.cover ? (
                              <img src={artist.cover} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                            ) : (
                              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                <Users size={40} className="text-white/10" />
                              </div>
                            )}
                          </div>
                          <div className="px-2">
                            <div className="font-bold text-white/90 group-hover:text-pink-500 transition-colors truncate">{artist.name}</div>
                            <div className="text-xs text-white/30 mt-1">{artist.songCount} songs</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {view === 'artists' && selectedArtist && (
                  <>
                    <div className="flex items-center gap-6 mb-12">
                      <button 
                        onClick={() => setSelectedArtist(null)}
                        className="p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-all border border-white/5 group"
                      >
                        <ChevronLeft size={24} className="group-hover:-translate-x-1 transition-transform" />
                      </button>
                      <h2 className="text-5xl font-outfit font-black text-gradient">{selectedArtist}</h2>
                    </div>
                    <div className="glass-panel rounded-3xl overflow-hidden border border-white/5">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-white/5 text-[10px] font-bold text-white/20 uppercase tracking-[0.2em]">
                            <th className="py-4 px-6 font-medium w-16">#</th>
                            <th className="py-4 px-6 font-medium">Title</th>
                            <th className="py-4 px-6 font-medium">Album</th>
                            <th className="py-4 px-6 font-medium w-20"><ListMusic size={14} /></th>
                          </tr>
                        </thead>
                        <tbody>
                          {artistSongs.map((song, index) => (
                            <tr 
                              key={song.id} 
                              onClick={() => playSong(song)}
                              className={cn(
                                "group cursor-pointer transition-all duration-300",
                                currentSong?.id === song.id ? "bg-white/5" : "hover:bg-white/[0.02]"
                              )}
                            >
                              <td className="py-4 px-6 text-white/20 font-mono text-xs w-16">
                                {currentSong?.id === song.id && isPlaying ? (
                                  <div className="flex items-end gap-0.5 h-3">
                                    <div className="w-0.5 bg-pink-500 animate-[music-bar_0.6s_ease-in-out_infinite]" />
                                    <div className="w-0.5 bg-pink-500 animate-[music-bar_0.8s_ease-in-out_infinite]" />
                                    <div className="w-0.5 bg-pink-500 animate-[music-bar_0.5s_ease-in-out_infinite]" />
                                  </div>
                                ) : index + 1}
                              </td>
                              <td className="py-4 px-6">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg border border-white/5 flex-shrink-0 group-hover:scale-110 transition-transform">
                                    {song.cover ? (
                                      <img src={song.cover} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                        <Music2 size={20} className="text-white/10" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <div className={cn(
                                      "font-bold truncate transition-colors",
                                      currentSong?.id === song.id ? "text-pink-500" : "text-white/90"
                                    )}>
                                      {song.title}
                                    </div>
                                    <div className="text-xs text-white/30 truncate mt-0.5">{song.artist}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="py-4 px-6 text-sm text-white/30 truncate max-w-[200px] font-medium">{song.album}</td>
                              <td className="py-4 px-6 text-xs text-white/20 font-mono">{formatTime(song.duration)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
            </div>
          </div>

        </main>

      {/* Dynamic Island Player Bar */}
      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-5xl z-[120] transition-all duration-500">
        <div className="glass-panel rounded-[2rem] p-3 px-6 flex items-center gap-6 shadow-[0_30px_60px_rgba(0,0,0,0.5)] border border-white/10 group/player">
          {/* Current Song Info */}
          <div className="flex-1 flex items-center gap-4 min-w-0">
            {currentSong ? (
              <>
                <div 
                  className="w-14 h-14 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0 cursor-pointer group/cover"
                  onClick={() => setShowLyrics(!showLyrics)}
                >
                  {currentSong.cover ? (
                    <img src={currentSong.cover} alt="" className="w-full h-full object-cover group-hover/cover:scale-110 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                      <Music2 size={24} className="text-white/20" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[15px] truncate hover:text-pink-500 transition-colors cursor-pointer" onClick={() => setShowLyrics(true)}>
                    {currentSong.title}
                  </div>
                  <div className="text-xs text-white/30 font-bold truncate hover:text-white/50 transition-colors cursor-pointer">{currentSong.artist}</div>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/5 flex items-center justify-center">
                  <Music2 size={24} className="text-white/10" />
                </div>
                <div className="text-white/20 text-sm font-bold uppercase tracking-widest">Idle</div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col items-center gap-2 px-4 border-x border-white/5">
            <div className="flex items-center gap-6">
              <button className="text-white/20 hover:text-white transition-colors">
                <Shuffle size={18} />
              </button>
              <button 
                onClick={skipBack}
                className="text-white/40 hover:text-white transition-all hover:scale-110 active:scale-90"
              >
                <SkipBack size={22} fill="currentColor" />
              </button>
              <button 
                onClick={togglePlay}
                className="w-12 h-12 btn-primary rounded-full flex items-center justify-center group/play"
              >
                {isPlaying ? (
                  <Pause size={24} fill="currentColor" />
                ) : (
                  <Play size={24} fill="currentColor" className="ml-1 group-hover/play:scale-110 transition-transform" />
                )}
              </button>
              <button 
                onClick={skipNext}
                className="text-white/40 hover:text-white transition-all hover:scale-110 active:scale-90"
              >
                <SkipForward size={22} fill="currentColor" />
              </button>
              <button className="text-white/20 hover:text-white transition-colors">
                <Repeat size={18} />
              </button>
            </div>
            
            <div className="w-80 flex items-center gap-3 text-[10px] font-mono text-white/20">
              <span className="w-10 text-right">{formatTime(audioRef.current?.currentTime || 0)}</span>
              <div className="flex-1 relative h-6 flex items-center group/seek">
                <div className="absolute inset-0 h-1 bg-white/5 rounded-full my-auto" />
                <div 
                  className="absolute inset-y-0 h-1 bg-gradient-to-r from-pink-500 to-violet-500 rounded-full my-auto shadow-[0_0_10px_rgba(236,72,153,0.3)]"
                  style={{ width: `${progress}%` }}
                />
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  step="0.1"
                  value={progress}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div 
                  className="absolute w-3 h-3 bg-white rounded-full my-auto shadow-xl scale-0 group-hover/seek:scale-100 transition-transform pointer-events-none"
                  style={{ left: `calc(${progress}% - 6px)` }}
                />
              </div>
              <span className="w-10">{formatTime(audioRef.current?.duration || 0)}</span>
            </div>
          </div>

          {/* Extra Controls */}
          <div className="flex-1 flex items-center justify-end gap-6">
            <button 
              onClick={() => setShowLyrics(!showLyrics)}
              className={cn(
                "p-3 rounded-2xl transition-all",
                showLyrics ? "bg-pink-500 text-white shadow-lg shadow-pink-500/20" : "text-white/20 hover:bg-white/5 hover:text-white"
              )}
            >
              <Mic2 size={20} />
            </button>
            <div className="flex items-center gap-3 group/volume">
              <div className="relative w-24 h-6 flex items-center">
                <div className="absolute inset-0 h-1 bg-white/5 rounded-full my-auto" />
                <div 
                  className="absolute inset-y-0 h-1 bg-white/40 rounded-full my-auto group-hover/volume:bg-white transition-colors"
                  style={{ width: `${volume * 100}%` }}
                />
                <input 
                  type="range" 
                  min="0" 
                  max="1" 
                  step="0.01"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
              </div>
              <Volume2 size={18} className="text-white/20 group-hover/volume:text-white transition-colors" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
  )
}
