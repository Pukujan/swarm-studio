// The one-time Setup sheet (docs/specs/06-onboarding.md), its engine half: what a build uses for
// pictures, and whether the models Hermes passed answer. Pure functions; the server keeps the state.
import { chooseImage } from './paintretry.mjs'

// What a build uses for pictures unless that build says otherwise:
//   painted  an image model paints each picture; a stock photo holds the slot until it lands
//   stock    photos from the built-in library and Pexels fill the slots; nothing is painted
//   drawn    the builders draw in SVG: no picture slots, no photos, no image model
export const PICTURES = ['painted', 'stock', 'drawn']
export const isPictures = v => PICTURES.includes(v)

// The Pictures row. `providers` is Hermes's image list ({ provider, available, models, default }),
// `imagePick` the Models menu's pick ({ provider, model }, 'off' or nothing), `pick` the person's
// Pictures pick, `last` the last real paint ({ provider, ok, error }). No picture is painted to
// find out: that would spend the person's credits without asking.
//
// The default is painted when an image model is ready, else drawn, so a first build never comes
// out with empty picture slots. A pick, once made, is kept.
export function pictureState({ providers = [], imagePick = null, pick = null, last = null } = {}) {
  const choice = imagePick === 'off' ? null : chooseImage(providers, imagePick)
  const refused = !!choice && !!last && last.ok === false && last.provider === choice.provider
  const ready = !!choice && !refused
  const fallback = ready ? 'painted' : 'drawn'
  return {
    mode: isPictures(pick) ? pick : imagePick === 'off' ? 'drawn' : fallback,
    picked: isPictures(pick),
    fallback,
    painted: { provider: choice?.provider || '', model: choice?.model || '', ready, ...(refused ? { error: oneLine(last.error) } : {}) }
  }
}

// What one build does, from its mode and the image model (null when none is signed in).
// Painted with no model still leaves picture slots, and stock photos fill them: never empty.
//   images: the builders leave picture slots (else they draw in SVG)
//   paint:  the slots are painted by the image model
export function pictureRun(mode, choice) {
  if (mode === 'drawn') return { images: false, paint: false }
  if (mode === 'stock') return { images: true, paint: false }
  return { images: true, paint: !!choice }
}

const oneLine = s => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 160)
// a provider's error, as one line a person can read: the HTTP status and its message, never a key
export function modelError(err) {
  const text = oneLine(err?.message || err)
  const said = text.match(/"message"\s*:\s*"([^"]{3,140})"/)?.[1]
  const http = text.match(/HTTP (\d{3})/)?.[1]
  if (said) return http ? `${http}: ${said}` : said
  return text.replace(/(sk|key|Bearer)[-_ ]?[A-Za-z0-9_-]{12,}/g, '…') || 'No answer'
}

// The Models row: one tiny call to the planner and one to the builders. `roles` is
// { planner: { model, baseUrl, apiKey }, worker: … }; `call(provider, model)` makes the call and
// throws when the model does not answer. A result is kept for `keepMs`, so opening the sheet
// again costs nothing; `again` asks afresh.
export function modelTester({ call, keepMs = 10 * 60e3, now = Date.now } = {}) {
  const kept = new Map()
  async function one(role, r) {
    if (!r?.apiKey || !r?.model) return { model: r?.model || '', ok: false, error: 'No model yet' }
    const key = `${role}|${r.baseUrl}|${r.model}`, had = kept.get(key)
    if (had && now() - had.at < keepMs) return had.result
    const t = now()
    let result
    try { await call({ baseUrl: r.baseUrl, apiKey: r.apiKey, hermes: r.hermes }, r.model); result = { model: r.model, ok: true, ms: Math.round(now() - t) } }
    catch (err) { result = { model: r.model, ok: false, error: modelError(err) } }
    kept.set(key, { at: now(), result })
    return result
  }
  return {
    async test(roles, { again = false } = {}) {
      if (again) kept.clear()
      const [planner, worker] = await Promise.all([one('planner', roles?.planner), one('worker', roles?.worker)])
      return { ok: planner.ok && worker.ok, planner, worker }
    }
  }
}

// A paint the provider refused for a reason that will not pass by itself: out of quota or credit,
// a spending limit, not signed in. A timeout or a passing upstream error is not one.
const REFUSED = /\b(401|402|403|429)\b|usage limit|quota|insufficient|billing|credits?\b|spending|unauthori[sz]ed|forbidden|not signed in/i
export const paintNote = (choice, r) => {
  const used = r?.backup || choice
  if (!used?.provider) return null
  if (r?.ok && r.path) return { provider: used.provider, ok: true }
  return REFUSED.test(String(r?.error || '')) ? { provider: choice.provider, ok: false, error: oneLine(r.error) } : null
}
