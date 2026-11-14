// The GitHub door's words (web/github.js): which typed messages are its moves, and what the sheet and the chat
// say in each state. The engine and the routes are tests/sourcehub.test.mjs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { githubAsk, githubAgo, githubLines, githubWhere } from '../web/github.js'

test('the typed moves: only a message that is one of them, whole', () => {
  for (const t of ['push to github', 'Push to GitHub.', 'push it to github', 'please push this to github', 'push the game to github', 'send the source to github', 'put it on github']) assert.deepEqual(githubAsk(t), { did: 'push' }, t)
  for (const t of ['pull from github', 'Pull from GitHub!', 'update it from github', 'pull the latest changes from github', 'sync from github']) assert.deepEqual(githubAsk(t), { did: 'pull' }, t)
  for (const t of ['where is this on github', 'Where is it on GitHub?', 'is this on github?', 'where is the game on github', 'github status']) assert.deepEqual(githubAsk(t), { did: 'where' }, t)
  assert.deepEqual(githubAsk('link Pukujan/ares'), { did: 'link', repo: 'Pukujan/ares' })
  assert.deepEqual(githubAsk('link to https://github.com/Pukujan/ares.git'), { did: 'link', repo: 'Pukujan/ares' })
  assert.deepEqual(githubAsk('Link it to pukujan/night-runner.'), { did: 'link', repo: 'pukujan/night-runner' })
  // a change for the crew is never a move
  for (const t of ['', 'push the button to the left', 'push to github and then add a shop', 'add a link to github in the footer', 'link the about page', 'link a/b/c', 'link https://gitlab.com/a/b', 'pull the hero image up', 'make a github page', 'github']) assert.equal(githubAsk(t), null, t)
})

test('times are said the short way', () => {
  const now = 1e12
  assert.equal(githubAgo(null, now), ''); assert.equal(githubAgo(now - 20000, now), 'just now'); assert.equal(githubAgo(now - 3 * 60000, now), '3 min ago')
  assert.equal(githubAgo(now - 5 * 3600000, now), '5 h ago'); assert.equal(githubAgo(now - 3 * 86400000, now), '3 d ago')
})

const base = { project: 'p', name: 'ARES', piece: 'game', pieces: ['game'], run: 'r', source: true, login: 'me', suggest: 'ares', link: null, origin: null, ahead: false, behind: null, unreachable: null, job: null }
const now = 1e12
test('every state is said in a few plain lines, and the chat answers with the same ones', () => {
  assert.deepEqual(githubLines({ ...base, source: false, run: null }, now), ['No app or game here yet'])
  assert.deepEqual(githubLines(base, now), ['Not on GitHub'])
  assert.deepEqual(githubLines({ ...base, origin: { repo: 'Pukujan/swarm-studio', path: 'games/ares', url: '', pulled: null }, behind: true }, now), ['Brought in from Pukujan/swarm-studio/games/ares', 'New commits to pull'])
  const link = { repo: 'me/ares', url: 'https://github.com/me/ares', private: true, pushed: now - 120000, pulled: null, fits: true }
  assert.deepEqual(githubLines({ ...base, link, behind: false }, now), ['me/ares, private', 'Pushed 2 min ago', 'Up to date'])
  assert.deepEqual(githubLines({ ...base, link: { ...link, private: false, pulled: now - 60000 }, ahead: true, behind: true }, now), ['me/ares, public', 'Pulled 1 min ago', 'Changes not pushed', 'New commits to pull'])
  assert.deepEqual(githubLines({ ...base, link: { ...link, fits: false }, behind: false }, now), ['me/ares, private', 'Pushed 2 min ago', 'This version needs a repository of its own'])
  // not checked (no answer from GitHub) is never called up to date
  assert.deepEqual(githubLines({ ...base, link, unreachable: 'Could not reach me/ares: timed out' }, now), ['me/ares, private', 'Pushed 2 min ago', 'Could not reach me/ares: timed out'])
  assert.deepEqual(githubLines({ ...base, login: null }, now), ['Not on GitHub', 'Not signed in: run gh auth login'])
  assert.equal(githubWhere(base, now), 'Not on GitHub. Say "push to github" to put its source there, private.')
  assert.equal(githubWhere({ ...base, link, ahead: true, behind: false }, now), 'me/ares, private. Pushed 2 min ago. Changes not pushed.')
  assert.equal(githubWhere({ ...base, source: false }, now), 'No app or game here yet. Bring one in from its GitHub menu.')
})

test('the door is in a project\'s menu and on its card, typed moves are taken before the builder, and the hosted studio has none', () => {
  const read = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  assert.match(read('web/index.html'), /<button class="toggle" id="github-btn"><i data-i="git-branch"><\/i>GitHub<\/button>/)
  assert.match(read('web/home.js'), /label: 'GitHub', run: \(\) => sw\.github\.open\(id\)/)
  const loop = read('web/canvas/loop.js')
  assert.ok(loop.indexOf('github.say(els.brief.value)') < loop.indexOf('await modeSend(modeHelp)'), 'before the chat\'s mode takes the message')
  assert.match(read('web/project.js'), /sw\.github\?\.say\(text\)/)
  assert.match(read('web/canvas/hook.js'), /github: BOOT\.hosted \? null/)
  assert.match(read('web/home.css'), /body\.hosted #github-btn \{ display: none !important; \}/)
  assert.match(read('server/page.mjs'), /'github\.js'/)
  // no tooltip anywhere in the sheet
  assert.ok(!/title=|data-tip/.test(read('web/github.js')))
})
