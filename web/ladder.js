// @ts-check
// The image service's size ladder (engine/images.mjs LADDER): a generated page's picture asks for the size it
// shows. An <img> whose address the studio serves (/img/…) gets the ladder as srcset, and sizes="100vw" unless it
// already says its own; any other picture, and one that already has a srcset, is left alone.
export const LADDER = [64, 128, 256, 512, 1024, 2048]

/** @param {Element} img @param {string} src */
export function ladder(img, src) {
  if (!/^\/img\/(?:[a-f0-9]{32}|[\w-]{1,64}\/[\w.-]{1,120})$/.test(src)) { if (img.hasAttribute('data-ladder')) { img.removeAttribute('srcset'); img.removeAttribute('data-ladder') } return }
  if (img.hasAttribute('srcset') && !img.hasAttribute('data-ladder')) return
  img.setAttribute('srcset', LADDER.map(w => `${src}?w=${w} ${w}w`).join(', '))
  img.setAttribute('data-ladder', '')
  if (!img.hasAttribute('sizes')) img.setAttribute('sizes', '100vw')
}
