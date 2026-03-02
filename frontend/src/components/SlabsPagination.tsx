import { PAGE_SIZE } from '../hooks/useSlabs'

type SlabsPaginationProps = {
  page: number
  totalCount: number | null
  onPageChange: (page: number) => void
}

export function SlabsPagination({
  page,
  totalCount,
  onPageChange,
}: SlabsPaginationProps) {
  const totalPages =
    totalCount !== null ? Math.ceil(totalCount / PAGE_SIZE) : 0
  const from = totalCount ? (page - 1) * PAGE_SIZE + 1 : 0
  const to = Math.min(page * PAGE_SIZE, totalCount ?? 0)

  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between border-t border-base-border/60 bg-gradient-to-b from-slate-800/60 to-slate-900/80 px-4 py-2">
      <div className="text-xs text-slate-500">
        Showing {from}–{to} of {totalCount ?? '?'}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="rounded border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-300 hover:bg-base-elevated/80 disabled:opacity-50 disabled:hover:bg-base-elevated"
        >
          First
        </button>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="rounded border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-300 hover:bg-base-elevated/80 disabled:opacity-50 disabled:hover:bg-base-elevated"
        >
          Prev
        </button>
        <span className="flex items-center px-2 text-xs text-slate-500">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="rounded border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-300 hover:bg-base-elevated/80 disabled:opacity-50 disabled:hover:bg-base-elevated"
        >
          Next
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="rounded border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-300 hover:bg-base-elevated/80 disabled:opacity-50 disabled:hover:bg-base-elevated"
        >
          Last
        </button>
      </div>
    </div>
  )
}
