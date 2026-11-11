// loadout.js: Baker (hero id `messenger`) wears what the player equipped in the ARES Player Hub.
//
// The Hub's "Equip and play" opens this game with
//   ?hub=<hub origin>&player=<player id>&loadout=<signed copy>
// At boot the game asks the Hub for the equipped items (GET <hub>/api/loadout?player=<id>, a
// read-only CORS route) and applies them:
//   sword     WEAPON.set(id): the outfit pack, so she holds that blade in every sheet (weapons.js)
//   trail     the colours of her sword trails (trails.js swings), warm palettes only
//   finisher  the colours of her finisher swings (spin, sword wave, charged slash, lightning
//             blade, counter)
// If the Hub can't be reached in 2.5 s it uses the signed copy from the link, then the last
// loadout this browser saw, then the game's defaults. Nothing here can stop the game: every
// step is wrapped, and a bad answer is ignored. `?loadout=0` turns it off.
// Colours: gold, white-hot, amber, rose, crimson. Never blue, purple or green.

const LOADOUT = { on: true, src: 'default', sword: null, trail: 'molten', finisher: 'gold', callsign: null }

;(() => {
  const q = new URLSearchParams(location.search)
  if (q.get('loadout') === '0') { LOADOUT.on = false; return }
  const KEY = 'ares.loadout'
  const store = {
    get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null } },
    set(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { } },
  }
  let warned = 0; const warn = (...a) => { if (!warned++) console.warn('loadout', ...a) }

  // ---------------------------------------------------------------- palettes (r,g,b strings)
  const TRAILS = {
    molten: null,   // the trails.js colours as painted
    amber: { glow: '255,150,40', body0: '190,95,20', body1: '255,200,90', core: '255,250,225' },
    rose: { glow: '255,120,140', body0: '200,50,85', body1: '255,182,192', core: '255,246,246' },
    whitegold: { glow: '255,222,160', body0: '232,172,80', body1: '255,242,206', core: '255,255,255' },
    crimson: { glow: '230,30,45', body0: '110,8,20', body1: '225,55,55', core: '255,212,200' },
  }
  const FINISHERS = {
    gold: null,
    dawn: { glow: '255,190,140', body0: '240,130,90', body1: '255,222,190', core: '255,252,245' },
    bloodmoon: { glow: '220,20,30', body0: '120,0,18', body1: '240,70,60', core: '255,220,205' },
    eclipse: { glow: '255,70,60', body0: '30,4,8', body1: '170,10,25', core: '255,255,255' },
  }
  const FINISH_MOVES = new Set(['spin', 'wave', 'charge', 'thunder', 'counter', 'rend'])
  const clean = (v, list, d) => (typeof v === 'string' && v in list ? v : d)

  // ---------------------------------------------------------------- where the loadout comes from
  function fromToken(tok) {
    try {
      const body = String(tok || '').split('.')[0]
      if (!body) return null
      const j = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
      return { sword: j.s, trail: j.t, finisher: j.f, callsign: j.c, player: j.p }
    } catch { return null }
  }
  async function fromHub(hub, player) {
    if (!hub || !player || !/^https?:\/\//.test(hub)) return null
    const ctl = typeof AbortController === 'function' ? new AbortController() : null
    const t = setTimeout(() => ctl?.abort(), 2500)
    try {
      const r = await fetch(hub.replace(/\/+$/, '') + '/api/loadout?player=' + encodeURIComponent(player), { signal: ctl?.signal, cache: 'no-store' })
      if (!r.ok) return null
      return (await r.json())?.loadout || null
    } catch { return null } finally { clearTimeout(t) }
  }
  async function resolve() {
    const saved = store.get()
    const hub = q.get('hub') || saved?.hub, player = q.get('player') || saved?.player
    let got = await fromHub(hub, player), src = 'hub'
    if (!got) { got = fromToken(q.get('loadout')); src = 'link' }
    if (!got && saved?.loadout) { got = saved.loadout; src = 'saved' }
    if (!got) return null
    const out = {
      sword: typeof WEAPON !== 'undefined' && WEAPON.list?.[got.sword] ? got.sword : null,
      trail: clean(got.trail, TRAILS, 'molten'),
      finisher: clean(got.finisher, FINISHERS, 'gold'),
      callsign: typeof got.callsign === 'string' ? got.callsign.slice(0, 24) : null,
    }
    if (hub && player) store.set({ hub, player, loadout: { ...out } })
    return { ...out, src }
  }

  // ---------------------------------------------------------------- recolouring the trails
  // trails.js keeps its styles private; each swing carries its style object (`s.st`), so a
  // swing is recoloured the moment it is made, before it is drawn.
  const tinted = new Map()
  function tint(st, pal) {
    if (!pal || !st) return st
    let m = tinted.get(pal); if (!m) tinted.set(pal, m = new Map())
    let t = m.get(st)
    if (!t) { t = { ...st, ...pal }; if (st.under) t.under = pal.body0; m.set(st, t) }
    return t
  }
  function recolour() {
    if (typeof TRAIL === 'undefined' || !TRAIL.swings) return
    const trailPal = TRAILS[LOADOUT.trail], finPal = FINISHERS[LOADOUT.finisher]
    if (!trailPal && !finPal) return
    for (const s of TRAIL.swings) {
      if (s._loadout) continue
      s._loadout = 1
      const pal = FINISH_MOVES.has(s.name) ? (finPal || trailPal) : trailPal
      if (pal) s.st = tint(s.st, pal)
    }
  }
  function hook() {
    const baseArc = window.slashArc
    if (typeof baseArc === 'function') window.slashArc = function (...a) { const r = baseArc.apply(this, a); try { recolour() } catch (e) { warn(e) } return r }
    const baseCounter = window.counterHit
    if (typeof baseCounter === 'function') window.counterHit = function (...a) { const r = baseCounter.apply(this, a); try { recolour() } catch (e) { warn(e) } return r }
    const baseUpdate = window.updatePlayer
    if (typeof baseUpdate === 'function') window.updatePlayer = function (...a) { const r = baseUpdate.apply(this, a); try { recolour() } catch (e) { warn(e) } return r }
  }

  // ---------------------------------------------------------------- applying it at boot
  async function apply(l) {
    Object.assign(LOADOUT, l)
    if (l.sword && typeof WEAPON !== 'undefined' && WEAPON.id !== l.sword) {
      // wait for the core's sheets, the way weapons.js brings in a remembered sword
      for (let i = 0; i < 300; i++) {
        if (typeof mode !== 'undefined' && mode !== 'loading' && A?.sheets?.messenger?.['m-idle']) break
        await new Promise(r => setTimeout(r, 100))
      }
      try { await WEAPON.set(l.sword) } catch (e) { warn('sword', e) }
    }
  }
  const pending = resolve().then(l => (l ? apply(l) : null)).catch(e => warn(e))
  LOADOUT.ready = () => pending
  try { hook() } catch (e) { warn(e) }
})()
