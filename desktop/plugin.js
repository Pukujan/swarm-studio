/**
 * Swarm Studio — Desktop half.
 *
 * A "Swarm Studio" page (sidebar entry) and a pane docked beside the chat,
 * both showing the live Swarm Studio canvas, and a status-bar chip that says
 * how many agents are working. The canvas is a local page served on
 * 127.0.0.1 by this plugin's Node server; it is embedded through
 * SandboxedFrame (opaque origin, scripts only), never with app privileges.
 *
 * Plain ESM, loaded uncompiled: jsx() calls, never JSX syntax. Only
 * @hermes/plugin-sdk, react and react/jsx-runtime are imported.
 *
 * The frame has no clipboard and can't open windows, so the canvas asks this
 * side to copy or open a published link: a postMessage from that frame only,
 * and only for an http(s) URL.
 */

import {
  Button,
  EmptyState,
  PANES_AREA,
  ROUTES_AREA,
  SIDEBAR_NAV_AREA,
  STATUSBAR_AREAS,
  SandboxedFrame,
  haptic,
  host,
  useQuery
} from '@hermes/plugin-sdk'
import { useEffect, useRef } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'swarm-studio'
const ROUTE = '/swarm'

function useCanvas(ctx) {
  return useQuery({
    queryKey: [ID, 'canvas'],
    queryFn: () => ctx.rest('/canvas'),
    staleTime: 60_000,
    retry: 1
  })
}

const linkOk = u => typeof u === 'string' && u.length < 2048 && /^https?:\/\/[^\s]+$/.test(u)

function useLinkDoor(ctx, frame) {
  useEffect(() => {
    const onMessage = async ev => {
      const m = ev.data
      if (!frame.current || ev.source !== frame.current.contentWindow || !m || typeof m !== 'object') return
      if (m.type === 'swarm-studio:copy' && linkOk(m.text)) {
        const ok = await ctx.os.writeClipboard(m.text).catch(() => false)
        ev.source.postMessage({ type: 'swarm-studio:copied', id: m.id, ok: !!ok }, '*')
      } else if (m.type === 'swarm-studio:open' && linkOk(m.url)) {
        ctx.os.openExternal(m.url)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [ctx])
}

function Canvas({ ctx }) {
  const { data, isLoading, error, refetch } = useCanvas(ctx)
  const frame = useRef(null)
  useLinkDoor(ctx, frame)

  if (isLoading) {
    return jsx('div', { className: 'p-3 text-xs text-(--ui-text-quaternary)', children: 'Starting the swarm canvas…' })
  }
  if (error || !data || !data.url) {
    return jsxs('div', {
      className: 'flex h-full flex-col items-center justify-center gap-2 p-4',
      children: [
        jsx(EmptyState, {
          title: 'Canvas unavailable',
          description: (data && data.error) || 'Is the swarm-studio plugin enabled, and was the gateway restarted after installing it?'
        }),
        jsx(Button, { size: 'xs', variant: 'secondary', onClick: () => refetch(), children: 'Try again' })
      ]
    })
  }

  return jsxs('div', {
    className: 'flex h-full min-h-0 flex-col',
    children: [
      jsxs('div', {
        className: 'flex items-center gap-2 border-b border-(--ui-stroke-secondary) px-2 py-1',
        children: [
          jsx('span', { className: 'text-[0.6875rem] font-medium uppercase tracking-wide text-(--ui-text-tertiary)', children: 'swarm studio' }),
          jsx('span', { className: 'flex-1' }),
          jsx(Button, {
            size: 'xs',
            variant: 'ghost',
            onClick: () => {
              haptic('tap')
              ctx.os.openExternal(data.url)
            },
            children: 'open in browser'
          })
        ]
      }),
      jsx('div', {
        className: 'min-h-0 flex-1',
        children: jsx(SandboxedFrame, { ref: frame, src: data.url, title: 'Swarm Studio canvas', sandbox: 'allow-scripts allow-forms', className: 'size-full' })
      })
    ]
  })
}

function Chip({ ctx }) {
  const { data } = useQuery({
    queryKey: [ID, 'state'],
    queryFn: () => ctx.rest('/state'),
    refetchInterval: 3000
  })
  const working = (data && data.working) || 0
  const label = !data || data.running === false ? 'swarm off' : working ? `🐝 ${working} building` : 'swarm idle'
  return jsx('button', {
    type: 'button',
    className: 'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] text-(--ui-text-tertiary) hover:text-foreground',
    onClick: () => {
      haptic('tap')
      host.notify({ kind: 'info', message: data && data.run ? `Swarm run ${data.run}: ${data.done ? 'done' : 'building'}` : 'No swarm run yet' })
    },
    children: label
  })
}

function Page({ ctx }) {
  return jsx('div', { className: 'flex h-full min-h-0 flex-col', children: jsx(Canvas, { ctx }) })
}

export default {
  id: ID,
  name: 'Swarm Studio',
  register(ctx) {
    ctx.registerMany([
      { id: 'page', area: ROUTES_AREA, data: { path: ROUTE }, render: () => jsx(Page, { ctx }) },
      { id: 'nav', area: SIDEBAR_NAV_AREA, data: { path: ROUTE, label: 'Swarm Studio', codicon: 'organization' } },
      {
        id: 'pane',
        area: PANES_AREA,
        title: 'swarm',
        data: { placement: 'right', dock: { pane: 'workspace', pos: 'right' }, width: '560px', minWidth: '360px' },
        render: () => jsx(Canvas, { ctx })
      },
      { id: 'chip', area: STATUSBAR_AREAS.right, order: 141, render: () => jsx(Chip, { ctx }) }
    ])
  }
}
