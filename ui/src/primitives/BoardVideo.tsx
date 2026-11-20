// A video on a board, in the chat or in a room (image-first boards §3.6): its poster frame until it is played,
// hovered or focused (an `auto` clip: while it is on screen), preload="metadata", torn down when it leaves the
// screen or loses focus, and at most 2 playing in the page (1 on a low-memory machine). The rules are
// web/video.js (@studio/video), the file the current Studio runs, so the two apps share one budget.
import { useEffect, useRef, type CSSProperties, type RefObject } from 'react'
import { boardVideo, dropVideo } from '@studio/video'

export function BoardVideo({ src, poster, auto = false, label, className, style, ref: outer }: {
  src: string
  // the clip's poster frame; by default the one the server writes beside it (<clip>.poster.jpg)
  poster?: string
  // plays by itself, muted and looping, while on screen; otherwise it waits to be played and has controls
  auto?: boolean
  label?: string
  className?: string
  style?: CSSProperties
  // the player itself, for a room that plays it or reads where it is (the Film studio's Big screen)
  ref?: RefObject<HTMLVideoElement | null>
}) {
  const own = useRef<HTMLVideoElement>(null)
  const ref = outer ?? own
  useEffect(() => {
    const v = ref.current
    if (!v) return
    boardVideo(v, { src, poster, auto })
    return () => dropVideo(v)
  }, [src, poster, auto, ref])
  return <video ref={ref} className={className} style={style} aria-label={label} muted={auto} loop={auto} controls={!auto} playsInline preload="metadata" />
}
