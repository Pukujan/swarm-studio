// Mermaid for the next UI (spec 44, the app build wall's Map): the pinned copy the plugin's server serves at
// /next/vendor/mermaid.min.js (ui/vite.config.ts copies it there; a classic script, so the Desktop pane's frame can
// load it), fetched the first time a diagram shows, never from anywhere else. It renders with securityLevel strict:
// the diagram's labels are the person's words and no script or link in them runs.
interface Mermaid {
  initialize(config: Record<string, unknown>): void
  render(id: string, text: string): Promise<{ svg: string }>
}
declare global { interface Window { mermaid?: Mermaid } }

let loading: Promise<Mermaid> | null = null

export function loadMermaid(src = '/next/vendor/mermaid.min.js'): Promise<Mermaid> {
  if (window.mermaid) return Promise.resolve(window.mermaid)
  loading ||= new Promise<Mermaid>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => (window.mermaid ? resolve(window.mermaid) : reject(new Error('Mermaid did not load')))
    s.onerror = () => { loading = null; reject(new Error('Mermaid did not load')) }
    document.head.append(s)
  })
  return loading.then(m => {
    const dark = document.documentElement.dataset.theme !== 'light' && !matchMedia('(prefers-color-scheme: light)').matches
    m.initialize({ startOnLoad: false, securityLevel: 'strict', theme: dark ? 'dark' : 'neutral', fontFamily: getComputedStyle(document.body).fontFamily, flowchart: { htmlLabels: true }, er: { useMaxWidth: true } })
    return m
  })
}

let n = 0
// one diagram's SVG, or the reason it has none
export async function renderMermaid(text: string): Promise<{ svg: string } | { error: string }> {
  try {
    const m = await loadMermaid()
    return await m.render(`mm-${++n}`, text)
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
