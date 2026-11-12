// The board shell (web/board.js) shared by the Plan board and the brand sheet: one stage, camera,
// inspector, Esc and toast; each board keeps its own cards and behaviour, and can be focused from outside.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const web = f => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'web', f), 'utf8')

test('both boards are built on the shared shell, with no second copy of the gestures', () => {
  const board = web('board.js')
  for (const k of ['frameAll', 'focus', 'inspector', 'toast', 'applyCam', "'wheel'", "'pointerdown'", "'Escape'"]) assert.ok(board.includes(k), k)
  for (const f of ['plan.js', 'brand.js']) {
    const s = web(f)
    assert.match(s, /import \{ makeBoard \} from '\.\/board\.js'/, f)
    assert.match(s, /makeBoard\(\{ root, cls: 'project plan/, f)
    assert.doesNotMatch(s, /addEventListener\('wheel'|addEventListener\('pointerdown'|toastEl/, f)
    assert.match(s, /focus: \(target, animate = true\) => bd\.focus\(target, animate\)/, f)
  }
})

test('the Plan board keeps its own behaviour on the shell', () => {
  const s = web('plan.js')
  assert.match(s, /firstKey && P\.checked !== `\$\{p\.id\}:\$\{p\.first\.src\}` && !P\.sel/, 'the first picture is selected')
  assert.match(s, /\[data-replan\]/)
  assert.match(s, /slot\(`sp:\$\{x\.name\}`/, 'sprite rows')
  assert.match(s, /'Build one' : 'Build'\) : `Lock · \$\{cost/, 'the gate label')
  // which sections show still follows the plan's shape
  assert.match(s, /p\.shape\?\.backdrops === false \? '' : `<section class="pj-sec pl-world" data-sec="world"/)
  assert.match(s, /p\.shape\?\.closeups !== false/)
  for (const n of ['cards', 'sheets', 'build', 'mocks', 'world', 'close']) assert.ok(s.includes(`data-sec="${n}"`), n)
  for (const n of ['story', 'palette', 'type']) assert.ok(web('brand.js').includes(`data-sec="${n}"`), n)
})

test('the page inlines the shell before the boards', () => {
  const page = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'server', 'page.mjs'), 'utf8')
  assert.match(page, /'board\.js', 'plan\.js', 'brand\.js'/)
})
