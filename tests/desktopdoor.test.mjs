// The Desktop half copies or opens a link for the canvas's frame only after a real click (catalog review of
// e8ae13c4): desktop/plugin.js. It imports @hermes/plugin-sdk, which only Hermes Desktop has, so this reads it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../desktop/plugin.js', import.meta.url), 'utf8')

test('nothing is copied or opened without a click just before it', () => {
  assert.match(src, /const clicked = \(\) => !!navigator\.userActivation\?\.isActive/)
  const door = src.slice(src.indexOf('function useLinkDoor'), src.indexOf('function Canvas'))
  const guard = door.indexOf('if (!clicked())')
  assert.ok(guard > 0, 'the door checks for a click')
  for (const act of ['ctx.os.writeClipboard', 'ctx.os.openExternal']) assert.ok(door.indexOf(act) > guard, `${act} comes after the check`)
  assert.ok(door.indexOf('ev.source !== frame.current.contentWindow') < guard, 'and only messages from its own frame are read at all')
})
