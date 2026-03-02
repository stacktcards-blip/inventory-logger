import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { SlabsTable } from './SlabsTable'
import { useSlabsByOrderId } from '../hooks/useSlabsByOrderId'
import type { GradingOrderRow } from '../hooks/useGradingOrders'

type GradingOrderSlabsPanelProps = {
  order: GradingOrderRow | null
  onClose: () => void
  onSlabClick?: (slabId: string) => void
  onSlabSaved?: () => void
  refetchRef?: React.MutableRefObject<(() => void) | null>
}

export function GradingOrderSlabsPanel({
  order,
  onClose,
  onSlabClick,
  refetchRef,
}: GradingOrderSlabsPanelProps) {
  const { data, loading, error, refetch } = useSlabsByOrderId(order?.id ?? null)

  useEffect(() => {
    if (refetchRef) refetchRef.current = refetch
    return () => {
      if (refetchRef) refetchRef.current = null
    }
  }, [refetch, refetchRef])

  if (!order) return null

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full max-w-2xl border-l border-slate-600/40 bg-gradient-to-b from-slate-800/95 to-slate-900 shadow-2xl shadow-black/30 sm:max-w-3xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-base-border bg-base-elevated px-4 py-2">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              {order.order_number ?? `Order #${order.id}`}
            </h2>
            <p className="text-xs text-slate-500">
              {order.grading_company} · {order.submission_date ?? '—'} ·{' '}
              {order.slabs_total} slabs ({order.slabs_unlinked} unlinked)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/?grading_order_id=${order.id}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded-md border border-base-border bg-base-surface px-3 py-1.5 text-xs text-slate-300 hover:bg-base-elevated hover:text-slate-100"
            >
              View in Slabs
            </Link>
            <button
              onClick={onClose}
              className="rounded p-1 text-slate-500 hover:bg-base-surface hover:text-slate-200"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          <SlabsTable
            data={data}
            loading={loading}
            error={error}
            onRetry={refetch}
            onRowClick={onSlabClick ? (row) => onSlabClick(row.id) : undefined}
          />
        </div>
      </div>
    </div>
  )
}
