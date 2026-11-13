// Every screen of the Studio, by the machine's room (web/nav.js ROOMS), with its name from docs/ux/OBJECTS.md.
// A screen that has moved to React is in SCREENS; until then /next/ shows its name and a way to open it in the
// current Studio at the same address. Moving one screen is ui/README.md's recipe.
import type { ComponentType } from 'react'
import type { Room } from '../nav/nav'
import { Projects } from './Projects'

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

// the screens that have moved (issue #404)
export const SCREENS: Partial<Record<Room, ComponentType>> = { home: Projects }
