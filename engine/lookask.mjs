// The look only: a person asks for other colours, fonts or corners on a built site ("change the brand colours",
// "make it darker", "use the reference's colours"). The answer is a few edits to the theme (its colour
// variables, the heading and body fonts, the radius), applied like the Design panel's own edits, so every page,
// section, word and picture stays exactly as it is. Nothing is rebuilt. (The owner, 2026-11-13: "i told the crew
// here with the chat the same thing but it changed the whole website design instead".)
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const HEX = /^#[0-9a-f]{6}$/i
const FONT = /^[A-Za-z][\w ]{1,38}$/
const RADIUS = /^(\d{1,2}px|9999px)$/

export const LOOK_ASK_RULES = `You change the LOOK of a finished website and nothing else. You get the site's theme (its CSS colour variables, heading and body fonts, corner radius), what the person asked, and sometimes the measured look of a reference site they chose. Answer with the new values for only what should change. Keep every variable name exactly as given; never add one. Colours are 6-digit hex. Text must stay readable on its background (dark on light or light on dark), and the accent must stand out from the background. Fonts are Google Fonts family names. Return JSON only:
{"vars":{"--name":"#rrggbb"},"fonts":{"heading":"Family","body":"Family"},"radius":"0px","reply":"what changed, under 16 words"}
Leave out "fonts" or "radius" when they should not change.`

export function lookAskMessages({ theme, text, reference = null }) {
  const facts = { vars: theme?.vars || {}, fonts: theme?.fonts || {}, radius: theme?.radius || '' }
  const ref = reference ? `\nThe reference's measured look: ${JSON.stringify({ bg: reference.bg, text: reference.text, accent: reference.accent, palette: reference.palette, headings: reference.fonts?.display?.kind, body: reference.fonts?.body?.kind, radius: reference.radius }).slice(0, 700)}` : ''
  return [{ role: 'system', content: LOOK_ASK_RULES }, { role: 'user', content: `The theme now: ${JSON.stringify(facts).slice(0, 1500)}${ref}\nThe person asked: ${clip(text, 400)}` }]
}

// The model's answer as edits the server can record: only variables the theme has, only valid values, only
// what differs from now. [{ kind: 'var', name, value } | { kind: 'font', role, value } | { kind: 'radius', value }]
export function lookEditsFrom(said, theme) {
  const out = []
  const vars = theme?.vars || {}
  for (const [name, value] of Object.entries(said?.vars || {})) {
    const v = String(value || '').toLowerCase()
    if (name in vars && HEX.test(v) && v !== String(vars[name]).toLowerCase()) out.push({ kind: 'var', name, value: v })
  }
  for (const role of ['heading', 'body']) {
    const f = String(said?.fonts?.[role] || '').trim()
    if (FONT.test(f) && f !== theme?.fonts?.[role]) out.push({ kind: 'font', role, value: f })
  }
  const r = String(said?.radius || '').trim()
  if (RADIUS.test(r) && r !== theme?.radius) out.push({ kind: 'radius', value: r })
  return out.slice(0, 24)
}

// chat(messages) -> text. Returns { edits, reply }; no edits when the model is missing, fails or changes nothing.
export async function lookEdits({ theme, text, reference = null, chat = null }) {
  if (!chat || !theme?.vars) return { edits: [], reply: '' }
  try {
    const t = String(await chat(lookAskMessages({ theme, text, reference })) || '')
    const said = JSON.parse(t.slice(t.indexOf('{'), t.lastIndexOf('}') + 1))
    return { edits: lookEditsFrom(said, theme), reply: clip(said.reply, 140) }
  } catch { return { edits: [], reply: '' } }
}

// the theme as it stands now: the last theme event with every later look edit applied
export function themeNow(events = []) {
  const i = events.findLastIndex(e => e.type === 'theme')
  if (i < 0) return null
  const th = { ...events[i], vars: { ...(events[i].vars || {}) }, fonts: { ...(events[i].fonts || {}) } }
  for (const e of events.slice(i + 1)) {
    if (e.type !== 'edit') continue
    if (e.kind === 'var' && e.name) th.vars[e.name] = e.value
    if (e.kind === 'font' && e.role) th.fonts[e.role] = e.value
    if (e.kind === 'radius') th.radius = e.value
  }
  return th
}
