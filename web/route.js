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

// "change the brand colours", "make it darker", "use the reference's colours and fonts": the look only. The
// theme's colours, fonts and corners change and every page stays as it is (server/server.mjs lookRequest);
// before, with no section selected, this built a whole new version and the design changed with it.
const LOOK = /\b(colou?rs?|palette|colou?r scheme|brand(ing)?|theme|fonts?|typefaces?|typography|accent|dark mode|light mode|darker|lighter|corners?|roundness)\b/i
// words that ask for more than the look: new or changed pages, sections, pictures or words
const NOT_LOOK = /\b(add|adding|new|another|remove|delete|page|pages|section|sections|layout|picture|pictures|image|images|photo|photos|logo|rewrite|copy|words|text|headline|button|buttons|menu|nav|footer|hero)\b/i
export const lookAsk = text => { const t = String(text || ''); return LOOK.test(t) && !NOT_LOOK.test(t) }

// An app project's box (the Overview's "Tell the crew…", issue #542): its words change the app, in its App room
// with the chat open, the same as that chat; only a selected page still takes a change to its design (/fix).
/** @param {{ app?: boolean } | null | undefined} board  @param {string | undefined} selected the selected item's kind */
export const toApp = (board, selected) => !!board?.app && selected !== 'page'
/** The box says which it does; drawn with the Overview's inspector, so it follows the board and the selection.
 * @param {Element | null} box  @param {{ app?: boolean } | null | undefined} board  @param {string | undefined} selected */
export function askBox(box, board, selected) {
  if (box instanceof HTMLInputElement) box.placeholder = toApp(board, selected) ? 'Change the app…' : 'Tell the crew…'
}

export function routeMessage({ text = '', run = null, site = true, selected = false, hosted = false } = {}) {
  const t = String(text).trim()
  if (!t) return 'none'
  if (/^\/[a-z?]/i.test(t)) return 'slash'
  // no build open, or one that isn't a site (a game): a new build
  if (!run || !site || hosted) return 'new'
  if (seoAsk(t)) return 'fix'
  // the look only, with nothing selected: a theme change in place, never a new version
  if (!selected && lookAsk(t)) return 'fix'
  // a section or page is selected and the words are about it: rewrite it in place
  if (selected && !MORE.test(t)) return 'fix'
  return 'extend'
}

