// A brand sheet as the routes answer it (server/brand.mjs), for the stories: the rat-site brief of spec 31
import type { Brand, BrandPack } from './types'

export const SHEET: Brand = {
  brief: 'A small rat rescue in Bristol: adoption, fostering and care guides. Cream, warm grey, terracotta and forest green.',
  story: { what: 'Bristol Rat Rescue, a home for unwanted rats', who: 'people thinking of adopting or fostering', pages: ['Home', 'Adopt', 'Foster', 'Care guides', 'About', 'Contact'] },
  palettes: [
    { id: 'p1', name: 'Terracotta cream', bg: '#f6f1e7', text: '#2b2622', accent: '#c4623a', link: '#2f5d3a' },
    { id: 'p2', name: 'Forest night', bg: '#18231c', text: '#f1ece2', accent: '#d9774f', link: '#a8c7a0' },
    { id: 'p3', name: 'Warm grey', bg: '#e9e5df', text: '#24211e', accent: '#2f5d3a', link: '#9b4a2c' }
  ],
  types: [
    { id: 't1', name: 'Editorial', heading: 'DM Serif Display', body: 'Karla' },
    { id: 't2', name: 'Friendly', heading: 'Fraunces', body: 'Inter' },
    { id: 't3', name: 'Plain', heading: 'Work Sans', body: 'Work Sans' }
  ],
  pick: { palette: 'p1', type: 't1' },
  pack: null,
  lockedAt: null
}

const photo = (seed: string) => ({ url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${seed}"/></svg>`)}`, alt: '' })

export const PACKS: BrandPack[] = [
  { slug: 'warm-editorial', name: 'Warm editorial', why: 'For a small charity that tells stories.', suggested: true, palette: { bg: '#f4eee3', text: '#2a241f', accent: '#b5552f', link: '#3d6b4a' }, type: { heading: 'DM Serif Display', body: 'Karla' }, radius: '4px', voice: { lines: ['Every rat deserves a soft landing.', 'Come and meet them.'] }, pictures: { name: 'Film photo', photos: [photo('#c9b49a'), photo('#8a6f55'), photo('#d8c7ad')] } },
  { slug: 'playful-community', name: 'Playful community', why: 'For volunteers and families.', suggested: true, palette: { bg: '#fff7e8', text: '#1f2430', accent: '#ff7a45', link: '#2766d6' }, type: { heading: 'Fraunces', body: 'Inter' }, radius: '14px', voice: { lines: ['Tiny paws, big hearts.', 'Join the mischief.'] }, pictures: { name: 'Film photo', photos: [photo('#f2c38b'), photo('#9fc4e8'), photo('#f7dfb8')] } },
  { slug: 'quiet-portfolio', name: 'Quiet portfolio', palette: { bg: '#f5f5f2', text: '#1c1c1a', accent: '#1c1c1a', link: '#555550' }, type: { heading: 'Work Sans', body: 'Work Sans' }, radius: '0px', voice: { lines: ['Rats, rescued.', 'Adopt one.'] }, pictures: { name: 'Film photo', photos: [photo('#d7d6d0'), photo('#a9a8a2'), photo('#e8e7e2')] } }
]

export const WITH_PACK: Brand = {
  ...SHEET,
  pack: 'warm-editorial',
  voice: { pack: 'warm-editorial', name: 'Warm editorial', lines: PACKS[0].voice.lines },
  pictures: { pack: 'warm-editorial', name: 'Film photo', photos: PACKS[0].pictures.photos },
  storyboard: { pack: 'warm-editorial', frames: ['Meet the rats', 'How adopting works', 'Fostering, week by week', 'Say hello'] }
}
