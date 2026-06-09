import { Dispatch, SetStateAction, useCallback, useEffect, useMemo, useState } from 'react'
import { SalesLedgerFilters } from '../components/SalesLedgerFilters'
import { SalesLedgerTable } from '../components/SalesLedgerTable'
import { fetchSalesLedger } from '../lib/ebaySalesApi'
import type { SalesLedgerResponse } from '../types/salesLedger'

const PAGE_SIZE = 50

const today = new Date()
const toIsoDate = (date: Date) => date.toISOString().slice(0, 10)
const defaultStart = toIsoDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000))
const defaultEnd = toIsoDate(today)

const formatAud = (value: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)

type LedgerFilters = {
  startDate: string
  endDate: string
  matchStatus: string
  fulfillmentStatus: string
  search: string
}

const initialFilters: LedgerFilters = {
  startDate: defaultStart,
  endDate: defaultEnd,
  matchStatus: '',
  fulfillmentStatus: '',
  search: '',
}

export function SalesLedgerPage() {
  const [filters, setFilters] = useState<LedgerFilters>(initialFilters)
  const [page, setPage] = useState(0)
  const [data, setData] = useState<SalesLedgerResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetchSalesLedger({
        ...filters,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      setData(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    load()
  }, [load])

  const totalPages = useMemo(() => {
    if (!data) return 1
    return Math.max(1, Math.ceil(data.total / (data.limit || PAGE_SIZE)))
  }, [data])

  const canPrev = page > 0
  const canNext = data ? (page + 1) * PAGE_SIZE < data.total : false

  const handleFiltersChange = useCallback<Dispatch<SetStateAction<LedgerFilters>>>((update) => {
    setFilters((current) => (typeof update === 'function' ? update(current) : update))
    setPage(0)
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-50">Sales Ledger</h1>
        <p className="text-sm text-slate-400">
          Live eBay orders synced via Fulfillment API, enriched with slab + purchase cost data for profit tracking.
        </p>
      </div>

      <SalesLedgerFilters value={filters} onChange={handleFiltersChange} />

      <div className="grid gap-4 sm:grid-cols-3">
        <LedgerStat label="Gross (AUD)" value={data?.totals.gross ?? 0} tone="good" loading={loading && !data} />
        <LedgerStat label="Purchase cost" value={data?.totals.cost ?? 0} tone="warn" loading={loading && !data} />
        <LedgerStat label="Gross profit" value={data?.totals.profit ?? 0} tone="info" loading={loading && !data} />
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-900/60 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/40 p-8 text-center text-slate-400">
          Loading sales ledger…
        </div>
      ) : (
        <SalesLedgerTable rows={data?.rows ?? []} />
      )}

      <div className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-sm text-slate-300">
        <button
          type="button"
          onClick={() => canPrev && setPage((prev) => Math.max(prev - 1, 0))}
          disabled={!canPrev}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 disabled:opacity-40"
        >
          Previous
        </button>
        <div>
          Page {page + 1} / {totalPages} · {data?.total ?? 0} rows
        </div>
        <button
          type="button"
          onClick={() => canNext && setPage((prev) => prev + 1)}
          disabled={!canNext}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  )
}

type LedgerStatProps = {
  label: string
  value: number
  tone: 'good' | 'warn' | 'info'
  loading?: boolean
}

function LedgerStat({ label, value, tone, loading }: LedgerStatProps) {
  const toneClasses =
    tone === 'good'
      ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-100'
      : tone === 'warn'
        ? 'border-amber-900/60 bg-amber-950/20 text-amber-100'
        : 'border-blue-900/60 bg-blue-950/30 text-blue-100'
  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses}`}>
      <div className="text-xs uppercase tracking-wide text-white/60">{label}</div>
      <div className="text-2xl font-semibold">{loading ? '—' : formatAud(value)}</div>
    </div>
  )
}
