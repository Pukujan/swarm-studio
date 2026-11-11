// icons.js: painted icons on the boon cards and the Oracle's spell-pull cards.
// Icons: assetrizz by mojomast (Kyle Durepos), used with permission (the hand_painted_fantasy
// pack, cool hues pulled to gold and crimson). assets/art/icons/icons.json maps game ids to files:
// `boon.<id>` for BOONS, `spell.<kind>` for the Oracle's spells, `drop.<kind>` for drops.js.
// The cards still call drawIcon(name, x, y): plain boons are marked 'art:boon.<id>|<name>' by a
// boonInfo wrapper, and SPELL_ICON entries become 'art:spell.<kind>|<name>', so the upgrade-spell,
// new-spell and pull cards (and the pull sockets) all pick the art up. Until an image has loaded,
// the code-drawn icon after the '|' is drawn instead.
const ICONS = { map: {}, img: {}, dir: '../assets/art/icons/' }
fetch(ICONS.dir + 'icons.json').then(r => (r.ok ? r.json() : null)).then(j => {
  if (!j) return
  ICONS.map = j.icons || {}
  for (const f of new Set(Object.values(ICONS.map))) { const im = new Image(); im.onload = () => { ICONS.img[f] = im }; im.src = ICONS.dir + f }
}).catch(e => console.warn('icons', String(e)))
// the loaded image for a game id, or null
function iconArt(id) { const im = ICONS.img[ICONS.map[id]]; return im && im.naturalWidth ? im : null }

;(function () {
  if (typeof drawIcon !== 'function') return
  const baseIcon = drawIcon
  // 'art:<game id>|<fallback>' draws the painted icon, seated by a soft dark shadow
  drawIcon = function (icon, x, y) {
    if (typeof icon !== 'string' || !icon.startsWith('art:')) return baseIcon(icon, x, y)
    const bar = icon.indexOf('|'), id = icon.slice(4, bar < 0 ? undefined : bar), fb = bar < 0 ? 'tome' : icon.slice(bar + 1)
    const im = iconArt(id)
    if (!im) return baseIcon(fb, x, y)
    const s = 132
    ctx.save()
    if (!ctx.shadowBlur) { ctx.shadowColor = 'rgba(30,4,6,0.6)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4 }
    ctx.drawImage(im, x - s / 2, y - s / 2, s, s)
    ctx.restore()
  }
  if (typeof SPELL_ICON !== 'undefined') for (const k of Object.keys(SPELL_ICON)) SPELL_ICON[k] = 'art:spell.' + k + '|' + SPELL_ICON[k]
  if (typeof boonInfo === 'function') {
    const baseInfo = boonInfo
    boonInfo = function (id) {
      const b = baseInfo(id)
      if (!b || id.includes(':') || String(b.icon).startsWith('art:')) return b
      return { ...b, icon: 'art:boon.' + id + '|' + b.icon }
    }
  }
})()
