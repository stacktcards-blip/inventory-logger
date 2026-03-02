import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export type GradingOrderRow = {
  id: number
  order_number: string | null
  grading_company: string | null
  submission_date: string | null
  slabs_total: number
  slabs_linked: number
  slabs_unlinked: number
}

export function useGradingOrders() {
  const [data, setData] = useState<GradingOrderRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('grading_orders_dashboard')
      .select('*')
      .order('submission_date', { ascending: false, nullsFirst: false })
      .limit(100)
      .then(({ data: rows, error }) => {
        setLoading(false)
        if (!error) setData((rows as GradingOrderRow[]) ?? [])
      })
  }, [])

  return { data, loading }
}
