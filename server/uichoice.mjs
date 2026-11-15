// Which Studio `/` opens (decision 0024): the next UI (ui/, React), unless the person chose the classic one with
// "Use the classic Studio", or there is no next UI to serve (a clone with no ui/dist/, decision 0018). The choice
// is kept in the data folder's ui.json, not a cookie: Hermes Desktop shows the Studio in a frame with an opaque
// origin, where a cookie does not stay. `/classic/` always opens the classic Studio, at the same address.
//
//   GET  /api/ui              -> { ui: 'next' | 'classic' }
//   POST /api/ui { ui }       -> the same, after saving it
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const UIS = ['next', 'classic']

export function uiChoice({ dataDir }) {
  const file = join(dataDir, 'ui.json')
  const get = () => { try { const ui = JSON.parse(readFileSync(file, 'utf8')).ui; return UIS.includes(ui) ? ui : 'next' } catch { return 'next' } }
  const set = ui => { mkdirSync(dataDir, { recursive: true }); writeFileSync(file, JSON.stringify({ ui })); return ui }
  return { get, set }
}
