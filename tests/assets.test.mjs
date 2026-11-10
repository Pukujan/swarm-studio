import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listAssets, assetFiles, artName } from '../engine/assets.mjs'

test('a game picture id reads as a name', () => {
  assert.equal(artName('title'), 'Title')
  assert.equal(artName('portrait-lokee'), 'Lokee portrait')
  assert.equal(artName('boon-applause-heal'), 'Applause heal boon')
  assert.equal(artName('room-hub'), 'Hub room')
})

test("a run's pictures: the newest per slot, a game's kept art, its models, and what is still to come", () => {
  const events = [
    { type: 'image', page: 'home', layer: 'home-hero', gen: 'a', src: '/img/r1/1.webp', t: 1 },
    { type: 'image', page: 'home', layer: 'home-hero', gen: 'b', src: '/img/r1/2.webp', t: 2 },
    { type: 'image:queued', page: 'about', layer: 'about-team', gen: 'c' },
    { type: 'image:queued', page: 'home', layer: 'home-hero', gen: 'b' }
  ]
  const files = { img: ['1.webp', 'game-title.webp', 'game-portrait-lokee.webp', 'snap.jpg'], models: ['knight.glb', 'notes.txt'] }
  const plan = [{ id: 'title' }, { id: 'portrait-lokee' }, { id: 'room-hub' }]
  const { assets, next } = listAssets({ id: 'r1', events, files, plan, pieceName: e => e.layer })
  assert.deepEqual(assets.filter(a => a.kind === 'art').map(a => a.src), ['/img/r1/2.webp', '/img/r1/game-title.webp', '/img/r1/game-portrait-lokee.webp'])
  assert.deepEqual(assets.filter(a => a.kind === 'model').map(a => a.name), ['Knight'])
  assert.deepEqual(next, ['Hub room', 'about-team'])
})

test('a run with nothing yet lists nothing, and its files are read from its folder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'assets-'))
  assert.deepEqual(assetFiles(dir), { img: [], models: [] })
  mkdirSync(join(dir, 'img'))
  writeFileSync(join(dir, 'img', 'game-title.webp'), 'x')
  assert.deepEqual(assetFiles(dir).img, ['game-title.webp'])
  assert.deepEqual(listAssets({ id: 'r2' }), { assets: [], next: [] })
})
