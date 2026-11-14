// A comment that is only about a section's picture ("better image pls", "generate instead", "a moodier photo").
// The builder used to rewrite the whole section for it, which changed the layout the person had. Such a comment
// now repaints the picture and leaves the section's HTML alone (server/server.mjs, commentNow).
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

const ABOUT = /\b(image|images|picture|pictures|photo|photos|photograph|pic|pics|img|illustration|artwork|shot)\b/i
// "generate instead", "regenerate", "repaint it": about the picture when the section has one
const VERB_ONLY = /^\s*(please\s+)?(re-?generate|generate|re-?paint|paint|re-?draw)\b(\s+(it|one|this|that|again|instead|a new one|another( one)?))*\s*(pls|please)?[.!]*\s*$/i
// words that ask for the layout or the markup to change: the builder's job, not the painter's
const LAYOUT = /\b(smaller|bigger|larger|wider|narrower|taller|shorter|move|left|right|above|below|under|beside|size|resize|crop|remove|delete|hide|align|centre|center|position|width|height|round|rounded|corner|corners|border|grid|column|columns|row|rows|layout|swap|replace .* with (text|a video)|add (a |an |another |more |two |three )|second|third|caption|text|heading|title|button|link)\b/i

export const pictureAsk = text => { const t = String(text || ''); return (ABOUT.test(t) || VERB_ONLY.test(t)) && !LAYOUT.test(t) }

// a short follow-up that names nothing ("much more better more impactful"): about the picture when the last
// comment on that section was a picture ask
export const vagueAsk = text => { const t = String(text || '').trim(); return !!t && t.split(/\s+/).length <= 8 && !LAYOUT.test(t) }

// the section's pictures the crew can repaint: each <img data-gen="…">'s description, in order
export const gensOf = html => [...new Set([...String(html || '').matchAll(/<img\b[^>]*\bdata-gen="([^"]{3,300})"/g)].map(m => m[1]))]

export function promptMessages({ gen, comment, role }) {
  return [
    { role: 'system', content: 'You write one prompt for an image model. A person asked for a different picture in a section of their website. Keep the subject and its place in the page unless they ask for another subject; change what they ask for. If they only ask for "better" or "more impact", make it bolder: a stronger composition, more dramatic light, more depth, one clear focal point. Describe the picture only: subject, composition, light, mood. No text in the picture, no logos, no brand names. Answer with the prompt alone, under 60 words.' },
    { role: 'user', content: `Section: ${clip(role, 60)}\nThe picture now: ${clip(gen, 300)}\nThe person said: ${clip(comment, 300)}` }
  ]
}

// chat(messages) -> text. Without a model, or when it answers nothing usable, the old description and the ask.
export async function newPrompt({ gen, comment, role, chat = null }) {
  const plain = clip(`${gen}. ${VERB_ONLY.test(comment) ? 'A fresh take: a stronger composition and more dramatic light.' : `Changed as asked: ${comment}`}`, 500)
  if (!chat) return plain
  try {
    const t = clip(String(await chat(promptMessages({ gen, comment, role })) || '').replace(/^["'`\s]+|["'`\s]+$/g, ''), 500)
    return t.length >= 12 ? t : plain
  } catch { return plain }
}
