// The first BoardHost (host.ts): slice 1's, where every page is a live frame. A page's frame attaches itself when
// it mounts (attach), and this host carries its messages both ways; the live wishes are kept, so a host that does
// tiers can be swapped in without the screen changing.
import type { BoardHost, BoardItem, LiveReason, PageMessage, Tier } from './host'

export interface IframeHost extends BoardHost {
  // a page's frame, from when it mounts until it goes; returns the detach
  attach(id: string, frame: HTMLIFrameElement): () => void
  // the wishes held for a page (what a tier manager would weigh)
  wishes(id: string): ReadonlySet<LiveReason>
}

export function iframeHost(): IframeHost {
  let items: BoardItem[] = []
  const frames = new Map<string, HTMLIFrameElement>()
  const wishes = new Map<string, Set<LiveReason>>()
  const listeners = new Map<string, Set<(m: PageMessage) => void>>()
  const tierFns = new Set<(id: string, t: Tier) => void>()
  const tell = (id: string) => { for (const f of tierFns) f(id, frames.has(id) ? 'live' : 'hidden') }

  const onWindow = (e: MessageEvent) => {
    for (const [id, f] of frames) {
      if (e.source !== f.contentWindow) continue
      const m = e.data as PageMessage | null
      if (m && typeof m.type === 'string') for (const fn of listeners.get(id) ?? []) fn(m)
      return
    }
  }
  let listening = false
  const listen = () => { if (!listening && typeof window !== 'undefined') { addEventListener('message', onWindow); listening = true } }
  const unlisten = () => { if (listening && !frames.size) { removeEventListener('message', onWindow); listening = false } }

  return {
    place(next) { items = next },
    items: () => items,
    // a page whose frame is mounted is live; anything else is not drawn by this host
    tier: id => (frames.has(id) ? 'live' : 'hidden'),
    onTier(fn) { tierFns.add(fn); return () => { tierFns.delete(fn) } },
    requestLive(id, why) { (wishes.get(id) ?? wishes.set(id, new Set()).get(id)!).add(why) },
    releaseLive(id, why) { wishes.get(id)?.delete(why) },
    wishes: id => wishes.get(id) ?? new Set(),
    post(id, msg) {
      const w = frames.get(id)?.contentWindow
      if (!w) return false
      w.postMessage(msg, '*')
      return true
    },
    onMessage(id, fn) {
      const set = listeners.get(id) ?? listeners.set(id, new Set()).get(id)!
      set.add(fn)
      return () => { set.delete(fn) }
    },
    attach(id, frame) {
      frames.set(id, frame)
      listen()
      tell(id)
      return () => {
        if (frames.get(id) === frame) { frames.delete(id); tell(id) }
        unlisten()
      }
    }
  }
}
