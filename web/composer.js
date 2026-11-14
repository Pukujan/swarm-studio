// @ts-check
// The chat box's row of controls (web/index.html #brief-form): the menu its chips open, the agents chip, and
// the list the builders' model chip offers. A chip says a name only; its open menu says what it picks, in one
// plain line (docs/ux/RULES.md: no tooltips, rule 9: an explanation goes one layer down).
// Nothing here touches the page until a function is called, so node can test the pure parts.

// The open menu's keys -> the item that takes the focus (at: the one that has it, n: how many), or -1.
/** @param {string} key  @param {number} at  @param {number} n */
export function chipMenuKey(key, at, n) {
  if (n < 1) return -1
  if (key === 'ArrowDown') return (at + 1) % n
  if (key === 'ArrowUp') return (at + n - 1) % n
  if (key === 'Home' || key === 'PageUp') return 0
  if (key === 'End' || key === 'PageDown') return n - 1
  return -1
}

/** @typedef {{ value: string, name: string, line?: string, radio?: boolean }} ChipItem */
// one chip menu is open at a time
let chipMenuShut = /** @type {((focus?: boolean) => void) | null} */ (null)

/**
 * A chip's menu: a button with aria-haspopup="menu" opens a menu of radio items (an item with radio: false is a
 * plain action). head: one line over the items saying what the chip picks; an item's own line goes under its
 * name. Up and Down go round, Home and End jump, Enter or Space picks, Esc, Tab or a click outside closes,
 * and the focus goes back to the chip. It opens above the chip (the chat box is at the bottom), kept on screen.
 * @param {HTMLButtonElement} button
 * @param {{ label: string, head?: string, items: () => ChipItem[], value: () => string, pick: (value: string) => void }} o
 */
export function chipMenu(button, o) {
  let pop = /** @type {HTMLElement | null} */ (null), off = /** @type {(() => void) | null} */ (null)
  const close = (focus = false) => {
    if (!pop) return
    pop.remove()
    pop = null
    off?.()
    off = null
    if (chipMenuShut === close) chipMenuShut = null
    button.setAttribute('aria-expanded', 'false')
    if (focus) button.focus({ preventScroll: true })
  }
  const open = () => {
    chipMenuShut?.()
    const el = document.createElement('div'), menu = document.createElement('div')
    el.className = 'chip-pop'
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', o.label)
    if (o.head) {
      const head = document.createElement('p')
      head.id = 'chip-pop-head'
      head.textContent = o.head
      menu.setAttribute('aria-describedby', head.id)
      el.append(head)
    }
    const now = o.value()
    for (const it of o.items()) {
      const b = document.createElement('button'), name = document.createElement('b')
      b.type = 'button'
      b.tabIndex = -1
      b.dataset.v = it.value
      if (it.radio === false) b.setAttribute('role', 'menuitem')
      else { b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(it.value === now)) }
      name.textContent = it.name
      b.append(name)
      if (it.line) { const line = document.createElement('span'); line.textContent = it.line; b.append(line) }
      menu.append(b)
    }
    el.append(menu)
    menu.addEventListener('click', e => {
      const b = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-v]'))
      if (!b) return
      close(true)
      o.pick(String(b.dataset.v))
    })
    menu.addEventListener('keydown', e => {
      // Tab leaves the menu: it closes, and the focus goes on from the chip
      if (e.key === 'Tab') return close(true)
      const all = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('[data-v]')])
      const to = chipMenuKey(e.key, all.indexOf(/** @type {HTMLElement} */ (document.activeElement)), all.length)
      if (to < 0) return
      e.preventDefault()
      all[to].focus()
    })
    document.body.append(el)
    pop = el
    chipMenuShut = close
    button.setAttribute('aria-expanded', 'true')
    const r = button.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, y = r.top - 6 - h
    el.style.left = `${Math.round(Math.max(8, Math.min(innerWidth - w - 8, r.left)))}px`
    el.style.top = `${Math.round(y < 8 ? Math.min(innerHeight - h - 8, r.bottom + 6) : y)}px`
    // Esc and a click outside close it, like every panel (web/ui.js)
    // @ts-ignore
    off = window.SwarmUI?.layer(el, why => close(why === 'esc'), { extra: [button] }) || null
    const first = /** @type {HTMLElement | null} */ (menu.querySelector('[aria-checked="true"]') || menu.querySelector('[data-v]'))
    first?.focus({ preventScroll: true })
  }
  button.addEventListener('click', () => (pop ? close() : open()))
  button.addEventListener('keydown', e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!pop) open() } })
  return { open, close, isOpen: () => !!pop }
}

// ---------- the agents chip: how many builders work at once. The count itself stays in the page's hidden
// select (#agents), which the build reads; whoever sets it in code sends a change event so the chip follows.
/** @param {{ select: HTMLSelectElement, button: HTMLButtonElement }} o */
export function mountAgentsChip({ select, button }) {
  if (!select || !button) return
  const word = button.querySelector('.t')
  const paint = () => { if (word) word.textContent = select.value || '0' }
  select.addEventListener('change', paint)
  paint()
  chipMenu(button, {
    label: 'Agents',
    head: 'How many builders work at once',
    items: () => [...select.options].map(op => ({ value: op.value, name: op.textContent || op.value })),
    value: () => select.value,
    pick: v => { select.value = v; select.dispatchEvent(new Event('change')) }
  })
}

// ---------- the builders' model chip
// A role's name is never a model's name. Under Hermes a role's model string is the role itself ("worker",
// "planner", or "worker:<pick>": engine/hermesllm.mjs roleModel), and the chip used to show it.
const ROLE_NAME = /^(?:planner|worker|builder|reviewer)(?::|$)/i
/** @param {unknown} m */
export const realModel = m => (typeof m === 'string' && !!m.trim() && m !== 'off' && !ROLE_NAME.test(m.trim()) ? m.trim() : '')
/** @param {string} m */
export const shortModel = m => m.split('/').pop() || m
export const NO_MODEL_NAME = 'Hermes’s model'

/**
 * What the builders' model chip says and offers.
 * picked: the Studio's own pick for the builders; slot: the model Hermes's builder slot resolves to (the
 * Setup sheet's source, GET /api/setup/models/options); base: the builders' model the server was started
 * with; planner*: the same three for the planner; recent: models picked lately.
 * -> { now: the picked value ('' = Hermes's own), name: what the chip says, items: the menu }
 * The first item is what Hermes uses: its real name, or "Hermes's model" when that cannot be known. The
 * planner's model is offered only when it is a real, different model. "Other…" opens Models.
 * @param {{ picked?: unknown, slot?: unknown, base?: unknown, plannerPicked?: unknown, plannerSlot?: unknown, plannerBase?: unknown, recent?: unknown[] }} o
 */
export function builderModels({ picked, slot, base, plannerPicked, plannerSlot, plannerBase, recent = [] } = {}) {
  const own = realModel(slot) || realModel(base)
  const now = realModel(picked)
  const more = [...new Set([now, ...recent.map(realModel), realModel(plannerPicked), realModel(plannerSlot) || realModel(plannerBase)])].filter(m => m && m !== own).slice(0, 8)
  /** @type {ChipItem[]} */
  const items = [{ value: '', name: own ? shortModel(own) : NO_MODEL_NAME }, ...more.map(m => ({ value: m, name: shortModel(m) })), { value: '__other', name: 'Other…', radio: false }]
  return { now, name: now ? shortModel(now) : items[0].name, items }
}
