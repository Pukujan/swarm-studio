// Swarm Studio UI kit, behaviour half (web/ui.css is the look). Two helpers every panel uses,
// so each one closes the same three ways (spec 12, rule 10): its × button, Esc, and a click
// outside it. Only the topmost open layer answers Esc.
;(() => {
  const stack = []
  // a panel closed or hidden by its own code leaves the stack by itself
  const alive = o => (!o.el || (o.el.isConnected && !o.el.hidden)) && (!o.isOpen || o.isOpen())
  const top = () => { while (stack.length && !alive(stack[stack.length - 1])) stack.pop(); return stack[stack.length - 1] }
  const X = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>'
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    const t = top()
    if (!t || (t.canClose && !t.canClose())) return
    e.stopImmediatePropagation()
    t.close('esc')
  }, true)
  // a press that starts and ends outside the layer closes it; a drag out of a text box does not
  addEventListener('pointerdown', e => {
    const t = top()
    if (t) t.downOutside = !t.inside(e.target)
  }, true)
  addEventListener('click', e => {
    const t = top()
    if (!t || !t.downOutside || t.inside(e.target)) return
    if (t.canClose && !t.canClose()) return
    t.downOutside = false
    t.close('outside')
    if (t.modal) { e.stopPropagation(); e.preventDefault() }
  }, true)

  function layer(o) {
    stack.push(o)
    return () => { const i = stack.indexOf(o); if (i >= 0) stack.splice(i, 1) }
  }

  // dialog({ kicker, title, desc, body, footer, size, onClose, canClose, className }) → { el, body, footer, close }
  function dialog(opt = {}) {
    const ov = document.createElement('div')
    ov.className = 'ui-overlay'
    const d = document.createElement('div')
    d.className = `ui-dialog${opt.size === 'lg' ? ' ui-dialog-lg' : ''}${opt.className ? ` ${opt.className}` : ''}`
    d.setAttribute('role', 'dialog')
    d.setAttribute('aria-modal', 'true')
    d.innerHTML = `<header class="ui-dialog-header"></header><div class="ui-dialog-body"></div><footer class="ui-dialog-footer" hidden></footer><button class="ui-btn ui-btn-ghost ui-btn-icon ui-dialog-close" aria-label="Close">${X}</button>`
    ov.append(d)
    const api = { el: d, overlay: ov, header: d.querySelector('.ui-dialog-header'), body: d.querySelector('.ui-dialog-body'), footer: d.querySelector('.ui-dialog-footer'), closed: false }
    api.setHead = (kicker, title, desc) => {
      // no eyebrows (docs/ux/RULES.md, minimal text): a kicker shows only when there is no title
      api.header.innerHTML = `${kicker && !title ? `<span class="ui-dialog-kicker">${kicker}</span>` : ''}${title ? `<h2 class="ui-dialog-title">${title}</h2>` : ''}${desc ? `<p class="ui-dialog-desc">${desc}</p>` : ''}`
      if (title) d.setAttribute('aria-label', api.header.querySelector('.ui-dialog-title').textContent)
    }
    api.setHead(opt.kicker, opt.title, opt.desc)
    if (opt.body != null) api.body.innerHTML = opt.body
    api.setFooter = html => { api.footer.innerHTML = html || ''; api.footer.hidden = !html }
    api.setFooter(opt.footer)
    let off = null
    api.close = why => {
      if (api.closed) return
      api.closed = true
      off?.()
      ov.remove()
      opt.onClose?.(why)
      api.restore?.focus?.({ preventScroll: true })
    }
    d.querySelector('.ui-dialog-close').onclick = () => { if (!opt.canClose || opt.canClose()) api.close('x') }
    api.restore = document.activeElement
    document.body.append(ov)
    off = layer({ modal: true, inside: t => d.contains(t) || !document.contains(t), close: api.close, canClose: opt.canClose })
    return api
  }

  // popover(anchor, html, { className, align, onClose }) → { el, close }: below its anchor, kept on screen
  function popover(anchor, html, opt = {}) {
    const el = document.createElement('div')
    el.className = `ui-popover${opt.className ? ` ${opt.className}` : ''}`
    el.setAttribute('role', 'dialog')
    if (typeof html === 'string') el.innerHTML = html; else el.append(html)
    document.body.append(el)
    const place = () => {
      const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight
      let x = opt.align === 'start' ? r.left : opt.align === 'center' ? r.left + r.width / 2 - w / 2 : r.right - w
      x = Math.max(8, Math.min(innerWidth - w - 8, x))
      let y = opt.above ? r.top - h - 8 : r.bottom + 8
      if (y + h > innerHeight - 8) y = Math.max(8, r.top - h - 8)
      el.style.left = `${Math.round(x)}px`; el.style.top = `${Math.round(y)}px`
    }
    place()
    const api = { el, place, closed: false }
    let off = null
    api.close = why => {
      if (api.closed) return
      api.closed = true
      off?.(); el.remove(); removeEventListener('resize', place)
      anchor.setAttribute('aria-expanded', 'false')
      opt.onClose?.(why)
    }
    anchor.setAttribute('aria-expanded', 'true')
    addEventListener('resize', place)
    off = layer({ modal: false, inside: t => el.contains(t) || anchor.contains(t) || !document.contains(t), close: api.close })
    return api
  }

  const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // any existing panel joins the same rules: layer(el, close, { modal, extra: [elements counted as inside] }) → off
  function join(el, close, opt = {}) {
    let off = null
    for (const x of stack) if (x.el === el) return () => {}  // already open
    const o = { el, modal: !!opt.modal, isOpen: opt.isOpen, inside: t => el.contains(t) || (opt.extra || []).some(x => typeof x === 'string' ? t.closest?.(x) : x?.contains?.(t)) || !document.contains(t), close: why => { off?.(); close(why) }, canClose: opt.canClose }
    off = layer(o)
    return off
  }
  // No tooltips (docs/ux/RULES.md): icon-only controls carry an aria-label, never a title or a hover hint.

  // a slider shows how full it is: the kit's track reads --v
  const slider = el => { const min = Number(el.min || 0), max = Number(el.max || 100); el.style.setProperty('--v', `${((Number(el.value) - min) / (max - min || 1)) * 100}%`) }
  addEventListener('input', e => { if (e.target.classList?.contains('ui-slider')) slider(e.target) }, true)
  window.SwarmUI = { dialog, popover, layer: join, esc, X, slider, open: () => stack.length }
})()
