// @ts-check
// The Map window's pure rules (spec 44; the owner, 2026-11-14: "i wanted things like this where it visually
// instantly gives me feedback on whats going on always"): which typed messages open the Map, which ask the planner
// for a diagram of their own, which of the wall's older windows gives its place to the Map, the colours a diagram
// takes from the Studio's tokens, and a diagram's words as a list. Nothing here touches the page, so node tests it
// (tests/mapask.test.mjs); web/canvas/mapwin.js draws, web/canvas/rooms.js routes.

// what a message may start with before it gets to the point
const MAP_LEAD = /^(?:(?:hey|hi|ok|okay|so|and|hermia|please|pls)[, ]+)*(?:(?:can|could|would|will) (?:you|u) (?:please )?|i(?: would|'d| wanna| want to)(?: like to)? |let me |lets |let's )?/
// the build itself: asking for it as a diagram is asking for the standing map
const MAP_WHOLE = '(?:this|it|that|everything|(?:the |my |this |our )?(?:whole )?(?:game|app|build|project|plan|loop|game loop|flow|slices|stages|screens)|how (?:the |this |my |our )?(?:game|app|build|project|it) (?:will |would |is going to )?(?:runs?|works?|flows?|plays?|goes|is built|gets built|fits together))'
// a diagram by any of its names
const MAP_NOUN = '(?:mermaid(?: charts?| diagrams?)?|(?:state|flow|sequence|class|er|entity) ?(?:charts?|diagrams?|machines?)|flowcharts?|statecharts?|diagrams?|charts?|graphs?)'
// the names that are never something an app shows its own users ("show sales as a chart" is a change, not a question)
const MAP_SURE = '(?:mermaid(?: charts?| diagrams?)?|(?:state|flow|sequence|class|er|entity) ?(?:charts?|diagrams?|machines?)|flowcharts?|statecharts?|diagrams?)'
const MAP_RE = {
  map: new RegExp(`^(?:show|see|open|draw|give|pull up|bring up)(?: me| us)?(?: the| a| my| our)? (?:map|plan map|build map|project map|${MAP_NOUN})$`),
  bare: /^(?:the )?map$/,
  going: /^(?:what(?:'s|s| is)|whats) (?:going on|happening)(?: here| now| right now| with (?:the|my|this|our) (?:game|app|build|project))?$/,
  whole: new RegExp(`^(?:show|see|draw|give|map out|chart|diagram|sketch)(?: me| us)? ${MAP_WHOLE}(?: (?:as|in|with) (?:a |an |some )?${MAP_NOUN})?$`),
  wholeOf: new RegExp(`^(?:show|see|draw|give|make|sketch)(?: me| us)? (?:a |an |the |some )?${MAP_NOUN} (?:of|for|about|showing) ${MAP_WHOLE}$`),
  // one thing, as a diagram: the verb says it is a question for the crew, or the noun could be nothing else
  as: new RegExp(`^(?:(?:show|give|make) (?:me|us)|draw(?: me| us)?|sketch(?: me| us)?|map out|diagram|chart) .+ (?:as|in|with) (?:a |an |some )?${MAP_NOUN}$`),
  asSure: new RegExp(`^(?:show|see|give|make|explain) .+ (?:as|in|with) (?:a |an |some )?${MAP_SURE}$`),
  of: new RegExp(`^(?:(?:show|give|make) (?:me|us)|draw(?: me| us)?|sketch(?: me| us)?) (?:a |an |the |some )?${MAP_NOUN} (?:of|for|about|showing) .+$`),
  ofSure: new RegExp(`^(?:(?:show|see|give|make|draw|sketch)(?: me| us)? )?(?:a |an |the |some )?${MAP_SURE} (?:of|for|about|showing) .+$`)
}

/**
 * What a typed message asks of the Map window. 'map': the standing map, shown at once ("show the map", "show me
 * how the game will run as mermaid charts", "draw this as a diagram", "what's going on?"). 'chart': a diagram of
 * one thing the standing map does not hold ("show the enemy AI as a state chart"), which the planner writes. null:
 * anything else, and a message for the builder stays one ("add a map page", "show a map of nearby stores").
 * Only a message that is one of these, whole.
 * @param {string} text  @returns {'map' | 'chart' | null}
 */
export function mapAsk(text) {
  const t = String(text || '').trim().toLowerCase().replace(/[’]/g, "'").replace(/[.!?]+$/, '').replace(/\s+/g, ' ').replace(MAP_LEAD, '').replace(/ (?:please|pls|for me)$/, '')
  if (!t || t.length > 200) return null
  if (MAP_RE.map.test(t) || MAP_RE.bare.test(t) || MAP_RE.going.test(t) || MAP_RE.whole.test(t) || MAP_RE.wholeOf.test(t)) return 'map'
  if (MAP_RE.as.test(t) || MAP_RE.asSure.test(t) || MAP_RE.of.test(t) || MAP_RE.ofSure.test(t)) return 'chart'
  return null
}

/** What the room answers when there is no plan to draw (never sent to the builder).  @param {string} [kind] */
export const mapNone = kind => `There is no plan to draw for this ${kind === 'game' ? 'game' : 'app'} yet.`

/**
 * The wall has four windows and the Map takes the first (spec 44). Which of the wall's own four gives up its
 * place: the third in both modes. While the crew writes code that is the second picture window, and the first one
 * then shows every new picture; while it paints, the third painter's, whose picture still lands on the art sheet
 * (Art in the switch). -1: there is no Map, and the wall keeps its four.
 * @param {boolean} hasMap  @returns {number}
 */
export const mapYields = hasMap => (hasMap ? 2 : -1)

// the longest diagram text the page hands to Mermaid (the server's own cap, engine/gamemap.mjs CHART_MAX, is under it)
export const MAP_TEXT_MAX = 12000
/** A diagram's text is a string of a size Mermaid may be given.  @param {unknown} text */
export const chartFits = text => typeof text === 'string' && text.trim().length > 0 && text.length <= MAP_TEXT_MAX

/**
 * A diagram's colours, from the Studio's tokens (graphite and its one accent; red only for what failed), so it
 * turns with the theme. `vars` are Mermaid's base theme variables; `defs` are the classes the standing map marks
 * its nodes with: done (quiet), now (the accent, filled), failed (red edge).
 * @param {(name: string) => string} token a token's value, by its CSS name ('--text')
 */
export function mapLook(token) {
  const c = n => String(token(n) || '').trim()
  const text = c('--text') || '#f4f4f5', bg = c('--void') || '#0b0b0c', panel = c('--deep') || '#161618', line = c('--frame') || '#3a3a3f'
  const muted = c('--muted') || '#8e8e93', hot = c('--hot') || '#F20000', hotText = c('--hot-text') || '#ff5c5c'
  return {
    key: [text, bg, panel, line, muted, hot, hotText].join('|'),
    vars: {
      background: bg, primaryColor: panel, primaryTextColor: text, primaryBorderColor: line, secondaryColor: panel, secondaryTextColor: text, secondaryBorderColor: line,
      tertiaryColor: bg, tertiaryTextColor: text, tertiaryBorderColor: line, lineColor: muted, textColor: text, mainBkg: panel, nodeBorder: line, clusterBkg: bg, clusterBorder: line,
      titleColor: muted, edgeLabelBackground: bg, noteBkgColor: panel, noteTextColor: text, noteBorderColor: line, actorBkg: panel, actorBorder: line, actorTextColor: text, signalColor: muted, signalTextColor: text,
      labelBoxBkgColor: panel, labelBoxBorderColor: line, labelTextColor: text, loopTextColor: text, activationBkgColor: panel, activationBorderColor: line, attributeBackgroundColorOdd: bg, attributeBackgroundColorEven: panel, fontSize: '14px'
    },
    defs: [
      `classDef done fill:${bg},stroke:${line},color:${muted}`,
      `classDef now fill:${text},stroke:${text},color:${bg},stroke-width:2px`,
      `classDef failed fill:${bg},stroke:${hot},color:${hotText},stroke-width:2px`
    ]
  }
}

const MAP_STATE = { done: 'done', now: 'being built', failed: 'failed' }
/**
 * The standing map as a list, for a screen reader: each node and how it stands.
 * @param {{ name: string, state?: string }[]} [nodes]  @returns {string[]}
 */
export const mapList = (nodes = []) => nodes.map(n => `${n.name}${MAP_STATE[n.state] ? `, ${MAP_STATE[n.state]}` : ''}`)

/**
 * The words in a diagram a model wrote, as a list (its text alternative): each label once, in order.
 * @param {string} text  @returns {string[]}
 */
export function chartWords(text) {
  const out = new Set()
  for (const line of String(text || '').split('\n').slice(1)) {
    // a state or a participant named by a bare word on either side of an arrow ("Patrol --> Chase: sees the hero")
    if (/--|->/.test(line)) for (const side of line.split(':')[0].split(/\s*[-.=ox<>|]{2,}\s*/)) { const w = side.trim(); if (/^[A-Za-z][\w ]{1,40}$/.test(w)) out.add(w) }
    for (const m of line.matchAll(/"([^"]{1,120})"|[[({]+([^\][(){}"|]{1,120})[\])}]+|:\s*([^\n]{1,120})$/g)) {
      const w = (m[1] ?? m[2] ?? m[3] ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()
      if (w && !/^[\d*]+$/.test(w)) out.add(w)
    }
  }
  return [...out].slice(0, 40)
}
