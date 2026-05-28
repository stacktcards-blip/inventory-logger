import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  exportSalesPackingRowsCsv,
  parseEbaySalesCsv,
} from '../src/lib/ebaySalesParser'

const sampleCsv = `
"Sales Record Number","Order Number","Buyer Username","Item Number","Item Title","Custom Label","Quantity","Sold For","Postage And Handling","Total Price","Sale Date","Tracking Number"
"12132","16-14679-61003","buyer-one","405358863537","PSA 10 Haunter 027 MEP Black Star Promo Mega Gengar EX Mega Battle Deck POKEMON","","1","AU $3,000.00","AU $13.00","AU $3,013.00","26-May-26","99721007682101004582503"
"12126","01-14701-30101","combo-buyer","","","","4","AU $305.00","AU $46.60","AU $404.35","26-May-26",""
"12126","01-14701-30101","combo-buyer","406471933275","PSA 10 Team Rocket's Meowth 109/098 Glory Rocket AR Art Rare Japanese POKEMON","","1","AU $115.00","","","26-May-26","LK274426961AU"
"12126","01-14701-30101","combo-buyer","406802886617","PSA 9 Vulpix 067/063 M1l Mega Brave AR Art Rare Japanese POKEMON","SKU-2","1","AU $50.00","","","26-May-26","LK274426961AU"
"12125","04-14689-12345","multi-buyer","406999999999","PSA 10 Pikachu 173/165 151 SV2a AR Art Rare Japanese POKEMON","PIKA-AR","3","AU $260.00","AU $9.00","AU $789.00","25-May-26","TRACK123"
"38","record(s) downloaded",,,,,,,,,,
"Seller ID : 2stackt",,,,,,,,,,,
`

test('parses eBay Paid & Posted CSV into item rows and skips summary/footer rows', () => {
  const result = parseEbaySalesCsv(sampleCsv)

  assert.equal(result.itemRows.length, 4)
  assert.equal(result.expandedRows.length, 6)
  assert.equal(result.summary.orderCount, 3)
  assert.equal(result.summary.itemRowCount, 4)
  assert.equal(result.summary.expandedRowCount, 6)
  assert.equal(result.summary.totalSoldExPostage, 3945)
})

test('flags missing SKU, high-value missing SKU, combined orders, and multi-quantity expansion', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const highValue = result.expandedRows.find((row) => row.itemNumber === '405358863537')
  const combo = result.expandedRows.find((row) => row.itemNumber === '406471933275')
  const multi = result.expandedRows.filter((row) => row.itemNumber === '406999999999')

  assert.ok(highValue)
  assert.deepEqual(highValue.warnings, ['Missing SKU/custom label', 'High-value sale missing SKU/custom label'])

  assert.ok(combo)
  assert.equal(combo.combinedOrder, true)
  assert.equal(combo.warnings.includes('Combined order item'), true)
  assert.equal(combo.warnings.includes('Missing SKU/custom label'), true)

  assert.equal(multi.length, 3)
  assert.equal(multi.every((row) => row.combinedOrder), false)
  assert.deepEqual(multi.map((row) => row.quantityUnit), ['1 of 3', '2 of 3', '3 of 3'])
  assert.equal(multi.every((row) => row.warnings.includes('Quantity 3 expanded into cert scan rows')), true)
})

test('creates blank cert scan fields and pending scan status for packing', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const row = result.expandedRows[0]

  assert.equal(row.certScanned, '')
  assert.equal(row.scanStatus, 'pending')
})

test('exports expanded sales packing rows as CSV', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const csv = exportSalesPackingRowsCsv(result.expandedRows)

  assert.match(csv, /^sale date,buyer username,order number/)
  assert.match(csv, /cert scanned\/manual,scan status,warnings/)
  assert.match(csv, /1 of 3/)
  assert.match(csv, /Quantity 3 expanded into cert scan rows/)
})
