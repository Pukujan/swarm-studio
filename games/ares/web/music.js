// Music: one gothic track per moment (title, stage, boss, Teknium, death), made in Google Flow
// Music (Lyria 3.5). Each track is a streamed <audio>, crossfaded by the game's own mode, so
// nothing here touches the SFX graph. M mutes it (saved); ?music=0 starts it muted.
const MUSIC = (() => {
  const SRC = { title: 'title', stage: 'stage', boss: 'boss', teknium: 'teknium', death: 'death' }
  const LEVEL = { title: 0.5, stage: 0.42, boss: 0.48, teknium: 0.5, death: 0.6 }
  const ONCE = new Set(['death'])
  let muted = /[?&]music=0\b/.test(location.search)
  try { if (!muted) muted = localStorage.getItem('ares.music') === 'off' } catch { }
  const el = {}, gain = {}
  let want = null, unlocked = false
  function get(k) {
    if (el[k]) return el[k]
    const a = new Audio('../assets/music/' + SRC[k] + '.m4a')
    a.preload = 'auto'; a.loop = !ONCE.has(k); a.volume = 0; gain[k] = 0
    return (el[k] = a)
  }
  function pick() {
    if (typeof mode === 'undefined') return null
    if (mode === 'dead') return 'death'
    if (mode === 'title' || mode === 'win') return 'title'
    if (mode !== 'play' && mode !== 'boon' && mode !== 'loading') return null
    if (typeof B !== 'undefined' && B && !B.dead) return /teknium/i.test(B.handle || B.sprite || '') ? 'teknium' : 'boss'
    if (typeof TI !== 'undefined' && TI && TI.hp > 0) return 'boss'
    return 'stage'
  }
  let last = performance.now()
  function tick(now) {
    const dt = Math.min(0.5, (now - last) / 1000); last = now
    const k = pick()
    if (k !== want) {
      if (k && ONCE.has(k)) { const a = get(k); try { a.currentTime = 0 } catch { } }
      if (k && want && !ONCE.has(want) && el[k] && el[k].paused) { try { el[k].currentTime = 0 } catch { } }
      want = k
    }
    for (const n of Object.keys(SRC)) {
      const on = n === want && !muted && !document.hidden
      if (!on && !el[n]) continue
      const a = get(n)
      const target = on ? LEVEL[n] : 0
      // fade in over ~1.2 s, out over ~0.8 s; the death sting cuts the stage track faster
      const rate = on ? 0.9 : (want === 'death' ? 2.5 : 1.3)
      gain[n] += Math.sign(target - gain[n]) * Math.min(Math.abs(target - gain[n]), rate * dt)
      a.volume = Math.max(0, Math.min(1, gain[n]))
      if (on && a.paused && unlocked && !(ONCE.has(n) && a.ended)) a.play().catch(() => { })
      if (!on && gain[n] <= 0.001 && !a.paused) a.pause()
    }
    requestAnimationFrame(tick)
  }
  // browsers only start audio after a key or click
  const unlock = () => { unlocked = true }
  addEventListener('keydown', e => {
    unlock()
    if ((e.key === 'm' || e.key === 'M') && !e.repeat && !e.ctrlKey && !e.metaKey) { muted = !muted; try { localStorage.setItem('ares.music', muted ? 'off' : 'on') } catch { } }
  }, true)
  addEventListener('pointerdown', unlock, true)
  addEventListener('touchstart', unlock, true)
  requestAnimationFrame(tick)
  return { get muted() { return muted }, get track() { return want }, el }
})()
