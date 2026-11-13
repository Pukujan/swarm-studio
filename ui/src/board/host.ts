// The board's host (decision 0014, spec 43): what a board screen (the Design deck, the Overview) asks of whatever
// draws its pages, so the screen never draws them itself. A page is a photo of itself unless it is live; the host
// decides each item's tier, and holds the 2–3 live pages, sandboxed iframes with allow-scripts only.
//
//   host.place(items)                  the board's items and where they are, in the board's own units
//   host.tier(id) / host.onTier(fn)    what an item is now: hidden, tiny photo, sharp photo, live
//   host.requestLive(id, why)          the person picked it, an agent is writing it, it is being edited
//   host.releaseLive(id, why)          that reason is over (the host may keep it live for another one)
//   host.post(id, msg)                 a message to a live page; false when it is not live (nothing is queued)
//   host.onMessage(id, fn)             what a live page says (web/frame.html: ready, geo, snap…)
//
// The first host is slice 1's: every page is a live frame (iframeHost.ts). The tier manager (feat/tier-manager,
// TierManager.plan) is the second: requestLive and releaseLive become its wants (selected, agents), and its
// decisions are the tiers reported here.
import { createContext, useContext } from 'react'

export type Tier = 'hidden' | 'tiny' | 'sharp' | 'live'
// why a page should be live; the host keeps one wish per reason, and an agent's work comes before browsing
export type LiveReason = 'selected' | 'agent' | 'edit' | 'review'

export interface BoardItem {
  id: string
  kind: 'page' | 'image' | 'video' | 'note'
  // in the board's own units (what the camera's k scales)
  rect: { x: number, y: number, w: number, h: number }
}

// what a page says: web/frame.html's messages ({ type: 'ready' }, { type: 'geo', … }) or a capture's
export interface PageMessage { type: string, [k: string]: unknown }

export interface BoardHost {
  place(items: BoardItem[]): void
  items(): BoardItem[]
  tier(id: string): Tier
  onTier(fn: (id: string, tier: Tier) => void): () => void
  requestLive(id: string, why: LiveReason): void
  releaseLive(id: string, why: LiveReason): void
  post(id: string, msg: PageMessage): boolean
  onMessage(id: string, fn: (msg: PageMessage) => void): () => void
}

export const BoardHostContext = createContext<BoardHost | null>(null)

// the board's host; a screen outside one (a story of a panel) gets none and draws no pages
export const useBoardHost = () => useContext(BoardHostContext)
