// @ts-check
// The Brand kit (docs/specs/37-studio-first.md): a brand on its own. No Plan step and no build: the brand
// sheet, the references and the assets are the deliverable, and Lock is the end.
export const brandKit = {
  kind: 'brand',
  name: 'Brand',
  icon: 'sliders',
  steps: ['brand', 'references', 'assets'],
  starts: [
    { id: 'brand', name: 'Brand', why: 'the story, colours and type come first' },
    { id: 'references', name: 'References', why: 'a few looks you like set the direction' }
  ],
  suggest: ctx => (!ctx.brand ? 'brand' : 'references'),
  reads: ['palette', 'type', 'voice', 'pictures'],
  plan: null,
  proposal: () => ({ items: [{ what: 'Brand sheet', order: 1 }], minutes: 2, credits: null }),
  lock: () => ({}),
  build: null
}
