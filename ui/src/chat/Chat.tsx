// The chat (web/index.html's .side, web/canvas/talk.js, web/layerlink.js; specs 27 and 29), as decision 0015 puts it:
// a dock along the bottom at every width, with a handle to three heights (Dock.tsx). The Chat and Log tabs, Chats,
// Hermia's turns, Suggestions (what her latest turn offers, in a drawer), the message box with its layer and
// reference chips, the agents and build model pickers, and Send. The Studio scaffold, the Overview and the Design
// deck all draw this one component; its props and events are src/chat/types.ts.
import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import { Tab, TabList, TabPanel, Tabs, TextArea } from 'react-aria-components'
import { Button } from '../primitives/Button'
import { ChipSelect } from '../primitives/ChipSelect'
import { chatApi, getJson, postJson } from './api'
import { Chats } from './Chats'
import { DockHandle, useDock } from './Dock'
import { Feed, Suggested } from './Feed'
import { Suggestions } from './Suggestions'
import { LAYER_TYPE, layerOf } from './layers'
import { hear, useTalk } from './useTalk'
import { Wires } from './Wires'
import type { ChatChip, ChatLine, ChatProps } from './types'

const AGENTS = [4, 5, 6, 8, 12, 16, 20, 24]
const EMPTY = 'Describe a product below. A planner picks the pages, then a swarm of agents builds them on the canvas.'
const HERMES = '_hermes'
const OTHER = '__other'

// the same key the current Studio keeps its recent build models under (web/canvas/core.js store)
const RECENT = 'swarm.recentModels'
const recent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) || '[]') || [] } catch { return [] } }
const short = (m: string) => m.split('/').pop() || m

// the build model picker (web/canvas/settings.js fillBuildModel): Hermes's own model first, the picked and recent
// ones, then Other…, which opens the models panel. A pick is saved for the builders at once.
function useBuildModel(api: NonNullable<ChatProps['api']>, onError: (text: string) => void) {
  const [info, setInfo] = useState<{ hermes?: string, picked?: string, list: string[], count: number }>({ list: [], count: 0 })
  const load = async () => {
    type Roles = { roles?: Record<string, { hermes?: string, picked?: string } | undefined>, text?: string[] }
    const j = await getJson<Roles>(api, '/api/models')
    if (!j) return
    const w = j.roles?.worker || {}
    const list = [...new Set([w.picked, ...recent(), j.roles?.planner?.picked, j.roles?.planner?.hermes].filter((m): m is string => !!m && m !== 'off' && m !== w.hermes))].slice(0, 8)
    setInfo({ hermes: w.hermes, picked: w.picked, list, count: (j.text || []).length })
  }
  useEffect(() => { void load() }, [api])
  const options = [{ id: HERMES, label: info.hermes ? short(info.hermes) : 'Hermes default' }, ...info.list.map(m => ({ id: m, label: short(m) })), { id: OTHER, label: `Other… (${info.count} models)` }]
  const value = info.picked && info.list.includes(info.picked) ? info.picked : HERMES
  async function pick(id: string) {
    const model = id === HERMES ? '' : id
    if (model) try { localStorage.setItem(RECENT, JSON.stringify([model, ...recent().filter(m => m !== model)].slice(0, 6))) } catch { /* private window */ }
    setInfo(i => ({ ...i, picked: model || undefined }))
    await postJson(api, '/api/models', { role: 'worker', model: model || null }).catch(() => onError('could not save that model pick'))
    await load()
  }
  return { options, value, pick }
}

export function Chat(props: ChatProps) {
  const { talk: wanted = null, from = null, project = null, lines = [], log = [], commands = [], agentsMax, layerRect, onSubmit, onCommand, onMoreModels } = props
  const api = props.api ?? chatApi
  const [chips, setChips] = useState<ChatChip[]>([])
  const [text, setText] = useState('')
  const [tab, setTab] = useState<'chat' | 'log'>('chat')
  const [drop, setDrop] = useState(false)
  const [hot, setHot] = useState<string | null>(null)
  const [hover, setHover] = useState<HTMLElement | null>(null)
  const [slashAt, setSlashAt] = useState(0)
  const [slashOff, setSlashOff] = useState(false)
  const agentList = AGENTS.filter(n => !agentsMax || n <= agentsMax)
  const [agents, setAgents] = useState(() => String(agentsMax ? agentList.at(-1) ?? 8 : 8))
  const side = useRef<HTMLElement>(null)
  const dock = useDock()
  const box = useRef<HTMLTextAreaElement>(null)

  const addChip = (c: ChatChip) => setChips(cs => (!c.key || cs.some(x => x.key === c.key) || cs.length >= 12 ? cs
    : [...cs, { key: String(c.key), name: String(c.name || c.key.split('/').pop()).slice(0, 60), kind: c.kind === 'ref' ? 'ref' : 'layer', thumb: c.thumb }]))
  const talk = useTalk({ api, from, project, addChip, events: props })
  const model = useBuildModel(api, t => talk.note({ who: 'err', text: t }))

  // a talk to start, or to end (the screen's `talk`): a new id starts it, null ends it
  const seen = useRef<string | null>(null)
  useEffect(() => {
    const id = wanted?.id ?? null
    if (id === seen.current) return
    seen.current = id
    if (wanted && wanted.id !== talk.started) { talk.start(wanted); if (!wanted.brief) box.current?.focus({ preventScroll: true }) }
    else if (!wanted && talk.on) talk.end()
  }, [wanted?.id])

  // the screen's lines are heard too, so Hermia's cursor never says one
  const heard = useRef(new Set<string>())
  useEffect(() => { for (const l of [...lines, ...log]) if (!heard.current.has(l.id)) { heard.current.add(l.id); if (l.who !== 'sys') hear(l.text) } }, [lines, log])

  // the chat's own turns among the screen's, by time
  const feed = useMemo(() => [...talk.turns, ...lines].sort((a, b) => a.at - b.at), [talk.turns, lines])

  // ---------- the slash commands: / and a few letters lists them; arrows move, Tab or Enter picks, Esc hides
  const matches = !slashOff && text.startsWith('/') && !/\s/.test(text) ? commands.filter(c => c.name.startsWith(text.slice(1).toLowerCase())) : []
  const at = Math.min(slashAt, Math.max(0, matches.length - 1))
  function pickSlash(name: string) {
    const takes = commands.find(c => c.name === name)?.arg
    setText(`/${name}${takes ? ' ' : ''}`)
    box.current?.focus()
    if (!takes) send(`/${name}`)
  }

  // ---------- Send: a command from any state; in a talk, a turn (the words wait in the box while Hermia answers);
  // else a build, with the pickers and the chips
  function send(value = text) {
    const t = value.trim()
    if (!t) return
    if (/^\/[a-z?]/i.test(t)) {
      setText('')
      talk.note({ who: 'you', text: `› ${t}` })
      const [name = '', ...rest] = t.slice(1).split(' ')
      return onCommand?.({ name: name.toLowerCase(), arg: rest.join(' ').trim(), text: t })
    }
    if (talk.on) {
      if (talk.busy) return
      setText('')
      void talk.say(t, chips)
      return setChips([])
    }
    setText('')
    onSubmit?.({ text: t, agents: Number(agents), model: model.value === HERMES ? '' : model.value, chips })
    setChips([])
  }

  // ---------- a layer or a file dropped anywhere on the chat; a picture pasted into the box
  const ours = (dt: DataTransfer | null) => { const t = [...(dt?.types || [])]; return t.includes(LAYER_TYPE) || t.includes('Files') }
  const dragProps = {
    onDragOver: (e: DragEvent) => { if (!ours(e.dataTransfer)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDrop(true) },
    onDragLeave: (e: DragEvent) => { if (!side.current?.contains(e.relatedTarget as Node | null)) setDrop(false) },
    onDrop: (e: DragEvent) => {
      setDrop(false)
      if (!ours(e.dataTransfer)) return
      e.preventDefault()
      if (e.dataTransfer.files?.length) void talk.files([...e.dataTransfer.files])
      else { const l = layerOf(e.dataTransfer); if (l) addChip({ ...l, kind: 'layer' }) }
      setTab('chat')
      box.current?.focus()
    }
  }
  useEffect(() => { const off = () => setDrop(false); document.addEventListener('dragend', off); return () => document.removeEventListener('dragend', off) }, [])

  const acts = { build: talk.build, pick: talk.pick, briefText: talk.briefText, briefGo: talk.briefGo, brandSheet: talk.brandSheet, keepTalking: (id: string) => { talk.keepTalking(id); box.current?.focus() }, busy: talk.busy }
  const tabClass = 'inline-flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 font-monospace text-xs text-muted outline-none data-[hovered]:text-text data-[selected]:bg-panel-2 data-[selected]:text-text data-[focus-visible]:outline-2 data-[focus-visible]:outline-frame-hi'
  // what Hermia's latest turn offers (one open question at a time: only the latest turn has any)
  const offer = talk.turns.findLast(t => !!t.acts && t.acts.type !== 'brief')
  const offers = !offer?.acts ? 0 : offer.acts.type === 'build' ? 1 : offer.acts.type === 'options' ? offer.acts.options.length : 0

  return (
    <section ref={side} aria-label="Chat" data-chat-dock="" {...dragProps} style={{ height: dock.px }}
      className={`side chat-dock fixed inset-x-0 bottom-0 z-30 flex flex-col border-t border-edge bg-deep pt-4 text-text shadow-[0_-18px_40px_-24px_rgb(var(--shade-rgb)/.6)] ${dock.drag == null ? 'motion-safe:transition-[height] motion-safe:duration-200' : ''} ${drop ? 'outline-2 -outline-offset-4 outline-dashed outline-accent' : ''}`}>
      <DockHandle dock={dock} />
      <Tabs selectedKey={tab} onSelectionChange={k => setTab(k === 'log' ? 'log' : 'chat')} className="mx-auto flex min-h-0 w-full max-w-[960px] flex-1 flex-col">
        <div className="flex items-center gap-1 px-2">
          <TabList aria-label="Chat or Log" className="flex gap-1">
            <Tab id="chat" className={tabClass}>Chat</Tab>
            <Tab id="log" className={tabClass}>Log</Tab>
          </TabList>
          <Chats api={api} project={project} from={from} current={talk.on ? talk.chat : null} onOpen={id => { setTab('chat'); void talk.openChat(id) }} onNew={() => { setTab('chat'); talk.newChat(); box.current?.focus() }} />
        </div>
        <TabPanel id="chat" className="flex min-h-0 flex-1 flex-col outline-none">
          <Feed lines={feed} acts={acts} label="Messages" empty={talk.on ? undefined : EMPTY} onHover={setHover} />
          <form className="composer relative flex flex-col gap-1.5 px-2 pb-2" onSubmit={e => { e.preventDefault(); send() }}>
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-1.5" onMouseLeave={() => setHot(null)}>
                {chips.map(c => (
                  <span key={c.key} data-chip={c.key} data-wire={c.kind === 'layer' ? '' : undefined} onMouseEnter={() => setHot(c.key)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line-2 bg-surface-2 py-0.5 pr-0.5 pl-2 font-monospace text-xs">
                    {c.thumb && <img src={c.thumb} alt="" className="h-5 w-5 rounded-[4px] object-cover" />}
                    <span className="truncate">{c.name}</span>
                    <Button role="ghost" aria-label={`Remove ${c.name}`} className="min-h-8 min-w-8 rounded-full px-0" onPress={() => { setChips(cs => cs.filter(x => x.key !== c.key)); if (hot === c.key) setHot(null) }}>×</Button>
                  </span>
                ))}
              </div>
            )}
            {matches.length > 0 && (
              <div role="listbox" id="chat-slash" aria-label="Commands" className="absolute right-2 bottom-full left-2 mb-1 max-h-64 overflow-auto rounded-[12px] border border-edge bg-surface-2 p-1 shadow-[0_24px_60px_-12px_rgb(var(--shade-rgb)/.65)]">
                {matches.map((c, i) => (
                  <div key={c.name} id={`chat-slash-${c.name}`} role="option" aria-selected={i === at}
                    onMouseDown={e => { e.preventDefault(); pickSlash(c.name) }}
                    className={`flex cursor-pointer flex-wrap items-baseline gap-x-2 rounded-[8px] px-3 py-2 font-monospace text-xs ${i === at ? 'bg-panel-2' : ''}`}>
                    <b className="text-text">/{c.name}</b>{c.arg && <span className="text-dim">{c.arg}</span>}<span className="basis-full text-muted">{c.what}</span>
                  </div>
                ))}
              </div>
            )}
            <TextArea ref={box} aria-label="Message" rows={2} autoComplete="off" value={text} placeholder={talk.on ? 'Tell Hermia…' : 'Describe a product'}
              aria-controls={matches.length ? 'chat-slash' : undefined} aria-activedescendant={matches.length ? `chat-slash-${matches[at]?.name}` : undefined}
              onChange={e => { setText(e.target.value); setSlashAt(0); setSlashOff(false) }}
              onBlur={() => setTimeout(() => setSlashOff(true), 150)}
              onFocus={() => setSlashOff(false)}
              onPaste={e => { const list = [...(e.clipboardData?.files || [])]; if (!list.length) return; e.preventDefault(); void talk.files(list) }}
              onKeyDown={e => {
                if (matches.length) {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); return setSlashAt((at + (e.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length) }
                  const m = matches[at]
                  if (m && (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && text.trim() !== `/${m.name}`))) { e.preventDefault(); return pickSlash(m.name) }
                  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return setSlashOff(true) }
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
              }}
              className="w-full resize-none rounded-[10px] border border-line-2 bg-void px-3 py-2 font-monospace text-sm text-text outline-none placeholder:text-dim data-[focused]:border-frame-hi" />
            <div className="row flex min-w-0 items-center gap-1.5">
              <Suggestions count={offers}>
                {done => offer ? <Suggested t={offer} a={acts} done={done} /> : <p className="m-0 px-1 py-2 font-monospace text-xs text-muted">Nothing to suggest right now.</p>}
              </Suggestions>
              <span className="flex-1" />
              <ChipSelect name="Agents" options={agentList.map(n => ({ id: String(n), label: `${n} agents` }))} value={agents} onChange={setAgents} className="flex-none" />
              <ChipSelect name="Build model" options={model.options} value={model.value} className="min-w-0 max-w-56 shrink"
                onChange={id => { if (id === OTHER) onMoreModels?.(); else void model.pick(id) }} />
              <Button type="submit" role="primary" className="flex-none">{talk.on ? 'Send' : 'Build'}</Button>
            </div>
          </form>
        </TabPanel>
        <TabPanel id="log" className="flex min-h-0 flex-1 flex-col outline-none">
          <Feed lines={log as ChatLine[]} label="Log" empty="Nothing yet." />
        </TabPanel>
      </Tabs>
      <Wires side={side} rect={layerRect} hot={hot} hover={hover} chips={chips.length} />
    </section>
  )
}
