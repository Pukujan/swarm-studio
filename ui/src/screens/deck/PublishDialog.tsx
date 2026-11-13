// Publish (web/canvas/publish.js): the build as a live link on a host the person picks. Three states, always shown:
// publishing (the steps), live (the link, Copy, Open, Post to Feed), failed (why, Retry or another host). The state
// is the build's own (its publish:* events, folded into the model), so it is back after a reload.
import { useEffect, useState } from 'react'
import { Button, LinkButton } from '../../primitives/Button'
import { Dialog } from '../../primitives/Dialog'
import { TextField } from '../../primitives/TextField'
import { HOSTS, STAGES, connectHost, copyText, feedConnect, getHosts, postToFeed, publish, shortReason, shortUrl, type Hosts } from './publish'
import { doneSections, liveUrl, type DeckModel, type Host } from './model'

export function PublishDialog({ model, isOpen, onOpenChange }: { model: DeckModel, isOpen: boolean, onOpenChange: (open: boolean) => void }) {
  // `choose`: the host list, even while a link is live (Publish again)
  const [choose, setChoose] = useState(false)
  const [asked, setAsked] = useState<{ target: Host, error: string } | null>(null)
  useEffect(() => { if (!isOpen) { setChoose(false); setAsked(null) } }, [isOpen])
  const p = model.publish, url = liveUrl(model)
  const run = model.run!

  const go = async (target: Host) => {
    setChoose(false)
    setAsked({ target, error: '' })
    try { await publish(run, target, doneSections(model)) } catch (e) { setAsked({ target, error: e instanceof Error ? e.message : String(e) }) }
  }

  // the newest of what the person asked and what the build says
  const failed = asked?.error ? { target: asked.target, message: asked.error } : p.state === 'failed' ? { target: p.target, message: p.message } : null
  const working = !asked?.error && (p.state === 'working' || (!!asked && p.state !== 'done' && p.state !== 'failed'))
  const view = choose || (!working && !failed && !url) ? 'choose' : working ? 'working' : failed ? 'failed' : 'live'

  return (
    <Dialog title="Publish the website" isOpen={isOpen} onOpenChange={onOpenChange}>
      {view === 'choose' && <Choose onPick={go} />}
      {view === 'working' && <Steps target={asked?.target ?? p.target} stage={p.state === 'working' ? p.stage : 'export'} />}
      {view === 'failed' && failed && (
        <div className="flex flex-col gap-4">
          <p role="alert"><b className="text-hot-text">Not published</b> · {shortReason(failed.message)}</p>
          <div className="flex justify-end gap-2">
            <Button role="secondary" onPress={() => { setAsked(null); setChoose(true) }}>Other host</Button>
            {failed.target && <Button role="primary" onPress={() => go(failed.target!)}>Retry</Button>}
          </div>
        </div>
      )}
      {view === 'live' && (
        <div className="flex flex-col gap-4">
          <p><b>Live</b> · {p.liveTarget ? HOSTS[p.liveTarget].label : ''}{p.pending ? ' · going live' : ''}</p>
          <a href={url} target="_blank" rel="noopener" className="truncate text-text underline">{shortUrl(url)}</a>
          <div className="flex flex-wrap justify-end gap-2">
            <Button role="secondary" onPress={() => { setAsked(null); setChoose(true) }}>Publish again</Button>
            <CopyButton text={url} />
            <LinkButton role="secondary" href={url} target="_blank" rel="noopener">Open ↗</LinkButton>
          </div>
          <FeedRow run={run} />
        </div>
      )}
    </Dialog>
  )
}

function Steps({ target, stage }: { target: Host | null, stage: string }) {
  const names = target ? STAGES[target] : undefined
  if (!names) return <p role="status">Publishing…</p>
  const steps = Object.keys(names), at = Math.max(0, steps.indexOf(stage))
  return (
    <ol role="status" aria-label="Publishing" className="flex flex-col gap-1.5">
      {steps.map((k, i) => (
        <li key={k} className={i < at ? 'text-muted' : i === at ? 'text-text' : 'text-dim'}>{i < at ? '✓' : i === at ? '◌' : '·'} {names[k]}</li>
      ))}
    </ol>
  )
}

// the hosts: GitHub through the person's gh login, Vercel and Cloudflare by a token they connect, or this computer
function Choose({ onPick }: { onPick: (h: Host) => void }) {
  const [hosts, setHosts] = useState<Hosts | null>(null)
  const [again, setAgain] = useState(0)
  useEffect(() => { let on = true; getHosts().then(h => on && setHosts(h), () => on && setHosts({})); return () => { on = false } }, [again])
  if (!hosts) return <p role="status" aria-busy="true">Checking…</p>
  const signed = (h: Host) => (h === 'github' ? !!hosts.github : h === 'local' ? true : !!hosts[h]?.user)
  const Pick = ({ h }: { h: Host }) => (
    <Button role="secondary" isDisabled={!signed(h)} onPress={() => onPick(h)} className="flex-1 justify-between normal-case! tracking-normal!">
      <b className="uppercase tracking-[.07em]">{HOSTS[h].label}</b><span className="font-monospace font-normal text-muted">{signed(h) ? HOSTS[h].how : HOSTS[h].off}</span>
    </Button>
  )
  return (
    <ul className="flex flex-col gap-2">
      {(['github', 'vercel', 'cloudflare', 'local'] as const).map(h => (
        <li key={h}>
          {h === 'github' || h === 'local' || signed(h)
            ? (
                <div className="flex gap-2">
                  <Pick h={h} />
                  {h !== 'github' && h !== 'local' && !hosts[h]?.env && (
                    <Button role="ghost" aria-label={`Disconnect ${HOSTS[h].label}`} onPress={() => connectHost(h, null).finally(() => setAgain(n => n + 1))}>Disconnect</Button>
                  )}
                </div>
              )
            : <Connect host={h} tokenUrl={hosts.providers?.[h]?.tokenUrl} onDone={() => setAgain(n => n + 1)} />}
        </li>
      ))}
    </ul>
  )
}

// a host not connected yet: its token, pasted once (kept by the plugin's server, never in this page)
function Connect({ host, tokenUrl, onDone }: { host: Host, tokenUrl?: string, onDone: () => void }) {
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token.trim()) return
    setBusy(true)
    try { await connectHost(host, token.trim()); setToken(''); onDone() } catch (err) { setError(err instanceof Error ? err.message : String(err)) } finally { setBusy(false) }
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2 rounded-[10px] border border-edge p-3">
      <div className="flex items-baseline justify-between gap-2">
        <b className="font-label uppercase tracking-[.07em]">Connect {HOSTS[host].label}</b>
        {tokenUrl && <a href={tokenUrl} target="_blank" rel="noopener" className="text-muted underline">Get a token</a>}
      </div>
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <TextField label={`${HOSTS[host].label} token`} type="password" autoComplete="off" value={token} onChange={setToken} isInvalid={!!error} errorMessage={error} placeholder="Paste the token" />
        </div>
        <Button role="secondary" type="submit" isDisabled={busy}>{busy ? 'Checking…' : 'Connect'}</Button>
      </div>
    </form>
  )
}

function CopyButton({ text }: { text: string }) {
  const [said, setSaid] = useState('')
  useEffect(() => { if (!said) return; const t = setTimeout(() => setSaid(''), 1800); return () => clearTimeout(t) }, [said])
  return <Button role="secondary" onPress={() => copyText(text).then(ok => setSaid(ok ? 'Copied' : 'Press ⌘C'))}>{said || 'Copy link'}</Button>
}

// Post to Feed, under the live link: Public (in the feed) or Unlisted (link only), one button
function FeedRow({ run }: { run: string }) {
  const [unlisted, setUnlisted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [done, setDone] = useState<{ url: string, unlisted: boolean } | null>(null)
  const [connect, setConnect] = useState<{ code?: string, url?: string } | null>(null)
  const post = async () => {
    setBusy(true)
    setNote('')
    let out = await postToFeed(run, unlisted)
    if (!out.ok && out.connect) {
      // not linked yet: Connect Hermes; once the code is approved, post straight away
      const c = await feedConnect().catch(() => ({} as { connected?: boolean, code?: string, url?: string }))
      if (c.connected) out = await postToFeed(run, unlisted)
      else setConnect(c)
    }
    setBusy(false)
    if (out.ok) { setConnect(null); setDone({ url: out.url ?? '', unlisted: !!out.unlisted || unlisted }) } else if (!out.connect) setNote(out.message || 'The Feed did not take it.')
  }
  if (done) return <p className="border-t border-edge pt-3"><b>In the Feed</b> · {done.unlisted ? 'Unlisted' : 'Public'} · <a href={done.url} target="_blank" rel="noopener" className="underline">{shortUrl(done.url)}</a></p>
  return (
    <div className="flex flex-col gap-2 border-t border-edge pt-3">
      {connect
        ? <p><b>Connect Hermes</b>{connect.code ? ` · ${connect.code}` : ''} {connect.url && <a href={connect.url} target="_blank" rel="noopener" className="underline">Open ↗</a>}</p>
        : (
            <div role="group" aria-label="Who can find it" className="flex gap-1">
              {[false, true].map(u => (
                <Button key={String(u)} role="ghost" aria-pressed={unlisted === u} onPress={() => setUnlisted(u)} className={unlisted === u ? 'bg-panel-2!' : 'text-muted'}>
                  {u ? 'Unlisted' : 'Public'}
                </Button>
              ))}
            </div>
          )}
      <div className="flex justify-end"><Button role="primary" isDisabled={busy} onPress={post}>{busy ? 'Posting…' : 'Post to Feed'}</Button></div>
      {note && <p role="alert" className="text-hot-text">{shortReason(note)}</p>}
    </div>
  )
}
