import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type MappingStatus = 'confirmed' | 'needs_review' | 'ignored'
type MappingFilter = MappingStatus | 'all'

type ExternalSetMappingRow = {
  id: number
  source: string
  source_set_id: string
  source_set_name: string | null
  lang: string
  stackt_set_abbr: string | null
  confidence: string | null
  status: MappingStatus
  notes: string | null
  updated_at: string | null
}

type MasterSetOption = {
  set_abbr: string
  lang: string
  canonical_set_name: string | null
  card_count: number | null
}

type DraftEdits = Record<number, { stacktSetAbbr: string; notes: string }>

const FILTERS: Array<{ value: MappingFilter; label: string }> = [
  { value: 'needs_review', label: 'Needs review' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'ignored', label: 'Ignored' },
  { value: 'all', label: 'All' },
]

const STATUS_TONE: Record<MappingStatus, string> = {
  confirmed: 'border-emerald-900/50 bg-emerald-950/40 text-emerald-200',
  needs_review: 'border-amber-900/50 bg-amber-950/40 text-amber-200',
  ignored: 'border-slate-700 bg-slate-800 text-slate-300',
}

export function SetMappingReviewPage() {
  const [rows, setRows] = useState<ExternalSetMappingRow[]>([])
  const [masterSets, setMasterSets] = useState<MasterSetOption[]>([])
  const [edits, setEdits] = useState<DraftEdits>({})
  const [activeFilter, setActiveFilter] = useState<MappingFilter>('needs_review')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const [{ data: mappingData, error: mappingError }, loadedMasterSets] = await Promise.all([
        supabase
          .from('external_card_set_mappings')
          .select('id, source, source_set_id, source_set_name, lang, stackt_set_abbr, confidence, status, notes, updated_at')
          .eq('source', 'pokemon_price_tracker')
          .eq('lang', 'ENG')
          .order('status', { ascending: false })
          .order('source_set_name', { ascending: true }),
        loadMasterSetOptions(),
      ])

      if (mappingError) throw mappingError
      const mappingRows = (mappingData ?? []) as ExternalSetMappingRow[]
      setRows(mappingRows)
      setMasterSets(loadedMasterSets)
      setEdits(Object.fromEntries(mappingRows.map((row) => [row.id, {
        stacktSetAbbr: row.stackt_set_abbr ?? '',
        notes: row.notes ?? '',
      }])))
    } catch (e) {
      setRows([])
      setMasterSets([])
      setError(e instanceof Error ? e.message : 'Could not load set mappings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
  }, [])

  const masterSetByAbbr = useMemo(() => {
    const map = new Map<string, MasterSetOption>()
    for (const set of masterSets) map.set(set.set_abbr.toUpperCase(), set)
    return map
  }, [masterSets])

  const counts = useMemo(() => {
    const next: Record<string, number> = { all: rows.length, confirmed: 0, needs_review: 0, ignored: 0 }
    for (const row of rows) next[row.status] = (next[row.status] ?? 0) + 1
    return next
  }, [rows])

  const visibleRows = useMemo(() => {
    const query = searchText.trim().toLowerCase()
    return rows.filter((row) => {
      if (activeFilter !== 'all' && row.status !== activeFilter) return false
      if (!query) return true
      const edit = edits[row.id]
      return [
        row.source_set_name,
        row.source_set_id,
        row.stackt_set_abbr,
        row.status,
        row.notes,
        edit?.stacktSetAbbr,
        edit?.notes,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    })
  }, [activeFilter, edits, rows, searchText])

  const updateDraft = (id: number, patch: Partial<{ stacktSetAbbr: string; notes: string }>) => {
    setEdits((current) => ({
      ...current,
      [id]: { stacktSetAbbr: current[id]?.stacktSetAbbr ?? '', notes: current[id]?.notes ?? '', ...patch },
    }))
  }

  const refreshRow = (updated: Partial<ExternalSetMappingRow> & { id: number }) => {
    setRows((current) => current.map((row) => (row.id === updated.id ? { ...row, ...updated } : row)))
  }

  const confirmMapping = async (row: ExternalSetMappingRow) => {
    const edit = edits[row.id]
    const stacktSetAbbr = edit?.stacktSetAbbr.trim().toUpperCase() ?? ''
    const notes = edit?.notes.trim() || null
    if (!stacktSetAbbr) {
      setError('Choose a Stackt set abbreviation before confirming the mapping.')
      return
    }
    if (!masterSetByAbbr.has(stacktSetAbbr)) {
      const suggestion = suggestMasterSet(row, masterSets)
      const suggestionHint = suggestion
        ? ` Existing-set suggestion: ${suggestion.set_abbr}${suggestion.canonical_set_name ? ` (${suggestion.canonical_set_name})` : ''}.`
        : ''
      setMessage(`Confirming ${stacktSetAbbr} as a new/unpopulated Stackt set mapping. Re-running sync will stage rows as NEW_CARD_CANDIDATE until master_cards has this set.${suggestionHint}`)
    }

    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const { error: updateError } = await supabase
        .from('external_card_set_mappings')
        .update({
          stackt_set_abbr: stacktSetAbbr,
          status: 'confirmed',
          confidence: 'manual',
          notes,
        })
        .eq('id', row.id)
      if (updateError) throw updateError
      refreshRow({ id: row.id, stackt_set_abbr: stacktSetAbbr, status: 'confirmed', confidence: 'manual', notes })
      setMessage(`Confirmed ${row.source_set_name ?? row.source_set_id} → ${stacktSetAbbr}. Re-run the English sync to stage cards from this set.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm set mapping')
    } finally {
      setSavingId(null)
    }
  }

  const markNeedsReview = async (row: ExternalSetMappingRow) => {
    await updateStatus(row, 'needs_review')
  }

  const ignoreMapping = async (row: ExternalSetMappingRow) => {
    await updateStatus(row, 'ignored')
  }

  const updateStatus = async (row: ExternalSetMappingRow, status: MappingStatus) => {
    setSavingId(row.id)
    setError(null)
    setMessage(null)
    try {
      const edit = edits[row.id]
      const { error: updateError } = await supabase
        .from('external_card_set_mappings')
        .update({ status, notes: edit?.notes.trim() || row.notes || null })
        .eq('id', row.id)
      if (updateError) throw updateError
      refreshRow({ id: row.id, status, notes: edit?.notes.trim() || row.notes || null })
      setMessage(`${row.source_set_name ?? row.source_set_id} marked ${status.replace('_', ' ')}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update set mapping status')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Set Mapping Review
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Confirm Pokemon Price Tracker set names against existing Stackt English master_cards set abbreviations. Confirmed mappings feed the master-card sync; ignored rows are skipped.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-200">{error}</div>}
      {message && <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">{message}</div>}

      <div className="grid gap-3 md:grid-cols-4">
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
          <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">Search set mappings</span>
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search external set name, set id, Stackt abbr..."
            className="w-full rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </label>
        <div className="text-xs text-slate-500">Showing {visibleRows.length} of {rows.length} mappings · {masterSets.length} Stackt ENG set options loaded</div>
      </div>

      <datalist id="stackt-master-set-options">
        {masterSets.map((set) => (
          <option key={`${set.set_abbr}-${set.lang}`} value={set.set_abbr}>
            {[set.canonical_set_name, set.card_count ? `${set.card_count} cards` : null].filter(Boolean).join(' · ')}
          </option>
        ))}
      </datalist>

      <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
        <table className="min-w-full divide-y divide-base-border/60">
          <thead className="bg-gradient-to-b from-slate-800/80 to-slate-900/60">
            <tr>
              {['Status', 'Pokemon Tracker set', 'Stackt set_abbr', 'Suggested / current', 'Notes', 'Action'].map((header) => (
                <th key={header} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-base-border/60">
            {visibleRows.map((row) => {
              const suggested = suggestMasterSet(row, masterSets)
              const edit = edits[row.id] ?? { stacktSetAbbr: row.stackt_set_abbr ?? '', notes: row.notes ?? '' }
              return (
                <tr key={row.id} className="transition-colors hover:bg-base-elevated/50">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <span className={`rounded-full border px-2 py-0.5 ${STATUS_TONE[row.status]}`}>{row.status}</span>
                    <div className="mt-1 text-2xs text-slate-600">{row.confidence || 'no confidence'}</div>
                  </td>
                  <td className="min-w-[16rem] px-3 py-2 text-xs">
                    <div className="font-medium text-slate-100">{row.source_set_name || '—'}</div>
                    <div className="text-slate-500">{row.source_set_id}</div>
                    {isMixedPromoBucket(row) && (
                      <div className="mt-1 rounded border border-blue-900/50 bg-blue-950/30 px-2 py-1 text-2xs text-blue-200">
                        Promo bucket — can map to a grouped promo set like SWSH when Stackt uses set_abbr + promo number
                      </div>
                    )}
                  </td>
                  <td className="min-w-[10rem] px-3 py-2 text-xs">
                    <input
                      value={edit.stacktSetAbbr}
                      list="stackt-master-set-options"
                      onChange={(e) => updateDraft(row.id, { stacktSetAbbr: e.target.value.toUpperCase() })}
                      placeholder="e.g. FST"
                      className="w-full rounded-md border border-base-border bg-base-elevated px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="min-w-[16rem] px-3 py-2 text-xs text-slate-300">
                    <button
                      type="button"
                      disabled={!suggested}
                      onClick={() => suggested && updateDraft(row.id, { stacktSetAbbr: suggested.set_abbr })}
                      className="text-left disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                      {suggested ? (
                        <>
                          <span className="font-medium text-blue-200">{suggested.set_abbr}</span>
                          <span className="text-slate-500"> · {suggested.canonical_set_name || 'existing master_cards set'} · {suggested.card_count ?? 'unknown'} cards</span>
                        </>
                      ) : 'No obvious suggestion'}
                    </button>
                  </td>
                  <td className="min-w-[14rem] px-3 py-2 text-xs">
                    <input
                      value={edit.notes}
                      onChange={(e) => updateDraft(row.id, { notes: e.target.value })}
                      placeholder="Optional note"
                      className="w-full rounded-md border border-base-border bg-base-elevated px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void confirmMapping(row)}
                        className="rounded-md border border-emerald-600/50 bg-emerald-600/20 px-3 py-1.5 text-xs font-medium text-emerald-100 hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {savingId === row.id ? 'Saving…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        disabled={savingId === row.id}
                        onClick={() => void ignoreMapping(row)}
                        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Ignore
                      </button>
                      {row.status !== 'needs_review' && (
                        <button
                          type="button"
                          disabled={savingId === row.id}
                          onClick={() => void markNeedsReview(row)}
                          className="rounded-md border border-amber-700/50 bg-amber-950/40 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-900/40 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!loading && !visibleRows.length && <div className="px-4 py-8 text-center text-sm text-slate-500">No mappings in this filter.</div>}
        {loading && <div className="px-4 py-8 text-center text-sm text-slate-500">Loading set mappings…</div>}
      </div>
    </div>
  )
}

async function loadMasterSetOptions(): Promise<MasterSetOption[]> {
  const { data: cardSetData, error: cardSetError } = await supabase
    .from('card_sets')
    .select('set_abbr, lang, canonical_set_name')
    .ilike('lang', 'ENG')
    .order('set_abbr', { ascending: true })

  const countByAbbr = await loadMasterCardSetCounts()

  if (!cardSetError && cardSetData?.length) {
    return (cardSetData as Array<{ set_abbr: string | null; lang: string | null; canonical_set_name: string | null }>)
      .filter((row) => row.set_abbr)
      .map((row) => ({
        set_abbr: String(row.set_abbr).toUpperCase(),
        lang: row.lang ?? 'ENG',
        canonical_set_name: row.canonical_set_name,
        card_count: countByAbbr.get(String(row.set_abbr).toUpperCase()) ?? null,
      }))
  }

  return [...countByAbbr.entries()].map(([set_abbr, card_count]) => ({
    set_abbr,
    lang: 'ENG',
    canonical_set_name: null,
    card_count,
  }))
}

async function loadMasterCardSetCounts() {
  const counts = new Map<string, number>()
  const pageSize = 1000
  for (let from = 0; from < 50000; from += pageSize) {
    const { data, error } = await supabase
      .from('master_cards')
      .select('set_abbr')
      .ilike('lang', 'ENG')
      .range(from, from + pageSize - 1)
    if (error) break
    if (!data?.length) break
    for (const row of data as Array<{ set_abbr: string | null }>) {
      if (!row.set_abbr) continue
      const abbr = row.set_abbr.toUpperCase()
      counts.set(abbr, (counts.get(abbr) ?? 0) + 1)
    }
    if (data.length < pageSize) break
  }
  return counts
}

function suggestMasterSet(row: ExternalSetMappingRow, masterSets: MasterSetOption[]) {
  const explicitAlias = explicitSetAlias(row.source_set_name)
  if (explicitAlias) {
    const exactAlias = masterSets.find((set) => set.set_abbr.toUpperCase() === explicitAlias)
    if (exactAlias) return exactAlias
  }

  const sourceName = normalizeSetName(row.source_set_name)
  if (!sourceName) return null
  const exact = masterSets.find((set) => normalizeSetName(set.canonical_set_name) === sourceName)
  if (exact) return exact

  const withoutEra = normalizeSetName(row.source_set_name?.replace(/^(SM|XY|SWSH|SV)\s*-\s*/i, ''))
  const eraStripped = masterSets.find((set) => normalizeSetName(set.canonical_set_name) === withoutEra)
  if (eraStripped) return eraStripped

  return masterSets.find((set) => {
    const candidate = normalizeSetName(set.canonical_set_name)
    return Boolean(candidate && withoutEra && (candidate.includes(withoutEra) || withoutEra.includes(candidate)))
  }) ?? null
}

function explicitSetAlias(sourceSetName: string | null | undefined) {
  const normalized = normalizeSetName(sourceSetName)
  if (normalized === 'swsh01swordshieldbaseset') return 'SSH'
  return null
}

function isMixedPromoBucket(row: ExternalSetMappingRow) {
  const normalized = normalizeSetName(row.source_set_name)
  return normalized.includes('promocards') || normalized.includes('promos')
}

function normalizeSetName(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? ''
}
