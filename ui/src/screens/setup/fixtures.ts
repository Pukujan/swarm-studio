// What the server answers in the sheets' stories: one install with a signed-in provider, the shapes of
// server/setup.mjs and the parts routes. No key value anywhere: /api/setup/parts says only whether each is set.
import type { ModelTest, Options, SetupView } from './types'

export const TEST_OK: ModelTest = { ok: true, planner: { ok: true }, worker: { ok: true } }
export const TEST_FAILED: ModelTest = {
  ok: false,
  planner: { ok: false, error: 'HTTP 402: insufficient_quota. You exceeded your current quota, please check your plan and billing details.' },
  worker: { ok: true },
  problem: { line: 'Your model account is out of credit.', fix: 'hermes' }
}

export const VIEW: SetupView = {
  seen: true,
  modelsOk: true,
  test: TEST_OK,
  models: { planner: { model: 'openai/gpt-5' }, worker: { model: 'openai/gpt-5-mini' }, media: { model: 'google/gemini-2.5-flash', takes: 'hears and watches clips' } },
  pictures: { mode: 'stock', painted: { model: 'gpt-image-1', provider: 'openai', ready: true } },
  account: { connected: true, name: 'Pat Kim', handle: 'pk' }
}

export const OPTIONS: Options = {
  ok: true,
  providers: [
    { slug: 'openai', name: 'OpenAI', signedIn: true, current: true, models: ['gpt-5', 'gpt-5-mini', 'gpt-5-nano', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini', 'o3', 'gpt-4o', 'gpt-4o-mini', 'o3-pro'] },
    { slug: 'openrouter', name: 'OpenRouter', signedIn: true, models: ['anthropic/claude-sonnet-5.5', 'google/gemini-2.5-pro', 'qwen/qwen3-coder'] },
    { slug: 'anthropic', name: 'Anthropic', signedIn: false, models: [], sign: 'key' },
    { slug: 'nous', name: 'Nous Portal', signedIn: false, models: [], sign: 'oauth' }
  ],
  slots: { planner: { provider: 'openai', model: 'gpt-5' }, worker: { provider: 'openai', model: 'gpt-5-mini' } },
  signing: null
}

// the facts Parts reads (web/setup-parts.js's header): Godot missing, Stripe on a live key, Pexels set
const LOCAL = {
  keys: { SWARM_STUDIO_API_KEY: false, ELEVENLABS_API_KEY: false, CKFF_API_KEY: false, MESHY_API_KEY: false, PEXELS_API_KEY: true, SUPABASE_URL: false, SUPABASE_SERVICE_ROLE_KEY: false, STRIPE_SECRET_KEY: true, RESEND_API_KEY: false, VERCEL_TOKEN: false, CLOUDFLARE_API_TOKEN: false },
  stripe: 'live', godot: false, chrome: true, ffmpeg: 'pinned', renderer: true, voice: false, appEngine: false
}

export const ROUTES: Record<string, unknown> = {
  'GET /api/setup': VIEW,
  'POST /api/setup': VIEW,
  'POST /api/setup/models': TEST_OK,
  'GET /api/setup/models/options': OPTIONS,
  'GET /api/setup/parts': LOCAL,
  'GET /api/hermes': { attached: true },
  'GET /api/models': { roles: { planner: { model: 'gpt-5' }, worker: { model: 'gpt-5-mini' }, reviewer: { model: '', picked: null } }, lite: null },
  'POST /api/models': { ok: true },
  'GET /api/media': { music: { on: false }, clips: { on: true, by: 'Veo' } },
  'GET /api/publish': { github: 'pk', vercel: null, cloudflare: null },
  'GET /api/connectors': { supabase: { installed: false } },
  'POST /api/connectors/connect': { confirm: "Add Hermes's Supabase connector? This runs: hermes mcp install supabase" },
  'GET /api/gateway': { platforms: {} },
  'GET /api/me': { name: 'Pat Kim', handle: 'pk' }
}
