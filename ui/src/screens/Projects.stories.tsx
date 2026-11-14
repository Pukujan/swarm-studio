// Projects' mock-ups: the real screen on the real machine at Projects' address, with the server's answers stubbed
// (no server behind Storybook). One story per state it draws differently: full, recent, list, a folder, filtered,
// Trash, Chats, Assets, empty and loading.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { makeNav } from '../nav/nav'
import { NavProvider } from '../nav/NavProvider'
import { ToastProvider } from '../primitives/Toast'
import { Projects } from './Projects'

const day = 86400e3, now = Date.parse('2026-11-13T09:00:00Z')
const theme = (bg: string, primary: string, fg: string) => ({ colors: [bg, primary, primary, fg], fonts: { heading: 'Big Shoulders Display' } })
const PROJECTS = [
  { id: 'p-ants', title: 'Army of Ants', head: 'r-ants-2', count: 2, made: now - 9 * day, updated: now - 2 * 3600e3, theme: theme('#1b2a1f', '#e2b13c', '#f4efe2'), kinds: ['game'], state: { kind: 'Game', status: 'Game built' },
    versions: [{ id: 'r-ants-2', t: now - 2 * 3600e3, theme: theme('#1b2a1f', '#e2b13c', '#f4efe2'), kinds: ['game'], state: { kind: 'Game', status: 'Game built' } }, { id: 'r-ants-1', t: now - 9 * day, theme: theme('#2a1b1b', '#e26b3c', '#f4efe2'), kinds: ['game'], state: { kind: 'Game', status: 'Game built' } }] },
  { id: 'p-tea', title: 'Alpha Tea', head: 'r-tea', count: 1, made: now - 4 * day, updated: now - day, theme: theme('#f4efe2', '#2f5d50', '#1d1d1b'), kinds: ['site'], state: { kind: 'Website', status: 'Live', host: 'alpha-tea.vercel.app' }, folder: 'Client work' },
  { id: 'p-log', title: 'Shift Log', head: 'r-log', count: 1, made: now - 3 * day, updated: now - 3 * day, theme: theme('#101826', '#5aa9ff', '#e8eef7'), kinds: ['site', 'app'], state: { kind: 'App', status: 'Building' }, live: true, progress: 0.42 },
  { id: 'p-river', title: 'River Hours', head: 'r-river', count: 1, made: now - 6 * day, updated: now - 5 * day, kinds: ['film'], state: { kind: 'Video', status: 'Designed' } },
  { id: 's-cedar', title: 'Cedar Cafe', head: null, count: 1, made: now - 3600e3, updated: now - 3600e3, studio: 'site', state: { kind: 'Website', status: 'Studio' } },
  { id: 'p-old', title: 'Old Pitch', head: 'r-old', count: 1, made: now - 30 * day, updated: now - 20 * day, trashed: true, state: { kind: 'Website', status: 'Designed' } }
]
const FIXTURES: Record<string, unknown> = {
  '/api/projects': { folders: [{ name: 'Client work', count: 1 }, { name: 'Experiments', count: 0 }], projects: PROJECTS },
  '/api/plans': { plans: [{ id: 'p-lantern', title: 'Lantern Run', updated: new Date(now - 3 * 3600e3).toISOString() }] },
  '/api/me': { name: 'Pujan', feed: 'https://swarm.design-bakery.com' },
  '/api/chats': { chats: [{ id: 'c-1', title: 'A tea shop that feels like a library', kind: 'site', updated: now - 3600e3 }, { id: 'c-2', title: 'Ant colony tower defence', kind: 'game', state: 'locked', updated: now - 2 * day }] },
  '/api/assets': { assets: [{ project: 'p-tea', name: 'Home · Hero', kind: 'section' }, { project: 'p-tea', name: 'logo.png', kind: 'upload', type: 'image/png' }, { project: 'p-river', name: 'Mood film', kind: 'film' }] },
  '/api/intake': { starters: { site: ['A tea shop that feels like a library', 'A climbing gym in Cornwall'] }, guides: {} },
  '/api/hermes': { needed: false }
}

// every request answers from the fixtures; `hold` keeps them on their way (the loading state), `empty` answers nothing
function stub(mode: 'full' | 'empty' | 'hold') {
  window.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), location.href).pathname
    if (mode === 'hold') return new Promise(() => {})
    const body = mode === 'empty' ? ({ '/api/projects': { folders: [], projects: [] }, '/api/me': FIXTURES['/api/me'] } as Record<string, unknown>)[path] ?? {} : FIXTURES[path] ?? {}
    return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
}

function Stage({ mode, keys }: { mode: 'full' | 'empty' | 'hold', keys: Record<string, unknown> }) {
  // the stub and the stored choices go in before the screen's first fetch
  const [nav] = useState(() => {
    stub(mode)
    for (const k of ['view', 'folder', 'sort', 'filter', 'layout']) localStorage.removeItem(`swarm.home.${k}`)
    for (const [k, v] of Object.entries(keys)) localStorage.setItem(`swarm.home.${k}`, JSON.stringify(v))
    return makeNav({ search: '' })
  })
  return <NavProvider nav={nav}><ToastProvider><Projects /></ToastProvider></NavProvider>
}

const meta = {
  component: Stage,
  args: { mode: 'full', keys: { view: 'all' } },
  parameters: { layout: 'fullscreen' }
} satisfies Meta<typeof Stage>
export default meta
type Story = StoryObj<typeof meta>

export const AllProjects: Story = {}
export const Recent: Story = { args: { keys: { view: 'recent' } } }
export const List: Story = { args: { keys: { view: 'all', layout: 'list' } } }
export const Folder: Story = { args: { keys: { view: 'folder', folder: 'Client work' } } }
export const Filtered: Story = { args: { keys: { view: 'all', filter: 'k:Website' } } }
export const Trash: Story = { args: { keys: { view: 'trash' } } }
export const Chats: Story = { args: { keys: { view: 'chats' } } }
export const Assets: Story = { args: { keys: { view: 'assets' } } }
export const Empty: Story = { args: { mode: 'empty', keys: { view: 'recent' } } }
export const Loading: Story = { args: { mode: 'hold' } }
