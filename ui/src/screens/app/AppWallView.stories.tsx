// The app build wall's mock-ups: while it is built, once it is built (its photo), with no plan kept, and a crew
// member answering over their window. From the routes' own answer shapes (model.ts), with no server.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { AppWallView } from './AppWallView'
import type { AppModel } from './model'

const map = {
  version: 'v1',
  flow: 'flowchart LR\n  s_home["Home<br/><small>/</small>"]\n  s_book["Book a class<br/><small>/book</small>"]\n  s_admin["Admin<br/><small>/admin</small>"]\n  s_home --> s_book\n  s_book --> s_admin',
  er: 'erDiagram\n  E_members["Members"] {\n    string name\n    string email\n  }\n  E_bookings["Bookings"] {\n    string member\n    string paid\n  }\n  E_bookings }o--|| E_members : "member"',
  screens: [{ id: 's_home', name: 'Home', path: '/' }, { id: 's_book', name: 'Book a class', path: '/book' }, { id: 's_admin', name: 'Admin', path: '/admin' }],
  data: [{ id: 'E_members', name: 'Members' }, { id: 'E_bookings', name: 'Bookings' }]
}
const photo = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10"><rect width="16" height="10" fill="#f6f1e7"/><rect x="1" y="1" width="9" height="2" fill="#2b2622"/><rect x="1" y="5" width="4" height="2" rx="1" fill="#c4623a"/></svg>')}`
const building: AppModel = {
  run: 'r-gym', title: 'Boulder Club', crew: ['Ada', 'Bo', 'Pip', 'Di'],
  app: { state: 'working', kind: 'app', stage: 'turn 2: building', served: 'dev', url: null, photo: null, hasApp: false, steps: [{ kind: 'turn', text: 'turn 2: building', turn: 2 }, { kind: 'write', text: 'src/pages/BookAClass.tsx', file: true }] },
  map, done: ['s_home'], files: [{ path: 'src/App.tsx', size: 900 }, { path: 'src/pages/Home.tsx', size: 1400 }, { path: 'src/pages/BookAClass.tsx', size: 2100 }],
  file: { path: 'src/pages/BookAClass.tsx', text: 'export default function BookAClass() {\n  return <form>…</form>\n}\n' }
}
const built: AppModel = { ...building, app: { state: 'done', kind: 'app', served: null, url: null, photo, hasApp: true, result: { ok: true, gatesPassed: true, turns: 3, files: 24 }, deployed: 'https://boulder-club.vercel.app', steps: [] }, done: ['s_home', 's_book', 's_admin'], deployedAt: Date.UTC(2026, 10, 13, 16, 20) }

const meta = {
  component: AppWallView,
  args: { model: building, said: null, onAsk: () => {}, onOpen: () => {}, onFile: () => {} },
  parameters: { layout: 'fullscreen' },
  decorators: [Story => <div className="flex h-[720px] flex-col bg-bg"><Story /></div>]
} satisfies Meta<typeof AppWallView>
export default meta
type Story = StoryObj<typeof meta>

export const Building: Story = {}
export const Built: Story = { args: { model: built } }
export const NoPlan: Story = { args: { model: { ...building, map: null } } }
export const PipAnswers: Story = { args: { said: { at: 2, who: 'Pip', text: "I'm on the booking form: the date picker next." } } }
export const HermiaAnswers: Story = { args: { said: { at: -1, who: 'Hermia', text: 'Three turns so far; the admin page is next.' } } }
