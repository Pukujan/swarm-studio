// The SKU sheet: every product × size gets a SKU, a price and its stock.
export async function run({ intake, write }) {
  const products = String(intake.products).split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 12)
  const sizes = String(intake.sizes || 'One size').split(/[,;/]+/).map(s => s.trim()).filter(Boolean).slice(0, 8)
  const base = Number(intake.price) || 100, stock = Number(intake.stock) || 50
  const code = s => s.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').map(w => w.slice(0, 3)).join('').slice(0, 9)
  const items = products.map((name, i) => {
    // accessories cost less and don't come in clothing sizes
    const acc = /cap|hat|sock|bag|pin|sticker|keychain/i.test(name)
    const price = Math.round(base * (i === 0 ? 1 : acc ? 0.3 : 0.6))
    const sz = acc ? ['One size'] : sizes
    const per = Math.max(1, Math.round(stock / sz.length))
    return { name, price, skus: sz.map(size => ({ sku: `${code(name)}-${code(size)}`, size, stock: per })) }
  })
  const csv = ['sku,product,size,price,stock', ...items.flatMap(p => p.skus.map(s => `${s.sku},${p.name},${s.size},${p.price},${s.stock}`))].join('\n')
  const files = [write('src/data/inventory.json', { drop: intake.drop, products: items }), write('public/pack/skus.csv', csv)]
  const n = items.reduce((a, p) => a + p.skus.length, 0)
  return {
    files,
    note: `${items.length} products, ${n} SKUs`,
    ask: 'Use src/data/inventory.json for every product, size, price and starting stock (no other product list). The drop page counts down to the drop time from the file. /admin shows the stock per SKU and links /pack/skus.csv as "Download SKU sheet".'
  }
}
