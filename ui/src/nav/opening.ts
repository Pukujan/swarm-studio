// The page a room is opened on (the Overview's Open, a double-click on a page): the nav machine keeps no page while
// the player is shut (web/nav.js clears it on every room move), so the page waits here for the room to take it
let wanted: string | null = null

// the next room opens on this page
export function openOn(page: string | null | undefined) { wanted = page || null }

// the page this room was opened on, once (null when none)
export function takeOpening() { const p = wanted; wanted = null; return p }
