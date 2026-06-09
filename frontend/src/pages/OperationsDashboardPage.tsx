import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { syncEbaySales, type EbaySalesSyncSummary } from '../lib/ebaySalesApi'

type QueueTone = 'danger' | 'warn' | 'info' | 'good'

type DashboardQueue = {
  id: string
  title: string
  description: string
  owner: string
  actionLabel: string
  actionHref: string
  tone: QueueTone
  count: number | null
  loading: boolean
  error: string | null
  samples: QueueSample[]
}

type QueueSample = {
  id: string
  primary: string
  secondary: string
  meta?: string
}

type SlabSampleRow = {
  id: string
  sku: string | null
  cert: string | null
  grading_company: string | null
  grade: string | null
  card_name: string | null
  set_abbr: string | null
  num: string | null
  lang: string | null
  sales_status: string | null
  listing_state: string | null
  metadata_status: string | null
  stock_source: string | null
  raw_card_id: number | null
  sale_price?: number | null
  sold_date?: string | null
}

type RawCardSampleRow = {
  id: number
  SKU: string | null
  card_name: string | null
  set_abbr: string | null
  num: string | null
  lang: string | null
  purchase_price: number | null
  currency: string | null
  seller: string | null
  purchase_date: string | null
  cond: string | null
}

type SalesPackingImportSampleRow = {
  id: string
  uploaded_at: string | null
  source_filename: string | null
  expanded_row_count: number | null
  status: string | null
}

type MasterCardSampleRow = {
  id: number
  set_abbr: string | null
  num: string | null
  lang: string | null
  card_name: string | null
}

type EbaySaleRow = {
  id: string
  title: string | null
  quantity: number | null
  sale_price: number | null
  currency: string | null
  sold_date: string | null
  buyer_username: string | null
  fulfillment_status: string | null
  updated_at: string | null
}

type EbaySyncLogRow = {
  status: string | null
  orders_fetched: number | null
  sales_created: number | null
  completed_at: string | null
  error_message: string | null
}

type EbaySalesPanelState = {
  loading: boolean
  syncing: boolean
  error: string | null
  totalRows: number | null
  last7Revenue: number
  last7LineItems: number
  unfulfilledCount: number | null
  recentSales: EbaySaleRow[]
  lastSync: EbaySyncLogRow | null
  lastSyncSummary: EbaySalesSyncSummary | null
}

type SupabaseFilterQuery = any

const SAMPLE_LIMIT = 5

function toneClass(tone: QueueTone): string {
  if (tone === 'danger') return 'border-red-800/60 bg-red-950/25 text-red-100'
  if (tone === 'warn') return 'border-amber-800/60 bg-amber-950/25 text-amber-100'
  if (tone === 'good') return 'border-emerald-800/60 bg-emerald-950/25 text-emerald-100'
  return 'border-blue-800/60 bg-blue-950/25 text-blue-100'
}

function badgeClass(tone: QueueTone): string {
  if (tone === 'danger') return 'border-red-700/60 bg-red-900/40 text-red-100'
  if (tone === 'warn') return 'border-amber-700/60 bg-amber-900/40 text-amber-100'
  if (tone === 'good') return 'border-emerald-700/60 bg-emerald-900/40 text-emerald-100'
  return 'border-blue-700/60 bg-blue-900/40 text-blue-100'
}

function slabLabel(row: SlabSampleRow): string {
  const card = row.card_name || [row.set_abbr, row.num, row.lang].filter(Boolean).join(' ') || 'Unknown card'
  const cert = row.cert ? `cert ${row.cert}` : 'missing cert'
  const grade = [row.grading_company, row.grade].filter(Boolean).join(' ') || 'missing grade'
  return `${card} · ${grade} · ${cert}`
}

function rawCardLabel(row: RawCardSampleRow): string {
  return row.card_name || [row.set_abbr, row.num, row.lang].filter(Boolean).join(' ') || row.SKU || `Raw card #${row.id}`
}

function missingSlabFields(row: SlabSampleRow): string {
  const missing = [
    ['cert', row.cert],
    ['grader', row.grading_company],
    ['grade', row.grade],
    ['set', row.set_abbr],
    ['num', row.num],
    ['lang', row.lang],
    ['card name', row.card_name],
  ].filter(([, value]) => !String(value ?? '').trim()).map(([label]) => label)
  return missing.length ? `Missing: ${missing.join(', ')}` : row.metadata_status || 'Needs review'
}

function missingRawFields(row: RawCardSampleRow): string {
  const missing = [
    ['set', row.set_abbr],
    ['num', row.num],
    ['lang', row.lang],
    ['cost', row.purchase_price],
    ['seller', row.seller],
    ['date', row.purchase_date],
    ['condition', row.cond],
    ['card name', row.card_name],
  ].filter(([, value]) => !String(value ?? '').trim()).map(([label]) => label)
  return missing.length ? `Missing: ${missing.join(', ')}` : 'Needs review'
}

async function querySlabQueue(
  applyFilters: (query: SupabaseFilterQuery) => SupabaseFilterQuery,
  sampleOrder: { column: string; ascending?: boolean } = { column: 'id', ascending: true }
): Promise<{ count: number | null; samples: SlabSampleRow[] }> {
  const baseSelect = 'id, sku, cert, grading_company, grade, card_name, set_abbr, num, lang, sales_status, listing_state, metadata_status, stock_source, raw_card_id, sale_price, sold_date'
  const countQuery = applyFilters(supabase.from('slabs_dashboard').select('id', { count: 'exact', head: true }))
  const { count, error: countError } = await countQuery
  if (countError) throw countError

  const sampleQuery = applyFilters(supabase.from('slabs_dashboard').select(baseSelect))
    .order(sampleOrder.column, { ascending: sampleOrder.ascending ?? true, nullsFirst: false })
    .limit(SAMPLE_LIMIT)
  const { data, error } = await sampleQuery
  if (error) throw error
  return { count: count ?? 0, samples: (data ?? []) as SlabSampleRow[] }
}

async function queryRawQueue(
  applyFilters: (query: SupabaseFilterQuery) => SupabaseFilterQuery
): Promise<{ count: number | null; samples: RawCardSampleRow[] }> {
  const baseSelect = 'id, SKU, card_name, set_abbr, num, lang, purchase_price, currency, seller, purchase_date, cond'
  const countQuery = applyFilters(supabase.from('raw_cards_enriched').select('id', { count: 'exact', head: true }))
  const { count, error: countError } = await countQuery
  if (countError) throw countError

  const sampleQuery = applyFilters(supabase.from('raw_cards_enriched').select(baseSelect))
    .order('purchase_date', { ascending: false, nullsFirst: false })
    .limit(SAMPLE_LIMIT)
  const { data, error } = await sampleQuery
  if (error) throw error
  return { count: count ?? 0, samples: (data ?? []) as RawCardSampleRow[] }
}

async function querySalesPackingPending(): Promise<{ count: number | null; samples: SalesPackingImportSampleRow[] }> {
  const statuses = ['imported', 'partially_scanned']
  const { count, error: countError } = await supabase
    .from('sales_packing_imports')
    .select('id', { count: 'exact', head: true })
    .in('status', statuses)
  if (countError) throw countError

  const { data, error } = await supabase
    .from('sales_packing_imports')
    .select('id, uploaded_at, source_filename, expanded_row_count, status')
    .in('status', statuses)
    .order('uploaded_at', { ascending: false })
    .limit(SAMPLE_LIMIT)
  if (error) throw error
  return { count: count ?? 0, samples: (data ?? []) as SalesPackingImportSampleRow[] }
}

async function queryMasterCardsMissingNames(): Promise<{ count: number | null; samples: MasterCardSampleRow[] }> {
  const filter = 'card_name.is.null,card_name.eq.'
  const { count, error: countError } = await supabase
    .from('master_cards')
    .select('id', { count: 'exact', head: true })
    .or(filter)
  if (countError) throw countError

  const { data, error } = await supabase
    .from('master_cards')
    .select('id, set_abbr, num, lang, card_name')
    .or(filter)
    .order('set_abbr', { ascending: true, nullsFirst: false })
    .limit(SAMPLE_LIMIT)
  if (error) throw error
  return { count: count ?? 0, samples: (data ?? []) as MasterCardSampleRow[] }
}

const emptyEbaySalesPanel = (): EbaySalesPanelState => ({
  loading: true,
  syncing: false,
  error: null,
  totalRows: null,
  last7Revenue: 0,
  last7LineItems: 0,
  unfulfilledCount: null,
  recentSales: [],
  lastSync: null,
  lastSyncSummary: null,
})

async function queryEbaySalesPanel(): Promise<Omit<EbaySalesPanelState, 'loading' | 'syncing' | 'error' | 'lastSyncSummary'>> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { count: totalRows, error: totalError } = await supabase
    .from('ebay_sales')
    .select('id', { count: 'exact', head: true })
  if (totalError) throw totalError

  const { count: unfulfilledCount, error: unfulfilledError } = await supabase
    .from('ebay_sales')
    .select('id', { count: 'exact', head: true })
    .in('fulfillment_status', ['NOT_STARTED', 'IN_PROGRESS'])
  if (unfulfilledError) throw unfulfilledError

  const { data: last7Rows, error: last7Error } = await supabase
    .from('ebay_sales')
    .select('id, quantity, sale_price, currency, sold_date, fulfillment_status, title, buyer_username, updated_at')
    .gte('sold_date', since)
  if (last7Error) throw last7Error

  const { data: recentSales, error: recentError } = await supabase
    .from('ebay_sales')
    .select('id, quantity, sale_price, currency, sold_date, fulfillment_status, title, buyer_username, updated_at')
    .order('sold_date', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false, nullsFirst: false })
    .limit(5)
  if (recentError) throw recentError

  const { data: syncLogs, error: syncLogError } = await supabase
    .from('ebay_sync_log')
    .select('status, orders_fetched, sales_created, completed_at, error_message')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(1)
  if (syncLogError) throw syncLogError

  const typedLast7Rows = (last7Rows ?? []) as EbaySaleRow[]
  const last7Revenue = typedLast7Rows.reduce((sum, row) => sum + Number(row.sale_price ?? 0), 0)

  return {
    totalRows: totalRows ?? 0,
    last7Revenue,
    last7LineItems: typedLast7Rows.length,
    unfulfilledCount: unfulfilledCount ?? 0,
    recentSales: (recentSales ?? []) as EbaySaleRow[],
    lastSync: ((syncLogs ?? [])[0] ?? null) as EbaySyncLogRow | null,
  }
}

function emptyQueues(): DashboardQueue[] {
  return [
    {
      id: 'slab-critical-fields',
      title: 'Slabs missing critical identity',
      description: 'Cert, grader, grade, strict card key, or card-name enrichment is missing. These block clean picking, matching, and valuation.',
      owner: 'Ops / inventory cleanup',
      actionLabel: 'Open Slabs',
      actionHref: '/',
      tone: 'danger',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
    {
      id: 'slab-metadata-review',
      title: 'Slabs needing metadata review',
      description: 'Rows promoted from staging or stocktake that still need enrichment/review before they become trusted inventory truth.',
      owner: 'Metadata cleanup',
      actionLabel: 'Open Slabs',
      actionHref: '/',
      tone: 'warn',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
    {
      id: 'listed-unlinked-slabs',
      title: 'Listed slabs not linked to raw cards',
      description: 'Listed stock without raw-card linkage weakens lifecycle/profit tracking and makes regrade history harder to trust.',
      owner: 'Lifecycle hygiene',
      actionLabel: 'Open Slabs',
      actionHref: '/',
      tone: 'warn',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
    {
      id: 'sold-missing-sale-data',
      title: 'Sold slabs missing sale data',
      description: 'Sold rows without sale price or eBay sale link block margin/profit reporting.',
      owner: 'Sales/profit cleanup',
      actionLabel: 'Open Slabs',
      actionHref: '/',
      tone: 'danger',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
    {
      id: 'raw-critical-fields',
      title: 'Raw cards missing purchase/card fields',
      description: 'Missing cost, seller, date, condition, strict card key, or card-name match makes grading ROI and accounting unreliable.',
      owner: 'Raw intake cleanup',
      actionLabel: 'Open Raw Cards',
      actionHref: '/raw-cards',
      tone: 'warn',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
    {
      id: 'pending-packing-sessions',
      title: 'Sales Packing sessions still pending',
      description: 'Saved CSV sessions that have not been fully scanned yet. These are packing-day work-in-progress.',
      owner: 'Packing',
      actionLabel: 'Open Sales Packing',
      actionHref: '/sales-packing',
      tone: 'info',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
    {
      id: 'master-card-name-gaps',
      title: 'Master cards missing names',
      description: 'Reference rows without names reduce lookup confidence and make inventory screens harder to use.',
      owner: 'Master-card data',
      actionLabel: 'Open Master Cards',
      actionHref: '/master-cards/review',
      tone: 'info',
      count: null,
      loading: true,
      error: null,
      samples: [],
    },
  ]
}

export function OperationsDashboardPage() {
  const [queues, setQueues] = useState<DashboardQueue[]>(emptyQueues)
  const [ebaySales, setEbaySales] = useState<EbaySalesPanelState>(emptyEbaySalesPanel)
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null)

  const loadEbaySales = useCallback(async () => {
    setEbaySales((current) => ({ ...current, loading: true, error: null }))
    try {
      const result = await queryEbaySalesPanel()
      setEbaySales((current) => ({
        ...current,
        ...result,
        loading: false,
        error: null,
      }))
    } catch (error) {
      setEbaySales((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : 'Could not load eBay sales',
      }))
    }
  }, [])

  const handleSyncEbaySales = useCallback(async () => {
    setEbaySales((current) => ({ ...current, syncing: true, error: null }))
    try {
      const summary = await syncEbaySales(7)
      const result = await queryEbaySalesPanel()
      setEbaySales((current) => ({
        ...current,
        ...result,
        loading: false,
        syncing: false,
        error: null,
        lastSyncSummary: summary,
      }))
      setLastLoadedAt(new Date())
    } catch (error) {
      setEbaySales((current) => ({
        ...current,
        syncing: false,
        error: error instanceof Error ? error.message : 'Could not sync eBay sales',
      }))
    }
  }, [])

  const loadDashboard = useCallback(async () => {
    setQueues(emptyQueues())
    void loadEbaySales()

    const jobs: Array<Promise<DashboardQueue>> = [
      querySlabQueue((query) => query.or('cert.is.null,cert.eq.,grading_company.is.null,grading_company.eq.,grade.is.null,grade.eq.,set_abbr.is.null,set_abbr.eq.,num.is.null,num.eq.,lang.is.null,lang.eq.,card_name.is.null,card_name.eq.'))
        .then((result) => ({
          ...emptyQueues()[0],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: row.id,
            primary: slabLabel(row),
            secondary: missingSlabFields(row),
            meta: row.sales_status || row.listing_state || undefined,
          })),
        })),
      querySlabQueue((query) => query.in('metadata_status', ['NEEDS_ENRICHMENT', 'NEEDS_REVIEW', 'PSA_METADATA_ONLY']).neq('sales_status', 'SOLD'))
        .then((result) => ({
          ...emptyQueues()[1],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: row.id,
            primary: slabLabel(row),
            secondary: row.metadata_status || 'Needs metadata review',
            meta: row.stock_source || undefined,
          })),
        })),
      querySlabQueue((query) => query.eq('sales_status', 'LISTED').eq('is_linked_to_raw', false), { column: 'listed_date', ascending: false })
        .then((result) => ({
          ...emptyQueues()[2],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: row.id,
            primary: slabLabel(row),
            secondary: 'Listed but raw_card_id is missing',
            meta: row.sku || undefined,
          })),
        })),
      querySlabQueue((query) => query.eq('sales_status', 'SOLD').or('sale_price.is.null,ebay_sale_id.is.null'), { column: 'sold_date', ascending: false })
        .then((result) => ({
          ...emptyQueues()[3],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: row.id,
            primary: slabLabel(row),
            secondary: row.sale_price == null ? 'Missing sale price' : 'Missing eBay sale link',
            meta: row.sold_date || undefined,
          })),
        })),
      queryRawQueue((query) => query.or('set_abbr.is.null,set_abbr.eq.,num.is.null,num.eq.,lang.is.null,lang.eq.,purchase_price.is.null,seller.is.null,seller.eq.,purchase_date.is.null,cond.is.null,cond.eq.,card_name.is.null,card_name.eq.'))
        .then((result) => ({
          ...emptyQueues()[4],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: String(row.id),
            primary: rawCardLabel(row),
            secondary: missingRawFields(row),
            meta: [row.seller, row.purchase_date].filter(Boolean).join(' · ') || undefined,
          })),
        })),
      querySalesPackingPending()
        .then((result) => ({
          ...emptyQueues()[5],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: row.id,
            primary: row.source_filename || 'Pasted CSV',
            secondary: `${row.expanded_row_count ?? 0} packing rows · ${row.status ?? 'unknown'}`,
            meta: row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : undefined,
          })),
        })),
      queryMasterCardsMissingNames()
        .then((result) => ({
          ...emptyQueues()[6],
          count: result.count,
          loading: false,
          samples: result.samples.map((row) => ({
            id: String(row.id),
            primary: [row.set_abbr, row.num, row.lang].filter(Boolean).join(' ') || `Master card #${row.id}`,
            secondary: 'Missing canonical card name',
          })),
        })),
    ]

    const results = await Promise.allSettled(jobs)
    setQueues((current) => current.map((queue, index) => {
      const result = results[index]
      if (result?.status === 'fulfilled') return result.value
      return {
        ...queue,
        loading: false,
        error: result?.status === 'rejected' && result.reason instanceof Error
          ? result.reason.message
          : 'Could not load queue',
      }
    }))
    setLastLoadedAt(new Date())
  }, [loadEbaySales])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const totals = useMemo(() => {
    const loadedQueues = queues.filter((queue) => !queue.loading && !queue.error)
    const totalExceptions = loadedQueues.reduce((sum, queue) => sum + (queue.count ?? 0), 0)
    const urgentCount = loadedQueues
      .filter((queue) => queue.tone === 'danger')
      .reduce((sum, queue) => sum + (queue.count ?? 0), 0)
    const queueCount = loadedQueues.filter((queue) => (queue.count ?? 0) > 0).length
    return { totalExceptions, urgentCount, queueCount }
  }, [queues])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Operations Dashboard
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Exception-first view of the inventory issues that make packing, profit, and lifecycle tracking less trustworthy.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
        >
          Refresh
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <DashboardMetric label="Open issues" value={totals.totalExceptions.toLocaleString()} tone={totals.totalExceptions ? 'warn' : 'good'} />
        <DashboardMetric label="Urgent issues" value={totals.urgentCount.toLocaleString()} tone={totals.urgentCount ? 'danger' : 'good'} />
        <DashboardMetric label="Active queues" value={totals.queueCount.toLocaleString()} tone={totals.queueCount ? 'info' : 'good'} />
        <DashboardMetric label="Last refresh" value={lastLoadedAt ? lastLoadedAt.toLocaleTimeString() : 'Loading…'} tone="default" />
      </div>

      <EbaySalesPanel sales={ebaySales} onSync={() => void handleSyncEbaySales()} />

      <div className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 p-4 text-sm text-slate-300 shadow-lg shadow-black/20">
        <div className="font-semibold text-slate-100">How to use this MVP</div>
        <p className="mt-1 text-xs text-slate-400">
          Work top-down: fix red queues first, then amber. Each card shows the count, why it matters, a few example rows, and a link back to the source workflow.
        </p>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {queues.map((queue) => (
          <ExceptionQueueCard key={queue.id} queue={queue} />
        ))}
      </div>
    </div>
  )
}

function DashboardMetric({ label, value, tone }: { label: string; value: string; tone: 'default' | QueueTone }) {
  const className = tone === 'danger'
    ? 'border-red-800/50 bg-red-950/30 text-red-200'
    : tone === 'warn'
      ? 'border-amber-800/50 bg-amber-950/30 text-amber-200'
      : tone === 'good'
        ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-200'
        : tone === 'info'
          ? 'border-blue-800/50 bg-blue-950/30 text-blue-200'
          : 'border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 text-slate-200'

  return (
    <div className={`rounded-lg border p-3 ${className}`}>
      <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
}

function EbaySalesPanel({ sales, onSync }: { sales: EbaySalesPanelState; onSync: () => void }) {
  const lastSync = sales.lastSync?.completed_at ? new Date(sales.lastSync.completed_at).toLocaleString() : 'Not synced yet'
  const syncLabel = sales.syncing ? 'Syncing…' : 'Sync eBay sales now'

  return (
    <section className="rounded-lg border border-blue-800/60 bg-blue-950/20 p-4 shadow-lg shadow-black/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-100">eBay Sales Sync — read only</h2>
          <p className="mt-1 max-w-3xl text-xs text-slate-400">
            Pulls 2stackt Sell Fulfillment orders into `ebay_sales` for visibility only. It does not mark slabs sold or change inventory.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/sales"
            className="rounded-md border border-blue-600/70 bg-blue-900/30 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-800/60"
          >
            Open Sales Ledger
          </Link>
          <button
            type="button"
            onClick={onSync}
            disabled={sales.syncing}
            className="rounded-md border border-blue-700/70 bg-blue-900/40 px-3 py-2 text-xs font-semibold text-blue-100 hover:bg-blue-800/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {syncLabel}
          </button>
        </div>
      </div>

      {sales.error && (
        <div className="mt-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {sales.error}
        </div>
      )}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <DashboardMetric label="Synced rows" value={sales.loading ? 'Loading…' : (sales.totalRows ?? 0).toLocaleString()} tone="info" />
        <DashboardMetric label="Last 7d line items" value={sales.loading ? 'Loading…' : sales.last7LineItems.toLocaleString()} tone="info" />
        <DashboardMetric label="Last 7d gross" value={sales.loading ? 'Loading…' : formatCurrency(sales.last7Revenue)} tone="good" />
        <DashboardMetric label="Awaiting fulfilment" value={sales.loading ? 'Loading…' : (sales.unfulfilledCount ?? 0).toLocaleString()} tone={(sales.unfulfilledCount ?? 0) ? 'warn' : 'good'} />
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
        <span>Last sync: <span className="text-slate-200">{lastSync}</span></span>
        {sales.lastSync && <span>Last result: <span className="text-slate-200">{sales.lastSync.orders_fetched ?? 0} orders / {sales.lastSync.sales_created ?? 0} line items</span></span>}
        {sales.lastSyncSummary && (
          <span>
            Just synced: <span className="text-slate-200">{sales.lastSyncSummary.ordersFetched} orders / {sales.lastSyncSummary.lineItemsUpserted} line items</span>
          </span>
        )}
        {sales.lastSyncSummary && (
          <span>
            Auto-match: <span className="text-slate-200">{sales.lastSyncSummary.autoMatchMatched} linked / {sales.lastSyncSummary.autoMatchReviewed} reviewed</span>
          </span>
        )}
      </div>

      <div className="mt-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recent synced sales</div>
        {sales.loading ? (
          <div className="h-16 animate-pulse rounded-md bg-slate-800/70" />
        ) : sales.recentSales.length ? (
          sales.recentSales.map((sale) => (
            <div key={sale.id} className="rounded-md border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs">
              <div className="font-medium text-slate-100">{sale.title || 'Untitled eBay line item'}</div>
              <div className="mt-0.5 text-slate-400">
                {sale.sold_date || 'No sold date'} · {sale.buyer_username || 'buyer unknown'} · {formatCurrency(Number(sale.sale_price ?? 0))} · {sale.fulfillment_status || 'status unknown'}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs text-slate-400">
            No synced eBay sales found yet.
          </div>
        )}
      </div>
    </section>
  )
}

function ExceptionQueueCard({ queue }: { queue: DashboardQueue }) {
  return (
    <section className={`rounded-lg border p-4 shadow-lg shadow-black/20 ${toneClass(queue.tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{queue.title}</h2>
          <p className="mt-1 text-xs text-slate-300/80">{queue.description}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeClass(queue.tone)}`}>
          {queue.loading ? '…' : queue.error ? 'Error' : (queue.count ?? 0).toLocaleString()}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-slate-400">Owner: {queue.owner}</span>
        <Link
          to={queue.actionHref}
          className="rounded-md border border-slate-600/60 bg-slate-900/50 px-2.5 py-1 font-medium text-slate-200 transition-colors hover:bg-slate-800"
        >
          {queue.actionLabel}
        </Link>
      </div>

      {queue.error ? (
        <div className="mt-3 rounded-md border border-red-800/60 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {queue.error}
        </div>
      ) : queue.loading ? (
        <div className="mt-3 space-y-2">
          {[...Array(3)].map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-md bg-slate-800/70" />
          ))}
        </div>
      ) : queue.samples.length ? (
        <div className="mt-3 space-y-2">
          {queue.samples.map((sample) => (
            <div key={sample.id} className="rounded-md border border-slate-700/60 bg-slate-950/30 px-3 py-2 text-xs">
              <div className="font-medium text-slate-100">{sample.primary}</div>
              <div className="mt-0.5 text-slate-400">{sample.secondary}</div>
              {sample.meta && <div className="mt-0.5 text-slate-500">{sample.meta}</div>}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-emerald-800/40 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200">
          No current issues in this queue.
        </div>
      )}
    </section>
  )
}
