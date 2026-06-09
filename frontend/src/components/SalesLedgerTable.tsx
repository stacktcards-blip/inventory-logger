import type { SalesLedgerRow } from '../types/salesLedger'

const currencyFormatters = new Map<string, Intl.NumberFormat>()

const formatCurrency = (value: number | null, currency = 'AUD') => {
  if (value == null) return '—'
  const key = currency.toUpperCase()
  if (!currencyFormatters.has(key)) {
    currencyFormatters.set(key, new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: key,
      maximumFractionDigits: 2,
    }))
  }
  return currencyFormatters.get(key)!.format(value)
}

const toneClass = (status: string) => {
  if (status === 'MATCHED') return 'bg-emerald-900/40 text-emerald-200'
  if (status === 'MANUAL_REVIEW') return 'bg-amber-900/40 text-amber-200'
  return 'bg-slate-800/70 text-slate-300'
}

type Props = {
  rows: SalesLedgerRow[]
}

export function SalesLedgerTable({ rows }: Props) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/30">
      <table className="min-w-full divide-y divide-slate-800/80">
        <thead className="bg-slate-900/80 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3 text-left">Sold</th>
            <th className="px-4 py-3 text-left">Card</th>
            <th className="px-4 py-3 text-left">Buyer</th>
            <th className="px-4 py-3 text-right">Sale</th>
            <th className="px-4 py-3 text-right">Cost</th>
            <th className="px-4 py-3 text-right">Profit</th>
            <th className="px-4 py-3 text-center">Match</th>
            <th className="px-4 py-3 text-center">Fulfillment</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/80">
          {rows.map((row) => (
            <tr key={row.saleId} className="bg-slate-950/30 hover:bg-slate-900/40">
              <td className="px-4 py-3 text-sm text-slate-300">
                <div>{row.soldDate ?? 'Unposted'}</div>
                {row.daysHeld != null && (
                  <div className="text-xs text-slate-500">Held {row.daysHeld} days</div>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-slate-100">
                <div className="font-semibold">
                  {row.slabCert ? `${row.slabCert} · ${row.slabGrade ?? ''}` : row.title ?? '—'}
                </div>
                <div className="text-xs text-slate-400">
                  {[row.slabSetAbbr, row.slabNum, row.slabLang].filter(Boolean).join(' · ') || row.matchMethod || '—'}
                </div>
              </td>
              <td className="px-4 py-3 text-sm text-slate-400">{row.buyerUsername ?? '—'}</td>
              <td className="px-4 py-3 text-right text-sm text-slate-100">
                <div className="font-semibold">{formatCurrency(row.salePrice, row.currency ?? 'AUD')}</div>
                {row.shippingCost != null && (
                  <div className="text-xs text-slate-500">Ship {formatCurrency(row.shippingCost, row.currency ?? 'AUD')}</div>
                )}
              </td>
              <td className="px-4 py-3 text-right text-sm text-slate-200">{formatCurrency(row.rawCostAud, 'AUD')}</td>
              <td className={`px-4 py-3 text-right text-sm ${Number(row.grossProfitAud ?? 0) >= 0 ? 'text-emerald-200' : 'text-rose-200'}`}>
                {formatCurrency(row.grossProfitAud, 'AUD')}
              </td>
              <td className="px-4 py-3 text-center text-xs">
                <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${toneClass(row.matchStatus)}`}>
                  {row.matchStatus}
                </span>
              </td>
              <td className="px-4 py-3 text-center text-xs text-slate-400">{row.fulfillmentStatus ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                No sales match the current filters.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
