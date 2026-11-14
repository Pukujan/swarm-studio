// The Make box's two helpers, one source for the local and the hosted studio:
//
// - SHOWCASES: ready-made prompts that show the crew at its best. Each says what it runs
//   (the Auto job's input: prompt, games, pack, only, launch) and the short steps the crew will take.
// - GUIDES: the guided prompt for sites, apps and films, the same shape as the game interview
//   (QUESTIONS in engine/game.mjs): one question at a time, chips or your own words, and only the
//   questions the prompt has not answered. The answers go into the brief the person sees before
//   the build, so the result is this person's product, not a generic one.
// - STARTERS: a few short starting prompts per mode for the 💡 button.

// A prompt this short is vague (kept for callers that only want that test).
export const GRILL_WORDS = 12

// The guided prompt (docs/specs/06-onboarding.md, part 2): three to five questions per mode, one at
// a time, each answerable with one tap. `covers` is the words that already answer a question: a
// prompt that has them is not asked it. `sets` names a build setting the answer picks instead of
// words for the brief (the Website's Pictures answer sets that build's pictures).
const MOODS = 'moody|neon|warm|handmade|bold|loud|calm|premium|minimal\\w*|playful|dark|techy|editorial|elegant|retro|cosy|cozy|luxur\\w+|clean|bright|pastel|brutalist|vintage|modern|hype|funny|mysterious|cinematic|dreamy|gritty|serious|friendly'
// a prompt of a few words already says what the thing is
const SAYS_WHAT = '\\S+(\\s+\\S+){3,}'
export const GUIDES = {
  site: [
    { id: 'for', label: 'Purpose', q: 'What is it for?', chips: ['Bring in customers', 'Sell online', 'Take bookings', 'Show my work', 'Announce a launch', 'Gather a community'], covers: '\\b(sell\\w*|shop|store|book(ing|ings)?|reserv\\w+|orders?|portfolio|showcase|launch\\w*|announc\\w+|sign[- ]?ups?|tickets?|community|members?|donat\\w+|hire|leads?)\\b' },
    { id: 'who', label: 'Audience', q: 'Who is it for?', chips: ['Locals nearby', 'Young professionals', 'Families', 'Businesses', 'Gamers', 'Fans and members'], covers: '\\b(audience|aimed at|customers|clients|locals|families|kids|teens|students|parents|professionals|businesses|gamers|fans|members|collectors|runners|travell?ers|tourists|couples|founders|developers|designers|for (\\w+ ){0,2}(people|lovers|owners|teams|makers))\\b' },
    { id: 'mood', label: 'Mood', q: 'The mood?', chips: ['Warm and handmade', 'Bold and loud', 'Calm and premium', 'Playful', 'Dark and techy', 'Editorial'], covers: `\\b(${MOODS})\\b` },
    { id: 'pages', label: 'Pages', q: 'Which pages?', chips: ['One page', 'Home, About, Contact', 'Home, Menu, Booking', 'Home, Shop, About', 'Home, Work, Contact'], covers: '\\b(pages?|menu|booking|pricing|about|contact|gallery|blog|checkout|schedule|line-?up|faq|one[- ]pager?|landing)\\b' },
    { id: 'pictures', label: 'Pictures', q: 'Pictures?', chips: ['Painted', 'Stock photos', 'Drawn'], sets: 'pictures', covers: '\\b(photos?|photograph\\w*|pictures?|images?|illustrat\\w+|painted|drawn|svg)\\b' }
  ],
  app: [
    { id: 'do', label: 'People can', q: 'What do people do in it?', chips: ['Book a time', 'Order and pay', 'Track something', 'Sign up for events', 'Message each other', 'Manage a list'], covers: '\\b(book|order|track|sign up|message|chat|manage|sell|buy|schedul|vote|rsvp|check[- ]?in|log|plan|share|upload|review|rate|pay)\\w*' },
    { id: 'accounts', label: 'Accounts', q: 'Accounts?', chips: ['No accounts', 'Email sign-in', 'Guest pass'], covers: '\\b(accounts?|sign[- ]?in|log ?in|members?|guests?|profiles?)\\b' },
    { id: 'payments', label: 'Payments', q: 'Payments?', chips: ['No payments', 'Checkout, test mode', 'Subscriptions'], covers: '\\b(pay\\w*|checkout|stripe|subscriptions?|free|pric\\w+|tickets?|orders?|deposit)\\b' },
    { id: 'admin', label: 'The admin sees', q: 'What does the admin see?', chips: ['Orders', 'Bookings', 'Members', 'Nothing yet'], covers: '\\b(admin|dashboard|back ?office|staff|owner sees|reports?)\\b' }
  ],
  film: [
    { id: 'about', label: 'About', q: 'What is it about?', chips: ['A product', 'A place', 'A story', 'An event', 'A game'], covers: SAYS_WHAT },
    { id: 'feeling', label: 'Feeling', q: 'The feeling?', chips: ['Hype', 'Calm', 'Warm', 'Mysterious', 'Funny'], covers: `\\b(${MOODS})\\b` },
    { id: 'length', label: 'Length', q: 'How long?', chips: ['15 seconds', '30 seconds', '60 seconds'], covers: '\\b\\d+[- ]?(s|sec|secs|seconds?|min|mins|minutes?)\\b' },
    { id: 'sound', label: 'Sound', q: 'Voice or music?', chips: ['Music only', 'Voice and music', 'No sound'], covers: '\\b(music|voice\\w*|narrat\\w+|silent|sound\\w*|score|song)\\b' }
  ]
}
// the first guide is the old export's name: the hosted studio and older callers read `questions`
export const BRIEF_QUESTIONS = GUIDES.site

// The Pictures chips and the build setting each one picks (engine/setup.mjs PICTURES)
export const PICTURE_CHIPS = { Painted: 'painted', 'Stock photos': 'stock', Drawn: 'drawn' }

// The questions a prompt has not answered yet, in order. A full prompt gets none and builds at once.
// A question that only picks a setting is never asked by itself: the setting's default stands.
export function pending(kind, prompt, guides = GUIDES) {
  const text = String(prompt || '')
  const left = (guides[kind] || []).filter(q => !(q.covers && new RegExp(q.covers, 'i').test(text)))
  return left.some(q => !q.sets) ? left : []
}

// What each showcase runs. `run` is the Auto job's input (engine/auto.mjs start()); `site` marks one
// the hosted studio can build too (it makes websites only). Steps are names, a few words each.
export const SHOWCASES = [
  {
    id: 'launch', kind: 'site', name: 'Full launch', icon: 'zap', site: true,
    prompt: 'Nightjar, a late-night ramen bar in Brooklyn open until 3am: a moody neon site with the menu, online orders for pickup, a small arcade game in its world, a promo film and launch posts.',
    run: { games: 'mini', launch: true },
    steps: ['Design', 'App', 'Games', 'Checkout', 'Film', 'Posts', 'Live']
  },
  {
    id: 'shop', kind: 'app', name: 'Shop with checkout', icon: 'code',
    prompt: 'Night Runner, a limited sneaker drop from a small running brand: a countdown, live stock per size, a checkout and an orders admin with a restock list.',
    run: { pack: 'commerce-drop', games: 'none', only: ['app', 'tools', 'data', 'checks', 'deploy'] },
    steps: ['Design', 'App', 'Stock', 'Checkout', 'Database', 'Live']
  },
  {
    id: 'game', kind: 'game', name: 'Action game', icon: 'game',
    // the big game mode decides how it is built (engine/auto.mjs bigGameAsk); this is only its prompt
    prompt: 'Emberfall, a fast top-down action roguelike: dash and slash through burning halls, pick a blessing after every room, and face the Ash Warden at the end.',
    run: { games: 'big', only: ['app', 'games', 'deploy'] },
    steps: ['Trial page', 'Game', 'Rooms', 'Boss', 'Live']
  },
  {
    id: 'event', kind: 'site', name: 'Festival tickets', icon: 'ticket', site: true,
    prompt: 'Low Tide, a two-day seaside music festival for 600 people: tiered tickets with a seat map, a QR check-in page for the door and a promo film.',
    run: { pack: 'events', games: 'none' },
    steps: ['Design', 'Tickets', 'Check-in', 'Film', 'Live']
  }
]

// What the hosted studio runs instead: the website only.
const SITE_STEPS = ['Plan', 'Design', 'Pages', 'Review']

export const isVague = (prompt, words = GRILL_WORDS) => String(prompt || '').trim().split(/\s+/).filter(Boolean).length < words

// The brief the person sees before the build starts: one short paragraph, the prompt and then each
// answer as "Label: answer." Nothing is written for a question left unanswered (its default is not
// put in the person's mouth), for "Surprise me", or for an answer that picks a setting (`sets`).
export function guideBrief(prompt, answers = {}, questions = GUIDES.site) {
  const base = String(prompt || '').trim()
  const said = questions
    .filter(q => !q.sets)
    .map(q => [q.label || q.q.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, ''), String(answers[q.id] || '').trim()])
    .filter(([, v]) => v && !/^(surprise me|nothing in particular)$/i.test(v))
    .map(([k, v]) => `${k}: ${v.replace(/[.\s]+$/, '')}.`)
  return [base && !/[.!?]$/.test(base) && said.length ? `${base}.` : base, ...said].filter(Boolean).join(' ')
}
// the build settings the answers picked: { pictures: 'stock' }
export function guideSets(answers = {}, questions = GUIDES.site) {
  const out = {}
  for (const q of questions) if (q.sets === 'pictures' && PICTURE_CHIPS[answers[q.id]]) out.pictures = PICTURE_CHIPS[answers[q.id]]
  return out
}

// The game interview's brief (its questions have no labels: their question text, without the aside).
export function grillBrief(prompt, answers = {}, questions = BRIEF_QUESTIONS) {
  const lines = questions
    .map(q => [q.label || q.q.replace(/\s*\(.*\)\s*$/, '').replace(/\?$/, ''), String(answers[q.id] || '').trim()])
    .filter(([, v]) => v && !/^(surprise me|nothing in particular)$/i.test(v))
    .map(([k, v]) => `- ${k}: ${v}`)
  const base = String(prompt || '').trim()
  return lines.length ? `${base}\n\nLocked with the person (build exactly this):\n${lines.join('\n')}` : base
}

// Starting prompts for the 💡 button, per mode: short on purpose, so the questions shape them.
export const STARTERS = {
  site: ['A neighbourhood bakery', 'A portfolio for a photographer', 'A weekend music festival'],
  app: ['A booking app for a barber shop', 'A habit tracker for a running club', 'A sign-up sheet for a school fair'],
  film: ['A promo for a coffee roaster', 'A teaser for a rooftop concert', 'A launch film for a sneaker drop'],
  // named by what the person gets (spec 27: Meshy is opt-in, so only the 3D one names it)
  game: ['A 2D game that plays in the browser, with painted sprites', 'A 3D game with characters made in Meshy', 'A top-down strategy game from the strategy starter', 'A side-view platformer from the platformer starter'],
  brand: ['A brand for a small coffee roaster', 'A brand for a yoga studio', 'A brand for a children\'s bookshop']
}

// The Make box asks for this once: the showcases (for the hosted studio, the ones it can build,
// as websites) and the interview.
export function intake({ hosted = false } = {}) {
  const showcases = SHOWCASES
    .filter(s => !hosted || s.site)
    .map(({ id, kind, name, icon, prompt, run, steps }) => ({ id, kind, name, icon, prompt, steps: hosted ? SITE_STEPS : steps, ...(hosted ? {} : { run }) }))
  // the hosted studio makes websites only
  const guides = hosted ? { site: GUIDES.site.filter(q => !q.sets) } : GUIDES
  const starters = hosted ? { site: STARTERS.site } : STARTERS
  return { showcases, guides, starters, questions: guides.site, words: GRILL_WORDS }
}
