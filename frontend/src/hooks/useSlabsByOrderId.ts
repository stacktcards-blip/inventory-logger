import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { SlabsDashboardRow } from '../types/slabs'

export function useSlabsByOrderId(orderId: number | null) {
  const [data, setData] = useState<SlabsDashboardRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const fetchSlabs = useCallback(async () => {
    if (!orderId) {
      setData([])
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: rows, error: err } = await supabase
        .from('slabs_dashboard')
        .select('*')
        .eq('grading_order_id', orderId)
        .order('sku')

      if (err) throw err
      setData((rows ?? []) as SlabsDashboardRow[])
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to fetch slabs'))
      setData([])
    } finally {
      setLoading(false)
    }
  }, [orderId])

  useEffect(() => {
    fetchSlabs()
  }, [fetchSlabs])

  return { data, loading, error, refetch: fetchSlabs }
}
