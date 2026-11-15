// @ts-check
// Back to the new Studio from a project in the classic one (decision 0024): ☰ → Use the new Studio makes `/` the
// new UI again (POST /api/ui) and opens it at the same address, the project still open. Projects' account menu has
// the same row; this one is for a project, where that menu is not shown.

/**
 * @param {HTMLElement | null} btn  ☰'s row
 * @param {{ api: (path: string, opts?: RequestInit) => Promise<Response> }} sw  the studio's server door
 */
export function toNewStudio(btn, sw) {
  if (!btn) return
  btn.onclick = () => {
    sw.api('/api/ui', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ui: 'next' }) })
      .catch(() => null)
      .then(() => location.assign(`/${location.search}`))
  }
}
