// @ts-check
// A new game's talk handed over in the address (decision 0024): the next UI's Make › Game › Studio opens the
// classic Studio at /classic/?game=<the words>, because a game's Studio is its Plan board beside its talk, and the
// talk has not moved yet. The words leave the address at once, so a reload starts no second talk.

/** @param {{ talkGame: (o: { text: string }) => void }} C */
export function takeGameTalk(C) {
  const u = new URL(location.href)
  const text = (u.searchParams.get('game') || '').trim().slice(0, 2000)
  if (!text) return
  u.searchParams.delete('game')
  history.replaceState(history.state, '', u)
  setTimeout(() => C.talkGame({ text }), 0)
}
