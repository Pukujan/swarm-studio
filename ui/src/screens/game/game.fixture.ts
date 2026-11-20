// The Game room's mock-up data, in the routes' own answer shapes (model.ts): one game, Lantern Run, at each state the
// room draws differently. The stories and ui/test/gameroom.test.mjs read it; nothing here reaches a server.
import type { GameMap, GameState, GameStep, SheetCell } from './model'

export const RUN = 'r-lantern'
const pic = (fill: string, mark: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="${fill}"/><circle cx="8" cy="8" r="4" fill="${mark}"/></svg>`)}`
const CELLS: [string, string, string?][] = [['hero', 'Hero'], ['crow', 'Crow'], ['lantern', 'Lantern'], ['market', 'Night market', 'wide'], ['stall', 'Stall'], ['coin', 'Coin'], ['title', 'Title screen', 'wide'], ['boss', 'The Collector']]
// the art plan with the first `n` pictures painted
export const sheet = (n: number): SheetCell[] => CELLS.map(([id, name, aspect], i) => ({ id, name, aspect: aspect || 'square', src: i < n ? pic(['#1f2430', '#2b2622', '#33291f', '#1d1d1f'][i % 4], ['#f2c14e', '#c4623a', '#8fb8de', '#f6f1e7'][i % 4]) : null }))

export const map: GameMap = {
  kind: 'game', version: 'v1', say: 'Slice 2 of 4 is being built: the crows and the lantern’s light.',
  tabs: [
    { id: 'build', name: 'Build', text: 'flowchart LR\n  art["The art<br/><small>8 pictures</small>"] --> s1["Slice 1<br/><small>Run and jump</small>"]\n  s1 --> s2["Slice 2<br/><small>Crows</small>"]\n  s2 --> s3["Slice 3<br/><small>The market</small>"]\n  s3 --> s4["Slice 4<br/><small>The Collector</small>"]' },
    { id: 'play', name: 'Play', text: 'flowchart LR\n  title["Title"] --> run["Run"]\n  run --> hit["Hit by a crow"]\n  hit --> run\n  run --> boss["The Collector"]\n  boss --> won["Won"]' }
  ]
}

const steps: GameStep[] = [
  { kind: 'ask', text: 'build', t: 1 },
  { kind: 'setup', text: "painting the game's art: 8 pictures", t: 2 },
  { kind: 'render', text: 'painted the hero', ok: true, t: 3 },
  { kind: 'render', text: 'painted the crow', ok: true, t: 4 },
  { kind: 'render', text: 'painted the lantern', ok: true, t: 5 }
]
const coding: GameStep[] = [...steps, { kind: 'setup', text: 'stage 2 of 4: Crows', t: 6 }, { kind: 'turn', text: 'turn 3: the crows dive at the hero', turn: 3, t: 7 }, { kind: 'write', text: 'scripts/crow.gd', file: true, t: 8 }]
// a page that draws something, standing in for the served game
const game = `data:text/html,${encodeURIComponent('<body style="margin:0;display:grid;place-items:center;height:100vh;background:#12141c;color:#f2c14e;font:600 28px sans-serif">Lantern Run</body>')}`

export const STATES = {
  // the art is being painted: nothing to play yet, so the stage is the art sheet under the crew's wall
  painting: { state: 'working', kind: 'game', stage: 'painting the lantern', steps, hasApp: false, url: null, name: 'Lantern Run' },
  // the crew writes slice 2
  building: { state: 'working', kind: 'game', stage: 'turn 3: the crows dive at the hero', steps: coding, hasApp: false, url: null, name: 'Lantern Run' },
  // built and running
  playable: { state: 'done', kind: 'game', steps: coding, hasApp: true, canServe: true, url: game, name: 'Lantern Run', result: { ok: true, gatesPassed: true, turns: 14, files: 31, port: { target: 'godot', label: 'Godot project', files: 12 } } },
  // a big game waits after slice 2, whose play test passed
  waiting: { state: 'paused', kind: 'game', steps: coding, hasApp: false, canServe: true, url: null, name: 'Lantern Run', slice: { i: 1, n: 4, name: 'Crows', play: true, next: 'slice 3, The market', shot: pic('#12141c', '#f2c14e'), ask: 'Slice 2 of 4, Crows, is built and the bots played it. Anything to change before the market?', ideas: ['Looks good, go on', 'Slower crows', 'A brighter lantern'] } },
  // a slice whose game never drew: no film, the error instead
  waitingFailed: { state: 'paused', kind: 'game', steps: [...coding, { kind: 'test', text: 'play test failed: No game canvas appeared within 20 s', ok: false, started: false, t: 9 }], hasApp: false, canServe: true, url: null, name: 'Lantern Run', slice: { i: 1, n: 4, name: 'Crows', play: false, started: false, line: 'No game canvas appeared within 20 s', next: 'slice 3, The market' } },
  failed: { state: 'failed', kind: 'game', steps: coding, hasApp: false, url: null, name: 'Lantern Run', message: 'The model stopped answering (HTTP 529) after 3 tries\n    at runEngine (/Users/someone/.hermes/plugins/swarm/engine/appbuild.mjs:212:11)' },
  stopped: { state: 'stopped', kind: 'game', steps: coding, hasApp: false, url: null, name: 'Lantern Run' },
  noArt: { state: 'failed', kind: 'game', steps: steps.slice(0, 2), hasApp: false, url: null, name: 'Lantern Run', message: 'out of quota', result: { artStop: { provider: 'google', model: 'gemini-image' } } }
} satisfies Record<string, GameState>
