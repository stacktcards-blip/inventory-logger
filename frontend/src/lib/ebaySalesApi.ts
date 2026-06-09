import { supabase } from './supabase'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE.replace(/\/$/, '')}${path}`
  const { data: { session } } = await supabase.auth.getSession()
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  const res = await fetch(url, {
    ...options,
    headers,
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.message ?? json?.error ?? res.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return json as T
}

export type EbaySalesSyncSummary = {
  storeAccount: string
  daysBack: number
  startDate: string
  endDate: string
  ordersFetched: number
  lineItemsUpserted: number
}

export async function syncEbaySales(daysBack = 7): Promise<EbaySalesSyncSummary> {
  const result = await request<{ status: string; mode: 'read_only'; summary: EbaySalesSyncSummary }>(
    `/ebay/sales/sync?store=2stackt&daysBack=${encodeURIComponent(String(daysBack))}`,
    { method: 'POST' }
  )
  return result.summary
}
