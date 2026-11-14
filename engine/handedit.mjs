// Manual edit (docs/specs/29-chats-references-marks.md, "Manual edit"): a person's hand changes to a
// section are saved as section versions (`layer:done` with `by` and a `why` of "hand: …"). When the crew
// reworks that section later, its builder is told what was changed by hand since its own last version,
// so it keeps those changes instead of writing over them.

// the kinds of hand change made to one section since the crew last wrote it, in order, without repeats
export function handChanges(events, page, layer) {
  let out = []
  for (const e of events || []) {
    if (e?.type !== 'layer:done' || e.page !== page || e.layer !== layer) continue
    const why = typeof e.why === 'string' ? e.why : ''
    if (e.by && /^hand: /.test(why)) { const w = why.slice(6).trim(); if (w && !out.includes(w)) out.push(w) }
    else if (!e.restored) out = []
  }
  return out
}

// the rework request with the note about hand changes, when there were any
export function keepHand(comment, changes) {
  if (!changes?.length) return comment
  return `${comment}\n\nThe person changed this section by hand (${changes.join(', ')}); the HTML you have includes those changes. Keep them as they are and change only what is asked.`
}
