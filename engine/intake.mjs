// The Make box's two helpers, one source for the local and the hosted studio:
//
// - SHOWCASES: ready-made prompts that show the crew at its best. Each says what it runs
//   (the Auto job's input: prompt, games, pack, only, launch) and the short steps the crew will take.
// - BRIEF_QUESTIONS: the "grill me" interview for sites, apps and films, the same shape as the
//   game interview (QUESTIONS in engine/game.mjs): one question at a time, chips or your own words.
//   The locked answers go into the brief, so the result is this person's product, not a generic one.

// A prompt this short is vague: the crew asks before it builds.
export const GRILL_WORDS = 12

export const BRIEF_QUESTIONS = [
  { id: 'name', label: 'Name', q: 'What is it called?', chips: ['Surprise me'], free: true },
  { id: 'who', label: 'Audience', q: 'Who is it for?', chips: ['Locals nearby', 'Young professionals', 'Families', 'Businesses', 'Gamers', 'Fans and members'], free: true },
  { id: 'must', label: 'Must work on day one', q: 'What must work on day one?', chips: ['Booking', 'Orders and checkout', 'Sign-ups and accounts', 'Events and tickets', 'A members area', 'A contact form'], free: true },
  { id: 'look', label: 'Look and tone', q: 'Look and tone?', chips: ['Warm and handmade', 'Bold and loud', 'Calm and premium', 'Playful', 'Dark and techy', 'Editorial'], free: true },
  { id: 'win', label: 'Success looks like', q: 'What does success look like?', chips: ['More bookings', 'Sales on launch day', 'A growing mailing list', 'People share it', 'Fewer questions by email'], free: true }
]

// What each showcase runs. `run` is the Auto job's input (engine/auto.mjs start()); `site` marks one
// the hosted studio can build too (it makes websites only). Steps are names, a few words each.
export const SHOWCASES = [
  {
    id: 'launch', name: 'Full launch', icon: 'zap', site: true,
    prompt: 'Nightjar, a late-night ramen bar in Brooklyn open until 3am: a moody neon site with the menu, online orders for pickup, a small arcade game in its world, a promo film and launch posts.',
    run: { games: 'mini', launch: true },
    steps: ['Design', 'App', 'Games', 'Checkout', 'Film', 'Posts', 'Live']
  },
  {
    id: 'shop', name: 'Shop with checkout', icon: 'code',
    prompt: 'Night Runner, a limited sneaker drop from a small running brand: a countdown, live stock per size, a checkout and an orders admin with a restock list.',
    run: { pack: 'commerce-drop', games: 'none', only: ['app', 'tools', 'data', 'checks', 'deploy'] },
    steps: ['Design', 'App', 'Stock', 'Checkout', 'Database', 'Live']
  },
  {
    id: 'game', name: 'Action game', icon: 'game',
    // the big game mode decides how it is built (engine/auto.mjs bigGameAsk); this is only its prompt
    prompt: 'Emberfall, a fast top-down action roguelike: dash and slash through burning halls, pick a blessing after every room, and face the Ash Warden at the end.',
    run: { games: 'big', only: ['app', 'games', 'deploy'] },
    steps: ['Trial page', 'Game', 'Rooms', 'Boss', 'Live']
  },
  {
    id: 'event', name: 'Festival tickets', icon: 'ticket', site: true,
    prompt: 'Low Tide, a two-day seaside music festival for 600 people: tiered tickets with a seat map, a QR check-in page for the door and a promo film.',
    run: { pack: 'events', games: 'none' },
    steps: ['Design', 'Tickets', 'Check-in', 'Film', 'Live']
  }
]

// What the hosted studio runs instead: the website only.
const SITE_STEPS = ['Plan', 'Design', 'Pages', 'Review']

export const isVague = (prompt, words = GRILL_WORDS) => String(prompt || '').trim().split(/\s+/).filter(Boolean).length < words

// The brief with the locked answers. `questions` defaults to the site and app interview;
// the game interview's questions (no labels) use their question text.
export function grillBrief(prompt, answers = {}, questions = BRIEF_QUESTIONS) {
  const lines = questions
    .map(q => [q.label || q.q.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, ''), String(answers[q.id] || '').trim()])
    .filter(([, v]) => v && !/^(surprise me|nothing in particular)$/i.test(v))
    .map(([k, v]) => `- ${k}: ${v}`)
  const base = String(prompt || '').trim()
  return lines.length ? `${base}\n\nLocked with the person (build exactly this):\n${lines.join('\n')}` : base
}

// The Make box asks for this once: the showcases (for the hosted studio, the ones it can build,
// as websites) and the interview.
export function intake({ hosted = false } = {}) {
  const showcases = SHOWCASES
    .filter(s => !hosted || s.site)
    .map(({ id, name, icon, prompt, run, steps }) => ({ id, name, icon, prompt, steps: hosted ? SITE_STEPS : steps, ...(hosted ? {} : { run }) }))
  return { showcases, questions: BRIEF_QUESTIONS, words: GRILL_WORDS }
}
