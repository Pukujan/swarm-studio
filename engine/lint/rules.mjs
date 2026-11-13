// Swarm's own lint rules, beside Open Design's (artifact.mjs). A builder writes one section as Tailwind
// classes over the theme's CSS variables (engine/prompts.mjs WORKER_SYSTEM), not a page with a <style>
// block, so the same AI-default looks show up as class names: from-purple-500, bg-indigo-600,
// bg-clip-text text-transparent, border-l-4 on a rounded card, uppercase without tracking. These rules
// catch them in that form, with upstream's id where it has one. chromeFindings() checks the Studio's own
// CSS for the hues its chrome never uses (blue, purple, green).

const HUES_SLOP = 'purple|violet|indigo|fuchsia'
const CLASS_ATTR = /\bclass\s*=\s*(["'])([\s\S]*?)\1/gi
const clip = s => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > 200 ? `${t.slice(0, 197)}…` : t }

export function sectionFindings(html) {
  const out = []
  if (typeof html !== 'string' || !html) return out
  const body = html.replace(/<!--[\s\S]*?-->/g, '')
  const lists = [...body.matchAll(CLASS_ATTR)].map(m => m[2])
  const add = (severity, id, message, fix, snippet) => out.push({ severity, id, message, fix, ...(snippet ? { snippet: clip(snippet) } : {}) })

  // a gradient with a violet stop, or the blue to cyan "trust" pair, in Tailwind's from-/via-/to- form
  const violet = new RegExp(`\\b(?:from|via|to)-(?:${HUES_SLOP})-\\d`)
  const trust = c => /\b(?:from|via|to)-(?:blue|sky)-\d/.test(c) && /\b(?:from|via|to)-cyan-\d/.test(c)
  const grad = lists.find(c => /\bbg-(?:gradient|linear)-to-/.test(c) && (violet.test(c) || trust(c)))
  if (grad) add('P0', violet.test(grad) ? 'purple-gradient' : 'trust-gradient', 'A violet or blue-to-cyan gradient in Tailwind classes: the anti-slop list says no.', 'Use a flat surface, bg-[var(--background)] or bg-[var(--card)], or the theme primary at one strength, not a gradient.', grad)

  // Tailwind's own indigo and violet as a fill, text or border colour: the default LLM accent
  const indigo = lists.find(c => new RegExp(`\\b(?:bg|text|border|ring|fill|stroke|decoration|outline|shadow)-(?:${HUES_SLOP})-\\d{2,3}\\b`).test(c))
  if (indigo && !grad) add('P0', 'ai-default-indigo', 'Tailwind indigo or violet used as a colour: the most reported AI design tell.', 'Use the theme: bg-[var(--primary)], text-[var(--accent)], border-[var(--border)].', indigo)

  // gradient text (the worker prompt already forbids it)
  const gtext = lists.find(c => /\bbg-clip-text\b/.test(c) && /\btext-transparent\b/.test(c))
  if (gtext) add('P0', 'gradient-text', 'Gradient text (bg-clip-text text-transparent).', 'Set the heading in one theme colour, text-[var(--foreground)] or text-[var(--primary)].', gtext)

  // a rounded card with a coloured left border
  const left = lists.find(c => /\bborder-l-(?:[2-9]|\[\d)/.test(c) && /(^|\s)rounded(?:-(?!none\b)\S+)?(\s|$)/.test(c))
  if (left) add('P0', 'left-accent-card', 'Rounded card with a coloured left border: the canonical AI-slop card.', 'Drop the left border, or the rounding; use a hairline border all round, border border-[var(--border)].', left)

  // ALL CAPS without tracking: tracking-wider (0.05em) and up, or an explicit em value of 0.06 or more
  const caps = lists.find(c => /(^|\s)uppercase(\s|$)/.test(c) && !/\btracking-(?:wider|widest)\b/.test(c) && !/\btracking-\[(?:0?\.(?:0[6-9]|[1-9])\d*|[1-9][\d.]*)em\]/.test(c))
  if (caps) add('P1', 'all-caps-no-tracking', 'uppercase without letter-spacing of about 0.06em.', 'Add tracking-widest (or tracking-[0.08em]) to the same element.', caps)

  // glass cards (the worker prompt forbids glassmorphism)
  const glass = lists.find(c => /\bbackdrop-blur/.test(c) && /\bbg-(?:white|black)\/\d/.test(c))
  if (glass) add('P1', 'glassmorphism', 'A frosted-glass panel (backdrop-blur over a see-through fill).', 'Use a solid theme surface: bg-[var(--card)] with border-[var(--border)].', glass)

  // colours that are not the theme's: Tailwind palette classes, and raw hex in arbitrary values or styles
  const palette = lists.flatMap(c => c.match(/\b(?:bg|text|border|from|via|to|fill|stroke|ring)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|rose|pink)-\d{2,3}\b/g) || [])
  if (palette.length > 2) add('P1', 'off-theme-colour', `${palette.length} Tailwind palette colours instead of the theme's variables.`, 'Use the theme: bg-[var(--card)], text-[var(--muted-foreground)], border-[var(--border)] and the rest.', palette.slice(0, 6).join(' '))
  const styles = [...body.matchAll(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/gi)].map(m => m[2]).join(' ')
  const hexes = [...lists.join(' ').matchAll(/\[#[0-9a-f]{3,8}\]/gi), ...styles.matchAll(/#[0-9a-f]{3,8}\b/gi)].map(m => m[0])
  if (hexes.length > 6) add('P1', 'raw-hex', `${hexes.length} raw hex colours instead of the theme's variables.`, 'Use the theme variables through Tailwind arbitrary values, bg-[var(--primary)] and the rest.', hexes.slice(0, 6).join(' '))

  return out
}

// The Studio's own chrome (web/*.css): grey and white with one accent, never blue, purple or green.
// A colour literal whose hue lands in those bands, saturated enough to read as a hue.
const BANDS = [['green', 90, 170], ['blue', 190, 250], ['purple', 250, 300]]
function hsl(r, g, b) {
  const [R, G, B] = [r, g, b].map(v => v / 255), max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min
  if (!d) return { h: 0, s: 0 }
  const h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4
  const l = (max + min) / 2
  return { h: (h * 60 + 360) % 360, s: d / (1 - Math.abs(2 * l - 1)) }
}
export function chromeFindings(css, file = '') {
  const out = []
  for (const m of String(css).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b|rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/gi)) {
    const [r, g, b] = m[1] ? (m[1].length === 3 ? [...m[1]].map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16))) : [m[2], m[3], m[4]].map(Number)
    const { h, s } = hsl(r, g, b)
    const band = s >= 0.35 && BANDS.find(([, lo, hi]) => h >= lo && h < hi)
    if (band) out.push({ severity: 'P0', id: 'chrome-hue', message: `${m[0]} is ${band[0]}${file ? ` in ${file}` : ''}: the Studio's chrome has no blue, purple or green.`, fix: 'Use a grey from web/tokens.css, or the one accent.', snippet: m[0] })
  }
  return out
}
