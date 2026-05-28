import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  applyIntakeDefaults,
  expandQuantityRows,
  getIntakeSummary,
  parsePastedRawRows,
  validateIntakeRows,
  type RawIntakeDefaults,
  type RawIntakeRow,
} from '../lib/rawPasteIntake'
import { supabase } from '../lib/supabase'
import type { RawCardDraftRow } from '../types/rawCards'

const CSV_HEADERS = [
  'Set',
  'Num',
  'Lang',
  'Card name',
  'CCY',
  'Price',
  'Exch',
  'Seller',
  'Date',
  'Cond',
  '1ed',
  'Rev',
  'Note',
] as const

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length < 2) return []
  const parseRow = (line: string): string[] => {
    const out: string[] = []
    let cell = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (c === '"') {
        inQuotes = !inQuotes
      } else if (c === ',' && !inQuotes) {
        out.push(cell.trim())
        cell = ''
      } else {
        cell += c
      }
    }
    out.push(cell.trim())
    return out
  }
  const headerLine = lines[0]
  const headers = parseRow(headerLine)
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = parseRow(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, j) => {
      row[h] = values[j] ?? ''
    })
    rows.push(row)
  }
  return rows
}

function csvRowToDraft(row: Record<string, string>): RawCardDraftRow {
  const get = (k: string) => row[k] ?? ''
  const bool = (v: string) => {
    const lower = (v ?? '').toLowerCase()
    return lower === 'true' || lower === '1' || lower === 'yes'
  }
  return {
    set_abbr: get('Set'),
    num: get('Num'),
    lang: get('Lang'),
    card_name: get('Card name') || null,
    currency: get('CCY'),
    purchase_price: get('Price'),
    exchange_rate: get('Exch'),
    seller: get('Seller'),
    purchase_date: get('Date'),
    cond: get('Cond'),
    note: get('Note'),
    is_1ed: bool(get('1ed')),
    is_rev: bool(get('Rev')),
  }
}

function escapeCSVCell(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function downloadTemplate() {
  const headerLine = CSV_HEADERS.map(escapeCSVCell).join(',')
  const csv = headerLine + '\n'
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'raw-cards-import-template.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const emptyRow = (): RawIntakeRow => ({
  set_abbr: '',
  num: '',
  lang: '',
  card_name: null,
  currency: '',
  purchase_price: '',
  exchange_rate: '',
  seller: '',
  purchase_date: '',
  cond: '',
  note: '',
  is_1ed: false,
  is_rev: false,
  quantity: '1',
})

const defaultIntakeDefaults = (): RawIntakeDefaults => ({
  seller: '',
  purchase_date: new Date().toISOString().slice(0, 10),
  currency: 'JPY',
  exchange_rate: '',
  lang: 'JP',
  cond: 'NM',
})

const CARD_NAME_DEBOUNCE_MS = 400

export function AddRawCardsPage() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<RawIntakeRow[]>(() => [emptyRow()])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successCount, setSuccessCount] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<RawIntakeDefaults>(() => defaultIntakeDefaults())
  const validations = useMemo(() => validateIntakeRows(rows), [rows])
  const summary = useMemo(() => getIntakeSummary(rows, validations), [rows, validations])

  const lookupCardName = useCallback(
    async (setAbbr: string, num: string, lang: string): Promise<string | null> => {
      if (!setAbbr.trim() || !num.trim() || !lang.trim()) return null
      const { data, error: err } = await supabase
        .from('master_cards')
        .select('card_name')
        .ilike('set_abbr', setAbbr.trim())
        .ilike('num', num.trim())
        .ilike('lang', lang.trim())
        .maybeSingle()
      if (err || !data) return null
      return (data as { card_name: string | null }).card_name ?? null
    },
    []
  )

  const updateRow = useCallback((index: number, updates: Partial<RawIntakeRow>) => {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r
        const next = { ...r, ...updates }
        if ('set_abbr' in updates || 'num' in updates || 'lang' in updates) {
          next.card_name = null
        }
        return next
      })
    )
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      const toLookup: { index: number; set_abbr: string; num: string; lang: string }[] = []
      rows.forEach((r, i) => {
        const sa = r.set_abbr.trim()
        const n = r.num.trim()
        const l = r.lang.trim()
        if (sa && n && l && r.card_name === null) toLookup.push({ index: i, set_abbr: sa, num: n, lang: l })
      })
      if (toLookup.length === 0) return
      Promise.all(
        toLookup.map(({ index, set_abbr, num, lang }) =>
          lookupCardName(set_abbr, num, lang).then((name) => ({ index, name }))
        )
      ).then((results) => {
        setRows((prev) =>
          prev.map((r, i) => {
            const found = results.find((x) => x.index === i)
            return found ? { ...r, card_name: found.name } : r
          })
        )
      })
    }, CARD_NAME_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [rows.map((r) => `${r.set_abbr}|${r.num}|${r.lang}`).join(';')])

  const addRow = () => setRows((prev) => [...prev, emptyRow()])

  const removeRow = (index: number) => {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  const processFile = useCallback((file: File) => {
    setImportError(null)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Please drop a CSV file.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const parsed = parseCSV(text)
        if (parsed.length === 0) {
          setImportError('CSV has no data rows or could not be parsed.')
          return
        }
        const drafts = parsed.map(csvRowToDraft).map((draft) => ({ ...draft, quantity: '1' }))
        setRows(drafts.length > 0 ? drafts : [emptyRow()])
      } catch (e) {
        setImportError(e instanceof Error ? e.message : 'Failed to parse CSV.')
      }
    }
    reader.onerror = () => setImportError('Failed to read file.')
    reader.readAsText(file, 'UTF-8')
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) processFile(file)
    },
    [processFile]
  )

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const onFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      e.target.value = ''
    },
    [processFile]
  )

  const handleApplyPaste = useCallback(() => {
    setPasteError(null)
    setError(null)
    setSuccessCount(null)
    const parsed = parsePastedRawRows(pasteText)
    if (parsed.length === 0) {
      setPasteError('Paste at least one row from a spreadsheet.')
      return
    }
    setRows(applyIntakeDefaults(parsed, defaults))
  }, [defaults, pasteText])

  const updateDefault = useCallback((key: keyof RawIntakeDefaults, value: string) => {
    setDefaults((prev) => ({ ...prev, [key]: value }))
  }, [])

  const approveAll = async () => {
    const validationResults = validateIntakeRows(rows)
    const valid = rows.filter((_, index) => validationResults[index]?.errors.length === 0)
    if (valid.length === 0) {
      setError('Fix validation errors before approving rows.')
      return
    }
    const expandedRows = expandQuantityRows(valid)
    setSaving(true)
    setError(null)
    setSuccessCount(null)
    const payloads = expandedRows.map((r) => ({
      set_abbr: r.set_abbr.trim() || null,
      num: r.num.trim() || null,
      lang: r.lang.trim() || null,
      currency: r.currency.trim() || null,
      purchase_price: r.purchase_price.trim() ? parseFloat(r.purchase_price) : null,
      exchange_rate: r.exchange_rate.trim() ? parseFloat(r.exchange_rate) : null,
      seller: r.seller.trim() || null,
      purchase_date: r.purchase_date || null,
      cond: r.cond.trim() || null,
      note: r.note.trim() || null,
      is_1ed: r.is_1ed,
      is_rev: r.is_rev,
    }))
    const { error: err } = await supabase.from('raw_cards').insert(payloads)
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    setSuccessCount(payloads.length)
    setRows([emptyRow()])
  }

  const inputClass =
    'w-full min-w-0 rounded border border-base-border bg-base-elevated px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const thClass =
    'whitespace-nowrap px-2 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-800/80'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
          Add raw cards
        </h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate('/raw-cards')}
            className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
          >
            Back to list
          </button>
          <button
            type="button"
            onClick={downloadTemplate}
            className="rounded-md border border-base-border bg-base-elevated px-4 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
          >
            Download CSV template
          </button>
          <button
            type="button"
            onClick={approveAll}
            disabled={saving}
            className="rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-emerald-500/20 hover:from-emerald-500 hover:to-emerald-400 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Approve all'}
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        Enter rows below. Set, Num and Lang are required; card name is looked up from master data. Click Approve all to insert into the database.
      </p>

      {error && (
        <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {successCount !== null && (
        <div className="rounded-md border border-emerald-900/50 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {successCount} row(s) added to raw cards.
        </div>
      )}

      {importError && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-300">
          {importError}
        </div>
      )}

      {pasteError && (
        <div className="rounded-md border border-amber-900/50 bg-amber-950/30 p-3 text-sm text-amber-300">
          {pasteError}
        </div>
      )}

      <section className="rounded-lg border border-base-border/80 bg-base-elevated/30 p-4 shadow-lg shadow-black/10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Paste intake MVP</h2>
            <p className="text-xs text-slate-500">
              Set batch defaults once, paste rows from Google Sheets, then review/commit below.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 sm:grid-cols-5">
            <span>Source: <strong className="text-slate-200">{summary.sourceRows}</strong></span>
            <span>Commit: <strong className="text-slate-200">{summary.commitRows}</strong></span>
            <span>Ready: <strong className="text-emerald-300">{summary.readyRows}</strong></span>
            <span>Warnings: <strong className="text-amber-300">{summary.warningRows}</strong></span>
            <span>Errors: <strong className="text-red-300">{summary.errorRows}</strong></span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-6">
          <label className="space-y-1 text-2xs font-medium uppercase tracking-wide text-slate-500">
            Seller
            <input className={inputClass} value={defaults.seller} onChange={(e) => updateDefault('seller', e.target.value)} placeholder="Card Rush" />
          </label>
          <label className="space-y-1 text-2xs font-medium uppercase tracking-wide text-slate-500">
            Date
            <input className={inputClass} type="date" value={defaults.purchase_date} onChange={(e) => updateDefault('purchase_date', e.target.value)} />
          </label>
          <label className="space-y-1 text-2xs font-medium uppercase tracking-wide text-slate-500">
            Currency
            <input className={inputClass} value={defaults.currency} onChange={(e) => updateDefault('currency', e.target.value.toUpperCase())} placeholder="JPY" />
          </label>
          <label className="space-y-1 text-2xs font-medium uppercase tracking-wide text-slate-500">
            Exch
            <input className={inputClass} inputMode="decimal" value={defaults.exchange_rate} onChange={(e) => updateDefault('exchange_rate', e.target.value)} placeholder="0.0102" />
          </label>
          <label className="space-y-1 text-2xs font-medium uppercase tracking-wide text-slate-500">
            Lang
            <input className={inputClass} value={defaults.lang} onChange={(e) => updateDefault('lang', e.target.value.toUpperCase())} placeholder="JP" />
          </label>
          <label className="space-y-1 text-2xs font-medium uppercase tracking-wide text-slate-500">
            Cond
            <input className={inputClass} value={defaults.cond} onChange={(e) => updateDefault('cond', e.target.value.toUpperCase())} placeholder="NM" />
          </label>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto]">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            className="w-full rounded border border-base-border bg-slate-950/50 px-3 py-2 font-mono text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={'Paste rows: Set\tNum\tLang\tPrice\tCond\tQty\tNote\nsv8a\t201\tJP\t280\tNM\t1'}
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={handleApplyPaste}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-blue-400"
            >
              Parse paste into grid
            </button>
            <span className="max-w-xs text-2xs text-slate-500">
              Supports tabs or CSV. Header row optional. Default order: Set, Num, Lang, Price, Cond, Qty, Note.
            </span>
            <span className="text-2xs text-slate-500">
              Est. AUD cost: <strong className="text-slate-300">{summary.estimatedAudCost === null ? '—' : `$${summary.estimatedAudCost.toFixed(2)}`}</strong>
            </span>
          </div>
        </div>
      </section>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver
            ? 'border-blue-500 bg-blue-950/30 text-blue-300'
            : 'border-base-border bg-base-elevated/30 text-slate-500 hover:border-slate-500 hover:bg-base-elevated/50 hover:text-slate-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={onFileInputChange}
          className="hidden"
          aria-hidden
        />
        <span className="text-sm font-medium">
          Drop CSV here or click to choose file
        </span>
        <span className="text-2xs">
          Imported data fills the table below; use Approve all to save to the database.
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
        <table className="min-w-full divide-y divide-base-border/60">
          <thead>
            <tr>
              <th className={thClass} style={{ width: 40 }} />
              <th className={thClass} style={{ minWidth: 88 }}>
                Status
              </th>
              <th className={thClass} style={{ minWidth: 80 }}>
                Set
              </th>
              <th className={thClass} style={{ minWidth: 64 }}>
                Num
              </th>
              <th className={thClass} style={{ minWidth: 56 }}>
                Lang
              </th>
              <th className={thClass} style={{ minWidth: 140 }}>
                Card name
              </th>
              <th className={thClass} style={{ minWidth: 56 }}>
                CCY
              </th>
              <th className={thClass} style={{ minWidth: 88 }}>
                Price
              </th>
              <th className={thClass} style={{ minWidth: 72 }}>
                Exch
              </th>
              <th className={thClass} style={{ minWidth: 100 }}>
                Seller
              </th>
              <th className={thClass} style={{ minWidth: 110 }}>
                Date
              </th>
              <th className={thClass} style={{ minWidth: 56 }}>
                Cond
              </th>
              <th className={thClass} style={{ minWidth: 56 }}>
                Qty
              </th>
              <th className={thClass} style={{ minWidth: 56 }}>
                1ed
              </th>
              <th className={thClass} style={{ minWidth: 56 }}>
                Rev
              </th>
              <th className={thClass} style={{ minWidth: 120 }}>
                Note
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-base-border/60">
            {rows.map((row, index) => {
              const validation = validations[index] ?? { errors: [], warnings: [] }
              const statusLabel = validation.errors.length > 0 ? 'Error' : validation.warnings.length > 0 ? 'Warn' : 'Ready'
              const statusClass =
                validation.errors.length > 0
                  ? 'border-red-900/60 bg-red-950/40 text-red-300'
                  : validation.warnings.length > 0
                    ? 'border-amber-900/60 bg-amber-950/40 text-amber-300'
                    : 'border-emerald-900/60 bg-emerald-950/40 text-emerald-300'
              const statusTitle = [...validation.errors, ...validation.warnings].join('\n') || 'Ready to commit'
              return (
              <tr key={index} className="hover:bg-base-elevated/30">
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => removeRow(index)}
                    className="rounded p-1 text-slate-500 hover:bg-red-900/30 hover:text-red-400"
                    title="Remove row"
                    aria-label="Remove row"
                  >
                    ✕
                  </button>
                </td>
                <td className="px-2 py-1.5">
                  <span className={`inline-flex rounded-full border px-2 py-0.5 text-2xs font-semibold ${statusClass}`} title={statusTitle}>
                    {statusLabel}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.set_abbr}
                    onChange={(e) => updateRow(index, { set_abbr: e.target.value })}
                    placeholder="e.g. 1ED"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.num}
                    onChange={(e) => updateRow(index, { num: e.target.value })}
                    placeholder="025"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.lang}
                    onChange={(e) => updateRow(index, { lang: e.target.value })}
                    placeholder="ENG"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <span className="block truncate text-xs text-slate-400">
                    {row.card_name ?? '—'}
                  </span>
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.currency}
                    onChange={(e) => updateRow(index, { currency: e.target.value })}
                    placeholder="AUD"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.purchase_price}
                    onChange={(e) => updateRow(index, { purchase_price: e.target.value })}
                    placeholder="0"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={row.exchange_rate}
                    onChange={(e) => updateRow(index, { exchange_rate: e.target.value })}
                    placeholder="0.01"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.seller}
                    onChange={(e) => updateRow(index, { seller: e.target.value })}
                    placeholder="Seller"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="date"
                    value={row.purchase_date}
                    onChange={(e) => updateRow(index, { purchase_date: e.target.value })}
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.cond}
                    onChange={(e) => updateRow(index, { cond: e.target.value })}
                    placeholder="NM"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(e) => updateRow(index, { quantity: e.target.value })}
                    placeholder="1"
                    className={inputClass}
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={row.is_1ed}
                    onChange={(e) => updateRow(index, { is_1ed: e.target.checked })}
                    className="rounded border-base-border bg-base-elevated text-blue-500"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    checked={row.is_rev}
                    onChange={(e) => updateRow(index, { is_rev: e.target.checked })}
                    className="rounded border-base-border bg-base-elevated text-blue-500"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <input
                    type="text"
                    value={row.note}
                    onChange={(e) => updateRow(index, { note: e.target.value })}
                    placeholder="Note"
                    className={inputClass}
                  />
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={addRow}
        className="rounded-md border border-dashed border-base-border bg-base-elevated/50 px-4 py-2 text-xs font-medium text-slate-400 hover:border-slate-500 hover:bg-base-elevated hover:text-slate-200"
      >
        + Add row
      </button>
    </div>
  )
}
