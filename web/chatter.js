// Swarm chatter (spec 07 B): the crew "talk" in short, cute gibberish syllables, synthesised
// live with Web Audio (an oscillator through two formant filters, a pitch envelope per
// syllable). No recordings, nothing to license, no film voices or catchphrases.
//
// Each agent's voice is seeded from its name (base pitch, speed, vibrato, timbre), so the same
// agent always sounds the same. Hermia, the commander, has a warmer, lower voice.
//
// Quiet by default: off until the person turns it on in the dock, 35% volume, remembered.
// At most 2 voices at once, never the same agent twice in a row, one sound per 400 ms.
// Muted while the tab is hidden and on the Swarm Wall; ?chatter=1 turns it on on purpose
// (demo recordings), ?chatter=0 keeps it off.
//
// A classic script (window.SwarmChatter), like crew.js. It never touches the build: the canvas
// hands it the same events it draws, and it only makes sound.
;(function () {
  const Q = new URLSearchParams(location.search)
  const KEY = 'swarm.chatter'
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {} } catch { return {} } }
  const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch {} }
  const saved = read()
  const st = { on: !!saved.on, volume: typeof saved.volume === 'number' ? saved.volume : 0.35 }
  if (Q.get('chatter') === '1') st.on = true
  if (Q.get('chatter') === '0' || Q.get('wall') === '1') st.on = false
  const forcedOff = Q.get('chatter') === '0' || Q.get('wall') === '1'

  let ctx = null, master = null, noiseBuf = null
  const busy = { voices: 0, at: 0, who: '' }
  const talkers = new Set()
  const lines = { run: '', said: 0 }
  let fetcher = null

  // FNV-1a, the same hash as crew.js
  function hash(s) {
    let h = 0x811c9dc5
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0 }
    return h >>> 0
  }

  // ---------- voices
  const TIMBRES = {
    squeaky: { wave: 'square', formant: 1.45, q: 9, noise: 0 },
    round: { wave: 'triangle', formant: 1.15, q: 6, noise: 0 },
    raspy: { wave: 'sawtooth', formant: 1.25, q: 7, noise: 0.16 },
    breathy: { wave: 'triangle', formant: 1.3, q: 5, noise: 0.32 }
  }
  const vcache = new Map()
  function voice(name) {
    name = String(name || 'crew')
    if (vcache.has(name)) return vcache.get(name)
    let v
    if (/^hermia$/i.test(name)) v = { base: 150, speed: 0.88, vib: 4.5, depth: 0.012, timbre: 'round' }
    else {
      const h = hash(name)
      v = {
        base: 180 + (h % 341), // 180–520 Hz
        speed: 0.82 + ((h >>> 9) % 46) / 100, // 0.82–1.27
        vib: 4 + ((h >>> 15) % 6), // 4–9 Hz
        depth: 0.008 + ((h >>> 18) % 5) / 200, // 0.8–2.8 %
        timbre: ['squeaky', 'round', 'raspy', 'breathy'][(h >>> 21) % 4]
      }
    }
    vcache.set(name, v)
    return v
  }

  // vowel formants (F1, F2), scaled up per timbre: they are small creatures
  const VOWEL = { a: [800, 1200], i: [300, 2300], o: [450, 800], u: [330, 900], e: [500, 1900], w: [300, 700] }
  const syllable = s => {
    const m = /^([^aeiou]*)([aeiou]+)/.exec(s) || ['', '', 'a']
    const c = m[1], vw = m[2].includes('oo') ? 'u' : m[2].includes('aw') ? 'o' : m[2][0]
    return { plosive: /^[bpdtkg]/.test(c), soft: /^[mlwnh]/.test(c) || !c, vowel: VOWEL[vw] || VOWEL.a }
  }
  const SYLS = ['ba', 'mi', 'po', 'ta', 'loo', 'pi', 'do', 'ni', 'pa', 'ti', 'mo', 'bu']

  // ---------- the audio graph
  function ensure() {
    if (ctx) return ctx.state === 'suspended' && !document.hidden ? (ctx.resume().catch(() => {}), ctx) : ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
    master = ctx.createGain()
    master.gain.value = st.volume
    // a gentle compressor, so a crowd cheer does not clip
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -18; comp.ratio.value = 4
    master.connect(comp).connect(ctx.destination)
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return ctx
  }
  const ready = () => st.on && !document.hidden && ensure() && ctx.state !== 'closed'

  function noise(t, dur, { freq = 2000, q = 1, gain = 0.3, sweep = 0 } = {}) {
    const n = ctx.createBufferSource()
    n.buffer = noiseBuf
    n.loopStart = Math.random() * 0.5
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + Math.min(0.02, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    n.connect(f).connect(g).connect(master)
    n.start(t, n.loopStart); n.stop(t + dur + 0.02)
  }

  // one syllable: pitch glides from p0 to p1 (multiples of the voice's base) over dur seconds
  function syl(t, v, text, p0, p1, dur, loud = 1) {
    const tb = TIMBRES[v.timbre], s = syllable(text)
    dur /= v.speed
    const osc = ctx.createOscillator()
    osc.type = tb.wave
    osc.frequency.setValueAtTime(v.base * p0, t)
    osc.frequency.exponentialRampToValueAtTime(v.base * p1, t + dur)
    // vibrato
    const lfo = ctx.createOscillator(), lg = ctx.createGain()
    lfo.frequency.value = v.vib; lg.gain.value = v.base * v.depth
    lfo.connect(lg).connect(osc.frequency)
    // two formants in parallel
    const out = ctx.createGain()
    for (const [i, f] of s.vowel.entries()) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'; bp.frequency.value = f * tb.formant; bp.Q.value = tb.q
      const g = ctx.createGain(); g.gain.value = i ? 0.7 : 1
      osc.connect(bp).connect(g).connect(out)
    }
    // a little of the raw tone keeps it from sounding thin
    const dry = ctx.createGain(); dry.gain.value = 0.12
    osc.connect(dry).connect(out)
    const env = ctx.createGain()
    const peak = 0.55 * loud, attack = s.soft ? 0.035 : 0.008
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(peak, t + attack)
    env.gain.setValueAtTime(peak, t + dur * 0.6)
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    out.connect(env).connect(master)
    osc.start(t); lfo.start(t); osc.stop(t + dur + 0.03); lfo.stop(t + dur + 0.03)
    if (s.plosive) noise(t, 0.018, { freq: 3500, q: 0.8, gain: 0.18 * loud })
    if (tb.noise) noise(t, dur, { freq: s.vowel[1] * tb.formant, q: 2, gain: tb.noise * loud })
    return dur
  }

  // a run of syllables with a pitch contour; returns its length in ms
  function phrase(name, syls, contour, { gap = 0.03, len = 0.11, at = 0, loud = 1 } = {}) {
    const v = voice(name)
    let t = ctx.currentTime + 0.02 + at
    const t0 = t
    syls.forEach((s, i) => {
      const p = contour[i] ?? 1, next = contour[i + 1] ?? p
      t += syl(t, v, s, p, (p + next) / 2 * (i === syls.length - 1 ? 1.04 : 1), len, loud) + gap
    })
    return (t - t0) * 1000
  }

  // the gate: at most 2 voices, one sound per 400 ms, never the same agent twice in a row
  function gate(who, ms, solo = false) {
    if (!ready()) return false
    const now = performance.now()
    if (now - busy.at < 400) return false
    if (busy.voices >= 2) return false
    if (who && who === busy.who && !solo) return false
    busy.at = now; busy.who = who || ''
    busy.voices++
    setTimeout(() => { busy.voices = Math.max(0, busy.voices - 1) }, Math.max(200, ms))
    return true
  }
  const talk = (name, ms) => { for (const f of talkers) try { f(name, ms) } catch {} }

  // ---------- the event sounds
  const SOUNDS = {
    // an agent starts a section or file: "bip-ba!"
    start: name => phrase(name, ['pi', 'ba'], [1.18, 0.98], { len: 0.085 }),
    // section or file done: a rising "woo-pa-ti!"
    done: name => phrase(name, ['woo', 'pa', 'ti'], [0.9, 1.12, 1.4], { len: 0.1 }),
    // failed: a falling "awww"
    fail: name => phrase(name, ['aw'], [1.15, 0.62], { len: 0.5 }),
    // the retry: a determined "hup!"
    retry: name => phrase(name, ['hup'], [1.05, 1.2], { len: 0.09, loud: 1.1 }),
    // the reviewer flags something: a short gasp (an in-breath, then a squeak up)
    gasp: name => {
      const t = ctx.currentTime + 0.02
      noise(t, 0.22, { freq: 900, q: 3, gain: 0.35, sweep: 2.6 })
      return 220 + phrase(name, ['ha'], [1.3, 1.7], { len: 0.08, at: 0.2, loud: 0.8 })
    }
  }

  // A sound for one event, by one agent. Returns true when it played.
  function play(kind, name) {
    const fn = SOUNDS[kind]
    if (!fn || !gate(name, 500)) return false
    const ms = fn(name)
    talk(name, ms)
    return true
  }

  // Break room bubble: 2–4 syllables, picked from the text so the same line babbles the same way
  function babble(name, text = '') {
    const h = hash(String(text) + name)
    const n = 2 + (h % 3)
    const syls = Array.from({ length: n }, (_, i) => SYLS[(h >>> (i * 4)) % SYLS.length])
    const q = /\?$/.test(String(text).trim()), x = /!|😤|😠|⚔️/.test(text)
    const contour = syls.map((_, i) => 1 + (((h >>> (i * 3 + 7)) % 7) - 3) / 22 + (q && i === n - 1 ? 0.3 : 0) + (x ? 0.08 : 0))
    if (!gate(name, 300 * n)) return false
    talk(name, phrase(name, syls, contour, { len: 0.1 + ((h >>> 20) % 4) / 100 }))
    return true
  }

  // Step transition: a little fanfare chord (an arpeggio that lands on a major triad)
  function fanfare() {
    if (!gate('', 900, true)) return false
    const t = ctx.currentTime + 0.02
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'triangle'; o.frequency.value = f
      const at = t + i * 0.07
      g.gain.setValueAtTime(0.0001, at)
      g.gain.exponentialRampToValueAtTime(0.22, at + 0.02)
      g.gain.setValueAtTime(0.22, t + 0.42)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95)
      o.connect(g).connect(master)
      o.start(at); o.stop(t + 1)
    })
    return true
  }

  // Deploy ready: the whole crew cheers (each voice, staggered) over a clap texture
  function cheer(names = []) {
    if (!gate('', 1600, true)) return false
    const crew = [...new Set(['Hermia', ...names])].slice(0, 9)
    crew.forEach((n, i) => {
      const r = (hash(n) % 100) / 100
      phrase(n, [r < 0.5 ? 'woo' : 'ya', 'hoo'], [1, 1.45 + r * 0.2], { at: i * 0.07 + r * 0.12, len: 0.16, loud: 0.55 })
      talk(n, 900)
    })
    const t = ctx.currentTime + 0.05
    for (let i = 0; i < 26; i++) noise(t + Math.random() * 1.3, 0.05, { freq: 1100 + Math.random() * 900, q: 1.2, gain: 0.22 })
    return true
  }

  // About 3 times a run, one agent says one real short line. It comes from the studio's
  // TTS (the server proxies the Pro's TTS job and caches it by text); without one, the
  // browser's own speech voice, pitched per agent; without either, the agent babbles.
  async function line(name, text) {
    if (lines.said >= 3 || !ready()) return false
    if (!gate(name, 1400)) return false
    lines.said++
    const v = voice(name)
    try {
      const r = fetcher ? await fetcher(`/api/chatter/say?text=${encodeURIComponent(text)}&who=${encodeURIComponent(name)}`) : null
      if (r?.ok) {
        const buf = await ctx.decodeAudioData(await r.arrayBuffer())
        const src = ctx.createBufferSource()
        src.buffer = buf
        src.playbackRate.value = 1.2 // sped up 1.2× (about +3 semitones) …
        src.detune.value = 150 + (hash(name) % 150) // … plus 1.5–3 more: 4.5–6 in all
        if (/^hermia$/i.test(name)) { src.playbackRate.value = 1.08; src.detune.value = 0 }
        src.connect(master)
        src.start()
        talk(name, buf.duration / src.playbackRate.value * 1000)
        return true
      }
    } catch {}
    try {
      if ('speechSynthesis' in window && speechSynthesis.getVoices().length) {
        const u = new SpeechSynthesisUtterance(text)
        u.pitch = Math.min(2, 0.6 + (v.base - 120) / 260) // Hermia low, the crew high
        u.rate = Math.min(1.6, 0.95 + v.speed * 0.3)
        u.volume = st.volume
        speechSynthesis.speak(u)
        talk(name, 300 + text.length * 70)
        return true
      }
    } catch {}
    const syls = String(text).split(/\s+/).slice(0, 4).map((_, i) => SYLS[(hash(text) >>> (i * 3)) % SYLS.length])
    talk(name, phrase(name, syls, syls.map((_, i) => 1 + i * 0.08)))
    return true
  }

  // ---------- settings and auto-mute
  function setOn(on) {
    if (forcedOff) on = false
    st.on = !!on
    write({ on: st.on, volume: st.volume })
    if (st.on) ensure()
    else try { speechSynthesis?.cancel() } catch {}
    emit()
  }
  function setVolume(v) {
    st.volume = Math.max(0, Math.min(1, Number(v) || 0))
    if (master) master.gain.setTargetAtTime(st.volume, ctx.currentTime, 0.05)
    write({ on: st.on, volume: st.volume })
    emit()
  }
  const watchers = new Set()
  const emit = () => { for (const f of watchers) try { f({ ...st }) } catch {} }
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return
    if (document.hidden) { ctx.suspend().catch(() => {}); try { speechSynthesis?.cancel() } catch {} }
    else if (st.on) ctx.resume().catch(() => {})
  })

  window.SwarmChatter = {
    get on() { return st.on }, get volume() { return st.volume },
    setOn, setVolume, voice, play, babble, fanfare, cheer, line,
    // a new run gets its own 3 real lines
    run(id) { if (id && id !== lines.run) { lines.run = id; lines.said = 0 } },
    // the canvas hands over its token-carrying fetch, and listens for who is talking (mouths)
    setup({ fetch } = {}) { fetcher = fetch || null },
    onTalk(f) { talkers.add(f) },
    watch(f) { watchers.add(f); f({ ...st }) }
  }
})()
