import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateSydney } from '../lib/date'
import { formatGrade } from '../lib/format'

type PackingSale = {
  id: string
  title?: string | null
  image_url?: string | null
  card_name?: string | null
  grade?: string | null
  grading_company?: string | null
  num?: string | null
  set_abbr?: string | null
  set_name?: string | null
  buyer_username?: string | null
  sale_price?: number | null
  sold_date?: string | null
  match_status?: string
  slabs?: { cert?: string | null; grade?: string | null; num?: string | null } | null
}

export function PackingListPage() {
  const [sales, setSales] = useState<PackingSale[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [backfilling, setBackfilling] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.getPacking()
      setSales(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSync = async () => {
    setSyncing(true)
    setError(null)
    try {
      await api.triggerSync()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  const handleBackfill = async () => {
    setBackfilling(true)
    setError(null)
    try {
      await api.backfillParsed()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backfill failed')
    } finally {
      setBackfilling(false)
    }
  }

  const displayCardName = (s: PackingSale) =>
    s.card_name || (s.slabs as unknown as { card_name?: string })?.card_name || s.title || '—'
  const displayCert = (s: PackingSale) =>
    (s.slabs as { cert?: string } | null)?.cert ?? '—'
  const displayGrade = (s: PackingSale) => {
    const grade = s.grade ?? (s.slabs as { grade?: string } | null)?.grade
    return formatGrade(s.grading_company, grade)
  }
  const displayNum = (s: PackingSale) =>
    s.num ?? (s.slabs as { num?: string } | null)?.num ?? '—'

  if (loading) {
    return (
      <div className="py-8 text-center text-slate-400">Loading packing list...</div>
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-100">Packing List</h1>
        <div className="flex gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {syncing ? 'Syncing...' : 'Sync from eBay'}
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button
            onClick={handleBackfill}
            disabled={backfilling}
            className="rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500 disabled:opacity-50"
          >
            {backfilling ? 'Refreshing...' : 'Refresh parsed data & images'}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-4 rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {sales.length === 0 ? (
        <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-8 text-center text-slate-400">
          No orders awaiting shipment.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-800/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Image</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Card</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Cert</th>
                <th className="min-w-[5rem] whitespace-nowrap px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Set</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">#</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Sold</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Buyer</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700 bg-slate-900/50">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="h-12 w-12 rounded object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded bg-slate-700 text-xs text-slate-500">
                        —
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-200">{displayCardName(s)}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-300">{displayCert(s)}</td>
                  <td className="min-w-[5rem] whitespace-nowrap px-4 py-3 text-sm text-slate-300">{displayGrade(s)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">
                    {[s.set_abbr, s.set_name].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{displayNum(s)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDateSydney(s.sold_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{s.buyer_username ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-200">
                    {s.sale_price != null ? `$${s.sale_price}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
