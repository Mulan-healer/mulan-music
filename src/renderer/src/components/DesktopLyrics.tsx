import React, { useEffect, useState } from 'react'
import { X, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'

export default function DesktopLyrics() {
  const [song, setSong] = useState<any>(null)
  const [lyrics, setLyrics] = useState<{text: string, translation?: string}>({ text: 'Waiting for music...' })
  const [isPlaying, setIsPlaying] = useState(false)
  const [isHovered, setIsHovered] = useState(false)

  useEffect(() => {
    // Listen for lyric updates from main process
    const removeLyricListener = (window as any).api?.onLyricsUpdate?.((data: any) => {
      setLyrics(data)
    })

    // Listen for song updates
    // Assuming there might be a similar listener or we might need to poll/ask
    // For now just basic skeleton
    
    return () => {
      if (removeLyricListener) removeLyricListener()
    }
  }, [])

  return (
    <div 
      className="h-screen w-screen overflow-hidden bg-black/50 flex flex-col items-center justify-center relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ userSelect: 'none' }} // make it draggable via electron frame if configured
    >
      <div className="text-center p-8 space-y-4">
        <h1 
          className="text-4xl md:text-6xl font-black text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.8)] tracking-tight transition-all duration-300"
          style={{ 
            textShadow: '0 0 20px rgba(255,255,255,0.3)',
            WebkitTextStroke: '1px rgba(0,0,0,0.2)'
          }}
        >
          {lyrics.text || "..."}
        </h1>
        {lyrics.translation && (
          <p className="text-2xl text-white/80 font-bold drop-shadow-md">
            {lyrics.translation}
          </p>
        )}
      </div>

      {/* Controls Overlay */}
      <div className={`absolute bottom-8 flex gap-4 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
        <button className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all">
          <SkipBack size={24} />
        </button>
        <button 
          className="p-4 bg-pink-500 rounded-full text-white hover:bg-pink-600 transition-all shadow-lg"
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause size={28} /> : <Play size={28} />}
        </button>
        <button className="p-3 bg-white/10 backdrop-blur-md rounded-full text-white hover:bg-white/20 transition-all">
          <SkipForward size={24} />
        </button>
      </div>
      
      {/* Close/Minimize hint */}
      <div className={`absolute top-4 right-4 transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
         <button className="p-2 text-white/50 hover:text-white">
           <X size={20} />
         </button>
      </div>
    </div>
  )
}
