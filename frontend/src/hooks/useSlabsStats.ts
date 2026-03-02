import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export type SlabsStats = {
  total: number
  notListed: number
  listed: number
  sold: number
  unlinked: number
}

export function useSlabsStats() {
  const [stats, setStats] = useState<SlabsStats | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStats = useCallback(async () => {
    try {
      const [totalRes, notListedRes, listedRes, soldRes, unlinkedRes] =
        await Promise.all([
          supabase.from('slabs_dashboard').select('*', { count: 'exact', head: true }),
          supabase.from('slabs_dashboard').select('*', { count: 'exact', head: true }).eq('sales_status', 'NOT LISTED'),
          supabase.from('slabs_dashboard').select('*', { count: 'exact', head: true }).eq('sales_status', 'LISTED'),
          supabase.from('slabs_dashboard').select('*', { count: 'exact', head: true }).eq('sales_status', 'SOLD'),
          supabase.from('slabs_dashboard').select('*', { count: 'exact', head: true }).eq('is_linked_to_raw', false),
        ])

      setStats({
        total: totalRes.count ?? 0,
        notListed: notListedRes.count ?? 0,
        listed: listedRes.count ?? 0,
        sold: soldRes.count ?? 0,
        unlinked: unlinkedRes.count ?? 0,
      })
    } catch {
      setStats(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return { stats, loading, refetch: fetchStats }
}
