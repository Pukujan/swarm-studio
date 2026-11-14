// Settings (docs/specs/25-connections.md), the React port of web/settings.js: the studio's own settings and where
// its data goes. iOS Settings, as docs/ux/PATTERNS.md assigns for Me › Settings: grouped lists, one level per tap,
// names and a state.
//
// Layer 1: You, Setup, Lite mode, Data. You is the Feed account and its "Goes to" line. Setup closes Settings and
// opens the Setup sheet on its Parts (one sheet at a time). Lite mode is the pick and what it does. Data is where
// data goes. Which layer is open is the statechart's `#me.settings` (layers.ts), run as settingsMachine.
import { useMachine } from '@xstate/react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { Dialog } from '../../primitives/Dialog'
import { ToggleGroup } from '../../primitives/ToggleGroup'
import { get, post } from './api'
import { settingsMachine } from './machines'

const DATA = [
  ['Builds, settings, keys', 'Stay on this computer or with Hermes'],
  ['Prompts, plans, review screenshots', 'The model provider you picked'],
  ['Picture and clip prompts', 'The image and video provider you picked'],
  ['Clips and sounds you attach, finished films', 'The media model you picked, or none when it is off'],
  ['Words from a picture prompt', 'Openverse and Pexels, for a stand-in photo'],
  ['The canvas page', 'Loads Tailwind and Google Fonts'],
  ['What you publish', 'The host you connected'],
  ['Swarm Feed', 'An install id on connect; then only what you post'],
  ['Everything else', 'Nowhere. No telemetry']
] as const
const FEED_GOES = 'Swarm Feed: an install id on connect, then only the builds you post'

// Lite mode, as web/canvas/settings.js does it (litePass, liteOn) and web/canvas.css draws it (body.lite)
const LITE = [
  ['What it does', 'Only the page you are reading stays live. Every other finished page becomes a still picture and its memory is freed; it comes back live when you zoom into it or the crew works on it.'],
  ['What stops', 'The background grid, the moving wires and the speech-bubble animations.'],
  ['Auto turns it on', 'When this device has 4 GB of memory or less, when more than one page is on the canvas and the crew has been quiet for 5 seconds, and while Play covers the canvas.'],
  ['On', 'Always, on any device.'],
  ['Off', 'Never, not even in Play. Every page stays live.']
] as const
const LITE_PICKS = [{ k: 'auto', label: 'Auto', on: null }, { k: 'on', label: 'On', on: true }, { k: 'off', label: 'Off', on: false }] as const
type LitePick = typeof LITE_PICKS[number]['k']
const small = () => ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4

const TITLE = { index: 'Settings', you: 'You', lite: 'Lite mode', data: 'Data' } as const

const Chevron = ({ back }: { back?: boolean }) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-3.5 flex-none fill-none stroke-current stroke-2 text-muted"><path d={back ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} /></svg>
)

// one row: a name, and its state on the right (an account, a pick, or nothing but the dot)
function Row({ name, state, dot, more, expanded, onPress }: { name: string, state?: string, dot?: boolean, more?: boolean, expanded?: boolean, onPress: () => void }) {
  return (
    <AriaButton onPress={onPress} aria-haspopup={more ? 'true' : undefined} aria-expanded={more ? undefined : !!expanded}
      className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 px-3.5 text-left text-text outline-none data-[hovered]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-frame-hi">
      {dot !== undefined && <i role="img" aria-label={dot ? 'Connected' : 'Not connected'} className={`inline-block size-2 flex-none rounded-full border-[1.5px] ${dot ? 'border-ok bg-ok' : 'border-muted'}`} />}
      <b className="flex-none font-label text-sm font-semibold uppercase tracking-[.08em]">{name}</b>
      <span className="min-w-0 flex-1 truncate text-right font-body text-[13px] text-muted">{state}</span>
      {more && <Chevron />}
    </AriaButton>
  )
}

const List = ({ children }: { children: ReactNode }) =>
  <div className="divide-y divide-edge overflow-hidden rounded-[12px] border border-edge">{children}</div>

const Table = ({ rows }: { rows: readonly (readonly [string, string])[] }) => (
  <dl className="m-0 grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-2 px-3.5 py-3 font-body text-[12.5px] leading-[1.4] max-[480px]:grid-cols-1 max-[480px]:gap-y-0.5">
    {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="m-0 text-text max-[480px]:mb-1.5">{v}</dd></div>)}
  </dl>
)

export function SettingsSheet({ at: start, onClose, onSetup }: {
  // a layer to open on (a story)
  at?: 'you' | 'lite' | 'data'
  onClose: () => void
  onSetup: () => void
}) {
  const [state, send] = useMachine(settingsMachine)
  // a second send of the same move does nothing, so it is safe in StrictMode
  useEffect(() => { if (start) send({ type: start }) }, [start, send])
  // each state fills in when its own answer comes: the sheet never waits
  const [me, setMe] = useState<{ name?: string, handle?: string } | null>(null)
  const [lite, setLite] = useState<boolean | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    get<{ name?: string, handle?: string }>('/api/me').then(v => { if (alive) setMe(v) })
    get<{ lite?: boolean | null }>('/api/models').then(v => { if (alive) setLite(v ? v.lite ?? null : null) })
    return () => { alive = false }
  }, [])

  // a Feed account has a handle; without one the server answers the computer's user name, which is not an account
  const you = me?.handle ? me.name || `@${me.handle}` : ''
  const liteState = lite === undefined ? '' : lite === true ? 'On' : lite === false ? 'Off' : `Auto · ${small() ? 'on' : 'off'} here`
  const now: LitePick = lite === true ? 'on' : lite === false ? 'off' : 'auto'

  async function pickLite(k: LitePick) {
    const p = LITE_PICKS.find(x => x.k === k)!
    setLite(p.on)
    await post('/api/models', { role: 'lite', on: p.on })
    // the Design deck reads the pick again (web/canvas/settings.js loadModels)
    dispatchEvent(new CustomEvent('swarm:models'))
  }

  const at = state.value as keyof typeof TITLE
  const back = (
    <AriaButton onPress={() => send({ type: 'up' })} className="flex min-h-[52px] w-full cursor-pointer items-center gap-2.5 px-3.5 text-left text-text outline-none data-[hovered]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-frame-hi">
      <Chevron back /><b className="font-label text-sm font-semibold uppercase tracking-[.08em]">Settings</b>
    </AriaButton>
  )

  return (
    <Dialog title={TITLE[at]} isOpen onOpenChange={o => { if (!o) onClose() }}>
      <List>
        {at === 'index' && (
          <>
            <Row name="You" state={you || 'Not signed in'} more onPress={() => send({ type: 'you' })} />
            <Row name="Setup" more onPress={onSetup} />
            <Row name="Lite mode" state={liteState} more onPress={() => send({ type: 'lite' })} />
            <Row name="Data" more onPress={() => send({ type: 'data' })} />
          </>
        )}
        {at === 'you' && (
          <>
            {back}
            <Row name="Swarm Feed" dot={!!me?.handle} state={you} expanded={state.context.goes} onPress={() => send({ type: 'goes' })} />
            {state.context.goes && <p className="m-0 px-3.5 py-3 font-body text-[12.5px] leading-[1.4] text-muted">{FEED_GOES}</p>}
          </>
        )}
        {at === 'lite' && (
          <>
            {back}
            <div className="px-3.5 py-3"><ToggleGroup label="Lite mode" items={LITE_PICKS} value={now} onChange={pickLite} /></div>
            <Table rows={LITE} />
          </>
        )}
        {at === 'data' && <>{back}<Table rows={DATA} /></>}
      </List>
    </Dialog>
  )
}
