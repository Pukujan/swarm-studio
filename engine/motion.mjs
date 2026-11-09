// Motion for a finished site: sections reveal as they scroll in (their headings,
// copy, pictures and cards one after another), the first section plays on load,
// and anything clickable lifts under the pointer. The feel follows the theme's
// art direction. One source for Play mode, the HTML export and the React export.

// Bold, playful themes get a quicker, springier entrance; everything else a soft rise.
export const SNAPPY = /bold|playful|vibrant|energetic|loud|neon|brutal|punchy|electric|fun|retro|arcade/

export function motionPreset(theme = {}) {
  const words = `${theme.name || ''} ${theme.direction || ''}`.toLowerCase()
  return SNAPPY.test(words) ? 'snappy' : 'gentle'
}

export const MOTION_CSS = `
[data-goto],button,a[href]{transition:transform .2s ease,box-shadow .2s ease,filter .2s ease}
[data-goto]:hover,button:hover{transform:translateY(-2px);filter:brightness(1.04)}
.m-t{opacity:0;transform:translateY(var(--m-rise)) scale(var(--m-scale));transition:opacity var(--m-ms) var(--m-ease),transform var(--m-ms) var(--m-ease);transition-delay:var(--m-delay,0ms)}
img.m-t{transform:scale(1.06)}
.m-t.m-in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.m-t{opacity:1;transform:none;transition:none}[data-goto]:hover,button:hover{transform:none}}
`

// Runs in the page. Idempotent: call it again after new sections appear.
export function swarmMotion(root, preset) {
  const p = { gentle: { rise: 18, scale: 1, ms: 750, step: 70, ease: 'cubic-bezier(.2,.7,.2,1)' }, snappy: { rise: 36, scale: 0.96, ms: 520, step: 55, ease: 'cubic-bezier(.34,1.56,.64,1)' } }[preset] || { rise: 18, scale: 1, ms: 750, step: 70, ease: 'ease' }
  const doc = root.ownerDocument || root
  const html = doc.documentElement
  html.style.setProperty('--m-rise', `${p.rise}px`)
  html.style.setProperty('--m-scale', String(p.scale))
  html.style.setProperty('--m-ms', `${p.ms}ms`)
  html.style.setProperty('--m-ease', p.ease)
  const view = doc.defaultView
  if (view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const PICK = 'h1,h2,h3,h4,p,img,button,[data-goto],li,article,figure,blockquote,form,table,svg'
  // the page's top-level blocks are its sections
  const sections = [...root.children].filter(el => !/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(el.tagName))
  // once revealed, an element drops the reveal so its hover moves without a delay
  const settle = el => {
    const done = e => {
      if (e.target !== el) return
      el.removeEventListener('transitionend', done)
      el.classList.remove('m-t', 'm-in')
      el.style.removeProperty('--m-delay')
    }
    el.addEventListener('transitionend', done)
  }
  const show = s => s.querySelectorAll('.m-t:not(.m-in)').forEach(el => { settle(el); el.classList.add('m-in') })
  const io = new view.IntersectionObserver(entries => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      io.unobserve(e.target)
      show(e.target)
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' })
  sections.forEach((s, si) => {
    if (s.dataset.mDone) return
    s.dataset.mDone = '1'
    // the nav is there from the start
    if (/^(nav|header)$/i.test(s.tagName) || s.dataset.layer === 'nav' || (si === 0 && s.querySelector('nav'))) return
    let n = 0
    for (const el of s.querySelectorAll(PICK)) {
      if (n >= 14) break
      if (el.closest('.m-t') || (el.tagName.toLowerCase() !== 'svg' && el.closest('svg'))) continue
      // tiny things, and things the design already moves or positions with a transform, stay put
      if (el.getBoundingClientRect().height < 4 || view.getComputedStyle(el).transform !== 'none') continue
      el.classList.add('m-t')
      el.style.setProperty('--m-delay', `${Math.min(n, 10) * p.step}ms`)
      n++
    }
    // the first screen plays as the page opens; the rest as it scrolls in
    if (s.getBoundingClientRect().top < view.innerHeight * 0.9) view.requestAnimationFrame(() => view.requestAnimationFrame(() => show(s)))
    else io.observe(s)
  })
}

// As text, for pages that get the motion inline.
export const motionSource = preset => `(${swarmMotion.toString()})(document.body, ${JSON.stringify(preset)})`

