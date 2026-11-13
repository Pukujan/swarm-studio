// The crew's marks (web/crew.js, as @studio/crew): one shade and one avatar per agent name, the same in both apps.
// The file is a classic script that sets window.SwarmCrew; importing it runs it once.
import '@studio/crew'

interface SwarmCrew {
  color(name: string): string
  ink(color: string): string
  // an <svg> string, drawn from the name in code (no outside data in it)
  avatar(name: string, size?: number): string
}

const fallback: SwarmCrew = { color: () => '#f4f4f5', ink: () => '#0b0b0c', avatar: () => '' }

export const crew = (): SwarmCrew => (window as unknown as { SwarmCrew?: SwarmCrew }).SwarmCrew ?? fallback
