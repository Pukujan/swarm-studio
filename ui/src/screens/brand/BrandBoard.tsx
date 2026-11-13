// The brand sheet as drawn (docs/specs/31-brand-sheet.md): one sheet read top to bottom, the packs, then what it is,
// its colours and its type, then what a pack brought. Pure: it draws what it is given and reports what the person
// does, so its stories need no server (BrandSheet.tsx is the screen that feeds it).
import { useEffect, useRef } from 'react'
import { Board, Section, type BoardHandle } from '../../board/Board'
import { BrandInspector } from './BrandInspector'
import { BrandPackCard, OwnWords, PaletteOption, PicturesCard, StoryCard, StoryboardFrame, TypePairing, VoiceCard, Waiting } from './cards'
import type { Brand, BrandActions, BrandPack } from './types'
import './brand.css'

// the type options' fonts, so each pairing shows as itself (Google Fonts, the same request the current Studio makes)
const loaded = new Set<string>()
function useFonts(families: string[]) {
  const key = families.join('|')
  useEffect(() => {
    const want = [...new Set(families)].filter(f => f && !loaded.has(f))
    if (!want.length) return
    want.forEach(f => loaded.add(f))
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?${want.map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;700`).join('&')}&display=swap`
    document.head.append(link)
  }, [key])
}

const INSPECTED = ['story', 'palette', 'type', 'pack']

export function BrandBoard({ brand, packs = [], busy, sel, onSelect, actions }: {
  brand: Brand | null
  packs?: BrandPack[]
  busy: boolean
  sel: string | null
  onSelect: (key: string | null) => void
  actions: BrandActions
}) {
  const board = useRef<BoardHandle>(null)
  useFonts([...(brand?.types || []), ...packs.map(k => k.type)].flatMap(t => [t.heading, t.body]))

  // framed once when the skeleton shows, and once when the options come
  const framed = useRef('')
  useEffect(() => {
    const phase = brand ? 'sheet' : busy ? 'wait' : ''
    if (phase && framed.current !== phase) { framed.current = phase; requestAnimationFrame(() => board.current?.frameAll(false)) }
  }, [brand, busy])

  // a palette or type not picked yet, or a pack not taken yet: pick it, then select it
  const press = (key: string) => {
    const [part, id] = key.split(':')
    const pick = (part === 'palette' || part === 'type') && brand?.pick?.[part] !== id ? actions.pick({ part, id })
      : part === 'pack' && brand?.pack !== id ? actions.pick({ part: 'pack', id }) : null
    if (pick) pick.then(() => onSelect(key)).catch(() => {})
    else onSelect(key)
  }
  const card = (key: string) => ({ selected: sel === key, onPress: press })
  const inspector = brand && sel && INSPECTED.includes(sel.split(':')[0])
    ? <BrandInspector key={sel} sel={sel} brand={brand} packs={packs} actions={actions} onClose={() => onSelect(null)} />
    : null

  if (!brand) {
    return (
      <Board ref={board} label="Brand sheet" className="plan brand-sheet" fit={[0.35, 1]} selected={false} onClear={() => {}} busy={busy}>
        {busy && (
          <div className="col">
            <Section className="br-story" label="Story"><Waiting cls="pcard" n={3} cursor /></Section>
            <Section className="br-pals" label="Palette"><Waiting cls="br-pal" n={3} /></Section>
            <Section className="br-types" label="Type"><Waiting cls="br-type" n={3} /></Section>
          </div>
        )}
      </Board>
    )
  }

  const p = brand.palettes.find(o => o.id === brand.pick?.palette) || brand.palettes[0]
  const t = brand.types.find(o => o.id === brand.pick?.type) || brand.types[0]
  const s = brand.story || {}
  const locked = !!brand.lockedAt
  const words = (part: 'palette' | 'type', w: string) => { actions.pick({ part, words: w }).catch(() => {}) }
  return (
    <Board ref={board} label="Brand sheet" className={`plan brand-sheet${locked ? ' locked' : ''}`} fit={[0.35, 1]} selected={!!sel} onClear={() => onSelect(null)} busy={busy} inspector={inspector}>
      <div className="col">
        {packs.length > 0 && <Section name="packs" className="br-packs" label="Packs">{packs.map(k => <BrandPackCard key={k.slug} k={k} brand={brand} {...card(`pack:${k.slug}`)} />)}</Section>}
        <Section name="story" className="br-story" label="Story">
          <StoryCard part="what" name="What" value={s.what || ''} {...card('story:what')} />
          <StoryCard part="who" name="Who" value={s.who || ''} {...card('story:who')} />
          <StoryCard part="pages" name="Pages" value={(s.pages || []).join(', ')} {...card('story:pages')} />
        </Section>
        <Section name="palette" className="br-pals" label="Palette">
          {brand.palettes.map(x => <PaletteOption key={x.id} p={x} t={t} brand={brand} {...card(`palette:${x.id}`)} />)}
          {!locked && <OwnWords part="palette" label="Your own colours" onWords={words} />}
        </Section>
        <Section name="type" className="br-types" label="Type">
          {brand.types.map(x => <TypePairing key={x.id} t={x} p={p} brand={brand} {...card(`type:${x.id}`)} />)}
          {!locked && <OwnWords part="type" label="Your own fonts" onWords={words} />}
        </Section>
        {brand.voice && <Section name="voice" className="br-voices" label="Voice"><VoiceCard brand={brand} p={p} t={t} {...card(`voice:${brand.voice.pack}`)} /></Section>}
        {brand.pictures && <Section name="pictures" className="br-pictures" label="Pictures"><PicturesCard brand={brand} {...card(`pictures:${brand.pictures.pack}`)} /></Section>}
        {brand.storyboard && (
          <Section name="storyboard" className="br-board" label="Storyboard">
            {brand.storyboard.frames.map((fr, i) => <StoryboardFrame key={i} i={i} frame={fr} p={p} t={t} {...card(`frame:${i}`)} />)}
          </Section>
        )}
      </div>
    </Board>
  )
}
