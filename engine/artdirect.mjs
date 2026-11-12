// The art director: every build gets one named style for all of its pictures, so
// a build looks like one person made it and the Feed looks like many people did.
// It writes each picture's prompt from that style, asks for the high-quality tier
// for heroes and posters, and sends back pictures that drift into the generic AI
// look (glow, teal and gold, neon fantasy, symmetrical "epic" shots).
//
// Pure functions; the server owns the image calls and the vision check's model.
import { keyBackground, keyNamed, keyOf } from './keycolor.mjs'
export { keyTrouble, keyOf, swapKey, keyClash, otherKey, measureKey } from './keycolor.mjs'

// The styles. Photo is the default; the brief picks another by naming it.
export const STYLES = {
  photo: {
    name: 'Film photo',
    words: /\b(photo(graph(y|ic)?)?|35 ?mm|film photo|documentary|realistic|real people)\b/i,
    guide: 'Candid documentary photograph shot on 35mm film, natural or practical light, a real lived-in place with real clutter and wear, shallow depth of field, slight film grain, imperfect off-centre framing, people absorbed in what they are doing and not posing for the camera. One muted grade: slightly desaturated, soft contrast, lifted blacks.',
    avoid: 'illustration, 3D render, CGI, plastic skin, stock-photo smiles at the camera'
  },
  'anime-cel': {
    name: 'Anime cel',
    words: /\b(anime|cel[- ]shad(ed|ing)|cel animation)\b/i,
    guide: 'Hand-drawn TV-anime look with clean line art and flat cel shading, soft painted backgrounds, an everyday slice-of-life moment, asymmetric composition. Original characters and original designs only.',
    avoid: 'photorealism, 3D render, any existing anime or game character'
  },
  'vhs-anime': {
    name: '90s anime',
    words: /\b(90s anime|vhs|retro anime|ova)\b/i,
    guide: '1990s cel anime frame with VHS artefacts: soft chroma bleed, scan lines, grain and faded colours, warm and dim. Original characters only.',
    avoid: 'crisp modern digital look, any existing anime character'
  },
  'manga-ink': {
    name: 'Manga ink',
    words: /\b(manga|comic[- ](book|page|strip) (style|look|art)|graphic novel style|black and white ink|screentone)\b/i,
    guide: 'Black and white manga ink with screentone shading, brush and pen line work, strong blacks, no colour. Original characters only; no speech bubbles or sound effects.',
    avoid: 'colour, photorealism, any existing manga character'
  },
  pixel: {
    name: 'Pixel art',
    words: /\b(pixel(ated)?( art)?|8[- ]?bit|16[- ]?bit)\b/i,
    guide: 'Detailed pixel art with a limited palette of about 32 colours, crisp visible pixels and no anti-aliasing, clear readable shapes.',
    avoid: 'smooth gradients, blur, photorealism'
  },
  gouache: {
    name: 'Gouache',
    words: /\b(gouache|painterly|storybook (style|look|art)|hand[- ]painted (style|look|art)|painted (style|look|art))\b/i,
    guide: 'Gouache painting with visible opaque brush strokes and paper texture, storybook warmth, daylight colour, a cluttered lived-in scene.',
    avoid: 'photorealism, 3D render, airbrushed glow'
  },
  watercolour: {
    name: 'Ink and watercolour',
    words: /\b(water ?colou?r|ink and wash|sketchbook)\b/i,
    guide: 'Ink line drawing with loose watercolour washes on textured paper, soft bleeding edges, plenty of white paper.',
    avoid: 'heavy saturated colour, 3D render'
  },
  concept: {
    name: 'Concept sketch',
    words: /\b(concept art|concept sketch|matte painting|loose brush)\b/i,
    guide: 'Loose painterly concept sketch with rough brush strokes, unfinished edges and a limited palette, the subject small and off-centre in a big space.',
    avoid: 'polished render, symmetrical hero shot'
  },
  riso: {
    name: 'Risograph',
    words: /\b(riso(graph)?|zine (style|look)|screen ?print(ed)? (style|look)|halftone|gig poster style)\b/i,
    guide: 'Two-colour risograph print on off-white paper with visible grain, halftone dots and slight misregistration.',
    avoid: 'gradients, glow, photorealism'
  },
  sticker: {
    name: 'Sticker sheet',
    words: /\b(sticker (sheet|style|look)|die[- ]cut stickers?)\b/i,
    guide: 'Die-cut vinyl stickers with thick white borders photographed flat on a desk, bold simple original mascots.',
    avoid: 'existing characters or logos'
  },
  papercraft: {
    name: 'Papercraft',
    words: /\b(paper ?craft|paper[- ]cut (style|look|art)|cut[- ]paper (style|look|art)|claymation|stop[- ]motion (style|look))\b/i,
    guide: 'Handmade papercraft or clay diorama photographed on a table, visible fibres, fingerprints and seams, soft daylight.',
    avoid: 'CGI smoothness, glow'
  },
  toy3d: {
    name: 'Toy 3D',
    words: /\b(3d (style|look|art|game|world)|low[- ]poly|isometric|voxel|toy[- ]like)\b/i,
    guide: 'Soft toy-like 3D with matte materials, simple rounded shapes and gentle studio light, like a handmade figurine.',
    avoid: 'glossy glow, neon, photoreal humans'
  }
}

// The generic AI look. A ban is lifted when the person's own brief asks for that look
// ("a neon cyberpunk club night"); a name that only mentions it ("Lantern Row") does not.
export const BANNED = [
  { id: 'glow', label: 'glowing lanterns or magical glow', lift: /\b(glow(ing)?|bioluminescen\w*|magical light)\b/i, words: /\b(glow(ing|s)?|lanterns?|luminous|bioluminescen\w*|ethereal|radiant|magical light|god ?rays?)\b/gi },
  { id: 'teal-gold', label: 'teal-and-gold or teal-and-orange fantasy grade', lift: /\bteal[- ]and[- ](gold|orange)\b/i, words: /\b(teal|turquoise)[- ]and[- ](gold|orange|amber)\b|\bteal\b|\bgold(en)? (light|glow|accents?)\b/gi },
  { id: 'neon', label: 'neon cyberpunk', lift: /\b(neon|cyberpunk|synthwave|vaporwave)\b/i, words: /\b(neon|cyberpunk|synthwave|vaporwave|holo(gram|graphic)s?)\b/gi },
  { id: 'epic', label: 'symmetrical "epic" hero shot', lift: /\b(epic|cinematic|symmetrical)\b/i, words: /\b(epic|majestic|cinematic|dramatic|awe[- ]inspiring|symmetrical|hero shot|breathtaking|stunning)\b/gi },
  { id: 'fantasy', label: 'fantasy sheen', lift: /\b(fantasy|mystical|enchanted|dreamlike)\b/i, words: /\b(fantasy|dreamlike|dreamy|otherworldly|mystical|enchanted)\b/gi }
]
// Only a photo build bans looks that aren't photos.
const PHOTO_ONLY = { id: 'not-photo', label: 'illustrated, 3D or CGI look', words: /\b(illustrat\w*|3d|render(ed)?|cgi|digital art|cartoon|anime)\b/gi }

const clip = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)

// The style for a build: the first style the brief names, else photo. The theme's
// direction never picks a style: planners reach for "painterly" or "neon" on their own.
export function pickStyle(brief) {
  const text = String(brief || '')
  for (const [key, s] of Object.entries(STYLES)) if (key !== 'photo' && s.words.test(text)) return key
  return 'photo'
}

// Grade from the theme's colours: warm or cool, always muted, so pictures sit with the page.
function grade(theme) {
  const hex = String(theme?.vars?.['--primary'] || theme?.vars?.['--accent'] || '').match(/^#([0-9a-f]{6})$/i)
  if (!hex) return 'a muted warm-neutral grade'
  const [r, g, b] = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  if (max - min < 0.08) return 'a muted neutral grade'
  let h = max === r ? ((g - b) / (max - min)) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4
  h = (h * 60 + 360) % 360
  return h < 75 || h > 290 ? 'a muted warm grade' : 'a muted cool grade'
}

// One style guide per build: { style, name, guide, avoid, bans }.
export function styleGuide({ brief, theme } = {}) {
  const style = pickStyle(brief)
  const s = STYLES[style]
  const asked = String(brief || '')
  const bans = [...BANNED, ...(style === 'photo' ? [PHOTO_ONLY] : [])]
    .filter(b => !b.lift?.test(asked))
    .map(b => b.id)
  const g = style === 'photo' ? `${s.guide.replace('One muted grade', 'One grade')} Use ${grade(theme)}.` : s.guide
  return { style, name: s.name, guide: g, avoid: s.avoid, bans }
}

const banOf = id => [...BANNED, PHOTO_ONLY].find(b => b.id === id)

// What a worker asked for, without the banned words (a worker's "glowing lantern
// festival" becomes "festival"), so the prompt can't pull the picture back there.
// Words and UI belong in the HTML, never in a picture: a worker's "dashboard showing
// production stats" must not come back as a fake screen with a nav bar and numbers.
const UI_WORDS = /\b(dashboards?|user interfaces?|interfaces?|UI|UX|HUD|app screens?|screens?(hots?)?|monitors?|displays?|websites?|web ?pages?|landing pages?|mock-?ups?|wireframes?|nav(igation)? ?bars?|menus?|buttons?|charts?|graphs?|stats|statistics|metrics|readouts?|labels?|captions?|headlines?|text|typography|logos?|signs?|signage)\b/gi
export function cleanGen(gen, guide) {
  let out = String(gen || '').replace(UI_WORDS, '')
  for (const id of guide?.bans || []) out = out.replace(banOf(id).words, '')
  out = out.replace(/\s+([,.;])/g, '$1').replace(/(,\s*){2,}/g, ', ').replace(/\b(an?|the|of|with|and)\s+(?=[,.;]|$)/gi, '')
  out = out.replace(/\ban\s+(?=[^aeiou\s])/gi, 'a ').replace(/\ba\s+(?=[aeiou])/gi, 'an ')
  return clip(out.replace(/^[\s,.;]+|[\s,.;]+$/g, ''), 300)
}

const SHAPE = {
  landscape: 'Wide horizontal 3:2 composition.',
  portrait: 'Tall vertical 2:3 composition, composed for a vertical frame.',
  square: 'Square 1:1 composition.'
}

// The prompt for one picture. The shape is said in words too: some image backends
// pick the size from the prompt, not the size asked for.
export const EMPTY_PLACE = 'An empty place with nobody in it: no people, characters, figures, silhouettes or animals anywhere, not even small or far away.'
export function promptFor(gen, guide, { aspect = 'landscape', strict = '', cutout = false } = {}) {
  const what = cleanGen(gen, guide)
  const avoid = [guide?.avoid, ...(guide?.bans || []).map(id => banOf(id).label)].filter(Boolean).join('; ')
  // an empty place (a game backdrop): said up front and again at the end, and the style's
  // "moment" wording, which paints people into the scene, left out
  const empty = !cutout && /\bNo people\b/i.test(String(gen))
  const style = String(guide?.guide || STYLES.photo.guide)
  return clip([
    SHAPE[aspect] || SHAPE.landscape,
    empty ? EMPTY_PLACE : '',
    `${what}.`,
    empty ? style.replace(/,?\s*an? (everyday )?(slice-of-life )?moment\b/gi, '').replace(/\b(original )?characters?( and original designs)? only\.?/gi, '').trim() : style,
    cutout
      ? `No text, letters, numbers, logos or brand marks anywhere in the picture. One figure alone on ${keyBackground(what, /#(FF00FF|00FF00|0000FF)/i.test(what) ? keyNamed(keyOf(what)) : undefined)}, with no floor, shadow, scenery or frame, so it can be cut out.`
      : 'No text, letters, numbers, logos or brand marks anywhere in the picture. No user interface: no screens, dashboards, apps, charts, nav bars, buttons or signs. A real scene only; the words live in the page, not the picture.',
    avoid ? `Avoid: ${avoid}.` : '',
    empty ? EMPTY_PLACE : '',
    strict ? `This is a second try. The first picture was sent back for: ${strict}. Make sure none of that is in this one.` : ''
  ].filter(Boolean).join(' '), 1200)
}

// Heroes, posters and the video's full-frame shots get the best tier the model has.
// Other pictures keep the person's pick.
const HD = { 'gpt-image-2-low': 'gpt-image-2-high', 'gpt-image-2-medium': 'gpt-image-2-high', 'gpt-image-2': 'gpt-image-2-high' }
export const isHero = ({ layer = '', role = '', n = 0 } = {}) => /hero|poster|cover|banner|splash|key-?art/i.test(`${layer} ${role}`) || n === 1
export function tierFor(choice, { hero = false } = {}) {
  if (!choice) return choice
  const model = String(choice.model || '')
  return hero && HD[model] ? { ...choice, model: HD[model] } : choice
}

// The vision check: the reviewer model looks at one picture and says whether it
// shows any banned look, or the usual image tells. Messages only; the server sends them.
export function checkMessages(guide, image) {
  const bans = (guide?.bans || []).map(id => banOf(id).label)
  return [
    {
      role: 'system',
      content: `You are an art director checking one picture for a website before it goes live. The build's style is "${guide?.name || 'Film photo'}": ${guide?.guide || ''}

Send it back only for a clear, visible problem:
${[...bans, 'a different style from the one above', 'ANY readable or garbled text, letters, numbers or logos, even small', 'ANY user interface: a screen, dashboard, app, chart, nav bar, button or HUD', 'broken hands, faces or warped objects', 'a look-alike of a famous character'].map(b => `- ${b}`).join('\n')}

Return JSON only: {"ok":true} or {"ok":false,"problems":["what is wrong, under 10 words"]}. At most 3 problems. Text and interfaces are always sent back; for anything else, if in doubt, it is ok.`
    },
    { role: 'user', content: [{ type: 'text', text: 'Check this picture.' }, { type: 'image_url', image_url: { url: image } }] }
  ]
}

// The sprite check: a cut-out game sprite, shown side by side on dark and on magenta so
// leftover background, halos and holes stand out. Messages only; the server sends them.
export const SPRITE_RETRY = 'paint the whole figure inside the frame on one flat plain background, with no gaps, loops or holes that show the background through the figure'
// A sheet's own prompt: the layout and the frames first, so the clip never cuts them,
// and only the style's look (not its composition words, which fight a grid).
export function sheetPrompt({ look = '', frames = '' }, guide, { strict = '', layout = '' } = {}) {
  const style = String(guide?.guide || '').split(/(?<=\.)\s+/).map(x => x.replace(/\.$/, '').split(/,\s*/).filter(c => !/composition|moment|background|scene|framing|shot/i.test(c)).join(', ')).filter(Boolean).join('. ')
  const avoid = [guide?.avoid, ...(guide?.bans || []).map(id => banOf(id).label)].filter(Boolean).join('; ')
  return clip([
    'A 2D game animation sprite sheet, not a character reference sheet: exactly six full-body poses of ONE character, in a 3 by 2 grid, one pose per cell.',
    `The six poses, left to right, top to bottom: ${frames}.`,
    layout && `${layout.replace(/\.$/, '')}.`,
    'No close-ups, no faces or expressions on their own, no turnaround, no companions, pets, robots or props beside the character.',
    `The character: ${look}.`,
    style && `${style}.`,
    'No text, letters or numbers anywhere.',
    avoid ? `Avoid: ${avoid}.` : '',
    strict ? `This is a second try. The first sheet was sent back for: ${strict}. Make sure none of that is in this one.` : ''
  ].filter(Boolean).join(' '), 1400)
}

// A kit sheet (six UI pieces or six props) or an effect sheet (six frames of light on black):
// the layout and the six things first, then what they belong to, then the style's look.
export function kitPrompt({ look = '', frames = '', fx = false }, guide, { strict = '', layout = '' } = {}) {
  const style = String(guide?.guide || '').split(/(?<=\.)\s+/).map(x => x.replace(/\.$/, '').split(/,\s*/).filter(c => !/composition|moment|background|scene|framing|shot|character/i.test(c)).join(', ')).filter(Boolean).join('. ')
  const avoid = [guide?.avoid, ...(guide?.bans || []).map(id => banOf(id).label)].filter(Boolean).join('; ')
  return clip([
    fx ? 'A 2D game effect animation sheet: exactly six frames of ONE effect, in a 3 by 2 grid, one frame per cell.' : 'A 2D game asset sheet: exactly six separate objects, in a 3 by 2 grid, one object per cell.',
    fx ? `The effect, from its first frame to its last: ${frames}.` : `The six objects, left to right, top to bottom: ${frames}.`,
    layout && `${layout.replace(/\.$/, '')}.`,
    look && `They are ${look}.`,
    style && `${style}.`,
    'No text, letters or numbers anywhere.',
    avoid ? `Avoid: ${avoid}.` : '',
    strict ? `This is a second try. The first sheet was sent back for: ${strict}. Make sure none of that is in this one.` : ''
  ].filter(Boolean).join(' '), 1400)
}
export function kitMessages(what, image, frames = '', fx = false) {
  return [
    {
      role: 'system',
      content: `You check one sheet of game art before it goes into a game: ${clip(what, 80)}. ${fx ? 'Its six frames are one effect, painted as light on black, shown side by side.' : 'Its six pieces were cut out of a painted sheet and are shown side by side, once on dark and once on light grey.'} They should show: ${clip(frames, 400)}

Send it back only for a clear, visible problem:
- a piece is missing, or two pieces are joined or overlap
- a piece is cut off at its frame's edge
- letters, words or numbers on any piece
- a person or character where an object should be${fx ? '' : `
- leftover background: magenta, green, blue, grey or white patches, specks or a coloured rim around a piece`}

Return JSON only: {"ok":true} or {"ok":false,"problems":["what is wrong, under 10 words"]}. At most 3 problems. If in doubt, it is ok.`
    },
    { role: 'user', content: [{ type: 'text', text: 'Check this sheet.' }, { type: 'image_url', image_url: { url: image } }] }
  ]
}

// A sprite sheet's frames, cut out and laid side by side, shown on dark and on magenta.
export function sheetMessages(what, image, frames = '') {
  return [
    {
      role: 'system',
      content: `You check one animation strip before it goes into a game: ${clip(what, 80)}. Its frames were cut out of a painted sheet and are shown side by side, once on dark and once on light grey.${frames ? ` The frames should show: ${clip(frames, 300)}` : ''}

Send it back only for a clear, visible problem:
- a frame shows a different character, outfit or colours than the others
- the figure changes size a lot between frames, or a frame is empty
- a head, hand, foot or hair cut off at a frame's edge, or two figures in one frame
- leftover background: magenta, green, blue, grey or white patches, specks or a coloured rim around the figure
- the frames do not show the moves asked for

Return JSON only: {"ok":true} or {"ok":false,"problems":["what is wrong, under 10 words"]}. At most 3 problems. If in doubt, it is ok.`
    },
    { role: 'user', content: [{ type: 'text', text: 'Check this animation strip.' }, { type: 'image_url', image_url: { url: image } }] }
  ]
}
export function cutoutMessages(what, image) {
  return [
    {
      role: 'system',
      content: `You check one game sprite before it goes into the game: ${clip(what, 80)}. It was cut out of a flat key-colour background and is shown twice, on dark and on light grey.

Send it back only for a clear, visible problem:
- leftover background: magenta, green, blue, grey or white patches, specks or a coloured rim inside or around the figure (between hair strands, inside loops, under arms)
- a hole through the figure where it should be solid
- a head, hand, foot, tail or weapon cut off by the edge of the picture
- more than one figure, or a scene instead of one figure

Return JSON only: {"ok":true} or {"ok":false,"problems":["what is wrong, under 10 words"]}. At most 3 problems. If in doubt, it is ok.`
    },
    { role: 'user', content: [{ type: 'text', text: 'Check this sprite.' }, { type: 'image_url', image_url: { url: image } }] }
  ]
}

export function parseCheck(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}')
  // no verdict in the answer (an empty reply): unread, so the next reviewer model is asked
  if (a < 0 || b <= a) return { ok: true, problems: [], unread: true }
  try {
    const j = JSON.parse(s.slice(a, b + 1))
    const problems = (Array.isArray(j.problems) ? j.problems : []).map(p => clip(p, 80)).filter(Boolean).slice(0, 3)
    return { ok: j.ok !== false || !problems.length, problems }
  } catch {
    return { ok: true, problems: [], unread: true }
  }
}
