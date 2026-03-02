import { supabase } from '../lib/supabase'
import type { SlabsFilters } from '../types/slabs'

const CSV_COLUMNS = [
  'sku',
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
] as const

function escapeCsvValue(val: unknown): string {
  if (val == null) return ''
  const s = String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

export async function exportSlabsToCsv(
  filters: SlabsFilters
): Promise<string> {
  const sortAsc = filters.sortDir === 'asc'
  let query = supabase
    .from('slabs_dashboard')
    .select(CSV_COLUMNS.join(','))
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

  const rows = ((data ?? []) as unknown) as Record<string, unknown>[]
  const header = CSV_COLUMNS.join(',')
  const body = rows
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
