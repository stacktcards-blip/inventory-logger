import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getTodaySydney } from '../utils/date'
import { LinkRawCardModal } from './LinkRawCardModal'
import type { SlabsEnrichedRow } from '../types/slabs'

type SlabDetailModalProps = {
  slabId: string | null
  onClose: () => void
  onSaved: () => void
}

export function SlabDetailModal({
  slabId,
  onClose,
  onSaved,
}: SlabDetailModalProps) {
  const [slab, setSlab] = useState<SlabsEnrichedRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [cert, setCert] = useState('')
  const [grade, setGrade] = useState('')
  const [note, setNote] = useState('')
  const [acquiredDate, setAcquiredDate] = useState('')
  const [listedDate, setListedDate] = useState('')
  const [soldDate, setSoldDate] = useState('')
  const [showLinkModal, setShowLinkModal] = useState(false)

  useEffect(() => {
    if (!slabId) {
      setSlab(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    supabase
      .from('slabs_enriched')
      .select('*')
      .eq('id', slabId)
      .single()
      .then(({ data, error: err }) => {
        setLoading(false)
        if (err) {
          setError(err.message)
          setSlab(null)
          return
        }
        const row = data as SlabsEnrichedRow
        setSlab(row)
        setCert(row.cert ?? '')
        setGrade(row.grade ?? '')
        setNote(row.note ?? '')
        setAcquiredDate(row.acquired_date ?? '')
        setListedDate(row.listed_date ?? '')
        setSoldDate(row.sold_date ?? '')
      })
  }, [slabId])

  const today = getTodaySydney()

  const handleMarkListed = async () => {
    if (!slabId) return
    setSaving(true)
    setError(null)
    setListedDate(today)
    const { error: err } = await supabase
      .from('slabs')
      .update({ listed_date: today })
      .eq('id', slabId)
    setSaving(false)
    if (err) setError(err.message)
    else onSaved()
  }

  const handleMarkSold = async () => {
    if (!slabId) return
    setSaving(true)
    setError(null)
    setSoldDate(today)
    const { error: err } = await supabase
      .from('slabs')
      .update({ sold_date: today })
      .eq('id', slabId)
    setSaving(false)
    if (err) setError(err.message)
    else onSaved()
  }

  const handleSave = async () => {
    if (!slabId || !slab) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('slabs')
      .update({
        cert: cert || null,
        grade: grade || null,
        note: note || null,
        acquired_date: acquiredDate || null,
        listed_date: listedDate || null,
        sold_date: soldDate || null,
      })
      .eq('id', slabId)

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

  if (!slabId) return null

  const inputClass =
    'w-full rounded-md border border-base-border bg-base-elevated px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'

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
          <h2 className="text-base font-semibold text-slate-100">Slab details</h2>
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
          {slab && !loading && (
            <>
              <section>
                <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Card identity
                </h3>
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-slate-500">Card</dt>
                    <dd className="font-medium text-slate-200">{slab.card_name ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Set / No.</dt>
                    <dd className="font-medium text-slate-200">
                      {slab.set_abbr} / {slab.num} ({slab.lang})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">SKU</dt>
                    <dd className="font-mono text-2xs text-slate-400">{slab.sku ?? '—'}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Grading (editable)
                </h3>
                <div className="space-y-2">
                  <div>
                    <label className="mb-0.5 block text-2xs text-slate-500">Cert</label>
                    <input
                      type="text"
                      value={cert}
                      onChange={(e) => setCert(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-2xs text-slate-500">Grade</label>
                    <input
                      type="text"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-2xs text-slate-500">Note</label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className={inputClass}
                    />
                  </div>
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                  Dates (editable)
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-0.5 block text-2xs text-slate-500">Acquired</label>
                    <input
                      type="date"
                      value={acquiredDate}
                      onChange={(e) => setAcquiredDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-2xs text-slate-500">Listed</label>
                    <input
                      type="date"
                      value={listedDate}
                      onChange={(e) => setListedDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-2xs text-slate-500">Sold</label>
                    <input
                      type="date"
                      value={soldDate}
                      onChange={(e) => setSoldDate(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                </div>
                <p className="mt-2 text-2xs text-slate-500">
                  Submission: {slab.submission_date ?? '—'} · Order: {slab.order_number ?? '—'}
                </p>
                <div className="mt-2 flex gap-2">
                  {!slab.listed_date && (
                    <button
                      onClick={handleMarkListed}
                      disabled={saving}
                      className="rounded-md border border-amber-700/50 bg-amber-900/50 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/70 disabled:opacity-50"
                    >
                      Mark as listed
                    </button>
                  )}
                  {slab.listed_date && !slab.sold_date && (
                    <button
                      onClick={handleMarkSold}
                      disabled={saving}
                      className="rounded-md border border-emerald-700/50 bg-emerald-900/50 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/70 disabled:opacity-50"
                    >
                      Mark as sold
                    </button>
                  )}
                </div>
              </section>

              {slab.raw_card_id && (
                <section>
                  <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-slate-500">
                    Linked raw card
                  </h3>
                  <dl className="grid grid-cols-2 gap-2 rounded-md border border-base-border bg-base-elevated p-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Purchase date</dt>
                      <dd className="text-slate-200">{slab.raw_purchase_date ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Seller</dt>
                      <dd className="text-slate-200">{slab.raw_seller ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Price (JPY)</dt>
                      <dd className="text-slate-200">{slab.purchase_price ?? '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Cost (AUD)</dt>
                      <dd className="text-slate-200">{slab.raw_cost_aud ?? '—'}</dd>
                    </div>
                  </dl>
                </section>
              )}
              {!slab.raw_card_id && (
                <section>
                  <p className="mb-2 text-xs text-slate-500">Not linked to raw card</p>
                  <button
                    onClick={() => setShowLinkModal(true)}
                    className="rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
                  >
                    Link to raw card
                  </button>
                </section>
              )}
            </>
          )}
        </div>

        {slab && !loading && (
          <div className="flex justify-end gap-2 border-t border-base-border bg-base-elevated px-6 py-3">
            <button
              onClick={onClose}
              className="rounded-md border border-base-border px-4 py-2 text-xs text-slate-300 hover:bg-base-surface hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-xs font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>
      {showLinkModal && slab && slabId && (
        <LinkRawCardModal
          slabId={slabId}
          slabSet={slab.set_abbr}
          slabNum={slab.num}
          slabLang={slab.lang}
          onClose={() => setShowLinkModal(false)}
          onLinked={onSaved}
        />
      )}
    </div>
  )
}
