import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useState } from 'react'
import type { GradingOrderRow } from '../hooks/useGradingOrders'

type GradingOrdersTableProps = {
  data: GradingOrderRow[]
  loading: boolean
  onRowClick: (order: GradingOrderRow) => void
}

const columns: ColumnDef<GradingOrderRow>[] = [
  {
    accessorKey: 'order_number',
    header: 'Order',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'grading_company',
    header: 'Company',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'submission_date',
    header: 'Submitted',
    cell: (info) => info.getValue() ?? '—',
  },
  {
    accessorKey: 'slabs_total',
    header: 'Total',
    cell: (info) => info.getValue() ?? 0,
  },
  {
    accessorKey: 'slabs_linked',
    header: 'Linked',
    cell: (info) => (
      <span className="text-emerald-400">
        {String(info.getValue() ?? 0)}
      </span>
    ),
  },
  {
    accessorKey: 'slabs_unlinked',
    header: 'Unlinked',
    cell: (info) => (
      <span className="text-amber-400">
        {String(info.getValue() ?? 0)}
      </span>
    ),
  },
]

export function GradingOrdersTable({
  data,
  loading,
  onRowClick,
}: GradingOrdersTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'submission_date', desc: true },
  ])

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 py-12">
        <div className="text-slate-500">Loading orders...</div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 py-12 text-center text-slate-500">
        No grading orders found.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 shadow-lg shadow-black/20">
      <table className="min-w-full divide-y divide-base-border">
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
        <tbody className="divide-y divide-base-border bg-base-surface">
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row.original)}
              className="cursor-pointer hover:bg-base-elevated/50"
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
