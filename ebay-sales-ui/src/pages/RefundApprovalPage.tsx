import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateSydney } from '../lib/date'

type RefundRequest = {
  id: string
  ebay_sale_id?: string
  slab_id?: string
  reason?: string | null
  status?: string
  requested_at?: string
}

export function RefundApprovalPage() {
  const [refunds, setRefunds] = useState<RefundRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getRefundsPending()
      setRefunds(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
      setRefunds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleApprove = async (id: string) => {
    try {
      await api.approveRefund(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await api.rejectRefund(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reject failed')
    }
  }

  if (loading) {
    return <div className="py-8 text-center text-slate-400">Loading refund requests...</div>
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold text-slate-100">Refund Approval</h1>
      {error && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {refunds.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center text-slate-400">
          No pending refund requests.
        </div>
      ) : (
        <div className="space-y-4">
          {refunds.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-700 bg-slate-800/50 p-4"
            >
              <div>
                <div className="text-sm text-slate-300">
                  Sale: {r.ebay_sale_id} · Slab: {r.slab_id}
                </div>
                <div className="mt-1 text-slate-400">{r.reason ?? 'No reason provided'}</div>
                {r.requested_at && (
                  <div className="mt-1 text-xs text-slate-500">{formatDateSydney(r.requested_at)}</div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleApprove(r.id)}
                  className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500"
                >
                  Approve
                </button>
                <button
                  onClick={() => handleReject(r.id)}
                  className="rounded-md bg-red-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-500/80"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
