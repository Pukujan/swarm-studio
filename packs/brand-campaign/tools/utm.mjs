// Tracked launch links: one per channel, with UTM tags, as a CSV for the team.
export async function run({ intake, write }) {
  const slug = String(intake.brand).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'launch'
  const channels = String(intake.channels).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 12)
  const medium = c => /email/i.test(c) ? 'email' : /discord|slack|telegram/i.test(c) ? 'community' : 'social'
  const rows = channels.map(c => {
    const src = c.toLowerCase().replace(/[^a-z0-9]+/g, '')
    return { channel: c, path: `/?utm_source=${src}&utm_medium=${medium(c)}&utm_campaign=${slug}`, source: src }
  })
  const csv = ['channel,source,medium,campaign,path', ...rows.map(r => `${r.channel},${r.source},${medium(r.channel)},${slug},${r.path}`)].join('\n')
  const files = [write('public/pack/utm-links.csv', csv), write('src/data/utm-links.json', { campaign: slug, links: rows })]
  return {
    files,
    note: `${rows.length} channels`,
    ask: 'Track launch links: on every page load, if the URL has utm_source, POST /api/visits { source, medium, campaign, path } once per session. GET /api/visits returns the counts per source. /admin shows a "Visits by source" table, and a /launch page (linked from /admin) lists the links from src/data/utm-links.json with the full URL (the current origin plus the path) and a copy button.'
  }
}
