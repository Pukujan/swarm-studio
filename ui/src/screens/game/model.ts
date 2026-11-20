// What the Game room shows, as the game's routes give it (engine/appjob.mjs state() and view(), server/server.mjs
// runApp, runMap and the run's /assets), and the room's own small rules, ported from web/canvas/rooms.js. Pure:
// ui/test/gameroom.test.mjs runs them with the classic stage rules (web/canvas/stage.js).
import type { StageBuild } from '@studio/stage'

// one step of the build; a play test's step carries its film, the keys it pressed and whether the game ever drew
export interface GameStep { kind: string, text: string, ok?: boolean, turn?: number, file?: boolean, t?: number, clip?: string, keys?: { t?: number, k?: string }[], started?: boolean, line?: string }

// a big game waits after each slice (engine/appjob.mjs app:paused): what was built, the bots' film and still, the
// question and the answers offered
export interface GameSlice { i: number, n: number, name?: string, play?: boolean, started?: boolean, line?: string, skipped?: string, failed?: boolean, ask?: string, ideas?: string[], next?: string, clip?: string, shot?: string }

export interface GameResult {
  ok?: boolean, gatesPassed?: boolean, turns?: number, files?: number
  // the image model ran out before any art landed
  artStop?: { provider?: string, model?: string } | null
  // the same game as a Godot, Unity or Unreal project, when the job wrote one
  port?: { target: string, label: string, files?: number } | null
}

export interface GameState {
  state?: 'idle' | 'working' | 'done' | 'failed' | 'stopped' | 'paused'
  kind?: 'site' | 'app' | 'game'
  stage?: string
  steps?: GameStep[]
  url?: string | null
  result?: GameResult | null
  deployed?: string | null
  hasApp?: boolean
  // the game's files are there: a big game waiting after a slice can be played though it is not finished
  canServe?: boolean
  message?: string | null
  name?: string | null
  // another Studio drives this build: it shows here from the shared log
  elsewhere?: boolean
  slice?: GameSlice | null
}

// one cell of the art plan, painted (src) or still to come (GET /api/runs/<id>/assets, engine/assets.mjs sheet)
export interface SheetCell { id: string, name: string, kind?: string, aspect?: string, src: string | null }

// the Map (GET /api/runs/<id>/map, engine/gamemap.mjs): the build as Mermaid diagrams, one tab each, and Hermia's line
export interface GameMap { kind?: string, version?: string, tabs: { id: string, name: string, text: string }[], say?: string }

// the game's one state as the server reads it (engine/kindstate.mjs, GET /api/runs/<id>/state parts.game)
export interface GamePart { state: string, hasApp?: boolean, reason?: { message: string, action?: string } | null, detail?: string | null, next?: unknown }

export interface GameModel {
  run: string
  title: string
  // the build's crew, in the order of the wall's windows
  crew: string[]
  app: GameState
  sheet: SheetCell[]
  // undefined while it loads; null when there is no plan to draw
  map?: GameMap | null
  part: GamePart | null
  files: { path: string, size: number }[]
  file: { path: string, text: string } | null
}

// the room's own state beside the build's: its server being started, and whether the last try failed
export interface Opening { opening: boolean, failed: boolean }

/** The build, as the stage rules see it (web/canvas/rooms.js stageBuild). */
export function stageBuild(m: Pick<GameModel, 'app' | 'sheet' | 'map'>, o: Opening = { opening: false, failed: false }): StageBuild {
  const a = m.app
  return {
    working: a.state === 'working', state: a.state, kind: a.kind || 'game', hasApp: !!a.hasApp, url: a.url || null, canServe: !!a.canServe,
    opening: o.opening, openFailed: o.failed, steps: (a.steps || []).length, painted: m.sheet.filter(c => c.src).length, hasMap: !!m.map
  }
}

/** What a stopped build had done: its pictures and its stage (web/canvas/rooms.js stopSummary). */
export function stopSummary(steps: GameStep[] = []): string {
  const painted = steps.filter(s => /^painted the /.test(s.text || '')).length
  const total = Number(/(\d+) pictures/.exec(steps.findLast(s => /^painting the game's art/.test(s.text || ''))?.text || '')?.[1]) || 0
  const stage = steps.findLast(s => /^stage \d+ of/.test(s.text || ''))?.text.match(/^stage (\d+ of \d+)/)?.[1]
  return [painted || total ? `${painted}${total ? `/${total}` : ''} pictures` : '', stage ? `stage ${stage}` : ''].filter(Boolean).join(' · ') || 'nothing built yet'
}

/** A failure's first line, with long paths cut to their last two parts (the classic fail card's). */
export const failLine = (message: string | null | undefined, fallback = 'The engine stopped before the game built.') =>
  String(message || fallback).split('\n')[0].replace(/(\/[\w.@-]+){3,}/g, m => `…/${m.split('/').slice(-2).join('/')}`).slice(0, 220)

/** A page on localhost will not frame 127.0.0.1 (and the other way round): the Studio's own name for it (frameUrl). */
export function frameUrl(u: string, here: string): string {
  try {
    const x = new URL(u), loop = /^(localhost|127\.0\.0\.1|\[::1\])$/, host = new URL(here).hostname
    if (loop.test(x.hostname) && loop.test(host)) x.hostname = host
    return x.href
  } catch { return u }
}

/** A slice's card is drawn once: its key (web/canvas/rooms.js sliceCard). */
export const sliceKey = (run: string, s: GameSlice) => `${run}:${s.i}:${s.clip || ''}:${s.shot || ''}`

/** A typed yes presses a waiting change's main button (web/canvas/rooms.js tellCrew). */
export const saidYes = (text: string) => /^(yes|y|yep|yeah|ok|okay|sure|do it|go ahead|send it|yes please|please do)[.!]?$/i.test(text.trim())

/** Words about something broken, after a play test that failed, are a fix with those words (sliceGo). */
export const saysBroken = (text: string) => /\b(fix|broken|bugs?|crash\w*|errors?|issues?|not working|does ?n[o']?t work)\b/i.test(text)
