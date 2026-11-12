import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickRepo } from '../engine/publish.mjs'

// a fake GitHub: these repos exist, with these descriptions
const gh = repos => async name => { if (name in repos) return repos[name]; throw Object.assign(new Error('HTTP 404 Not Found'), { stderr: '' }) }
const ours = 'Bot Wiki · made with Swarm Studio'

test('a new project gets its own name when it is free', async () => {
  assert.deepEqual(await pickRepo('me', 'bot-wiki', { check: gh({}) }), { repo: 'bot-wiki', fresh: true })
})

test('a second project with the same name does not take the first one\'s repo', async () => {
  const out = await pickRepo('me', 'bot-wiki', { taken: new Set(['bot-wiki']), check: gh({ 'bot-wiki': ours }) })
  assert.deepEqual(out, { repo: 'bot-wiki-site', fresh: true })
})

test('a project publishes again to the repo it had, even under a new name', async () => {
  const out = await pickRepo('me', 'bot-wiki-v2', { mine: 'me/bot-wiki-site', taken: new Set(['bot-wiki']), check: gh({ 'bot-wiki': ours, 'bot-wiki-site': ours }) })
  assert.deepEqual(out, { repo: 'bot-wiki-site', fresh: false })
})

test('a repo the studio did not make is never touched', async () => {
  const out = await pickRepo('me', 'bot-wiki', { check: gh({ 'bot-wiki': 'my own thing' }) })
  assert.deepEqual(out, { repo: 'bot-wiki-site', fresh: true })
})
