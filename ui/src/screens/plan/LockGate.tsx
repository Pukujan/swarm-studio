// The gate before anything costly (docs/specs/21-plan-before-spend.md; web/plan.js gate()): the parts, the total,
// Test one first, and one confirm that carries the price. The server checks the same number again
// (engine/plan.mjs lockPlan): when the price has moved, nothing is locked and the new price is shown.
import { useState } from 'react'
import { Button } from '../../primitives/Button'
import { Checkbox } from '../../primitives/Checkbox'
import { Dialog } from '../../primitives/Dialog'
import { cost } from './model'
import type { Price } from './types'

export function LockGate({ price: pr, isOpen, onOpenChange, onLock }: {
  price: Price, isOpen: boolean, onOpenChange: (open: boolean) => void,
  onLock: (o: { credits: number, testFirst: boolean }) => Promise<void>
}) {
  const [first, setFirst] = useState(false)
  const [busy, setBusy] = useState(false)
  // a plan with no Meshy parts costs pictures, not credits
  const flat = !pr.credits
  const canFirst = flat ? pr.images > 1 : !!pr.first.credits && pr.first.credits < pr.credits
  const go = flat ? `Lock · ${first ? 1 : pr.images} ${first ? 'picture' : 'pictures'}` : `Lock · ${first ? pr.first.credits : pr.credits} credits`
  const row = 'grid grid-cols-[1fr_auto_64px] gap-3 border-b border-line py-2 font-body text-[13px] text-text'
  return (
    <Dialog title={`Lock · ${cost(pr.credits, pr)}`} isOpen={isOpen} onOpenChange={onOpenChange}>
      <div className="flex flex-col">
        {pr.parts.filter(x => x.n).map(x => (
          <div key={x.what} className={row}><span>{x.what}</span><i className="font-monospace text-xs text-muted not-italic">{x.n} × {x.each}</i><b className="text-right font-monospace font-semibold">{x.credits}</b></div>
        ))}
        <div className={row}><span>Coding runs</span><i /><b className="text-right font-monospace font-semibold">{pr.runs}</b></div>
        <div className={row}><span>Pictures</span><i /><b className="text-right font-monospace font-semibold">{pr.images}</b></div>
      </div>
      <Checkbox className="mt-2" isSelected={first} isDisabled={!canFirst} onChange={setFirst}>Test one first</Checkbox>
      <div className="mt-4 flex justify-end">
        <Button role="primary" className="min-w-[180px]" isDisabled={busy} onPress={async () => {
          setBusy(true)
          try { await onLock({ credits: first ? pr.first.credits : pr.credits, testFirst: first }) } finally { setBusy(false) }
        }}>{go}</Button>
      </div>
    </Dialog>
  )
}
