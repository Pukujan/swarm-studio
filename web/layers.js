// @ts-check
// The Layers tree (docs/ux/PATTERNS.md, the left panel's Layers): one renderer for every canvas that lists
// what is on it. The Design deck's pages and sections (web/canvas/panels.js, shown in the Overview's Layers
// panel, web/project.js) and the Studio scaffold's sections (web/scaffold.js) hand it groups; it draws the
// same rows with the same classes (.tree in web/canvas.css), the same keys and the same right-click menu.
// server/page.mjs joins this file into both the canvas's script and the studio's.
//
//   layerTree(host, groups, on)
//     groups: [{ id, num?, title, count?, state?, busy?, open, rows: [row] }]
//       num     a short label before the title ("Page 2")
//       count   shown at the end of the group's header
//       state   a step dot (.sc-dot empty | started | done | skipped), labelled by stateName
//       busy    a dot on the header: an agent is working in the group
//     row: { key, name, status?, sel?, hid?, dot?, who?, color?, twist?, kids?, eye?, drag? }
//       status  the row's class (streaming, assigned, done, failed); dot a colour while an agent works on it
//       twist   'open' | 'shut' | '' (a twisty for its kids); kids [{ tag, label }] when open
//       eye     a Show/Hide button (hid says which); drag: false keeps it from dragging into the chat
//     on: { group(id, caret), row(key), open?(key), twist?(key), eye?(key), kid?(key), drag?(e, key, name),
//           rename?(key, name), remove?(key), canRename?(key), canRemove?(key) }
//       group   a header was clicked (caret: on its caret, which only opens or shuts it)
//       row     a row was clicked or reached with the arrow keys: fly to it and select it
//       open    double-click or Enter
//       rename  F2, or Rename in the right-click menu: the name is edited in place
//       remove  Delete, or Delete in the right-click menu
import { ic } from './icons.js'

const STEP_STATE = { empty: 'Empty', started: 'Started', done: 'Done', skipped: 'Skipped' }

/**
 * @typedef {{ key: string, name: string, status?: string, sel?: boolean, hid?: boolean, dot?: string, who?: string, color?: string, twist?: string, kids?: { tag: string, label: string }[], eye?: boolean, drag?: boolean }} LayerRow
 * @typedef {{ id: string, num?: string, title: string, count?: number, state?: string, busy?: boolean, open: boolean, rows: LayerRow[] }} LayerGroup
 * @typedef {{ group: (id: string, caret: boolean) => void, row: (key: string) => void, open?: (key: string) => void, twist?: (key: string) => void, eye?: (key: string) => void, kid?: (key: string) => void, drag?: (e: DragEvent, key: string, name: string) => void, rename?: (key: string, name: string) => void, remove?: (key: string) => void, canRename?: (key: string) => boolean, canRemove?: (key: string) => boolean }} LayerHandlers
 */

/** @param {HTMLElement} host @param {LayerGroup[]} groups @param {LayerHandlers} on */
export function layerTree(host, groups, on) {
  const focused = /** @type {HTMLElement | null} */ (host.contains(document.activeElement) ? document.activeElement : null)?.dataset?.key
  host.replaceChildren()
  for (const g of groups) {
    const div = document.createElement('div')
    div.className = `pg${g.open ? ' open' : ''}`
    const title = document.createElement('div')
    title.className = 'pg-title'
    title.dataset.page = g.id
    title.setAttribute('role', 'button')
    title.tabIndex = 0
    title.setAttribute('aria-expanded', String(g.open))
    title.innerHTML = `${g.state ? `<i class="sc-dot ${g.state}" role="img"></i>` : ''}<span class="num"></span><span class="ttl"></span>${g.busy ? '<span class="dot busy" role="img" aria-label="Working"></span>' : ''}${g.count != null ? '<span class="n"></span>' : ''}<span class="caret">▶</span>`
    title.querySelector('.sc-dot')?.setAttribute('aria-label', STEP_STATE[g.state] || g.state)
    const num = /** @type {HTMLElement} */ (title.querySelector('.num')), ttl = /** @type {HTMLElement} */ (title.querySelector('.ttl'))
    if (g.num) num.textContent = g.num; else num.remove()
    ttl.textContent = g.title
    const n = title.querySelector('.n')
    if (n) n.textContent = String(g.count)
    title.onclick = e => on.group(g.id, !!(/** @type {HTMLElement} */ (e.target).closest('.caret')))
    title.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on.group(g.id, false) } }
    div.append(title)
    const lys = document.createElement('div')
    lys.className = 'lys'
    lys.setAttribute('role', 'group')
    div.append(lys)
    for (const l of g.rows) {
      const row = document.createElement('div')
      row.className = `ly${l.status ? ` ${l.status}` : ''}${l.sel ? ' sel' : ''}${l.hid ? ' hid' : ''}${l.dot ? ' busy' : ''}`
      row.dataset.key = l.key
      row.tabIndex = 0
      row.setAttribute('role', 'treeitem')
      row.setAttribute('aria-selected', String(!!l.sel))
      row.draggable = l.drag !== false && !!on.drag
      row.innerHTML = `<span class="tw">${l.twist === 'open' ? '▼' : l.twist === 'shut' ? '▶' : ''}</span><span class="dot"></span><span class="nm"></span><span class="who"></span>${l.eye ? `<button class="eye" aria-label="${l.hid ? 'Show' : 'Hide'} on the canvas">${l.hid ? '◌' : '👁'}</button>` : ''}`
      const dot = /** @type {HTMLElement} */ (row.children[1]), nm = /** @type {HTMLElement} */ (row.children[2]), who = /** @type {HTMLElement} */ (row.children[3])
      nm.textContent = l.name
      if (l.dot) { dot.style.background = l.dot; dot.setAttribute('role', 'img'); dot.setAttribute('aria-label', 'Working') }
      if (l.who) { who.textContent = l.who; if (l.color) who.style.color = l.color }
      row.onclick = e => {
        const t = /** @type {HTMLElement} */ (e.target)
        if (t.closest('.eye')) return on.eye?.(l.key)
        if (t.closest('.tw') && l.twist) return on.twist?.(l.key)
        if (t.closest('input')) return
        on.row(l.key)
      }
      row.ondblclick = e => { if (!(/** @type {HTMLElement} */ (e.target)).closest('input, .eye, .tw')) on.open?.(l.key) }
      if (row.draggable) row.ondragstart = e => on.drag?.(e, l.key, l.name)
      lys.append(row)
      if (l.twist === 'open' && l.kids?.length) {
        const kids = document.createElement('div')
        kids.className = 'kids'
        for (const k of l.kids) {
          const d = document.createElement('div')
          d.className = 'kid'
          const tag = document.createElement('i'), label = document.createElement('span')
          tag.textContent = k.tag
          label.textContent = k.label
          d.append(tag, label)
          d.onclick = () => (on.kid || on.row)(l.key)
          kids.append(d)
        }
        lys.append(kids)
      }
    }
    host.append(div)
  }
  if (focused) /** @type {HTMLElement | null} */ (host.querySelector(`.ly[data-key="${CSS.escape(focused)}"]`))?.focus({ preventScroll: true })
  // the keys and the right-click menu are wired once per host
  if (host.dataset.lt) { treeOn.set(host, on); return }
  host.dataset.lt = '1'
  host.setAttribute('role', 'tree')
  treeOn.set(host, on)
  host.addEventListener('keydown', e => treeKey(host, e))
  host.addEventListener('contextmenu', e => {
    const row = /** @type {HTMLElement | null} */ ((/** @type {HTMLElement} */ (e.target)).closest('.ly[data-key]'))
    const h = treeOn.get(host)
    if (!row || !h) return
    const key = row.dataset.key || ''
    const items = [
      h.rename && (h.canRename?.(key) ?? true) ? { k: 'rename', icon: 'pencil', label: 'Rename', run: () => renameRow(host, row) } : null,
      h.remove && (h.canRemove?.(key) ?? true) ? { k: 'remove', icon: 'trash', label: 'Delete', red: true, run: () => h.remove?.(key) } : null
    ].filter(Boolean)
    if (!items.length) return
    e.preventDefault()
    h.row(key)
    treeMenu(/** @type {{ k: string, icon: string, label: string, red?: boolean, run: () => void }[]} */ (items), e.clientX, e.clientY)
  })
}

/** @type {WeakMap<HTMLElement, LayerHandlers>} */
const treeOn = new WeakMap()

/** @param {HTMLElement} host @param {KeyboardEvent} e */
function treeKey(host, e) {
  const t = /** @type {HTMLElement} */ (e.target), h = treeOn.get(host)
  const row = /** @type {HTMLElement | null} */ (t.closest('.ly[data-key]'))
  if (!row || !h || t.closest('input')) return
  const key = row.dataset.key || ''
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    const rows = /** @type {HTMLElement[]} */ ([...host.querySelectorAll('.pg.open .ly[data-key]')]), i = rows.indexOf(row)
    const next = rows[i + (e.key === 'ArrowDown' ? 1 : -1)]
    if (next) { h.row(next.dataset.key || ''); /** @type {HTMLElement | null} */ (host.querySelector(`.ly[data-key="${CSS.escape(next.dataset.key || '')}"]`))?.focus() }
  } else if (e.key === 'Enter') { e.preventDefault(); h.open ? h.open(key) : h.row(key) }
  else if (e.key === 'F2' && h.rename && (h.canRename?.(key) ?? true)) { e.preventDefault(); renameRow(host, row) }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && h.remove && (h.canRemove?.(key) ?? true)) { e.preventDefault(); h.remove(key) }
}

// the name edited in place: Enter or leaving keeps it, Esc puts it back
/** @param {HTMLElement} host @param {HTMLElement} row */
function renameRow(host, row) {
  const nm = /** @type {HTMLElement | null} */ (row.querySelector('.nm')), h = treeOn.get(host), key = row.dataset.key || ''
  if (!nm || !h?.rename) return
  const was = nm.textContent || ''
  const input = document.createElement('input')
  input.value = was
  input.maxLength = 60
  input.setAttribute('aria-label', 'Name')
  nm.replaceChildren(input)
  row.draggable = false
  input.focus()
  input.select()
  let done = false
  const end = (/** @type {boolean} */ keep) => {
    if (done) return
    done = true
    const v = input.value.trim()
    nm.textContent = keep && v ? v : was
    if (keep && v && v !== was) h.rename?.(key, v)
    row.focus({ preventScroll: true })
  }
  input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); end(true) } if (e.key === 'Escape') { e.preventDefault(); end(false) } }
  input.onblur = () => end(true)
}

// the right-click menu, in the studio's menu style (.hm-menu)
/** @type {(() => void) | null} */
let menuOff = null
/** @param {{ k: string, icon: string, label: string, red?: boolean, run: () => void }[]} items @param {number} x @param {number} y */
function treeMenu(items, x, y) {
  menuOff?.()
  const el = document.createElement('div')
  el.className = 'hm-menu'
  el.setAttribute('role', 'menu')
  for (const it of items) {
    const b = document.createElement('button')
    b.setAttribute('role', 'menuitem')
    if (it.red) b.className = 'red'
    const label = document.createElement('span')
    label.textContent = it.label
    b.innerHTML = ic(it.icon, 16)
    b.append(label)
    b.onclick = () => { close(); it.run() }
    el.append(b)
  }
  document.body.append(el)
  el.style.left = `${Math.max(8, Math.min(innerWidth - el.offsetWidth - 8, x))}px`
  el.style.top = `${Math.max(8, y + el.offsetHeight > innerHeight - 8 ? y - el.offsetHeight : y)}px`
  // @ts-ignore SwarmUI is web/ui.js's, on the page
  const off = window.SwarmUI?.layer?.(el, () => close())
  function close() { if (!el.isConnected) return; el.remove(); off?.(); if (menuOff === close) menuOff = null }
  menuOff = close
  const first = /** @type {HTMLElement | null} */ (el.querySelector('button'))
  first?.focus()
}

// The narrow pane (≤ 760 px, "PR mode-menu"): the canvas stays the page and the left panel is a sheet that
// slides in from a dock button; a pick closes it. root gets .files-on (web/project.css draws the sheet).
/** @param {HTMLElement} root @param {HTMLElement} side @param {HTMLElement} btn */
export function layerSheet(root, side, btn) {
  /** @type {(() => void) | null} */
  let off = null
  const sheet = {
    narrow: () => matchMedia('(max-width: 760px)').matches,
    get on() { return root.classList.contains('files-on') },
    /** @param {boolean} on */
    set(on) {
      root.classList.toggle('files-on', on)
      btn.setAttribute('aria-expanded', String(on))
      off?.(); off = null
      // @ts-ignore SwarmUI is web/ui.js's, on the page
      if (on) off = window.SwarmUI?.layer?.(side, () => sheet.set(false), { extra: [btn] })
    }
  }
  return sheet
}
