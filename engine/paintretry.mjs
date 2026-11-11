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
