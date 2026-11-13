// The canvas's source for tests that read it: web/canvas.js and the area modules it loads
// (web/canvas/, web/canvas/README.md), in load order, as one text. Tests keep checking the
// canvas's code wherever an area lives; `canvasFiles` names each file for messages.
import { readFileSync } from 'node:fs'

const web = new URL('../web/', import.meta.url)
const read = f => readFileSync(new URL(f, web), 'utf8')
const entry = read('canvas.js')
const loaded = [...entry.matchAll(/^import (?:.* from )?'\.\/(canvas\/[\w.-]+)'$/gm)].map(m => m[1])
export const canvasFiles = ['canvas.js', ...new Set(['canvas/core.js', ...loaded])]
export const canvasSource = () => canvasFiles.map(read).join('\n')
