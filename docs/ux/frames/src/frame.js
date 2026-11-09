// Shared frame parts: the five-slot nav, the brand art and the crew avatars (web/crew.js).
// Load it after crew.js and before icons.js, which turns every <i data-i> into a lucide icon.
const BRAND = '../../../../web/brand/'
const SLOTS = [['home', 'house', 'Home'], ['discover', 'compass', 'Discover'], ['create', 'plus', 'Create'],
  ['projects', 'folder', 'Projects'], ['me', 'circle-user', 'Me']]
const nav = document.querySelector('nav.nav')
if (nav) {
  const on = document.body.dataset.nav
  nav.innerHTML = `<div class="logo"><img src="${BRAND}hermia-mark.svg" width="34" height="34" alt=""></div>`
    + SLOTS.map(([k, i, t]) => k === 'create'
      ? `<a class="create${on === k ? ' on' : ''}"><span class="bub"><i data-i="${i}"></i></span>${t}</a>`
      : `<a${on === k ? ' class="on"' : ''}><i data-i="${i}"></i>${t}</a>`).join('')
}
document.querySelectorAll('img[data-brand]').forEach(el => { el.src = BRAND + el.dataset.brand })
document.querySelectorAll('i[data-crew]').forEach(el => {
  if (!window.SwarmCrew) return el.remove()
  const t = document.createElement('template')
  t.innerHTML = window.SwarmCrew.avatar(el.dataset.crew, +(el.dataset.s || 28))
  const svg = t.content.firstElementChild
  svg.classList.add(...el.className.split(/\s+/).filter(Boolean))
  if (el.style.cssText) svg.style.cssText += ';' + el.style.cssText
  el.replaceWith(svg)
})
