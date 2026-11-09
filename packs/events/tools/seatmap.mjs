// A seat map from the capacity and the tiers: one block per tier, front to back
// (the priciest nearest the stage), as an SVG for the page and JSON for the store.
export function parseTiers(text) {
  const out = []
  for (const part of String(text).split(/[,;\n]+/)) {
    const m = part.trim().match(/^(.+?)\s*[:\-–]?\s*([$€£¥]|NT\$)?\s*(\d+(?:\.\d+)?)\s*$/)
    if (m) out.push({ name: m[1].trim(), price: Number(m[3]) })
  }
  return out.length ? out : [{ name: 'General', price: 25 }]
}

export async function run({ intake, write }) {
  const tiers = parseTiers(intake.tiers).sort((a, b) => b.price - a.price)
  const total = Math.max(20, Number(intake.capacity) || 600)
  // the front tiers are smaller: weights 1, 2, 4… from the stage back
  const w = tiers.map((_, i) => 2 ** i), sum = w.reduce((a, b) => a + b, 0)
  let left = total
  const blocks = tiers.map((t, i) => {
    const seats = i === tiers.length - 1 ? left : Math.max(10, Math.round(total * w[i] / sum))
    left -= seats
    const cols = Math.min(30, Math.max(10, Math.ceil(Math.sqrt(seats * 2.5))))
    return { tier: t.name, price: t.price, seats, rows: Math.ceil(seats / cols), cols }
  })
  const palette = ['#F2F200', '#F27900', '#00F2F2', '#79F200', '#F200F2', '#00F279']
  const cell = 12, gap = 3, pad = 24
  const width = Math.max(...blocks.map(b => b.cols)) * (cell + gap) + pad * 2
  let y = 70
  const parts = [`<rect x="${pad}" y="20" width="${width - pad * 2}" height="30" rx="6" fill="#0000F2"/><text x="${width / 2}" y="40" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#F2F2F2">STAGE</text>`]
  blocks.forEach((b, i) => {
    const x0 = (width - b.cols * (cell + gap)) / 2
    parts.push(`<text x="${pad}" y="${y + 4}" font-family="sans-serif" font-size="12" fill="${palette[i % palette.length]}">${b.tier} · ${b.seats} seats</text>`)
    y += 12
    let n = 0
    for (let r = 0; r < b.rows; r++) for (let c = 0; c < b.cols && n < b.seats; c++, n++)
      parts.push(`<rect class="seat" data-tier="${b.tier}" x="${x0 + c * (cell + gap)}" y="${y + r * (cell + gap)}" width="${cell}" height="${cell}" rx="3" fill="${palette[i % palette.length]}" opacity=".85"/>`)
    y += b.rows * (cell + gap) + 22
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${y}" role="img" aria-label="Seat map">${parts.join('')}</svg>`
  const files = [
    write('public/pack/seatmap.svg', svg),
    write('src/data/seatmap.json', { capacity: total, currency: intake.currency, tiers: blocks.map(b => ({ name: b.tier, price: b.price, seats: b.seats, rows: b.rows })) })
  ]
  return {
    files,
    note: `${blocks.length} tiers, ${total} seats`,
    ask: 'Show the seat map image /pack/seatmap.svg on the Tickets page next to the tiers. Read the tiers, prices and seats per tier from src/data/seatmap.json (server and client), and use those numbers as each tier\'s capacity for /api/availability.'
  }
}
