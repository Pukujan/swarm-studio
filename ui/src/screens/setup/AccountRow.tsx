// Setup › Account: Swarm Feed, signed in first (Google, GitHub or Discord), then this install is linked to that
// account. Never a guest: a profile with no sign-in of its own is shown as one, with the fix. While a sign-in is
// open in the browser, it asks every few seconds whether it came back.
import { useEffect, useState } from 'react'
import { Busy } from '../../primitives/Busy'
import { Button } from '../../primitives/Button'
import { Disclosure } from '../../primitives/Disclosure'
import { post } from './api'
import { Acts, Line, Mark, Note, Val, Why } from './bits'
import type { Account } from './types'

const PROVIDERS = [{ k: 'google', label: 'Google' }, { k: 'github', label: 'GitHub' }, { k: 'discord', label: 'Discord' }] as const

type Answer = { ok?: boolean, message?: string, account?: Account }

export function AccountRow({ account: a, setAccount, isExpanded, onToggle }: {
  account: Account
  setAccount: (a: Account) => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const [error, setError] = useState('')

  useEffect(() => {
    if (!a.pending) return
    const t = setTimeout(async () => {
      const r = await post<Answer>('/api/setup/account', { check: true })
      // a new object each time, so the watch goes on while it is still pending
      setAccount(r?.account ? r.account : { ...a })
    }, 3000)
    return () => clearTimeout(t)
  }, [a, setAccount])

  async function sign(provider: string) {
    setError('')
    const r = await post<Answer>('/api/setup/account', { provider }) ?? { ok: false, message: 'The Feed did not answer.' }
    if (r.account) setAccount(r.account)
    if (!r.ok && r.message) setError(r.message)
  }
  async function cancel() {
    const r = await post<Answer>('/api/setup/account', { cancel: true })
    if (r?.account) setAccount(r.account)
  }

  const state = a.connected
    ? <><Val>{a.guest ? 'Guest' : a.handle ? `@${a.handle}` : a.name || 'Signed in'}</Val><Mark ok={!a.guest} label={a.guest ? 'Guest profile' : 'Signed in'} /></>
    : a.pending ? <><Val>Waiting</Val><Busy label="Waiting" /></> : <Val>Skipped</Val>
  const providers = (
    <div className="flex gap-2 [&>*]:min-w-0 [&>*]:flex-1">
      {PROVIDERS.map(p => <Button key={p.k} role="secondary" onPress={() => sign(p.k)}>{p.label}</Button>)}
    </div>
  )
  return (
    <Disclosure name="Account" state={state} isExpanded={isExpanded} onToggle={onToggle}>
      {a.connected ? (
        <>
          <Line><span className="text-text">{a.name || a.handle}{a.handle ? <span className="text-muted"> @{a.handle}</span> : null}</span></Line>
          {a.guest && <><Why>A guest profile. Sign in to make it yours.</Why>{providers}</>}
        </>
      ) : (
        <>
          {a.pending ? (
            <>
              <Note>Finish in your browser. Code <b className="font-semibold tracking-[.06em] text-text">{a.pending.code || ''}</b></Note>
              <Acts>
                <Button role="ghost" onPress={() => { post('/api/setup/account', { reopen: true }) }}>Open again</Button>
                <Button role="ghost" onPress={cancel}>Cancel</Button>
              </Acts>
            </>
          ) : providers}
          {error && <Why>{error}</Why>}
        </>
      )}
      <Note>Builds stay on this computer. Publish and Post make them public.</Note>
    </Disclosure>
  )
}
