// Cast from real models (docs/specs/19-cast-from-real-models.md).
//
// A game's characters are not built from primitive blocks. The crew searches
// VRoid Hub and Sketchfab for polished, rigged anime models, keeps only the ones
// whose licence lets someone else put them in a game (with violence, when the
// game has combat), drops adult models, child-looking models and fan models of
// existing games and anime, and ranks the rest by hearts and likes. The person
// picks from a numbered shortlist on the canvas; the picks are loaded into the
// game, given its cel and outline shader when the licence allows a restyle, and
// credited in the game and on its site.
//
// Only the two official APIs. Never ripped game-asset sites (skowt.cc and the like).

const VROID = 'https://hub.vroid.com/api/search/character_models'
const SKETCHFAB = 'https://api.sketchfab.com/v3/search'

// Fan models of existing IP, adult and child-looking models: never shown.
// Matched on whole words in the name, tags and title, after lowercasing.
export const BLOCK = {
  ip: [
    // HoYoverse and its games and characters people model most
    'hoyoverse', 'mihoyo', 'genshin', 'honkai', 'star rail', 'hsr', 'zenless', 'zzz', 'raiden', 'kafka', 'firefly', 'march 7th',
    'acheron', 'hutao', 'hu tao', 'furina', 'ellen joe', 'jane doe', 'miyabi', 'nahida', 'ganyu', 'kiana', 'mei raiden', 'elysia', 'silver wolf',
    // other games
    'nikke', 'blue archive', 'arknights', 'azur lane', 'wuthering waves', 'punishing gray raven', 'fate grand order', 'fgo', 'nier', '2b',
    'overwatch', 'league of legends', 'valorant', 'final fantasy', 'tifa', 'aerith', 'pokemon', 'zelda', 'persona', 'touhou', 'umamusume',
    'cyberpunk 2077', 'lucy edgerunners', 'edgerunners', 'apex legends', 'fortnite',
    // Vocaloid
    'vocaloid', 'hatsune', 'miku', 'kagamine', 'megurine', 'luka', 'kaito', 'gumi', 'teto', 'project sekai',
    // popular anime
    'kill la kill', 'ryuuko', 'evangelion', 'rei ayanami', 'asuka', 'demon slayer', 'kimetsu', 'nezuko', 'jujutsu', 'gojo', 'naruto',
    'one piece', 'dragon ball', 'sailor moon', 'spy x family', 'yor forger', 'chainsaw man', 'makima', 'frieren', 'elaina',
    'rem', 're zero', 'konosuba', 'my hero academia', 'attack on titan', 'sword art online', 'asuna', 'oshi no ko', 'hololive', 'nijisanji',
    'bocchi', 'lycoris', 'ghost in the shell', 'motoko', 'kusanagi', 'war of the worlds', 'netflix', 'disney', 'marvel', 'star wars', 'delicious in dungeon', 'dungeon meshi', 'marcille', 'watamote', 'tomoko kuroki', 'spy family', 'mushoku tensei', 'genshin impact', 'azur', 'girls frontline', 'goddess of victory', 'idolmaster', 'love live', 'bang dream', 'zero two', 'darling in the franxx', 'violet evergarden', 'marin kitagawa', 'kamado',
    // made from someone else's work
    'fanart', 'fan art', 'fanmade', 'fan made', 'fan model', 'ripped', 'rip', 'game rip', 'mmd', 'cosplay', 'gmod', 'sfm', 'xps', 'xnalara', 'fortnite skin'
  ],
  adult: ['nsfw', 'r18', 'r-18', 'r15', 'r-15', 'nude', 'naked', 'hentai', 'lewd', 'ecchi', 'underwear', 'lingerie', 'bikini', 'swimsuit', 'topless', 'sexy'],
  young: ['loli', 'shota', 'child', 'kid', 'little girl', 'little boy', 'toddler', 'elementary']
}
// Japanese words (VRoid Hub is mostly Japanese) match anywhere, since the text has no spaces.
export const BLOCK_JA = {
  ip: ['原神', '崩壊', 'スターレイル', 'ゼンレスゾーンゼロ', 'ゼンゼロ', 'ブルアカ', 'ブルーアーカイブ', 'アークナイツ', 'ニケ', '初音ミク', 'ミク', 'ボカロ', 'ボーカロイド', '鏡音', '巡音', '重音テト', 'ホロライブ', 'にじさんじ', '二次創作', 'ファンアート', '東方', 'ウマ娘', 'エヴァ', '鬼滅', '呪術', 'プロセカ', 'ポケモン', '艦これ', 'アズールレーン', '鳴潮'],
  adult: ['水着', '下着', 'ランジェリー', 'ビキニ', '裸', 'ヌード', 'セクシー', 'えっち', 'エロ', 'シースルー'],
  young: ['ロリ', 'ショタ', '幼女', '子供', '小学生', '園児']
}
const BANNED_HOSTS = /skowt\.cc|models-resource|vg-resource|spriters-resource/i

const norm = t => ` ${String(t || '').toLowerCase().replace(/[_\-/·|()[\]{}:;,.!?'"“”]+/g, ' ').replace(/\s+/g, ' ').trim()} `
// the blocklist word that a model's text hits, or null
export function blockHit(text) {
  const t = norm(text)
  for (const [why, words] of Object.entries(BLOCK)) for (const w of words) if (t.includes(norm(w))) return { why, word: w }
  for (const [why, words] of Object.entries(BLOCK_JA)) for (const w of words) if (t.includes(w)) return { why, word: w }
  // "10 year old", "12yo", "age 14": any age under 18 named outright
  const age = t.match(/ (\d{1,2}) ?(?:year old|years old|yo|y o) |age (\d{1,2}) /)
  if (age && Number(age[1] || age[2]) < 18) return { why: 'young', word: age[0].trim() }
  return null
}

const yes = v => /^(allow|allowed|everyone|true|necessary|required)$/i.test(String(v ?? ''))
const lower = v => String(v ?? '').toLowerCase()

// VRoid Hub: the licence lives in the model's VRM meta (VRM 1.0 or 0.x), and the
// hub's own licence block, when there is one, must agree.
export function vroidLicence(m, { violent = true, commercial = false } = {}) {
  const v = m.latest_character_model_version || {}
  const meta = v.vrm_meta || {}
  const why = []
  const vrm1 = 'avatarPermission' in meta || String(v.spec_version || '').startsWith('1')
  let credit = true, restyle = true, money = false, author = ''
  if (vrm1) {
    author = (meta.authors || []).join(', ')
    if (meta.avatarPermission !== 'everyone') why.push('only its author may use it')
    if (violent && meta.allowExcessivelyViolentUsage !== true) why.push('no violence allowed')
    money = /corporation|personalprofit/i.test(meta.commercialUsage || '')
    credit = meta.creditNotation !== 'unnecessary'
    restyle = !!meta.modification && meta.modification !== 'prohibited'
  } else {
    author = meta.author || ''
    // VRoid Hub spells the 0.x keys correctly; VRM files spell them "Ussage"
    const pick = k => meta[`${k}UsageName`] ?? meta[`${k}UssageName`]
    if (lower(meta.allowedUserName) !== 'everyone') why.push('only its author may use it')
    if (violent && !yes(pick('violent'))) why.push('no violence allowed')
    money = yes(pick('commercial'))
    const lic = lower(meta.licenseName)
    credit = lic !== 'cc0'
    restyle = !/_nd$/.test(lic)
  }
  // the hub's own licence, when given, can only narrow what the VRM allows
  const hub = m.license
  if (hub) {
    if (hub.characterization_allowed_user && hub.characterization_allowed_user !== 'everyone' && !why.includes('only its author may use it')) why.push('only its author may use it')
    if (violent && hub.violent_expression === 'disallow' && !why.includes('no violence allowed')) why.push('no violence allowed')
    if (hub.modification === 'disallow') restyle = false
    if (hub.credit === 'necessary') credit = true
    if (hub.personal_commercial_use === 'disallow' && hub.corporate_commercial_use === 'disallow') money = false
  }
  if (commercial && !money) why.push('not for paid games')
  const name = m.name || m.character?.name || 'Untitled'
  const by = m.character?.user?.name || author || 'unknown'
  return {
    ok: why.length === 0, why, commercial: money, restyle,
    credit: `“${name}” by ${by} (VRoid Hub, ${vrm1 ? 'VRM 1.0' : 'VRM 0.x'} licence)`,
    creditRequired: credit
  }
}

// Sketchfab: only CC Attribution and CC0 are searched, and both allow game use,
// violence, changes and money. CC BY needs the credit line.
const CC = { 'cc attribution': 'CC BY 4.0', cc0: 'CC0', 'cc0 public domain': 'CC0' }
export function sketchfabLicence(m, { commercial = false } = {}) {
  const label = lower(m.license?.label || m.license)
  const lic = CC[label]
  const why = lic ? [] : [`licence ${m.license?.label || 'unknown'} is not CC BY or CC0`]
  if (commercial && !lic) why.push('not for paid games')
  return {
    ok: why.length === 0, why, commercial: !!lic, restyle: !!lic,
    credit: `“${m.name}” by ${m.user?.displayName || m.user?.username || 'unknown'} (Sketchfab, ${lic || m.license?.label || 'unknown licence'})`,
    creditRequired: lic !== 'CC0'
  }
}

const tagText = tags => (tags || []).map(t => (typeof t === 'string' ? t : [t.name, t.en_name, t.ja_name].filter(Boolean).join(' '))).join(' ')

// One VRoid Hub result as a card, or null when it may not be shown.
export function fromVroid(m, opts = {}) {
  if (!m || m.is_private || m.is_downloadable === false) return null
  const v = m.latest_character_model_version
  if (!v?.vrm_meta) return null
  const key = `vroid:${m.id}`
  if (m.age_limit?.is_r18 || m.age_limit?.is_r15 || m.age_limit?.is_adult) return { key, drop: 'adult', name: m.name }
  if (v.is_vendor_forbidden_use_by_others) return { key, drop: 'only its author may use it', name: m.name }
  const hit = blockHit(`${m.name} ${m.character?.name || ''} ${v.vrm_meta.title || v.vrm_meta.name || ''} ${tagText(m.tags)}`)
  if (hit) return { key, drop: hit.why, word: hit.word, name: m.name }
  const lic = vroidLicence(m, opts)
  if (!lic.ok) return { key, drop: lic.why.join(', '), name: m.name }
  const img = m.full_body_image || m.portrait_image
  return {
    key, source: 'vroid', id: String(m.id), name: m.name || m.character?.name || 'Untitled', creator: m.character?.user?.name || '',
    url: `https://hub.vroid.com/characters/${m.character?.id}/models/${m.id}`,
    tags: tagText(m.tags).slice(0, 300),
    format: 'vrm', vrm: String(v.spec_version || '').startsWith('1') ? '1.0' : '0.x',
    likes: Number(m.heart_count) || 0, triangles: Number(v.triangle_count) || 0,
    preview: img?.w600?.url || img?.original?.url || img?.w300?.url || '',
    licence: lic
  }
}

export function fromSketchfab(m, opts = {}) {
  if (!m?.uid || m.isDownloadable === false) return null
  const key = `sketchfab:${m.uid}`
  if (m.isAgeRestricted) return { key, drop: 'adult', name: m.name }
  const hit = blockHit(`${m.name} ${tagText(m.tags)} ${(m.categories || []).map(c => c.name).join(' ')}`)
  if (hit) return { key, drop: hit.why, word: hit.word, name: m.name }
  const lic = sketchfabLicence(m, opts)
  if (!lic.ok) return { key, drop: lic.why.join(', '), name: m.name }
  const thumbs = (m.thumbnails?.images || []).filter(i => i.width >= 400).sort((a, b) => a.width - b.width)
  return {
    key, source: 'sketchfab', id: m.uid, name: m.name || 'Untitled', creator: m.user?.displayName || m.user?.username || '',
    url: m.viewerUrl || `https://sketchfab.com/3d-models/${m.uid}`,
    tags: tagText(m.tags).slice(0, 300),
    format: 'gltf', likes: Number(m.likeCount) || 0, triangles: Number(m.faceCount) || 0,
    preview: thumbs[0]?.url || m.thumbnails?.images?.[0]?.url || '',
    licence: lic
  }
}

// The order of the shortlist: models that match the role's style words first,
// then models marked as original work, then by likes. VRoid hearts and Sketchfab
// likes are not on one scale, so within each tier the two sources take turns.
// A model over the triangle budget sinks; it is not dropped.
const ORIGINAL = / (original|original work|original character|oc|オリジナル) /
export function rank(cards, { style = [], maxTriangles = 120000 } = {}) {
  const text = c => norm(`${c.name} ${c.tags || ''}`)
  const tier = c => (c.triangles > maxTriangles ? -10 : 0) + (style.some(w => text(c).includes(` ${w} `)) ? 2 : 0) + (ORIGINAL.test(text(c)) || /オリジナル/.test(c.name) ? 1 : 0)
  const tiers = new Map()
  for (const c of [...cards].sort((a, b) => b.likes - a.likes)) {
    const t = tier(c)
    if (!tiers.has(t)) tiers.set(t, { vroid: [], sketchfab: [] })
    tiers.get(t)[c.source].push(c)
  }
  const out = []
  for (const t of [...tiers.keys()].sort((a, b) => b - a)) {
    const { vroid, sketchfab } = tiers.get(t)
    // the source with the better top model goes first
    const [a, b] = (vroid[0]?.likes || 0) * 10 >= (sketchfab[0]?.likes || 0) ? [vroid, sketchfab] : [sketchfab, vroid]
    for (let i = 0; i < Math.max(a.length, b.length); i++) out.push(...[a[i], b[i]].filter(Boolean))
  }
  return out
}

// The search words for one role, from the spec: the style words it names, else
// a polished default. VRoid Hub tags are single words, so its query is one word.
const STYLE = ['techwear', 'streetwear', 'gothic', 'cyberpunk', 'sci-fi', 'scifi', 'mecha', 'armor', 'armour', 'knight', 'witch', 'ninja',
  'samurai', 'military', 'punk', 'idol', 'maid', 'kimono', 'hoodie', 'android', 'cyborg', 'robot', 'oni', 'demon', 'angel', 'vampire', 'pilot', 'mage', 'hunter']
export function castQuery(role = {}) {
  const t = norm(`${role.look || ''} ${role.what || ''} ${role.name || ''}`)
  const style = STYLE.filter(w => t.includes(` ${w} `))
  const who = / (man|boy|male|guy|he|his) /.test(t) && !/ (woman|girl|female|she|her) /.test(t) ? 'boy' : 'girl'
  // the style search first, then the plain one: Sketchfab finds little for a narrow style
  return { style, vroid: style[0] || 'techwear', sketchfab: [...new Set([`anime ${who} ${style.slice(0, 2).join(' ')}`.trim(), `anime ${who}`])] }
}

// Sketchfab takes one licence per search, so CC BY and CC0 are two searches.
const searchUrls = (q, n) => ({
  vroid: `${VROID}?${new URLSearchParams({ keyword: q.vroid, is_downloadable: '1', count: String(Math.min(48, n * 4)) })}`,
  sketchfab: [q.sketchfab].flat().flatMap(text => ['by', 'cc0'].map(license => `${SKETCHFAB}?${new URLSearchParams({ type: 'models', q: text, downloadable: 'true', rigged: 'true', license, sort_by: '-likeCount', count: '24' })}`))
})

// Search both sources for one role. Returns { models, dropped, errors }: the
// shortlist (numbered from 1), how many each reason threw out, and any source
// that did not answer (the other source's cards still come back).
export async function searchCast(role = {}, { violent = true, commercial = false, n = 8, fetchImpl = fetch, signal } = {}) {
  const q = role.query ? { style: norm(role.query).trim().split(' '), vroid: role.query.split(/\s+/)[0], sketchfab: [role.query] } : castQuery(role)
  const urls = searchUrls(q, n)
  for (const u of [urls.vroid, ...urls.sketchfab]) if (BANNED_HOSTS.test(u)) throw new Error('banned source')
  const get = async (u, headers = {}) => {
    const r = await fetchImpl(u, { headers: { accept: 'application/json', ...headers }, signal: signal || AbortSignal.timeout(15000) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }
  const [vr, ...sfs] = await Promise.allSettled([get(urls.vroid, { 'X-Api-Version': '11' }), ...urls.sketchfab.map(u => get(u))])
  const opts = { violent, commercial }
  const raw = [
    ...(vr.status === 'fulfilled' ? (vr.value.data || []).map(m => fromVroid(m, opts)) : []),
    ...sfs.flatMap(sf => (sf.status === 'fulfilled' ? (sf.value.results || []).map(m => fromSketchfab(m, opts)) : []))
  ]
  // the same model can come back from two searches: count and show it once
  const seen = new Set()
  const all = raw.filter(x => x && !seen.has(x.key) && seen.add(x.key))
  const dropped = {}
  for (const d of all.filter(x => x.drop)) dropped[d.drop] = (dropped[d.drop] || 0) + 1
  const models = rank(all.filter(x => !x.drop), { style: q.style || [] })
    .slice(0, n).map(({ key, ...m }, i) => ({ n: i + 1, ...m }))
  const sfDown = sfs.find(x => x.status === 'rejected')
  const errors = [vr.status === 'rejected' && `VRoid Hub: ${vr.reason?.message}`, sfs.every(x => x.status === 'rejected') && `Sketchfab: ${sfDown.reason?.message}`].filter(Boolean)
  return { query: q, models, dropped, errors }
}

// The roles a spec needs cast: the hero, then speaking characters, then the
// boss. Four at most, so the canvas step keeps to its budget.
export function castRoles(spec = {}) {
  const roles = []
  const add = (id, label, r) => { if (r && !roles.some(x => x.id === id)) roles.push({ id, label, name: r.name || '', look: r.look || r.what || (typeof r === 'string' ? r : '') }) }
  if (spec.hero) add('hero', 'Hero', typeof spec.hero === 'string' ? { name: String(spec.hero).split(/[,—.]/)[0].trim(), look: spec.hero } : spec.hero)
  for (const c of spec.characters || []) if (c?.name && !/hero|boss/i.test(c.role || '')) add(`c-${norm(c.name).trim().replace(/ /g, '-')}`, c.name, c)
  if (spec.boss?.name) add('boss', 'Boss', spec.boss)
  return roles.slice(0, 4)
}

// A game needs casting when it is 3D (three.js or a Godot/Unity/Unreal port) and has people in it.
export const needsCast = spec => !!spec && (spec.engine === 'three.js' || /godot|unity|unreal/i.test(spec.target || spec.answers?.target || '')) && castRoles(spec).length > 0
export const hasCombat = spec => /fight|combat|boss|shoot|attack|weapon|kill|enemy|enemies|battle/i.test(JSON.stringify(spec || {}).slice(0, 8000))

// The picks a spec carries, trusted only as far as their own fields: a pick
// must point at one of the two sources, and its text is cut short.
const SOURCE_URL = /^https:\/\/(hub\.vroid\.com|sketchfab\.com)\//
const cut = (v, n) => String(v ?? '').slice(0, n)
const ART_URL = /^\/img\/[\w-]{1,64}\/[\w.-]{1,80}\.(png|jpe?g|webp)$/
const MODEL_FILE = /^[\w.-]{1,80}\.(vrm|glb|gltf|fbx)$/i
const base = c => ({ role: cut(c.role, 40), label: cut(c.label, 40), name: cut(c.name, 120), creator: cut(c.creator, 80) })
// Two more sources need no outside page (spec 20): a model made with Meshy from the
// project's own art (it must name its file), and the art itself as a 2.5D sprite.
const ownPick = c => c.source === 'meshy'
  ? (MODEL_FILE.test(String(c.file || '')) && /\.glb$/i.test(c.file)
      ? { ...base(c), url: '', source: 'meshy', format: 'gltf', rigged: true, file: String(c.file),
          clips: Object.fromEntries(['walk', 'run'].filter(k => MODEL_FILE.test(String(c.clips?.[k] || ''))).map(k => [k, String(c.clips[k])])),
          licence: { restyle: true, creditRequired: false, credit: 'Made from the project\'s own art with Meshy' } }
      : null)
  : c.source === 'art'
    ? (ART_URL.test(String(c.art || '')) ? { ...base(c), url: '', source: 'art', format: 'sprite', art: String(c.art), licence: { restyle: false, creditRequired: false, credit: 'The project\'s own art' } } : null)
    : undefined
const own = c => c.source === 'meshy' || c.source === 'art'
export const cleanCast = cast => (Array.isArray(cast) ? cast : [])
  .map(c => (c && typeof c === 'object' ? ownPick(c) ?? (SOURCE_URL.test(String(c.url || '')) && !BANNED_HOSTS.test(String(c.url)) ? c : null) : null))
  .filter(Boolean)
  // four found models at most (spec 19); characters made from the project's own art, up to 16 (spec 20)
  .filter((c, i, all) => (own(c) ? all.slice(0, i).filter(own).length < 16 : all.slice(0, i).filter(x => !own(x)).length < 4))
  .map(c => c.source === 'meshy' || c.source === 'art' ? c : ({
    ...base(c), url: cut(c.url, 300),
    source: c.source === 'vroid' ? 'vroid' : 'sketchfab', format: c.format === 'vrm' ? 'vrm' : 'gltf', vrm: c.vrm === '1.0' ? '1.0' : c.format === 'vrm' ? '0.x' : undefined,
    ...(MODEL_FILE.test(String(c.file || '')) ? { file: String(c.file) } : {}),
    licence: { restyle: c.licence?.restyle !== false, creditRequired: c.licence?.creditRequired !== false, credit: cut(c.licence?.credit || `“${c.name}” by ${c.creator}`, 240) }
  }))

// The sprite file a game gets for an art pick: models/<role>.<ext>.
export const spriteFile = c => `${String(c.role || 'hero').replace(/[^\w-]/g, '') || 'hero'}${String(c.art).match(/\.\w+$/)[0]}`

// The credits file a game ships with, from its cast.
export const castCredits = cast => cleanCast(cast).length
  ? `# Credits\n\n## Characters\n\n${cleanCast(cast).map(c => `- ${c.label || c.role}: ${c.licence.credit}${c.url ? ` — ${c.url}` : ''}`).join('\n')}\n`
  : ''

// What the game builder is told about the picks (it goes into the build prompt).
export function castPrompt(cast = []) {
  if (!cast.length) return ''
  return `- The cast are the characters the person picked; never rebuild a character from primitive shapes.
${cast.map(c => c.source === 'meshy'
    ? `  - ${c.label || c.role}: models/${c.file}, made with Meshy from the project's own art, already rigged as a humanoid (glTF skin; GLTFLoader + SkeletonUtils.clone in three.js, import in Godot).${Object.keys(c.clips || {}).length ? ` Its clips: ${Object.entries(c.clips).map(([k, f]) => `${k} models/${f}`).join(', ')}: play them on the same skeleton (retarget by bone name), cross-fading.` : ''} Give it the game's cel shading and outline.`
    : c.source === 'art'
      ? `  - ${c.label || c.role}: models/${spriteFile(c)}, the project's own art as a 2.5D billboard: a camera-facing sprite (THREE.Sprite in three.js, Sprite3D with billboard on in Godot) standing on the floor with a soft round shadow, scaled to about 1.7 m, flipped to face where it moves, with a small bob when walking and a squash on hits. Never rebuild it from shapes.`
      : `  - ${c.label || c.role}: ${c.file ? `models/${c.file}` : `“${c.name}” (${c.url}), not downloaded yet: load models/${c.role || 'hero'}.vrm or .glb when it is there, and until then a plain stand-in labelled with the role`} (${c.format === 'vrm' ? `VRM ${c.vrm || ''}: load it with the godot-vrm addon in Godot, or @pixiv/three-vrm in three.js` : 'glTF: GLTFLoader in three.js, or import in Godot'}).${c.licence?.restyle === false ? ' Keep its own materials: its licence forbids changes.' : ' Give it the game\'s cel shading and outline.'}`).join('\n')}
- Credits: a Credits screen in the game and a credits line on its site, word for word:
${cast.filter(c => c.licence?.creditRequired !== false).map(c => `  - ${c.licence?.credit || c.name}`).join('\n') || '  - (none required; credit them anyway)'}
`
}
