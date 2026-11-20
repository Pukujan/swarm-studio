// What the room's chat says once a build started from the questions opens (web/canvas/rooms.js gameBuild: the line
// after showRun). The room that started it is not the one that shows it, so the line waits here for that room.
let waiting: { run: string, text: string } | null = null

export function sayOnOpen(run: string, text: string) { waiting = { run, text } }

// taken once, by the room that opens on that run
export function takeSay(run: string): string {
  if (waiting?.run !== run) return ''
  const t = waiting.text
  waiting = null
  return t
}
