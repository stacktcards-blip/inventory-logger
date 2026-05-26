import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyIntakeDefaults,
  expandQuantityRows,
  getIntakeSummary,
  parsePastedRawRows,
  validateIntakeRows,
  type RawIntakeDefaults,
} from '../src/lib/rawPasteIntake'

const defaults: RawIntakeDefaults = {
  seller: 'Card Rush',
  purchase_date: '2026-05-26',
  currency: 'JPY',
  exchange_rate: '0.0102',
  lang: 'JP',
  cond: 'NM',
}

test('parses tab-separated pasted spreadsheet rows without headers', () => {
  const parsed = parsePastedRawRows('sv8a\t201\tJP\t280\nsv8a\t202\t\t420\tLP\t2\tminor edge')

  assert.equal(parsed.length, 2)
  assert.deepEqual(parsed[0], {
    set_abbr: 'sv8a',
    num: '201',
    lang: 'JP',
    purchase_price: '280',
    cond: '',
    quantity: '1',
    note: '',
  })
  assert.deepEqual(parsed[1], {
    set_abbr: 'sv8a',
    num: '202',
    lang: '',
    purchase_price: '420',
    cond: 'LP',
    quantity: '2',
    note: 'minor edge',
  })
})

test('parses headered paste rows in flexible column order', () => {
  const parsed = parsePastedRawRows('Num,Set,Price,Note,Qty\n025,sv2a,1200,master ball,3')

  assert.deepEqual(parsed, [
    {
      set_abbr: 'sv2a',
      num: '025',
      lang: '',
      purchase_price: '1200',
      cond: '',
      quantity: '3',
      note: 'master ball',
    },
  ])
})

test('applies batch defaults without overwriting explicit row values', () => {
  const [row] = applyIntakeDefaults(
    [{ set_abbr: 'sv8a', num: '202', lang: '', purchase_price: '420', cond: 'LP', quantity: '1', note: '' }],
    defaults
  )

  assert.equal(row.lang, 'JP')
  assert.equal(row.cond, 'LP')
  assert.equal(row.seller, 'Card Rush')
  assert.equal(row.purchase_date, '2026-05-26')
  assert.equal(row.currency, 'JPY')
  assert.equal(row.exchange_rate, '0.0102')
})

test('expands quantity into individual raw card draft rows', () => {
  const rows = applyIntakeDefaults(
    [{ set_abbr: 'sv8a', num: '202', lang: '', purchase_price: '420', cond: '', quantity: '3', note: 'test' }],
    defaults
  )

  const expanded = expandQuantityRows(rows)

  assert.equal(expanded.length, 3)
  assert.equal(expanded[0].note, 'test')
  assert.equal(expanded[2].set_abbr, 'sv8a')
})

test('validates required fields, JPY exchange rate, bad price, and duplicate batch rows', () => {
  const rows = applyIntakeDefaults(
    [
      { set_abbr: 'sv8a', num: '201', lang: '', purchase_price: 'abc', cond: '', quantity: '1', note: '' },
      { set_abbr: 'sv8a', num: '201', lang: '', purchase_price: '280', cond: '', quantity: '1', note: '' },
      { set_abbr: '', num: '202', lang: '', purchase_price: '280', cond: '', quantity: '0', note: '' },
    ],
    { ...defaults, exchange_rate: '' }
  )

  const results = validateIntakeRows(rows)

  assert.equal(results[0].errors.some((x) => x.includes('Price must be a number')), true)
  assert.equal(results[0].warnings.some((x) => x.includes('JPY row is missing exchange rate')), true)
  assert.equal(results[1].warnings.some((x) => x.includes('Duplicate-looking row')), true)
  assert.equal(results[2].errors.some((x) => x.includes('Set is required')), true)
  assert.equal(results[2].errors.some((x) => x.includes('Quantity must be at least 1')), true)
})

test('summarises ready rows and estimated AUD cost', () => {
  const rows = applyIntakeDefaults(
    [
      { set_abbr: 'sv8a', num: '201', lang: '', purchase_price: '100', cond: '', quantity: '2', note: '' },
      { set_abbr: '', num: '202', lang: '', purchase_price: '100', cond: '', quantity: '1', note: '' },
    ],
    defaults
  )

  const results = validateIntakeRows(rows)
  const summary = getIntakeSummary(rows, results)

  assert.equal(summary.sourceRows, 2)
  assert.equal(summary.commitRows, 2)
  assert.equal(summary.errorRows, 1)
  assert.equal(summary.estimatedAudCost, 2.04)
})
