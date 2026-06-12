import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  exportReconciliationRowsCsv,
  filterReconciliationRows,
  summarizeReconciliationQueues,
  type ReconciliationQueue,
  type ReconciliationRow,
  type ReconciliationSourceRow,
} from '../lib/slabReconciliation'

const QUEUE_LABELS: Record<ReconciliationQueue | 'all', string> = {
  all: 'All',
  ready_to_list: 'Ready / safe-ish to list',
  needs_enrichment: 'Needs enrichment',
  cert_only: 'Cert-only / PSA metadata',
  duplicate_cert: 'Duplicate cert conflicts',
  sold_but_seen: 'Sold but physically seen',
  awaiting_auction: 'Awaiting auction',
  listed_or_other: 'Listed / other',
}

const QUEUE_ORDER: Array<ReconciliationQueue | 'all'> = [
  'all',
  'ready_to_list',
  'needs_enrichment',
  'cert_only',
  'duplicate_cert',
  'sold_but_seen',
  'awaiting_auction',
  'listed_or_other',
]

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

type PsaStagingRow = {
  id: string
  cert_number: string | null
  psa_order_number: string | null
  description: string | null
  grade: string | null
  numeric_grade: number | null
  set_name: string | null
  set_code: string | null
  card_number: string | null
  card_name: string | null
  parsed_set_abbr: string | null
  parsed_num: string | null
  parsed_lang: string | null
  master_card_match_status: string | null
  parse_review_reason: string | null
  psa_label_extra_details: string | null
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
  return chunks
}

function normalizeCert(cert: string | null | undefined): string {
  return String(cert ?? '').replace(/[^0-9A-Za-z]/g, '')
}

function psaProposalScore(row: PsaStagingRow): number {
  let score = 0
  if (row.master_card_match_status === 'MATCHED_CONFIRMED') score += 100
  if (row.parsed_set_abbr && row.parsed_num && row.parsed_lang) score += 40
  if (row.parsed_set_abbr) score += 5
  if (row.parsed_num) score += 5
  if (row.parsed_lang) score += 5
  return score
}

function choosePsaRow(slab: ReconciliationSourceRow, candidates: PsaStagingRow[]): PsaStagingRow | null {
  if (!candidates.length) return null
  const linked = slab.source_psa_row_id ? candidates.find((candidate) => candidate.id === slab.source_psa_row_id) : null
  if (linked) return linked
  return [...candidates].sort((a, b) => psaProposalScore(b) - psaProposalScore(a))[0] ?? null
}

function attachPsaMetadata(rows: ReconciliationSourceRow[], psaRows: PsaStagingRow[]): ReconciliationSourceRow[] {
  const psaByCert = new Map<string, PsaStagingRow[]>()
  psaRows.forEach((row) => {
    const cert = normalizeCert(row.cert_number)
    if (!cert) return
    const bucket = psaByCert.get(cert) ?? []
    bucket.push(row)
    psaByCert.set(cert, bucket)
  })

  return rows.map((row) => {
    const psa = choosePsaRow(row, psaByCert.get(normalizeCert(row.cert)) ?? [])
    if (!psa) return row
    return {
      ...row,
      psa_order_number: psa.psa_order_number,
      psa_description: psa.description,
      psa_grade: psa.grade,
      psa_numeric_grade: psa.numeric_grade,
      psa_set_name: psa.set_name,
      psa_set_code: psa.set_code,
      psa_card_number: psa.card_number,
      psa_card_name: psa.card_name,
      psa_parsed_set_abbr: psa.parsed_set_abbr,
      psa_parsed_num: psa.parsed_num,
      psa_parsed_lang: psa.parsed_lang,
      psa_match_status: psa.master_card_match_status,
      psa_review_reason: psa.parse_review_reason,
      psa_label_extra_details: psa.psa_label_extra_details,
    }
  })
}

export function SlabReconciliationPage() {
  const [rows, setRows] = useState<ReconciliationSourceRow[]>([])
  const [activeQueue, setActiveQueue] = useState<ReconciliationQueue | 'all'>('all')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase
        .from('slabs_dashboard')
        .select('*')
        .limit(2000)
      if (queryError) throw queryError
      const sourceRows = (data ?? []) as ReconciliationSourceRow[]
      const certs = [...new Set(sourceRows.map((row) => normalizeCert(row.cert)).filter(Boolean))]
      const psaRows: PsaStagingRow[] = []
      for (const certChunk of chunk(certs, 100)) {
        const { data: psaData, error: psaError } = await supabase
          .from('psa_grading_order_rows')
          .select('id,cert_number,psa_order_number,description,grade,numeric_grade,set_name,set_code,card_number,card_name,parsed_set_abbr,parsed_num,parsed_lang,master_card_match_status,parse_review_reason,psa_label_extra_details')
          .in('cert_number', certChunk)
        if (psaError) throw psaError
        psaRows.push(...((psaData ?? []) as PsaStagingRow[]))
      }
      setRows(attachPsaMetadata(sourceRows, psaRows))
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Could not load slab reconciliation data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const summary = useMemo(() => summarizeReconciliationQueues(rows), [rows])
  const visibleRows = useMemo(
    () => filterReconciliationRows(summary.rows, activeQueue, searchText),
    [activeQueue, searchText, summary.rows]
  )

  const handleExport = () => {
    downloadTextFile('stackt-slab-reconciliation.csv', exportReconciliationRowsCsv(visibleRows))
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Slab Reconciliation Cockpit
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Cert-level slab cleanup with PSA staging metadata joined by cert. Compare current slab fields against the raw PSA label and parser proposal, then approve/edit exceptions instead of reconstructing cards from scratch.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadRows()}
            className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={!visibleRows.length}
            className="rounded-md border border-blue-600/50 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-600/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export visible CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
          Reconciliation view unavailable: {error}. Apply the latest slab migrations/views, then refresh.
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
        {QUEUE_ORDER.map((queue) => {
          const count = queue === 'all' ? summary.rows.length : summary.counts[queue]
          const active = queue === activeQueue
          return (
            <button
              key={queue}
              type="button"
              onClick={() => setActiveQueue(queue)}
              className={`rounded-lg border p-3 text-left transition-colors ${active ? 'border-blue-500/60 bg-blue-950/40 text-blue-100' : 'border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 text-slate-300 hover:bg-base-elevated/70'}`}
            >
              <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{QUEUE_LABELS[queue]}</div>
              <div className="mt-1 text-xl font-semibold">{loading ? '…' : count}</div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-[18rem] flex-1">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">Filter visible queue</span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search cert, SKU, card, set, reason..."
            className="w-full rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <div className="text-xs text-slate-500">
          Showing {visibleRows.length} of {summary.rows.length} loaded rows · read-only
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
        <table className="min-w-full divide-y divide-base-border/60">
          <thead className="bg-gradient-to-b from-slate-800/80 to-slate-900/60">
            <tr>
          {[
            'Queue',
            'Cert / SKU',
            'Current slab',
            'PSA raw label',
            'PSA parser proposal',
            'Listing',
            'Metadata',
            'Reasons',
          ].map((header) => (
                <th key={header} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base-border/60">
            {visibleRows.map((row) => <ReconciliationTableRow key={row.id} row={row} />)}
          </tbody>
        </table>
        {!loading && !visibleRows.length && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No rows in this queue/filter. Try another queue or refresh after migrations are applied.
          </div>
        )}
        {loading && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">Loading slab reconciliation rows…</div>
        )}
      </div>
    </div>
  )
}

function ReconciliationTableRow({ row }: { row: ReconciliationRow }) {
  const tone = row.severity === 'danger'
    ? 'bg-red-950/40 text-red-200 border-red-900/50'
    : row.severity === 'warn'
      ? 'bg-amber-950/40 text-amber-200 border-amber-900/50'
      : row.severity === 'good'
        ? 'bg-emerald-950/40 text-emerald-200 border-emerald-900/50'
        : 'bg-slate-800 text-slate-300 border-slate-700'

  return (
    <tr className="transition-colors hover:bg-base-elevated/50">
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 ${tone}`}>{QUEUE_LABELS[row.queue]}</span>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-100">
        <div className="font-mono">{row.cert || '—'}</div>
        <div className="mt-0.5 text-2xs text-slate-500">{row.sku || 'no SKU'}</div>
      </td>
      <td className="min-w-[16rem] px-3 py-2 text-xs text-slate-300">
        <div className="font-medium text-slate-100">{row.card_name || 'No master-card name yet'}</div>
        <div className="mt-1 text-slate-400">{row.grading_company || 'PSA'} {row.grade || '—'} · {[row.set_abbr, row.num, row.lang].filter(Boolean).join(' / ') || 'missing strict fields'}</div>
      </td>
      <td className="min-w-[24rem] px-3 py-2 text-xs text-slate-300">
        <div className="text-slate-100">{row.psa_description || 'No PSA staging row found'}</div>
        {row.psa_order_number && <div className="mt-1 text-2xs text-slate-500">PSA order {row.psa_order_number} · {row.psa_grade || row.psa_numeric_grade || 'grade —'}</div>}
      </td>
      <td className="min-w-[15rem] px-3 py-2 text-xs text-slate-300">
        <div className="font-mono text-slate-100">
          {[row.psa_parsed_set_abbr, row.psa_parsed_num, row.psa_parsed_lang].filter(Boolean).join(' / ') || 'No parser proposal'}
        </div>
        <div className="mt-1 text-2xs text-slate-500">{row.psa_match_status || 'unparsed'}</div>
        {row.psa_review_reason && <div className="mt-1 max-w-xs text-2xs text-amber-200">{row.psa_review_reason}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">
        <div>{row.listing_state || '—'}</div>
        <div className="mt-0.5 text-2xs text-slate-500">{row.sales_status || '—'}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">
        <div>{row.metadata_status || '—'}</div>
        <div className="mt-0.5 text-2xs text-slate-500">{row.stock_source || '—'}</div>
      </td>
      <td className="min-w-[14rem] px-3 py-2 text-xs text-amber-100">{row.reasons.join('; ') || '—'}</td>
    </tr>
  )
}
