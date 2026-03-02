import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateSydney } from '../lib/date'

type Sale = {
  id: string
  title?: string | null
  card_name?: string | null
  sale_price?: number | null
  sold_date?: string | null
  match_status?: string
  fulfillment_status?: string
  slab_id?: string | null
}

export function SalesInboxPage() {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState({ match_status: '', fulfillment_status: '' })

  const load = async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (filter.match_status) params.match_status = filter.match_status
      if (filter.fulfillment_status) params.fulfillment_status = filter.fulfillment_status
      const data = await api.getSales(params)
      setSales(Array.isArray(data) ? data : [])
    } catch {
      setSales([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [filter.match_status, filter.fulfillment_status])

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Sales Inbox</h1>
        <button
          onClick={() => load()}
          disabled={loading}
          className="rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
        >
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <select
          value={filter.match_status}
          onChange={(e) => setFilter((f) => ({ ...f, match_status: e.target.value }))}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">All match status</option>
          <option value="PENDING">Pending</option>
          <option value="MATCHED">Matched</option>
          <option value="MANUAL_REVIEW">Manual review</option>
        </select>
        <select
          value={filter.fulfillment_status}
          onChange={(e) => setFilter((f) => ({ ...f, fulfillment_status: e.target.value }))}
          className="rounded-md border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200"
        >
          <option value="">All fulfillment</option>
          <option value="NOT_STARTED">Not started</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="FULFILLED">Fulfilled</option>
        </select>
      </div>
      {loading ? (
        <div className="py-8 text-center text-slate-400">Loading...</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Card</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Sold</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Match</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Fulfillment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900/50">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {s.card_name || s.title || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {s.sale_price != null ? `$${s.sale_price}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDateSydney(s.sold_date)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        s.match_status === 'MATCHED'
                          ? 'bg-green-900/40 text-green-300'
                          : s.match_status === 'MANUAL_REVIEW'
                            ? 'bg-amber-900/40 text-amber-300'
                            : 'bg-slate-700 text-slate-400'
                      }`}
                    >
                      {s.match_status ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">
                    {s.fulfillment_status ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {sales.length === 0 && (
            <div className="p-8 text-center text-slate-400">No sales match filters.</div>
          )}
        </div>
      )}
    </div>
  )
}
