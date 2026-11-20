// Words for the App room, said somewhere else (an app project's Overview, issue #542: its chat changes the app, in
// the App room, as that room's own chat does). The machine keeps no words, so they wait here for the room to take
// them, as a page waits in src/nav/opening.ts.
let wanted: { run: string, text: string } | null = null

// the App room of `run` opens on these words
export function askOn(run: string, text: string) { wanted = { run, text } }

// the words waiting for this build's room, once ('' when none; another build's are dropped)
export function takeAsk(run: string) { const w = wanted; wanted = null; return w?.run === run ? w.text : '' }
