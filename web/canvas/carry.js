// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): a picture being painted. While it is painted, a small
// picture card (the slot's stand-in, or a shimmer until one is found) waits in the gutter beside its page, level
// with its section, and its painter's named cursor holds it. When the picture lands the card shows it and the
// cursor drags it to its slot and drops it; the slot shows it from then. With reduced motion there is no drag:
// the card appears on the slot. (The owner, 2026-11-13: "if anything is loading it's supposed to look like a
// cursor and an agent is working on it".) The painter is the one the slot's own tag names (painterOf, the same
// in web/canvas/marks.js fillImages, the Overview and the crew's sounds).
// Uses only ./core.js: the events hand it what it needs (web/canvas/events.js), the loop steps it (loop.js).
import { painterOf } from '../icons.js'
import { els, cam, S, BASE, FRAME_W, GAP, ARROW, Crew } from './core.js'

/** The card in world px, the space between two cards, the drag in ms, and how long a card waits at most. */
export const CARRY = { w: 120, h: 80, gap: 14, ms: 700, max: 180000 }

/**
 * @typedef {{ x: number, y: number }} CarryPoint
 * @typedef {{ key: string, page: string, layer: string, gen: string, nth: number, who: string, el: HTMLElement, t0: number, x: number, y: number, placed: boolean, peek: number, shown: string, land: null | { t0: number, from: CarryPoint, fill: () => void } }} CarryCard
 */
/** @type {Map<string, CarryCard>} every picture being painted now, by `page/layer|gen` */
export const carryCards = new Map()
/** @type {Map<string, { el: HTMLElement, x: number, y: number, placed: boolean }>} the painters' cursors, by name */
const carryHands = new Map()

// ---------- geometry (pure; tests/carry.test.mjs)

/**
 * How much bigger than its world size a card is drawn, so it can still be seen with the camera far out (a tall
 * site is fitted at well under a tenth of its size): at least `min` screen px wide.
 * @param {number} s  the camera's scale  @param {number} [min]
 */
export const carryZoom = (s, min = 56) => Math.min(10, Math.max(1, min / (CARRY.w * Math.max(s, 1e-6))))

/**
 * How far right of its page a card waits: in the middle of the gutter between two pages, and when it is drawn
 * wider than the gutter, just off its own page (it then reaches over the next one, never over its own).
 * @param {number} z  the card's zoom (carryZoom)
 */
export const carryOff = z => Math.max(20, (GAP - CARRY.w * z) / 2)

/** Ease in and out, 0 to 1.  @param {number} t */
export const carryEase = t => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * Cards waiting beside one page, each level with its section and none over another: every card keeps the top it
 * wants unless the one above reaches into it, and then it sits right under that one. Answers in the order asked.
 * @param {number[]} wants  the top each card wants  @param {number} [h]  @param {number} [gap]
 */
export function carryStack(wants, h = CARRY.h, gap = CARRY.gap) {
  const order = wants.map((y, i) => i).sort((a, b) => wants[a] - wants[b] || a - b)
  const out = new Array(wants.length)
  let floor = -Infinity
  for (const i of order) { out[i] = Math.max(wants[i], floor); floor = out[i] + h + gap }
  return out
}

/**
 * Where a card's top-left goes so it sits in the middle of its slot. slot: [left, top, width, height] inside the
 * page (the picture's own box, or its section's); fx: the page's left edge in the world.
 * @param {number[]} slot  @param {number} fx  @param {number} [z]  the card's zoom (carryZoom)  @returns {CarryPoint}
 */
export const carryDrop = (slot, fx, z = 1) => ({ x: fx + slot[0] + slot[2] / 2 - CARRY.w * z / 2, y: slot[1] + slot[3] / 2 - CARRY.h * z / 2 })

/**
 * The card on its way: from where it was held to its slot, eased; done once the time is up.
 * @param {CarryPoint} from  @param {CarryPoint} to  @param {number} t0  @param {number} now  @param {number} [ms]
 * @returns {CarryPoint & { done: boolean }}
 */
export function carryAt(from, to, t0, now, ms = CARRY.ms) {
  const k = carryEase((now - t0) / ms)
  return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, done: now - t0 >= ms }
}

/** Which of a section's pictures this one is: its place among the data-gen pictures in the section's HTML, or -1.  @param {string} html  @param {string} gen */
export const carryNth = (html, gen) => [...String(html || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]*)"/g)].findIndex(m => m[1] === gen)

/** The stand-in photo a section's HTML holds for this picture, or '' (a drawn sketch is not a photo).  @param {string} html  @param {string} gen */
export function carryStandin(html, gen) {
  const tag = [...String(html || '').matchAll(/<img\b[^>]*>/g)].map(m => m[0]).find(t => t.includes(`data-gen="${gen}"`))
  return tag && /\bdata-sketch="photo"/.test(tag) ? (tag.match(/\bsrc="([^"]+)"/)?.[1] || '').replace(/&amp;/g, '&') : ''
}

// ---------- on the canvas

const carryCalm = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const carrySrc = (/** @type {string} */ src) => (/^(https?:|data:|blob:)/.test(src) ? src : BASE + src)
/** A card is on its way to its slot: the loop keeps its full rate. */
export const carryMoving = () => [...carryCards.values()].some(c => c.land)

// the page a card belongs to and its slot there: the picture's own box when the page has reported it, else its section's
function carrySlot(/** @type {CarryCard} */ c) {
  const f = c.page === '*' ? S.frames[0] : S.frames.find((/** @type {any} */ fr) => fr.id === c.page)
  const g = f?.geo?.slots?.[`${c.page}/${c.layer}`]
  if (!g) return null
  const pic = g.pics?.[c.nth]
  return { f, section: g.box, box: pic && pic[2] > 8 && pic[3] > 8 ? pic : g.box }
}

function carryShow(/** @type {CarryCard} */ c, /** @type {string} */ src) {
  if (c.shown === src) return
  c.shown = src
  c.el.innerHTML = src ? '<img alt="" draggable="false">' : ''
  const img = c.el.querySelector('img')
  if (img) img.src = carrySrc(src)
}

/**
 * A picture starts being painted (`image:queued`): its card, held until it lands. nth: which of the section's
 * pictures it is (carryNth). Asking again for one already waiting keeps its card.
 * @param {{ page: string, layer: string, gen: string }} e  @param {number} nth  @param {number} [now]
 */
export function carryStart(e, nth, now = performance.now()) {
  const key = `${e.page}/${e.layer}|${e.gen}`, ghosts = document.getElementById('ghosts')
  if (!ghosts) return
  const had = carryCards.get(key)
  if (had?.el.isConnected && !had.land) { had.t0 = now; return }
  const el = document.createElement('div')
  el.className = 'carry'
  el.setAttribute('aria-busy', 'true')
  el.hidden = true
  ghosts.append(el)
  carryCards.set(key, { key, page: e.page, layer: e.layer, gen: e.gen, nth, who: painterOf(`${e.page}/${e.layer}/${e.gen}`), el, t0: now, x: 0, y: 0, placed: false, peek: 0, shown: '', land: null })
}

/**
 * The picture landed (`image`, with its src) or could not be painted (`image:failed`, no src). fill puts it in
 * its slot: run when the card is dropped there, or at once when there is no card, no drag (reduced motion) or
 * no picture. It also runs on a timer, so the picture never waits on a drawing frame (a hidden tab draws none).
 * @param {string} key  `page/layer|gen`  @param {string} src  @param {() => void} fill  @param {number} [now]
 */
export function carryEnd(key, src, fill, now = performance.now()) {
  const c = carryCards.get(key)
  if (!c || !c.el.isConnected || !c.placed || !src) { if (c) carryGone(c); return fill() }
  let filled = false
  const once = () => { if (!filled) { filled = true; fill() } }
  carryShow(c, src)
  c.el.removeAttribute('aria-busy')
  c.el.classList.add('got')
  if (carryCalm()) {
    // no drag: the card is on its slot at once, and goes as the slot shows the picture
    const s = carrySlot(c)
    if (s) { const z = carryZoom(cam.s), p = carryDrop(s.box, s.f.x, z); c.x = p.x; c.y = p.y; c.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px) scale(${z.toFixed(3)})` }
    once()
    return carryGone(c, 400)
  }
  c.land = { t0: now, from: { x: c.x, y: c.y }, fill: once }
  setTimeout(once, CARRY.ms + 250)
}

function carryGone(/** @type {CarryCard} */ c, wait = 0) {
  if (carryCards.get(c.key) === c) carryCards.delete(c.key)
  c.el.classList.add('gone')
  setTimeout(() => c.el.remove(), wait + 300)
}

/** Every frame (web/canvas/loop.js): the cards beside their pages, the one being dragged, and the painters' cursors. */
export function carryStep(now = performance.now()) {
  if (!carryCards.size && !carryHands.size) return
  const z = carryZoom(cam.s)
  /** @type {Map<any, { c: CarryCard, s: NonNullable<ReturnType<typeof carrySlot>> }[]>} */
  const byPage = new Map()
  for (const c of [...carryCards.values()]) {
    // another build came onto the canvas (fresh() cleared the world), or the picture never came
    if (!c.el.isConnected || (!c.land && now - c.t0 > CARRY.max) || (c.land && now - c.land.t0 > CARRY.ms + 1000)) { c.land?.fill(); carryGone(c); continue }
    const s = carrySlot(c)
    if (!s) continue
    if (!c.land) byPage.set(s.f, [...(byPage.get(s.f) || []), { c, s }])
    else {
      const p = carryAt(c.land.from, carryDrop(s.box, s.f.x, z), c.land.t0, now)
      c.x = p.x; c.y = p.y
      if (p.done) { c.land.fill(); carryGone(c) }
    }
  }
  for (const [f, list] of byPage) {
    const tops = carryStack(list.map(({ s }) => s.section[1] + 24), CARRY.h * z, CARRY.gap * z)
    list.forEach(({ c }, i) => {
      const x = f.x + FRAME_W + carryOff(z), y = tops[i]
      // a card comes in where it belongs, then glides when the ones above it leave
      if (!c.placed) { c.placed = true; c.x = x; c.y = y; c.el.hidden = false } else { c.x += (x - c.x) * 0.25; c.y += (y - c.y) * 0.25 }
      // the slot's stand-in photo on the card once one is found (looked for about once a second)
      if (now - c.peek > 900) { c.peek = now; carryShow(c, carryStandin(S.layers.get(`${c.page}/${c.layer}`)?.text, c.gen)) }
    })
  }
  /** @type {Map<string, CarryCard>} */
  const held = new Map()
  for (const c of carryCards.values()) {
    if (!c.placed) continue
    c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) scale(${z.toFixed(3)})`
    // a painter's cursor is on the card it is dragging, else on the one it has held longest
    const has = held.get(c.who)
    if (!has || (c.land && !has.land) || (!!c.land === !!has.land && (c.land ? c.land.t0 > /** @type {any} */ (has.land).t0 : c.t0 < has.t0))) held.set(c.who, c)
  }
  for (const [who, c] of held) {
    let h = carryHands.get(who)
    if (!h?.el.isConnected) {
      const el = document.createElement('div'), color = Crew.color(who)
      el.className = 'cursor carrier'
      el.innerHTML = `${ARROW(color, who)}<div class="tag" style="background:${color};color:${Crew.ink(color)}"><span>${who}</span></div>`
      els.cursors.append(el)
      carryHands.set(who, h = { el, x: 0, y: 0, placed: false })
    }
    // the cursor's point on the card's lower right corner, in screen px (the cursors' layer does not move with the camera)
    const x = (c.x + (CARRY.w - 18) * z) * cam.s + cam.x, y = (c.y + (CARRY.h - 16) * z) * cam.s + cam.y
    if (!h.placed || c.land || carryCalm()) { h.x = x; h.y = y; h.placed = true } else { h.x += (x - h.x) * 0.3; h.y += (y - h.y) * 0.3 }
    h.el.classList.toggle('press', !!c.land)
    h.el.classList.remove('leaving')
    h.el.style.transform = `translate(${h.x.toFixed(1)}px, ${h.y.toFixed(1)}px)`
  }
  for (const [who, h] of carryHands) {
    if (held.has(who) && h.el.isConnected) continue
    carryHands.delete(who)
    h.el.classList.add('leaving')
    setTimeout(() => h.el.remove(), 600)
  }
}
