// One picture that doesn't give up on the first refusal. An image service sometimes refuses
// for a passing reason (an upstream 400 such as "nothing available to edit right now", a 5xx,
// a timeout), and that picture was simply left out of the game. Now it is tried once more
// after a short wait, then once on another signed-in image provider. Out of quota is not
// retried here: the caller stops painting and shows its own card.
//
//   paint(choice) -> { ok, path, error }    one try on that provider
//   backup()      -> another choice, or null (asked only when needed)
// -> the first result that worked (with `secondTry` or `backup` set), else the last failure.
// The backup's own error is not passed on: its quota running out must not stop the build's painting.
const isOk = r => !!(r && r.ok && r.path)

export async function paintWithBackup(paint, { choice, backup = async () => null, quota = /(?!)/, waitMs = 6000, wait = ms => new Promise(r => setTimeout(r, ms)), exists = () => true } = {}) {
  const good = r => isOk(r) && exists(r.path)
  const tryOn = c => Promise.resolve().then(() => paint(c)).catch(err => ({ ok: false, error: String(err?.message || err) }))
  const first = await tryOn(choice)
  if (good(first) || quota.test(String(first?.error || ''))) return first
  await wait(waitMs)
  const again = await tryOn(choice)
  if (good(again)) return { ...again, secondTry: true }
  if (quota.test(String(again?.error || ''))) return again
  const alt = await Promise.resolve().then(backup).catch(() => null)
  if (!alt || (alt.provider === choice?.provider && alt.model === choice?.model)) return again
  const other = await tryOn(alt)
  return good(other) ? { ...other, backup: alt } : { ...again, error: `${again?.error || 'no image'} (${alt.provider} could not paint it either)` }
}

// The image model for a build, from the image sources ({ provider, available, models, default }): Hermes's
// own image tool through the bridge ('hermes', engine/bridge.mjs) and the studio's ckff key, and the person's
// pick ({ provider, model }, 'off' or nothing). A pick that is not available must not switch pictures off for
// the whole build (the builders are then told to draw blocks instead of leaving picture slots): it falls
// back to Hermes, else to ckff, else to any source that is available. A model the source does not list
// gives way to its default.
const HERMES = { provider: 'hermes', model: '' }
export function chooseImage(list = [], pick = null) {
  if (pick === 'off') return null
  const ready = list.filter(x => x && x.available)
  const want = pick && pick.provider ? pick : HERMES
  const p = ready.find(x => x.provider === want.provider)
  if (p) {
    const known = !p.models?.length || p.models.includes(want.model)
    return { provider: p.provider, model: (known && want.model) || p.default || '' }
  }
  const other = ready.find(x => x.provider === HERMES.provider) || ready.find(x => x.provider === 'ckff') || ready[0]
  if (!other) return null
  return { provider: other.provider, model: other.default || '', insteadOf: pick?.provider || undefined }
}
