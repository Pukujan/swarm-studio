// web/reveal.js (#560): "Show in Finder" names the file manager this computer has
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { revealLabel } from '../web/reveal.js'
import { CANVAS_MODULES, studioModules } from '../server/page.mjs'

test('Finder on a Mac, Explorer on Windows, the folder elsewhere', () => {
  assert.equal(revealLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36'), 'Show in Finder')
  assert.equal(revealLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'), 'Show in Explorer')
  assert.equal(revealLabel('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'), 'Show in folder')
})

test('both of the classic page\'s module scripts carry it before the files that use it', () => {
  assert.ok(CANVAS_MODULES.indexOf('reveal.js') >= 0 && CANVAS_MODULES.indexOf('reveal.js') < CANVAS_MODULES.indexOf('canvas/film.js'))
  const s = studioModules('web')
  assert.ok(s.indexOf('reveal.js') >= 0 && s.indexOf('reveal.js') < s.indexOf('home.js'))
})
