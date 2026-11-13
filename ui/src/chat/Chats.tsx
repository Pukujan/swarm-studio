// Chats (spec 29, web/canvas/talk.js): the project's chats grouped Design, App, Game, Video; outside a project, the
// loose ones. One opens in the chat where it left off; a row dragged onto another group moves it there. New chat
// starts an empty talk (in the project when one is open). ×, Esc and a click outside close it (RULES.md rule 18).
import { useState } from 'react'
import { Button as AriaButton, Dialog, DialogTrigger, Popover } from 'react-aria-components'
import { Button } from '../primitives/Button'
import { getJson, postJson } from './api'
import type { ChatApi } from './types'

type Row = { id: string, title: string, state?: string }
type Group = { name: string, chats: Row[] }
const GROUPS = ['Design', 'App', 'Game', 'Video']
const DRAG = 'text/x-swarm-chat'

export function Chats({ api, project, from, current, onOpen, onNew }: { api: ChatApi, project: string | null, from: string | null, current: string | null, onOpen: (id: string) => void, onNew: () => void }) {
  const [list, setList] = useState<{ pid: string | null, groups: Group[] } | null>(null)
  const [dragging, setDragging] = useState(false)
  async function load() {
    setList(null)
    const j = await getJson<{ project?: string, groups?: Group[], chats?: Row[] }>(api, project ? `/api/projects/${encodeURIComponent(project)}/chats` : `/api/chats${from ? `?run=${encodeURIComponent(from)}` : ''}`) || {}
    const pid = project || j.project || null
    setList({ pid, groups: pid ? (j.groups || []) : [{ name: '', chats: j.chats || [] }] })
  }
  // a row onto another group: it moves there now, and the server is told
  function move(id: string, to: string) {
    if (!list) return
    const row = list.groups.flatMap(g => g.chats).find(c => c.id === id)
    if (!row) return
    const groups = GROUPS.map(n => ({ name: n, chats: (list.groups.find(g => g.name === n)?.chats || []).filter(c => c.id !== id) }))
    groups.find(g => g.name === to)?.chats.push(row)
    setList({ ...list, groups })
    void postJson(api, `/api/chats/${encodeURIComponent(id)}`, { category: to }).catch(() => null)
  }
  const names = list?.pid ? GROUPS : ['']
  return (
    <DialogTrigger onOpenChange={open => { if (open) void load() }}>
      <AriaButton className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[8px] border-0 bg-transparent px-3 font-monospace text-xs text-muted outline-none data-[hovered]:text-text data-[pressed]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:outline-frame-hi">Chats<span aria-hidden className="text-[10px]">▾</span></AriaButton>
      <Popover placement="bottom start" offset={6} className="w-[280px] rounded-[12px] border border-edge bg-surface-2 p-1.5 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)] outline-none">
        <Dialog aria-label="Chats" className="relative outline-none">
          {({ close }) => (
            <>
              <Button role="ghost" aria-label="Close" onPress={close} className="absolute top-0 right-0 min-h-8 min-w-8 px-2">×</Button>
              {!list && <p role="status" aria-busy="true" className="wait-in m-2 h-16 rounded-[8px] bg-panel-2 motion-safe:animate-pulse" aria-label="Loading the chats" />}
              {list && names.map(n => {
                const rows = list.groups.find(g => g.name === n)?.chats || []
                // every group is a place to drop a chat, so the four show while dragging
                if (!rows.length && !dragging) return null
                return (
                  <section key={n || 'loose'} aria-label={n || 'Chats'} className={`${!rows.length ? 'my-1 min-h-9 rounded-[8px] border border-dashed border-line-2' : ''}`}
                    onDragOver={e => { if (list.pid && n && e.dataTransfer.types.includes(DRAG)) e.preventDefault() }}
                    onDrop={e => { const id = e.dataTransfer.getData(DRAG); if (!id || !n) return; e.preventDefault(); move(id, n) }}>
                    {n && <h4 className="mx-2 mt-2 mb-1 font-label text-[11px] font-semibold uppercase tracking-[.12em] text-muted">{n}</h4>}
                    {rows.map(c => (
                      <button key={c.id} type="button" draggable={!!list.pid}
                        onDragStart={e => { e.dataTransfer.setData(DRAG, c.id); setDragging(true) }} onDragEnd={() => setDragging(false)}
                        onClick={() => { close(); onOpen(c.id) }}
                        className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 px-2 text-left font-monospace text-sm text-text outline-none hover:bg-panel-2 focus-visible:bg-panel-2 focus-visible:outline-2 focus-visible:outline-frame-hi ${current === c.id ? 'bg-panel-2' : 'bg-transparent'}`}
                        aria-current={current === c.id || undefined}>
                        <span className="min-w-0 flex-1 truncate">{c.title}</span>
                        {c.state === 'locked' && <small className="text-[11px] text-muted">Locked</small>}
                      </button>
                    ))}
                  </section>
                )
              })}
              {list && (
                <button type="button" onClick={() => { close(); onNew() }}
                  className="mt-1 flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-[8px] border-0 border-t border-line bg-transparent px-2 text-left font-monospace text-sm text-muted outline-none hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-frame-hi">
                  <span aria-hidden>+</span><span>New chat</span>
                </button>
              )}
            </>
          )}
        </Dialog>
      </Popover>
    </DialogTrigger>
  )
}
