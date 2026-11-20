// The Overview's chat (owner, 2026-11-15: on the Overview the chat is the one place to type; decision 0015 says where
// it sits): the chat the Design deck draws (deck/DeckChat.tsx), so a talk, a brief's Build, layers dragged in and the
// project's next version go the same way, with what web/project.js say() adds on the Overview:
//   marks are drawn          the words go with the marks (Scribble: useScribble.ts send), words or none
//   a picture is selected    the words paint it again (POST /api/runs/:run/image)
//   an app project           the words change the app, in its App room (app/asking.ts), unless a page is selected
//   a page is selected       words about it change that page: the crew pick the section (POST …/comment)
//   anything else            the project's next version, which opens here, on the Overview
// The build's own lines (who took a change, a section done) come from its events, as on the deck.
import { useCallback, useEffect, useRef } from 'react'
import { toApp } from '@studio/route'
import type { ChatApi, ChatCommand, ChatProps } from '../../chat'
import { useNav } from '../../nav/NavProvider'
import { askOn } from '../app/asking'
import { DeckChat, type Say } from '../deck/DeckChat'
import { useDeckRun } from '../deck/source'
import { post, said } from './api'
import { skeletonBlocks, type Board, type Item } from './model'

// Play and Publish are in the top bar here; Export is the page's Download
const COMMANDS: ChatCommand[] = [{ name: 'export', what: 'Export the files' }]
const enc = encodeURIComponent
const nothing = (why: string) => `Nothing happened: ${(why || 'the studio server is not answering').replace(/\.$/, '')}.`

// where a layer is on screen (its chip's wire, spec 29): its page's artboard, cut to the layer's band; a shared
// layer (nav, footer) on the selected page or the first (web/project.js overviewRect)
function layerRect(board: Board | null, selected: Item | null, key: string) {
  const [pg, layer] = key.split('/')
  const id = pg === '*' ? selected?.page || board?.pages?.[0]?.id : pg
  const page = board?.pages?.find(p => p.id === id)
  const r = page && document.querySelector(`.ov-ab[data-key="${CSS.escape(`page:${page.id}`)}"]`)?.getBoundingClientRect()
  if (!page || !r) return null
  const band = skeletonBlocks(page).find(b => b.id === layer)
  return band ? { left: r.left, top: r.top + r.height * band.top, width: r.width, height: r.height * band.h } : r
}

// `marks`: the unsent Scribble marks: how many, Clear, and Send (false: the last ones are still going, nothing is taken)
export function OverviewChat({ run, board, selected, fill, onReload, onExport, api, marks }: {
  run: string | null, board: Board | null, selected: Item | null, fill?: ChatProps['fill'], onReload: () => void, onExport: () => void, api?: ChatApi,
  marks?: { n: number, label: string, clear: () => void, send: (text: string, say: Say) => Promise<boolean> }
}) {
  const { go } = useNav()
  const { model } = useDeckRun(run)

  // the build said something new (a change taken, a section done): the board is read again soon
  const told = useRef(0)
  useEffect(() => {
    const n = model.lines.length, was = told.current
    told.current = n
    if (!was || n <= was) return
    const t = setTimeout(onReload, 1500)
    return () => clearTimeout(t)
  }, [model.lines.length, onReload])

  const first = useCallback((text: string, say: Say) => {
    if (!run) return false
    if (marks?.n) { void marks.send(text, say).then(ok => { if (ok) setTimeout(onReload, 1500) }); return true }
    if (selected?.kind === 'art' && selected.art) {
      const a = selected.art
      say.you(text)
      post(`/api/runs/${enc(run)}/image`, { page: a.page, layer: a.layer, gen: a.gen, prompt: text })
        .then(() => { say.bot('Painting it again.'); setTimeout(onReload, 1500) })
        .catch(err => say.bot(nothing(said(err))))
      return true
    }
    if (toApp(board, selected?.kind)) { askOn(run, text); go({ type: 'room', room: 'app' }); return true }
    return false
  }, [run, board, selected, go, onReload, marks])

  return <DeckChat api={api} model={model} picked={null} room="overview" commands={COMMANDS} page={selected?.kind === 'page'} first={first} fill={fill}
    attached={marks?.n ? { label: marks.label, onClear: marks.clear } : null}
    layerRect={key => layerRect(board, selected, key)} onCommand={name => { if (name === 'export') onExport() }} />
}
