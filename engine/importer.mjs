// The Studio's first step, What you have (decision 0015): the person drops a PDF or a file, or gives a website,
// and the crew reads it and fills in what it finds, "so they dont have to fill it out like a form". What it fills
// in is what the walk asks next: what it is (the idea), who it is for and its pages. It never overwrites what the
// person already said (server/server.mjs `readWhatYouHave`).
//
// The text: a PDF through unpdf (engine/vendor/pdf, PDF.js without a browser), a text or Markdown file as it is,
// and a website through the page reader every link read uses (engine/chatmedia.mjs readPage: public addresses
// only, each redirect checked). A picture, a clip or a sound has no words to read: it stays a reference.
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { readPage } from './chatmedia.mjs'

const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n)
const READ_MAX = 8000
// a long PDF is read from its start only: what the walk needs is on its first pages, and the rest is never parsed
const PDF_PAGES = 20

// the words in a reference: { text } or { note } when there are none to read
export async function textOf(ref, { file = null, page = readPage } = {}) {
  if (ref.kind === 'link') {
    const p = await page(ref.url)
    const text = [p.title, p.description, p.text].filter(Boolean).join('\n')
    return text.trim() ? { text: text.slice(0, READ_MAX) } : { note: 'the page has no words to read' }
  }
  const ext = extname(String(ref.name || '')).slice(1).toLowerCase()
  if (!file || !['pdf', 'txt', 'md'].includes(ext)) return { note: 'nothing to read in it' }
  const buf = readFileSync(file)
  if (ext !== 'pdf') return { text: buf.toString('utf8').slice(0, READ_MAX) }
  const { getDocumentProxy } = await import('./vendor/pdf/pdf.mjs')
  const doc = await getDocumentProxy(new Uint8Array(buf))
  try {
    let text = ''
    for (let i = 1; i <= Math.min(doc.numPages, PDF_PAGES) && text.length < READ_MAX; i++) {
      const items = (await (await doc.getPage(i)).getTextContent()).items
      text += `${items.map(x => `${x.str || ''}${x.hasEOL ? '\n' : ''}`).join('')}\n`
    }
    return text.trim() ? { text: text.slice(0, READ_MAX) } : { note: 'the PDF has no text in it (a scan?)' }
  } finally { doc.destroy?.() }
}

const READ_RULES = `You read what a person brought to start a project: their own document, notes or website. Find what they would otherwise type into a form. Use only what the text says; leave a field empty when it does not say. Return JSON only:
{"idea":"one or two sentences: what they want made and what it is about","what":"what it is, under 120 characters","who":"who it is for, under 120 characters","pages":["the pages or sections it names, at most 8, each a few words"]}`

// what the text says, as the walk's fields. chat(messages) -> text, or null for no model: then the first line is
// what it is and the opening words the idea, and nothing is guessed.
export async function findIn(text, { chat = null } = {}) {
  const t = String(text || '').trim()
  if (!t) return null
  let said = null
  if (chat) {
    try {
      const out = String(await chat([{ role: 'system', content: READ_RULES }, { role: 'user', content: t.slice(0, READ_MAX) }]) || '')
      said = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1))
    } catch { said = null }
  }
  const lines = t.split(/\n+/).map(l => clip(l, 300)).filter(Boolean)
  const first = lines[0] || ''
  const pages = Array.isArray(said?.pages) ? said.pages.map(p => clip(p, 40)).filter(Boolean).slice(0, 8) : []
  return {
    idea: clip(said?.idea || lines.slice(0, 3).join(' '), 400),
    what: clip(said ? said.what : first, 120),
    who: clip(said?.who || '', 120),
    pages,
    by: said ? 'model' : 'words'
  }
}
