// Every screen of the Studio, by the machine's room (web/nav.js ROOMS), with its name from docs/ux/OBJECTS.md.
// A screen that has moved to React is in SCREENS; until then /next/ shows its name and a way to open it in the
// current Studio at the same address. Moving one screen is ui/README.md's recipe.
import type { ComponentType } from 'react'
import type { Room } from '../nav/nav'
import { BrandSheet } from './BrandSheet'
import { Overview } from './Overview'
import { Projects } from './Projects'
import { PlanBoard } from './PlanBoard'
import { StudioFirst } from './StudioFirst'
import { DesignDeck } from './DesignDeck'
// an app build's App room, the app build wall (spec 44); a game's App room has not moved and stays the stand-in
import { AppWall } from './app/AppWall'

export const SCREEN_NAMES: Record<Room, string> = {
  home: 'Projects',
  draft: 'Design deck',
  overview: 'Overview',
  deck: 'Design deck',
  app: 'Engine room',
  game: 'Game room',
  video: 'Film studio',
  plan: 'Plan board',
  brand: 'Brand sheet',
  studio: 'Studio scaffold'
}

// the room as the breadcrumb's last part names it (RULES.md rule 7; the audit gates read these, docs/ux/AUDIT.md)
export const CRUMB_NAMES: Record<Room, string> = {
  home: 'Projects',
  draft: 'Design deck',
  overview: 'Overview',
  deck: 'Design deck',
  app: 'App',
  game: 'Game',
  video: 'Film',
  plan: 'Plan',
  brand: 'Brand sheet',
  studio: 'Studio'
}

// Projects, the Overview, the Plan board, the brand sheet, the Studio scaffold and the Design deck's shell (slice 1)
// have moved (issue #404); `draft`, a new project's deck, has not
export const SCREENS: Partial<Record<Room, ComponentType>> = {
  // an app build's four windows (spec 44); a game build's App view has not moved yet
  app: AppWall,
  // a project's brand sheet, opened from its Studio; one opened from a chat has no address and stays behind
  brand: BrandSheet,
  deck: DesignDeck,
  home: Projects,
  overview: Overview,
  plan: PlanBoard,
  studio: StudioFirst
}
