// The Game room (docs/ux/OBJECTS.md; SITEMAP §10), the screen: a game at ?version=<run>&room=game, and a game build's
// App room (?room=app, handed over by app/AppWall.tsx). Ported from web/canvas/rooms.js as it is: where the person is
// comes from the machine; the game from the same routes the classic room calls (game/source.ts), loaded once and
// kept up to date from the stream: an app:* event for this run reads its state again, the art plan and the Map are
// read again every 4 s while the build works or they are on the stage. While the game shows, the server is told a
// viewer is here every 30 s, so the game is not stopped under them (decision 0017).
// The chat is the room's one box (web/canvas/loop.js, in this order): the switch typed ("show the art", "play it for
// me"), an answer to a waiting slice ("fix it", "go on", a note), a question to the crew while it builds, "go on" at
// a stopped build, or one more change to a finished game.
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { autoplayAsk } from '@studio/autoplay'
import { playFail, stageAsk, stageNone, stageNow, stagePick, type StageView } from '@studio/stage'
import { goOnAsk, noAppYet, sliceSay, sliceWords } from '@studio/wander'
import { Chat, type ChatCommand, type ChatLine } from '../chat'
import { useNav } from '../nav/NavProvider'
import { useToast } from '../primitives/Toast'
import { useTrail } from '../shell/Trail'
import type { RunEvent } from './app/model'
import { crew } from './deck/crew'
import { doneSections } from './deck/model'
import { useDeckRun } from './deck/source'
import { ChangeCard, MediaCard, SliceCard } from './game/GameCards'
import { GAME_WINDOWS, GameRoomView, type Said } from './game/GameRoomView'
import { saidYes, saysBroken, sliceKey, stageBuild, type GameModel, type GameSlice, type GameState } from './game/model'
import { GameSourceContext } from './game/source'
import { GameStart } from './game/start/GameStart'
import { sayOnOpen, takeSay } from './game/start/opened'
import { useAutoplay } from './game/useAutoplay'

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const oops = (err: unknown) => String((err as Error)?.message || err)
// the room's commands (web/canvas/loop.js SLASH, the two that start a game or its cast)
const COMMANDS: ChatCommand[] = [
  { name: 'game', arg: '[idea]', what: 'make an original browser game: a few questions, then it builds' },
  { name: 'cast', what: 'make characters from pictures, with Meshy' }
]

export function GameRoom() {
  const { view, go } = useNav()
  const run = view.run || view.version
  // the questions a new game starts with (start/GameStart.tsx), or the Cast step on its own for this build (/cast)
  const [start, setStart] = useState<null | { idea?: string, cast?: boolean }>(null)
  const opened = useRef<Record<string, string>>({})
  const source = useContext(GameSourceContext)
  const [model, setModel] = useState<GameModel | null>(null)
  const at = useRef<GameModel | null>(null)
  at.current = model
  // the view pinned in the bar's switch (null: the stage follows the build), and Preview or Code
  const [pin, setPin] = useState<StageView | null>(null)
  const [mode, setMode] = useState<'preview' | 'code'>('preview')
  // the game's server being started again, and whether the last try failed
  const [opening, setOpening] = useState(false)
  const [openErr, setOpenErr] = useState('')
  const openFailed = !!openErr
  const [reload, setReload] = useState(0)
  const [said, setSaid] = useState<Said>(null)
  // what was said in the room's chat here: the person's words, the answers and their cards
  const [lines, setLines] = useState<ChatLine[]>([])
  const line = useCallback((who: ChatLine['who'], text: string, more: Partial<ChatLine> = {}) => setLines(ls => [...ls, { id: `${Date.now()}:${ls.length}`, at: Date.now(), who, text, ...more }]), [])
  const hermia = useCallback((text: string, more: Partial<ChatLine> = {}) => line('hermia', text, more), [line])
  const toast = useToast()
  // the design a game made from a site comes from: a change sends its finished sections, as the classic appAsk does;
  // the chat shows the build's own lines too (the crew in its shade; the build's news in the Log)
  const { model: deck } = useDeckRun(run ?? null)
  const feed = useMemo(() => {
    const all = [...deck.lines.map(l => ({ ...l, ...(l.who === 'crew' && l.name ? { color: crew().color(l.name) } : {}) }) as ChatLine), ...lines].sort((a, b) => a.at - b.at)
    return { lines: all.filter(l => l.who !== 'sys'), log: all.filter(l => l.who === 'sys' || l.who === 'err') }
  }, [deck.lines, lines])

  const filePath = useRef<string | null>(null)
  const readFile = useCallback((path: string | null) => {
    if (!run) return
    filePath.current = path
    if (!path) return setModel(m => (m ? { ...m, file: null } : m))
    source.file(run, path).then(f => { if (filePath.current === path) setModel(m => (m ? { ...m, file: f } : m)) }).catch(() => {})
  }, [run, source])

  // ---------- the stage
  const now = useMemo(() => (model ? stageNow(stageBuild(model, { opening, failed: openFailed }), pin) : null), [model, opening, openFailed, pin])
  // a pin holds only while its view is offered: once it is gone the stage follows the build again
  useEffect(() => { if (now && pin && now.pin !== pin) setPin(null) }, [now, pin])
  const shown = now?.shown, working = model?.app.state === 'working'

  // ---------- a waiting slice's card in the chat, once per slice
  const sliceDrawn = useRef(new Set<string>())
  const acts = useRef({ live: () => {}, slice: (_text: string) => {} })
  const sliceCard = useCallback((s: GameSlice | null | undefined, app: GameState) => {
    if (!s || !run || sliceDrawn.current.has(sliceKey(run, s))) return
    sliceDrawn.current.add(sliceKey(run, s))
    const w = sliceWords(s, app.result, app.steps)
    hermia(w.ask, { card: <SliceCard slice={s} words={w} onLive={() => acts.current.live()} onIdea={t => acts.current.slice(t)} /> })
  }, [run, hermia])

  // ---------- the game, loaded and kept up to date
  useEffect(() => {
    if (!run) return
    let live = true, again = 0
    setModel(null); setPin(null); setMode('preview'); setOpening(false); setOpenErr(''); setSaid(null); setLines([])
    sliceDrawn.current = new Set()
    // a build started from the questions: what it is, said once it opens here
    opened.current[run] ||= takeSay(run)
    if (opened.current[run]) hermia(opened.current[run])
    const refresh = (wait = 300) => {
      clearTimeout(again)
      again = window.setTimeout(() => {
        Promise.all([source.state(run), source.part(run).catch(() => null), source.files(run).catch(() => ({ files: [] }))]).then(([app, part, f]) => {
          if (!live) return
          setModel(m => (m ? { ...m, app, part, files: f.files } : m))
          if (app.state === 'paused') sliceCard(app.slice, app)
        }).catch(() => {})
      }, wait)
    }
    Promise.all([source.state(run), source.events(run).catch(() => [] as RunEvent[]), source.assets(run).catch(() => ({ sheet: [] })), source.map(run).catch(() => null), source.part(run).catch(() => null), source.files(run).catch(() => ({ files: [] }))]).then(([app, events, assets, map, part, f]) => {
      if (!live) return
      const start = events.find(e => e.type === 'run:start')
      const agents = Array.isArray(start?.agents) ? (start.agents as { name?: string }[]).map(x => str(x.name)).filter(Boolean) : []
      setModel({ run, title: (app.name || str(start?.title) || str(start?.brief)).slice(0, 60), crew: agents.slice(0, 4), app, sheet: assets.sheet || [], map, part, files: f.files, file: null })
      // the slice a build waits on now is drawn from its state (a reload replays no old pause's card)
      if (app.state === 'paused') sliceCard(app.slice, app)
      const writing = [...(app.steps || [])].reverse().find(s => s.kind === 'write' && s.file)?.text
      if (writing) readFile(writing)
    }).catch(err => { if (live) toast(`The game could not be read: ${oops(err)}`) })
    const stop = source.stream?.(e => {
      if (e.run !== run) return
      if (e.type === 'autoplay') return void auto.current.event(e as { run?: string, on?: boolean, live?: boolean, say?: string, line?: string })
      if (!e.type.startsWith('app:')) return
      const fresh = !e.t || Date.now() - e.t < 8000
      // a new build: the stage follows it again
      if (e.type === 'app:start') { setPin(null); setOpenErr('') }
      const step = e.type === 'app:step' ? e.step as { kind?: string, file?: boolean, text?: string } : null
      if (step?.kind === 'write' && step.file && step.text) readFile(step.text)
      // the build's news, as the classic room says it (the Log)
      if (fresh && e.type === 'app:start') line('sys', `🧩 ${str(e.model) || 'the engine'} is ${e.fresh ? 'building the game' : 'changing the game'}${e.ask ? `: “${str(e.ask)}”` : ''}`)
      if (fresh && e.type === 'app:done') { const r = e.result as { turns?: number, gatesPassed?: boolean } | undefined; line('sys', `🧩 the game is ready (${r?.turns || 1} turn${r?.turns === 1 ? '' : 's'}, checks ${r?.gatesPassed ? 'passed' : 'not passed'}, ${Math.round((Number(e.ms) || 0) / 1000)}s). Play it here, or chat to change it.`) }
      if (fresh && e.type === 'app:failed') line('err', `🧩 game: ${str(e.message)}`)
      // served again on the same address (a new build, or built now): the frame loads it again
      if (e.type === 'app:done' || (e.type === 'app:ready' && e.built)) setReload(n => n + 1)
      refresh(e.type === 'app:step' ? 300 : 0)
    })
    return () => { live = false; clearTimeout(again); stop?.() }
  }, [run, source, readFile, sliceCard, line, hermia, toast])

  // the art plan and the Map: read again every 4 s while the build works or they are on the stage
  const poll = !!model && (working || shown === 'art' || shown === 'map')
  useEffect(() => {
    if (!run || !poll) return
    const t = window.setInterval(() => {
      if (document.hidden) return
      source.assets(run).then(d => setModel(m => (m && m.run === run ? { ...m, sheet: d.sheet || m.sheet } : m))).catch(() => {})
      source.map(run).then(map => setModel(m => (m && m.run === run ? { ...m, map: map || m.map || null } : m))).catch(() => {})
    }, 4000)
    return () => clearInterval(t)
  }, [run, poll, source])

  // someone is looking at the game: its server is kept; with nobody looking it stops, and the next look opens it
  const url = model?.app.url || null
  useEffect(() => {
    if (!run || !url || !source.seen) return
    const seen = () => { if (!document.hidden) source.seen?.(run).then(o => { if (!o.url) setModel(m => (m && m.run === run ? { ...m, app: { ...m.app, url: null } } : m)) }).catch(() => {}) }
    seen()
    const t = window.setInterval(seen, 30000)
    return () => clearInterval(t)
  }, [run, url, source])

  // ---------- starting the game's server again (web/canvas/rooms.js openApp): the card is the "Starting" skeleton
  // meanwhile. A try the person asked for (the Live option, Play it live, "show the game") says in the chat why it
  // failed; the room's own try stays quiet.
  const openSay = useRef(false)
  const openFor = useRef('')
  const openApp = useCallback(() => {
    if (!run || !source.open || openFor.current === run) return
    openFor.current = run
    setOpening(true); setOpenErr('')
    let tries = 0
    const done = () => { if (openFor.current === run) openFor.current = '' }
    const go = (): void => void source.open!(run).then(o => {
      if (at.current?.run !== run) return done()
      if (o.url) { done(); openSay.current = false; setOpening(false); return setModel(m => (m && m.run === run ? { ...m, app: { ...m.app, url: o.url, message: '' } } : m)) }
      // it is still starting: ask again in a moment, ten times at most (the skeleton stays meanwhile)
      if (++tries >= 10) throw new Error('It did not start. Open it again to retry.')
      window.setTimeout(go, 2500)
    }).catch(err => {
      done()
      if (at.current?.run !== run) return
      if (openSay.current) hermia(playFail('game', oops(err)))
      openSay.current = false
      setOpening(false); setOpenErr(oops(err))
    })
    go()
  }, [run, source, hermia])
  // a game built before whose server stopped is started again when the room is looked at; a big game waiting after
  // a slice only when Live is asked for (that can mean an install and a build)
  const a = model?.app
  const wantOpen = !!a && !a.url && !opening && !openFailed && a.state !== 'working' && !a.message && (!!a.hasApp || !!now?.open)
  useEffect(() => { if (wantOpen && !document.hidden) openApp() }, [wantOpen, openApp])

  // ---------- the switch
  const stageSet = useCallback((v: StageView | null) => {
    setPin(v)
    setMode('preview')
    // Live, asked for: if the game has to be started and cannot be, the chat says why
    if (v === 'live' && !at.current?.app.url) { openSay.current = true; setOpenErr('') }
  }, [])
  const playLive = useCallback(() => {
    const m = at.current
    if (!m) return
    const b = stageBuild(m, { opening: false, failed: false })
    if (!stageNow(b, null).offers.includes('live')) return hermia(stageNone('live', b))
    stageSet('live')
  }, [hermia, stageSet])

  const autoplay = useAutoplay({ run: model ? run ?? null : null, kind: 'game', url, live: mode === 'preview' && shown === 'live' && !now?.empty, source, showLive: useCallback(() => stageSet('live'), [stageSet]), say: hermia })
  const auto = useRef(autoplay)
  auto.current = autoplay

  // ---------- the build's buttons
  const build = useCallback((body: { ask?: string, note?: string, fix?: boolean, art?: boolean } = {}) => {
    if (!run || !source.build) return Promise.resolve(false)
    return source.build(run, { ...body, sections: doneSections(deck) }).then(app => { setOpenErr(''); setModel(m => (m && m.run === run ? { ...m, app: { ...m.app, ...app, message: '' } } : m)); return app.state === 'working' })
      .catch(err => { setModel(m => (m && m.run === run ? { ...m, app: { ...m.app, message: oops(err) } } : m)); line('err', `Game: ${oops(err)}`); return false })
  }, [run, source, deck, line])
  const onStop = useCallback(() => { if (run) source.stop?.(run).catch(err => toast(`Stop: ${oops(err)}`)) }, [run, source, toast])
  const onReopen = useCallback(() => { setOpenErr(''); setModel(m => (m ? { ...m, app: { ...m.app, message: '' } } : m)) }, [])
  const onPort = useCallback(() => { const p = at.current?.app.result?.port; if (run && p) source.port?.(run, p.target).catch(err => line('err', `${p.label}: ${oops(err)}`)) }, [run, source, line])

  // ---------- the chat
  // a change the crew wrote out, waiting for its button: a typed yes presses it
  const waiting = useRef<{ change: string, now: boolean } | null>(null)
  const confirm = useCallback((change: string, nowAt: boolean) => {
    if (!run || !source.tell) return Promise.reject(new Error('no crew to tell'))
    return source.tell(run, { confirm: change, now: nowAt }).then(r => { if (waiting.current?.change === change) waiting.current = null; hermia(r.answer || 'Sent to the crew.') }, err => { line('err', `Game: ${oops(err)}`); throw err })
  }, [run, source, hermia, line])

  // while it builds (or waits), the crew still listens: a question gets an answer from what it is doing, a change is
  // queued for the start of the next slice (web/canvas/rooms.js tellCrew). `did`: what was done with the message
  const tellCrew = useCallback((text: string, did = '') => {
    const m = at.current
    if (!run || !m || !source.tell) return
    if (waiting.current && saidYes(text)) return void confirm(waiting.current.change, waiting.current.now).catch(() => {})
    // a question to one of the crew by name ("Pip, what are you on?"): their window answers on the wall
    const k = m.crew.findIndex(n => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text))
    const who = k >= 0 ? m.crew[k] : ''
    const on = k < 0 ? '' : k === 3 ? `writing ${m.file?.path || 'code'}` : `the ${GAME_WINDOWS[k].toLowerCase()} window`
    setSaid({ at: k, who: who || 'Hermia', text: '…' })
    source.tell(run, { text, ...(who ? { who, on } : {}) }).then(r => {
      const answer = r.answer || (r.queued ? 'Got it: that goes to the crew at the start of the next slice.' : 'The crew is working.')
      setSaid({ at: k, who: who || 'Hermia', text: answer })
      if (r.proposal) waiting.current = { change: r.proposal.change, now: !!r.proposal.now }
      const p = r.proposal
      line(who ? 'crew' : 'hermia', answer, {
        ...(who ? { name: who, color: crew().color(who) } : {}),
        where: p ? 'confirm below' : r.queued ? 'sent to the crew' : did || 'answer only',
        ...(p || r.media ? { card: <>{r.media && <MediaCard clip={r.media.clip} pics={r.media.pics} />}{p && <ChangeCard change={p.change} now={p.now} onSend={n => confirm(p.change, n)} />}</> } : {})
      })
    }).catch(err => { setSaid(null); line('err', `Game: ${oops(err)}`) })
  }, [run, source, confirm, line])

  // an answer to a waiting slice (web/canvas/rooms.js sliceGo): "fix it" sends the crew at the play test's error
  // now; "go on" is the next slice as planned; a question is answered and starts nothing; anything else is its note
  const sliceGo = useCallback((text: string, typed: boolean) => {
    const m = at.current, s = m?.app.slice
    if (!m || m.app.state !== 'paused' || !s) return hermia('The game is not waiting on a slice right now.')
    const w = sliceWords(s, m.app.result, m.app.steps), saidText = text.trim(), kind = sliceSay(saidText)
    const route = w.failed && kind === 'note' && saysBroken(saidText) ? 'fix' : kind
    if (route === 'ask') { if (!typed) line('you', text); return tellCrew(saidText, w.failed ? 'answer only · type "fix it" or "go on"' : 'answer only · waiting on you') }
    if (!typed) line('you', text)
    if (route === 'fix' && !w.failed) return hermia('The last play test passed, so there is no error to send the crew at. Say what is wrong and it goes into the next slice.', { where: 'waiting on you' })
    const note = route === 'go' || kind === 'fix' ? '' : saidText
    if (route === 'fix') hermia(`The crew goes at this now, then the bots play the game again: ${w.line}`, { where: 'crew fixing now' })
    else hermia(`Starting ${s.next || 'the next slice'}${note ? ' with your note' : ''}${w.failed ? ': the crew fixes the play test\'s error first' : ''}.`, { where: 'crew working now' })
    void build({ ...(note ? { note } : {}), ...(route === 'fix' ? { fix: true } : {}) }).then(ok => {
      if (!ok) hermia(`It did not start. Type "${route === 'fix' ? 'fix it' : 'go on'}" to try again.`, { where: 'waiting on you' })
    })
  }, [hermia, line, tellCrew, build])
  acts.current = { live: playLive, slice: t => sliceGo(t, false) }

  const onChat = useCallback(({ text }: { text: string }) => {
    const m = at.current, t = text.trim()
    if (!run || !m || !t) return
    line('you', t)
    // Autoplay, typed: "play it for me", "stop playing"
    const play = autoplayAsk(t)
    if (play) return auto.current.ask(play)
    // the switch, typed: answered here, never sent to the builder
    const want = stageAsk(t)
    if (want === 'follow') return stageSet(null)
    if (want === 'live') return playLive()
    if (want) { const b = stageBuild(m, { opening, failed: openFailed }); return stageNow(b, null).offers.includes(want) ? stageSet(want) : hermia(stageNone(want, b)) }
    const app = m.app
    if (app.state === 'paused' && app.slice) return sliceGo(t, true)
    if (app.state === 'working') return tellCrew(t)
    // the chat works for a stopped build too: "go on", "continue", "resume" pick it up again; anything else gets a true answer
    if (!app.hasApp) return goOnAsk(t, app) ? void build() : hermia(noAppYet({ ...app, kind: 'game' }))
    void build({ ask: t }).then(ok => { if (ok) line('sys', `💬 to the game: ${t}`) })
  }, [run, line, stageSet, playLive, hermia, sliceGo, tellCrew, build, opening, openFailed])

  // an answer said over the wall goes after a while, as the classic bubble does
  useEffect(() => {
    if (!said || said.text === '…') return
    const t = window.setTimeout(() => setSaid(null), 14000)
    return () => clearTimeout(t)
  }, [said])

  useTrail(model?.title || undefined)

  if (!model || !now) return <section aria-label="Game room" aria-busy="true" className="ml-[var(--chat-w,0px)] grid flex-1 place-items-center p-3"><div className="h-[60%] w-[min(720px,90%)] rounded-[12px] border border-edge bg-deep" /></section>
  return (
    <>
      <GameRoomView model={model} now={now} said={said} mode={mode} opening={opening} openError={openErr} autoplay={autoplay} reload={reload}
        onPick={v => stageSet(stagePick(pin, v))} onMode={setMode} onReload={() => setReload(n => n + 1)} onStop={onStop}
        onBuild={() => void build()} onInCode={() => void build({ art: false })} onReopen={onReopen} onStart={() => setStart({})} onFile={readFile} onPort={source.port ? onPort : undefined} />
      {/* a site build that is open can have the game as its promo game (web/canvas/rooms.js openGame) */}
      <GameStart isOpen={!!start} onClose={() => setStart(null)} idea={start?.idea}
        site={run && deck.kind !== 'game' && Object.keys(deck.layers).length ? { run, name: deck.title || 'this site' } : null}
        castOnly={start?.cast && run ? { run, title: model.title } : null}
        onBuilt={(built, say) => { setStart(null); sayOnOpen(built, say); go({ type: 'started', run: built, room: 'app' }) }} />
      <Chat from={run} project={view.project} lines={feed.lines} log={feed.log} onSubmit={onChat} commands={COMMANDS}
        onCommand={c => (c.name === 'game' ? setStart({ idea: c.arg }) : c.name === 'cast' ? setStart({ cast: true }) : hermia(`${c.text} is not a command here. Try /game or /cast.`))}
        box={working
          ? { placeholder: 'Ask the crew, or say what to change…', empty: 'Ask the crew what they are on, or say what to change next.', action: 'Send' }
          : { placeholder: 'Change the game: “make the jump higher”, “add a boss”…', empty: 'Say what to change, or “show the art”, “show the game”, “play it for me”.', action: 'Send' }} />
    </>
  )
}
