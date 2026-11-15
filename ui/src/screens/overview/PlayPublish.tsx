// Play and Publish on the Overview's top bar, as the classic Overview has them (web/project.js): the same Player and
// Publish dialog the Design deck uses, over this version's build (decision 0024: the next UI is the Studio, so what
// the classic one offers here is offered here too). The build is read as the deck reads it (useDeckRun).
import { useMemo, useState } from 'react'
import { useNav } from '../../nav/NavProvider'
import { Button } from '../../primitives/Button'
import { Icon } from '../../primitives/Icon'
import { useTrail } from '../../shell/Trail'
import { Player } from '../deck/Player'
import { PublishDialog } from '../deck/PublishDialog'
import { useDeckRun } from '../deck/source'

export function PlayPublish({ run }: { run: string | null }) {
  const { view, go } = useNav()
  const { model, loading } = useDeckRun(run)
  const [publishing, setPublishing] = useState(false)
  // a page with written sections plays (the deck's own test)
  const canPlay = !loading && model.pages.some(p => model.order.some(k => model.layers[k].text && (model.layers[k].page === p.id || model.layers[k].page === '*')))
  const label = model.publish.state === 'working' ? 'Publishing…' : model.publish.liveTarget && model.publish.state !== 'failed' ? 'Live' : 'Publish'
  const pages = model.pages.length
  const action = useMemo(() => (
    <span className="flex items-center gap-2">
      <Button role="secondary" isDisabled={!canPlay} onPress={() => go({ type: 'play', pages })}><Icon name="play" size={16} />Play</Button>
      <Button role="primary" isDisabled={!canPlay} onPress={() => setPublishing(true)}><Icon name="globe" size={16} />{label}</Button>
    </span>
  ), [canPlay, pages, label, go])
  useTrail(undefined, action)
  return (
    <>
      {view.player !== 'closed' && pages > 0 && <Player model={model} />}
      {model.run && <PublishDialog model={model} isOpen={publishing} onOpenChange={setPublishing} />}
    </>
  )
}
