import { supabase } from '../lib/supabase'
import type { SlabsFilters } from '../types/slabs'

const SLABS_SELECT_COLUMNS = [
  'id',
  'sku',
  'cert',
  'card_name',
  'set_abbr',
  'num',
  'lang',
  'grade',
  'grading_company',
  'sales_status',
  'slab_origin',
  'raw_seller',
  'raw_cost_aud',
  'raw_purchase_date',
  'submission_date',
  'listed_date',
  'sold_date',
  'source_psa_row_id',
] as const

const CSV_COLUMNS = [
  'sku',
  'cert',
  'card_name',
  'set_abbr',
  'num',
  'lang',
  'grade',
  'grading_company',
  'sales_status',
  'slab_origin',
  'raw_seller',
  'raw_cost_aud',
  'raw_purchase_date',
  'submission_date',
  'listed_date',
  'sold_date',
  'psa_order_number',
  'psa_description',
  'psa_grade',
  'psa_parsed_set_abbr',
  'psa_parsed_num',
  'psa_parsed_lang',
  'psa_match_status',
  'psa_review_reason',
] as const

type SlabExportRow = Record<(typeof SLABS_SELECT_COLUMNS)[number], unknown> & {
  cert?: string | null
  source_psa_row_id?: string | null
}

type PsaStagingRow = {
  id: string
  cert_number: string | null
  psa_order_number: string | null
  description: string | null
  grade: string | null
  numeric_grade: number | null
  parsed_set_abbr: string | null
  parsed_num: string | null
  parsed_lang: string | null
  master_card_match_status: string | null
  parse_review_reason: string | null
}

type EnrichedExportRow = SlabExportRow & {
  psa_order_number?: string | null
  psa_description?: string | null
  psa_grade?: string | number | null
  psa_parsed_set_abbr?: string | null
  psa_parsed_num?: string | null
  psa_parsed_lang?: string | null
  psa_match_status?: string | null
  psa_review_reason?: string | null
}

function escapeCsvValue(val: unknown): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function normalizeCert(cert: unknown): string {
  return String(cert ?? '').replace(/[^0-9A-Za-z]/g, '')
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function psaProposalScore(row: PsaStagingRow): number {
  let score = 0
  if (row.master_card_match_status === 'MATCHED_CONFIRMED') score += 100
  if (row.parsed_set_abbr && row.parsed_num && row.parsed_lang) score += 40
  if (row.parsed_set_abbr) score += 5
  if (row.parsed_num) score += 5
  if (row.parsed_lang) score += 5
  return score
}

function choosePsaRow(slab: SlabExportRow, candidates: PsaStagingRow[]): PsaStagingRow | null {
  if (!candidates.length) return null
  const linked = slab.source_psa_row_id
    ? candidates.find((candidate) => candidate.id === slab.source_psa_row_id)
    : null
  if (linked) return linked
  return [...candidates].sort((a, b) => psaProposalScore(b) - psaProposalScore(a))[0] ?? null
}

async function fetchPsaRowsForSlabs(rows: SlabExportRow[]): Promise<Map<string, PsaStagingRow[]>> {
  const certs = [...new Set(rows.map((row) => normalizeCert(row.cert)).filter(Boolean))]
  const psaRows: PsaStagingRow[] = []
  for (const certChunk of chunk(certs, 100)) {
    const { data, error } = await supabase
      .from('psa_grading_order_rows')
      .select('id,cert_number,psa_order_number,description,grade,numeric_grade,parsed_set_abbr,parsed_num,parsed_lang,master_card_match_status,parse_review_reason')
      .in('cert_number', certChunk)
    if (error) throw error
    psaRows.push(...((data ?? []) as PsaStagingRow[]))
  }

  const psaByCert = new Map<string, PsaStagingRow[]>()
  psaRows.forEach((row) => {
    const cert = normalizeCert(row.cert_number)
    if (!cert) return
    const bucket = psaByCert.get(cert) ?? []
    bucket.push(row)
    psaByCert.set(cert, bucket)
  })
  return psaByCert
}

function enrichRowsWithPsa(rows: SlabExportRow[], psaByCert: Map<string, PsaStagingRow[]>): EnrichedExportRow[] {
  return rows.map((row) => {
    const psa = choosePsaRow(row, psaByCert.get(normalizeCert(row.cert)) ?? [])
    if (!psa) return row
    return {
      ...row,
      psa_order_number: psa.psa_order_number,
      psa_description: psa.description,
      psa_grade: psa.grade ?? psa.numeric_grade,
      psa_parsed_set_abbr: psa.parsed_set_abbr,
      psa_parsed_num: psa.parsed_num,
      psa_parsed_lang: psa.parsed_lang,
      psa_match_status: psa.master_card_match_status,
      psa_review_reason: psa.parse_review_reason,
    }
  })
}

export async function exportSlabsToCsv(
  filters: SlabsFilters
): Promise<string> {
  const sortAsc = filters.sortDir === 'asc'
  let query = supabase
    .from('slabs_dashboard')
    .select(SLABS_SELECT_COLUMNS.join(','))
    .order(filters.sortBy, { ascending: sortAsc, nullsFirst: false })
    .order('id')

  if (filters.salesStatus) {
    query = query.eq('sales_status', filters.salesStatus)
  }
  if (filters.slabOrigin) {
    query = query.eq('slab_origin', filters.slabOrigin)
  }
  if (filters.gradingOrderId) {
    query = query.eq('grading_order_id', parseInt(filters.gradingOrderId, 10))
  }
  if (filters.gradingCompany) {
    query = query.eq('grading_company', filters.gradingCompany)
  }
  if (filters.grade) {
    query = query.eq('grade', filters.grade)
  }
  if (filters.searchText.trim()) {
    const term = `%${filters.searchText.trim()}%`
    query = query.or(
      `card_name.ilike.${term},sku.ilike.${term},set_abbr.ilike.${term},num.ilike.${term},cert.ilike.${term}`
    )
  }

  const { data, error } = await query
  if (error) throw error

  const rows = ((data ?? []) as unknown) as SlabExportRow[]
  const psaByCert = await fetchPsaRowsForSlabs(rows)
  const enrichedRows = enrichRowsWithPsa(rows, psaByCert)
  const header = CSV_COLUMNS.join(',')
  const body = enrichedRows
    .map((row) =>
      CSV_COLUMNS.map((col) => escapeCsvValue(row[col])).join(',')
    )
    .join('\n')
  return `${header}\n${body}`
}

export function downloadCsv(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
