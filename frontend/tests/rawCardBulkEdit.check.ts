import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildRawCardBulkEditPayload,
  getRawCardBulkEditField,
  listRawCardBulkEditFields,
} from '../src/lib/rawCardBulkEdit'

test('lists safe raw-card bulk-edit fields with labels and input types', () => {
  const fields = listRawCardBulkEditFields()
  const keys = fields.map((field) => field.key)

  assert.deepEqual(keys, [
    'set_abbr',
    'num',
    'lang',
    'currency',
    'purchase_price',
    'exchange_rate',
    'cond',
    'seller',
    'purchase_date',
    'note',
    'is_1ed',
    'is_rev',
  ])
  assert.equal(getRawCardBulkEditField('seller')?.label, 'Seller')
  assert.equal(getRawCardBulkEditField('purchase_price')?.inputType, 'number')
  assert.equal(getRawCardBulkEditField('is_rev')?.inputType, 'boolean')
})

test('builds trimmed text payloads and allows blank text to clear fields', () => {
  assert.deepEqual(buildRawCardBulkEditPayload('seller', ' Card Rush '), {
    payload: { seller: 'Card Rush' },
    displayValue: 'Card Rush',
  })
  assert.deepEqual(buildRawCardBulkEditPayload('note', '   '), {
    payload: { note: null },
    displayValue: 'blank',
  })
})

test('builds numeric payloads and rejects invalid numeric input', () => {
  assert.deepEqual(buildRawCardBulkEditPayload('exchange_rate', ' 0.0102 '), {
    payload: { exchange_rate: 0.0102 },
    displayValue: '0.0102',
  })
  assert.deepEqual(buildRawCardBulkEditPayload('purchase_price', ''), {
    payload: { purchase_price: null },
    displayValue: 'blank',
  })
  assert.throws(
    () => buildRawCardBulkEditPayload('purchase_price', 'abc'),
    /must be a valid number/
  )
})

test('builds date payloads and rejects malformed dates', () => {
  assert.deepEqual(buildRawCardBulkEditPayload('purchase_date', '2026-05-28'), {
    payload: { purchase_date: '2026-05-28' },
    displayValue: '2026-05-28',
  })
  assert.deepEqual(buildRawCardBulkEditPayload('purchase_date', ''), {
    payload: { purchase_date: null },
    displayValue: 'blank',
  })
  assert.throws(
    () => buildRawCardBulkEditPayload('purchase_date', '28/05/2026'),
    /must use YYYY-MM-DD/
  )
})

test('builds boolean payloads from explicit true and false choices', () => {
  assert.deepEqual(buildRawCardBulkEditPayload('is_1ed', 'true'), {
    payload: { is_1ed: true },
    displayValue: 'Yes',
  })
  assert.deepEqual(buildRawCardBulkEditPayload('is_rev', 'false'), {
    payload: { is_rev: false },
    displayValue: 'No',
  })
  assert.throws(
    () => buildRawCardBulkEditPayload('is_rev', ''),
    /must be Yes or No/
  )
})

test('rejects unsupported fields', () => {
  assert.throws(
    () => buildRawCardBulkEditPayload('card_name', 'Pikachu'),
    /not bulk editable/
  )
})
