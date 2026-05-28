import { useMemo, useState } from 'react'
import {
  buildSalesPackingSummary,
  exportSalesPackingRowsCsv,
  formatAud,
  parseEbaySalesCsv,
  type SalesPackingRow,
} from '../lib/ebaySalesParser'

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

export function SalesPackingPage() {
  const [csvText, setCsvText] = useState('')
  const [certValues, setCertValues] = useState<Record<string, string>>({})
  const [removedRowKeys, setRemovedRowKeys] = useState<Set<string>>(new Set())

  const parsed = useMemo(() => {
    if (!csvText.trim()) return { result: null, error: null }
    try {
      return { result: parseEbaySalesCsv(csvText), error: null }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : 'Could not parse CSV' }
    }
  }, [csvText])
  const result = parsed.result

  const rowsWithCerts = useMemo(() => {
    if (!result) return []
    return result.expandedRows
      .map((row, index) => ({ row, index, key: rowKey(row, index) }))
      .filter(({ key }) => !removedRowKeys.has(key))
      .map(({ row, key }) => {
        const cert = certValues[key]?.trim() ?? ''
        return {
          ...row,
          rowKey: key,
          certScanned: cert,
          scanStatus: cert ? 'scanned' as const : 'pending' as const,
        }
      })
  }, [certValues, removedRowKeys, result])

  const activeSummary = useMemo(() => {
    if (!result) return null
    return buildSalesPackingSummary(result.itemRows, rowsWithCerts)
  }, [result, rowsWithCerts])

  const removedRowCount = result ? removedRowKeys.size : 0

  const warningCounts = useMemo(() => {
    const counts = new Map<string, number>()
    rowsWithCerts.forEach((row) => {
      row.warnings.forEach((warning) => counts.set(warning, (counts.get(warning) ?? 0) + 1))
    })
    return [...counts.entries()]
  }, [rowsWithCerts])

  const handleFile = async (file: File | undefined) => {
    if (!file) return
    setCsvText(await file.text())
    setCertValues({})
    setRemovedRowKeys(new Set())
  }

  const handleExport = () => {
    downloadTextFile('stackt-sales-packing-expanded.csv', exportSalesPackingRowsCsv(rowsWithCerts))
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
          Sales Packing
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Upload an eBay Paid & Posted CSV to create one packing/cert-scan row per physical item. This MVP does not write to eBay, inventory, or spreadsheets.
        </p>
      </div>

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
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="block w-full text-xs text-slate-300 file:mr-3 file:rounded-md file:border file:border-base-border file:bg-base-elevated file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-300 hover:file:bg-base-elevated/80"
              />
            </label>
            {result && (
              <button
                type="button"
                onClick={handleExport}
                className="rounded-md border border-blue-600/50 bg-blue-600/20 px-3 py-2 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-600/30"
              >
                Export expanded CSV
              </button>
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
                setCertValues({})
                setRemovedRowKeys(new Set())
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

      {result && activeSummary && (
        <>
          <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-9">
            <Metric label="Orders" value={activeSummary.orderCount} />
            <Metric label="Item rows" value={activeSummary.itemRowCount} />
            <Metric label="Packing rows" value={activeSummary.expandedRowCount} />
            <Metric label="Removed rows" value={removedRowCount} tone={removedRowCount ? 'warn' : 'default'} />
            <Metric label="Sold ex postage" value={formatAud(activeSummary.totalSoldExPostage)} />
            <Metric label="Missing SKU" value={activeSummary.missingSkuCount} tone={activeSummary.missingSkuCount ? 'warn' : 'default'} />
            <Metric label="High-value no SKU" value={activeSummary.highValueMissingSkuCount} tone={activeSummary.highValueMissingSkuCount ? 'danger' : 'default'} />
            <Metric label="Combined rows" value={activeSummary.combinedOrderItemCount} tone={activeSummary.combinedOrderItemCount ? 'warn' : 'default'} />
            <Metric label="Multi-qty rows" value={activeSummary.multiQuantityExpandedCount} tone={activeSummary.multiQuantityExpandedCount ? 'warn' : 'default'} />
          </div>

          {removedRowCount > 0 && (
            <div className="flex items-center justify-between rounded-lg border border-slate-700/70 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
              <span>{removedRowCount} non-slab / unwanted packing row{removedRowCount === 1 ? '' : 's'} removed from this working view and export.</span>
              <button
                type="button"
                onClick={() => setRemovedRowKeys(new Set())}
                className="rounded-md border border-base-border bg-base-elevated px-2 py-1 font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
              >
                Restore removed rows
              </button>
            </div>
          )}

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
                          onClick={() => setRemovedRowKeys((current) => new Set(current).add(key))}
                          className="rounded-md border border-red-900/60 bg-red-950/30 px-2 py-1 text-xs font-semibold text-red-300 transition-colors hover:bg-red-900/40 hover:text-red-100"
                        >
                          ×
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={certValues[key] ?? ''}
                          onChange={(e) => setCertValues((current) => ({ ...current, [key]: e.target.value }))}
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

function Metric({ label, value, tone = 'default' }: { label: string; value: string | number; tone?: 'default' | 'warn' | 'danger' }) {
  const toneClass = tone === 'danger'
    ? 'border-red-800/50 bg-red-950/30 text-red-200'
    : tone === 'warn'
      ? 'border-amber-800/50 bg-amber-950/30 text-amber-200'
      : 'border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 text-slate-200'

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  )
}
