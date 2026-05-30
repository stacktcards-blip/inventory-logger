import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildSalesPackingSummary,
  exportSalesPackingRowsCsv,
  formatAud,
  parseEbaySalesCsv,
  type SalesPackingRow,
} from '../lib/ebaySalesParser'
import { findNextSalesPackingScanKey } from '../lib/salesPackingScan'
import {
  buildSalesPackingImportPayload,
  buildSalesPackingRowsFromSaved,
  type SalesPackingVisibleRow,
  type SavedSalesPackingRow,
} from '../lib/salesPackingPersistence'
import { supabase } from '../lib/supabase'

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

function rowKey(row: SalesPackingRow, index: number) {
  return `${row.orderNumber}-${row.itemNumber}-${row.quantityUnit}-${index}`
}

type SalesPackingImportSummary = {
  id: string
  uploaded_at: string
  source_filename: string | null
  row_count: number
  expanded_row_count: number
  order_count: number
  total_sold_ex_postage: number
  status: string
}

export function SalesPackingPage() {
  const [csvText, setCsvText] = useState('')
  const [sourceFilename, setSourceFilename] = useState<string | null>(null)
  const [certValues, setCertValues] = useState<Record<string, string>>({})
  const [removedRowKeys, setRemovedRowKeys] = useState<Set<string>>(new Set())
  const [savedImports, setSavedImports] = useState<SalesPackingImportSummary[]>([])
  const [activeImport, setActiveImport] = useState<SalesPackingImportSummary | null>(null)
  const [savedRows, setSavedRows] = useState<SavedSalesPackingRow[]>([])
  const [isSavingImport, setIsSavingImport] = useState(false)
  const [isLoadingImport, setIsLoadingImport] = useState(false)
  const [persistenceMessage, setPersistenceMessage] = useState<string | null>(null)
  const [persistenceError, setPersistenceError] = useState<string | null>(null)
  const certInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const parsed = useMemo(() => {
    if (!csvText.trim()) return { result: null, error: null }
    try {
      return { result: parseEbaySalesCsv(csvText), error: null }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Could not parse CSV' }
    }
  }, [csvText])
  const result = parsed.result

  const loadSavedImports = async () => {
    const { data, error } = await supabase
      .from('sales_packing_imports')
      .select('id, uploaded_at, source_filename, row_count, expanded_row_count, order_count, total_sold_ex_postage, status')
      .order('uploaded_at', { ascending: false })
      .limit(12)

    if (error) {
      setPersistenceError(error.message)
      return
    }
    setSavedImports((data ?? []) as SalesPackingImportSummary[])
  }

  useEffect(() => {
    void loadSavedImports()
  }, [])

  const savedVisibleRows = useMemo(() => {
    return buildSalesPackingRowsFromSaved(savedRows.filter((row) => !row.removed))
  }, [savedRows])

  const parsedVisibleRows: SalesPackingVisibleRow[] = useMemo(() => {
    if (!result) return []
    return result.expandedRows
      .map((row, index) => ({ ...row, rowKey: rowKey(row, index) }))
      .filter((row) => !removedRowKeys.has(row.rowKey))
      .map((row) => {
        const cert = certValues[row.rowKey]?.trim() ?? ''
        return {
          ...row,
          certScanned: cert,
          scanStatus: cert ? 'scanned' as const : 'pending' as const,
        }
      })
  }, [certValues, removedRowKeys, result])

  const rowsWithCerts = activeImport ? savedVisibleRows : parsedVisibleRows

  const activeSummary = useMemo(() => {
    if (activeImport) {
      const scannedRows = savedRows.filter((row) => !row.removed && row.cert_scanned?.trim()).length
      return {
        orderCount: activeImport.order_count,
        itemRowCount: activeImport.row_count,
        expandedRowCount: savedRows.filter((row) => !row.removed).length,
        totalSoldExPostage: Number(activeImport.total_sold_ex_postage ?? 0),
        missingSkuCount: rowsWithCerts.filter((row) => row.warnings.includes('Missing SKU/custom label')).length,
        highValueMissingSkuCount: rowsWithCerts.filter((row) => row.warnings.includes('High-value sale missing SKU/custom label')).length,
        combinedOrderItemCount: rowsWithCerts.filter((row) => row.combinedOrder).length,
        multiQuantityExpandedCount: rowsWithCerts.filter((row) => row.quantity > 1).length,
        scannedRows,
      }
    }
    if (!result) return null
    return { ...buildSalesPackingSummary(result.itemRows, rowsWithCerts), scannedRows: rowsWithCerts.filter((row) => row.certScanned.trim()).length }
  }, [activeImport, result, rowsWithCerts, savedRows])

  const removedRowCount = activeImport
    ? savedRows.filter((row) => row.removed).length
    : result ? removedRowKeys.size : 0
  const visibleRowKeys = useMemo(() => rowsWithCerts.map((row) => row.rowKey), [rowsWithCerts])

  const focusNextCertInput = (currentKey: string) => {
    const nextKey = findNextSalesPackingScanKey(visibleRowKeys, currentKey)
    if (!nextKey) return
    requestAnimationFrame(() => {
      certInputRefs.current[nextKey]?.focus()
      certInputRefs.current[nextKey]?.select()
    })
  }

  const warningCounts = useMemo(() => {
    const counts = new Map<string, number>()
    rowsWithCerts.forEach((row) => {
      row.warnings.forEach((warning) => counts.set(warning, (counts.get(warning) ?? 0) + 1))
    })
    return [...counts.entries()]
  }, [rowsWithCerts])

  const clearWorkingCsv = () => {
    setCsvText('')
    setSourceFilename(null)
    setCertValues({})
    setRemovedRowKeys(new Set())
    setActiveImport(null)
    setSavedRows([])
    setPersistenceMessage(null)
    setPersistenceError(null)
  }

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setCsvText(await file.text())
    setSourceFilename(file.name)
    setCertValues({})
    setRemovedRowKeys(new Set())
    setActiveImport(null)
    setSavedRows([])
    setPersistenceMessage(null)
    setPersistenceError(null)
  }

  const handleExport = () => {
    downloadTextFile('stackt-sales-packing-expanded.csv', exportSalesPackingRowsCsv(rowsWithCerts))
  }

  const handleSaveImport = async () => {
    if (!result || !rowsWithCerts.length) return
    setIsSavingImport(true)
    setPersistenceError(null)
    setPersistenceMessage(null)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const payload = buildSalesPackingImportPayload(result.itemRows, rowsWithCerts, {
        filename: sourceFilename,
        csvText,
      })

      const { data: importData, error: importError } = await supabase
        .from('sales_packing_imports')
        .insert({ ...payload.importRow, uploaded_by: userData.user?.id ?? null })
        .select('id, uploaded_at, source_filename, row_count, expanded_row_count, order_count, total_sold_ex_postage, status')
        .single()
      if (importError) throw importError

      const importId = importData.id as string
      const { error: itemError } = await supabase
        .from('sales_packing_item_rows')
        .insert(payload.itemRows.map((row) => ({ ...row, import_id: importId })))
      if (itemError) throw itemError

      const { error: rowError } = await supabase
        .from('sales_packing_rows')
        .insert(payload.packingRows.map((row) => ({ ...row, import_id: importId })))
      if (rowError) throw rowError

      setPersistenceMessage('Saved sales packing import.')
      await loadSavedImports()
      await loadSavedImport(importData as SalesPackingImportSummary)
    } catch (e) {
      setPersistenceError(e instanceof Error ? e.message : 'Could not save import')
    } finally {
      setIsSavingImport(false)
    }
  }

  const loadSavedImport = async (importRow: SalesPackingImportSummary) => {
    setIsLoadingImport(true)
    setPersistenceError(null)
    setPersistenceMessage(null)
    try {
      const { data, error } = await supabase
        .from('sales_packing_rows')
        .select('id, line_item_key, sale_date, buyer_username, order_number, sales_record_number, item_number, listing_title, custom_label, quantity, sold_for, postage_and_handling, total_price, tracking_number, combined_order, warnings, quantity_unit, cert_scanned, scan_status, removed, removed_reason')
        .eq('import_id', importRow.id)
        .order('order_number', { ascending: true })
        .order('created_at', { ascending: true })
      if (error) throw error

      setActiveImport(importRow)
      setSavedRows((data ?? []) as SavedSalesPackingRow[])
      setCsvText('')
      setSourceFilename(null)
      setCertValues({})
      setRemovedRowKeys(new Set())
    } catch (e) {
      setPersistenceError(e instanceof Error ? e.message : 'Could not load saved import')
    } finally {
      setIsLoadingImport(false)
    }
  }

  const persistCertScan = async (rowKey: string, value: string) => {
    if (!activeImport) return
    const cert = value.trim()
    const scanStatus = cert ? 'scanned' : 'pending'
    setSavedRows((current) => current.map((row) => row.id === rowKey ? { ...row, cert_scanned: cert, scan_status: scanStatus } : row))
    const { error } = await supabase
      .from('sales_packing_rows')
      .update({ cert_scanned: cert || null, scan_status: scanStatus, updated_at: new Date().toISOString() })
      .eq('id', rowKey)
    if (error) setPersistenceError(error.message)
  }

  const removeRow = async (key: string) => {
    if (!activeImport) {
      setRemovedRowKeys((current) => new Set(current).add(key))
      return
    }
    setSavedRows((current) => current.map((row) => row.id === key ? { ...row, removed: true, removed_reason: 'removed_from_packing_view' } : row))
    const { error } = await supabase
      .from('sales_packing_rows')
      .update({ removed: true, removed_reason: 'removed_from_packing_view', updated_at: new Date().toISOString() })
      .eq('id', key)
    if (error) setPersistenceError(error.message)
  }

  const restoreRemovedRows = async () => {
    if (!activeImport) {
      setRemovedRowKeys(new Set())
      return
    }
    setSavedRows((current) => current.map((row) => ({ ...row, removed: false, removed_reason: null })))
    const { error } = await supabase
      .from('sales_packing_rows')
      .update({ removed: false, removed_reason: null, updated_at: new Date().toISOString() })
      .eq('import_id', activeImport.id)
    if (error) setPersistenceError(error.message)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
            Sales Packing
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Upload an eBay Paid & Posted CSV to create one packing/cert-scan row per physical item. Saved imports persist scans and removals; they do not mark slabs sold yet.
          </p>
        </div>
        {(activeImport || csvText) && (
          <button
            type="button"
            onClick={clearWorkingCsv}
            className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
          >
            New import
          </button>
        )}
      </div>

      <div className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 p-4 shadow-lg shadow-black/20">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-200">Saved packing sessions</div>
            <div className="text-xs text-slate-500">Open a saved CSV import to continue scanning certs.</div>
          </div>
          <button
            type="button"
            onClick={() => void loadSavedImports()}
            className="rounded-md border border-base-border bg-base-elevated px-2 py-1 text-xs font-medium text-slate-300 hover:bg-base-elevated/80"
          >
            Refresh
          </button>
        </div>
        {savedImports.length ? (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {savedImports.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={isLoadingImport}
                onClick={() => void loadSavedImport(item)}
                className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${activeImport?.id === item.id ? 'border-blue-500/60 bg-blue-950/30 text-blue-100' : 'border-base-border bg-base-elevated/60 text-slate-300 hover:bg-base-elevated'}`}
              >
                <div className="font-semibold text-slate-100">{item.source_filename || 'Pasted CSV'}</div>
                <div className="mt-1 text-slate-400">{new Date(item.uploaded_at).toLocaleString()} · {item.expanded_row_count} rows · {item.status}</div>
                <div className="mt-1 text-slate-500">Orders: {item.order_count} · Sold: {formatAud(Number(item.total_sold_ex_postage ?? 0))}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-800 bg-slate-950/30 px-3 py-2 text-xs text-slate-500">No saved sessions yet.</div>
        )}
      </div>

      {!activeImport && (
        <div className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 p-4 shadow-lg shadow-black/20">
          <div className="grid gap-4 lg:grid-cols-[18rem,1fr]">
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  eBay CSV file
                </span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => void handleFile(e.target.files?.[0])}
                  className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border file:border-base-border file:bg-base-elevated file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-300 hover:file:bg-base-elevated/80"
                />
              </label>
              {result && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleExport}
                    className="rounded-md border border-blue-600/50 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-600/30"
                  >
                    Export expanded CSV
                  </button>
                  <button
                    type="button"
                    disabled={isSavingImport || !rowsWithCerts.length}
                    onClick={() => void handleSaveImport()}
                    className="rounded-md border border-emerald-600/50 bg-emerald-600/20 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors hover:bg-emerald-600/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSavingImport ? 'Saving…' : 'Save import'}
                  </button>
                </div>
              )}
            </div>

            <label className="block">
              <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">
                Or paste CSV text
              </span>
              <textarea
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value)
                  setSourceFilename(null)
                  setCertValues({})
                  setRemovedRowKeys(new Set())
                  setPersistenceMessage(null)
                  setPersistenceError(null)
                }}
                placeholder="Paste eBay Paid & Posted CSV here..."
                rows={6}
                className="w-full rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </label>
          </div>
          {parsed.error && (
            <div className="mt-3 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {parsed.error}
            </div>
          )}
        </div>
      )}

      {persistenceMessage && (
        <div className="rounded-md border border-emerald-800/60 bg-emerald-950/30 px-3 py-2 text-xs text-emerald-200">{persistenceMessage}</div>
      )}
      {persistenceError && (
        <div className="rounded-md border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">{persistenceError}</div>
      )}

      {activeImport && (
        <div className="rounded-lg border border-blue-900/50 bg-blue-950/20 px-3 py-2 text-xs text-blue-100">
          Open saved import: <span className="font-semibold">{activeImport.source_filename || 'Pasted CSV'}</span>. Cert scans and removed rows are saved to Supabase.
        </div>
      )}

      {activeSummary && (
        <>
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-10">
            <Metric label="Orders" value={activeSummary.orderCount} />
            <Metric label="Item rows" value={activeSummary.itemRowCount} />
            <Metric label="Packing rows" value={activeSummary.expandedRowCount} />
            <Metric label="Scanned" value={activeSummary.scannedRows} tone={activeSummary.scannedRows ? 'good' : 'default'} />
            <Metric label="Removed rows" value={removedRowCount} tone={removedRowCount ? 'warn' : 'default'} />
            <Metric label="Sold ex postage" value={formatAud(activeSummary.totalSoldExPostage)} />
            <Metric label="Missing SKU" value={activeSummary.missingSkuCount} tone={activeSummary.missingSkuCount ? 'warn' : 'default'} />
            <Metric label="High-value no SKU" value={activeSummary.highValueMissingSkuCount} tone={activeSummary.highValueMissingSkuCount ? 'danger' : 'default'} />
            <Metric label="Combined rows" value={activeSummary.combinedOrderItemCount} tone={activeSummary.combinedOrderItemCount ? 'warn' : 'default'} />
            <Metric label="Multi-qty rows" value={activeSummary.multiQuantityExpandedCount} tone={activeSummary.multiQuantityExpandedCount ? 'warn' : 'default'} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="rounded-md border border-blue-600/50 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-600/30"
            >
              Export current rows
            </button>
            {removedRowCount > 0 && (
              <button
                type="button"
                onClick={() => void restoreRemovedRows()}
                className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
              >
                Restore removed rows
              </button>
            )}
          </div>

          {warningCounts.length > 0 && (
            <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-3 text-xs text-amber-100">
              <div className="mb-2 font-semibold">Warnings</div>
              <div className="flex flex-wrap gap-2">
                {warningCounts.map(([warning, count]) => (
                  <span key={warning} className="rounded-full border border-amber-700/50 bg-amber-900/30 px-2 py-1">
                    {warning}: {count}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
            <table className="min-w-full divide-y divide-base-border/60">
              <thead className="bg-gradient-to-b from-slate-800/80 to-slate-900/60">
                <tr>
                  {['Remove', 'Cert', 'Status', 'Qty', 'Buyer', 'Sale date', 'Title', 'SKU', 'Sold', 'Order', 'Tracking', 'Warnings'].map((header) => (
                    <th key={header} className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-base-border/60">
                {rowsWithCerts.map((row) => {
                  const key = row.rowKey
                  return (
                    <tr key={key} className="transition-colors hover:bg-base-elevated/50">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          title="Remove this row from the slab packing view"
                          onClick={() => void removeRow(key)}
                          className="rounded-md border border-red-900/60 bg-red-950/30 px-2 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-900/40 hover:text-red-100"
                        >
                          ×
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          ref={(element) => {
                            certInputRefs.current[key] = element
                          }}
                          value={row.certScanned}
                          onChange={(e) => {
                            const value = e.target.value
                            if (activeImport) {
                              setSavedRows((current) => current.map((saved) => saved.id === key ? { ...saved, cert_scanned: value, scan_status: value.trim() ? 'scanned' : 'pending' } : saved))
                            } else {
                              setCertValues((current) => ({ ...current, [key]: value }))
                            }
                          }}
                          onBlur={(e) => void persistCertScan(key, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key !== 'Enter') return
                            e.preventDefault()
                            if (activeImport) void persistCertScan(key, e.currentTarget.value)
                            focusNextCertInput(key)
                          }}
                          placeholder="Scan cert"
                          className="w-32 rounded-md border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${row.scanStatus === 'scanned' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                          {row.scanStatus}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-200">{row.quantityUnit}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-200">{row.buyerUsername || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">{row.saleDate || '—'}</td>
                      <td className="min-w-[24rem] max-w-xl px-3 py-2 text-xs text-slate-200">{row.listingTitle || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-300">{row.customLabel || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-200">{formatAud(row.soldFor)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{row.orderNumber || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-400">{row.trackingNumber || '—'}</td>
                      <td className="min-w-[14rem] px-3 py-2 text-xs text-amber-200">
                        {row.warnings.length ? row.warnings.join('; ') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rowsWithCerts.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-slate-500">
                All imported rows have been removed from the slab packing view. Restore rows above or paste/upload the CSV again.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function Metric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'warn' | 'danger' | 'good' }) {
  const toneClass = tone === 'danger'
    ? 'border-red-800/50 bg-red-950/30 text-red-200'
    : tone === 'warn'
      ? 'border-amber-800/50 bg-amber-950/30 text-amber-200'
      : tone === 'good'
        ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-200'
        : 'border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 text-slate-200'

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}
