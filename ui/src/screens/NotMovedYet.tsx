// A screen still drawn by the current Studio: its name and the one way there, at the same address (both apps read
// and write the same one, so the person lands on the same project, version, room and player)
import { LinkButton } from '../primitives/Button'
import { search } from '../nav/address'
import { useNav } from '../nav/NavProvider'
import { SCREEN_NAMES } from './names'

export function NotMovedYet() {
  const { view } = useNav()
  return (
    <section className="grid min-h-[60dvh] place-content-center justify-items-center gap-6 p-6 text-center">
      <h1 className="font-display text-5xl font-extrabold uppercase">{SCREEN_NAMES[view.room]}</h1>
      <LinkButton role="primary" href={`/${search(view, location.search)}`}>Open in the Studio</LinkButton>
    </section>
  )
}
