import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { RawCardsTallyResult } from '../types/rawCards'

type CardTallyPanelProps = {
  className?: string
}

export function CardTallyPanel({ className = '' }: CardTallyPanelProps) {
  const [setAbbr, setSetAbbr] = useState('')
  const [num, setNum] = useState('')
  const [lang, setLang] = useState('')
  const [result, setResult] = useState<RawCardsTallyResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleRunTally = async () => {
    if (!setAbbr.trim() || !num.trim()) {
      setError('Set abbrev and card num are required')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const { data, error: err } = await supabase.rpc('raw_cards_tally', {
        p_set_abbr: setAbbr.trim(),
        p_num: num.trim(),
        p_lang: lang.trim() || null,
      })
      if (err) throw err
      const row = Array.isArray(data) && data.length > 0 ? data[0] : null
      if (row) {
        setResult({
          total_qty: Number(row.total_qty ?? 0),
          total_qty_jpy: Number(row.total_qty_jpy ?? 0),
          avg_price_jpy: row.avg_price_jpy != null ? Number(row.avg_price_jpy) : null,
          total_cost_jpy: row.total_cost_jpy != null ? Number(row.total_cost_jpy) : null,
          total_qty_aud: Number(row.total_qty_aud ?? 0),
          avg_price_aud: row.avg_price_aud != null ? Number(row.avg_price_aud) : null,
          total_cost_aud: row.total_cost_aud != null ? Number(row.total_cost_aud) : null,
        })
      } else {
        setResult({
          total_qty: 0,
          total_qty_jpy: 0,
          avg_price_jpy: null,
          total_cost_jpy: null,
          total_qty_aud: 0,
          avg_price_aud: null,
          total_cost_aud: null,
        })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tally failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  const inputClass =
    'rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const labelClass = 'mb-0.5 block text-2xs font-medium uppercase tracking-wider text-slate-500'

  return (
    <div
      className={`p-4 ${className}`}
    >
      <h3 className="mb-2 text-sm font-semibold text-slate-100">Card Tally</h3>
      <p className="mb-3 text-2xs text-slate-500">
        Enter set abbrev and card num to view total quantity and average price.
      </p>
      <div className="mb-3 flex flex-wrap gap-3">
        <div>
          <label htmlFor="tally-set-abbr" className={labelClass}>
            Set abbrev
          </label>
          <input
            id="tally-set-abbr"
            type="text"
            value={setAbbr}
            onChange={(e) => setSetAbbr(e.target.value)}
            placeholder="e.g. 1ED"
            className={`w-24 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="tally-num" className={labelClass}>
            Card num
          </label>
          <input
            id="tally-num"
            type="text"
            value={num}
            onChange={(e) => setNum(e.target.value)}
            placeholder="e.g. 025"
            className={`w-24 ${inputClass}`}
          />
        </div>
        <div>
          <label htmlFor="tally-lang" className={labelClass}>
            Lang (optional)
          </label>
          <input
            id="tally-lang"
            type="text"
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            placeholder="e.g. ENG"
            className={`w-20 ${inputClass}`}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={handleRunTally}
            disabled={loading || !setAbbr.trim() || !num.trim()}
            className="rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100 disabled:opacity-50"
          >
            {loading ? 'Running...' : 'Calculate'}
          </button>
        </div>
      </div>
      {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
      {result !== null && (
        <div className="space-y-3 rounded-lg border border-base-border/60 bg-base-elevated/50 px-4 py-3 text-xs">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <span className="text-slate-500">Total qty:</span>
            <span className="font-semibold text-slate-100">{result.total_qty}</span>
          </div>
          {(result.total_qty_jpy > 0 || result.avg_price_jpy != null || result.total_cost_jpy != null) && (
            <div className="rounded-lg border border-base-border/60 bg-base-surface/80 px-3 py-2">
              <div className="mb-1 font-medium text-slate-400">JPY</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-slate-500">Qty:</span>
                <span className="font-medium text-slate-200">{result.total_qty_jpy}</span>
                <span className="text-slate-500">Avg price:</span>
                <span className="font-medium text-slate-200">
                  {result.avg_price_jpy != null ? `¥${result.avg_price_jpy.toFixed(0)}` : '—'}
                </span>
                <span className="text-slate-500">Total:</span>
                <span className="font-medium text-slate-200">
                  {result.total_cost_jpy != null ? `¥${result.total_cost_jpy.toFixed(0)}` : '—'}
                </span>
              </div>
            </div>
          )}
          {(result.total_qty_aud > 0 || result.avg_price_aud != null || result.total_cost_aud != null) && (
            <div className="rounded-lg border border-base-border/60 bg-base-surface/80 px-3 py-2">
              <div className="mb-1 font-medium text-slate-400">AUD</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="text-slate-500">Qty:</span>
                <span className="font-medium text-slate-200">{result.total_qty_aud}</span>
                <span className="text-slate-500">Avg price:</span>
                <span className="font-medium text-slate-200">
                  {result.avg_price_aud != null ? `$${result.avg_price_aud.toFixed(2)}` : '—'}
                </span>
                <span className="text-slate-500">Total:</span>
                <span className="font-medium text-slate-200">
                  {result.total_cost_aud != null ? `$${result.total_cost_aud.toFixed(2)}` : '—'}
                </span>
              </div>
            </div>
          )}
          {result.total_qty === 0 && (
            <p className="text-slate-500">No matching cards found.</p>
          )}
        </div>
      )}
    </div>
  )
}
