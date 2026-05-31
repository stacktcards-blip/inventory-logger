import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  classifySlabReconciliationRow,
  exportReconciliationRowsCsv,
  filterReconciliationRows,
  summarizeReconciliationQueues,
  type ReconciliationSourceRow,
} from '../src/lib/slabReconciliation'
import {
  buildCertValidationMap,
  validatePackingCert,
  type CertValidationSlabRow,
} from '../src/lib/salesPackingCertValidation'

const baseSlab: ReconciliationSourceRow = {
  id: 'slab-1',
  sku: 'PSA-001',
  cert: '12345678',
  grading_company: 'PSA',
  grade: '10',
  card_name: 'Pikachu',
  set_abbr: 'SV2a',
  num: '173',
  lang: 'JP',
  listing_state: 'NOT_LISTED',
  metadata_status: 'PARSED_CONFIRMED',
  stock_source: 'PHYSICAL_STOCKTAKE',
  sales_status: 'NOT LISTED',
  sold_date: null,
  listed_date: null,
  source_psa_row_id: null,
  source_stocktake_scan_id: 'scan-1',
}

test('classifies physically confirmed parsed unsold slabs as ready to list', () => {
  const result = classifySlabReconciliationRow(baseSlab)

  assert.equal(result.queue, 'ready_to_list')
  assert.equal(result.severity, 'good')
  assert.ok(result.reasons.includes('physically confirmed'))
})

test('classifies cert-only or incomplete metadata slabs as needs enrichment', () => {
  const result = classifySlabReconciliationRow({
    ...baseSlab,
    set_abbr: null,
    num: null,
    lang: null,
    metadata_status: 'NEEDS_ENRICHMENT',
  })

  assert.equal(result.queue, 'needs_enrichment')
  assert.equal(result.severity, 'warn')
  assert.ok(result.reasons.includes('missing strict card fields'))
})

test('detects duplicate cert conflicts before ready-to-list classification', () => {
  const rows = [baseSlab, { ...baseSlab, id: 'slab-2', sku: 'PSA-002' }]
  const summary = summarizeReconciliationQueues(rows)

  assert.equal(summary.counts.duplicate_cert, 2)
  assert.equal(summary.rows.every((row) => row.queue === 'duplicate_cert'), true)
})

test('detects sold slabs that were physically seen as reconciliation conflicts', () => {
  const result = classifySlabReconciliationRow({
    ...baseSlab,
    sales_status: 'SOLD',
    sold_date: '2026-05-30',
  })

  assert.equal(result.queue, 'sold_but_seen')
  assert.equal(result.severity, 'danger')
})

test('filters reconciliation rows by queue and exports visible rows as CSV', () => {
  const summary = summarizeReconciliationQueues([
    baseSlab,
    { ...baseSlab, id: 'slab-2', cert: '222', metadata_status: 'PSA_METADATA_ONLY', source_stocktake_scan_id: null, stock_source: 'PSA_STAGING' },
  ])
  const filtered = filterReconciliationRows(summary.rows, 'cert_only', '')
  const csv = exportReconciliationRowsCsv(filtered)

  assert.equal(filtered.length, 1)
  assert.match(csv, /^queue,severity,cert,sku,card name,grade/)
  assert.match(csv, /cert_only/)
  assert.match(csv, /PSA metadata only/)
})

const validationSlab: CertValidationSlabRow = {
  id: 'slab-1',
  cert: '12345678',
  sku: 'PSA-001',
  card_name: 'Pikachu',
  grade: '10',
  grading_company: 'PSA',
  set_abbr: 'SV2a',
  num: '173',
  lang: 'JP',
  sales_status: 'NOT LISTED',
  listing_state: 'NOT_LISTED',
  sold_date: null,
  metadata_status: 'PARSED_CONFIRMED',
}

test('validates scanned certs against slab inventory without mutating inventory', () => {
  const slabMap = buildCertValidationMap([validationSlab])
  const result = validatePackingCert('1234 5678', 'row-1', slabMap, [{ rowKey: 'row-1', cert: '12345678' }])

  assert.equal(result.status, 'found_available')
  assert.equal(result.slab?.cardName, 'Pikachu')
  assert.equal(result.message, 'PSA 10 Pikachu')
})

test('warns when a cert is not found, duplicated in session, sold, or needs enrichment', () => {
  const slabMap = buildCertValidationMap([
    validationSlab,
    { ...validationSlab, id: 'slab-2', cert: '999', sales_status: 'SOLD', sold_date: '2026-05-30' },
    { ...validationSlab, id: 'slab-3', cert: '888', metadata_status: 'NEEDS_REVIEW', set_abbr: null },
  ])

  assert.equal(validatePackingCert('404', 'row-1', slabMap, []).status, 'not_found')
  assert.equal(validatePackingCert('12345678', 'row-2', slabMap, [{ rowKey: 'row-1', cert: '12345678' }]).status, 'duplicate_in_session')
  assert.equal(validatePackingCert('999', 'row-1', slabMap, []).status, 'not_available')
  assert.equal(validatePackingCert('888', 'row-1', slabMap, []).status, 'needs_enrichment')
})
