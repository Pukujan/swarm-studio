// @ts-check
// The Website kit (docs/specs/37-studio-first.md): its Plan step is a storyboard strip of the pages, drawn
// in the project's brand (the brand sheet is the Brand step). Its build is today's website build, inside
// the Studio's project. server/page.mjs joins this file in its own closure, so its names stay its own.
import { ic } from './icons.js'

// No pages by default: the crew decides them from the idea unless the person adds their own (the owner,
// 2026-11-13: "people are allowed to choose and they shouldnt be default"). Home, About and Contact used to be
// filled in and then forced into every build.
const GUESS = []
const pagesOf = ctx => ctx.state.pages || (ctx.brand?.story?.pages?.length ? ctx.brand.story.pages : GUESS)
// the person skipped the Plan when asked before the build (docs/decisions/0020-ask-before-build.md): the planner
// picks the pages, so the guess is not handed to the crew as if it were theirs
const planSkipped = ctx => ctx.studio?.steps?.plan === 'skipped' && !ctx.state.pages?.length
// the same when they said "you choose" in the chat (engine/askfirst.mjs: pagesBy 'crew'): the brand story's pages
// are a suggestion on the board, not theirs
const crewPicks = ctx => planSkipped(ctx) || (ctx.state.pagesBy === 'crew' && !ctx.state.pages?.length)
const MAX = 12

// one page as a frame of the strip: a nav line, the page's name in the brand's heading, two lines of text
function frame(el, ctx, name, i) {
  const L = ctx.look, esc = ctx.sw.esc
  el.style.cssText = L ? `background:${L.bg};color:${L.text};--a:${L.accent}` : ''
  el.innerHTML = `<i class="sc-nav"></i><b${L ? ` style="font-family:'${esc(L.heading)}'"` : ''}>${esc(name)}</b><u></u><u></u><em>${i + 1}</em>`
}

export const siteKit = {
  kind: 'site',
  name: 'Website',
  icon: 'site',
  steps: ['brand', 'references', 'assets', 'plan'],
  starts: [
    { id: 'brand', name: 'Brand', why: 'every page reads its colours, type and voice' },
    { id: 'references', name: 'References', why: 'a few sites you like set the mood' },
    { id: 'plan', name: 'Pages', why: 'the pages say what the site is for' }
  ],
  // where the planner says to start: the brand first, then what it looks like, then the pages
  suggest: ctx => (!ctx.brand ? 'brand' : !ctx.refs.length && !ctx.assets.length ? 'references' : 'plan'),
  reads: ['palette', 'type', 'voice', 'pictures'],
  plan: {
    sections: ctx => {
      const pages = pagesOf(ctx)
      const save = list => ctx.save({ pages: list })
      const cards = pages.map((name, i) => ({
        key: `page:${i}`, name, cls: 'sc-frame',
        render: el => frame(el, ctx, name, i),
        // the Layers row's Rename and Delete (web/scaffold.js)
        rename: v => save(pages.map((p, j) => (j === i ? v.slice(0, 40) : p))),
        remove: () => save(pages.filter((_, j) => j !== i)).then(() => ctx.select(null)),
        inspect: box => {
          const esc = ctx.sw.esc
          box.innerHTML = `<label class="pl-f"><span>Name</span><input value="${esc(name)}" maxlength="40"></label>
            <div class="sc-acts">${i > 0 ? `<button class="btn ghost" data-a="left">${ic('chl', 15)}Earlier</button>` : ''}${i < pages.length - 1 ? `<button class="btn ghost" data-a="right">Later${ic('chr', 15)}</button>` : ''}${pages.length > 1 ? `<button class="btn ghost" data-a="remove">${ic('trash', 15)}Remove</button>` : ''}</div>`
          box.querySelector('input').onchange = e => { const v = e.target.value.trim(); if (v) save(pages.map((p, j) => (j === i ? v.slice(0, 40) : p))) }
          box.onclick = e => {
            const a = e.target.closest('[data-a]')?.dataset.a
            if (!a) return
            const list = [...pages]
            let next = null
            if (a === 'remove') list.splice(i, 1)
            else {
              const j = a === 'left' ? i - 1 : i + 1;
              [list[i], list[j]] = [list[j], list[i]]
              next = `page:${j}`
            }
            // the board draws the new list first, then the selection moves with the page
            save(list).then(() => ctx.select(next))
          }
        }
      }))
      if (pages.length < MAX) cards.push({
        key: 'page:add', name: 'Add page', cls: 'sc-add',
        render: el => { el.innerHTML = `${ic('plus', 18)}<span>Add page</span>` },
        press: () => save([...pages, `Page ${pages.length + 1}`]).then(() => ctx.select(`page:${pages.length}`))
      })
      return [{ sec: 'Pages', cards }]
    },
    questions: () => [],
    done: ctx => !!ctx.state.pages?.length
  },
  proposal: ctx => ({ items: pagesOf(ctx).map((what, i) => ({ what, order: i + 1 })), minutes: 4 + 2 * pagesOf(ctx).length, credits: null }),
  lock: ctx => (crewPicks(ctx) ? {} : { pages: pagesOf(ctx) }),
  // the person's press: the idea and its pages, built inside the Studio's project
  build: async (spec, ctx) => {
    const pages = spec.kits?.site?.pages || (crewPicks(ctx) ? null : pagesOf(ctx))
    const idea = String(spec.idea || ctx.studio.idea)
    // "3 pages" said in the chat with no names (engine/askfirst.mjs): the count goes, the crew picks which
    const n = !pages?.length && !planSkipped(ctx) ? Math.min(MAX, Number(ctx.state.pageCount) || 0) : 0
    const brief = pages?.length ? `${idea}\n\nPages: ${pages.join(', ')}.` : n ? `${idea}\n\nPages: ${n}, the crew picks which.` : idea
    const run = await ctx.sw.submit(brief, false, ctx.project.id, null, { chat: ctx.chat })
    return { run: typeof run === 'string' ? run : null }
  }
}
