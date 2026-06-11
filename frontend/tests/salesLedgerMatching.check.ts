import assert from 'node:assert/strict'
import test from 'node:test'

import { summarizeLedgerMatching, getLedgerMatchDisplay } from '../src/lib/salesLedgerMatching'
import type { SalesLedgerRow } from '../src/types/salesLedger'

const baseRow = (overrides: Partial<SalesLedgerRow> = {}): SalesLedgerRow => ({
  saleId: 'sale-1',
  salesChannel: 'EBAY',
  soldDate: '2026-06-10',
  title: 'PSA 10 Pikachu',
  buyerUsername: 'buyer1',
  quantity: 1,
  salePrice: 250,
  currency: 'AUD',
  shippingCost: null,
  fulfillmentStatus: 'FULFILLED',
  matchStatus: 'PENDING',
  matchMethod: null,
  slabId: null,
  slabCert: null,
  slabGrade: null,
  slabGradingCompany: null,
  slabSetAbbr: null,
  slabNum: null,
  slabLang: null,
  rawCardId: null,
  rawCostAud: null,
  grossProfitAud: null,
  daysHeld: null,
  imageUrl: null,
  packingCert: null,
  packingScanStatus: null,
  packingMatchMethod: null,
  packingReviewReason: null,
  packingImportedAt: null,
  inventoryMatchStatus: 'UNMATCHED',
  inventoryMatchLabel: 'Unmatched',
  reviewReason: 'No cert scan or direct inventory link yet',
  ...overrides,
})

test('shows cert-scan match as matched when packing cert links to a slab', () => {
  const row = baseRow({
    packingCert: '12345678',
    slabCert: '12345678',
    slabId: 'slab-1',
    rawCostAud: 100,
    grossProfitAud: 150,
    inventoryMatchStatus: 'MATCHED',
    inventoryMatchLabel: 'Matched by cert scan',
    packingMatchMethod: 'ORDER_ITEM',
  })

  assert.deepEqual(getLedgerMatchDisplay(row), {
    label: 'Matched by cert scan',
    tone: 'matched',
    detail: 'Cert 12345678 · ORDER_ITEM',
  })
})

test('flags scanned certs that are not present in slab inventory for review', () => {
  const row = baseRow({
    packingCert: '99999999',
    inventoryMatchStatus: 'REVIEW',
    inventoryMatchLabel: 'Scanned cert not in slabs',
    reviewReason: 'Sales Packing cert 99999999 has no slab inventory record',
  })

  assert.equal(getLedgerMatchDisplay(row).tone, 'review')
  assert.match(getLedgerMatchDisplay(row).detail, /99999999/)
})

test('summarizes matched, review, and unmatched sales rows', () => {
  const summary = summarizeLedgerMatching([
    baseRow({ inventoryMatchStatus: 'MATCHED' }),
    baseRow({ saleId: 'sale-2', inventoryMatchStatus: 'REVIEW' }),
    baseRow({ saleId: 'sale-3', inventoryMatchStatus: 'UNMATCHED' }),
  ])

  assert.deepEqual(summary, {
    matched: 1,
    review: 1,
    unmatched: 1,
    withGrossProfit: 0,
  })
})

test('counts rows with gross profit regardless of match status', () => {
  const summary = summarizeLedgerMatching([
    baseRow({ grossProfitAud: 42, inventoryMatchStatus: 'MATCHED' }),
    baseRow({ saleId: 'sale-2', grossProfitAud: null, inventoryMatchStatus: 'MATCHED' }),
  ])

  assert.equal(summary.withGrossProfit, 1)
})
