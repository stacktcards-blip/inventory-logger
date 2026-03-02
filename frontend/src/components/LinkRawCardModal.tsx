import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

type RawCardRow = {
  id: number
  set_abbr: string | null
  num: string | null
  lang: string | null
  purchase_date: string | null
  seller: string | null
  purchase_price: number | null
}

type LinkRawCardModalProps = {
  slabId: string
  slabSet: string
  slabNum: string
  slabLang: string
  onClose: () => void
  onLinked: () => void
}

export function LinkRawCardModal({
  slabId,
  slabSet,
  slabNum,
  slabLang,
  onClose,
  onLinked,
}: LinkRawCardModalProps) {
  const [rawCards, setRawCards] = useState<RawCardRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  useEffect(() => {
    supabase
      .from('raw_cards')
      .select('id, set_abbr, num, lang, purchase_date, seller, purchase_price')
      .eq('set_abbr', slabSet)
      .eq('num', slabNum)
      .eq('lang', slabLang)
      .limit(20)
      .then(({ data, error }) => {
        setLoading(false)
        if (!error) setRawCards((data as RawCardRow[]) ?? [])
      })
  }, [slabSet, slabNum, slabLang])

  const handleLink = async () => {
    if (!selectedId) return
    setSaving(true)
    const { error } = await supabase
      .from('slabs')
      .update({ raw_card_id: selectedId })
      .eq('id', slabId)
    setSaving(false)
    if (!error) {
      onLinked()
      onClose()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70"
      onClick={handleBackdropClick}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-600/40 bg-gradient-to-b from-slate-800/90 to-slate-900 shadow-2xl shadow-black/50 ring-1 ring-slate-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-base-border bg-base-elevated px-4 py-2">
          <h3 className="text-sm font-semibold text-slate-100">Link to raw card</h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-500 hover:bg-base-surface hover:text-slate-200"
          >
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-slate-500">
            Matching set {slabSet} / {slabNum} ({slabLang})
          </p>
          {loading && <p className="text-xs text-slate-500">Loading...</p>}
          {!loading && rawCards.length === 0 && (
            <p className="text-xs text-slate-500">No matching raw cards found.</p>
          )}
          {!loading && rawCards.length > 0 && (
            <ul className="space-y-2">
              {rawCards.map((rc) => (
                <li
                  key={rc.id}
                  onClick={() => setSelectedId(rc.id)}
                  className={`cursor-pointer rounded border p-2.5 text-xs transition-colors ${
                    selectedId === rc.id
                      ? 'border-blue-500 bg-blue-950/50 text-slate-100'
                      : 'border-base-border bg-base-elevated text-slate-300 hover:border-slate-500 hover:text-slate-100'
                  }`}
                >
                  <span className="font-medium">#{rc.id}</span>
                  {' · '}
                  {rc.purchase_date ?? '—'} · {rc.seller ?? '—'} · ¥
                  {rc.purchase_price ?? '—'}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-base-border bg-base-elevated px-4 py-2">
          <button
            onClick={onClose}
            className="rounded border border-base-border px-3 py-1.5 text-xs text-slate-300 hover:bg-base-surface hover:text-slate-100"
          >
            Cancel
          </button>
          <button
            onClick={handleLink}
            disabled={!selectedId || saving}
            className="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg shadow-blue-500/20 hover:from-blue-500 hover:to-blue-400 disabled:opacity-50"
          >
            {saving ? 'Linking...' : 'Link'}
          </button>
        </div>
      </div>
    </div>
  )
}
