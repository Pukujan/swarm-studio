import type { Meta, StoryObj } from '@storybook/react-vite'
import type { StoreItem } from '../../legacy'
import { FoundLine, Importer } from './Importer'

// What you have, the Studio's first step: the importer, then what was brought, each with what the crew read in it
const BROUGHT: StoreItem[] = [
  { id: 'r1', name: 'brief.pdf', kind: 'file', source: 'import', found: { state: 'reading' } },
  { id: 'r2', name: 'mossandtide.com', kind: 'link', source: 'import', found: { state: 'ready', what: 'A harbour bakery', who: 'Early commuters', pages: ['Home', 'Bread', 'Visit us'] } },
  { id: 'r3', name: 'scan.pdf', kind: 'file', source: 'import', found: { state: 'failed', note: 'the PDF has no text in it (a scan?)' } }
]

function Step({ fail = false }: { fail?: boolean }) {
  return (
    <div className="scaffold p-6">
      <div className="abs flex flex-wrap items-start gap-x-4 gap-y-16">
        <Importer onChoose={() => {}} onLink={() => (fail ? Promise.reject(new Error('only public web pages')) : new Promise(r => setTimeout(r, 600)))} />
        {BROUGHT.map(r => (
          <div key={r.id} className="ab sc-thumb"><div className="sc-file"><span aria-hidden>{r.kind === 'link' ? '🔗' : '▤'}</span></div><em>{r.name}</em><FoundLine r={r} /></div>
        ))}
      </div>
    </div>
  )
}

const meta = { component: Step } satisfies Meta<typeof Step>
export default meta

export const Brought: StoryObj<typeof meta> = {}
// a link the crew may not open: the field says why
export const LinkRefused: StoryObj<typeof meta> = { args: { fail: true } }
