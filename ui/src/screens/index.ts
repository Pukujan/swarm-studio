// Every screen of the Studio, by the machine's room (web/nav.js ROOMS), with its name from docs/ux/OBJECTS.md.
// A screen that has moved to React is in SCREENS; until then /next/ shows its name and a way to open it in the
// current Studio at the same address. Moving one screen is ui/README.md's recipe.
import type { ComponentType } from 'react'
import type { Room } from '../nav/nav'
import { PlanBoard } from './PlanBoard'
import { StudioFirst } from './StudioFirst'
import { DesignDeck } from './DesignDeck'

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

// the Design deck's shell is slice 1 of its port (issue #404); `draft`, a new project's deck, has not moved
export const SCREENS: Partial<Record<Room, ComponentType>> = {
  deck: DesignDeck,
  plan: PlanBoard,
  studio: StudioFirst
}
