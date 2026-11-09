// Three visual directions from one brand colour: Bold (complementary accent),
// Calm (analogous, soft) and Editorial (monochrome with one hot accent).
const hex = h => { const m = String(h).trim().match(/^#?([0-9a-f]{6})$/i); return m ? m[1] : '0000f2' }
function toHsl(h) {
  const n = parseInt(hex(h), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min, s = l > .5 ? d / (2 - max - min) : d / (max + min)
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [Math.round(hh * 60), Math.round(s * 100), Math.round(l * 100)]
}
const hsl = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${Math.max(0, Math.min(100, s))}% ${Math.max(0, Math.min(100, l))}%)`

export function directions(colour) {
  const [h, s, l] = toHsl(colour)
  return [
    { id: 'bold', name: 'Bold', idea: 'Loud and kinetic: big type, a clashing accent, hard edges.', fonts: { display: 'Archivo Black', body: 'Inter' },
      vars: { '--background': hsl(h, 30, 6), '--foreground': hsl(h, 10, 96), '--primary': hsl(h, Math.max(s, 70), Math.min(Math.max(l, 45), 60)), '--accent': hsl(h + 180, 95, 55), '--radius': '2px' } },
    { id: 'calm', name: 'Calm', idea: 'Soft and warm: rounded shapes, airy spacing, gentle neighbours of the brand colour.', fonts: { display: 'Fraunces', body: 'DM Sans' },
      vars: { '--background': hsl(h + 20, 30, 97), '--foreground': hsl(h, 25, 14), '--primary': hsl(h, Math.min(s, 55), 45), '--accent': hsl(h + 35, 60, 70), '--radius': '20px' } },
    { id: 'editorial', name: 'Editorial', idea: 'A magazine: black and white, serif headlines, the brand colour used once per screen.', fonts: { display: 'Playfair Display', body: 'IBM Plex Sans' },
      vars: { '--background': hsl(0, 0, 99), '--foreground': hsl(0, 0, 8), '--primary': hsl(0, 0, 8), '--accent': hsl(h, Math.max(s, 80), 50), '--radius': '0px' } }
  ]
}

export async function run({ intake, write }) {
  const d = directions(intake.colour)
  const sw = d.map((x, i) => `<g transform="translate(${i * 220 + 10},10)"><rect width="200" height="140" rx="10" fill="${x.vars['--background']}" stroke="#888"/><text x="16" y="34" font-family="sans-serif" font-size="18" font-weight="700" fill="${x.vars['--foreground']}">${x.name}</text>${['--primary', '--accent', '--foreground'].map((k, j) => `<rect x="${16 + j * 60}" y="60" width="48" height="48" rx="6" fill="${x.vars[k]}"/>`).join('')}</g>`).join('')
  const files = [
    write('public/pack/directions.json', { brand: intake.brand, base: `#${hex(intake.colour)}`, directions: d }),
    write('src/data/directions.json', { directions: d }),
    write('public/pack/directions.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 670 160">${sw}</svg>`)
  ]
  return {
    files,
    note: d.map(x => x.name).join(', '),
    ask: 'Add a /directions page that shows the three directions from src/data/directions.json side by side, each as a live mini version of the landing hero styled with that direction\'s CSS variables and fonts (load them from Google Fonts), with its name and idea. "Use this direction" applies its variables to the whole site (set them on :root) and saves the choice in localStorage; a small switcher in the footer changes it later. Link /directions from /admin and from the footer.'
  }
}
