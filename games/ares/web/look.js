// look.js: keeps the heroine apart from the stage, the way key art does.
//  - pushBack(K): after the sky, far scenery and haze, before the world layer, dims and desaturates
//    the background a little and cools it slightly, so she and the platforms sit in front.
//  - drawSprite wrap: a thin dark outline (value separation on bright stages) and a soft light rim
//    from above (shape separation on dark ones), heroines only, main sprite only.
// ?look=0 turns all of it off. PERF.low keeps the push-back and skips the rim.
;(() => {
  const ON = !/[?&]look=0\b/.test(location.search)
  const low = () => typeof PERF !== 'undefined' && PERF.low
  let warned = 0; const warn = e => { if (!warned++) console.warn('look', e) }

  // ---------------------------------------------------------------- background push-back
  window.pushBack = function (K) {
    if (!ON) return
    try {
      const night = (typeof MOOD !== 'undefined' && MOOD.k?.night) || 0, red = typeof ECL !== 'undefined' && !!ECL
      if (red) return   // the eclipse owns the colour
      const k = 1 - night * 0.6   // night stages are already dark
      ctx.save()
      ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.16 * k; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1; ctx.fillStyle = `rgb(${Math.round(255 - 40 * k)},${Math.round(255 - 36 * k)},${Math.round(255 - 26 * k)})`; ctx.fillRect(0, 0, W, H)
      ctx.restore()
    } catch (e) { warn(e) }
  }

  // ---------------------------------------------------------------- heroine outline and rim
  const SIL = document.createElement('canvas'), sg = SIL.getContext('2d')
  const cache = {}
  function sil(s, frame, k, rgb) {
    const slot = s.img.height, w = Math.ceil(slot * k) + 8, key = rgb
    const c = cache[key] || (cache[key] = { cv: document.createElement('canvas'), id: '' })
    const id = s.img.src + frame + w
    if (c.id !== id) {
      if (c.cv.width < w) c.cv.width = c.cv.height = w
      const g = c.cv.getContext('2d')
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, c.cv.width, c.cv.height)
      g.drawImage(s.img, frame * slot, 0, slot, slot, 4, 4, w - 8, w - 8)
      g.globalCompositeOperation = 'source-in'; g.fillStyle = `rgb(${rgb})`; g.fillRect(0, 0, w, w)
      c.id = id
    }
    return { cv: c.cv, w, ox: -s.x * k - 4, oy: -s.y * k - 4 }
  }
  function put(o, x, y, face, dx, dy, a, op) {
    ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = op
    ctx.translate(x + dx, y + dy); ctx.scale(face, 1)
    ctx.drawImage(o.cv, 0, 0, o.w, o.w, o.ox, o.oy, o.w, o.w)
    ctx.restore()
  }
  const HEROES = { messenger: 1, runner: 1 }
  const base = window.drawSprite
  window.drawSprite = function (hero, sheet, frame, x, y, face, alpha = 1, scale = 1) {
    if (ON && !low() && HEROES[hero] && alpha > 0.75 && ctx.globalCompositeOperation === 'source-over' && (typeof mode === 'undefined' || mode === 'play' || mode === 'boon')) try {
      const s = A.sheets?.[hero]?.[sheet]
      if (s?.img) {
        const k = SCALE[hero] * scale, d = 1.6 / Math.max(0.8, cam.z || 1)   // about 2 screen px whatever the zoom
        const dark = sil(s, frame, k, '34,14,18')
        for (const [dx, dy] of [[-d, 0], [d, 0], [0, -d], [0, d]]) put(dark, x, y, face, dx, dy, 0.42 * alpha, 'source-over')
        const night = (typeof MOOD !== 'undefined' && MOOD.k?.night) || 0
        const rim = sil(s, frame, k, night > 0.3 ? '214,226,255' : '255,244,226')
        put(rim, x, y, face, -d * 0.8, -d * 1.4, (0.28 + night * 0.25) * alpha, 'lighter')
      }
    } catch (e) { warn(e) }
    return base.apply(this, arguments)
  }
})()
