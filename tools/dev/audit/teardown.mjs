// After `npm run --prefix tools/dev audit:update`: what every screen found becomes .ui-audit-known-violations.json
// (tools/dev/audit/audit.spec.mjs writes one file per screen and width into test-results/audit-found on every run).
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const FOUND_DIR = `${ROOT}test-results/audit-found`

export default function teardown() {
  if (!process.env.AUDIT_UPDATE || !existsSync(FOUND_DIR)) return
  const all = readdirSync(FOUND_DIR).flatMap(f => JSON.parse(readFileSync(`${FOUND_DIR}/${f}`, 'utf8')))
  all.sort((a, b) => a.key.localeCompare(b.key))
  writeFileSync(`${ROOT}.ui-audit-known-violations.json`, JSON.stringify(all, null, 2) + '\n')
  rmSync(FOUND_DIR, { recursive: true, force: true })
  console.log(`.ui-audit-known-violations.json: ${all.length} known violations`)
}
