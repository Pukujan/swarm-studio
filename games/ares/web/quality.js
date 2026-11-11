// The graphics pick on the title screen: G cycles Auto, High and Low. It is saved for next time
// and the page reloads, since the sheets are sized for the pick at load (shrinkHero, game.js).
// Auto starts full and drops to light effects on its own when frames run slow (perfTick).
{
  const ORDER = ['auto', 'high', 'low'], NAME = { auto: 'Auto', high: 'High', low: 'Low' }
  const baseTitle = window.drawTitle
  window.drawTitle = function (dt) {
    if (tap('g') && !/[?&]q=/.test(location.search)) {
      const next = ORDER[(ORDER.indexOf(QUALITY) + 1) % ORDER.length]
      try { localStorage.setItem('ares.q', next) } catch { }
      location.reload()
    }
    baseTitle(dt)
    ctx.save()
    ctx.font = '600 13px Cinzel, serif'; ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,241,220,0.55)'
    const live = QUALITY === 'auto' && PERF.low ? ' · light' : ''
    ctx.fillText(`G  Graphics ${NAME[QUALITY]}${live}`, W - 32, H - 24)
    ctx.restore()
  }
}
