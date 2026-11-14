// The scenarios a machine can check today, the ones whose Gate is a ui-audit check (breadcrumb, loading, axe,
// console, scroll), bound to the screens Projects, the Overview, the Design deck and the Studio scaffold (#461).
// Each binding names its scenario as tests/bdd/gen.mjs does, "<screen> › <requirement> › <scenario>", and its
// steps' words are read from the spec, so a reworded spec stays bound and a renamed or removed scenario fails.
//
// They run in the current Studio (/) and in the next UI (/next/, a moved screen only: tools/dev/bdd.config.mjs),
// on the throwaway Studio the audit uses. A check that fails where the audit already knows it fails
// (.ui-audit-known-violations.json, .next.json for /next/) passes with a "known" note, as in the audit: the spec
// is the target, the known list is where the code is.
import { bind, at, atBoth, crumbIs, loading, clean, noSideways, oneRow, trail, toHome, projectsHeld, boardHeld } from '../kit.mjs'

// scenario → its When and its Then
const BIND = {
  'projects › Breadcrumb › Projects at rest': [at('projects', 1440), crumbIs(['Home', 'Projects'])],
  'projects › Loading › First load': [at('projects', 1440, projectsHeld), loading('four skeleton cards, no empty line', d => d.waitCards < 4 ? `${d.waitCards} skeleton cards showed while the list was held, not four` : d.nothingHere ? 'a "nothing here" line showed while the list was held' : null)],
  'projects › Accessible and console-clean › axe at both widths': [atBoth('projects'), clean({ console: false })],
  'projects › Accessible and console-clean › No errors': [at('projects', 1440), clean({ axe: false })],
  'projects › 390 px › No sideways scroll': [at('projects', 390), noSideways],
  'overview › Breadcrumb › At rest': [at('overview', 1440), crumbIs(trail('Alpha Tea', 'Overview'))],
  'overview › Breadcrumb › At 390': [at('overview', 390), toHome('Alpha Tea', 'Overview')],
  // what is held is the board's own request (/api/runs/<id>/board, in both Studios), with the event stream. Holding
  // only /events held nothing the board waits for: the skeletons were up for the 42 to 55 ms the board took to
  // answer, less than one 50 ms look of the watch, so now and then it saw none (bdd on main, twice)
  'overview › Loading › The board loading': [at('overview', 1440, boardHeld), loading('three site skeletons', d => d.siteSkeletons < 3 ? `${d.siteSkeletons} page skeletons showed in the Site section while the board was held, not three` : null)],
  'overview › Accessible and console-clean › axe and console': [atBoth('overview'), clean()],
  'overview › 390 px › No sideways scroll': [at('overview', 390), noSideways],
  'design-deck › Breadcrumb › At rest': [at('design-deck', 1440), crumbIs(trail('Alpha Tea', 'Design deck'))],
  'design-deck › Breadcrumb › At 390': [at('design-deck', 390), crumbIs(trail('Alpha Tea', 'Design deck'))],
  'design-deck › Loading › Opening a version': [at('design-deck', 1440, p => /^\/api\/(models|auto|work)\b/.test(p) || p.endsWith('/events')), loading('busy and not Ready', d => !d.busy ? 'no skeleton or busy marker showed while the build was held' : d.ready ? 'the status pill read Ready before the build had loaded' : null)],
  'design-deck › Accessible and console-clean › axe and console': [atBoth('design-deck'), clean()],
  'design-deck › 390 px › No sideways scroll': [at('design-deck', 390), noSideways],
  'studio › Breadcrumb › The scaffold at rest': [at('studio', 1440), crumbIs(trail('Cedar Cafe', 'Studio'))],
  'studio › Loading › First load': [at('studio', 1440, p => p.startsWith('/api/studio/')), loading('a waiting card', d => !d.busy ? 'no waiting card showed while the scaffold was held' : null)],
  'studio › Accessible and console-clean › axe and console': [atBoth('studio'), clean()],
  'studio › 390 px › No sideways scroll': [at('studio', 390), noSideways],
  'brand-sheet › Breadcrumb › Opened from the Studio': [at('brand-sheet', 1440), crumbIs(trail('Cedar Cafe', 'Brand sheet'))],
  'brand-sheet › Loading › Options being made': [at('brand-sheet', 1440, p => /^\/api\/projects\/[^/]+\/brand$/.test(p)), loading('story, palette and type skeletons, Hermia on the first', d => !d.busy ? 'no busy marker showed while the brand was held' : d.brandParts < 3 ? `${d.brandParts} of Story, Palette and Type showed skeletons while the brand was held, not all three` : !d.hermiaOnStory ? "Hermia's cursor was not on the first Story card" : null)],
  'brand-sheet › Accessible and console-clean › axe and console': [atBoth('brand-sheet'), clean()],
  'brand-sheet › 390 px › No sideways scroll': [at('brand-sheet', 390), noSideways],
  'brand-sheet › 390 px › The breadcrumb at 390': [at('brand-sheet', 390), toHome('Cedar Cafe', 'Brand sheet')],
  'plan-board › Breadcrumb › A new game talk': [at('plan-board', 1440), crumbIs(trail('New game', 'Plan'))],
  'plan-board › Loading › A game talk starting': [at('plan-board', 1440, p => p.startsWith('/api/talk')), loading('three waiting cards in Plan', d => d.planCards < 3 ? `${d.planCards} waiting cards showed in the Plan section while the talk was held, not three` : null)],
  'plan-board › Accessible and console-clean › axe and console': [atBoth('plan-board'), clean()],
  'plan-board › 390 px › No sideways scroll': [at('plan-board', 390), noSideways],
  'plan-board › 390 px › The breadcrumb at 390': [at('plan-board', 390), toHome('New game', 'Plan')],
  'make › 390 px › The box at 390': [at('projects', 390), oneRow]
}

bind(BIND)
