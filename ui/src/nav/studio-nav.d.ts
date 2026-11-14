// The types of web/nav.js as the next UI uses it. The file itself is the current Studio's, checked by the root
// tsconfig.json under its looser settings, so here it is imported by name (`@studio/nav`: vite.config.ts and
// .storybook/main.ts resolve it to ../web/nav.js) and typed by this declaration. tests/next.test.mjs checks that
// every name declared here is one web/nav.js exports.
import type { ActorRefFrom, AnyStateMachine, SnapshotFrom } from 'xstate'

export type Room = 'home' | 'draft' | 'overview' | 'deck' | 'app' | 'game' | 'video' | 'plan' | 'brand' | 'studio'
export type Step = 'brand' | 'references' | 'assets' | 'plan' | 'proposal'
export type NavEvent = { type: string, [k: string]: unknown }

export interface NavContext {
  project: string | null
  version: string | null
  run: string | null
  plan: string | null
  page: string | null
  pending: string | null
  from: string | null
  step: string | null
}

// what a snapshot shows: one plain record (web/nav.js view())
export interface View extends NavContext {
  room: Room
  player: 'closed' | 'prototype' | 'visitor'
  replay: boolean
}

export declare const ROOMS: Room[]
export declare const STEPS: Step[]
export declare const navMachine: AnyStateMachine
export declare function view(snap: SnapshotFrom<AnyStateMachine>): View
export declare function toAddress(v: View): string
export declare function fromAddress(search?: string): NavEvent[]

export interface Nav {
  actor: ActorRefFrom<AnyStateMachine>
  readonly view: View
  go(e: NavEvent): View | null
  restore(search: string): View
  subscribe(f: (v: View) => void): () => boolean
  address(): string
}
export declare function makeNav(options?: { log?: (...m: unknown[]) => void, search?: string }): Nav
