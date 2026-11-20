// What the Game room puts in Hermia's turns in the chat (web/canvas/rooms.js sliceCard, changeBlock, mediaBlock):
//   SliceCard    a big game waits after each slice: what the bots played (their film, or a still), Play it live, and
//                the answers offered, each of which starts the next slice
//   ChangeCard   a change the crew wrote out for the builder: sent only on a press, at the next slice or now
//   MediaCard    what Hermia shows when asked to see the build: the newest play test clip and pictures
import { useState } from 'react'
import { BoardVideo } from '../../primitives/BoardVideo'
import { Button } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import type { GameSlice } from './model'

const media = (src: string) => `${window.SWARM?.base || ''}${src}`

export function SliceCard({ slice, words, onLive, onIdea }: {
  slice: GameSlice
  // how the slice reads (web/canvas/wander.js sliceWords)
  words: { failed: boolean, noStart: boolean, noClip: boolean, ideas: string[] }
  onLive: () => void
  onIdea: (text: string) => void
}) {
  // an answer is given once: its buttons go when one is pressed
  const [answered, setAnswered] = useState(false)
  // a game that never drew: its film is of an empty page, so nothing stands where the clip would
  const clip = !words.noStart && slice.clip && !words.noClip ? slice.clip : ''
  return (
    <div className="mt-2 grid max-w-[420px] gap-2" data-slice={slice.i}>
      <small className="font-monospace text-[11px] text-muted">slice {slice.i + 1} of {slice.n}</small>
      {!words.noStart && (clip || slice.shot) && (
        <div className={`overflow-hidden rounded-[10px] border ${words.failed ? 'border-red' : 'border-edge'} bg-void`}>
          {clip ? <BoardVideo src={media(clip)} auto label={`Slice ${slice.i + 1}, played by the bots`} className="aspect-video w-full object-contain" />
            : <img src={media(slice.shot!)} alt="" className="aspect-video w-full object-contain" />}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button role="secondary" onPress={onLive}><Icon name="play" />Play it live</Button>
        {!answered && words.ideas.map(t => <Button key={t} role="ghost" onPress={() => { setAnswered(true); onIdea(t) }}>{t}</Button>)}
      </div>
    </div>
  )
}

export function ChangeCard({ change, now, onSend }: { change: string, now?: boolean, onSend: (now: boolean) => Promise<void> }) {
  const [state, setState] = useState<'ask' | 'busy' | 'sent'>('ask')
  const send = (at: boolean) => { setState('busy'); onSend(at).then(() => setState('sent'), () => setState('ask')) }
  const btn = (label: string, at: boolean) => <Button key={label} role={at === !!now ? 'primary' : 'ghost'} isDisabled={state !== 'ask'} onPress={() => send(at)}>{label}</Button>
  return (
    <div className="mt-2 grid max-w-[420px] gap-2 rounded-[10px] border border-line p-2">
      <p className="text-sm">{change}</p>
      {state === 'sent' ? <small className="font-monospace text-[11px] text-muted">Sent to the crew</small>
        : <div className="flex flex-wrap gap-2">{now ? [btn('Now', true), btn('Next slice', false)] : [btn('Next slice', false), btn('Now', true)]}</div>}
    </div>
  )
}

export function MediaCard({ clip, pics = [] }: { clip?: string, pics?: { src: string, name?: string }[] }) {
  return (
    <div className="mt-2 flex max-w-[420px] flex-wrap gap-2">
      {clip && <BoardVideo src={media(clip)} auto label="The newest play test" className="aspect-video w-full rounded-[10px] border border-edge bg-void object-contain" />}
      {pics.slice(0, 4).map(p => <img key={p.src} src={media(p.src)} alt={p.name || ''} loading="lazy" className="size-20 rounded-[8px] border border-edge bg-deep object-contain" />)}
    </div>
  )
}
