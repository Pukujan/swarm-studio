// @ts-check
// Setup › Parts: every part a build can use, grouped by what the person makes. One row per part: what it
// is for, what powers it, what stops without it, its live state and the one fix. Every line comes from an
// engine page (docs/engines/): hermes-and-connections.md, dyad.md, godot.md, meshy.md, video.md,
// sound.md, open-design.md. Nothing here holds or shows a key: a key's fix is the command with
// `<your key>` in it, run in Hermes, so the key stays in Hermes's secret store (catalog rule 11).
//
// A state is { st, why }: 'ok' working, 'later' installs on first use, 'off' not set up, 'fail' set up
// but not working, 'wait' still asking. `F` is what the sheet has fetched:
//   view  GET /api/setup            hermes  GET /api/hermes     models  GET /api/models
//   local GET /api/setup/parts      media   GET /api/media      publish GET /api/publish
//   conn  GET /api/connectors       gateway GET /api/gateway

// a key in Hermes's secret store: the launcher hands it to the studio when the studio starts (launcher.py)
const key = name => ({ cmd: `hermes config set ${name} <your key>`, note: 'Swarm Studio reads it when it next starts.' })
// a model provider signed in with a key (Setup › Models › More providers): Hermes asks for the key itself, hidden,
// so it is on no command line and never reaches the studio (hermes_cli/auth_commands.py _add_api_key_credential)
/** @param {string} slug */
export const keyCommand = slug => `hermes auth add ${slug} --type api-key`
const has = (F, name) => F.local ? !!F.local.keys?.[name] : undefined
const wait = { st: 'wait', why: '' }
const ok = (why = '') => ({ st: 'ok', why })
const off = (why = 'Not set up') => ({ st: 'off', why })
const fail = why => ({ st: 'fail', why })

const testOf = (F, role) => {
  const t = F.view?.test
  if (!F.view || t === undefined || t === null) return wait
  const r = t[role]
  return r?.ok ? ok(String(F.view.models?.[role]?.model || '').replace(/^[a-z]+\//, '')) : fail(t.problem?.line || 'The model did not answer.')
}

/** @type {{ k: string, name: string, parts: any[] }[]} */
export const GROUPS = [
  {
    k: 'every', name: 'Every build', parts: [
      { k: 'hermes', name: 'Hermes', need: true, for: 'Runs every model call, picture and clip.', by: 'Hermes open: Desktop, the gateway or a chat', without: 'Nothing builds.',
        state: F => !F.hermes ? wait : F.hermes.attached ? ok('Open') : fail('Hermes is not open.'),
        fix: () => ({ note: 'Open Hermes Desktop or start a Hermes chat.' }) },
      { k: 'planner', name: 'Planner', need: true, for: 'Plans the pages, the design system and the slides.', by: 'Hermes model slot swarm_studio_planner', without: 'No build starts.', goes: 'The model provider you picked: your prompt and the plan',
        state: F => testOf(F, 'planner'), fix: () => ({ row: 'models', label: 'Pick a model' }) },
      { k: 'builders', name: 'Builders', need: true, for: 'Write every section, app screen and game system.', by: 'Hermes model slot swarm_studio_builder', without: 'Nothing is built.', goes: 'The model provider you picked: the plan and the code',
        state: F => testOf(F, 'worker'), fix: () => ({ row: 'models', label: 'Pick a model' }) },
      { k: 'reviewer', name: 'Reviewer', need: false, for: 'Looks at screenshots after a build and sends fixes.', by: 'Hermes model slot swarm_studio_reviewer, a model that sees pictures', without: 'No review pass after a build.', goes: 'The model provider you picked: page screenshots',
        state: F => { const r = F.models?.roles?.reviewer; return !F.models ? wait : r?.picked === 'off' ? off('Turned off') : r?.model && r.model !== 'reviewer' /* no model: the role's own name */ ? ok(r.model) : off('No model') },
        fix: () => ({ cmd: 'hermes config set auxiliary.swarm_studio_reviewer.model <vision model>' }) },
      { k: 'pictures', name: 'Pictures', need: false, for: 'Paints photos and art into pages, slides and games.', by: "Hermes's image_generate tool (its provider is set with hermes tools), or CKFF_API_KEY", without: 'Builds use stock photos or drawn SVG.', goes: 'The image provider you picked: picture prompts',
        state: F => {
          const p = F.view?.pictures
          if (!p) return wait
          if (p.mode === 'stock') return ok('Stock photos')
          if (p.mode === 'drawn') return ok('Drawn')
          return p.painted?.ready ? ok(p.painted.model || 'Painted') : fail(p.painted?.error || 'No image model is signed in.')
        },
        fix: () => ({ cmd: 'hermes tools', row: 'pictures', label: 'Use stock photos' }) }
    ]
  },
  {
    k: 'website', name: 'Website', parts: [
      { k: 'standin', name: 'Stand-in photos', need: false, for: 'Real photos while pictures are painted, or instead of them.', by: 'Openverse and the built-in library; Pexels with PEXELS_API_KEY', without: 'Only Openverse and the built-in library.', goes: 'Openverse and Pexels: words from a picture prompt',
        state: F => has(F, 'PEXELS_API_KEY') === undefined ? wait : has(F, 'PEXELS_API_KEY') ? ok('Pexels') : off('Openverse only'), fix: () => key('PEXELS_API_KEY') }
    ]
  },
  {
    k: 'app', name: 'App', parts: [
      { k: 'appengine', name: 'App engine', need: true, for: 'Builds a working app: screens, server routes, an admin page.', by: 'Dyad, inside the plugin. The first app build installs about 1.5 GB', without: 'No apps.',
        state: F => !F.local ? wait : F.local.appEngine ? ok('Installed') : { st: 'later', why: 'Installs on the first app build' }, fix: () => null },
      { k: 'supabase', name: 'Data and sign-in', need: false, for: "Keeps an app's data and sign-ins in your own Supabase project.", by: "Hermes's Supabase connector (MCP), or SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY", without: "Data stays in the app's own store on this computer.", goes: "Your own Supabase project: an app's data",
        state: F => {
          if (!F.local || !F.conn) return wait
          if (has(F, 'SUPABASE_URL') && has(F, 'SUPABASE_SERVICE_ROLE_KEY')) return ok('Keys in Hermes')
          const c = F.conn.supabase || {}
          if (c.signingIn) return { st: 'wait', why: 'Finish in your browser' }
          if (c.installed && !c.allowed) return fail('Not allowed for Swarm Studio yet.')
          if (c.installed && c.signed_in) return ok('Hermes connector')
          return off()
        },
        fix: F => { const c = F.conn?.supabase || {}; return c.installed && !c.allowed && c.allow ? { cmd: c.allow, note: 'Swarm Studio never sets this itself.' } : c.authUrl ? { link: c.authUrl, label: 'Open sign-in' } : { connect: 'supabase', label: 'Connect' } } },
      { k: 'stripe', name: 'Payments', need: false, for: 'A real Stripe checkout in test mode.', by: 'STRIPE_SECRET_KEY, a test key (sk_test_ or rk_test_)', without: 'A demo checkout marked DEMO (card 4242).',
        state: F => !F.local ? wait : F.local.stripe === 'test' ? ok('Test key') : F.local.stripe === 'live' ? fail('A live key is refused. Use a test key.') : off(), fix: () => key('STRIPE_SECRET_KEY') },
      { k: 'resend', name: 'Email', need: false, for: 'Sends sign-in links and receipts from an app that chose Resend.', by: 'RESEND_API_KEY', without: "Emails go to the app's Outbox screen.",
        state: F => has(F, 'RESEND_API_KEY') === undefined ? wait : has(F, 'RESEND_API_KEY') ? ok('Key in Hermes') : off(), fix: () => key('RESEND_API_KEY') }
    ]
  },
  {
    k: 'game', name: 'Game', parts: [
      { k: 'godot', name: 'Godot 4', need: false, for: 'Builds the game as a Godot project and exports it for the web.', by: 'The Godot 4 program on this computer, on PATH as godot', without: 'Games are built for the browser (three.js or PixiJS).',
        state: F => !F.local ? wait : F.local.godot ? ok('Found') : off('Not found'),
        fix: () => ({ link: 'https://godotengine.org/download', label: 'Get Godot', note: 'Put it on PATH as godot. Swarm Studio finds it when it next starts.' }) },
      { k: 'meshy', name: '3D characters', need: false, for: 'Turns painted characters into rigged 3D models. Asks before it spends credits.', by: 'Meshy, with MESHY_API_KEY', without: 'Characters stay 2D painted sprites.', goes: 'Meshy: the picture a 3D character is made from',
        state: F => has(F, 'MESHY_API_KEY') === undefined ? wait : has(F, 'MESHY_API_KEY') ? ok('Key in Hermes') : off(), fix: () => key('MESHY_API_KEY') }
    ]
  },
  {
    k: 'video', name: 'Video', parts: [
      { k: 'renderer', name: 'Film renderer', need: true, for: 'Turns the storyboard into an MP4.', by: 'HyperFrames, Chrome and ffmpeg. The first film installs them', without: 'No films.',
        state: F => !F.local ? wait : F.local.renderer ? ok('Installed') : { st: 'later', why: 'Installs with the first film' }, fix: () => null },
      { k: 'voice', name: 'Voice-over', need: false, for: 'Reads the narration.', by: 'Kokoro, a voice model that runs on this computer. The first narrated film installs it', without: 'Films have no narration.',
        state: F => !F.local ? wait : F.local.voice ? ok('Installed') : { st: 'later', why: 'Installs with the first narrated film' }, fix: () => null },
      { k: 'music', name: 'Music and sound effects', need: false, for: 'Scores the film to its cuts.', by: "ElevenLabs: Hermes's ElevenLabs connector (MCP) or ELEVENLABS_API_KEY", without: 'The studio writes its own score.', goes: 'ElevenLabs: the music prompt and cue sheet',
        state: F => { const m = F.media?.music; return !m ? wait : m.on ? ok(m.by) : m.grant ? fail('Connector not allowed for Swarm Studio yet.') : off('Studio score') },
        fix: F => { const m = F.media?.music; return m?.grant && m.allow ? { cmd: m.allow, note: 'Swarm Studio never sets this itself.' } : key('ELEVENLABS_API_KEY') } },
      { k: 'clips', name: 'Moving clips', need: false, for: 'Animates a few painted stills into short clips.', by: "Hermes's video_generate tool (its provider is set with hermes tools)", without: 'Camera moves over still pictures.', goes: 'The video provider you picked: film prompts and stills',
        state: F => { const c = F.media?.clips; return !c ? wait : c.on ? ok(c.by) : off('Camera moves') }, fix: () => ({ cmd: 'hermes tools' }) }
    ]
  },
  {
    k: 'brand', name: 'Brand', parts: [
      { k: 'looks', name: 'Looks and fonts', need: true, for: 'The colours, fonts and shapes a brand sheet starts from.', by: 'Design systems inside the plugin, from Open Design', without: '',
        state: () => ok('Built in'), fix: () => null }
    ]
  },
  {
    k: 'deck', name: 'Deck', parts: [
      { k: 'pdf', name: 'PDF export', need: false, for: 'Prints a deck to PDF, one page a slide.', by: 'Chrome on this computer, run without a window', without: 'Decks export as HTML only.',
        state: F => !F.local ? wait : F.local.chrome ? ok('Chrome found') : off('No Chrome found'), fix: () => ({ link: 'https://www.google.com/chrome/', label: 'Get Chrome' }) }
    ]
  },
  {
    k: 'publish', name: 'Publishing', parts: [
      { k: 'github', name: 'GitHub Pages', need: false, for: 'Publishes a site from a public repo.', by: 'The gh command, signed in', without: 'Publish to another host, or this computer.', goes: 'GitHub Pages: the site you publish, in a public repo',
        state: F => !F.publish ? wait : F.publish.github ? ok(String(F.publish.github)) : off(), fix: () => ({ cmd: 'gh auth login' }) },
      { k: 'vercel', name: 'Vercel', need: false, for: 'Publishes a site or deploys an app.', by: 'VERCEL_TOKEN, or a token added in Publish', without: 'Publish to another host, or this computer.', goes: 'Vercel: the site or app you publish',
        state: F => !F.publish || !F.local ? wait : F.publish.vercel ? ok(F.publish.vercel.user || 'Connected') : has(F, 'VERCEL_TOKEN') ? ok('Token in Hermes') : off(), fix: () => key('VERCEL_TOKEN') },
      { k: 'cloudflare', name: 'Cloudflare Pages', need: false, for: 'Publishes a site.', by: 'CLOUDFLARE_API_TOKEN, or a token added in Publish', without: 'Publish to another host, or this computer.', goes: 'Cloudflare Pages: the site you publish',
        state: F => !F.publish || !F.local ? wait : F.publish.cloudflare ? ok(F.publish.cloudflare.user || 'Connected') : has(F, 'CLOUDFLARE_API_TOKEN') ? ok('Token in Hermes') : off(), fix: () => key('CLOUDFLARE_API_TOKEN') },
      { k: 'gateway', name: 'Launch posts', need: false, for: 'Sends one launch post you confirm to Discord, Slack or Telegram.', by: "Hermes's messaging gateway", without: 'You copy the post by hand.', goes: 'The channels you set up in Hermes: launch posts you send',
        state: F => { const p = F.gateway?.platforms; if (!F.gateway) return wait; const n = Array.isArray(p) ? p.map(x => x?.name || x) : Object.keys(p || {}); return n.length ? ok(n.join(', ')) : off() },
        fix: () => ({ note: "Set up a channel in Hermes's gateway." }) }
    ]
  },
  {
    k: 'feed', name: 'Feed', parts: [
      { k: 'account', name: 'Swarm Feed account', need: false, for: 'Posts builds to Swarm Feed, where others remix them.', by: 'Sign in with Google, GitHub or Discord', without: 'Post to Feed stops; building and publishing still work.', goes: 'Swarm Feed: an install id on connect, then only the builds you post',
        state: F => {
          const a = F.view?.account
          if (!a) return wait
          if (a.pending) return { st: 'wait', why: 'Finish in your browser' }
          return a.connected ? (a.guest ? fail('A guest profile.') : ok(a.handle ? `@${a.handle}` : a.name || 'Signed in')) : off('Skipped')
        },
        fix: () => ({ row: 'account', label: 'Sign in' }) }
    ]
  }
]

// every part with its state, and a group's count of parts that work
export const statesOf = (F, g) => g.parts.map(p => ({ p, s: p.state(F) }))
export const tally = rows => ({ ok: rows.filter(r => r.s.st === 'ok' || r.s.st === 'later').length, all: rows.length, bad: rows.some(r => r.s.st === 'fail') })
