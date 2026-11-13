// One toast spot (web/board.js's): a short line for three seconds, read out as a status
import { useCallback, useRef, useState } from 'react'

export function useToast(): [React.ReactNode, (text: string) => void] {
  const [text, setText] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const show = useCallback((t: string) => {
    clearTimeout(timer.current)
    setText(t)
    timer.current = setTimeout(() => setText(null), 3000)
  }, [])
  return [text ? <div className="hm-toast" role="status">{text}</div> : null, show]
}
