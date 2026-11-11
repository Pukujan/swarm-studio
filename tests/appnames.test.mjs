// node --test tests/appnames.test.mjs
// A new app's tab title and deploy name come from its project, never its first
// screen; and the app rules never let a fake sign-in through.
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appJobs, sitePrompt, titleApp, AUTH } from '../engine/appjob.mjs'
import { supabaseAsk } from '../engine/auto.mjs'

const APP = 'ARES Player Hub — the account app for ARES, an original fast first-person arena shooter boss rush where players sign in.'
const ID = '2026-11-11T03-33-59-295Z'

function world(nameFor = () => null) {
  const runsDir = mkdtempSync(join(tmpdir(), 'swarm-appnames-'))
  const dir = join(runsDir, ID, 'app')
  mkdirSync(dir, { recursive: true })
  // what an engine turn left behind: named after the first screen
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'sign-in-to-ares' }))
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>Sign In to ARES</title></head><body></body></html>')
  const events = [{ type: 'run:start', brief: APP, title: 'Sign In to ARES' }, { type: 'page', id: 'signin', title: 'Sign In to ARES', index: 0 }]
  const a = appJobs({ runsDir, record: () => {}, broadcast: () => {}, readEvents: id => (id === ID ? events : null), provider: () => null, modelFor: () => null, nameFor })
  const deployed = []
  const publishVercel = async opts => { deployed.push(opts); return { url: `https://${opts.name}-x.vercel.app/`, repo: `vercel:${opts.name}` } }
  return { a, dir, deployed, publishVercel, cleanup: () => rmSync(runsDir, { recursive: true, force: true }) }
}

test('deploy: the name and the page title come from the project, not the first screen', async () => {
  const w = world()
  try {
    await w.a.deploy(ID, { creds: {}, dataDir: w.dir, publishVercel: w.publishVercel })
    assert.equal(w.deployed[0].name, 'ares-app')
    assert.match(readFileSync(join(w.dir, 'index.html'), 'utf8'), /<title>ARES<\/title>/)
  } finally { w.cleanup() }
})

test('deploy: the projects index name wins', async () => {
  const w = world(() => ({ name: 'Ares Arena', kind: 'app' }))
  try {
    await w.a.deploy(ID, { creds: {}, dataDir: w.dir, publishVercel: w.publishVercel })
    assert.equal(w.deployed[0].name, 'ares-arena-app')
    assert.match(readFileSync(join(w.dir, 'index.html'), 'utf8'), /<title>Ares Arena<\/title>/)
  } finally { w.cleanup() }
})

test('titleApp keeps a real title and replaces a screen or starter one', () => {
  const dir = mkdtempSync(join(tmpdir(), 'swarm-title-'))
  try {
    const f = join(dir, 'index.html')
    writeFileSync(f, '<head><title>ARES Player Hub</title></head>')
    assert.equal(titleApp(dir, 'ARES'), false)
    assert.match(readFileSync(f, 'utf8'), /ARES Player Hub/)
    writeFileSync(f, '<head><title>Vite + React + TS</title></head>')
    assert.equal(titleApp(dir, 'ARES'), true)
    assert.match(readFileSync(f, 'utf8'), /<title>ARES<\/title>/)
    writeFileSync(f, '<head></head>')
    assert.equal(titleApp(dir, 'A<B'), true)
    assert.match(readFileSync(f, 'utf8'), /<title>A&lt;B<\/title>/)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('app rules: real sign-in or a labelled guest pass, and no dead provider buttons', () => {
  const snap = { brand: 'ARES', brief: APP, pages: [{ id: 'signin', title: 'Sign In to ARES', sections: [{ role: 'sign-in form' }] }] }
  for (const p of [sitePrompt(snap, ''), sitePrompt(snap, 'add a leaderboard')]) {
    assert.ok(p.includes(AUTH))
  }
  assert.match(AUTH, /Supabase Auth/)
  assert.match(AUTH, /Guest pass/)
  assert.match(AUTH, /scrypt/)
  assert.match(AUTH, /Never accept any name with any password/)
  assert.match(AUTH, /DISCORD_CLIENT_ID/)
  assert.match(AUTH, /never ship a button that does nothing/)
  assert.match(supabaseAsk('ares'), /Supabase Auth/)
})
