// ARES personality: the little moments that make the cast feel alive. The heroines tease the
// player when left standing, gloat after a perfect dodge or a long combo, taunt a resting boss
// and answer its entrance line; bosses bark in their own voice; Teknium's automatons call out
// as they spawn, strike and fall; the titan booms.
//
// It wraps core functions (classic scripts share one global scope, and a top-level function
// can be reassigned), so nothing else has to know about it. Lines come from the data:
// heroes.json barks, fights.json barks, enemies.json barks, each { line (voice), line_en (shown) }.
// Voice files: assets/voice/<id>/bark-<key>.mp3, where id is the hero, the lower-case boss
// handle, `enemy-<type>` or `asura`. A missing file just stays quiet.

const PERS = { next: {}, teaseAt: 0, comboMark: 0, lowSaid: false, replyFor: null }

// the English line for a bark, if the data has one
function barkLine(id, key) {
  const k = key.replace(/^bark-/, '')
  const h = HERO_DATA?.heroes?.[id]
  if (h) return h.barks?.[k]?.line_en || ''
  if (id === 'asura') return FIGHTS?.Asura?.barks?.[k]?.line_en || ''
  if (id.startsWith('enemy-')) return ENEMIES?.[id.slice(6)]?.barks?.[k]?.line_en || ''
  const f = Object.entries(FIGHTS || {}).find(([hd]) => hd.toLowerCase() === id)
  return f?.[1]?.barks?.[k]?.line_en || ''
}
// a variant key (tease-idle, tease-idle2, ...) that the data actually has
function barkVariant(id, key) {
  const h = HERO_DATA?.heroes?.[id]
  const all = h ? Object.keys(h.barks || {}).filter(k => k === key || (k.startsWith(key) && /^\d+$/.test(k.slice(key.length)))) : [key]
  return all.length ? all[(Math.random() * all.length) | 0] : key
}

// one bark: voice, plus a short subtitle for the heroines and bosses (never for grunts)
function bark(id, key, o = {}) {
  if (!id || mode !== 'play') return
  const gap = o.gap ?? 6
  if ((PERS.next[id + key] || 0) > T) return
  if (o.chance != null && Math.random() > o.chance) return
  const k = id in (HERO_DATA?.heroes || {}) ? barkVariant(id, key) : key
  if (id.startsWith('enemy-')) {
    // machines talk on their own quiet channel, and only into silence
    if (voicePlaying() || (PERS.next.enemy || 0) > T) return
    PERS.next.enemy = T + 3.5
    const a = new Audio(`../assets/voice/${id}/bark-${k}.mp3`); a.volume = 0.55; a.play().catch(() => { })
  } else {
    if (!o.force && (voicePlaying() || voiceQ.length)) return
    say(id, `bark-${k}`, !!o.force)
    const en = barkLine(id, k)
    if (en && o.sub !== false) subtitle(en, o.subT || 2.2)
  }
  PERS.next[id + key] = T + gap
}

// where the hero data lives (game.js keeps it as HEROES_DATA or similar; look it up once)
// heroes.json, which game.js keeps as CFG
let HERO_DATA = null
function persInit() { HERO_DATA = typeof CFG !== 'undefined' ? CFG : null; if (!HERO_DATA) setTimeout(persInit, 500) }

const wrap = (name, after, before) => {
  const f = window[name]; if (typeof f !== 'function') return
  window[name] = function (...a) { if (before) before(...a); const r = f.apply(this, a); try { after?.(r, ...a) } catch (e) { console.warn('pers', name, e) } return r }
}

// ---- heroines
wrap('perfectDodge', () => bark(P.hero, 'tease-dodge', { chance: 0.5, gap: 10 }))
wrap('swapHero', () => later(0.25, () => bark(P.hero, 'swap-in', { chance: 0.6, gap: 8 })))
wrap('fellInPit', () => bark(P.hero, 'fall', { gap: 6, force: true }))
wrap('takeBoon', () => bark(P.hero, 'boon', { gap: 4, force: true }))
wrap('stageClear', () => later(0.6, () => bark(P.hero, 'stage', { force: true, gap: 4 })))
wrap('hurtPlayer', () => {
  if (!PERS.lowSaid && !P.dead && P.hp < P.max * 0.3) { PERS.lowSaid = true; later(0.5, () => bark(P.hero, 'low', { force: true, gap: 20 })) }
  if (P.hp > P.max * 0.6) PERS.lowSaid = false
})
wrap('kill', (r, e) => {
  if (e?.type && e !== B) bark(`enemy-${e.type}`, 'death', { chance: 0.25 })
})

// ---- bosses
// the entrance exchange lives in intro.js
wrap('openWindow', () => {
  if (!B || B.dead) return
  if (Math.random() < 0.5) bark(P.hero, 'taunt', { gap: 12 })
  else bark(voiceOf(B.handle), 'rest', { gap: 12, chance: 0.6 })
})
wrap('damage', (r, e, dmg) => {
  if (e === B && B && !B.dead && dmg >= 18) bark(voiceOf(B.handle), 'hurt', { gap: 9, chance: 0.5 })
})
wrap('startTitan', () => later(1.4, () => bark('asura', 'enter', { force: true, gap: 2 })))
wrap('sealTaken', () => bark('asura', 'seal', { force: true, gap: 3 }))

// ---- enemies (spawn and wind-up)
wrap('spawnEnemy', (e) => { if (e?.type) later(0.4, () => bark(`enemy-${e.type}`, 'spawn', { chance: 0.3 })) })
wrap('enStart', (r, e) => { if (e?.type && Math.random() < 0.15) bark(`enemy-${e.type}`, 'attack') })

// ---- every frame: idle tease, combo gloat, boss taunts, boss win
function persTick(dt) {
  if (mode !== 'play' || P.dead) { if (mode === 'dead' && B && !PERS.bossWon) { PERS.bossWon = true; bark(voiceOf(B.handle), 'win', { force: true, gap: 1 }) } return }
  PERS.bossWon = false
  // standing still with nothing around: she turns to the player, and the camera comes in
  const calm = !targets().some(e => Math.abs(e.x - P.x) < 900) && !bullets.some(b => b.enemy)
  // a gust: wind streaks across, and she catches her hair and dress (an environment pose)
  const windy = look === 'storm' || stage?.wind
  const bz = P.hero === 'messenger' ? 'm-breeze' : 'o-breeze'
  if (calm && (P.idleT || 0) > (windy ? 1.8 : 2.6) && T > (PERS.gustAt || 0) && !P.tease && A.sheets[P.hero]?.[bz]) {
    PERS.gustAt = T + (windy ? 7 : 16)
    P.tease = { t: 0, sheet: bz, dur: 2.4 }
    gust(P.x, P.y)
    cam.focus = { z: (stage?.zoom?.calm || 1.55) + 0.25, t: 2.2, x: P.x, y: P.y - 110 }
    PERS.teaseAt = Math.max(PERS.teaseAt, T + 5)
  }
  if (calm && (P.idleT || 0) > 4 && T > PERS.teaseAt && !P.tease) {
    PERS.teaseAt = T + 14
    const sh = P.hero === 'messenger' ? 'm-tease' : 'o-tease'
    P.tease = { t: 0, sheet: A.sheets[P.hero]?.[sh] ? sh : null }
    cam.focus = { z: (stage?.zoom?.calm || 1.55) + 0.35, t: 2.4 }
    bark(P.hero, 'tease-idle', { force: true, gap: 10 })
  }
  if (P.tease) { P.tease.t += dt; if (P.tease.t > 2.6 || (!P.tease.keep && (P.idleT || 0) < 0.05) || (P.tease.keep && (P.act || Math.abs(P.vx) > 40))) { P.tease = null; if (cam.focus) cam.focus.t = Math.min(cam.focus.t, 0.2) } }
  // a long string of hits
  if (combo >= PERS.comboMark + 30) { PERS.comboMark = combo - (combo % 30); bark(P.hero, 'tease-combo', { gap: 10 }) }
  if (combo < 5) PERS.comboMark = 0
  // a boss in the middle of a fight says something of its own now and then
  if (B && B.active && !B.dead && !B.chaser && Math.random() < dt / 16) bark(voiceOf(B.handle), 'taunt', { gap: 14 })
}

// wind streaks and loose petals blowing past her
function gust(x, y) {
  const dir = Math.random() < 0.5 ? 1 : -1
  for (let i = 0; i < 26; i++) later(i * 0.04, () => {
    parts.push({ x: x - dir * R(500, 700), y: y - R(10, 280), vx: dir * R(900, 1400), vy: R(-40, 40), life: R(0.6, 1.0), t: 0, size: R(1.2, 2.6), color: '255,245,230', add: true, streak: true })
    if (i % 3 === 0) parts.push({ x: x - dir * R(300, 600), y: y - R(40, 260), vx: dir * R(500, 800), vy: R(-80, 30), life: R(1.2, 1.8), t: 0, size: R(3, 5), color: i % 2 ? '255,200,205' : '255,235,225', add: false })
  })
  if (typeof FXK !== 'undefined') try { FXK.smoke(x, y, 2, { color: 'dust', size: 0.8, spread: 80, vx: dir * 200 }) } catch { }
}

// the tease pose: shown while she teases, if its sheet is painted
{
  const base = window.pickAnim
  window.pickAnim = function () {
    if (P.tease?.sheet && !P.act && P.ground) {
      const s = A.sheets[P.hero][P.tease.sheet], n = s?.n || 6
      return { sheet: P.tease.sheet, frame: frameAt(Math.min(0.999, P.tease.t / (P.tease.dur || 2.2)), holdsOf(P.hero, P.tease.sheet, false)) }
    }
    return base()
  }
}
// and the win pose after a boss falls
wrap('bossDown', () => later(1.0, () => { const sh = P.hero === 'messenger' ? 'm-win' : 'o-win'; if (A.sheets[P.hero]?.[sh]) P.tease = { t: 0, sheet: sh, keep: true } }))

persInit()
