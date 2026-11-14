// The brand sheet's inspector: the selected option's colours or fonts, the story line, or a pack to use whole or in
// part (the mix). A field commits as in the current Studio: on Enter or when it loses focus; a colour when its
// picker closes.
import { useEffect, useRef } from 'react'
import { InspectorHead } from '../../board/Board'
import { Button } from '../../primitives/Button'
import { TextField } from '../../primitives/TextField'
import type { Brand, BrandActions, BrandPack } from './types'

const HEX = /^#[0-9a-f]{6}$/i
const STORY = { what: 'What', who: 'Who', pages: 'Pages' } as const

// a text field that commits its value once, on Enter or blur, when it changed
function Committed({ label, value, multiline, maxLength, onCommit }: { label: string, value: string, multiline?: boolean, maxLength: number, onCommit: (v: string) => void }) {
  const commit = (v: string) => { if (v !== value) onCommit(v) }
  return (
    <TextField label={label} defaultValue={value} multiline={multiline} maxLength={maxLength}
      onBlur={e => commit((e.target as HTMLInputElement).value)}
      onKeyDown={e => { if (!multiline && e.key === 'Enter') commit((e.target as HTMLInputElement).value) }} />
  )
}

// a colour: its picker and its hex, side by side; the picker commits when it closes (the native change event)
function Colour({ label, value, onCommit }: { label: string, value: string, onCommit: (v: string) => void }) {
  const picker = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = picker.current
    const on = () => { if (HEX.test(el!.value) && el!.value !== value) onCommit(el!.value) }
    el?.addEventListener('change', on)
    return () => el?.removeEventListener('change', on)
  }, [value, onCommit])
  return (
    <div className="flex items-end gap-1.5">
      <input ref={picker} type="color" defaultValue={value} aria-label={label} className="h-10 w-10 shrink-0 cursor-pointer rounded-[8px] border border-line bg-transparent p-0" />
      <div className="min-w-0 flex-1">
        <Committed label={label} value={value} maxLength={7} onCommit={v => { if (HEX.test(v.trim())) onCommit(v.trim()) }} />
      </div>
    </div>
  )
}

export function BrandInspector({ sel, brand, packs, actions, onClose }: { sel: string, brand: Brand, packs: BrandPack[], actions: BrandActions, onClose: () => void }) {
  const [part, id] = sel.split(':')
  const head = (name: string) => <InspectorHead name={name} onClose={onClose} />
  if (part === 'pack') {
    const k = packs.find(x => x.slug === id)
    if (!k) return null
    return (
      <>
        {head(k.name)}
        <div className="flex flex-wrap gap-2 py-1">
          <Button role="primary" className="basis-full" onPress={() => actions.pick({ part: 'pack', id })}>Use all</Button>
          {([['palette', 'Palette'], ['type', 'Type'], ['voice', 'Voice'], ['pictures', 'Pictures']] as const).map(([v, n]) =>
            <Button key={v} role="ghost" onPress={() => actions.pick({ part: 'pack', id, parts: [v] })}>{n}</Button>)}
        </div>
      </>
    )
  }
  if (part === 'story') {
    const k = id as keyof typeof STORY
    const value = k === 'pages' ? (brand.story?.pages || []).join(', ') : brand.story?.[k] || ''
    return <>{head(STORY[k])}<Committed key={value} label={STORY[k]} value={value} multiline maxLength={200} onCommit={v => actions.edit({ part: 'story', values: { [k]: v } })} /></>
  }
  if (part === 'palette') {
    const x = brand.palettes.find(o => o.id === id)
    if (!x) return null
    return (
      <>
        {head(x.name)}
        {([['bg', 'Background'], ['text', 'Text'], ['accent', 'Accent'], ['link', 'Links']] as const).map(([k, n]) =>
          <Colour key={`${k}${x[k]}`} label={n} value={x[k]} onCommit={v => actions.edit({ part: 'palette', id, values: { [k]: v } })} />)}
      </>
    )
  }
  if (part === 'type') {
    const x = brand.types.find(o => o.id === id)
    if (!x) return null
    return (
      <>
        {head(x.name)}
        <Committed key={`h${x.heading}`} label="Headings" value={x.heading} maxLength={40} onCommit={v => actions.edit({ part: 'type', id, values: { heading: v.trim() } })} />
        <Committed key={`b${x.body}`} label="Body" value={x.body} maxLength={40} onCommit={v => actions.edit({ part: 'type', id, values: { body: v.trim() } })} />
      </>
    )
  }
  return null
}
