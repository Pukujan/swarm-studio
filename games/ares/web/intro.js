// ARES boss intros: before a boss and the heroine can touch each other, the fight holds
// still for a short exchange. The camera comes in on whoever speaks, their painted portrait
// slides in, their name and line show at the bottom, and the voice plays. J, space or enter
// moves on; Esc skips. Autoplay moves on by itself.
//
// Lines: fights.json <handle>.intro = [ {by: 'boss', line, line_en},
//   {by: 'hero', messenger: {line, line_en}, runner: {line, line_en}}, ... ].
// Without one it plays the first mode's line and the heroine's `reply` bark.
// Voices: assets/voice/<boss id>/intro-<n>.mp3 and assets/voice/<hero>/intro-<boss id>-<n>.mp3.
// Portraits: assets/art/portraits/<boss id>.webp, assets/art/cutins/<hero>-pose.webp.

let INTRO = null
const PORTRAITS = {}
function portraitOf(id) {
  if (!(id in PORTRAITS)) {
    const img = new Image()
    // heroines: a full-figure portrait if painted, else the older cut-in
    if (id === 'messenger' || id === 'runner') img.onerror = () => { img.onerror = null; img.src = `../assets/art/cutins/${id}-pose.webp` }
    img.src = `../assets/art/portraits/${id}.webp`
    PORTRAITS[id] = img
  }
  const img = PORTRAITS[id]
  return img.complete && img.naturalWidth ? img : null
}
const HERO_TITLE = { messenger: 'Baker', runner: 'The Oracle' }

function introLines(handle) {
  const f = FIGHTS?.[handle] || {}, id = voiceOf(handle), hero = P.hero
  const heroBarks = typeof CFG !== 'undefined' ? CFG?.heroes?.[hero]?.barks : null
  if (Array.isArray(f.intro) && f.intro.length) {
    return f.intro.map((l, i) => l.by === 'boss'
      ? { who: 'boss', en: l.line_en || '', voice: [id, `intro-${i + 1}`] }
      : { who: 'hero', en: (l[hero] || l).line_en || '', voice: [hero, `intro-${id}-${i + 1}`] }).filter(l => l.en)
  }
  const out = []
  const first = f.modes?.[0]?.line_en
  if (first) out.push({ who: 'boss', en: first, voice: [id, 'enter'] })
  const rep = heroBarks?.reply?.line_en
  if (rep) out.push({ who: 'hero', en: rep, voice: [hero, 'bark-reply'] })
  return out
}

function startIntro(handle) {
  const lines = introLines(handle)
  if (!lines.length || !B) return false
  INTRO = { handle, id: voiceOf(handle), lines, i: -1, t: 0, open: 0, closing: 0 }
  for (const b of bullets) if (b.enemy) b.dead = true
  // a clean frame: no swing or callout frozen mid-air
  callouts = []; fx = fx.filter(f => f.boss && !f.kind); P.act = null; P.str = []
  // she stops to listen: no run or dash carried into the held frame, so she stands in her idle
  P.vx = 0; P.dashT = 0; P.sprint = false; P.animT = 0
  if (typeof FXK !== 'undefined') try { FXK.clear() } catch { }
  portraitOf(INTRO.id); portraitOf(P.hero)
  introNext()
  return true
}
function introNext() {
  const I = INTRO
  I.i++; I.t = 0
  if (I.i >= I.lines.length) { I.closing = 0.35; return }
  const l = I.lines[I.i]
  const boss = l.who === 'boss'
  // the camera comes in on the speaker
  const x = boss ? B.x : P.x, y = boss ? B.y - (B.float ? 140 : 0) - B.h * 0.55 : P.y - 95
  cam.focus = { z: (stage?.zoom?.calm || 1.55) + 0.45, t: 99, x, y }
  I.dur = Math.max(2.4, l.en.length * 0.055 + 1.3)
  try { voiceQ.length = 0; if (voiceNow) voiceNow.pause() } catch { }
  say(l.voice[0], l.voice[1], true)
  if (boss) { B.anim = 'laugh'; B.animT = 0; B.face = Math.sign(P.x - B.x) || -1 } else P.face = Math.sign(B.x - P.x) || 1
}
function endIntro() {
  INTRO = null
  if (cam.focus) cam.focus.t = 0
  cam.kick = 0.45; flash = 0.35; flashColor = '255,240,220'; shake = Math.max(shake, 6)
  if (B) { B.introDone = true; B.anim = 'idle' }
  SFX.glare()
}
function introTick(dt) {
  if (!B) { INTRO = null; if (cam.focus) cam.focus.t = 0; return }
  const I = INTRO
  I.open = Math.min(1, I.open + dt * 3)
  if (I.closing) { I.closing -= dt; if (I.closing <= 0) endIntro(); return }
  I.t += dt
  P.animT += dt; if (B) B.animT += dt
  if (!AUTO.on && tap('escape')) { I.i = I.lines.length - 1; introNext(); return }
  const go = I.t > 0.45 && !AUTO.on && (tap('j') || tap(' ') || tap('enter'))
  const voiceDone = !voicePlaying()
  if (go || (I.t > I.dur && (voiceDone || I.t > I.dur + 2.5))) introNext()
}

// screen space, after the HUD
function drawIntro() {
  const I = INTRO; if (!I) return
  const e = I.closing ? Math.max(0, I.closing / 0.35) : I.open, ease = 1 - (1 - e) ** 3
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0)
  const bar = 78 * ease
  ctx.fillStyle = '#0c0606'; ctx.fillRect(0, 0, W, bar); ctx.fillRect(0, H - bar, W, bar)
  const l = I.lines[Math.min(I.i, I.lines.length - 1)]
  if (l && !I.closing) {
    const boss = l.who === 'boss', id = boss ? I.id : P.hero
    const img = portraitOf(id)
    const k = Math.min(1, I.t / 0.3), slide = (1 - (1 - k) ** 3)
    // the portrait: tall, on the speaker's side, with a slow push-in
    if (img) {
      // the whole figure, head to toe, filling the panel (older head-to-knee art: to the knee)
      const full = img.height / img.width > 1.7
      const ph = (H - bar * 2) * (full ? 1.02 : 1.12) * (1 + I.t * 0.01), pw = img.width * ph / img.height
      const side = boss ? 1 : -1
      const x = boss ? W * 0.78 - pw / 2 + (1 - slide) * 260 : W * 0.22 - pw / 2 - (1 - slide) * 260
      ctx.save()
      ctx.beginPath()
      const s0 = boss ? W * 0.56 : 0, s1 = boss ? W : W * 0.44
      ctx.moveTo(s0 + (boss ? 60 : 0), bar); ctx.lineTo(s1, bar); ctx.lineTo(s1 - (boss ? 0 : 60), H - bar); ctx.lineTo(s0, H - bar); ctx.closePath(); ctx.clip()
      const g = ctx.createLinearGradient(boss ? s0 : s1, 0, boss ? s1 : s0, 0)
      g.addColorStop(0, 'rgba(40,10,12,0)'); g.addColorStop(1, `rgba(${boss ? '70,14,18' : '70,40,14'},${0.55 * slide})`)
      ctx.fillStyle = g; ctx.fillRect(s0, bar, s1 - s0, H - bar * 2)
      ctx.globalAlpha = slide
      ctx.drawImage(img, x, bar - ph * 0.01, pw, ph)
      ctx.restore()
      // a thin gold edge on the panel
      ctx.strokeStyle = `rgba(232,184,96,${0.7 * slide})`; ctx.lineWidth = 2
      ctx.beginPath(); if (boss) { ctx.moveTo(s0 + 60, bar); ctx.lineTo(s0, H - bar) } else { ctx.moveTo(s1, bar); ctx.lineTo(s1 - 60, H - bar) } ctx.stroke()
      void side
    }
    // name and line
    const name = boss ? (B?.f?.en || I.handle) : HERO_TITLE[P.hero] || ''
    ctx.globalAlpha = Math.min(1, I.t / 0.25)
    ctx.textBaseline = 'middle'
    ctx.textAlign = boss ? 'right' : 'left'
    ctx.font = '700 15px Cinzel, serif'; ctx.fillStyle = '#e8b860'
    ctx.fillText(String(name).toUpperCase(), boss ? W - 56 : 56, H - bar + 22)
    ctx.textAlign = 'center'; ctx.font = '500 21px "Shippori Mincho", Georgia, serif'; ctx.fillStyle = '#fff1dc'
    const shown = l.en.slice(0, Math.ceil(l.en.length * Math.min(1, I.t / Math.min(1.1, l.en.length * 0.025 + 0.2))))
    ctx.fillText(shown, W / 2, H - bar + 50)
  }
  ctx.restore()
}

// a boss leaps in, lands, and then the exchange plays before its entrance attack
{
  const base = window.startBoss
  window.startBoss = function (handle, sec, o = {}) {
    const r = base.apply(this, arguments)
    if (!o.chase && B && !B.chaser && !(window.ARES_NO_INTRO)) later(0.95, () => { if (B && !B.active && !B.introDone) startIntro(handle) }, 'boss')
    return r
  }
}

// While an intro holds the fight she stands still and listens: whatever speed a wrapper or the
// autopilot left on her, the pose is picked as if she were standing (idle, not run or walk).
if (typeof pickAnim === 'function') {
  const corePick = pickAnim
  window.pickAnim = function () {
    if (!(typeof INTRO !== 'undefined' && INTRO && P.ground)) return corePick.apply(this, arguments)
    const vx = P.vx, sp = P.sprint
    P.vx = 0; P.sprint = false
    try { return corePick.apply(this, arguments) } finally { P.vx = vx; P.sprint = sp }
  }
}

// The autopilot (demo runs, Jev) waits out the intro too, instead of swinging at a held frame.
if (typeof autopilot === 'function') {
  const coreAuto = autopilot
  window.autopilot = function () {
    if (typeof INTRO !== 'undefined' && INTRO) { for (const k of AUTO.held) keys.delete(k); AUTO.held.clear(); return }
    return coreAuto.apply(this, arguments)
  }
}
