// The classic Studio, one click away (decision 0024): `/` is the next UI, `/classic/` the classic Studio at the same
// address (?project=…&version=…&room=…). A screen the next UI has not moved opens there, and "Use the classic Studio"
// makes `/` open it until "Use the new Studio" there (server/uichoice.mjs).

// the classic Studio at this address (or another search)
export const classicHref = (search: string = location.search) => `/classic/${search}`

// the person chose the classic Studio: `/` opens it from now on, and it opens here at once
export async function openClassic() {
  await fetch(`${window.SWARM?.base || ''}/api/ui`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': window.SWARM?.token ?? '' }, body: JSON.stringify({ ui: 'classic' }) }).catch(() => null)
  location.assign(classicHref())
}
