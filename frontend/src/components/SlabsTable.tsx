import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type RowSelectionState,
  type OnChangeFn,
} from '@tanstack/react-table'
import type { SlabsDashboardRow, SlabsSortField, SlabsSortDir } from '../types/slabs'

type SlabsTableProps = {
  data: SlabsDashboardRow[]
  loading: boolean
  error: Error | null
  onRetry?: () => void
  onRowClick?: (row: SlabsDashboardRow) => void
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  sortBy?: SlabsSortField
  sortDir?: SlabsSortDir
  onSortChange?: (field: SlabsSortField, dir: SlabsSortDir) => void
}

// PK column visible during development; set to false to hide after Phase 2
const SHOW_PK_FOR_DEV = false

const baseColumns: ColumnDef<SlabsDashboardRow>[] = [
  {
    id: 'select',
    header: ({ table }) => {
      const ref = (el: HTMLInputElement | null) => {
        if (el) el.indeterminate = table.getIsSomePageRowsSelected()
      }
      return (
        <input
          ref={ref}
          type="checkbox"
          checked={table.getIsAllPageRowsSelected()}
          onChange={(e) => table.toggleAllPageRowsSelected(e.target.checked)}
          onClick={(e) => e.stopPropagation()}
          className="rounded border-base-border bg-base-elevated text-blue-500 focus:ring-blue-500"
        />
      )
    },
    cell: ({ row }) => (
        <input
        type="checkbox"
        checked={row.getIsSelected()}
        onChange={(e) => row.toggleSelected(e.target.checked)}
        onClick={(e) => e.stopPropagation()}
        className="rounded border-base-border bg-base-elevated text-blue-500 focus:ring-blue-500"
      />
    ),
  },
  ...(SHOW_PK_FOR_DEV
    ? [
        {
          accessorKey: 'id',
          header: 'ID',
          cell: (info) => (
            <span className="font-mono text-2xs text-slate-500" title="PK – hidden after dev">
              {(info.getValue() as string)?.slice(0, 8)}…
            </span>
          ),
        } as ColumnDef<SlabsDashboardRow>,
      ]
    : []),
  { accessorKey: 'sku', header: 'SKU', cell: (info) => info.getValue() ?? '—' },
  {
    accessorKey: 'card_name',
    header: 'Card',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'set_abbr',
    header: 'Set',
    cell: (info) => info.getValue() ?? '—',
  },
  { accessorKey: 'num', header: 'No.', cell: (info) => info.getValue() ?? '—' },
  { accessorKey: 'lang', header: 'Lang', cell: (info) => info.getValue() ?? '—' },
  {
    accessorKey: 'grade',
    header: 'Grade',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'grading_company',
    header: 'Company',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'cert',
    header: 'Cert',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'sales_status',
    header: 'Status',
    cell: (info) => {
      const v = info.getValue() as string
      const colors: Record<string, string> = {
        'NOT LISTED': 'bg-slate-700/60 text-slate-300',
        LISTED: 'bg-amber-900/50 text-amber-300',
        SOLD: 'bg-emerald-900/50 text-emerald-300',
      }
      return (
        <span
          className={`inline-flex rounded px-1.5 py-0.5 text-2xs font-medium ${colors[v] ?? 'bg-slate-700/60 text-slate-300'}`}
        >
          {v?.replace('_', ' ') ?? '—'}
        </span>
      )
    },
  },
  {
    accessorKey: 'raw_seller',
    header: 'Seller',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'raw_cost_aud',
    header: 'Raw cost',
    cell: (info) => {
      const v = info.getValue() as number | null
      return v != null ? `$${v.toLocaleString()}` : '—'
    },
  },
  {
    accessorKey: 'raw_purchase_date',
    header: 'Purchase date',
    cell: (info) => info.getValue() ?? '—',
  },
]

function SortableHeader({
  label,
  field,
  currentSortBy,
  currentSortDir,
  onSort,
}: {
  label: string
  field: SlabsSortField
  currentSortBy?: SlabsSortField
  currentSortDir?: SlabsSortDir
  onSort?: (field: SlabsSortField, dir: SlabsSortDir) => void
}) {
  const isActive = currentSortBy === field
  const nextDir =
    isActive && currentSortDir === 'asc' ? 'desc' : 'asc'
  return (
    <button
      type="button"
      onClick={() => onSort?.(field, nextDir)}
      className="flex items-center gap-1 font-medium uppercase tracking-wider text-slate-400 hover:text-slate-200"
    >
      {label}
      {isActive && (
        <span className="text-blue-400">{currentSortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )
}

export function SlabsTable({
  data,
  loading,
  error,
  onRetry,
  onRowClick,
  rowSelection = {},
  onRowSelectionChange,
  sortBy = 'submission_date',
  sortDir = 'desc',
  onSortChange,
}: SlabsTableProps) {
  const columnsWithSort = baseColumns.map((col) => {
    const key = 'accessorKey' in col ? (col as { accessorKey?: string }).accessorKey : undefined
    if (key === 'sku') {
      return {
        ...col,
        header: () => (
          <SortableHeader
            label="SKU"
            field="sku"
            currentSortBy={sortBy}
            currentSortDir={sortDir}
            onSort={onSortChange}
          />
        ),
      } as ColumnDef<SlabsDashboardRow>
    }
    if (key === 'raw_purchase_date') {
      return {
        ...col,
        header: () => (
          <SortableHeader
            label="Purchase date"
            field="raw_purchase_date"
            currentSortBy={sortBy}
            currentSortDir={sortDir}
            onSort={onSortChange}
          />
        ),
      } as ColumnDef<SlabsDashboardRow>
    }
    return col
  }) as ColumnDef<SlabsDashboardRow>[]

  const table = useReactTable({
    data,
    columns: columnsWithSort,
    state: { rowSelection },
    onRowSelectionChange: onRowSelectionChange,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
  })

  if (error) {
    return (
      <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-6 text-center">
        <p className="text-red-300">{error.message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 rounded-md border border-red-800/50 bg-red-900/30 px-3 py-1.5 text-xs text-red-300 hover:bg-red-900/50"
          >
            Retry
          </button>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 py-12">
        <div className="text-slate-500">Loading slabs...</div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 py-12 text-center text-slate-500">
        No slabs found.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
      <table className="min-w-full divide-y divide-base-border/60">
        <thead className="bg-gradient-to-b from-slate-800/80 to-slate-900/60">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-3 py-2 text-left text-2xs font-semibold uppercase tracking-wider text-slate-500"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-base-border/60">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick?.(row.original)}
              className={`hover:bg-base-elevated/50 ${onRowClick ? 'cursor-pointer' : ''}`}
            >
              {row.getVisibleCells().map((cell) => (
                <td
                  key={cell.id}
                  className="whitespace-nowrap px-3 py-2 text-xs text-slate-200"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
