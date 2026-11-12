// The film's director (spec 26): before anything is storyboarded, decide what kind
// of film this prompt and this build call for, and what happens in each act.
//
// A film is one of six kinds, each with its own grammar: its acts and their share
// of the runtime, how long a shot holds, what it opens and closes on, how much
// type it shows, how the camera and the music move. A model picks the kind and
// writes the acts for this build; rules pick when there is no model or its answer
// fails the check, so there is always a treatment.

import { streamChat } from './llm.mjs'

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

// closing: cta (the invitation card), title (a black card with the name), hit (the name on the
// last hit), signature (the name small over the last picture), line (the person's last line, the
// name under it). typeMax / proofMin are shares of the runtime.
export const FILM_KINDS = {
  demo: {
    label: 'Product demo', pace: 'medium', seconds: 28, max: 45, voice: 'may', closing: 'cta', typeMax: 0.5, proofMin: 0.25,
    when: 'the prompt wants to show what it is, how it works or what is on offer; an ad; the default for a site or an app',
    acts: [
      { name: 'hook', share: 0.15, shot: [2, 4], layers: 'story or type', cue: 'pulse', does: 'the problem or the promise, in one picture or one line' },
      { name: 'at work', share: 0.45, shot: [2, 5], layers: 'proof', cue: 'full', does: 'the product itself in use: its footage and its own pictures, captions naming what is seen' },
      { name: 'what you get', share: 0.2, shot: [2.5, 4.5], layers: 'type or proof', cue: 'build', does: 'the offer in real numbers and names: a list, a stat or a split' },
      { name: 'invitation', share: 0.2, shot: [2.5, 4], layers: 'type', cue: 'resolve', does: 'the closing card: the name and the one action to take' },
    ],
    grammar: 'Open on the problem or the promise, never on a logo card. The middle is proof. Captions say what is on screen. Close on a cta beat with the name and one action.',
  },
  mood: {
    label: 'Mood piece', pace: 'calm', seconds: 34, max: 60, voice: false, closing: 'signature', typeMax: 0.2, proofMin: 0,
    when: 'the prompt asks for a feeling: calm, slow, quiet, dreamy, atmospheric, few or no words',
    acts: [
      { name: 'arrive', share: 0.25, shot: [5, 9], layers: 'story', cue: 'calm', does: 'one long picture with no words; the place before anything happens' },
      { name: 'dwell', share: 0.5, shot: [4, 8], layers: 'story', cue: 'calm', does: 'three or four long shots: a detail, hands, light, then wide again; at most one caption of one to three words' },
      { name: 'leave', share: 0.25, shot: [5, 9], layers: 'story', cue: 'resolve', does: 'the last picture held; the name small over it' },
    ],
    grammar: 'Only full-frame pictures (kind image) with slow moves (drift, push-in, pans, hold) and fade cuts. Open on a picture with an empty headline. No list, stat, quote, open or cta beats, and no black cards. Most beats have no caption at all. The last beat is a picture whose headline is the name.',
  },
  character: {
    label: 'Character story', pace: 'medium', seconds: 38, max: 60, voice: 'may', closing: 'line', typeMax: 0.4, proofMin: 0.1,
    when: 'the prompt follows one person (a customer, a hero, the maker): their story, their words, a portrait',
    acts: [
      { name: 'before', share: 0.25, shot: [3, 6], layers: 'story', cue: 'pulse', does: 'the person and their moment before: where they are, what is missing' },
      { name: 'the turn', share: 0.3, shot: [2.5, 5], layers: 'proof', cue: 'build', does: 'what they found: the build itself, seen through them' },
      { name: 'after', share: 0.3, shot: [3, 6], layers: 'story', cue: 'full', does: 'how it is now: the same person, changed' },
      { name: 'last line', share: 0.15, shot: [3, 5], layers: 'type', cue: 'resolve', does: 'their last line as a quote, the name under it' },
    ],
    grammar: 'One person all the way through; name them once. Captions are their own words in the first person (quote beats, or captions over pictures). Open on them, not on the brand. Close on a quote beat: their last line as the headline, the name as the kicker. No list, no cta.',
  },
  gameplay: {
    label: 'Gameplay trailer', pace: 'fast', seconds: 24, max: 36, voice: false, closing: 'title', typeMax: 0.35, proofMin: 0.4,
    when: 'the build is a game with real footage, or the prompt asks for a game trailer',
    acts: [
      { name: 'cold open', share: 0.15, shot: [2, 4], layers: 'proof', cue: 'pulse', does: 'footage straight away, no title: the game being played' },
      { name: 'the hook', share: 0.15, shot: [1, 2.5], layers: 'type then story', cue: 'hit', does: 'one title card that says what you do, then the hero' },
      { name: 'montage', share: 0.35, shot: [0.5, 1.4], layers: 'proof', cue: 'build', does: 'very short footage and pictures cut on the beat, each shorter than the last' },
      { name: 'stop', share: 0.07, shot: [0.8, 1.6], layers: 'type', cue: 'stop', does: 'black and silence' },
      { name: 'drop', share: 0.18, shot: [1.5, 4], layers: 'proof', cue: 'drop', does: 'the best footage, everything back at once' },
      { name: 'title', share: 0.1, shot: [2, 3], layers: 'type', cue: 'resolve', does: 'a black title card with the name' },
    ],
    grammar: 'The first beat is footage (kind clip) with a caption of at most three words. Footage fills at least 40% of the runtime; use each clip several times from different "from" points, sped up 2 to 8 times in the montage. Hard cuts, a flash on the hit and the drop. One black beat with music "stop" before the drop. Close on a title beat with the name, not a cta.',
  },
  music: {
    label: 'Music-led cut', pace: 'fast', seconds: 18, max: 26, voice: false, closing: 'hit', typeMax: 0.7, proofMin: 0,
    when: 'the prompt asks for a cut to the beat, kinetic type, a reel, hype, no talking',
    acts: [
      { name: 'intro', share: 0.2, shot: [0.8, 2], layers: 'type', cue: 'pulse', does: 'two or three type hits, one to three words each' },
      { name: 'build', share: 0.3, shot: [0.6, 1.5], layers: 'type and proof, alternating', cue: 'build', does: 'a picture, a word, a picture, a word, on every beat' },
      { name: 'drop', share: 0.35, shot: [0.45, 1.1], layers: 'proof and type', cue: 'drop', does: 'the fastest cuts of the film' },
      { name: 'last hit', share: 0.15, shot: [1.5, 3], layers: 'type', cue: 'hit', does: 'the name alone, on the last hit' },
    ],
    grammar: 'Every caption is one to three words; no sentences, no sub lines, no voice. Title cards and full-frame pictures alternate. Mark music "hit" on the beats that should land hardest and "drop" once. Hard cuts and flashes only. Close on a title beat that is just the name, with music "hit".',
  },
  announce: {
    label: 'Announcement', pace: 'medium', seconds: 18, max: 26, voice: 'may', closing: 'cta', typeMax: 0.6, proofMin: 0,
    when: 'there is news with a date, a place or a launch: an event, an opening, a release, a teaser for one',
    acts: [
      { name: 'the news', share: 0.3, shot: [1.5, 3.5], layers: 'type', cue: 'hit', does: 'the one fact first: what, when, where, as a title or a stat' },
      { name: 'why come', share: 0.4, shot: [1.5, 3.5], layers: 'story or proof', cue: 'full', does: 'two or three pictures of what it will be like' },
      { name: 'how to join', share: 0.3, shot: [2.5, 4], layers: 'type', cue: 'resolve', does: 'the closing card: the date or the action' },
    ],
    grammar: 'Short. The first beat states the news itself with its real date, place or number (a title or stat beat), not the brand alone. Close on a cta beat whose sub is the date or the action.',
  },
}
export const KIND_IDS = Object.keys(FILM_KINDS)

// The five plans (and the two newer templates) as starting points: where each leans.
export const PLAN_LEANS = { promo: 'demo', kinetic: 'music', slideshow: 'mood', teaser: 'announce', story: 'character', trailer: 'gameplay', calm: 'mood' }

const SIGNS = {
  gameplay: /gameplay|game ?play|trailer|boss|level|speedrun|playthrough/gi,
  mood: /\bcalm|\bslow|quiet|mood|dream|ambient|atmospher|lonely|gentle|serene|meditat|no words|few words|wordless|peaceful/gi,
  character: /\bstory\b|follow (one|a|her|him|them)|own words|\bportrait|customer'?s|in (her|his|their) voice|first-timer|why (she|he|they)|\bjourney/gi,
  music: /\bbeat\b|drums?\b|\breel\b|kinetic|rhythm|hype|punchy|big type|on the music|music video|no talking/gi,
  announce: /announc|launch|opens? on|save the date|tickets?\b|tell people|coming soon|teaser|release date|\b(january|february|march|april|may|june|july|august|september|october|november|december) \d|\d{4}-\d\d-\d\d/gi,
  demo: /how it works|\bdemo\b|\bad\b|advert|explain|show (how|what)|features|walk ?through|subscription|pricing|\bpromo\b/gi,
}
const GAME = /\bgame\b|gameplay|runner|roguelike|platformer|shooter|puzzle|arcade|boss/i

// What the build is, as far as a film cares.
export function buildFacts(c = {}) {
  const clips = c.clips || []
  const game = clips.some(x => GAME.test(`${x.what} ${x.label}`)) || GAME.test(c.brief || '')
  return { pictures: (c.images || []).length, clips: clips.length, game, footage: clips.reduce((a, x) => a + (x.seconds || 0), 0) }
}

const WORDS = { ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60 }
// A length the prompt asks for, in seconds, or null.
export function askedSeconds(prompt = '') {
  const m = String(prompt).match(/(\d{1,3})\s*-?\s*(?:s\b|secs?\b|seconds?\b)/i)
  if (m) return Math.min(90, Math.max(6, Number(m[1])))
  const w = String(prompt).toLowerCase().match(new RegExp(`\\b(${Object.keys(WORDS).join('|')})[ -]seconds?\\b`))
  if (w) return WORDS[w[1]]
  if (/\b(a|one) minute\b/i.test(prompt)) return 60
  return null
}
const wantsVoice = p => /narrat|voice ?over|\bvoice\b|own words|explain|spoken|tells? (it|us|the)/i.test(p) && !/no (voice|narrat|talking)|without (a )?(voice|narrat)/i.test(p)

// The kind by rules: what the prompt asks, then the plan the person picked, then what the build is.
export function pickKind(prompt = '', c = {}, template = '') {
  const facts = buildFacts(c), score = Object.fromEntries(KIND_IDS.map(k => [k, 0]))
  for (const k of KIND_IDS) score[k] += 2 * (String(prompt).match(SIGNS[k]) || []).length
  // a teaser of a game is a trailer; the other plans lean one way
  const lean = template === 'teaser' && facts.game && facts.clips ? 'gameplay' : PLAN_LEANS[template]
  if (lean) score[lean] += 1.5
  if (facts.game && facts.clips) score.gameplay += 1
  else score.demo += 0.5
  // a gameplay trailer needs footage of a game
  if (!facts.clips) score.gameplay = Math.min(score.gameplay, 0)
  const best = KIND_IDS.reduce((a, k) => (score[k] > score[a] ? k : a), 'demo')
  return { kind: best, score }
}

// A full treatment from a kind: the acts with their seconds, the pace, the voice, the closing.
export function treatment(kind, { prompt = '', c = {}, why = '', logline = '', intents = {}, seconds = null, voice = null, by = 'rules' } = {}) {
  const K = FILM_KINDS[kind] || FILM_KINDS.demo, id = FILM_KINDS[kind] ? kind : 'demo'
  const asked = askedSeconds(prompt)
  const total = asked || Math.min(K.max, Math.max(10, Number(seconds) || K.seconds))
  const speak = K.voice === false ? (wantsVoice(prompt) && id !== 'music') : voice === true || wantsVoice(prompt)
  return {
    kind: id, label: K.label, by,
    why: clip(why, 160), logline: clip(logline, 200) || clip(c.brief, 160),
    pace: K.pace, seconds: total, asked: !!asked, voice: !!speak, closing: K.closing, typeMax: K.typeMax, proofMin: K.proofMin,
    acts: K.acts.map(a => ({ name: a.name, seconds: Number((a.share * total).toFixed(1)), shot: a.shot, layers: a.layers, cue: a.cue, intent: clip(intents[a.name], 200) || a.does })),
  }
}

// Without a model.
export function directByRules(c, { prompt = '', template = '' } = {}) {
  const { kind, score } = pickKind(prompt, c, template)
  const signs = score[kind] >= 2 ? 'the prompt asks for it' : PLAN_LEANS[template] ? `the ${template} plan leans this way` : 'it suits this build'
  return treatment(kind, { prompt, c, why: signs })
}

export function directorPrompt(c, { prompt = '', template = '', notes = null } = {}) {
  const facts = buildFacts(c), lean = PLAN_LEANS[template]
  return [
    {
      role: 'system',
      content: `You are a film director. A team of AI agents just built something, and one person asked for a short film of it. Before anything is storyboarded you decide what kind of film this prompt and this build call for, and what happens in each act. Different prompts must give different kinds of film: do not default to a product demo.

Return JSON only:
{"kind":"${KIND_IDS.join('|')}","why":"one short sentence","logline":"one sentence: what this film is about, concretely","seconds":24,"voice":false,"acts":[{"name":"<the kind's act name>","intent":"one sentence: what we see and feel here, using this build's own people, places, pictures and footage"}]}

Kinds:
${KIND_IDS.map(k => `- ${k} (${FILM_KINDS[k].label}): ${FILM_KINDS[k].when}. Acts: ${FILM_KINDS[k].acts.map(a => a.name).join(', ')}. Usually ${FILM_KINDS[k].seconds} s.`).join('\n')}

Rules:
- The prompt decides. With an empty prompt, decide from the build: a game with footage is a gameplay trailer; an event with a date is an announcement; otherwise what its pictures and words suit best.
- gameplay needs real footage of a game in the build.
- mood and music are for a prompt or a plan that asks for them: never pick them when there is no prompt.
- "seconds" is the whole film: the length the prompt asks for, else the kind's usual.
- "voice" is true only when the prompt wants someone speaking.
- Write one act entry for every act of the kind you pick, in order, each about this build and nothing generic.`,
    },
    {
      role: 'user',
      content: `The person's prompt: ${prompt || '(none: your choice)'}
${lean ? `The plan they picked leans towards: ${lean} (${template}). The prompt can pull away from it.\n` : ''}${notes?.mood ? `Their style reference feels: ${clip(notes.mood, 120)}\n` : ''}
Brand: ${c.brand}
Brief: ${c.brief}
Art direction: ${c.theme?.direction || ''}
Pictures (${facts.pictures}): ${(c.images || []).slice(0, 10).map(i => clip(i.gen, 70)).join(' | ') || 'none'}
Footage (${facts.clips}): ${(c.clips || []).map(x => `${clip(x.what, 90)} (${Math.round(x.seconds)} s)`).join(' | ') || 'none'}

The build:
${clip(c.copy, 1800)}`,
    },
  ]
}

// The model's answer, made safe: an unknown kind, or a gameplay trailer with no footage, falls to the rules.
export function checkTreatment(raw = {}, c, { prompt = '', template = '' } = {}) {
  const facts = buildFacts(c)
  // with no prompt and no plan, a film still has to say what the build is: a mood piece or a music cut is the person's call
  if (!String(prompt).trim() && !PLAN_LEANS[template] && (raw?.kind === 'mood' || raw?.kind === 'music')) return { ...directByRules(c, { prompt, template }), fell: `the director wanted a ${FILM_KINDS[raw.kind].label.toLowerCase()} with no prompt asking for one` }
  if (!FILM_KINDS[raw?.kind] || (raw.kind === 'gameplay' && !facts.clips)) return { ...directByRules(c, { prompt, template }), fell: raw?.kind ? `the director asked for ${clip(raw.kind, 20)}, which this build cannot make` : 'the director gave no kind' }
  const intents = {}
  for (const a of Array.isArray(raw.acts) ? raw.acts : []) if (a?.name && a.intent) intents[String(a.name).toLowerCase().trim()] = a.intent
  return treatment(raw.kind, { prompt, c, why: raw.why, logline: raw.logline, intents, seconds: raw.seconds, voice: raw.voice === true, by: 'model' })
}

// The call. Never throws: any failure gives the rules' treatment, with the reason in `fell`.
export async function direct({ provider, model, c, prompt = '', template = '', notes = null, signal, chat = streamChat } = {}) {
  if (!model) return directByRules(c, { prompt, template })
  try {
    const res = await chat(provider, { trace: { kind: 'video' }, model, messages: directorPrompt(c, { prompt, template, notes }), maxTokens: 900, temperature: 0.6, extra: { reasoning_effort: 'none', reasoning: { enabled: false } }, signal })
    const s = res.text.indexOf('{'), e = res.text.lastIndexOf('}')
    if (s < 0 || e <= s) throw new Error('no JSON from the director')
    return checkTreatment(JSON.parse(res.text.slice(s, e + 1)), c, { prompt, template })
  } catch (err) {
    return { ...directByRules(c, { prompt, template }), fell: `no director this time: ${clip(err.message || err, 80)}` }
  }
}

// The treatment as the storyboard writer reads it.
export function treatmentText(film) {
  const K = FILM_KINDS[film.kind]
  return `The director's treatment (follow it; it replaces any habit of yours):
Kind of film: ${film.label}. ${film.logline}
Length: about ${film.seconds} seconds in all${film.asked ? ' (the person asked for this length)' : ''}. Pace: ${film.pace}. ${film.voice ? 'Someone speaks: "voice": true, with "say" lines.' : 'Nobody speaks: "voice": false and no "say" lines.'}
Acts, in this order:
${film.acts.map((a, i) => `${i + 1}. ${a.name} (about ${a.seconds} s; shots of ${a.shot[0]} to ${a.shot[1]} s; ${a.layers}; music "${a.cue}" from its first beat): ${a.intent}`).join('\n')}
The grammar of this kind: ${K.grammar}`
}
