import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SlabsDashboardRow, SlabsFilters } from '../types/slabs'

const PAGE_SIZE = 50

export function useSlabs(filters: SlabsFilters, page: number) {
  const [data, setData] = useState<SlabsDashboardRow[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchSlabs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sortAsc = filters.sortDir === 'asc'
      let query = supabase
        .from('slabs_dashboard')
        .select('*', { count: 'exact' })
        .order(filters.sortBy, {
          ascending: sortAsc,
          nullsFirst: false,
        })
        .order('id')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

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

      const { data: rows, error: err, count } = await query

      if (err) throw err
      setData((rows ?? []) as SlabsDashboardRow[])
      setTotalCount(count ?? null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch slabs'))
      setData([])
      setTotalCount(null)
    } finally {
      setLoading(false)
    }
  }, [filters.salesStatus, filters.slabOrigin, filters.searchText, filters.gradingOrderId, filters.gradingCompany, filters.grade, filters.sortBy, filters.sortDir, page])

  useEffect(() => {
    fetchSlabs()
  }, [fetchSlabs])

  return { data, totalCount, loading, error, refetch: fetchSlabs }
}

export { PAGE_SIZE }
