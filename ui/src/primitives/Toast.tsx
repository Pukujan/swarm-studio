// One small toast at a time: what happened, and the one thing to do about it (Undo, Retry) when there is one.
// It says itself to a screen reader (role="status") and goes after 3 s, or 6 s when it has an action.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import { Icon } from './Icon'

export interface ToastOptions { icon?: string, action?: string, onAction?: () => void }
type Show = (text: string, options?: ToastOptions) => void
const ToastContext = createContext<Show>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<(ToastOptions & { text: string, n: number }) | null>(null)
  const n = useRef(0)
  const show = useCallback<Show>((text, options = {}) => setToast({ ...options, text, n: ++n.current }), [])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), toast.action ? 6000 : 3000)
    return () => clearTimeout(t)
  }, [toast])
  return (
    <ToastContext value={show}>
      {children}
      <div role="status" className="pointer-events-none fixed inset-x-4 bottom-6 z-50 flex justify-center">
        {toast && (
          <div key={toast.n} className="pointer-events-auto flex max-w-[min(560px,100%)] items-center gap-3 rounded-[12px] border border-line-2 bg-surface-2 py-2 pr-2 pl-4 text-sm text-text shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)]">
            {toast.icon && <Icon name={toast.icon} size={15} />}
            <span className="min-w-0">{toast.text}</span>
            {toast.action && <Button role="ghost" onPress={() => { setToast(null); toast.onAction?.() }}>{toast.action}</Button>}
          </div>
        )}
      </div>
    </ToastContext>
  )
}

export const useToast = () => useContext(ToastContext)
