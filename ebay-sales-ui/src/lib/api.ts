import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_EBAY_SALES_API_URL || 'http://localhost:3002'

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export async function fetchApi(path: string, init?: RequestInit) {
  const headers = { ...(await getAuthHeaders()), ...init?.headers }
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, { ...init, headers })
  } catch (e) {
    if (e instanceof TypeError && e.message === 'Failed to fetch') {
      throw new Error(
        'Cannot reach API. Ensure ebay-sales is running on ' + API_URL + ' and CORS is configured.'
      )
    }
    throw e
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  return res.json()
}

export const api = {
  getPacking: () => fetchApi('/api/sales/packing'),
  getSales: (params?: { match_status?: string; fulfillment_status?: string; date_from?: string; date_to?: string }) => {
    const q = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return fetchApi(`/api/sales${q}`)
  },
  getSale: (id: string) => fetchApi(`/api/sales/${id}`),
  matchByCert: (cert: string, saleId: string) =>
    fetchApi('/api/sales/match-by-cert', {
      method: 'POST',
      body: JSON.stringify({ cert, sale_id: saleId }),
    }),
  matchManually: (saleId: string, slabId: string) =>
    fetchApi(`/api/sales/${saleId}/match`, {
      method: 'PATCH',
      body: JSON.stringify({ slab_id: slabId }),
    }),
  triggerSync: () => fetchApi('/api/sales/trigger-sync', { method: 'POST' }),
  backfillParsed: () => fetchApi('/api/sales/backfill-parsed', { method: 'POST' }),
  getRefundsPending: () => fetchApi('/api/refunds/pending'),
  approveRefund: (id: string) => fetchApi(`/api/refunds/${id}/approve`, { method: 'POST' }),
  rejectRefund: (id: string) => fetchApi(`/api/refunds/${id}/reject`, { method: 'POST' }),
}
