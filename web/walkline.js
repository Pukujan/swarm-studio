// @ts-check
// What Hermia says as the Studio's walk goes (#541; decision 0015: the guide is Hermia in the chat, one step at a
// time, Skip always there): one line when a step is done or skipped, saying what it meant and which step is next.
// Both Studios say the same words (web/scaffold.js; the next UI's StudioFirst, as @studio/walkline).

/** @type {Record<string, { done: string, next: string }>} what a step meant once done, and what it asks for */
export const WALK_SAYS = {
  references: { done: 'Got it: what you brought is in.', next: 'bring what you already have: a PDF, files or your website' },
  assets: { done: 'Your files are in: the crew places them as they are.', next: 'logos and photos the crew should use as they are' },
  brand: { done: 'The look is set: every page reads its colours, type and voice.', next: 'pick one of three moods' },
  proposal: { done: 'The look is locked: the build holds to it.', next: 'lock the look so the build holds to it' },
  plan: { done: 'The pages are set.', next: 'the pages, and what goes on each' }
}

/**
 * The step after `from` in `order` that is still open (neither done nor skipped), else null.
 * @param {string[]} order the walk, in its order
 * @param {(step: string) => string} stateOf empty, started, done or skipped
 * @param {string | null} [from] where the walk is; the first open step when none
 * @returns {string | null}
 */
export function nextStep(order, stateOf, from = null) {
  const after = from ? order.slice(order.indexOf(from) + 1) : order
  return after.find(s => stateOf(s) !== 'done' && stateOf(s) !== 'skipped') || null
}

/**
 * Where to start, or what comes next: the step's name and what it asks for, with Skip.
 * @param {string} step
 * @param {Record<string, string>} names each step's name on screen
 * @returns {string}
 */
export function walkNext(step, names) {
  const s = WALK_SAYS[step]
  // Lock is never skipped: the look is what the build holds to
  return s ? `Next: ${names[step] || step}, ${s.next}.${step === 'proposal' ? '' : ' Or skip it.'}` : `Next: ${names[step] || step}.`
}

/**
 * The line when a step is done or skipped: what it meant, then the next open step (or Build when none is left).
 * @param {{ step: string, how: 'done' | 'skipped', next: string | null, names: Record<string, string> }} o
 * @returns {string}
 */
export function walkLine({ step, how, next, names }) {
  const said = how === 'skipped' ? `${names[step] || step} skipped.` : WALK_SAYS[step]?.done || `${names[step] || step} is done.`
  return next ? `${said} ${walkNext(next, names)}` : `${said} That's every step: press Build when you're ready.`
}

/**
 * The line when a mood is picked on the Brand step: what follows from it, then what's next.
 * @param {string} mood the option's name
 * @param {string | null} next
 * @param {Record<string, string>} names
 * @returns {string}
 */
export function moodLine(mood, next, names) {
  return `${mood} it is: the moodboard, colours, type and voice follow from it.${next ? ` ${walkNext(next, names)}` : ''}`
}
