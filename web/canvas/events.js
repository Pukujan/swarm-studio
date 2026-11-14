// @ts-check
// web/canvas.js, split by area (web/canvas/README.md): engine events drawn on the canvas.
import { cosmosHooks, S, els, replayId } from './core.js'
import { fresh, setTitle, navBrand, links } from './base.js'
import { feed, botMsg, renderTheme, chatAgent, logSay, summarize, STOP_PILL, stoppedMsg, STOPPED } from './panels.js'
import { viewing, loadFiles, traceLive } from './replay.js'
import { addAgent, live, applyTheme, addFrame, addLayer, setTool, detectTool, gestureFor, spark, say, startGesture, banter } from './deck.js'
import { renderAppLink, idleCard, appEvent } from './rooms.js'
import { loadThemeFonts, design, showDtab, restyle, remember, CLIENT, applyEdit, showExport } from './design.js'
import { radioEvent, artEvent, autoEvent, reviewShow, deployShow, chatterHear } from './auto.js'
import { fillImages, autoReview, scanFrame, frameTitle } from './marks.js'
import { carryStart, carryEnd, carryNth } from './carry.js'
import { pics } from './start.js'
import { publishEvent } from './publish.js'
import { videoEvent } from './film.js'

// ---------- events

export function on(e) {
  for (const fn of cosmosHooks) try { fn(e) } catch (err) { console.error(err) } // studio hook (web/studio.js, web/project.js)
  switch (e.type) {
    case 'reset':
      if (S.run !== e.run) fresh(e.run)
      break
    case 'run:start':
      fresh(e.run)
      S.t0 = e.t
      S.paint = e.paint !== false // older builds don't say: their pictures were painted
      // a game has no canvas build: its spec and the App view are the whole file
      if (e.kind === 'game') { S.kind = 'game'; if (e.from) S.link = { run: e.from, label: `↔ ${e.fromName || 'the site'}` }; setTitle(`🎮 ${e.title || e.brief.slice(0, 60)}`); feed(null, `🎮 ${e.brief}`, 'you'); break }
      if (!viewing) els.agentsSel.value = String(e.agents.length)
      for (const a of e.agents) addAgent(a)
      // a project brought in (docs/specs/45-intake.md) goes by its name; its brief only says where it is from
      setTitle(e.intake && e.title ? e.title : e.brief.slice(0, 60))
      feed(null, e.ask || e.brief, 'you')
      S.extend = e.extend ? { kept: e.kept } : null
      S.progress = botMsg(e.extend ? 'Planning what to add…' : 'Planning the pages…', true)
      if (!viewing) loadFiles()
      break
    case 'plan:delta': {
      const k = e.page || 'sitemap'
      S.plans.set(k, (S.plans.get(k) || '') + e.text)
      S.planDirty = true
      break
    }
    case 'game:linked':
      S.link = { run: e.game, label: `🎮 ${e.title}` }
      renderAppLink()
      break
    case 'sitemap:done':
      els.planState.textContent = `sitemap ${(e.ms / 1000).toFixed(1)}s`
      break
    case 'page:planning': {
      const f = S.frames.find(fr => fr.id === e.page)
      feed(null, `Planner is drafting ${f ? f.title : e.page}`, 'sys')
      break
    }
    case 'plan:done':
      els.planState.textContent = `${e.pages} pages · ${e.layers} layers`
      feed(null, `Plan finished: ${e.pages} pages, ${e.layers} layers in ${(e.ms / 1000).toFixed(1)}s`, 'sys')
      S.planText = `Planned ${e.pages} pages and ${e.layers} sections in ${(e.ms / 1000).toFixed(1)}s.`
      break
    case 'theme':
      S.theme = e
      S.themeAt = live(e) ? performance.now() : 0
      loadThemeFonts(e)
      if (S.themeAt && !design.tabPinned) showDtab('vars')
      renderTheme()
      S.frames.forEach(applyTheme)
      break
    case 'page':
      addFrame(e)
      // the first page's title stands in until the nav's wordmark names the product
      if (e.index === 0 && !S.brand) setTitle(e.title)
      break
    case 'layer:plan':
      addLayer(e)
      break
    case 'agent:assign': {
      const a = S.agents.get(e.agent)
      const l = S.layers.get(key(e.page, e.layer))
      if (!a || !l) break
      a.layer = l.key
      a.idle = false
      a.assignedAt = performance.now()
      setTool(a, 'frame', 750)
      if (live(e)) {
        a.queued = 'marquee'
        // the design system is set: back to the selection's properties
        if (!design.tabPinned && design.tab === 'vars' && performance.now() - (S.themeAt || 0) > 5000) showDtab('design')
      }
      l.status = 'assigned'
      l.agent = a.id
      S.treeDirty = true
      break
    }
    case 'layer:delta': {
      const l = S.layers.get(key(e.page, e.layer))
      const a = S.agents.get(e.agent)
      if (!l) break
      l.text += e.text
      l.ver++
      if (l.status === 'assigned') { l.status = 'streaming'; S.treeDirty = true }
      S.lastActive = e.agent
      if (a) {
        setTool(a, detectTool(l.text))
        if (live(e) && !a.act && performance.now() > a.restUntil) a.queued = gestureFor(l.text) || a.queued
        if (live(e)) spark(a, e.text)
      }
      break
    }
    case 'agent:say': {
      if (e.app) radioEvent(e)
      const a = S.agents.get(e.agent)
      if (!a) break
      // replays (a reopened file, a late join) go to the feed without a burst of bubbles
      if (Date.now() - e.t < 5000) say(a, e.text)
      setTool(a, 'comment', 450)
      feed(a, e.text, '', e.layer)
      break
    }
    case 'layer:done': {
      const l = S.layers.get(key(e.page, e.layer))
      if (!l) break
      l.status = 'done'
      l.ms = e.ms
      // saved runs carry the finished HTML, so a file can be reopened without the stream
      if (e.html) { l.text = e.html; l.ver++ }
      // the shared nav's wordmark is the product's name ("SkyLedger"), not the first page's title
      if (e.page === '*' && e.layer === 'nav' && e.html && S.kind !== 'game') { const b = navBrand(e.html); if (b) { S.brand = b; setTitle(b) } }
      // whole-site edits made earlier (bigger headings, more spacing) apply to late sections too;
      // a reviewer's fix was written from the edited section, so it has them already
      if (!e.fixed && !e.kept) for (const ce of S.classEdits) restyle(l, ce)
      // what the section was before a rewrite, kept for Undo (read before it is cleared)
      const before = l.before
      l.before = null
      fillImages(l)
      if (e.kept) { S.treeDirty = true; break } // carried over from the last version as it was
      if (e.fixed && !e.restored && before && live(e)) remember({ kind: 'layer', key: l.key, page: e.page, layer: e.layer, before, after: e.html, label: `${l.role || e.layer} rewrite` })
      if (e.restored && e.by !== CLIENT && live(e)) feed(null, `${l.role || e.layer} was put back to an earlier version`, 'sys')
      if (e.fixed && !e.restored) { feed(S.agents.get(e.agent), `fixed ${e.layer}`, 'sys', e.layer); chatAgent(S.agents.get(e.agent), `Done: the ${l.role || e.layer} is updated (${((e.ms || 0) / 1000).toFixed(0)}s). /trace shows what I was asked and wrote.`, e.layer) }
      if (e.done != null) S.done = e.done
      S.treeDirty = true
      const a = S.agents.get(e.agent)
      if (a) {
        if (live(e) && !a.act) startGesture(a, 'resize', l)
        if (live(e)) { a.el.classList.remove('hop'); void a.el.offsetWidth; a.el.classList.add('hop'); setTimeout(() => a.el.classList.remove('hop'), 600) }
        a.layer = null
        setTool(a, 'move', 400)
      }
      break
    }
    case 'layer:failed': {
      const l = S.layers.get(key(e.page, e.layer))
      if (l) { l.status = 'failed'; S.treeDirty = true }
      // a failed fix puts the section back as it was
      if (l && e.keep) { l.text = e.keep; l.ver++; l.status = 'done'; if (e.message !== 'stopped') chatAgent(S.agents.get(e.agent), `Couldn't make that change: ${e.message}. Try again, or ask for less at once.`, e.layer) }
      const a = S.agents.get(e.agent)
      if (a) a.layer = null
      feed(a, `failed ${e.layer}: ${e.message}`, 'err')
      break
    }
    case 'crew:act':
      radioEvent(e)
      break
    case 'art:job':
      artEvent(e)
      break
    case 'game:idle':
      idleCard(e)
      break
    case 'crew:lead': {
      // the app engine's lead agent, speaking as Hermia: thinking out loud and giving orders
      radioEvent(e)
      logSay(e)
      if (e.kind === 'reason') break // her reasoning: the log only, no bubble or order
      const to = e.to && [...S.agents.values()].find(x => x.name === e.to)
      if (to && Date.now() - e.t < 5000) say(to, `Hermia: ${e.text.slice(0, 120)}`, 3200)
      break
    }
    case 'agent:idle': {
      const a = S.agents.get(e.agent)
      if (a) { a.idle = true; a.layer = null; a.tool = 'move' }
      break
    }
    case 'run:done':
      S.tEnd = e.t
      feed(null, `Done: ${e.done}/${e.planned} layers across ${e.pages} pages in ${(e.ms / 1000).toFixed(1)}s${e.failed ? `, ${e.failed} failed` : ''}`, 'sys')
      summarize(e)
      els.planState.textContent = 'done'
      if (!viewing) { S.cheerUntil = performance.now() + 9000; banter.next = 0; loadFiles() }
      if (live(e)) autoReview()
      break
    case 'run:stopped': {
      // Stop (the top bar): what is built is kept; a section caught half way is let go
      S.tEnd = e.t
      // the pill names the cause: stopped (by you), no Hermes, model, timed out
      els.planState.textContent = STOP_PILL[e.reason?.code] || 'stopped'
      for (const a of S.agents.values()) { a.idle = true; a.layer = null; a.tool = 'move'; a.painting = null }
      for (const l of S.layers.values()) if (l.status === 'assigned' || l.status === 'streaming') { l.status = 'planned'; l.agent = null; l.text = '' }
      S.treeDirty = true
      if (live(e)) stoppedMsg(e)
      break
    }
    case 'work:stopped':
      if (live(e)) botMsg(`Stopped the ${e.what.map(w => STOPPED[w] || w).join(' and ')}. Everything finished is kept.`)
      break
    case 'error':
      feed(null, `${e.where}: ${e.message}`, 'err')
      break
    case 'edit':
      applyEdit(e)
      break
    // search titles, descriptions and share pictures (engine/seo.mjs)
    case 'seo': {
      const next = { ...(S.seo.get(e.page) || {}) }
      for (const f of ['title', 'description', 'image']) if (e[f] === '') delete next[f]; else if (e[f]) next[f] = e[f]
      S.seo.set(e.page, next)
      design.last = ''
      break
    }
    case 'seo:review':
      feed(null, `🔎 Search & share: ${e.pages} pages checked${e.fixed?.length ? ` · ${e.fixed.length} fixed` : ''}`, 'sys')
      break
    case 'seo:start': {
      const a = S.agents.get(e.agent)
      if (a && live(e)) say(a, 'Reading the titles and descriptions')
      break
    }
    case 'seo:pass':
      chatAgent(S.agents.get(e.agent), [e.reply, ...(e.changes || [])].filter(Boolean).join('\n'))
      break
    case 'image:queued': {
      const l = S.layers.get(key(e.page, e.layer))
      const a = (e.agent && S.agents.get(e.agent)) || (l && S.agents.get(l.agent))
      if (a && live(e)) { a.painting = { gen: e.gen, key: `${key(e.page, e.layer)}|${e.gen}`, from: performance.now(), until: performance.now() + 180000 }; say(a, `🖼 asking ${e.provider === 'openai-codex' ? 'Codex' : e.provider} for “${e.gen.slice(0, 40)}…”`) }
      // its card waits beside the page, held by its painter (web/canvas/carry.js)
      if (l && live(e)) carryStart(e, carryNth(l.text, e.gen))
      if (!S.imgQueued++) feed(null, `🎨 Painting images with ${e.provider}${e.model ? ` · ${e.model}` : ''}`, 'sys')
      break
    }
    case 'image':
    case 'image:failed': {
      S.imgSettled++
      S.images.set(`${key(e.page, e.layer)}|${e.gen}`, e.type === 'image' ? e.src : '')
      pics.pending.delete(`${key(e.page, e.layer)}|${e.gen}`); design.last = ''
      const l = S.layers.get(key(e.page, e.layer))
      // the slot shows it when its card is dropped there; at once when no card was waiting (web/canvas/carry.js)
      carryEnd(`${key(e.page, e.layer)}|${e.gen}`, e.type === 'image' && live(e) ? e.src : '', () => { if (l) fillImages(l) })
      // a picture the person asked for in a comment: the chat says when it is in (or could not be painted)
      if (e.asked && live(e)) chatAgent(S.agents.get(e.agent), e.type === 'image' ? 'Done: the new picture is in.' : `Couldn't paint that picture: ${e.message || 'no image'}.`, e.layer)
      // the agent who asked for it stops painting
      for (const a of S.agents.values()) if (a.painting?.key === `${key(e.page, e.layer)}|${e.gen}`) { a.painting = null; if (live(e) && e.type === 'image') say(a, '🖼 photo’s in') }
      if (e.type === 'image:failed' && e.message !== 'stopped') feed(null, `image for ${e.layer} failed: ${e.message}`, 'err')
      break
    }
    case 'review:start':
      scanFrame(e.page, true)
      feed(null, `🔎 ${e.model} is looking at ${frameTitle(e.page)}`, 'sys')
      break
    case 'review:done':
      scanFrame(e.page, false)
      feed(null, `🔎 ${frameTitle(e.page)}${e.phone ? ' (desktop + phone)' : ''}: ${e.verdict || 'reviewed'}${e.issues.length ? ` · ${e.issues.length} to fix` : ' · nothing to fix'}${e.dropped ? ` · ignored ${e.dropped} “blank” note${e.dropped > 1 ? 's' : ''} the page's text disproves` : ''}`, 'sys')
      if (e.phoneError) feed(null, `📱 phone review of ${frameTitle(e.page)} failed: ${e.phoneError}`, 'err')
      break
    case 'review:issue':
      feed(S.agents.get(e.agent), `on it: ${e.problem}`, '', e.layer)
      break
    case 'layer:reset': {
      const l = S.layers.get(key(e.page, e.layer))
      if (l) { if (l.text) l.before = l.text; l.text = ''; l.ver++; l.status = 'assigned'; S.treeDirty = true }
      break
    }
    case 'export':
      if (Date.now() - e.t < 8000) showExport(e)
      break
    case 'publish:start': case 'publish:stage': case 'publish:done': case 'publish:failed':
      publishEvent(e)
      break
    case 'comment':
      // a turn sent with layers dragged in keeps them: hovering it draws their lines again
      links.mark(feed(null, `💬 ${e.text}`, 'you'), (e.layers || []).map(x => `${x.page}/${x.layer}`))
      break
    case 'comment:take': {
      const a = S.agents.get(e.agent)
      const what = e.reply || `On it, reworking the ${e.role || e.layer}.`
      if (a && Date.now() - e.t < 8000) say(a, what)
      chatAgent(a, what, e.layer, [`${e.page}/${e.layer}`])
      break
    }
    case 'draft':
      chatAgent(S.agents.get(e.agent), `A draft of the ${e.role || e.layer} is beside the page.`, e.layer, [`${e.page}/${e.layer}`])
      break
    case 'comment:none':
      chatAgent(null, 'Not sure which section that is about. Select one on the canvas and comment there.')
      break
    case 'video:start': case 'video:story': case 'video:progress': case 'video:done': case 'video:failed': case 'video:review':
      videoEvent(e)
      break
    case 'trace':
      traceLive(e)
      break
    case 'auto':
      // a replay moves between views as the live run did
      autoEvent(e, replayId ? true : undefined)
      break
    case 'game:spec':
      S.spec = e.spec
      botMsg(`🎮 ${e.spec.title}: ${e.spec.pitch || ''} (${e.spec.engine})`)
      break
    case 'app:start': case 'app:step': case 'app:ready': case 'app:done': case 'app:failed': case 'app:deployed': case 'app:parked':
      appEvent(e)
      break
  }
  // the Auto show watches the same events; a slip there never stops the canvas
  try { reviewShow(e); deployShow(e); chatterHear(e) } catch (err) { console.error(err) }
}

export const key = (page, id) => `${page}/${id}`
