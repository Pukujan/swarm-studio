import { test } from 'node:test'
import assert from 'node:assert/strict'
import { privateAddress, publicUrl, readPage, pageFacts, pageRead, linksIn, refLine, withRefs, mediaKind, mediaName } from '../engine/chatmedia.mjs'

const lookupTo = ip => async () => [{ address: ip }]

test('private and tailnet addresses are refused, public ones pass', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '192.168.0.4', '172.20.1.1', '169.254.169.254', '100.118.248.35', '0.0.0.0', '::1', 'fd7a:115c::1', 'fe80::1', '::ffff:127.0.0.1']) assert.equal(privateAddress(ip), true, ip)
  for (const ip of ['93.184.216.34', '142.250.80.46', '2606:4700::6810:85e5']) assert.equal(privateAddress(ip), false, ip)
})

test('a link must be an ordinary public web page', async () => {
  await assert.rejects(publicUrl('file:///etc/passwd'), /not a link/)
  await assert.rejects(publicUrl('http://localhost:4319/api/me'), /ordinary web links|public/)
  await assert.rejects(publicUrl('http://octo-vps.tail1234.ts.net/'), /public/)
  await assert.rejects(publicUrl('https://example.com/', { lookup: lookupTo('10.0.0.5') }), /public/)
  await assert.rejects(publicUrl('https://example.com:8443/', { lookup: lookupTo('93.184.216.34') }), /ordinary/)
  assert.equal((await publicUrl('https://example.com/a', { lookup: lookupTo('93.184.216.34') })).href, 'https://example.com/a')
})

test('a redirect to a private address is refused', async () => {
  const lookup = async host => [{ address: host === 'example.com' ? '93.184.216.34' : '127.0.0.1' }]
  const fetch = async () => new Response(null, { status: 302, headers: { location: 'http://inside.example/' } })
  await assert.rejects(readPage('https://example.com/', { fetch, lookup }), /public/)
})

test('a page is read for its title, description, words and picture', async () => {
  const html = '<html><head><title>Old</title><meta property="og:title" content="Rat &amp; Co"><meta name="description" content="Pet rats, cared for."><meta property="og:image" content="/hero.jpg"></head><body><nav>menu</nav><main><h1>Hello</h1><script>x()</script><p>Warm cream rooms.</p></main></body></html>'
  const fetch = async () => new Response(html, { headers: { 'content-type': 'text/html' } })
  const p = await readPage('https://example.com/rats', { fetch, lookup: lookupTo('93.184.216.34') })
  assert.equal(p.title, 'Rat & Co')
  assert.equal(p.description, 'Pet rats, cared for.')
  assert.equal(p.image, 'https://example.com/hero.jpg')
  assert.equal(p.text, 'Hello Warm cream rooms.')
  const r = pageRead(p)
  assert.equal(r.by, 'page')
  assert.match(r.text, /Title: Rat & Co/)
  assert.equal(pageRead(pageFacts('', 'https://x.test/')).by, 'none')
})

test('links in a message, kinds and safe names', () => {
  assert.deepEqual(linksIn('look at https://a.com/x, and http://b.org. and https://c.net'), ['https://a.com/x', 'http://b.org'])
  assert.equal(mediaKind('a.JPG'), 'image')
  assert.equal(mediaKind('clip.mov'), 'video')
  assert.equal(mediaKind('song.m4a'), 'audio')
  assert.equal(mediaKind('doc.pdf'), null)
  assert.match(mediaName('../../etc/x.png'), /^[\w][\w .()+-]*\.png$/)
})

test('the planner is told honestly how each thing was read', () => {
  const pic = { kind: 'image', name: 'shop.jpg', read: { by: 'vision', text: 'A cream shop front.' } }
  const vid = { kind: 'video', name: 'walk.mp4', read: { by: 'none', text: '' } }
  const bad = { kind: 'image', name: 'big.png', read: { by: 'none', text: 'no vision model is set' } }
  const link = { kind: 'link', url: 'https://a.com', read: { by: 'page', text: 'Title: A' } }
  assert.match(refLine(pic), /vision model looked at it: A cream shop front/)
  assert.match(refLine(vid), /could watch it, so it is kept but not read|could watch/)
  assert.doesNotMatch(refLine(vid), /looked/)
  assert.match(refLine(bad), /could not be read \(no vision model is set\)/)
  assert.match(refLine(link), /page was read \(not seen\)/)
  // a clip or a sound read by the media reader says exactly what was seen and heard
  const seen = { kind: 'video', name: 'walk.mp4', read: { by: 'media', says: 'saw 9 frames of it and heard its sound (words and music)', text: 'A night market; slow lo-fi beat.' } }
  assert.match(refLine(seen), /The media model saw 9 frames of it and heard its sound \(words and music\): A night market/)
  const framesOnly = { kind: 'video', name: 'walk.mp4', read: { by: 'vision', says: 'saw 9 frames of it; nothing here could hear its sound', text: 'A night market.' } }
  assert.match(refLine(framesOnly), /nothing here could hear its sound/)
  const deaf = { kind: 'audio', name: 'note.m4a', read: { by: 'none', says: 'not read: no model that hears is set' } }
  assert.match(refLine(deaf), /Nothing here could listen to it \(no model that hears is set\), so it is kept but not read/)
  const yt = { kind: 'link', url: 'https://www.youtube.com/watch?v=x', read: { by: 'page', text: 'Title: A song' } }
  assert.match(refLine(yt), /the video itself was not watched or heard/)
  assert.doesNotMatch(refLine(link), /not watched/)
  const t = withRefs('like this', [pic, vid])
  assert.match(t, /^like this\n\n\[What they attached/)
  assert.match(t, /Never describe what was not read/)
  assert.equal(withRefs('plain', []), 'plain')
})
