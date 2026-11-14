// The server, as Setup and Settings ask it: every request carries the token the server put in the page
// (window.SWARM). A route that does not answer gives null, never a throw: each row fills in when its own answer
// comes, so one slow or missing route never holds the sheet. (The brand and Projects ports add the same helper;
// it moves to one shared file once they have merged.)

export const get = <T>(path: string): Promise<T | null> =>
  fetch(path, { headers: { 'x-swarm-token': window.SWARM?.token || '' } })
    .then(r => (r.ok ? r.json() as Promise<T> : null))
    .catch(() => null)

export const post = <T>(path: string, body: unknown): Promise<T | null> =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-swarm-token': window.SWARM?.token || '' }, body: JSON.stringify(body) })
    .then(r => r.json() as Promise<T>)
    .catch(() => null)
