import { readFileSync } from 'node:fs'
import { join } from 'node:path'
// The press kit: a fact sheet as JSON and Markdown, from the intake and the brief.
export async function run({ intake, prompt, runDir, write }) {
  // the name the prompt opens with ("Tidebreak — …"), else the planner's site title, else the first capitalised word
  let planTitle = ''
  try { planTitle = JSON.parse(readFileSync(join(runDir, 'plan.json'), 'utf8')).pages?.[0]?.title || '' } catch {}
  const title = (String(prompt).match(/^\s*([A-Z][\w' -]{1,40}?)\s*[—:-]/) || [])[1] || planTitle.split(/\s[—:-]\s/)[0] || (String(prompt).match(/\b([A-Z][a-z]{3,})\b/) || [])[1] || 'Untitled game'
  const fact = {
    title, developer: intake.studio, genre: intake.genre, platforms: intake.platforms, release: intake.release, price: intake.price,
    pitch: String(prompt).replace(/^[^—:-]+[—:-]\s*/, '').split(/(?<=\.)\s/)[0].slice(0, 280),
    contact: 'press@example.com', assets: ['/press/logo.png', '/press/key-art.png', '/press/screenshots/'], made: new Date().toISOString().slice(0, 10)
  }
  const md = `# ${fact.title}: press kit\n\n${fact.pitch}\n\n| | |\n|---|---|\n| Developer | ${fact.developer} |\n| Genre | ${fact.genre} |\n| Platforms | ${fact.platforms} |\n| Release | ${fact.release} |\n| Price | ${fact.price} |\n| Press contact | ${fact.contact} |\n`
  const files = [write('public/press/factsheet.json', fact), write('public/press/factsheet.md', md)]
  return {
    files,
    note: `fact sheet for ${fact.title}`,
    ask: 'On the Press page, show the fact sheet from /press/factsheet.json as a clean table, a grid of the site\'s best generated images as screenshots and key art (each with a download link), and "Download fact sheet" linking /press/factsheet.md.'
  }
}
