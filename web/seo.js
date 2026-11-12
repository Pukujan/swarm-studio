// The page's search title, description and share picture: the Design panel's page
// settings, shown with nothing selected (docs/ux/SITEMAP.md, "Nothing selected: page
// and variables"). The crew writes them (engine/seo.mjs); the person can change them
// here, and a cleared field goes back to the crew's.

const esc = t => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
const base = src => String(src || '').split(/[?#]/)[0].split('/').pop()

// page: { id, title }; seo: what the crew and person set; pictures: [src] on the page
export function pageSeoHtml({ page, seo = {}, brand = '', pictures = [] }) {
  const title = seo.title || '', desc = seo.description || ''
  const chosen = seo.image || ''
  const pics = pictures.slice(0, 8).map((src, i) => {
    const on = chosen ? base(src) === chosen : i === 0
    return `<button class="dseo-pic${on ? ' on' : ''}" data-img="${esc(base(src))}" role="radio" aria-checked="${on}" aria-label="Share picture ${i + 1}"><img src="${esc(src)}" alt=""></button>`
  }).join('')
  return `<div class="dsec dseo" data-page="${esc(page.id)}"><h4>Search &amp; share<small>${esc(page.title)}</small></h4>
<label class="dseo-f"><span>Title</span><input data-seo="title" maxlength="90" value="${esc(title)}" placeholder="${esc(`${page.title} · ${brand}`.slice(0, 40))}"><small aria-label="Characters">${title.length}/60</small></label>
<label class="dseo-f"><span>Description</span><textarea data-seo="description" rows="3" maxlength="300" placeholder="From the page's copy">${esc(desc)}</textarea><small aria-label="Characters">${desc.length}/160</small></label>
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
