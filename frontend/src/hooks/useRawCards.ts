import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { RawCardRow, RawCardsFilters } from '../types/rawCards'

export const PAGE_SIZE = 100

export function useRawCards(filters: RawCardsFilters, page: number) {
  const [data, setData] = useState<RawCardRow[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchRawCards = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const sortAsc = filters.sortDir === 'asc'
      let query = supabase
        .from('raw_cards_enriched')
        .select('*', { count: 'exact' })
        .order(filters.sortBy, {
          ascending: sortAsc,
          nullsFirst: false,
        })
        .order('id')
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1)

      if (filters.setAbbr.trim()) {
        query = query.ilike('set_abbr', `%${filters.setAbbr.trim()}%`)
      }
      if (filters.num.trim()) {
        query = query.ilike('num', `%${filters.num.trim()}%`)
      }
      if (filters.lang.trim()) {
        query = query.eq('lang', filters.lang.trim())
      }
      if (filters.seller.trim()) {
        query = query.ilike('seller', `%${filters.seller.trim()}%`)
      }
      if (filters.dateFrom) {
        query = query.gte('purchase_date', filters.dateFrom)
      }
      if (filters.dateTo) {
        query = query.lte('purchase_date', filters.dateTo)
      }
      if (filters.searchText.trim()) {
        const term = `%${filters.searchText.trim()}%`
        query = query.or(
          `set_abbr.ilike.${term},num.ilike.${term},card_name.ilike.${term},seller.ilike.${term},note.ilike.${term}`
        )
      }

      const { data: rows, error: err, count } = await query

      if (err) throw err
      setData((rows ?? []) as RawCardRow[])
      setTotalCount(count ?? null)
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch raw cards'))
      setData([])
      setTotalCount(null)
    } finally {
      setLoading(false)
    }
  }, [
    filters.setAbbr,
    filters.num,
    filters.lang,
    filters.seller,
    filters.dateFrom,
    filters.dateTo,
    filters.searchText,
    filters.sortBy,
    filters.sortDir,
    page,
  ])

  useEffect(() => {
    fetchRawCards()
  }, [fetchRawCards])

  return { data, totalCount, loading, error, refetch: fetchRawCards }
}
