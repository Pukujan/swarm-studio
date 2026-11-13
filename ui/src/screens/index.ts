// The screens that have moved to React, by the machine's room (web/nav.js ROOMS). A room not here is drawn by the
// current Studio: /next/ shows its name (names.ts) and a way to open it there at the same address. Moving one
// screen is ui/README.md's recipe.
import type { ComponentType } from 'react'
import type { Room } from '../nav/nav'
import { BrandSheet } from './brand/BrandSheet'

export const SCREENS: Partial<Record<Room, ComponentType>> = {
  // a project's sheet, opened from its Studio; one opened from a chat has no address and stays in the Studio
  brand: BrandSheet
}

// the screens SCREENS draws only for some views: the rest of the time, the stand-in
export const MOVED = (v: { room: Room, from: string | null, project: string | null }) =>
  v.room !== 'brand' || (v.from === 'studio' && !!v.project)
