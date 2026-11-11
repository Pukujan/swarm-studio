// ARES sfx.js: real sound effects. Owner: sfx. Loaded right after game.js.
// Sample files are short mono mp3s in ../assets/sfx/ (credits in assets/sfx/CREDITS.md).
// After the first key or click (unlockAudio makes AC) they are decoded into AudioBuffers.
//
//   SFXR.play(name, {vol, rate, pan, x, jitter, delay}) -> 'ok' | 'skip' | 'missing'
//   SFXR.loop(name, {vol, fade}) -> {stop(fade)}            (held beams, the eclipse drone)
//
// Every SFX.* entry of game.js is reassigned here, so all existing calls get real sounds. Each
// call is routed by what is happening (who swings, which spell or boss pattern is live, the
// Thousand Flash phase) to a named sound; if its file is missing the old synth plays instead.
// New sounds for the named moves come from wrapping globals at window load (outermost), and
// from a small watcher run at the top of each game frame (jump, cards, eclipse, held beams).
// Voices stay on top: SFX run through one master gain under them, ducked ~30 % while a voice
// plays. Each sound has a voice cap and a cooldown; PERF.low halves the caps. All sounds share a
// global cap too (MAXV live voices). The big moments (ult risers, sub-bass hits, tails, the
// Stopped Hour) go on a `top` bus; every other sound is on the `bed` bus, which SFXR.duck()
// pulls down for a moment under a big hit. (ARES has no music track; if one is added, route it
// into the bed so it ducks too.)
// URL: ?sfx=0 mutes, ?sfxvol=0.5 sets the level (kept in localStorage), ?sfxlog logs every
// sound played into window.SFXLOG (and starts audio without a key, for the test harness).
'use strict'

const SFXR = (() => {
  const Q = location.search
  const LOG = /[?&]sfxlog\b/.test(Q)
  let level = 0.8
  try { const v = parseFloat(localStorage.getItem('ares-sfx-vol')); if (v >= 0 && v <= 1) level = v } catch { }
  { const m = Q.match(/[?&]sfxvol=([0-9.]+)/); if (m) { level = clamp(+m[1], 0, 1); try { localStorage.setItem('ares-sfx-vol', String(level)) } catch { } } }
  if (/[?&]sfx=0\b/.test(Q)) level = 0

  // name: [variants, vol, cap, cooldown s, pitch jitter]
  const BANK = {
    b_swing: [4, 0.8, 3, 0.03, 0.04], b_heavy: [2, 0.9, 2, 0.05, 0.04], b_zip: [2, 0.8, 2, 0.05, 0.03],
    hit_flesh: [3, 0.7, 4, 0.03, 0.08], hit_metal: [3, 0.6, 3, 0.03, 0.06], clank: [3, 0.5, 3, 0.04, 0.08],
    u_dash: [3, 0.75, 3, 0.02, 0.03], u_finale: [1, 1, 1, 0.5, 0], u_rumble: [1, 1, 1, 1, 0], u_bell: [1, 0.8, 1, 1, 0], u_drone: [1, 0.55, 1, 0, 0],
    dodge: [2, 0.55, 2, 0.05, 0.06], counter: [1, 0.85, 1, 0.1, 0.03], jump: [1, 0.4, 1, 0.08, 0.08], land: [1, 0.45, 1, 0.1, 0.08],
    hurt: [1, 0.8, 2, 0.1, 0.06], reflect: [1, 0.5, 3, 0.04, 0.08], cancel: [1, 0.35, 2, 0.05, 0.1],
    o_chant: [1, 0.6, 1, 0.2, 0.02], o_chant_big: [1, 0.7, 1, 0.3, 0], o_cast: [2, 0.6, 2, 0.1, 0.03], o_shot: [3, 0.35, 4, 0.035, 0.08],
    o_choir: [1, 0.7, 1, 0.4, 0.02], o_ray_loop: [1, 0.55, 2, 0, 0], thunder: [3, 0.75, 3, 0.06, 0.06], crackle: [2, 0.5, 4, 0.04, 0.1],
    o_gale: [1, 0.8, 1, 0.3, 0.03], o_whistle: [1, 0.6, 2, 0.2, 0.02], o_crash: [1, 0.95, 2, 0.15, 0.03], o_crescent: [1, 0.75, 2, 0.1, 0.04],
    o_blade: [3, 0.5, 4, 0.04, 0.08], o_spear: [1, 0.8, 2, 0.1, 0.04], o_hit: [1, 0.45, 4, 0.03, 0.1],
    poof: [2, 0.6, 3, 0.05, 0.08], gun: [3, 0.4, 4, 0.04, 0.08], laser: [2, 0.5, 2, 0.1, 0.05], slam: [2, 0.8, 2, 0.08, 0.05],
    bash: [1, 0.7, 2, 0.1, 0.05], swipe: [1, 0.5, 3, 0.05, 0.08], leap: [1, 0.45, 2, 0.1, 0.08],
    fire_roar: [1, 0.8, 2, 0.2, 0.05], beam_charge: [1, 0.65, 1, 0.3, 0.02], beam_loop: [1, 0.5, 1, 0, 0], arc: [3, 0.45, 4, 0.04, 0.08],
    nova: [1, 0.95, 2, 0.2, 0.03], growl: [2, 0.85, 1, 0.5, 0.04], tick: [2, 0.5, 2, 0.03, 0.02], freeze: [1, 0.8, 1, 0.5, 0], resume: [1, 0.8, 1, 0.3, 0],
    boss_hit: [3, 0.75, 2, 0.05, 0.05], boss_tell: [1, 0.55, 1, 0.35, 0.03], boom: [2, 0.75, 3, 0.06, 0.06],
    card_deal: [3, 0.5, 3, 0.04, 0.05], card_flip: [1, 0.5, 3, 0.04, 0.06], card_hover: [1, 0.4, 1, 0.04, 0.05], card_pick: [1, 0.7, 1, 0.1, 0],
    potion: [1, 0.7, 2, 0.1, 0.03], gold: [2, 0.6, 3, 0.05, 0.06], ult_sting: [1, 1, 1, 0.5, 0],
    skywave: [1, 1, 1, 0.6, 0.02], quake_hit: [1, 1, 1, 1, 0], quake_rumble: [1, 0.95, 1, 1, 0], quake_wave: [1, 0.6, 7, 0.15, 0.06], debris: [3, 0.55, 6, 0.08, 0.1],
    // the big moments: wind-up risers, the sub-bass layer of a heavy hit, a rolling tail
    rise_long: [1, 0.8, 1, 0.5, 0], rise_short: [1, 0.7, 1, 0.25, 0.03], ult_sub: [2, 1, 2, 0.15, 0.03], ult_tail: [2, 0.65, 2, 0.4, 0.05],
    // lightning: a sharp crack and a rolling thunder tail, four and three takes, pitch varied
    bolt: [4, 0.75, 3, 0.05, 0.07], roll: [3, 0.55, 2, 0.25, 0.08],
    // Teknium's Stopped Hour: the clock winds up, time stops, deep tocks, a reverse swell, the snap back
    tf_wind: [1, 0.75, 1, 0.5, 0], tf_stop: [1, 1, 1, 0.5, 0], tf_tock: [2, 0.65, 3, 0.3, 0.02], tf_swell: [1, 0.9, 1, 0.5, 0], tf_snap: [1, 0.9, 1, 0.3, 0],
  }
  // on the top bus (never ducked): the ult and time-stop layers themselves
  const TOP = new Set(['rise_long', 'rise_short', 'ult_sub', 'ult_tail', 'ult_sting', 'u_finale', 'u_rumble', 'quake_hit', 'quake_rumble', 'skywave', 'tf_wind', 'tf_stop', 'tf_tock', 'tf_swell', 'tf_snap'])
  const MAXV = 28   // live voices in all (PERF.low: 16); past it only top-bus sounds still start
  const ALIAS = { quake_wave: 'skywave' }   // same file, its own cap (the quake stacks several)
  const file = (name, i) => `../assets/sfx/${ALIAS[name] || name}${BANK[name][0] > 1 ? '_' + (i + 1) : ''}.mp3`

  const buf = {}, missing = new Set(), live = {}, lastAt = {}, lastVar = {}
  let master = null, bed = null, topBus = null, loading = false
  const ducks = []   // {from, until, depth} in clock ms
  const S = { events: [], skipped: {}, maxLive: {}, errors: [], loaded: 0, t0: performance.timeOrigin, cap: {}, maxVoices: 0, voiceCap: MAXV }
  if (LOG) window.SFXLOG = S
  // the clock is the game loop's frame time (the harness steps it by hand), else performance.now()
  let clk = null
  const now = () => clk ?? performance.now()
  const setClock = t => { clk = t }

  function init() {
    if (master || !AC || loading) return
    loading = true
    master = AC.createGain(); master.gain.value = level; master.connect(AC.destination)
    bed = AC.createGain(); bed.connect(master); topBus = AC.createGain(); topBus.connect(master)
    for (const name of Object.keys(BANK)) {
      buf[name] = []
      for (let i = 0; i < BANK[name][0]; i++) {
        fetch(file(name, i)).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer() })
          .then(ab => new Promise((ok, no) => { const p = AC.decodeAudioData(ab, ok, no); if (p && p.catch) p.catch(no) }))
          .then(b => { buf[name][i] = b; S.loaded++ })
          .catch(err => { missing.add(name + ':' + i); S.errors.push(name + '_' + (i + 1) + ' ' + (err?.message || err)) })
      }
    }
  }

  const capOf = name => { const c = BANK[name][2]; return typeof PERF !== 'undefined' && PERF.low ? Math.max(1, Math.ceil(c / 2)) : c }
  const panOf = x => { if (x == null || typeof cam === 'undefined') return 0; const vw = typeof VW === 'function' ? VW() : W; return clamp(((x - cam.x) / vw - 0.5) * 1.4, -0.8, 0.8) }
  const maxV = () => (typeof PERF !== 'undefined' && PERF.low ? 16 : MAXV)
  const liveAll = t => { let n = 0; for (const k in live) for (const e of live[k]) if (e > t) n++; return n }
  const skip = (name, why) => { const s = S.skipped[name] || (S.skipped[name] = {}); s[why] = (s[why] || 0) + 1; return 'skip' }

  function play(name, o = {}) {
    const def = BANK[name]
    if (!def) return 'missing'
    if (!master) init()
    const list = buf[name] || []
    const ready = list.map((b, i) => (b ? i : -1)).filter(i => i >= 0)
    if (!ready.length) return [...Array(def[0]).keys()].every(i => missing.has(name + ':' + i)) || !master ? 'missing' : skip(name, 'loading')
    const t = now(), delay = o.delay || 0
    if (t + delay * 1000 - (lastAt[name] ?? -1e9) < def[3] * 1000) return skip(name, 'cooldown')
    const lv = (live[name] || []).filter(e => e > t)
    if (lv.length >= capOf(name)) { live[name] = lv; return skip(name, 'cap') }
    const all = liveAll(t)
    if (all >= maxV() && !TOP.has(name)) return skip(name, 'voices')
    let i = ready[(Math.random() * ready.length) | 0]
    if (ready.length > 1 && i === lastVar[name]) i = ready[(ready.indexOf(i) + 1) % ready.length]
    lastVar[name] = i
    const j = o.jitter ?? def[4], rate = (o.rate || 1) * (1 + (Math.random() * 2 - 1) * j)
    const vol = def[1] * (o.vol ?? 1), pan = o.pan ?? panOf(o.x), b = list[i]
    if (level > 0) {
      try {
        const s = AC.createBufferSource(), g = AC.createGain()
        s.buffer = b; s.playbackRate.value = rate; g.gain.value = vol
        let out = s.connect(g)
        if (pan && AC.createStereoPanner) { const p = AC.createStereoPanner(); p.pan.value = pan; out = out.connect(p) }
        out.connect(TOP.has(name) ? topBus : bed)
        s.start(AC.currentTime + delay)
      } catch (err) { S.errors.push(name + ' ' + err.message) }
    }
    const end = t + (delay + b.duration / rate) * 1000
    lv.push(end); live[name] = lv; lastAt[name] = t + delay * 1000
    S.maxLive[name] = Math.max(S.maxLive[name] || 0, lv.filter(e => e > t + delay * 1000).length)
    S.cap[name] = capOf(name)
    S.maxVoices = Math.max(S.maxVoices, all + 1); S.voiceCap = maxV()
    if (LOG) S.events.push({ ms: Math.round(t + delay * 1000), T: +(+T + delay).toFixed(3), name, v: i + 1, vol: +vol.toFixed(2), rate: +rate.toFixed(3), pan: +pan.toFixed(2), dur: +(b.duration / rate).toFixed(3), ...(TOP.has(name) ? { top: 1 } : {}) })
    return 'ok'
  }

  // a held sound; stop(fade) ends it. alive(), if given, is polled each frame and stops it when false.
  const loops = []
  function loop(name, o = {}) {
    if (!master) init()
    const b = (buf[name] || [])[0]
    const h = { name, stopped: false, alive: o.alive, stop(fade = 0.25) {
      if (h.stopped) return; h.stopped = true
      if (LOG) S.events.push({ ms: Math.round(now()), T: +(+T).toFixed(3), name, loop: 'stop' })
      try { const t = AC.currentTime; h.g.gain.cancelScheduledValues(t); h.g.gain.setValueAtTime(h.g.gain.value, t); h.g.gain.linearRampToValueAtTime(0, t + fade); h.s.stop(t + fade + 0.05) } catch { }
    } }
    if (!b) { h.stopped = true; return h }
    const vol = BANK[name][1] * (o.vol ?? 1)
    try {
      h.s = AC.createBufferSource(); h.g = AC.createGain(); h.s.buffer = b; h.s.loop = true; h.s.playbackRate.value = o.rate || 1
      const t = AC.currentTime; h.g.gain.setValueAtTime(0, t); h.g.gain.linearRampToValueAtTime(level > 0 ? vol : 0, t + (o.fade ?? 0.15))
      h.s.connect(h.g).connect(bed || master); h.s.start()
    } catch (err) { S.errors.push(name + ' loop ' + err.message) }
    if (LOG) S.events.push({ ms: Math.round(now()), T: +(+T).toFixed(3), name, loop: 'start', vol: +vol.toFixed(2) })
    loops.push(h)
    return h
  }

  // pull the bed bus down to `depth` from `delay` s for `hold` s (then it eases back): the gap
  // under a big hit. Overlapping ducks take the deepest.
  function duck(depth = 0.4, hold = 0.5, delay = 0) {
    const t = now() + delay * 1000
    ducks.push({ from: t, until: t + hold * 1000, depth })
    if (LOG) S.events.push({ ms: Math.round(t), T: +(+T + delay).toFixed(3), name: 'duck', depth, hold })
  }
  function setVolume(v) { level = clamp(v, 0, 1); try { localStorage.setItem('ares-sfx-vol', String(level)) } catch { } }
  function tick() {
    if (AC && !master) init()
    if (master) {
      const want = level * (typeof voicePlaying === 'function' && voicePlaying() ? 0.7 : 1)
      if (Math.abs(master.gain.value - want) > 0.01) master.gain.setTargetAtTime(want, AC.currentTime, 0.06)
      const t = now(); let d = 1
      for (let i = ducks.length - 1; i >= 0; i--) { const k = ducks[i]; if (t > k.until) ducks.splice(i, 1); else if (t >= k.from) d = Math.min(d, k.depth) }
      if (Math.abs(bed.gain.value - d) > 0.01) bed.gain.setTargetAtTime(d, AC.currentTime, d < bed.gain.value ? 0.012 : 0.18)
    }
    for (let i = loops.length - 1; i >= 0; i--) {
      const h = loops[i]
      if (!h.stopped && h.alive) { let ok = false; try { ok = h.alive() } catch { } if (!ok) h.stop(h.fadeOut ?? 0.3) }
      if (h.stopped) loops.splice(i, 1)
    }
  }
  return { play, loop, duck, tick, setClock, clock: now, setVolume, BANK, get level() { return level }, get ready() { return !!master }, log: S }
})()

// ---------------------------------------------------------------- routing the SFX.* calls
{
  const base = { ...SFX }                      // the old synth: the fallback for a missing file
  const CX = []                                // contexts pushed by the wrappers below
  const top = () => CX[CX.length - 1]
  const hero = () => (typeof P !== 'undefined' && P.hero) || 'messenger'
  const ultOn = () => typeof ULT !== 'undefined' && ULT && ULT.phase !== 'done'
  let SPW = null, BPAT = null, FC = -9
  const armoured = e => !!e && (e.armor || ['shield', 'drone', 'sentry', 'caster'].includes(e.def?.base || e.type))

  // r: null (silent), 'name', ['name', opts] or a list of those. Missing file -> old synth.
  function fire(k, r) {
    if (r === null || r === undefined) return
    const list = typeof r === 'string' || (Array.isArray(r) && typeof r[0] === 'string' && !Array.isArray(r[1]) && typeof r[1] !== 'string') ? [r] : r
    let miss = false
    for (const it of list) {
      const [n, o] = typeof it === 'string' ? [it, {}] : it
      if (SFXR.play(n, o) === 'missing') miss = true
    }
    if (miss && base[k]) try { base[k]() } catch { }
  }
  const at = x => ({ x })
  // lightning: a sharp crack, then a rolling thunder tail a beat later; random take and pitch
  const strike = (o = {}) => {
    const v = o.vol ?? 1, r = (o.rate || 1) * (0.88 + Math.random() * 0.26)
    return [['bolt', { vol: v, rate: r, x: o.x }], ['roll', { vol: 0.85 * v, rate: r * 0.95, delay: 0.1 + Math.random() * 0.2, x: o.x }]]
  }
  // a heavy ult hit: the sub-bass layer, a rolling tail and the bed ducked under it
  function big(o = {}) {
    const d = o.delay || 0, v = o.vol ?? 1
    SFXR.play('ult_sub', { delay: d, vol: v })
    if (o.tail !== false) SFXR.play('ult_tail', { delay: d + 0.06, vol: v * (o.tailVol ?? 1), rate: o.tailRate })
    SFXR.duck(o.depth ?? 0.35, o.hold ?? 0.5, d)
  }
  // Stopped Hour: the world stops (a deep whoosh into a sub drop), slow deep tocks while it is
  // held, and a reverse swell that lands on the release (boss-spells.js HOUR.place = 2.3 s)
  let HOUR_PLACE = 2.3   // the length of the stop; boss-spells.js says the real one
  function hourStop() {
    if (typeof BOSS_SPELLS !== 'undefined' && BOSS_SPELLS.hour) HOUR_PLACE = BOSS_SPELLS.hour.stop
    SFXR.play('tf_stop', { x: B?.x }); SFXR.duck(0.45, HOUR_PLACE - 0.1)
    ;[0.62, 1.2, 1.74].forEach((d, i) => SFXR.play('tf_tock', { delay: d, rate: i % 2 ? 0.92 : 1, vol: 0.8 + 0.1 * i, jitter: 0 }))
    SFXR.play('tf_swell', { delay: HOUR_PLACE - 1.2 })
  }

  // the Baker's sword: combo swings rise in pitch with the step and the combo count
  const STEP = { slash1: [1, 1], slash2: [2, 1.06], air1: [3, 1.1], air2: [4, 1.14], dashslash: [3, 1.08] }
  function swing(k) {
    const n = P.act?.name, rise = 1 + Math.min(0.12, (typeof combo !== 'undefined' ? combo : 0) * 0.008)
    if (k === 'slash' && STEP[n]) return ['b_swing', { rate: STEP[n][1] * rise, x: P.x }]
    if (k === 'heavy') return n === 'thunder' ? [['b_heavy', { rate: 0.9, x: P.x }], ...strike({ vol: 0.6, x: P.x })] : ['b_heavy', { rate: n === 'slam' ? 0.85 : rise, x: P.x }]
    return k === 'slash' ? ['b_swing', { rate: rise, x: P.x }] : undefined
  }

  // Thousand Flash phases (thousand.js keeps ULT.phase)
  function ultMap(k) {
    const ph = ULT.phase
    if (ph === 'pre' && k === 'slash') return [['b_zip', { rate: 0.9 }], ['u_dash', { delay: 0.04 }]]
    if (ph === 'legs' && k === 'slash') return ['u_dash', { rate: 1 + Math.min(0.3, (ULT.leg || 0) * 0.03), x: P.x }]
    // the giant slash: u_finale's own hit lands 0.34 s in, the sub and the duck with it
    if ((ph === 'gather' || ph === 'slash') && k === 'heavy') { big({ delay: 0.32, depth: 0.3, hold: 0.7 }); return 'u_finale' }
    if ((ph === 'gather' || ph === 'slash') && k === 'boom') return null
    if (ph === 'split' && k === 'boom') { SFXR.play('ult_sub', { vol: 0.55, rate: 1.2 }); return ['boom', { rate: 0.8 }] }
    if (ph === 'ecl1' && k === 'glare') return [['boss_tell', { rate: 0.8 }], ['rise_short', { rate: 1.2 }]]
    if (ph === 'ecl2' && k === 'heavy') { big({ depth: 0.25, hold: 1.0, tailRate: 0.8 }); return [['b_heavy', { rate: 0.75 }], 'u_rumble'] }
    if (ph === 'ecl2' && k === 'boom') return null
    return undefined
  }

  // late calls from a spell that is still playing out (storm zaps, star impacts, returns)
  const SPELL_LATE = {
    bolt_rain: { zap: () => strike({ vol: 0.8 }), boom: () => strike({ vol: 0.8 }), heavy: null },
    thunder_spear: { zap: () => strike(), heavy: null },
    chain: { zap: () => [['crackle'], ['bolt', { vol: 0.4, rate: 1.25 }]] },
    storm_field: { zap: () => (Math.random() < 0.35 ? strike({ vol: 0.6 }) : 'crackle') },
    holy_cross: { boom: () => { big({ vol: 0.7, depth: 0.5, hold: 0.35, tailVol: 0.6 }); return [['o_cast', { rate: 0.8 }], ['boom', { vol: 0.6 }]] }, glare: null },
    summon_blades: { shot: 'o_blade', glare: null },
    ice_lance: { slash: 'o_blade' },
    meteor: { boom: ['boom', { vol: 0.45 }] },
    pillar_wall: { boom: [['fire_roar', { vol: 0.7 }], ['boom', { vol: 0.5 }]], glare: null },
    great_crescent: { slash: ['o_crescent', { rate: 0.9, vol: 0.7 }] },
    petal_tornado: { slash: null },
    flame_wave: { boom: 'fire_roar', shot: null },
    wind_blade: { slash: 'o_crescent' },
    gravity_well: { heavy: null },
  }
  const SPELL_WIN = { bolt_rain: 3, thunder_spear: 1.5, chain: 1.5, storm_field: 6, holy_cross: 2, summon_blades: 4, ice_lance: 2, meteor: 2.5, pillar_wall: 5, great_crescent: 3.5, petal_tornado: 3, flame_wave: 3, wind_blade: 2, gravity_well: 3 }

  // boss patterns (boss.js PATTERNS, boss-spells.js): what each generic call means there
  const BOSS = {
    storm: { glare: 'boss_tell', zap: () => strike(), boom: () => strike({ vol: 0.8 }) },
    firewall: { glare: 'boss_tell', boom: 'fire_roar' },
    maelstrom: { glare: 'beam_charge', boom: () => { bossBeam(); return ['boom', { vol: 0.7 }] }, zap: null },
    radiance: { glare: 'beam_charge', boom: () => { bossBeam(); SFXR.play('ult_sub', { vol: 0.5 }); return ['boom', { vol: 0.6 }] }, zap: null },
    arcs: { zap: [['arc'], ['bolt', { vol: 0.3, rate: 1.3 }]], shot: null },
    nova: { glare: ['beam_charge', { rate: 0.8 }], boom: () => { big({ vol: 0.8, depth: 0.45, hold: 0.4, tailVol: 0.7 }); return 'nova' }, heavy: null },
    hound: { glare: 'growl', boom: [['fire_roar'], ['boom', { vol: 0.6 }]], zap: null, heavy: ['fire_roar', { vol: 0.7 }] },
    stopped_hour: { glare: () => { hourStop(); return ['freeze', { vol: 0.5 }] }, zap: [['resume'], ['tf_snap']] },
  }
  const BOSS_CLASSIC = { glare: 'boss_tell', shot: ['gun', { rate: 0.8 }], heavy: 'slam', boom: 'boom', zap: ['laser', { rate: 0.8 }],
    slash: [['swipe', { rate: 0.8 }], ['b_heavy', { rate: 0.7, vol: 0.5 }]], dodge: ['b_zip', { rate: 0.7 }] }
  function bossBeam() {
    const p = BPAT; if (!p) return
    SFXR.loop('beam_loop', { alive: () => BPAT === p && T < p.t0 + p.dur && B && !B.dead })
  }

  // enemies (enemies.js EN_KINDS): what each attack sounds like
  const EN = { fan: { shot: 'gun' }, aimed: { shot: 'gun' }, ring: { shot: ['gun', { rate: 0.85 }] }, spiral: { shot: ['gun', { rate: 1.15, vol: 0.8 }] },
    melee: { slash: 'swipe' }, bash: { heavy: 'bash' }, slam: { heavy: 'leap' }, laser: { zap: 'laser' },
    summon: { glare: ['boss_tell', { vol: 0.35, rate: 1.4 }] }, rush: { heavy: [['swipe', { rate: 0.6 }], 'leap'] } }

  const DEF = {
    slash: () => (hero() === 'messenger' && P.act ? swing('slash') : 'swipe'),
    heavy: () => (hero() === 'messenger' && P.act ? swing('heavy') : 'slam'),
    shot: 'gun', reflect: () => ['reflect', at(P.x)], cancel: 'cancel', boom: 'boom', zap: () => (Math.random() < 0.3 ? [['crackle'], ['bolt', { vol: 0.35, rate: 1.2 }]] : 'crackle'), hurt: () => ['hurt', at(P.x)],
    glare: () => (typeof mode !== 'undefined' && mode === 'boon' ? 'card_pick' : 'boss_tell'), hit: 'hit_flesh', dodge: () => ['dodge', at(P.x)],
  }
  const val = (r, ...a) => (typeof r === 'function' ? r(...a) : r)
  const addX = (r, x) => {   // give a route a pan position if it has none
    if (r == null || x == null) return r
    if (typeof r === 'string') return [r, { x }]
    if (typeof r[0] === 'string' && !Array.isArray(r[1])) return [r[0], { x, ...(r[1] || {}) }]
    return r.map(it => addX(it, x))
  }

  function route(k) {
    const c = top()
    if (c) { c.used = true; if (c.map) { const r = c.map(k); if (r !== undefined) return fire(k, addX(r, c.x)) } }
    if (ultOn() && hero() === 'messenger') { const r = ultMap(k); if (r !== undefined) return fire(k, r) }
    if (SPW && T < SPW.until && k in SPELL_LATE[SPW.kind]) return fire(k, val(SPELL_LATE[SPW.kind][k]))
    if (T - FC < 0.5 && k === 'slash') return fire(k, [['b_heavy', { rate: 1.15, x: P.x }], ['hit_metal', { vol: 0.5, x: P.x }]])
    if (BPAT && T < BPAT.until && B && !B.dead) {
      const m = BOSS[BPAT.name] || BOSS_CLASSIC
      if (k in m) return fire(k, addX(val(m[k]), B.x))
      if (k in BOSS_CLASSIC) return fire(k, addX(val(BOSS_CLASSIC[k]), B.x))
    }
    return fire(k, val(DEF[k]))
  }
  for (const k of Object.keys(base)) SFX[k] = () => route(k)
  // new hooks other files call guarded (`if (SFX.skywave) SFX.skywave()`): no synth fallback
  // Sky Wave (skywave.js) also calls SFX.heavy and SFX.boom on the same frame; those stay
  // underneath as the first crack, this is the wave itself
  SFX.skywave = () => { SFXR.play('skywave', { x: typeof P !== 'undefined' ? P.x : undefined }); big({ vol: 0.75, depth: 0.55, hold: 0.3, tail: false }) }
  // the quake ult: a massive impact, ~3 s of rolling quake, waves erupting across the arena in a
  // cascade (the skywave roar at random pitches, panned left to right) and falling rock
  SFX.quake = () => {
    SFXR.play('quake_hit'); SFXR.play('quake_rumble', { delay: 0.05 }); big({ depth: 0.4, hold: 0.8, tailRate: 0.85, tailVol: 0.8 })
    const n = typeof PERF !== 'undefined' && PERF.low ? 4 : 6
    for (let i = 0; i < n; i++) {
      const d = 0.25 + i * 0.42 + Math.random() * 0.15
      SFXR.play('quake_wave', { delay: d, rate: 0.8 + Math.random() * 0.45, vol: 0.85 - i * 0.07, pan: clamp(-0.7 + 1.4 * i / (n - 1) + (Math.random() - 0.5) * 0.3, -0.8, 0.8), jitter: 0 })
      SFXR.play('debris', { delay: d + 0.2 + Math.random() * 0.2, pan: (Math.random() - 0.5) * 1.2 })
    }
  }

  // run fn with a context; map(k) routes generic calls made inside (undefined = fall through)
  function within(c, fn, self, args) { CX.push(c); try { return fn.apply(self, args) } finally { CX.pop() } }
  const wrap = (obj, key, make) => { if (obj && typeof obj[key] === 'function') { const core = obj[key]; obj[key] = make(core) } }
  const quiet = () => null

  function hooks() {
    // ---- hits and deaths
    wrap(window, 'damage', core => function (e, dmg, o = {}) {
      const map = k => {
        if (k !== 'hit') return undefined
        const x = o.x ?? e?.x
        if (e === B) return [['boss_hit', { x }], hero() === 'messenger' ? ['hit_flesh', { x, vol: 0.5 }] : ['o_hit', { x }]]
        if (hero() === 'runner') return armoured(e) ? [['o_hit', { x }], ['clank', { x, vol: 0.6 }]] : ['o_hit', { x }]
        return armoured(e) ? [['hit_metal', { x }], ['clank', { x, vol: 0.7 }]] : [['hit_flesh', { x }], ['clank', { x, vol: 0.3 }]]
      }
      return within({ map }, core, this, arguments)
    })
    wrap(window, 'kill', core => function (e) { return within({ map: k => (k === 'boom' ? ['poof', { x: e?.x }] : undefined) }, core, this, arguments) })
    // ---- the Baker
    wrap(window, 'slamImpact', core => function () { return within({ map: k => (k === 'boom' ? [['slam', { x: P.x }], ['boom', { vol: 0.6, x: P.x }]] : undefined) }, core, this, arguments) })
    // Hundred Petal Dance: a riser over the hops into the finale (the hit itself is in the watcher)
    wrap(window, 'startOmni', core => function () {
      const r = core.apply(this, arguments)
      if (r && P.omni) { const d = 0.12 + P.omni.hops.length * 0.085 + 0.22; SFXR.play('rise_long', { rate: clamp(1.14 / d, 0.8, 2) }); OMNI = P.omni }
      return r
    })
    // the storm sky's random lightning: far off, so a quiet crack and a long roll
    wrap(window, 'drawLookSky', core => function () {
      return within({ map: k => (k === 'zap' ? [['bolt', { vol: 0.3, rate: 0.75 }], ['roll', { vol: 0.5, delay: 0.35 + Math.random() * 0.5, rate: 0.8 }]] : undefined) }, core, this, arguments)
    })
    wrap(window, 'counterHit', core => function () { SFXR.play('counter', { x: P.x }); return core.apply(this, arguments) })
    wrap(window, 'perfectDodge', core => function () { return within({ map: k => (k === 'dodge' ? [['dodge', { x: P.x }], ['reflect', { vol: 0.4, rate: 1.3 }]] : undefined) }, core, this, arguments) })
    wrap(window, 'flashCut', core => function () {
      const r = within({ map: k => (k === 'dodge' ? [['b_zip', { x: P.x }]] : undefined) }, core, this, arguments)
      if (r) FC = T
      return r
    })
    wrap(window, 'land', core => function () { if (!P.wasGround && P.vy > 500 && !(P.act && P.act.m.slam)) SFXR.play('land', { x: P.x, vol: Math.min(1, P.vy / 1200) }); return core.apply(this, arguments) })
    // ---- both: the ult cut-in
    if (typeof FXK !== 'undefined') wrap(FXK, 'ultPanel', core => function () { SFXR.play('ult_sting'); return core.apply(this, arguments) })
    wrap(window, 'ultimate', core => function () {
      const r = core.apply(this, arguments)
      if (hero() === 'runner') {
        // the feather storm: a riser into a heavy hit at 0.9 s, then shock-feather cracks across the sky
        SFXR.play('o_choir'); SFXR.play('rise_long', { rate: 1.25 }); big({ delay: 0.9, depth: 0.4, hold: 0.6 })
        for (let i = 0; i < 5; i++) SFXR.play('o_blade', { delay: 0.2 + i * 0.32, x: P.x + (i - 2) * 200 })
        for (let i = 0; i < 4; i++) SFXR.play('bolt', { delay: 1.0 + i * 0.3 + Math.random() * 0.06, vol: 0.45, rate: 0.9 + Math.random() * 0.35, pan: (Math.random() - 0.5) * 1.2 })
        SFXR.play('roll', { delay: 1.35, vol: 0.6, rate: 0.9 })
      }
      return r
    })
    // ---- the Oracle
    wrap(window, 'fireFeather', core => function () { return within({ map: k => (k === 'shot' ? ['o_shot', { x: P.x }] : undefined) }, core, this, arguments) })
    wrap(window, 'startChant', core => function () {
      const r = core.apply(this, arguments)
      if (r && P.chant) SFXR.play(P.chant.tier >= 3 ? 'o_chant_big' : 'o_chant', { x: P.x })
      return r
    })
    wrap(window, 'castSpell', core => function (name) {
      if (name === 'feather') { SFXR.play('o_blade', { x: P.x }); SFXR.play('o_shot', { x: P.x, delay: 0.03 }) }
      return within({ map: quiet }, core, this, arguments)
    })
    wrap(window, 'beam', core => function () {
      const st = core.apply(this, arguments)
      SFXR.play('o_cast', { x: P.x })
      if (st) SFXR.loop('o_ray_loop', { alive: () => fx.includes(st) && st.stopAt == null })
      return st
    })
    wrap(window, 'pillar', core => function (x) { return within({ map: k => (k === 'zap' ? [['crackle', { x }], ['o_cast', { x, rate: 1.2, vol: 0.5 }]] : undefined) }, core, this, arguments) })
    wrap(window, 'comet', core => function (x) {
      const o = core.apply(this, arguments)
      SFXR.play('o_whistle', { x, rate: 2.6, vol: 0.4 })
      if (o && typeof o.update === 'function') { const u = o.update; o.update = function () { return within({ map: k => (k === 'boom' ? ['o_crash', { x, vol: 0.65, rate: 1.1 }] : undefined) }, u, this, arguments) } }
      return o
    })
    if (typeof SPELLS !== 'undefined') for (const kind of Object.keys(SPELLS)) wrap(SPELLS, kind, core => function (spell, o = {}) {
      const x = o.x ?? P.x
      const cast = {
        bolt_rain: [['o_cast'], ['bolt', { vol: 0.9, delay: 0.1 }], ['roll', { vol: 0.7, delay: 0.25 }]],
        thunder_spear: [['o_spear'], ['bolt', { delay: 0.1 }], ['roll', { vol: 0.6, delay: 0.3 }]],
        chain: [['o_cast', { vol: 0.6 }], ['crackle']],
        storm_field: [['o_cast'], ['bolt'], ['roll', { delay: 0.2 }]],
        holy_cross: [['o_choir', { vol: 0.7 }], ['o_cast']],
        summon_blades: [['o_cast', { vol: 0.6 }], ['o_blade'], ['o_blade', { delay: 0.08 }], ['o_blade', { delay: 0.16 }]],
        ice_lance: [['o_blade'], ['o_spear', { vol: 0.7 }]],
        meteor: [['o_cast', { vol: 0.5 }]],
        pillar_wall: [['o_choir'], ['rise_short', { rate: 0.8 }], ['fire_roar', { vol: 0.5, delay: 0.3 }]],
        sun_beam: [['o_choir', { vol: 0.8 }], ['rise_short'], ['ult_sub', { vol: 0.5, delay: 0.4 }]],
        great_crescent: [['o_crescent']],
        petal_tornado: [['o_gale']],
        flame_wave: [['fire_roar']],
        wind_blade: [['o_crescent']],
        gravity_well: [['boss_tell']],
      }[kind] || [['o_cast']]
      for (const [n, op] of cast) SFXR.play(n, { x, ...(op || {}) })
      const f0 = fx.length
      const r = within({ map: quiet }, core, this, arguments)
      if (SPELL_LATE[kind]) SPW = { kind, until: T + (SPELL_WIN[kind] || 2) }
      // Setting Star: the great star falls from 0.35 s to 1.3 s of game time (slowed while it falls)
      // Judgment Thunder: the verdict, one triple-thick bolt at 1.75 s, hits like an ult
      if (kind === 'bolt_rain' && typeof later === 'function') later(1.75, () => { SFXR.play('bolt', { rate: 0.8, x }); big({ vol: 0.8, depth: 0.45, hold: 0.4 }) })
      if (kind === 'meteor' && typeof later === 'function') { later(0.3, () => SFXR.play('o_whistle', { rate: 0.9, x })); later(1.28, () => { SFXR.play('o_crash', { x }); big({ vol: 0.85, depth: 0.4, hold: 0.5 }) }) }
      if (kind === 'sun_beam') { const st = fx.slice(f0).find(f => typeof f.stop === 'function' && 'stopAt' in f); if (st) SFXR.loop('o_ray_loop', { alive: () => fx.includes(st) && st.stopAt == null }) }
      return r
    })
    // ---- enemies
    if (typeof EN_KINDS !== 'undefined') for (const [kind, K] of Object.entries(EN_KINDS)) for (const m of ['start', 'tick'])
      wrap(K, m, core => function (e) { return within({ map: k => (EN[kind] && k in EN[kind] ? EN[kind][k] : undefined), x: e?.x }, core, this, arguments) })
    wrap(window, 'enLandSlam', core => function (e) {
      const c = { map: k => (k === 'boom' || k === 'heavy' ? 'slam' : undefined), x: e?.x }
      const r = within(c, core, this, arguments)
      if (!c.used) SFXR.play('slam', { x: e?.x })
      return r
    })
    // ---- boss patterns: remember which one is live so later calls know what they are
    if (typeof PATTERNS !== 'undefined') for (const name of Object.keys(PATTERNS)) wrap(PATTERNS, name, core => function () {
      const p = { name, t0: T, dur: 3, until: T + 4.5 }
      BPAT = p
      const m = BOSS[name] || BOSS_CLASSIC
      const r = within({ map: k => (k in m ? val(m[k]) : k in BOSS_CLASSIC ? val(BOSS_CLASSIC[k]) : undefined), x: typeof B !== 'undefined' && B ? B.x : undefined }, core, this, arguments)
      if (typeof r === 'number' && isFinite(r)) { p.dur = r; p.until = T + r + 1.5 }
      if (name === 'hound') SFXR.play('fire_roar', { delay: 0.8, vol: 0.6, x: B?.x })
      return r
    })
    // ---- the synth beeps that are not SFX: Stopped Hour's clock, drop pickups
    wrap(window, 'tone', core => function (type, f0, f1, dur, vol) {
      let r = null
      if (type === 'square' && dur === 0.04 && Math.abs(f1 - f0 * 0.7) < 1e-6) {
        // the clock's wind-up starts near 1500 Hz and climbs (the placing ticks come while the world is stopped)
        if (f0 >= 1500 && f0 < 1700 && !(typeof stopT !== 'undefined' && stopT > 0) && BPAT && BPAT.name === 'stopped_hour') SFXR.play('tf_wind', { x: B?.x })
        r = SFXR.play('tick', { rate: clamp(f0 / 1500, 0.4, 2.2), jitter: 0 })
      }
      else if (type === 'sine' && dur === 0.14 && f0 === 660 && f1 === 990) r = SFXR.play('potion', { x: P.x })
      else if (type === 'sine' && dur === 0.14 && f0 === 990 && f1 === 1480) r = SFXR.play('gold', { x: P.x })
      if (r === null || r === 'missing') return core.apply(this, arguments)
    })
    // ---- with ?sfxlog, voices go in the log too (so a test can mix them under the sfx)
    if (/[?&]sfxlog\b/.test(location.search)) wrap(window, 'playVoice', core => function (src) { SFXR.log.events.push({ ms: Math.round(SFXR.clock()), T: +(+T).toFixed(3), name: 'voice', src: String(src) }); return core.apply(this, arguments) })
    // ---- boons: the one picked
    wrap(window, 'takeBoon', core => function () { SFXR.play('card_pick'); return core.apply(this, arguments) })
  }

  // ---- the watcher: jumps, cards, the eclipse, held beams, ducking
  let pm = null, pPick = null, pPicked = 0, pJump = null, pEcl = null, drone = null, pUltPh = null, pQK = null, pAct = null, OMNI = null
  function watch(ts) {
    try {
      if (typeof ts === 'number') SFXR.setClock(ts)
      SFXR.tick()
      if (typeof P !== 'undefined' && P.hero) {
        if (P.jumpAnim !== pJump && (P.jumpAnim === 'jump' || P.jumpAnim === 'djump')) SFXR.play('jump', { x: P.x, rate: P.jumpAnim === 'djump' ? 1.2 : 1 })
        pJump = P.jumpAnim
      }
      if (typeof mode !== 'undefined') {
        const run = typeof RUN !== 'undefined' ? RUN : null
        if (mode === 'boon' && pm !== 'boon' && run?.offer) {
          const pull = run.kind === 'pull'
          run.offer.forEach((id, i) => {
            SFXR.play('card_deal', { delay: pull ? i * 0.12 : i * 0.13, pan: (i - (run.offer.length - 1) / 2) * 0.4 })
            if (pull) SFXR.play('card_flip', { delay: 0.35 + i * 0.3 + 0.16, pan: (i - (run.offer.length - 1) / 2) * 0.4 })
          })
          pPick = run.pick; pPicked = run.picked?.length || 0
        } else if (mode === 'boon' && run) {
          if (run.pick !== pPick && run.offerT > 0.3) SFXR.play('card_hover', { pan: ((run.pick || 0) - 1) * 0.4 })
          if ((run.picked?.length || 0) > pPicked) SFXR.play('card_pick')
          pPick = run.pick; pPicked = run.picked?.length || 0
        }
        pm = mode
      }
      // the Crimson Eclipse: a bell as the moon rises, a low drone that fades with the red arena
      const E = typeof ECL !== 'undefined' ? ECL : null
      if (E && E !== pEcl) {
        SFXR.play('u_bell')
        if (drone) drone.stop(0.5)
        const e0 = E
        drone = SFXR.loop('u_drone', { fade: 1.2, alive: () => typeof ECL !== 'undefined' && ECL === e0 && ECL.t < ECL.dur - 1.2 })
        drone.fadeOut = 1.4
      }
      pEcl = E
      // ult wind-ups and finales the effect files don't call out
      const uph = typeof ULT !== 'undefined' && ULT ? ULT.phase : null
      if (uph === 'gather' && pUltPh !== 'gather') SFXR.play('rise_short', { rate: 0.7 })   // 0.6 s gather into the giant slash
      pUltPh = uph
      const Q = typeof QK !== 'undefined' ? QK : null
      if (Q && Q !== pQK && Q.phase === 'leap' && typeof P !== 'undefined') SFXR.play('rise_long', { rate: clamp(1.14 / (Math.max(0, -P.vy) / 3000 + 0.12), 0.7, 2) })   // up to the apex, then the plunge
      pQK = Q
      if (typeof P !== 'undefined') {
        const a = P.act
        if (a && a !== pAct && a.name === 'skywave' && P.hero === 'messenger') SFXR.play('rise_short', { rate: 1.1, x: P.x })
        pAct = a
        if (OMNI && P.omni !== OMNI) { OMNI = null; big({ delay: 0.22, depth: 0.35, hold: 0.5 }) }   // every cut opens at once 0.22 s after she is home
      }
      if (SPW && T > SPW.until) SPW = null
    } catch (err) { if (SFXR.log.errors.length < 50) SFXR.log.errors.push('watch ' + err.message) }
  }

  addEventListener('load', () => {
    try { hooks() } catch (err) { console.warn('sfx hooks', err); SFXR.log.errors.push('hooks ' + err.message) }
    if (/[?&]sfxlog\b/.test(location.search) && typeof unlockAudio === 'function') { unlockAudio(); try { AC && AC.resume && AC.resume() } catch { } }
    // ride the game's own frame (it re-requests `frame` by name each time), no second rAF loop
    wrap(window, 'frame', core => function (ts) { watch(ts); return core.apply(this, arguments) })
  })
}
