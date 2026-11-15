// throwaway (#530): the replay scene's first steps, as motion-parity recorded them
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
const dir = process.argv[2]
for (const d of readdirSync(dir)) {
  const f = join(dir, d, 'trace.json')
  if (!existsSync(f)) continue
  const t = JSON.parse(readFileSync(f, 'utf8')).replay
  if (!t?.steps) continue
  console.log(d, JSON.stringify(t.steps.slice(0, 3).map(s => ({ t: s.t, cursors: s.cursors.filter(c => /Hermia/.test(c.id)) }))))
}
