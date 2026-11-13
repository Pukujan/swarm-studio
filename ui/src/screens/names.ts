// Every screen of the Studio, by the machine's room (web/nav.js ROOMS), with its name from docs/ux/OBJECTS.md
import type { Room } from '../nav/nav'

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
