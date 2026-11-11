// pose-fit.js: makes the heroine's standing poses meet the idle without a jump. Loaded after look.js,
// so its canvas transform covers the outline, rim and status layers drawn around the sprite.
//  - idle breaks (tease, breeze, win) are painted bigger than the idle (h 466-475 vs 427-450): they
//    are drawn at the idle's height, scaled about her feet
//  - going into or out of a break, the old pose fades out over the new one for a moment, and the idle
//    picks up again on the frame nearest the break's last pose (measured from the default sheets)
//  - the crouch (jump sheet frames 0-1 on the ground) has its feet a little above the sheet's anchor:
//    it is moved down so they sit on the ground like the idle's do (measured from the loaded sheet,
//    so it holds for every outfit)
;(() => {
  const BREAK = { 'm-tease': 1, 'm-breeze': 1, 'm-win': 1, 'o-tease': 1, 'o-breeze': 1, 'o-win': 1 }
  const IDLE = { messenger: 'm-idle', runner: 'o-idle' }
  // where the idle resumes after a break, as a share of the 24-frame idle loop
  const BACK = { 'm-tease': 3.5 / 24, 'm-breeze': 3.5 / 24, 'o-tease': 19.5 / 24, 'o-breeze': 21.5 / 24 }
  const IDLE_LOOP = { messenger: 2.85, runner: 2.79 }   // seconds, as pickAnim plays them
  const FADE = 0.18
  const idleOf = h => A.sheets?.[h]?.[IDLE[h]] || A.sheets?.[h]?.idle
  const standing = (h, s) => s === IDLE[h] || s === 'idle' || BREAK[s]
  const warn = (() => { let n = 0; return e => { if (n++ < 3) console.warn('pose-fit', e) } })()

  // lowest opaque row of a frame, relative to the sheet's anchor (source px), cached per image
  const feet = new WeakMap(), cv = document.createElement('canvas'), cg = cv.getContext('2d', { willReadFrequently: true })
  function footY(s, frame) {
    let m = feet.get(s.img); if (!m) feet.set(s.img, m = {})
    if (m[frame] !== undefined) return m[frame]
    const slot = s.img.height, top = Math.floor(slot * 0.5), hh = slot - top
    cv.width = slot; cv.height = hh; cg.clearRect(0, 0, slot, hh)
    cg.drawImage(s.img, frame * slot, top, slot, hh, 0, 0, slot, hh)
    const d = cg.getImageData(0, 0, slot, hh).data
    let low = -1
    for (let y = hh - 1; y >= 0 && low < 0; y--) for (let x = 0, i = y * slot * 4 + 3; x < slot; x++, i += 4) if (d[i] > 128) { low = y; break }
    return (m[frame] = low < 0 ? null : top + low - s.y)
  }

  let cur = null, fade = null, prev = null
  const basePick = window.pickAnim
  window.pickAnim = function () {
    let a = basePick.apply(this, arguments)
    try {
      const h = P.hero
      if (prev && prev.hero === h && prev.sheet !== a.sheet && standing(h, prev.sheet) && standing(h, a.sheet) && !P.act) {
        // back to the idle: start it on the frame nearest the break's last pose
        if (BREAK[prev.sheet] && !BREAK[a.sheet] && BACK[prev.sheet] !== undefined && (idleOf(h)?.n || 0) > 12) {
          P.animT = BACK[prev.sheet] * IDLE_LOOP[h]
          a = basePick.apply(this, arguments)
        }
        fade = { hero: h, sheet: prev.sheet, frame: prev.frame, t0: T }
      }
      if (fade && (fade.hero !== h || T - fade.t0 >= FADE || P.act || !P.ground)) fade = null
      prev = { hero: h, sheet: a.sheet, frame: a.frame }
      cur = { hero: h, sheet: a.sheet, frame: a.frame, crouch: P.ground && a.sheet === (h === 'runner' ? 'o-jump' : 'jump') && a.frame <= 1 }
    } catch (e) { warn(e) }
    return a
  }

  // scale about her feet and shift down, for one sheet/frame of the player
  function fit(hero, sheet, frame, crouch) {
    const s = A.sheets?.[hero]?.[sheet], idle = idleOf(hero)
    let k = 1, dy = 0
    if (!s?.img || !idle?.img) return { k, dy }
    if (BREAK[sheet] && s.h && idle.h) k = idle.h / s.h
    if (crouch) {
      const fy = footY(s, frame), iy = footY(idle, 0)
      if (fy !== null && iy !== null) dy = Math.max(0, Math.min(40, iy - fy)) * SCALE[hero]
    }
    return { k, dy }
  }
  const baseDraw = window.drawSprite
  function drawFit(args, f) {
    const [, , , x, y] = args
    if (f.k === 1 && !f.dy) return baseDraw.apply(null, args)
    ctx.save(); ctx.translate(x, y + f.dy); ctx.scale(f.k, f.k); ctx.translate(-x, -y)
    try { return baseDraw.apply(null, args) } finally { ctx.restore() }
  }
  window.drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
    let me = false, f = { k: 1, dy: 0 }
    try {
      me = typeof P !== 'undefined' && hero === P.hero && x === P.x && y === P.y && cur && cur.hero === hero && cur.sheet === sheet && cur.frame === frame
      f = fit(hero, sheet, frame, me && cur.crouch)
    } catch (e) { warn(e) }
    const r = drawFit(arguments, f)
    if (me && fade) try {
      const k = (T - fade.t0) / FADE
      if (k < 1) drawFit([hero, fade.sheet, fade.frame, x, y, face, alpha * (1 - k) * (1 - k), scale], fit(hero, fade.sheet, fade.frame, false))
    } catch (e) { warn(e) }
    return r
  }
})()
