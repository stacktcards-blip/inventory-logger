import type { SlabsDashboardRow } from '../types/slabs'

type SlabsBulkActionsProps = {
  selectedRows: SlabsDashboardRow[]
  onClearSelection: () => void
  onMarkListed: (ids: string[]) => Promise<void>
  onMarkSold: (ids: string[]) => Promise<void>
}

export function SlabsBulkActions({
  selectedRows,
  onClearSelection,
  onMarkListed,
  onMarkSold,
}: SlabsBulkActionsProps) {
  const canList = selectedRows.some((r) => !r.listed_date)
  const canSell = selectedRows.some((r) => r.listed_date && !r.sold_date)

  if (selectedRows.length === 0) return null

  const handleMarkListed = async () => {
    const toUpdate = selectedRows.filter((r) => !r.listed_date).map((r) => r.id)
    if (toUpdate.length) await onMarkListed(toUpdate)
  }

  const handleMarkSold = async () => {
    const toUpdate = selectedRows
      .filter((r) => r.listed_date && !r.sold_date)
      .map((r) => r.id)
    if (toUpdate.length) await onMarkSold(toUpdate)
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-amber-700/40 bg-gradient-to-r from-amber-900/50 to-amber-950/60 px-4 py-2">
      <span className="text-xs font-medium text-amber-200">
        {selectedRows.length} selected
      </span>
      {canList && (
        <button
          onClick={handleMarkListed}
          className="rounded-md border border-amber-700/50 bg-amber-900/50 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/70"
        >
          Mark as listed
        </button>
      )}
      {canSell && (
        <button
          onClick={handleMarkSold}
          className="rounded-md border border-emerald-700/50 bg-emerald-900/50 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-900/70"
        >
          Mark as sold
        </button>
      )}
      <button
        onClick={onClearSelection}
        className="text-xs text-slate-400 hover:text-slate-200"
      >
        Clear selection
      </button>
    </div>
  )
}
