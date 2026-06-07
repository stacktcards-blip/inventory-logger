import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  getMasterCardReviewActions,
  isMasterCardReviewActionable,
  type MasterCardReviewAction,
} from '../lib/masterCardsReviewActions'

type MatchStatus =
  | 'MATCHED_EXISTING'
  | 'NEW_CARD_CANDIDATE'
  | 'SET_MAPPING_NEEDED'
  | 'CARD_NAME_CONFLICT'
  | 'VARIANT_CANDIDATE'
  | 'PARSE_INCOMPLETE'

type ReviewFilter = MatchStatus | 'all' | 'actionable' | 'pending'

type MasterCardImportRow = {
  id: number
  source: string
  source_card_id: string | null
  source_set_id: string | null
  source_set_name: string | null
  source_card_name: string | null
  source_card_number: string | null
  source_language: string | null
  source_rarity: string | null
  normalized_card_name: string | null
  normalized_set_abbr: string | null
  normalized_num: string | null
  normalized_lang: string | null
  match_status: MatchStatus
  match_reason: string | null
  existing_master_card_id: number | null
  raw_payload: unknown | null
  review_status: string | null
  reviewed_at: string | null
  updated_at: string | null
}

const FILTERS: Array<{ value: ReviewFilter; label: string }> = [
  { value: 'actionable', label: 'Actionable' },
  { value: 'pending', label: 'Pending' },
  { value: 'CARD_NAME_CONFLICT', label: 'API name updates' },
  { value: 'VARIANT_CANDIDATE', label: 'Variants' },
  { value: 'NEW_CARD_CANDIDATE', label: 'New cards' },
  { value: 'SET_MAPPING_NEEDED', label: 'Set mapping' },
  { value: 'PARSE_INCOMPLETE', label: 'Parse incomplete' },
  { value: 'MATCHED_EXISTING', label: 'Matched' },
  { value: 'all', label: 'All' },
]

const STATUS_TONE: Record<MatchStatus, string> = {
  MATCHED_EXISTING: 'border-emerald-900/50 bg-emerald-950/40 text-emerald-200',
  NEW_CARD_CANDIDATE: 'border-blue-900/50 bg-blue-950/40 text-blue-200',
  SET_MAPPING_NEEDED: 'border-purple-900/50 bg-purple-950/40 text-purple-200',
  CARD_NAME_CONFLICT: 'border-amber-900/50 bg-amber-950/40 text-amber-200',
  VARIANT_CANDIDATE: 'border-cyan-900/50 bg-cyan-950/40 text-cyan-200',
  PARSE_INCOMPLETE: 'border-red-900/50 bg-red-950/40 text-red-200',
}

export function MasterCardsReviewPage() {
  const [rows, setRows] = useState<MasterCardImportRow[]>([])
  const [activeFilter, setActiveFilter] = useState<ReviewFilter>('actionable')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadRows = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: queryError } = await supabase
        .from('master_card_import_staging')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1000)
      if (queryError) throw queryError
      setRows((data ?? []) as MasterCardImportRow[])
    } catch (e) {
      setRows([])
      setError(e instanceof Error ? e.message : 'Could not load master card import staging rows')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRows()
  }, [])

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: rows.length, actionable: 0, pending: 0 }
    for (const row of rows) {
      next[row.match_status] = (next[row.match_status] ?? 0) + 1
      if (isMasterCardReviewActionable({ matchStatus: row.match_status, reviewStatus: row.review_status })) next.actionable += 1
      if ((row.review_status ?? 'pending') === 'pending') next.pending += 1
    }
    return next
  }, [rows])

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesFilter = activeFilter === 'all'
        ? true
        : activeFilter === 'actionable'
          ? isMasterCardReviewActionable({ matchStatus: row.match_status, reviewStatus: row.review_status })
          : activeFilter === 'pending'
            ? (row.review_status ?? 'pending') === 'pending'
            : row.match_status === activeFilter

      if (!matchesFilter) return false
      if (!query) return true

      return [
        row.source_card_name,
        row.source_card_number,
        row.source_set_name,
        row.normalized_set_abbr,
        row.normalized_num,
        row.normalized_lang,
        row.match_status,
        row.match_reason,
        row.review_status,
        row.source_card_id,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [activeFilter, rows, searchText])

  const refreshRow = (updated: Partial<MasterCardImportRow> & { id: number }) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
  }

  const applyApiName = async (row: MasterCardImportRow) => {
    if (!row.existing_master_card_id || !row.source_card_name?.trim()) return
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const { error: masterError } = await supabase
        .from('master_cards')
        .update({ card_name: row.source_card_name.trim() })
        .eq('id', row.existing_master_card_id)
      if (masterError) throw masterError

      const { error: stagingError } = await supabase
        .from('master_card_import_staging')
        .update({
          match_status: 'MATCHED_EXISTING',
          match_reason: 'API card name applied to master_cards after strict key match',
          review_status: 'applied_api_name',
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (stagingError) throw stagingError

      refreshRow({
        id: row.id,
        match_status: 'MATCHED_EXISTING',
        match_reason: 'API card name applied to master_cards after strict key match',
        review_status: 'applied_api_name',
        reviewed_at: new Date().toISOString(),
      })
      setMessage(`Updated master_cards name to “${row.source_card_name.trim()}”.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not apply API name')
    } finally {
      setSavingId(null)
    }
  }

  const createVariant = async (row: MasterCardImportRow) => {
    if (!row.existing_master_card_id || !row.source_card_name?.trim()) return
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const variantLabel = inferVariantLabel(row.source_card_name)
      const variantCode = inferVariantCode(row.source_card_name, row.source_card_id ?? String(row.id))
      const { error: variantError } = await supabase
        .from('master_card_variants')
        .upsert({
          master_card_id: row.existing_master_card_id,
          variant_code: variantCode,
          variant_label: variantLabel,
          rarity: row.source_rarity,
          source: row.source,
          source_card_id: row.source_card_id,
          source_card_name: row.source_card_name,
          source_card_number: row.source_card_number,
          is_default: false,
          display_order: 10,
          raw_payload: row.raw_payload,
        }, { onConflict: 'master_card_id,variant_code' })
      if (variantError) throw variantError

      const { error: stagingError } = await supabase
        .from('master_card_import_staging')
        .update({ review_status: 'variant_created', reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (stagingError) throw stagingError

      refreshRow({ id: row.id, review_status: 'variant_created', reviewed_at: new Date().toISOString() })
      setMessage(`Created variant ${variantCode} / ${variantLabel}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create variant')
    } finally {
      setSavingId(null)
    }
  }


  const rejectCardNameConflict = async (row: MasterCardImportRow) => {
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const { error: stagingError } = await supabase
        .from('master_card_import_staging')
        .update({ review_status: 'rejected_card_name_conflict', reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (stagingError) throw stagingError

      refreshRow({ id: row.id, review_status: 'rejected_card_name_conflict', reviewed_at: new Date().toISOString() })
      setMessage('Rejected card name conflict. master_cards was not changed.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject card name conflict')
    } finally {
      setSavingId(null)
    }
  }


  const rejectVariant = async (row: MasterCardImportRow) => {
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const { error: stagingError } = await supabase
        .from('master_card_import_staging')
        .update({ review_status: 'rejected_variant', reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (stagingError) throw stagingError

      refreshRow({ id: row.id, review_status: 'rejected_variant', reviewed_at: new Date().toISOString() })
      setMessage('Rejected variant candidate. Nothing was imported.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reject variant')
    } finally {
      setSavingId(null)
    }
  }

  const skipParseIncomplete = async (row: MasterCardImportRow) => {
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const { error: stagingError } = await supabase
        .from('master_card_import_staging')
        .update({ review_status: 'skipped_parse_incomplete', reviewed_at: new Date().toISOString() })
        .eq('id', row.id)
      if (stagingError) throw stagingError
      refreshRow({ id: row.id, review_status: 'skipped_parse_incomplete', reviewed_at: new Date().toISOString() })
      setMessage('Marked parse-incomplete row as skipped. Nothing was imported.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not skip row')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Master Cards Review
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Review external card-reference staging rows before changing canonical card identity. Parse-incomplete rows are skipped, not imported.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadRows()}
          className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</div>}
      {message && <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">{message}</div>}

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-9">
        {FILTERS.map((filter) => {
          const active = activeFilter === filter.value
          return (
            <button
              key={filter.value}
              type="button"
              onClick={() => setActiveFilter(filter.value)}
              className={`rounded-lg border p-3 text-left transition-colors ${active ? 'border-blue-500/60 bg-blue-950/40 text-blue-100' : 'border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 text-slate-300 hover:bg-base-elevated/70'}`}
            >
              <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{filter.label}</div>
              <div className="mt-1 text-xl font-semibold">{loading ? '…' : counts[filter.value] ?? 0}</div>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="block min-w-[18rem] flex-1">
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">Search review rows</span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search name, set, number, source id, status..."
            className="w-full rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <div className="text-xs text-slate-500">Showing {visibleRows.length} of {rows.length} loaded rows</div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
        <table className="min-w-full divide-y divide-base-border/60">
          <thead className="bg-gradient-to-b from-slate-800/80 to-slate-900/60">
            <tr>
              {['Status', 'Source card', 'Strict key', 'Source', 'Review', 'Reason', 'Action'].map((header) => (
                <th key={header} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base-border/60">
            {visibleRows.map((row) => (
              <ReviewRow
                key={row.id}
                row={row}
                saving={savingId === row.id}
                onApplyApiName={applyApiName}
                onRejectCardNameConflict={rejectCardNameConflict}
                onCreateVariant={createVariant}
                onRejectVariant={rejectVariant}
                onSkipParseIncomplete={skipParseIncomplete}
              />
            ))}
          </tbody>
        </table>
        {!loading && !visibleRows.length && (
          <div className="px-4 py-8 text-center text-sm text-slate-500">No rows in this queue/filter.</div>
        )}
        {loading && <div className="px-4 py-8 text-center text-sm text-slate-500">Loading master card review rows…</div>}
      </div>
    </div>
  )
}

function ReviewRow({
  row,
  saving,
  onApplyApiName,
  onRejectCardNameConflict,
  onCreateVariant,
  onRejectVariant,
  onSkipParseIncomplete,
}: {
  row: MasterCardImportRow
  saving: boolean
  onApplyApiName: (row: MasterCardImportRow) => Promise<void>
  onRejectCardNameConflict: (row: MasterCardImportRow) => Promise<void>
  onCreateVariant: (row: MasterCardImportRow) => Promise<void>
  onRejectVariant: (row: MasterCardImportRow) => Promise<void>
  onSkipParseIncomplete: (row: MasterCardImportRow) => Promise<void>
}) {
  const strictKey = [row.normalized_set_abbr, row.normalized_num, row.normalized_lang].filter(Boolean).join(' / ') || '—'

  return (
    <tr className="transition-colors hover:bg-base-elevated/50">
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        <span className={`rounded-full border px-2 py-0.5 ${STATUS_TONE[row.match_status]}`}>{row.match_status}</span>
      </td>
      <td className="min-w-[16rem] px-3 py-2 text-xs">
        <div className="font-medium text-slate-100">{row.source_card_name || '—'}</div>
        <div className="text-slate-500">#{row.source_card_number || '—'} · {row.source_rarity || 'rarity unknown'}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">{strictKey}</td>
      <td className="min-w-[12rem] px-3 py-2 text-xs text-slate-300">
        <div>{row.source_set_name || row.source}</div>
        <div className="text-slate-500">{row.source_card_id || row.source_set_id || '—'}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">{row.review_status || 'pending'}</td>
      <td className="min-w-[16rem] px-3 py-2 text-xs text-slate-400">{row.match_reason || '—'}</td>
      <td className="whitespace-nowrap px-3 py-2 text-xs">
        <RowAction
          row={row}
          saving={saving}
          onApplyApiName={onApplyApiName}
          onRejectCardNameConflict={onRejectCardNameConflict}
          onCreateVariant={onCreateVariant}
          onRejectVariant={onRejectVariant}
          onSkipParseIncomplete={onSkipParseIncomplete}
        />
      </td>
    </tr>
  )
}

function RowAction({
  row,
  saving,
  onApplyApiName,
  onRejectCardNameConflict,
  onCreateVariant,
  onRejectVariant,
  onSkipParseIncomplete,
}: {
  row: MasterCardImportRow
  saving: boolean
  onApplyApiName: (row: MasterCardImportRow) => Promise<void>
  onRejectCardNameConflict: (row: MasterCardImportRow) => Promise<void>
  onCreateVariant: (row: MasterCardImportRow) => Promise<void>
  onRejectVariant: (row: MasterCardImportRow) => Promise<void>
  onSkipParseIncomplete: (row: MasterCardImportRow) => Promise<void>
}) {
  const buttonClass = 'rounded-md border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
  const actions = getMasterCardReviewActions({ matchStatus: row.match_status, reviewStatus: row.review_status })
  const hasAction = (action: MasterCardReviewAction) => actions.includes(action)

  if (hasAction('apply_api_name')) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !row.existing_master_card_id || !row.source_card_name}
          onClick={() => void onApplyApiName(row)}
          className={`${buttonClass} border-amber-600/50 bg-amber-600/20 text-amber-100 hover:bg-amber-600/30`}
        >
          {saving ? 'Applying…' : 'Use API name'}
        </button>
        {hasAction('reject_card_name_conflict') && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void onRejectCardNameConflict(row)}
            className={`${buttonClass} border-slate-600/50 bg-slate-900/60 text-slate-300 hover:bg-slate-800`}
          >
            {saving ? 'Rejecting…' : 'Reject'}
          </button>
        )}
      </div>
    )
  }

  if (hasAction('create_variant')) {
    return (
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving || !row.existing_master_card_id || !row.source_card_name}
          onClick={() => void onCreateVariant(row)}
          className={`${buttonClass} border-cyan-600/50 bg-cyan-600/20 text-cyan-100 hover:bg-cyan-600/30`}
        >
          {saving ? 'Creating…' : 'Create variant'}
        </button>
        {hasAction('reject_variant') && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void onRejectVariant(row)}
            className={`${buttonClass} border-slate-600/50 bg-slate-900/60 text-slate-300 hover:bg-slate-800`}
          >
            {saving ? 'Rejecting…' : 'Reject'}
          </button>
        )}
      </div>
    )
  }

  if (hasAction('skip_parse_incomplete')) {
    return (
      <button
        type="button"
        disabled={saving}
        onClick={() => void onSkipParseIncomplete(row)}
        className={`${buttonClass} border-red-700/50 bg-red-950/40 text-red-200 hover:bg-red-900/40`}
      >
        {saving ? 'Skipping…' : 'Skip / do not import'}
      </button>
    )
  }

  return <span className="text-slate-600">—</span>
}

function inferVariantLabel(sourceName: string) {
  const parenthetical = sourceName.match(/\(([^)]+)\)/)?.[1]?.trim()
  if (parenthetical) return parenthetical
  if (/stamped/i.test(sourceName)) return 'Stamped'
  if (/reverse/i.test(sourceName)) return 'Reverse Holo'
  return 'Variant'
}

function inferVariantCode(sourceName: string, fallback: string) {
  if (/stamped/i.test(sourceName)) return 'STAMPED'
  if (/reverse/i.test(sourceName)) return 'REVERSE'
  const parenthetical = sourceName.match(/\(([^)]+)\)/)?.[1]
  const source = parenthetical || fallback
  const cleaned = source.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return cleaned.slice(0, 40) || `VARIANT_${fallback}`
}
