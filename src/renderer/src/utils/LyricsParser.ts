export interface LyricLine {
  time: number
  text: string
  translation?: string
}

export const LyricsParser = {
  parse(lrc: string): LyricLine[] {
    if (!lrc) return []

    // Normalize line endings and split
    const lines = lrc.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const result: LyricLine[] = []
    
    // Standard LRC format: [mm:ss.xx] or [mm:ss.xxx] or [mm:ss]
    const timeExp = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\]/g

    for (const line of lines) {
      // Reset lastIndex for the new string match
      timeExp.lastIndex = 0
      const matches = [...line.matchAll(timeExp)]
      
      if (matches.length > 0) {
        const text = line.replace(timeExp, '').trim()
        
        // Skip empty lines unless they might be instrumental markers
        if (!text) continue

        matches.forEach(match => {
          const minutes = parseInt(match[1])
          const seconds = parseInt(match[2])
          // Handle milliseconds: .xx (hundredths) or .xxx (milliseconds)
          const rawMs = match[3] || '0'
          const milliseconds = rawMs.length === 2 ? parseInt(rawMs) * 10 : parseInt(rawMs)
          
          const time = minutes * 60 + seconds + milliseconds / 1000
          
          result.push({
            time,
            text
          })
        })
      }
    }

    // Sort by time
    result.sort((a, b) => a.time - b.time)

    // Merge translation lines
    const mergedResult: LyricLine[] = []
    
    // Check if we have potential translations (duplicate timestamps with different text)
    for (let i = 0; i < result.length; i++) {
      const current = result[i]
      
      // Look ahead for the same timestamp or very close timestamp (within 0.1s)
      if (i < result.length - 1) {
        const next = result[i + 1]
        
        // If timestamps are essentially the same
        if (Math.abs(next.time - current.time) < 0.1) {
          // Simplest strategy: first line is original, second is translation
          current.translation = next.text
          mergedResult.push(current)
          i++ // Skip next line as we merged it
          continue
        }
      }
      
      mergedResult.push(current)
    }

    return mergedResult
  }
}