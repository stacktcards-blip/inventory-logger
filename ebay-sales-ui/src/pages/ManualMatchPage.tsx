import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { formatDateSydney } from '../lib/date'
import { formatGrade } from '../lib/format'

type UnmatchedSale = {
  id: string
  title?: string | null
  card_name?: string | null
  grade?: string | null
  grading_company?: string | null
  set_abbr?: string | null
  sold_date?: string | null
  sale_price?: number | null
}

type MatchResult = {
  matched: boolean
  message?: string
  candidates?: { id: string; cert?: string }[]
  slab?: { id: string; cert?: string }
}

export function ManualMatchPage() {
  const [sales, setSales] = useState<UnmatchedSale[]>([])
  const [loading, setLoading] = useState(true)
  const [certInputs, setCertInputs] = useState<Record<string, string>>({})
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({})
  const [approvingAll, setApprovingAll] = useState(false)
  const [globalMsg, setGlobalMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getSales({ match_status: 'PENDING' })
      const more = await api.getSales({ match_status: 'MANUAL_REVIEW' })
      const combined = [...(Array.isArray(data) ? data : []), ...(Array.isArray(more) ? more : [])]
      setSales(combined)
      setRowErrors({})
    } catch {
      setSales([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const setCert = (saleId: string, value: string) => {
    setCertInputs((prev) => ({ ...prev, [saleId]: value }))
    setRowErrors((prev) => {
      const next = { ...prev }
      delete next[saleId]
      return next
    })
  }

  const handleMatchRow = async (saleId: string) => {
    const cert = certInputs[saleId]?.trim()
    if (!cert) return

    setRowErrors((prev) => ({ ...prev, [saleId]: '' }))
    setGlobalMsg(null)
    try {
      const res = (await api.matchByCert(cert, saleId)) as MatchResult
      if (res.matched) {
        setCertInputs((prev) => {
          const next = { ...prev }
          delete next[saleId]
          return next
        })
        setRowErrors((prev) => {
          const next = { ...prev }
          delete next[saleId]
          return next
        })
        await load()
      } else {
        setRowErrors((prev) => ({
          ...prev,
          [saleId]: res.message || (res.candidates?.length ? 'Multiple matches' : 'No slab found'),
        }))
      }
    } catch (e) {
      setRowErrors((prev) => ({
        ...prev,
        [saleId]: e instanceof Error ? e.message : 'Match failed',
      }))
    }
  }

  const handleApproveAll = async () => {
    const entries = sales
      .map((s) => ({ saleId: s.id, cert: certInputs[s.id]?.trim() }))
      .filter((e) => !!e.cert)
    if (entries.length === 0) {
      setGlobalMsg({ type: 'err', text: 'No certs entered. Enter certs in the table and try again.' })
      return
    }

    setApprovingAll(true)
    setGlobalMsg(null)
    setRowErrors({})
    let matched = 0
    const newErrors: Record<string, string> = {}
    for (const { saleId, cert } of entries) {
      try {
        const res = (await api.matchByCert(cert!, saleId)) as MatchResult
        if (res.matched) {
          matched++
          setCertInputs((prev) => {
            const next = { ...prev }
            delete next[saleId]
            return next
          })
        } else {
          newErrors[saleId] =
            res.message || (res.candidates?.length ? 'Multiple matches' : 'No slab found')
        }
      } catch (e) {
        newErrors[saleId] = e instanceof Error ? e.message : 'Match failed'
      }
    }
    setRowErrors(newErrors)
    setGlobalMsg({
      type: 'ok',
      text: `Matched ${matched} of ${entries.length}. ${entries.length - matched} unmatched kept for review.`,
    })
    await load()
    setApprovingAll(false)
  }

  if (loading) {
    return <div className="py-8 text-center text-slate-400">Loading...</div>
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-100">Manual Match</h1>
        <button
          onClick={handleApproveAll}
          disabled={approvingAll || sales.every((s) => !certInputs[s.id]?.trim())}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          {approvingAll ? 'Matching...' : 'Approve All'}
        </button>
      </div>
      {globalMsg && (
        <div
          className={`mb-4 rounded-md p-3 text-sm ${
            globalMsg.type === 'ok'
              ? 'border border-green-800/50 bg-green-950/30 text-green-300'
              : 'border border-red-900/50 bg-red-950/30 text-red-300'
          }`}
        >
          {globalMsg.text}
        </div>
      )}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        {sales.length === 0 ? (
          <div className="p-8 text-center text-slate-400">No unmatched sales.</div>
        ) : (
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800/80">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Card</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Set</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Grade</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Sold</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase text-slate-400">Cert</th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {sales.map((s) => (
                <tr key={s.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3 text-sm font-medium text-slate-200">
                    {s.card_name || s.title || 'Unknown'}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-400">{s.set_abbr ?? '—'}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatGrade(s.grading_company, s.grade)}</td>
                  <td className="px-4 py-3 text-sm text-slate-400">{formatDateSydney(s.sold_date)}</td>
                  <td className="px-4 py-3 text-sm text-slate-300">${s.sale_price ?? '—'}</td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      value={certInputs[s.id] ?? ''}
                      onChange={(e) => setCert(s.id, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleMatchRow(s.id)}
                      placeholder="Scan or type cert..."
                      className={`w-full min-w-[140px] rounded border bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 ${
                        rowErrors[s.id]
                          ? 'border-red-500/60 focus:ring-red-500/40'
                          : 'border-slate-600 focus:ring-blue-500/40 focus:border-blue-500'
                      }`}
                    />
                    {rowErrors[s.id] && (
                      <div className="mt-1 text-xs text-red-400">{rowErrors[s.id]}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleMatchRow(s.id)}
                      disabled={!certInputs[s.id]?.trim()}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                      Match
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
