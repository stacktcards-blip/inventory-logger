import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { RawCardRow } from '../types/rawCards'

type RawCardDetailModalProps = {
  rawCardId: number | null
  onClose: () => void
  onSaved: () => void
}

export function RawCardDetailModal({
  rawCardId,
  onClose,
  onSaved,
}: RawCardDetailModalProps) {
  const [rawCard, setRawCard] = useState<RawCardRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [setAbbr, setSetAbbr] = useState('')
  const [num, setNum] = useState('')
  const [lang, setLang] = useState('')
  const [currency, setCurrency] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [exchangeRate, setExchangeRate] = useState('')
  const [cond, setCond] = useState('')
  const [seller, setSeller] = useState('')
  const [purchaseDate, setPurchaseDate] = useState('')
  const [note, setNote] = useState('')
  const [is1ed, setIs1ed] = useState(false)
  const [isRev, setIsRev] = useState(false)

  useEffect(() => {
    if (!rawCardId) {
      setRawCard(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    supabase
      .from('raw_cards_enriched')
      .select('*')
      .eq('id', rawCardId)
      .single()
      .then(({ data, error: err }) => {
        setLoading(false)
        if (err) {
          setError(err.message)
          setRawCard(null)
          return
        }
        const row = data as RawCardRow
        setRawCard(row)
        setSetAbbr(row.set_abbr ?? '')
        setNum(row.num ?? '')
        setLang(row.lang ?? '')
        setCurrency(row.currency ?? '')
        setPurchasePrice(row.purchase_price != null ? String(row.purchase_price) : '')
        setExchangeRate(row.exchange_rate != null ? String(row.exchange_rate) : '')
        setCond(row.cond ?? '')
        setSeller(row.seller ?? '')
        setPurchaseDate(row.purchase_date ?? '')
        setNote(row.note ?? '')
        setIs1ed(row.is_1ed === true)
        setIsRev(row.is_rev === true)
      })
  }, [rawCardId])

  const handleSave = async () => {
    if (!rawCardId) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('raw_cards')
      .update({
        set_abbr: setAbbr.trim() || null,
        num: num.trim() || null,
        lang: lang.trim() || null,
        currency: currency.trim() || null,
        purchase_price: purchasePrice.trim() ? parseFloat(purchasePrice) : null,
        exchange_rate: exchangeRate.trim() ? parseFloat(exchangeRate) : null,
        cond: cond.trim() || null,
        seller: seller.trim() || null,
        purchase_date: purchaseDate || null,
        note: note.trim() || null,
        is_1ed: is1ed,
        is_rev: isRev,
      })
      .eq('id', rawCardId)

    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    onSaved()
    onClose()
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!rawCardId) return null

  const inputClass =
    'w-full rounded-md border border-base-border bg-base-elevated px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const labelClass = 'mb-0.5 block text-2xs text-slate-500'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={handleBackdropClick}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-600/40 bg-gradient-to-b from-slate-800/90 to-slate-900/95 shadow-2xl shadow-black/50 ring-1 ring-slate-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 flex items-center justify-between border-b border-base-border bg-base-elevated px-6 py-3">
          <h2 className="text-base font-semibold text-slate-100">Raw card details</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-base-surface hover:text-slate-200"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-6">
          {loading && (
            <div className="py-8 text-center text-slate-500">Loading...</div>
          )}
          {error && (
            <div className="rounded-md border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-300">
              {error}
            </div>
          )}
          {rawCard && !loading && (
            <>
              <section>
                <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Card identity (read-only)
                </h3>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Card name</dt>
                    <dd className="font-medium text-slate-200">{rawCard.card_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">ID</dt>
                    <dd className="font-mono text-2xs text-slate-400">{rawCard.id}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">SKU</dt>
                    <dd className="font-mono text-2xs text-slate-400">{rawCard.SKU ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Rarity</dt>
                    <dd className="text-slate-400">{rawCard.rarity ?? rawCard.rrty ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created</dt>
                    <dd className="text-slate-400">
                      {rawCard.created_at ? new Date(rawCard.created_at).toLocaleString() : '—'}
                    </dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Editable fields
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Set abbrev</label>
                    <input
                      type="text"
                      value={setAbbr}
                      onChange={(e) => setSetAbbr(e.target.value)}
                      placeholder="e.g. 1ED"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Card num</label>
                    <input
                      type="text"
                      value={num}
                      onChange={(e) => setNum(e.target.value)}
                      placeholder="e.g. 025"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Lang</label>
                    <input
                      type="text"
                      value={lang}
                      onChange={(e) => setLang(e.target.value)}
                      placeholder="e.g. ENG"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Currency</label>
                    <input
                      type="text"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      placeholder="AUD or JPY"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Purchase price</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="e.g. 1500"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Exchange rate</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      placeholder="e.g. 0.0095"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Condition</label>
                    <input
                      type="text"
                      value={cond}
                      onChange={(e) => setCond(e.target.value)}
                      placeholder="e.g. NM"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Seller</label>
                    <input
                      type="text"
                      value={seller}
                      onChange={(e) => setSeller(e.target.value)}
                      placeholder="Store or seller name"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Purchase date</label>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div className="col-span-2 flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={is1ed}
                        onChange={(e) => setIs1ed(e.target.checked)}
                        className="rounded border-base-border bg-base-elevated text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-300">1st Edition</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isRev}
                        onChange={(e) => setIsRev(e.target.checked)}
                        className="rounded border-base-border bg-base-elevated text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-300">Reverse Holo</span>
                    </label>
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass}>Note</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={3}
                      placeholder="Notes"
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>
            </>
          )}
        </div>

        {rawCard && !loading && (
          <div className="flex justify-end gap-3 border-t border-base-border bg-base-elevated px-6 py-3">
            <button
              onClick={onClose}
              className="rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs text-slate-400 hover:bg-base-elevated/80 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
