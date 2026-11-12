// Runs inside the page (page.evaluate): what the screen shows that the UX rules forbid, with the box of
// each thing so the walkthrough can mark it on the picture. docs/ux/RULES.md and the owner's rules:
// no tooltips, targets of 40 px (44 on touch), no blue, purple or green in the Studio's own chrome,
// every control named, nothing scrolling sideways, no raw errors or internal names, few words.
(({ touch }) => {
  const MIN = touch ? 44 : 40
  const seen = el => el.checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true }) !== false && (() => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth })()
  const box = el => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }
  // built pages, pictures and art are content, not the Studio's chrome
  const CONTENT = 'iframe, img, video, canvas, picture, .ab, .frame, .card .im, .pj-world .sk, .slot, .tile .im, .swatch, .sw, [data-content]'
  const inContent = el => !!el.closest(CONTENT)
  const label = el => (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40)
  const out = { tips: [], small: [], colour: [], unnamed: [], raw: [], internal: [], sentences: [], words: 0, overflow: false, buttons: 0 }
  const push = (k, el, extra = {}) => { if (out[k].length < 14) out[k].push({ box: box(el), label: label(el), ...extra }) }

  for (const el of document.querySelectorAll('[title], [data-tip]')) if (seen(el) && !inContent(el) && el.tagName !== 'svg' && el.tagName !== 'IFRAME') push('tips', el, { tip: el.getAttribute('title') || el.dataset.tip })

  const ACT = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=tab], [role=menuitem], [role=option], [role=switch], [role=checkbox]'
  for (const el of document.querySelectorAll(ACT)) {
    if (!seen(el) || inContent(el) || el.closest('[inert], [aria-hidden=true]')) continue
    out.buttons++
    const r = el.getBoundingClientRect()
    // a checkbox inside its label row is the row's target
    const host = el.matches('input[type=checkbox], input[type=radio]') ? el.closest('label') || el : el
    const hr = host.getBoundingClientRect()
    if (Math.min(hr.width, hr.height) < MIN - 0.5) push('small', host, { size: `${Math.round(hr.width)}×${Math.round(hr.height)}` })
    const named = el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || (el.innerText || '').trim() || el.value || el.placeholder || el.closest('label')?.innerText?.trim() || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`))
    if (!named && r.width) push('unnamed', el)
  }

  // colour: a hue of green, blue or purple, with real saturation, on the Studio's own elements
  const hsl = c => {
    const m = c.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/)
    if (!m || (m[4] !== undefined && +m[4] < 0.25)) return null
    const [r, g, b] = [m[1], m[2], m[3]].map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn
    if (!d) return null
    const s = d / (1 - Math.abs(2 * l - 1))
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
    return { h, s, l }
  }
  const hue = c => { const x = hsl(c); if (!x || x.s < 0.3 || x.l < 0.15 || x.l > 0.88) return null; return x.h >= 75 && x.h < 170 ? 'green' : x.h >= 170 && x.h < 255 ? 'blue' : x.h >= 255 && x.h < 320 ? 'purple' : null }
  const coloured = new Set()
  for (const el of document.body.querySelectorAll('*')) {
    if (out.colour.length >= 14) break
    if (inContent(el) || !seen(el)) continue
    const cs = getComputedStyle(el)
    const own = (el.childNodes.length && [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) ? cs.color : null
    const props = [['text', own], ['fill', cs.backgroundColor], ['border', parseFloat(cs.borderTopWidth) ? cs.borderTopColor : null], ['icon', el.tagName === 'path' || el.tagName === 'svg' ? cs.fill !== 'none' ? cs.fill : cs.stroke : null]]
    for (const [what, c] of props) {
      const h = c && hue(c)
      if (!h) continue
      const key = `${h}|${c}|${el.className}`
      if (coloured.has(key)) continue
      coloured.add(key)
      push('colour', el, { what, hue: h, value: c })
      break
    }
  }

  // text: raw errors, internal names, sentences, and the word count of the Studio's own text
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const RAW = /HTTP \d{3}|\{"|"error"|\bstack\b|undefined|\[object Object\]|\bNaN\b|ECONN|Error:/
  const INTERNAL = /\bARES\b|festival|\bslice\b|\bkit\b|\bspec\b|layer:|run:|cli\/|deepseek|\bplanner\b|\bbuilders?\b|\bLLM\b|\bAPI\b|endpoint|webhook|\bjson\b/i
  for (let n; (n = walker.nextNode());) {
    const t = n.textContent.trim()
    const el = n.parentElement
    if (!t || !el || !seen(el) || inContent(el) || el.closest('script, style, noscript, .home .card .meta')) continue
    const words = t.split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length
    out.words += words
    if (RAW.test(t)) push('raw', el, { text: t.slice(0, 90) })
    else if (INTERNAL.test(t)) push('internal', el, { text: t.slice(0, 90) })
    if (words >= 7 && /[a-z]/.test(t)) push('sentences', el, { text: t.slice(0, 120) })
  }
  for (const el of document.querySelectorAll('input[placeholder], textarea[placeholder]')) if (seen(el)) { const w = el.placeholder.split(/\s+/).length; out.words += w; if (w > 6) push('sentences', el, { text: `placeholder: ${el.placeholder}` }) }
  out.overflow = document.scrollingElement.scrollWidth > innerWidth + 1
  return out
})
