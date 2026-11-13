// The step path (docs/specs/42-ways-to-make.md): a chip per step on the record, with its dot, then Lock, then a
// + chip for each step taken off. A chip opens its step; + brings one back.
import { Button as AriaButton } from 'react-aria-components'
import { StepDot } from '../../shared/Layers'
import { STEP_NAME, type StepState } from './useStudio'

const CHIP = 'pointer-events-auto inline-flex h-7 flex-none cursor-pointer items-center gap-2 rounded-full border bg-deep px-3 text-[13px] font-medium text-text outline-none data-[hovered]:border-line-2 data-[focus-visible]:outline-2 data-[focus-visible]:outline-frame-hi'

export function StepPath({ steps, gone, current, stateOf, onStep, onAdd }: { steps: string[], gone: string[], current: string | null, stateOf: (s: string) => StepState, onStep: (s: string) => void, onAdd: (s: string) => void }) {
  return (
    <nav aria-label="Steps" className="sc-path">
      {[...steps, 'proposal'].map(s => (
        <AriaButton key={s} onPress={() => onStep(s)} aria-current={current === s ? 'step' : undefined} className={`${CHIP} ${current === s ? 'border-text' : 'border-line'}`}>
          <StepDot state={stateOf(s)} />{STEP_NAME[s]}
        </AriaButton>
      ))}
      {gone.map(s => (
        <AriaButton key={s} onPress={() => onAdd(s)} aria-label={`Add ${STEP_NAME[s]}`} className={`${CHIP} border-dashed border-line text-muted`}>
          <span aria-hidden>+</span>{STEP_NAME[s]}
        </AriaButton>
      ))}
    </nav>
  )
}
