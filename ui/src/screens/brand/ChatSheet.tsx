// A brand sheet opened from a chat's brief (docs/specs/31-brand-sheet.md; web/brand.js `open({ chat, brief, kind,
// done })`, web/canvas/talk.js's Brand sheet button), for the screen that chat is on:
//
//   const sheet = useChatSheet(api)
//   <Chat onBrandSheet={sheet.open} … />          the brief's Brand sheet button
//   {sheet.on && <div …>{sheet.board}</div>}      the sheet, in the place of the screen's own canvas
//
// The machine says the sheet is open (`brand`, with `from` the room it was opened from) and takes the person back
// (`back`: Lock, the breadcrumb's Chat, Esc). It keeps no chat (spec 34: the chat is not in the address), so which
// chat's brief the sheet is for is kept here, by the screen under it, for as long as the sheet is open; a reload
// shows that screen without the sheet, as in the classic Studio. The chat hears the answer when the sheet closes: its
// chat's id (made with the sheet, when the brief had none) and whether it was locked, and its button says so.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { chatApi } from '../../chat/api'
import type { ChatApi } from '../../chat'
import { useNav } from '../../nav/NavProvider'
import { Sheet } from './Sheet'
import { chatSheet, type SheetAsk } from './source'
import type { BrandView } from './types'

type Answer = { chat: string | null, locked: boolean }

function ChatSheet({ ask, api, onSheet }: { ask: SheetAsk, api: ChatApi, onSheet: (v: BrandView) => void }) {
  const { go } = useNav()
  const source = useMemo(() => chatSheet<BrandView>(ask, api), [ask, api])
  const back = useCallback(() => { go({ type: 'back' }) }, [go])
  // the keys go to the sheet once it is open (Esc leaves it), not to the brief's field the button was under
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { box.current?.querySelector<HTMLElement>('[role="region"]')?.focus() }, [])
  return <div ref={box} className="h-full"><Sheet source={source} name="Chat" onBack={back} onSheet={onSheet} fill /></div>
}

export function useChatSheet(api: ChatApi = chatApi): {
  // true while a chat's sheet is open over this screen
  on: boolean
  board: ReactNode
  open: (ask: SheetAsk) => Promise<Answer | void>
} {
  const { view, go } = useNav()
  const on = view.room === 'brand'
  const [ask, setAsk] = useState<SheetAsk | null>(null)
  const done = useRef<((a: Answer | void) => void) | null>(null)
  const last = useRef<Answer | null>(null)
  const answer = useCallback(() => { done.current?.(last.current ?? undefined); done.current = null; last.current = null }, [])

  const open = useCallback((e: SheetAsk) => new Promise<Answer | void>(resolve => {
    // a sheet asked for again while one is open: the first asker has its answer now
    answer()
    done.current = resolve
    setAsk({ chat: e.chat, brief: e.brief, kind: e.kind })
    // a move the machine does not have: no sheet, and the chat's button stays as it was
    if (!go({ type: 'brand' })) answer()
  }), [go, answer])

  // the sheet closed (Lock, Back, Esc, a build started, another room): the chat hears how it was left
  useEffect(() => { if (!on) { answer(); setAsk(null) } }, [on, answer])
  useEffect(() => answer, [answer])

  const heard = useCallback((v: BrandView) => { last.current = { chat: v.chat, locked: !!v.brand?.lockedAt } }, [])
  return { on, open, board: on && ask ? <ChatSheet ask={ask} api={api} onSheet={heard} /> : null }
}
