import type { SlabsStats } from '../hooks/useSlabsStats'

type SlabsStatsCardsProps = {
  stats: SlabsStats | null
  loading: boolean
  onStatusClick?: (status: string) => void
}

export function SlabsStatsCards({
  stats,
  loading,
  onStatusClick,
}: SlabsStatsCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-lg border border-base-border bg-base-surface p-3"
          >
            <div className="h-3 w-14 rounded bg-slate-700" />
            <div className="mt-2 h-6 w-10 rounded bg-slate-700" />
          </div>
        ))}
      </div>
    )
  }

  if (!stats) return null

  const cards = [
    {
      label: 'Total',
      value: stats.total,
      status: '',
      color: 'bg-gradient-to-br from-slate-800/60 to-slate-900/80 border-slate-600/40',
    },
    {
      label: 'Not listed',
      value: stats.notListed,
      status: 'NOT LISTED',
      color: 'bg-gradient-to-br from-slate-800/60 to-slate-900/80 border-slate-600/40',
    },
    {
      label: 'Listed',
      value: stats.listed,
      status: 'LISTED',
      color: 'bg-gradient-to-br from-amber-900/40 to-amber-950/60 border-amber-700/40',
    },
    {
      label: 'Sold',
      value: stats.sold,
      status: 'SOLD',
      color: 'bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 border-emerald-700/40',
    },
    {
      label: 'Unlinked',
      value: stats.unlinked,
      status: '',
      color: 'bg-gradient-to-br from-blue-900/30 to-blue-950/50 border-blue-700/40',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {cards.map((card) => (
        <button
          key={card.label}
          type="button"
          onClick={() => card.status && onStatusClick?.(card.status)}
          className={`rounded-lg border p-3 text-left transition-all hover:border-slate-500/80 hover:shadow-lg hover:shadow-black/20 ${
            card.status ? 'cursor-pointer' : 'cursor-default'
          } ${card.color}`}
        >
          <div className="text-2xs font-semibold uppercase tracking-wider text-slate-500">
            {card.label}
          </div>
          <div className="mt-0.5 text-xl font-semibold text-slate-100">
            {stats.total > 0 ? card.value.toLocaleString() : '—'}
          </div>
        </button>
      ))}
    </div>
  )
}
