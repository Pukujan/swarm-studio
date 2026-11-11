// Baker's (hero id `messenger`) sword choice, layered on the core like moves.js.
//
//   winged      the winged greatsword (outfit `default`); her ultimate is Thousand Flash
//   coresunder  地核断 Coresunder, a crimson stone-steel earth-cleaver with a molten-gold core
//               (outfit `coresunder`); her ultimate becomes the quake (quake.js)
//
// Picked on the heroine select: with Baker selected, up or down switches the sword; the name and
// its painted icon sit under her name. It is remembered per browser, and `?sword=coresunder`
// forces it. Choosing a sword swaps every one of her sheets for that outfit's folder
// (assets/skins/messenger/<outfit>/), so she holds it in every animation. The outfit's sheets
// load the first time it is picked; each one is measured from its pixels and cut down and
// rescaled to match the default sheet, so she stands the same height and her feet stay put.
// A sheet the outfit lacks keeps the closest one it has (never the other sword).

const WEAPON = {
  id: 'winged',
  list: { winged: { outfit: 'default', en: 'Winged Greatsword' }, coresunder: { outfit: 'coresunder', en: 'Coresunder' } },
  ready: {},       // outfit -> true once its sheets are in
  alt: {},         // outfit -> {sheet: {img, n, x, y, h}}
  def: null,       // the default sheets, kept to swap back
}

{
  const FALLBACK = { 'm-idle.12f': 'm-idle', idle: 'm-idle', 'm-breeze': 'm-idle', 'm-tease': 'm-idle', 'm-loading': 'm-idle', shoot: 'm-idle', sprint: 'run', roll: 'jump', djump: 'jump', 'm-air2': 'air1', 'm-win': 'm-idle' }
  const store = { get() { try { return localStorage.getItem('ares.sword') } catch { return null } }, set(v) { try { localStorage.setItem('ares.sword', v) } catch { } } }
  const q = (location.search.match(/[?&]sword=(\w+)/) || [])[1]
  WEAPON.id = WEAPON.list[q] ? q : WEAPON.list[store.get()] ? store.get() : 'winged'

  // feet anchor from the pixels (stage.js anchorOf when it is there)
  function measure(img) {
    if (typeof anchorOf === 'function') return anchorOf(img)
    const slot = img.height; return { n: Math.max(1, Math.round(img.width / slot)), x: slot / 2, y: slot * 0.9, h: slot * 0.6 }
  }
  async function loadOutfit(outfit) {
    if (WEAPON.ready[outfit] || outfit === 'default') return true
    const S = A.sheets.messenger, names = Object.keys(S)
    const got = {}
    await Promise.all(names.map(nm => loadImg(`../assets/skins/messenger/${outfit}/${nm}.webp`).then(img => { got[nm] = img }).catch(() => { })))
    if (!got['m-idle'] && !got.idle) { console.warn('weapons: outfit', outfit, 'has no idle sheet'); return false }
    const def = WEAPON.def || S
    // one height factor for the whole outfit, from the idle: she stands as tall as by default
    const idleName = got['m-idle'] ? 'm-idle' : 'idle', ia = measure(got[idleName])
    const dIdle = def[idleName] || def['m-idle']
    const kIdle = dIdle.img.height / got[idleName].height
    const g = clamp(dIdle.h / (ia.h * kIdle), 0.6, 1.4)
    const out = {}
    for (const nm of names) {
      let src = nm
      while (!got[src] && FALLBACK[src]) src = FALLBACK[src]
      if (!got[src]) src = idleName
      const d = def[nm] || dIdle, img = got[src], a = measure(img)
      const cell = d.img.height
      // feet where the default sheet has them, so every pose lines up with the old timing
      const ax = d.x, ay = d.y
      const k = cell / img.height, s = k * g
      const c = document.createElement('canvas'); c.width = cell * a.n; c.height = cell
      const x2 = c.getContext('2d'); x2.imageSmoothingQuality = 'high'
      for (let f = 0; f < a.n; f++) x2.drawImage(img, f * img.height, 0, img.height, img.height, f * cell + ax - a.x * s, ay - a.y * s, img.height * s, img.height * s)
      out[nm] = { img: c, n: a.n, x: ax, y: ay, h: a.h * s }
    }
    WEAPON.alt[outfit] = out; WEAPON.ready[outfit] = true
    return true
  }
  function apply() {
    const S = A.sheets.messenger
    if (!WEAPON.def) WEAPON.def = { ...S }
    const o = WEAPON.list[WEAPON.id].outfit, alt = o !== 'default' && WEAPON.ready[o] ? WEAPON.alt[o] : null
    for (const nm of Object.keys(WEAPON.def)) S[nm] = alt?.[nm] || WEAPON.def[nm]
    if (typeof GHOST_CACHE !== 'undefined') GHOST_CACHE.clear()   // moves.js afterimages
  }
  WEAPON.set = async function (id) {
    if (!WEAPON.list[id]) return false
    WEAPON.id = id; store.set(id)
    const ok = await loadOutfit(WEAPON.list[id].outfit)
    if (WEAPON.id === id) apply()
    return ok
  }
  WEAPON.is = id => WEAPON.id === id && (WEAPON.list[id].outfit === 'default' || WEAPON.ready[WEAPON.list[id].outfit])
  WEAPON.loaded = () => loadOutfit(WEAPON.list[WEAPON.id].outfit)

  // after the core has its sheets, bring in the remembered sword
  const baseBoot = window.ARES_BOOT
  if (typeof baseBoot === 'function') window.ARES_BOOT = function (...a) {
    const r = baseBoot.apply(this, a)
    const wait = () => { if (typeof mode !== 'undefined' && mode !== 'loading' && A.sheets.messenger['m-idle']) { if (WEAPON.id !== 'winged') WEAPON.set(WEAPON.id) } else setTimeout(wait, 100) }
    setTimeout(wait, 100)
    return r
  }

  // the heroine select: the sword's name and icon under Baker's name; up/down switches it
  const baseTitle = window.drawTitle
  window.drawTitle = function (dt) {
    if (typeof sel !== 'undefined' && HEROES[sel] === 'messenger' && (tap('arrowup', 'w') || tap('arrowdown', 's'))) WEAPON.set(WEAPON.id === 'winged' ? 'coresunder' : 'winged')
    baseTitle(dt)
    const on = HEROES[sel] === 'messenger', x = W / 2 - 250, y = 667
    ctx.save()
    ctx.globalAlpha = on ? 1 : 0.4
    const im = typeof iconArt === 'function' ? iconArt('weapon.' + WEAPON.id) : null
    ctx.font = '600 14px Cinzel, serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#e8b860'
    const label = WEAPON.list[WEAPON.id].en, tw = ctx.measureText(label).width
    if (im) { ctx.shadowColor = 'rgba(30,4,6,0.6)'; ctx.shadowBlur = 6; ctx.drawImage(im, x - tw / 2 - 32, y - 19, 26, 26); ctx.shadowBlur = 0 }
    ctx.fillText(label, x, y)
    if (on) { ctx.fillStyle = 'rgba(255,241,220,0.55)'; ctx.fillText('▴', x + tw / 2 + 16, y - 6); ctx.fillText('▾', x + tw / 2 + 16, y + 6) }
    ctx.restore()
  }
}
