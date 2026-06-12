export type ReconciliationQueue =
  | 'ready_to_list'
  | 'needs_enrichment'
  | 'cert_only'
  | 'duplicate_cert'
  | 'sold_but_seen'
  | 'awaiting_auction'
  | 'listed_or_other'

export type ReconciliationSeverity = 'good' | 'info' | 'warn' | 'danger'

export type ReconciliationSourceRow = {
  id: string
  sku?: string | null
  cert?: string | null
  grading_company?: string | null
  grade?: string | null
  card_name?: string | null
  set_abbr?: string | null
  num?: string | null
  lang?: string | null
  listing_state?: string | null
  metadata_status?: string | null
  stock_source?: string | null
  sales_status?: string | null
  sold_date?: string | null
  listed_date?: string | null
  source_psa_row_id?: string | null
  source_stocktake_scan_id?: string | null
  psa_order_number?: string | null
  psa_description?: string | null
  psa_grade?: string | null
  psa_numeric_grade?: number | string | null
  psa_set_name?: string | null
  psa_set_code?: string | null
  psa_card_number?: string | null
  psa_card_name?: string | null
  psa_parsed_set_abbr?: string | null
  psa_parsed_num?: string | null
  psa_parsed_lang?: string | null
  psa_match_status?: string | null
  psa_review_reason?: string | null
  psa_label_extra_details?: string | null
}

export type ReconciliationRow = ReconciliationSourceRow & {
  queue: ReconciliationQueue
  severity: ReconciliationSeverity
  reasons: string[]
}

export type ReconciliationSummary = {
  rows: ReconciliationRow[]
  counts: Record<ReconciliationQueue, number>
}

const QUEUES: ReconciliationQueue[] = [
  'ready_to_list',
  'needs_enrichment',
  'cert_only',
  'duplicate_cert',
  'sold_but_seen',
  'awaiting_auction',
  'listed_or_other',
]

function value(row: ReconciliationSourceRow, key: keyof ReconciliationSourceRow): string {
  return String(row[key] ?? '').trim()
}

function normalized(valueToNormalize: string | null | undefined): string {
  return String(valueToNormalize ?? '').trim().toUpperCase()
}

function hasStrictCardFields(row: ReconciliationSourceRow): boolean {
  return Boolean(value(row, 'set_abbr') && value(row, 'num') && value(row, 'lang'))
}

function isPhysicallyConfirmed(row: ReconciliationSourceRow): boolean {
  const stockSource = normalized(row.stock_source)
  return Boolean(row.source_stocktake_scan_id) || stockSource === 'PHYSICAL_STOCKTAKE' || stockSource === 'MANUAL'
}

function isSold(row: ReconciliationSourceRow): boolean {
  return Boolean(row.sold_date) || normalized(row.sales_status) === 'SOLD'
}

function isAwaitingAuction(row: ReconciliationSourceRow): boolean {
  return normalized(row.listing_state) === 'AWAITING_AUCTION' || normalized(row.sales_status) === 'AWAITING AUCTION'
}

function isListed(row: ReconciliationSourceRow): boolean {
  return Boolean(row.listed_date) || normalized(row.listing_state) === 'LISTED' || normalized(row.sales_status) === 'LISTED'
}

function isMetadataConfirmed(row: ReconciliationSourceRow): boolean {
  const status = normalized(row.metadata_status)
  return !status || status === 'PARSED_CONFIRMED' || status === 'CONFIRMED'
}

export function classifySlabReconciliationRow(
  row: ReconciliationSourceRow,
  options: { duplicateCert?: boolean } = {}
): ReconciliationRow {
  const reasons: string[] = []

  if (options.duplicateCert) {
    reasons.push('duplicate cert')
    return { ...row, queue: 'duplicate_cert', severity: 'danger', reasons }
  }

  if (isSold(row) && isPhysicallyConfirmed(row)) {
    reasons.push('sold but physically confirmed/seen')
    return { ...row, queue: 'sold_but_seen', severity: 'danger', reasons }
  }

  if (isAwaitingAuction(row)) {
    reasons.push('awaiting auction')
    return { ...row, queue: 'awaiting_auction', severity: 'info', reasons }
  }

  const strictFields = hasStrictCardFields(row)
  const metadataStatus = normalized(row.metadata_status)
  if (metadataStatus === 'PSA_METADATA_ONLY') {
    reasons.push('PSA metadata only')
    return { ...row, queue: 'cert_only', severity: 'warn', reasons }
  }

  if (!strictFields || !isMetadataConfirmed(row)) {
    if (!strictFields) reasons.push('missing strict card fields')
    if (!isMetadataConfirmed(row)) reasons.push(`metadata ${row.metadata_status}`)
    return { ...row, queue: 'needs_enrichment', severity: 'warn', reasons }
  }

  if (isPhysicallyConfirmed(row) && !isSold(row) && !isListed(row)) {
    reasons.push('physically confirmed')
    reasons.push('not listed or sold')
    return { ...row, queue: 'ready_to_list', severity: 'good', reasons }
  }

  reasons.push(isListed(row) ? 'already listed' : 'not physically confirmed')
  return { ...row, queue: 'listed_or_other', severity: 'info', reasons }
}

export function summarizeReconciliationQueues(rows: ReconciliationSourceRow[]): ReconciliationSummary {
  const certCounts = new Map<string, number>()
  rows.forEach((row) => {
    const cert = normalized(row.cert)
    if (cert) certCounts.set(cert, (certCounts.get(cert) ?? 0) + 1)
  })

  const classifiedRows = rows.map((row) => classifySlabReconciliationRow(row, {
    duplicateCert: Boolean(row.cert && (certCounts.get(normalized(row.cert)) ?? 0) > 1),
  }))

  const counts = Object.fromEntries(QUEUES.map((queue) => [queue, 0])) as Record<ReconciliationQueue, number>
  classifiedRows.forEach((row) => {
    counts[row.queue] += 1
  })

  return { rows: classifiedRows, counts }
}

export function filterReconciliationRows(
  rows: ReconciliationRow[],
  queue: ReconciliationQueue | 'all',
  searchText: string
): ReconciliationRow[] {
  const search = searchText.trim().toLowerCase()
  return rows.filter((row) => {
    if (queue !== 'all' && row.queue !== queue) return false
    if (!search) return true
    return [
      row.cert,
      row.sku,
      row.card_name,
      row.grade,
      row.set_abbr,
      row.num,
      row.lang,
      row.psa_order_number,
      row.psa_description,
      row.psa_card_name,
      row.psa_set_name,
      row.psa_parsed_set_abbr,
      row.psa_parsed_num,
      row.psa_parsed_lang,
      row.psa_match_status,
      row.psa_review_reason,
      ...row.reasons,
    ].some((entry) => String(entry ?? '').toLowerCase().includes(search))
  })
}

function csvCell(valueToEscape: unknown): string {
  const raw = Array.isArray(valueToEscape) ? valueToEscape.join('; ') : String(valueToEscape ?? '')
  if (!/[",\n]/.test(raw)) return raw
  return `"${raw.replace(/"/g, '""')}"`
}

export function exportReconciliationRowsCsv(rows: ReconciliationRow[]): string {
  const headers = [
    'queue',
    'severity',
    'cert',
    'sku',
    'card name',
    'grade',
    'current set',
    'current number',
    'current lang',
    'psa order',
    'psa raw description',
    'psa parsed set',
    'psa parsed number',
    'psa parsed lang',
    'psa match status',
    'psa review reason',
    'listing state',
    'sales status',
    'metadata status',
    'stock source',
    'reasons',
  ]
  const lines = rows.map((row) => [
    row.queue,
    row.severity,
    row.cert,
    row.sku,
    row.card_name,
    row.grade,
    row.set_abbr,
    row.num,
    row.lang,
    row.psa_order_number,
    row.psa_description,
    row.psa_parsed_set_abbr,
    row.psa_parsed_num,
    row.psa_parsed_lang,
    row.psa_match_status,
    row.psa_review_reason,
    row.listing_state,
    row.sales_status,
    row.metadata_status,
    row.stock_source,
    row.reasons,
  ].map(csvCell).join(','))
  return [headers.join(','), ...lines].join('\n')
}
