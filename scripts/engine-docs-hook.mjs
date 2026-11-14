// A Claude Code UserPromptSubmit hook (.claude/settings.json): when a message names an engine, the session is
// told to read that engine's page in docs/engines/ before saying what the engine can or can't do. It can't
// check what the session then says; it puts the page in front of it every time. Owner, 2026-11-12: "do we not
// have anyhting forcing agents or you to read the docs before you guess about a dependency".
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const NAMES = {
  'dyad.md': /\bdyad\b|\bnitro\b|\bneon\b|full.?stack|admin panel|dashboard/i,
  'godot.md': /\bgodot\b|\bgdscript\b/i,
  'meshy.md': /\bmeshy\b|\b3d (model|character)/i,
  'video.md': /hyperframes?|remotion|revideo|motion canvas|theatre\.?js|\bvideo\b|\bfilm\b|trailer/i,
  'sound.md': /\bfish\b|elevenlabs|\bvoices?\b|\bmusic\b|\bsound\b/i,
  'open-design.md': /open.?design|\bscribble\b|\btweaks\b|html-ppt|\bdecks?\b/i,
  'hermes-and-connections.md': /\bhermes\b|supabase|stripe|resend|postiz|connector|\bckff\b/i
}

let prompt = ''
try { prompt = JSON.parse(readFileSync(0, 'utf8')).prompt || '' } catch {}
const hit = Object.entries(NAMES).filter(([f, re]) => re.test(prompt) && existsSync(join(root, 'docs/engines', f))).map(([f]) => join(root, 'docs/engines', f))
if (hit.length) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `This message names an engine. Before saying what it can or can't do, or adding code or a library around it, read: ${hit.join(', ')}. Cite the page or its sources in your answer. If the page doesn't cover it, say "not documented, unchecked" and check the engine's own code; never answer from memory.`
    }
  }))
}
