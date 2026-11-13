// The brand sheet's cards (docs/specs/31-brand-sheet.md), each drawn in the person's own colours and fonts: the
// story, a palette option, a type pairing, a brand pack, and what a pack brought (voice, pictures, storyboard).
// The swatches and samples are the person's colours, never the Studio's chrome.
import type { CSSProperties, ReactNode } from 'react'
import { Artboard, CrewCursor } from '../../board/Board'
import { TextField } from '../../primitives/TextField'
import type { Brand, BrandPack, Palette, TypeOption } from './types'

type Card = { selected: boolean, onPress: (key: string) => void }

// a card on the shared board (src/board/), with the class names the cards' look (brand.css) and Hermia read
const Ab = ({ id, label, className, style, selected, onPress, children }: Card & { id: string, label: string, className: string, style?: CSSProperties, children: ReactNode }) =>
  <Artboard id={id} label={label} className={`ab ${className}`} style={style} selected={selected} onSelect={onPress}>{children}</Artboard>

// text that reads on a colour: dark on a light one, white on a dark one
export const onColour = (h: string) => {
  const n = parseInt(String(h).slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff'
}
// the story's first clause, cut at a word; and its line for whom
export const headline = (b: Brand | null) => {
  const h = (b?.story?.what || 'Your site').split(/[,.:;]/)[0].trim()
  return h.length <= 44 ? h : h.slice(0, 45).replace(/\s+\S*$/, '')
}
export const line = (b: Brand | null) => (b?.story?.who ? `For ${b.story.who}`.slice(0, 70) : 'A first line of the page.')
const font = (f: string): CSSProperties => ({ fontFamily: `'${f}'` })

export function StoryCard({ part, name, value, ...card }: Card & { part: string, name: string, value: string }) {
  return <Ab id={`story:${part}`} label={name} className="pcard" {...card}><b>{name}</b><span>{value}</span></Ab>
}

// a sample: a heading, a line, a button and a link, in a palette and type, light or dark
function Sample({ p, t, dark, brand }: { p: Omit<Palette, 'id' | 'name'>, t: { heading: string, body: string }, dark: boolean, brand: Brand }) {
  const bg = dark ? p.text : p.bg, fg = dark ? p.bg : p.text
  return (
    <div className="br-sample" style={{ background: bg, color: fg }}>
      <b style={font(t.heading)}>{headline(brand)}</b>
      <span style={font(t.body)}>{line(brand)}</span>
      <div>
        <i className="br-btn" style={{ background: p.accent, color: onColour(p.accent), ...font(t.body) }}>Join</i>
        <u style={{ color: dark ? p.bg : p.link, ...font(t.body) }}>Read more</u>
      </div>
    </div>
  )
}

export function PaletteOption({ p, t, brand, ...card }: Card & { p: Palette, t: TypeOption, brand: Brand }) {
  const on = p.id === brand.pick?.palette
  return (
    <Ab id={`palette:${p.id}`} label={p.name} className={`br-pal${on ? ' on' : ''}`} {...card}>
      <div className="br-sw">{(['bg', 'text', 'accent', 'link'] as const).map(k => <i key={k} style={{ background: p[k] }} />)}</div>
      <div className="br-two"><Sample p={p} t={t} dark={false} brand={brand} /><Sample p={p} t={t} dark brand={brand} /></div>
      <em>{p.name}</em>
    </Ab>
  )
}

export function TypePairing({ t, p, brand, ...card }: Card & { t: TypeOption, p: Palette, brand: Brand }) {
  const on = t.id === brand.pick?.type
  return (
    <Ab id={`type:${t.id}`} label={t.name} className={`br-type${on ? ' on' : ''}`} style={{ background: p.bg, color: p.text }} {...card}>
      <b style={font(t.heading)}>{headline(brand)}</b>
      <span style={font(t.body)}>{brand.story?.who ? `For ${brand.story.who}. ` : ''}Every page reads in this pairing: the headings above, this paragraph below.</span>
      <em>{t.heading} · {t.body}</em>
    </Ab>
  )
}

// a brand pack looks like itself: its ground, its type, its photos, its voice and its button
export function BrandPackCard({ k, brand, ...card }: Card & { k: BrandPack, brand: Brand }) {
  const p = k.palette, on = brand.pack === k.slug
  return (
    <Ab id={`pack:${k.slug}`} label={k.name} className={`br-pack${on ? ' on' : ''}${k.suggested ? ' sug' : ''}`}
      style={{ background: p.bg, color: p.text, ['--r' as string]: k.radius }} {...card}>
      <div className="br-pk-pics">{k.pictures.photos.map(x => <img key={x.url} src={x.url} alt="" draggable={false} loading="lazy" />)}</div>
      <b style={font(k.type.heading)}>{k.name}</b>
      <span style={font(k.type.body)}>{k.voice.lines[0]}</span>
      <div className="br-pk-row">
        <i className="br-btn" style={{ background: p.accent, color: onColour(p.accent), ...font(k.type.body) }}>Join</i>
        <u style={{ color: p.link, ...font(k.type.body) }}>Read more</u>
      </div>
      {k.why && <em>{k.why}</em>}
    </Ab>
  )
}

export function VoiceCard({ brand, p, t, ...card }: Card & { brand: Brand, p: Palette, t: TypeOption }) {
  const v = brand.voice!
  return (
    <Ab id={`voice:${v.pack}`} label={v.name} className="br-voice" style={{ background: p.bg, color: p.text }} {...card}>
      {v.lines.map(l => <b key={l} style={font(t.heading)}>{l}</b>)}
      <em>{v.name}</em>
    </Ab>
  )
}

export function PicturesCard({ brand, ...card }: Card & { brand: Brand }) {
  const x = brand.pictures!
  return (
    <Ab id={`pictures:${x.pack}`} label={x.name} className="br-pics" {...card}>
      {x.photos.map(ph => <img key={ph.url} src={ph.url} alt={ph.alt || ''} draggable={false} loading="lazy" />)}
      <em>{x.name}</em>
    </Ab>
  )
}

export function StoryboardFrame({ i, frame, p, t, ...card }: Card & { i: number, frame: string, p: Palette, t: TypeOption }) {
  return (
    <Ab id={`frame:${i}`} label={frame} className="br-frame" style={{ background: p.bg, color: p.text, ['--a' as string]: p.accent }} {...card}>
      <i /><b style={font(t.heading)}>{frame}</b><u /><u />
    </Ab>
  )
}

// the person's own words: one more option, picked (spec 31)
export function OwnWords({ part, label, onWords }: { part: 'palette' | 'type', label: string, onWords: (part: 'palette' | 'type', words: string) => void }) {
  return (
    <form className="ab br-own" data-own={part} onSubmit={e => {
      e.preventDefault()
      const input = e.currentTarget.elements.namedItem('w') as HTMLInputElement
      if (input.value.trim()) onWords(part, input.value.trim())
    }}>
      <TextField name="w" aria-label={label} placeholder={label} maxLength={300} label="" bare />
    </form>
  )
}

// while the options are made: the sheet's own sections at their own sizes, empty, with the planner's cursor on
// the first card, so nothing moves when they come
export const Waiting = ({ cls, n, cursor = false }: { cls: string, n: number, cursor?: boolean }) =>
  Array.from({ length: n }, (_, i) => (
    <div key={i} className={`ab ${cls} br-wait`} aria-hidden="true">
      <div className="pl-work" />
      {cursor && i === 0 && <CrewCursor name="Hermia" className="top-[62%] left-[70%]" />}
    </div>
  ))
