// The page's search title, description and share picture: the Design panel's page
// settings, shown with nothing selected (docs/ux/SITEMAP.md, "Nothing selected: page
// and variables"). The crew writes them (engine/seo.mjs); the person can change them
// here, and a cleared field goes back to the crew's.

const seoEsc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const seoName = src => String(src || '').split(/[?#]/)[0].split('/').pop()

// page: { id, title }; seo: what the crew and person set; pictures: [src] on the page
export function pageSeoHtml({ page, seo = {}, brand = '', pictures = [] }) {
  const title = seo.title || '', desc = seo.description || ''
  const chosen = seo.image || ''
  const pics = pictures.slice(0, 8).map((src, i) => {
    const on = chosen ? seoName(src) === chosen : i === 0
    return `<button class="dseo-pic${on ? ' on' : ''}" data-img="${seoEsc(seoName(src))}" role="radio" aria-checked="${on}" aria-label="Share picture ${i + 1}"><img src="${seoEsc(src)}" alt=""></button>`
  }).join('')
  return `<div class="dsec dseo" data-page="${seoEsc(page.id)}"><h4>Search &amp; share<small>${seoEsc(page.title)}</small></h4>
<label class="dseo-f"><span>Title</span><input data-seo="title" maxlength="90" value="${seoEsc(title)}" placeholder="${seoEsc(`${page.title} · ${brand}`.slice(0, 40))}"><small aria-label="Characters">${title.length}/60</small></label>
<label class="dseo-f"><span>Description</span><textarea data-seo="description" rows="3" maxlength="300" placeholder="From the page's copy">${seoEsc(desc)}</textarea><small aria-label="Characters">${desc.length}/160</small></label>
${pics ? `<div class="dseo-f"><span>Share picture</span><div class="dseo-pics" role="radiogroup" aria-label="Share picture">${pics}</div></div>` : ''}
</div>`
}

export function wirePageSeo(root, { run, api, onError = () => {} }) {
  const box = root.querySelector('.dseo')
  if (!box || !run) return
  const page = box.dataset.page
  const save = async body => {
    const res = await api(`/api/runs/${encodeURIComponent(run)}/seo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page, ...body }) }).catch(() => null)
    if (!res?.ok) onError((await res?.json().catch(() => ({})))?.error || 'the canvas server is not answering')
  }
  for (const el of box.querySelectorAll('[data-seo]')) {
    const count = el.parentElement.querySelector('small')
    const max = el.dataset.seo === 'title' ? 60 : 160
    const was = el.value
    el.addEventListener('input', () => { count.textContent = `${el.value.length}/${max}`; count.classList.toggle('over', el.value.length > max) })
    count.classList.toggle('over', el.value.length > max)
    el.addEventListener('change', () => { if (el.value.trim() !== was.trim()) save({ [el.dataset.seo]: el.value.trim() }) })
    if (el.tagName === 'INPUT') el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); el.blur() } })
  }
  for (const b of box.querySelectorAll('.dseo-pic')) b.onclick = () => save({ image: b.dataset.img })
}

// The Publish menu's thumbnail: picked with no one asked (the home page's hero, else the
// first picture, else a shot of the page at export); one click on another of the build's
// pictures swaps it. thumb: GET /api/runs/:id/seo's.
export function thumbRowHtml(thumb) {
  if (!thumb?.src) return ''
  const others = thumb.pictures.filter(src => src !== thumb.src).slice(0, 6)
  return `<div class="pthumb" data-page="${seoEsc(thumb.page)}"><img class="pthumb-main" src="${seoEsc(thumb.src)}" alt="Thumbnail">${others.length ? `<div class="pthumb-alt" role="group" aria-label="Swap thumbnail">${others.map((src, i) => `<button data-img="${seoEsc(seoName(src))}" data-src="${seoEsc(src)}" aria-label="Thumbnail ${i + 2}"><img src="${seoEsc(src)}" alt=""></button>`).join('')}</div>` : ''}</div>`
}

export async function fillThumbRow(el, { run, api }) {
  const slot = el?.querySelector('.pthumb-slot')
  if (!slot || !run) return
  const got = await api(`/api/runs/${encodeURIComponent(run)}/seo`).then(r => (r.ok ? r.json() : null)).catch(() => null)
  slot.innerHTML = thumbRowHtml(got?.thumb)
  const box = slot.querySelector('.pthumb')
  for (const b of slot.querySelectorAll('.pthumb-alt button')) {
    b.onclick = async () => {
      const res = await api(`/api/runs/${encodeURIComponent(run)}/seo`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ page: box.dataset.page, image: b.dataset.img }) }).catch(() => null)
      if (res?.ok) fillThumbRow(el, { run, api })
    }
  }
}
