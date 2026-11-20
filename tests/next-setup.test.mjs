// Setup and Settings in the next UI (ui/src/screens/setup/): their layers are the statechart's, and the parts
// table they draw is the current Studio's own (web/setup-parts.js), so both apps show the same parts and fixes.
// Runs before ui/ is installed (scripts/check.sh), so it reads ui's files and never imports its packages.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { studioMachine } from '../docs/ux/statechart/studio.machine.js'
import { SETTINGS_LAYERS, SETUP_LAYERS } from '../ui/src/screens/setup/layers.ts'
import * as parts from '../web/setup-parts.js'

const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const node = path => path.reduce((n, k) => n.states[k], studioMachine.config)

test("Setup's layers are the statechart's #projects.setup: index, parts, group, part, each up one level", () => {
  const chart = node(['projects', 'setup'])
  assert.deepEqual(Object.keys(SETUP_LAYERS.states), Object.keys(chart.states))
  assert.equal(SETUP_LAYERS.initial, chart.initial)
  for (const [k, s] of Object.entries(chart.states)) {
    // every move the statechart has from a layer, the sheet takes too (`start` and `up` from index close it)
    for (const e of Object.keys(s.on || {})) if (k !== 'index' || (e !== 'up' && e !== 'start')) assert.ok(e in SETUP_LAYERS.states[k].on, `${k} takes ${e}`)
  }
})

test("Settings' first layer is the statechart's #me.settings index, and Setup there is the Setup sheet's Parts", () => {
  const chart = node(['me', 'settings'])
  assert.equal(SETTINGS_LAYERS.initial, chart.initial)
  assert.ok(SETTINGS_LAYERS.states.index)
  assert.equal(chart.states.index.on.setup, '#projects.setup.parts')
  assert.match(read('ui/src/screens/setup/Sheets.tsx'), /onSetup=\{\(\) => setAt\(\{ sheet: 'setup', row: 'parts' \}\)\}/)
  // every other row of the index is a layer one level down, with the way back
  for (const k of ['you', 'lite', 'data']) assert.equal(SETTINGS_LAYERS.states[k].on.up, 'index')
})

test('the next UI draws web/setup-parts.js itself: every name its types declare is one the file exports', () => {
  const declared = [...read('ui/src/screens/setup/studio-setup-parts.d.ts').matchAll(/export declare (?:const|function) (\w+)/g)].map(m => m[1])
  assert.deepEqual(declared.sort(), ['GROUPS', 'keyCommand', 'statesOf', 'tally'])
  for (const name of declared) assert.ok(name in parts, name)
  assert.match(read('ui/vite.config.ts'), /'@studio\/setup-parts', replacement: fileURLToPath\(new URL\('\.\.\/web\/setup-parts\.js'/)
})

test('the sheets never take, show or keep a key: a key is given to Hermes in the person\'s own terminal', () => {
  const src = ['ModelPicker', 'ModelsSheet', 'PartsRow', 'SetupSheet', 'SettingsSheet', 'fixtures'].map(f => read(`ui/src/screens/setup/${f}.${f === 'fixtures' ? 'ts' : 'tsx'}`)).join('\n')
  // no box to type a key into, and nothing sends one: the command Hermes asks for it with, then Check again
  assert.doesNotMatch(src, /type="password"/)
  assert.doesNotMatch(src, /models\/signin', \{[^}]*\bkey\b/)
  assert.match(read('ui/src/screens/setup/ModelPicker.tsx'), /<Command cmd=\{keyCommand\(p\.slug\)\} \/>/)
  assert.equal(parts.keyCommand('anthropic'), 'hermes auth add anthropic --type api-key')
  assert.doesNotMatch(read('web/setup.js'), /type="password"|models\/signin', \{[^}]*\bkey\b/)
  // the allowlist is never written by the studio: no route to it, only the command Parts shows
  assert.doesNotMatch(src, /mcp_allowlist/)
  assert.doesNotMatch(src, /\.env\b/)
  assert.doesNotMatch(read('ui/src/screens/setup/fixtures.ts'), /sk_|msy-|key":\s*"/)
})

test('Models opens in the next UI: the user menu and the chat\'s Other… open its sheet, and Change opens Setup on Models', () => {
  const projects = read('ui/src/screens/Projects.tsx')
  // the row is this app's sheet, with no address in the classic Studio
  assert.match(projects, /<MenuRow key="m" id="models" icon="sliders" label="Models" \/>/)
  assert.match(projects, /key === 'models'\) sheets\.open\(key\)/)
  const sheets = read('ui/src/screens/setup/Sheets.tsx')
  assert.match(sheets, /<ModelsSheet onClose=\{\(\) => setAt\(null\)\} onSetup=\{\(\) => setAt\(\{ sheet: 'setup', row: 'models' \}\)\} \/>/)
  // the chat's Other… opens it wherever the sheets are, unless a screen gives its own
  const chat = read('ui/src/chat/Chat.tsx')
  assert.match(chat, /const moreModels = onMoreModels \?\? models/)
  assert.match(chat, /if \(id === OTHER\) moreModels\?\.\(\)/)
  // the same routes and roles as the current Studio's pop (web/canvas/settings.js)
  const sheet = read('ui/src/screens/setup/ModelsSheet.tsx')
  for (const route of ["get<ModelsInfo>('/api/models')", "get<Options>('/api/setup/models/options')", "post<{ ok?: boolean }>('/api/models', body)"]) assert.ok(sheet.includes(route), route)
  for (const role of ["role: 'planner'", "role: 'worker'", "role: 'reviewer'", "role: 'image'", "role: 'lite'"]) assert.ok(sheet.includes(role), role)
  assert.doesNotMatch(sheet, /classic/i)
})
