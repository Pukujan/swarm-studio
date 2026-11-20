// Models: the sheet the user menu's Models and the chat's Other… open, the React port of the current Studio's
// models pop (web/canvas/settings.js `renderModels`). Five rows, each saved the moment it changes (POST
// /api/models) and used from the next build:
//
//   Planner, Builders   under Hermes, the model Hermes uses for the role and its provider, with Change, which
//                       opens Setup on its Models row: Hermes's own picker, the test of each model with why one
//                       does not answer, a provider added by its command, and the media reader (spec 6, spec 32).
//                       Outside Hermes, a model id typed or picked from the list the server found
//   Reviewer            typed or picked from the models that can see, or turned off
//   Images              the provider and model that paint pictures: Auto, Off, or one Hermes is signed in to
//   Lite mode           Auto, On or Off (the same pick as Settings › Lite mode)
//
// No key is typed, shown or sent here: a pick is a model's name.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Busy } from '../../primitives/Busy'
import { Button } from '../../primitives/Button'
import { ComboField } from '../../primitives/ComboField'
import { Dialog } from '../../primitives/Dialog'
import { Select } from '../../primitives/Select'
import { get, post } from './api'
import { Note, Why } from './bits'
import type { Options, Slot } from './types'

// what GET /api/models answers (server/server.mjs)
interface RoleInfo { hermes?: string, host?: string, picked?: string | null }
interface ImageProvider { provider: string, models: string[], default?: string, available?: boolean }
interface ModelsInfo {
  roles?: Record<string, RoleInfo | undefined>
  text?: string[]
  vision?: string[]
  lite?: boolean | null
  image?: { pick?: 'off' | { provider: string, model: string } | null, providers?: ImageProvider[] }
}

type Role = 'planner' | 'worker' | 'reviewer'
const ROLE_ROWS: { role: Role, label: string, note: string, list: 'text' | 'vision', off?: boolean }[] = [
  { role: 'planner', label: 'Planner', note: 'Plans the pages and the design system.', list: 'text' },
  { role: 'worker', label: 'Builders', note: 'Every agent that writes a section.', list: 'text' },
  { role: 'reviewer', label: 'Reviewer', note: 'Looks at screenshots after a build (needs vision).', list: 'vision', off: true }
]

// the same key the chat's build model picker reads its recent models from (ui/src/chat/Chat.tsx)
const RECENT = 'swarm.recentModels'
function remember(model: string) {
  try {
    const was: string[] = JSON.parse(localStorage.getItem(RECENT) || '[]') || []
    localStorage.setItem(RECENT, JSON.stringify([model, ...was.filter(m => m !== model)].slice(0, 6)))
  } catch { /* a private window */ }
}

const small = () => ((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8) <= 4
const LABEL = 'font-label text-xs font-semibold uppercase tracking-[.07em] text-muted'
const Row = ({ children }: { children: ReactNode }) => <section className="flex flex-col gap-2 px-3.5 py-3">{children}</section>

export function ModelsSheet({ onClose, onSetup }: {
  onClose: () => void
  // Change on Planner or Builders: this sheet closes and Setup opens on its Models row
  onSetup: () => void
}) {
  // undefined while the server is asked, null when it did not answer
  const [info, setInfo] = useState<ModelsInfo | null | undefined>(undefined)
  // Hermes's own slots; null outside Hermes or while it does not answer
  const [hermes, setHermes] = useState<Options | null>(null)
  const [error, setError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const load = useCallback(async () => {
    const [m, o] = await Promise.all([get<ModelsInfo>('/api/models'), get<Options>('/api/setup/models/options')])
    if (!alive.current) return
    setInfo(m)
    setHermes(o?.ok ? o : null)
  }, [])
  useEffect(() => { void load() }, [load])

  async function save(body: Record<string, unknown>) {
    setError('')
    const r = await post<{ ok?: boolean }>('/api/models', body)
    if (!alive.current) return
    if (!r?.ok) setError('Could not save that model pick.')
    await load()
    // the chat's build model and the Design deck read the picks again
    dispatchEvent(new CustomEvent('swarm:models'))
  }

  // the model Hermes runs a role on: its slot, or Hermes's main model while the slot is empty
  const uses = (role: Role): Slot | null => {
    const s = hermes?.slots?.[role]
    return s?.model ? s : hermes?.main?.model ? hermes.main : null
  }

  function roleRow(r: typeof ROLE_ROWS[number]) {
    const s = info?.roles?.[r.role] || {}
    if (hermes && r.role !== 'reviewer') {
      const h = uses(r.role)
      return (
        <Row key={r.role}>
          <div className="flex min-h-10 items-center gap-2.5">
            <span className={`mr-auto ${LABEL}`}>{r.label}</span>
            <b className="min-w-0 truncate font-monospace text-sm font-semibold text-text">{h?.model || 'None'}</b>
            <Button role="secondary" aria-label={`Change the ${r.label} model`} onPress={onSetup}>Change</Button>
          </div>
          <Note>{r.note} {h ? `Hermes · ${h.provider}` : 'Not set in Hermes.'}</Note>
        </Row>
      )
    }
    const off = s.picked === 'off'
    const now = off ? 'Off.' : s.picked ? `Picked. Hermes has ${s.hermes || 'none'}.` : s.hermes ? `From Hermes · ${s.host || ''}` : 'Not set in Hermes.'
    return (
      <Row key={r.role}>
        <div className="flex items-end gap-2">
          <ComboField label={r.label} value={off ? '' : s.picked || ''} options={info?.[r.list] || []} isDisabled={off}
            placeholder={s.hermes || (r.off ? 'off' : 'model id')}
            onCommit={m => { if (m) remember(m); void save({ role: r.role, model: m || null }) }} />
          {r.off && <Button role="secondary" onPress={() => save({ role: r.role, model: off ? null : 'off' })}>{off ? 'Turn on' : 'Turn off'}</Button>}
        </div>
        <Note>{r.note} {now}</Note>
      </Row>
    )
  }

  const pick = info?.image?.pick
  const image = pick === 'off' ? 'off' : pick ? `${pick.provider}|${pick.model}` : 'auto'
  const painted = (info?.image?.providers || []).flatMap(p => (p.models.length ? p.models : [p.default || '']).map(m => ({ id: `${p.provider}|${m}`, name: `${p.provider}${m ? ` · ${m}` : ''}${p.available ? '' : ' (not signed in)'}`, available: !!p.available })))
  const lite = info?.lite === true ? 'on' : info?.lite === false ? 'off' : 'auto'

  return (
    <Dialog title="Models" isOpen onOpenChange={o => { if (!o) onClose() }}>
      {!info ? (
        info === null ? <p className="m-0 font-body text-[12.5px] text-muted">Models did not answer.</p> : <div aria-busy="true" className="flex min-h-[52px] items-center justify-center"><Busy label="Loading" /></div>
      ) : (
        <div className="flex flex-col gap-3">
          <Note>{hermes ? 'Planner and builders are set in Hermes.' : 'Picks stay in Swarm Studio; Hermes’s config is untouched.'}</Note>
          <div className="divide-y divide-edge rounded-[12px] border border-edge font-body">
            {ROLE_ROWS.map(roleRow)}
            <Row>
              <Select label="Images" selectedKey={image} disabledKeys={painted.filter(p => !p.available).map(p => p.id)}
                options={[{ id: 'auto', name: 'Auto (Codex login, gpt-image-2-low)' }, { id: 'off', name: 'Off: shapes and SVG only' }, ...painted]}
                onSelectionChange={k => {
                  if (k == null || k === image) return
                  const [provider, model] = String(k).split('|')
                  void save({ role: 'image', provider: k === 'off' ? 'off' : k === 'auto' ? null : provider, model: k === 'off' || k === 'auto' ? '' : model || '' })
                }} />
              <Note>Paints photos and illustrations into the pages, with your Hermes image login. {info.image?.providers ? `${info.image.providers.filter(p => p.available).length} providers signed in.` : 'Looking for Hermes image providers…'}</Note>
            </Row>
            <Row>
              <Select label="Lite mode" selectedKey={lite}
                options={[{ id: 'auto', name: `Auto (${small() ? 'on' : 'off'} on this device)` }, { id: 'on', name: 'On' }, { id: 'off', name: 'Off' }]}
                onSelectionChange={k => { if (k != null && k !== lite) void save({ role: 'lite', on: k === 'auto' ? null : k === 'on' }) }} />
              <Note>For machines short on memory: one live page at a time, the rest become snapshots.</Note>
            </Row>
          </div>
          {error && <Why>{error}</Why>}
          <Note>Each image is one call to that provider and uses its quota. Changes apply to the next build.</Note>
        </div>
      )}
    </Dialog>
  )
}
