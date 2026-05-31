import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildSalesPackingSummary,
  exportSalesPackingRowsCsv,
  parseEbaySalesCsv,
} from '../src/lib/ebaySalesParser'
import { findNextSalesPackingScanKey } from '../src/lib/salesPackingScan'
import { buildSalesPackingImportPayload, buildSalesPackingRowsFromSaved } from '../src/lib/salesPackingPersistence'

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

test('orders sales packing rows by ascending sales record number', () => {
  const result = parseEbaySalesCsv(sampleCsv)

  assert.deepEqual(result.expandedRows.map((row) => row.salesRecordNumber), [
    '12125',
    '12125',
    '12125',
    '12126',
    '12126',
    '12132',
  ])
  assert.deepEqual(result.expandedRows.map((row) => row.orderNumber), [
    '04-14689-12345',
    '04-14689-12345',
    '04-14689-12345',
    '01-14701-30101',
    '01-14701-30101',
    '16-14679-61003',
  ])
})

test('sorts sales record numbers numerically instead of by order number', () => {
  const csv = `
"Sales Record Number","Order Number","Buyer Username","Item Number","Item Title","Custom Label","Quantity","Sold For","Postage And Handling","Total Price","Sale Date","Tracking Number"
"10","1-1-1","buyer","item-10","Tenth","","1","AU $1.00","","","26-May-26",""
"2","10-1-1","buyer","item-2","Second","","1","AU $1.00","","","26-May-26",""
"1","2-1-1","buyer","item-1","First","","1","AU $1.00","","","26-May-26",""
`
  const result = parseEbaySalesCsv(csv)

  assert.deepEqual(result.expandedRows.map((row) => row.salesRecordNumber), ['1', '2', '10'])
  assert.deepEqual(result.expandedRows.map((row) => row.orderNumber), ['2-1-1', '10-1-1', '1-1-1'])
})

test('creates blank cert scan fields and pending scan status for packing', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const row = result.expandedRows[0]

  assert.equal(row.certScanned, '')
  assert.equal(row.scanStatus, 'pending')
})

test('finds the next cert scan row after the current row', () => {
  const keys = ['row-a', 'row-b', 'row-c']

  assert.equal(findNextSalesPackingScanKey(keys, 'row-a'), 'row-b')
  assert.equal(findNextSalesPackingScanKey(keys, 'row-b'), 'row-c')
  assert.equal(findNextSalesPackingScanKey(keys, 'row-c'), null)
  assert.equal(findNextSalesPackingScanKey(keys, 'missing'), 'row-a')
})

test('exports expanded sales packing rows as CSV', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const csv = exportSalesPackingRowsCsv(result.expandedRows)

  assert.match(csv, /^sale date,buyer username,order number/)
  assert.match(csv, /cert scanned\/manual,scan status,warnings/)
  assert.match(csv, /1 of 3/)
  assert.match(csv, /Quantity 3 expanded into cert scan rows/)
})

test('recalculates summary and export from included rows after non-slab rows are removed', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const includedRows = result.expandedRows.filter((row) => row.itemNumber !== '406471933275')
  const summary = buildSalesPackingSummary(result.itemRows, includedRows)
  const csv = exportSalesPackingRowsCsv(includedRows)

  assert.equal(summary.expandedRowCount, 5)
  assert.equal(summary.totalSoldExPostage, 3830)
  assert.equal(summary.combinedOrderItemCount, 1)
  assert.doesNotMatch(csv, /Team Rocket's Meowth/)
  assert.match(csv, /Mega Gengar EX/)
})

test('builds sales packing import payload with one item row and one packing row per physical item', () => {
  const result = parseEbaySalesCsv(sampleCsv)
  const rows = result.expandedRows.map((row, index) => ({
    ...row,
    rowKey: `${row.orderNumber}-${row.itemNumber}-${row.quantityUnit}-${index}`,
  }))
  const payload = buildSalesPackingImportPayload(result.itemRows, rows, {
    filename: 'orders.csv',
    csvText: sampleCsv,
  })

  assert.equal(payload.importRow.source_filename, 'orders.csv')
  assert.equal(payload.importRow.row_count, 4)
  assert.equal(payload.importRow.expanded_row_count, 6)
  assert.equal(payload.itemRows.length, 4)
  assert.equal(payload.packingRows.length, 6)
  assert.deepEqual(payload.itemRows.map((row) => row.line_item_key), [
    '04-14689-12345|12125|406999999999',
    '01-14701-30101|12126|406471933275',
    '01-14701-30101|12126|406802886617',
    '16-14679-61003|12132|405358863537',
  ])
  assert.deepEqual(payload.packingRows.filter((row) => row.line_item_key === '04-14689-12345|12125|406999999999').map((row) => row.quantity_unit), [
    '1 of 3',
    '2 of 3',
    '3 of 3',
  ])
  assert.equal('raw_item_json' in payload.itemRows[0], true)
  assert.equal('raw_item_json' in payload.packingRows[0], false)
})

test('converts saved packing rows back into visible sales packing rows', () => {
  const saved = buildSalesPackingRowsFromSaved([
    {
      id: 'packing-1',
      line_item_key: 'order|record|item',
      sale_date: '26-May-26',
      buyer_username: 'buyer-one',
      order_number: '16-14679-61003',
      sales_record_number: '12132',
      item_number: '405358863537',
      listing_title: 'PSA 10 Haunter',
      custom_label: '',
      quantity: 1,
      sold_for: 3000,
      postage_and_handling: 13,
      total_price: 3013,
      tracking_number: 'TRACK',
      combined_order: false,
      warnings: ['Missing SKU/custom label'],
      quantity_unit: '1 of 1',
      cert_scanned: '12345678',
      scan_status: 'scanned',
      removed: false,
      removed_reason: null,
    },
  ])

  assert.equal(saved.length, 1)
  assert.equal(saved[0].rowKey, 'packing-1')
  assert.equal(saved[0].certScanned, '12345678')
  assert.equal(saved[0].scanStatus, 'scanned')
  assert.deepEqual(saved[0].warnings, ['Missing SKU/custom label'])
})

test('sorts saved packing rows by ascending sales record number after reload', () => {
  const baseSavedRow = {
    id: 'packing-1',
    line_item_key: 'order|record|item',
    sale_date: '26-May-26',
    buyer_username: 'buyer-one',
    sales_record_number: '12132',
    item_number: '405358863537',
    listing_title: 'PSA 10 Haunter',
    custom_label: '',
    quantity: 1,
    sold_for: 3000,
    postage_and_handling: 13,
    total_price: 3013,
    tracking_number: 'TRACK',
    combined_order: false,
    warnings: [],
    quantity_unit: '1 of 1',
    cert_scanned: null,
    scan_status: 'pending' as const,
    removed: false,
    removed_reason: null,
  }

  const saved = buildSalesPackingRowsFromSaved([
    { ...baseSavedRow, id: 'row-10', order_number: '1-1-1', sales_record_number: '10' },
    { ...baseSavedRow, id: 'row-2', order_number: '10-1-1', sales_record_number: '2' },
    { ...baseSavedRow, id: 'row-1', order_number: '2-1-1', sales_record_number: '1' },
  ])

  assert.deepEqual(saved.map((row) => row.salesRecordNumber), ['1', '2', '10'])
  assert.deepEqual(saved.map((row) => row.orderNumber), ['2-1-1', '10-1-1', '1-1-1'])
})
