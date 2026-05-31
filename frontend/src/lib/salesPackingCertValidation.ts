export type CertValidationStatus =
  | 'empty'
  | 'found_available'
  | 'not_found'
  | 'duplicate_in_session'
  | 'not_available'
  | 'needs_enrichment'
  | 'duplicate_in_inventory'

export type CertValidationSlabRow = {
  id: string
  cert: string | null
  sku?: string | null
  card_name?: string | null
  grade?: string | null
  grading_company?: string | null
  set_abbr?: string | null
  num?: string | null
  lang?: string | null
  sales_status?: string | null
  listing_state?: string | null
  sold_date?: string | null
  metadata_status?: string | null
}

export type CertValidationSlabSummary = {
  id: string
  cert: string
  sku: string | null
  cardName: string | null
  grade: string | null
  gradingCompany: string | null
  setAbbr: string | null
  num: string | null
  lang: string | null
  salesStatus: string | null
  listingState: string | null
  metadataStatus: string | null
}

export type CertValidationResult = {
  status: CertValidationStatus
  tone: 'default' | 'good' | 'warn' | 'danger'
  message: string
  slab: CertValidationSlabSummary | null
}

export type ScannedCert = { rowKey: string; cert: string }

function normalizeCert(cert: string | null | undefined): string {
  return String(cert ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

function normalizedText(value: string | null | undefined): string {
  return String(value ?? '').trim().toUpperCase()
}

function summarizeSlab(row: CertValidationSlabRow): CertValidationSlabSummary {
  return {
    id: row.id,
    cert: normalizeCert(row.cert),
    sku: row.sku ?? null,
    cardName: row.card_name ?? null,
    grade: row.grade ?? null,
    gradingCompany: row.grading_company ?? null,
    setAbbr: row.set_abbr ?? null,
    num: row.num ?? null,
    lang: row.lang ?? null,
    salesStatus: row.sales_status ?? null,
    listingState: row.listing_state ?? null,
    metadataStatus: row.metadata_status ?? null,
  }
}

export function buildCertValidationMap(rows: CertValidationSlabRow[]): Map<string, CertValidationSlabSummary[]> {
  const map = new Map<string, CertValidationSlabSummary[]>()
  rows.forEach((row) => {
    const cert = normalizeCert(row.cert)
    if (!cert) return
    const list = map.get(cert) ?? []
    list.push(summarizeSlab(row))
    map.set(cert, list)
  })
  return map
}

function displayName(slab: CertValidationSlabSummary): string {
  return [slab.gradingCompany, slab.grade, slab.cardName || slab.sku || slab.cert]
    .filter(Boolean)
    .join(' ')
}

function slabNeedsEnrichment(slab: CertValidationSlabSummary): boolean {
  const status = normalizedText(slab.metadataStatus)
  return Boolean(
    !slab.setAbbr ||
    !slab.num ||
    !slab.lang ||
    (status && status !== 'PARSED_CONFIRMED' && status !== 'CONFIRMED')
  )
}

function slabUnavailable(slab: CertValidationSlabSummary): boolean {
  return normalizedText(slab.salesStatus) === 'SOLD' || normalizedText(slab.listingState) === 'SOLD'
}

export function validatePackingCert(
  rawCert: string,
  rowKey: string,
  slabsByCert: Map<string, CertValidationSlabSummary[]>,
  scannedCerts: ScannedCert[]
): CertValidationResult {
  const cert = normalizeCert(rawCert)
  if (!cert) {
    return { status: 'empty', tone: 'default', message: 'Scan cert', slab: null }
  }

  const duplicateInSession = scannedCerts.some((entry) => entry.rowKey !== rowKey && normalizeCert(entry.cert) === cert)
  if (duplicateInSession) {
    return { status: 'duplicate_in_session', tone: 'danger', message: 'Already scanned in this packing session', slab: null }
  }

  const matches = slabsByCert.get(cert) ?? []
  if (matches.length === 0) {
    return { status: 'not_found', tone: 'warn', message: 'Cert not found in slab DB', slab: null }
  }

  const slab = matches[0]
  if (matches.length > 1) {
    return { status: 'duplicate_in_inventory', tone: 'danger', message: 'Duplicate cert rows in slab DB', slab }
  }

  if (slabUnavailable(slab)) {
    return { status: 'not_available', tone: 'danger', message: `${displayName(slab)} — appears sold/not available`, slab }
  }

  if (slabNeedsEnrichment(slab)) {
    return { status: 'needs_enrichment', tone: 'warn', message: `${displayName(slab)} — needs metadata review`, slab }
  }

  return { status: 'found_available', tone: 'good', message: displayName(slab), slab }
}

export const normalizePackingCert = normalizeCert
