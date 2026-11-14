// @ts-check
// The Overview's small fixed parts (web/project.js): where a reference came from, a film's length, a
// fraction kept inside 0..1, and a Scribble mark's points as an SVG path.

/** @type {Record<string, string>} */
export const REF_FROM = { upload: 'Added here', chat: 'A chat', feed: 'The Feed', link: 'A link', plan: 'The plan', film: 'A film' }
/** @param {number} s seconds */
export const fmtTime = s => s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : ''
/** @param {number} v */
export const clamp01 = v => Math.max(0, Math.min(1, v))
// points as fractions of a page, on an artboard k page-widths tall for one of the page
/** @param {[number, number][]} pts @param {number} k */
export const ptsPath = (pts, k) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${(x * 1000).toFixed(1)} ${(y * k * 1000).toFixed(1)}`).join('')
