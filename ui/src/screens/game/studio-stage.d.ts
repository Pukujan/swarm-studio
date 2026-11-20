// The types of web/canvas/stage.js as the Game room uses it (`@studio/stage`, vite.config.ts): what fills the stage,
// the switch's options, a pin, and the switch typed in the chat. The file is the classic room's, so the two rooms
// follow a build the same way. tests/next.test.mjs checks that every name declared here is one it exports.
export type StageView = 'crew' | 'art' | 'live' | 'map'
export interface StageBuild {
  working?: boolean
  state?: string
  kind?: string
  hasApp?: boolean
  url?: string | null
  canServe?: boolean
  opening?: boolean
  openFailed?: boolean
  painted?: number
  steps?: number
  hasMap?: boolean
}
export interface StageNow { offers: StageView[], auto: StageView | 'card', shown: StageView | 'card', pin: StageView | null, empty: boolean, sheet: boolean, open: boolean }
export declare function stageNow(b: StageBuild, pin?: StageView | null): StageNow
export declare function stagePick(pin: StageView | null, v: StageView): StageView | null
export declare function stageAsk(text: string): StageView | 'follow' | null
export declare function stageNone(v: StageView, b: StageBuild): string
export declare function playFail(kind?: string, message?: string): string
export declare function followName(now: { shown: string, auto?: string }): string
