// Why a build stopped, in words for the chat and the status pill: {code, message, action}.
//   person   the person pressed Stop
//   replaced a newer build started (only one website build runs at a time)
//   hermes   Hermes went away or was never there (engine/hermeshealth.mjs says which)
//   model    the model's provider refused or failed, with the provider's own reason (a budget cap, a limit)
//   timeout  the model took too long
// "Stopped before any page was planned." on its own told nobody anything.

export const STOPS = {
  person: 'Stopped by you.',
  replaced: 'Stopped: a newer build started.',
  timeout: 'Stopped: the model took too long to answer.'
}
export const PILL = { person: 'stopped', replaced: 'stopped: replaced', hermes: 'stopped: no Hermes', model: 'stopped: model', timeout: 'stopped: timed out' }

// What a run's controller was aborted with: 'person', 'replaced', or Hermes's {code: 'hermes_…', message, action}
export function reasonFromAbort(r) {
  if (r && typeof r === 'object' && typeof r.code === 'string' && typeof r.message === 'string') {
    return { code: r.code.startsWith('hermes') ? 'hermes' : r.code, message: r.message, action: String(r.action || '') }
  }
  if (r === 'replaced') return { code: 'replaced', message: STOPS.replaced, action: '' }
  return { code: 'person', message: STOPS.person, action: '' }
}

// The provider's own words from a failed call's text ("planner: HTTP 402 {"error":{"message":"…"}}")
export function providerSaid(text) {
  const t = String(text || '')
  const json = t.match(/HTTP \d{3}\s*(\{[\s\S]*)$/)
  if (json) {
    try {
      const e = JSON.parse(json[1]).error
      const said = typeof e === 'string' ? e : e?.message
      if (said) return String(said)
    } catch {}
    const loose = json[1].match(/"message"\s*:\s*"((?:[^"\\]|\\.){1,300})/)
    if (loose) return loose[1].replace(/\\"/g, '"')
  }
  return ''
}

// A failed model call's text (an 'error' event's message) as a stop reason. viaHermes: the call went
// through Hermes, so a connection that broke part way is Hermes going away, not the model.
export function reasonFromFailure(text, { viaHermes = false } = {}) {
  const t = String(text || '')
  const status = Number((t.match(/HTTP (\d{3})/) || [])[1]) || 0
  if (!status && viaHermes && /terminated|ECONNRESET|ECONNREFUSED|socket hang up|fetch failed|other side closed/i.test(t)) return { code: 'hermes', message: 'Hermes closed during the build. What was built is kept.', action: 'Open Hermes again and the build goes on.' }
  if (!status && /abort|timed? ?out|took too long|stall/i.test(t)) return { code: 'timeout', message: STOPS.timeout, action: 'Try again; if it keeps happening, pick a faster model in `hermes model`.' }
  if (/Hermes isn't connected|Restart Hermes to finish|hermes_(closed|updated)/.test(t)) {
    const updated = /Restart Hermes|hermes_updated/.test(t)
    return { code: 'hermes', message: updated ? 'Swarm Studio was updated. Restart Hermes to finish.' : "Hermes isn't connected.", action: updated ? 'Run `hermes gateway restart`, or quit Hermes Desktop and open it again.' : 'Open Hermes Desktop, or run `hermes swarm`, then try again.' }
  }
  const said = providerSaid(t).replace(/\s+/g, ' ').trim().slice(0, 200)
  const action = status === 402 ? "Check the provider's credit or budget cap, then try again."
    : status === 429 ? 'Wait a minute, then try again.'
      : status === 401 || status === 403 ? 'Check the model key in Hermes (`hermes model`).'
        : 'Try again, or pick another model in `hermes model`.'
  return { code: 'model', message: `Stopped: the model didn't answer${said ? ` (${said})` : status ? ` (HTTP ${status})` : ''}.`, action }
}
