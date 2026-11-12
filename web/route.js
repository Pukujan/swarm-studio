// @ts-check
// Where a message typed in the studio goes. Inside an open build it belongs to that
// build: an edit of the selected section or page (/fix), or the project's next
// version that keeps every page and adds what was asked (extend). Only with no
// build open (Projects home, a new file) does it start a new project.

// "add a page about…", "more about X", "new sections for…": more site, not an edit
const MORE = /\b(new|more|another|extra|other)\s+(pages?|sections?|tabs?|screens?)\b|\b(pages?|sections?)\s+(about|for|on|covering)\b|\bmore (about|on)\b|\badd(ing)?\s+(a |an |some |two |three |four )?(pages?|sections?)\b/i

// "improve the SEO", "a better description for the menu page", "target people searching for X":
// the crew's SEO pass edits titles, descriptions and share pictures (engine/seo.mjs), never a new build
const SEO = /\bseo\b|search engines?|\bgoogle\b|\bmeta (description|tags?|title)\b|\bpage titles?\b|\btitle tags?\b|\bdescriptions? (for|of|on) (the |my |our )?[\w -]{0,30}\bpages?\b|\bshare (card|image|picture|preview)s?\b|\blink previews?\b|\bopen graph\b|\bog:|\bkeywords?\b|\brank(ing|s)?\b|\b(people|someone|anyone) (searching|search|looking|googling)\b|\bsearch(es|ing)? for\b|\bbe found\b|\bfindable\b|\bstructured data\b|\bschema\.org\b|\bsitemap\.xml\b|\brobots\.txt\b/i
export const seoAsk = text => SEO.test(String(text || ''))

export function routeMessage({ text = '', run = null, site = true, selected = false, hosted = false } = {}) {
  const t = String(text).trim()
  if (!t) return 'none'
  if (/^\/[a-z?]/i.test(t)) return 'slash'
  // no build open, or one that isn't a site (a game): a new build
  if (!run || !site || hosted) return 'new'
  if (seoAsk(t)) return 'fix'
  // a section or page is selected and the words are about it: rewrite it in place
  if (selected && !MORE.test(t)) return 'fix'
  return 'extend'
}

