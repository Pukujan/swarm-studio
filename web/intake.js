// @ts-check
// A project brought in from outside (docs/specs/45-intake.md): its code runs here only with the person's yes, and
// its install scripts only when they allow them, for that one project. Both questions are asked once in the chat
// and both answers can be typed there (the chat works for everything, docs/specs/46-chat-modes.md):
//   "install and run it" / "not now"                       its packages installed, built and started, or nothing
//   "run its install scripts" / "no install scripts"       its packages' own scripts and .pnpmfile.cjs, on or off
// The words only: the App room (web/canvas/rooms.js intakeSay) sends them to the server and answers in the chat.

/**
 * The answers, typed. Only a message that is one of these, whole: "run the tests in the footer" is a change for
 * the crew. `run` and `norun` count only while the project waits for that answer (the caller knows).
 * @param {string} text @returns {{ did: 'run' | 'norun' | 'scripts' | 'noscripts' } | null}
 */
export function intakeAsk(text) {
  const s = String(text || '').trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ').replace(/^(?:ok(?:ay)?,? |yes,? |please )+/, '')
  const it = '(?:it|this|the (?:project|app|game))'
  if (/^(?:no|don'?t|do not|never) (?:run )?(?:its |the )?(?:install |lifecycle |package )?scripts?(?: off)?$/.test(s) || /^(?:keep|leave) (?:its |the )?(?:install )?scripts off$/.test(s)) return { did: 'noscripts' }
  if (/^(?:run|allow|turn on) (?:its |the )?(?:install |lifecycle |package )?scripts?(?: too| for (?:it|this project))?$/.test(s)) return { did: 'scripts' }
  if (new RegExp(`^(?:install and run|run|start|install) ${it}(?: here)?$`).test(s) || /^(?:install and run|yes,? run it)$/.test(s)) return { did: 'run' }
  if (new RegExp(`^(?:not now|no,? (?:not now|thanks)|don'?t run ${it}|leave ${it} as files)$`).test(s)) return { did: 'norun' }
  return null
}

// what the chat says: each question once, each answer in a line
export const INTAKE_SAY = {
  ask: 'This project came from outside, so none of its code has run here. Say "install and run it", or "not now".',
  scriptsAsk: 'Its packages were installed without their own install scripts. If it needs them, say "run its install scripts"; "no install scripts" keeps them off.',
  norun: 'Nothing of it runs. Its code is in Code. Say "install and run it" when you want it running.',
  running: 'Installing and starting it',
  scripts: 'Its install scripts run for this project from now on.',
  scriptsRunning: 'Running its install scripts',
  noscripts: 'Its install scripts stay off.',
  already: 'It runs here already.',
  plain: 'It is plain files: nothing is installed and no install script runs.'
}
