// The image-first board is behind a flag until the board gauge (ci/board-gauge) shows it does better than today's
// (architecture §7): `?board=tiers` draws resting pages as photos (<img>) under the tier manager, `?board=pixi`
// paints them on one PixiJS canvas. The address keeps it (src/nav/address.ts keeps keys that are not the machine's),
// so a story, the audit and a person can each turn it on.
export type BoardMode = 'dom' | 'tiers' | 'pixi'

export function boardMode(search: string = typeof location === 'undefined' ? '' : location.search): BoardMode {
  const v = new URLSearchParams(search).get('board')
  return v === 'tiers' || v === 'pixi' ? v : 'dom'
}
