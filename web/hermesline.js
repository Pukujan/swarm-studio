// @ts-check
// The line under the Make box while Hermes is not there to answer the model (#541): why, what to do, and Check
// again. It stays until Hermes is there or the box is used again; a toast would fade before it was read.

const hermesLineEsc = (/** @type {unknown} */ s) => String(s ?? '').replace(/[&<>"']/g, c => /** @type {string} */ ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

/** @type {HTMLElement | null} */
let hermesLineShown = null

/**
 * Shows the line after `box` while `off` names why Hermes is not there, else takes it away. True while it is shown.
 * @param {Element} box the Make box
 * @param {{ message?: string, action?: string } | null} off
 * @param {() => void} again Check again
 * @returns {boolean}
 */
export function hermesLine(box, off, again) {
  hermesLineShown?.remove()
  hermesLineShown = null
  if (!off) return false
  const line = document.createElement('p')
  line.className = 'hm-off'
  line.setAttribute('role', 'status')
  line.innerHTML = `<span>${hermesLineEsc(off.message)} ${hermesLineEsc(String(off.action || '').replace(/`/g, ''))}</span><button type="button" class="btn ghost sm">Check again</button>`
  line.querySelector('button')?.addEventListener('click', again)
  box.after(line)
  hermesLineShown = line
  return true
}
