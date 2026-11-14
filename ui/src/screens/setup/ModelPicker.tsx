// The model picker in Setup › Models: Hermes's own providers and models (hermes_models.py, via
// /api/setup/models/options), never a list of ours. Signed-in providers list their models, the one in use first;
// a tap sets the planner and the builders. Everyone else is one tap in, under More providers: where a key is the
// only sign-in, the command that gives Hermes the key (`hermes auth add <provider> --type api-key`, Hermes asks for
// it hidden) to copy and run, then Check again; the browser where the provider signs in there. No key is ever typed
// into the studio or sent to it.
import { useEffect, useRef, useState } from 'react'
import { Button as AriaButton } from 'react-aria-components'
import { Busy } from '../../primitives/Busy'
import { Button, LinkButton } from '../../primitives/Button'
import { SearchField } from '../../primitives/SearchField'
import { Command } from '../../primitives/Command'
import { keyCommand } from '@studio/setup-parts'
import { get, post } from './api'
import { Acts, Line, Mark, Note, Why } from './bits'
import type { ModelTest, Options, Signing, Slot } from './types'

const SHOWN = 8

export function ModelPicker({ opts, setOpts, now, onPicked }: {
  // undefined while Hermes is asked
  opts: Options | undefined
  setOpts: (o: Options) => void
  // the model the builders run on now
  now: Slot
  onPicked: (slots: Record<string, Slot> | undefined, test: ModelTest | undefined) => void
}) {
  const [q, setQ] = useState('')
  const [all, setAll] = useState<Record<string, boolean>>({})
  const [picking, setPicking] = useState('')
  const [pickError, setPickError] = useState('')
  const [more, setMore] = useState(false)
  const [keyFor, setKeyFor] = useState('')
  const [checking, setChecking] = useState(false)
  const [signing, setSigning] = useState<Signing | null>(null)
  const [signError, setSignError] = useState('')
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  useEffect(() => { if (opts?.signing !== undefined) setSigning(opts.signing) }, [opts])

  // while a browser sign-in is open, ask Hermes every few seconds whether the provider is signed in
  useEffect(() => {
    if (!signing || signing.done) return
    const slug = signing.slug
    const t = setTimeout(async () => {
      const r = await get<Options>('/api/setup/models/options?refresh=1') ?? { ok: false, message: 'Hermes did not answer.', providers: [] }
      if (!alive.current) return
      setOpts(r)
      const g = r.signing
      if (r.providers?.find(x => x.slug === slug)?.signedIn || g?.done) setSigning(null)
      else if (g?.done === false) { setSignError(g.error || 'The sign-in did not finish.'); setSigning(null) }
      else setSigning(g ? { ...g } : { ...signing })
    }, 3000)
    return () => clearTimeout(t)
  }, [signing, setOpts])

  if (opts === undefined) return <Line><span>Models</span><Busy label="Testing" /></Line>
  if (!opts.ok) return opts.message ? <Note>{opts.message}</Note> : null

  async function pick(provider: string, model: string) {
    if (picking) return
    setPicking(`${provider}/${model}`); setPickError('')
    const r = await post<{ ok: boolean, message?: string, slots?: Record<string, Slot>, test?: ModelTest }>('/api/setup/models/pick', { provider, model }) ?? { ok: false, message: 'Hermes did not answer.' }
    if (!alive.current) return
    setPicking('')
    if (r.ok) onPicked(r.slots, r.test)
    else setPickError(r.message || 'Hermes did not save it.')
  }

  async function signIn(slug: string) {
    const p = opts!.providers.find(x => x.slug === slug)
    setSignError('')
    if (p?.sign === 'key') { setKeyFor(slug); return }
    setKeyFor('')
    setSigning({ slug, url: '', code: '', done: null })
    const r = await post<{ signing?: Signing | null }>('/api/setup/models/signin', { slug }) ?? { signing: { slug, done: false, error: 'Hermes did not answer.' } }
    if (!alive.current) return
    if (r.signing?.done === false) { setSignError(r.signing.error || 'The sign-in did not finish.'); setSigning(null) }
    else setSigning(r.signing ?? null)
  }

  // Check again: ask Hermes afresh whether the provider is signed in now
  async function keyAgain(slug: string) {
    if (checking) return
    setChecking(true); setSignError('')
    const r = await get<Options>('/api/setup/models/options?refresh=1') ?? { ok: false, message: 'Hermes did not answer.', providers: [] }
    if (!alive.current) return
    setChecking(false)
    if (r.ok) setOpts(r)
    if (r.providers?.find(x => x.slug === slug)?.signedIn) setKeyFor('')
    else setSignError(r.ok === false ? (r.message || 'Hermes did not answer.') : 'Not signed in yet.')
  }

  async function cancelSignIn() {
    setSigning(null)
    await post('/api/setup/models/signin', { cancel: true })
  }

  const needle = q.trim().toLowerCase()
  const signed = opts.providers.filter(p => p.signedIn)
    .sort((a, b) => Number(b.slug === now.provider) - Number(a.slug === now.provider) || Number(!!b.current) - Number(!!a.current))
  const groups = signed.map(p => {
    // the model in use comes first, so it is seen without searching
    const models = p.slug === now.provider && p.models.includes(now.model) ? [now.model, ...p.models.filter(m => m !== now.model)] : p.models
    const hit = needle ? models.filter(m => m.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)) : models
    if (!hit.length) return null
    const whole = !!needle || all[p.slug], list = whole ? hit : hit.slice(0, SHOWN)
    const on = (m: string) => p.slug === now.provider && m === now.model
    return (
      <div key={p.slug} role="group" aria-label={p.name} className="[&+&]:border-t [&+&]:border-edge">
        <span className="block px-3 pt-2 pb-1 font-label text-[11px] font-semibold uppercase leading-none tracking-[.08em] text-muted">{p.name}</span>
        {list.map(m => (
          <AriaButton key={m} aria-pressed={on(m)} onPress={() => pick(p.slug, m)} className={`flex min-h-8 w-full cursor-pointer items-center gap-2 px-3 text-left font-body text-[13px] text-text outline-none data-[hovered]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-frame-hi ${on(m) ? 'font-semibold' : ''}`}>
            <span className="min-w-0 flex-1 truncate">{m}</span>
            {picking === `${p.slug}/${m}` ? <Busy label="Saving" /> : on(m) ? <Mark ok label="In use" /> : null}
          </AriaButton>
        ))}
        {!whole && hit.length > SHOWN && (
          <AriaButton onPress={() => setAll({ ...all, [p.slug]: true })} className="flex min-h-8 w-full cursor-pointer items-center px-3 text-left font-body text-[13px] text-muted outline-none data-[hovered]:bg-panel-2 data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-2 data-[focus-visible]:outline-frame-hi">All {hit.length}</AriaButton>
        )}
      </div>
    )
  }).filter(Boolean)

  // the search narrows the other providers too, by name
  const rest = opts.providers.filter(p => !p.signedIn)
  const others = needle && rest.some(p => p.name.toLowerCase().includes(needle)) ? rest.filter(p => p.name.toLowerCase().includes(needle)) : rest
  const g = signing

  return (
    <>
      <SearchField label="Search models" placeholder="Search models" value={q} onChange={setQ} />
      <div className="max-h-[260px] overflow-y-auto rounded-[8px] border border-edge">
        {groups.length ? groups : <div className="px-3 py-2.5"><Note>{signed.length ? 'No model matches.' : 'Sign in to a provider first.'}</Note></div>}
      </div>
      {pickError && <Why>{pickError}</Why>}
      {rest.length > 0 && (
        <>
          <Button role="ghost" aria-expanded={more} onPress={() => setMore(!more)} className="self-start">More providers</Button>
          {more && (
            <div className="flex flex-col gap-1.5">
              {others.map(p => (
                <div key={p.slug} className="flex flex-col gap-2">
                  <Line>
                    <span className="text-text">{p.name}</span>
                    {keyFor === p.slug || (g?.slug === p.slug && !g.done) ? null : <Button role="ghost" onPress={() => signIn(p.slug)}>Sign in</Button>}
                  </Line>
                  {keyFor === p.slug && (
                    <>
                      <Command cmd={keyCommand(p.slug)} />
                      <Acts>{checking ? <Busy label="Checking" /> : <Button role="secondary" onPress={() => keyAgain(p.slug)}>Check again</Button>}</Acts>
                    </>
                  )}
                  {g?.slug === p.slug && !g.done && (
                    <>
                      <Note>Finish in your browser.{g.code ? <> Code <b className="font-semibold tracking-[.06em] text-text">{g.code}</b></> : null}</Note>
                      <Acts>
                        {g.url ? <LinkButton role="secondary" href={g.url} target="_blank" rel="noopener">Open</LinkButton> : <Busy label="Waiting" />}
                        <Button role="ghost" onPress={cancelSignIn}>Cancel</Button>
                      </Acts>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
          {signError && <Why>{signError}</Why>}
        </>
      )}
    </>
  )
}
