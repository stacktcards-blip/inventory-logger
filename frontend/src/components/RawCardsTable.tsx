import { useState, useCallback } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table'
import { supabase } from '../lib/supabase'
import type { RawCardRow, RawCardsSortField, RawCardsSortDir } from '../types/rawCards'

type RawCardsTableProps = {
  data: RawCardRow[]
  loading: boolean
  error: Error | null
  onRetry?: () => void
  onSaved?: () => void
  onCardClick?: (row: RawCardRow) => void
  sortBy?: RawCardsSortField
  sortDir?: RawCardsSortDir
  onSortChange?: (field: RawCardsSortField, dir: RawCardsSortDir) => void
}

type EditingCell = { rowId: number; columnKey: string } | null

const EDITABLE_COLUMNS = [
  'set_abbr',
  'num',
  'lang',
  'currency',
  'purchase_price',
  'exchange_rate',
  'cond',
  'seller',
  'purchase_date',
  'note',
  'is_1ed',
  'is_rev',
] as const

function SortableHeader({
  label,
  field,
  currentSortBy,
  currentSortDir,
  onSort,
}: {
  label: string
  field: RawCardsSortField
  currentSortBy?: RawCardsSortField
  currentSortDir?: RawCardsSortDir
  onSort?: (field: RawCardsSortField, dir: RawCardsSortDir) => void
}) {
  const isActive = currentSortBy === field
  return (
    <button
      type="button"
      onClick={() => onSort?.(field, isActive && currentSortDir === 'asc' ? 'desc' : 'asc')}
      className="flex items-center gap-1 font-medium uppercase tracking-wider text-slate-400 transition-colors hover:text-slate-200"
    >
      {label}
      {isActive && (
        <span className="text-blue-400">{currentSortDir === 'asc' ? '↑' : '↓'}</span>
      )}
    </button>
  )
}

export function RawCardsTable({
  data,
  loading,
  error,
  onRetry,
  onSaved,
  onCardClick,
  sortBy = 'purchase_date',
  sortDir = 'desc',
  onSortChange,
}: RawCardsTableProps) {
  const [editingCell, setEditingCell] = useState<EditingCell>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saveCell = useCallback(
    async (rowId: number, columnKey: string, value: string | number | boolean | null) => {
      setSaveError(null)
      setEditingCell(null)
      try {
        const payload: Record<string, unknown> = { [columnKey]: value }
        if (columnKey === 'purchase_price' || columnKey === 'exchange_rate') {
          payload[columnKey] = value === '' || value === null ? null : Number(value)
        }
        if (columnKey === 'purchase_date') {
          payload[columnKey] = value === '' ? null : value
        }
        if (columnKey === 'is_1ed' || columnKey === 'is_rev') {
          payload[columnKey] = value === true
        }
        const { error: err } = await supabase
          .from('raw_cards')
          .update(payload)
          .eq('id', rowId)
        if (err) throw err
        onSaved?.()
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Save failed')
        setEditingCell({ rowId, columnKey })
      }
    },
    [onSaved]
  )

  const renderCell = useCallback(
    (row: RawCardRow, columnKey: string) => {
      const isEditing =
        editingCell?.rowId === row.id && editingCell?.columnKey === columnKey
      const isEditable = EDITABLE_COLUMNS.includes(columnKey as (typeof EDITABLE_COLUMNS)[number])
      const rawValue = row[columnKey as keyof RawCardRow]

      if (isEditable && isEditing) {
        if (columnKey === 'is_1ed' || columnKey === 'is_rev') {
          return (
            <input
              type="checkbox"
              defaultChecked={rawValue === true}
              autoFocus
              onBlur={(e) => saveCell(row.id, columnKey, e.target.checked)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  saveCell(row.id, columnKey, (e.target as HTMLInputElement).checked)
                }
              }}
              className="rounded border-base-border bg-base-elevated text-blue-500 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          )
        }
        if (columnKey === 'purchase_date') {
          return (
            <input
              type="date"
              defaultValue={typeof rawValue === 'string' ? rawValue : ''}
              autoFocus
              onBlur={(e) => saveCell(row.id, columnKey, e.target.value || null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveCell(row.id, columnKey, (e.target as HTMLInputElement).value || null)
                if (e.key === 'Escape') setEditingCell(null)
              }}
              className="w-full min-w-[8rem] rounded-md border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          )
        }
        if (columnKey === 'purchase_price' || columnKey === 'exchange_rate') {
          return (
            <input
              type="text"
              inputMode="decimal"
              defaultValue={typeof rawValue === 'number' ? String(rawValue) : rawValue != null ? String(rawValue) : ''}
              autoFocus
              onBlur={(e) => {
                const v = e.target.value.trim()
                saveCell(row.id, columnKey, v === '' ? null : parseFloat(v) || null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim()
                  saveCell(row.id, columnKey, v === '' ? null : parseFloat(v) || null)
                }
                if (e.key === 'Escape') setEditingCell(null)
              }}
              className="w-full min-w-[5rem] rounded-md border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          )
        }
        return (
          <input
            type="text"
            defaultValue={typeof rawValue === 'string' ? rawValue : rawValue != null ? String(rawValue) : ''}
            autoFocus
            onBlur={(e) => saveCell(row.id, columnKey, e.target.value.trim() || null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveCell(row.id, columnKey, (e.target as HTMLInputElement).value.trim() || null)
              if (e.key === 'Escape') setEditingCell(null)
            }}
            className="w-full min-w-[4rem] rounded-md border border-base-border bg-base-elevated px-2 py-1 text-xs text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            onClick={(e) => e.stopPropagation()}
          />
        )
      }

      if (isEditable) {
        return (
          <div
            onClick={(e) => {
              e.stopPropagation()
              setEditingCell({ rowId: row.id, columnKey })
            }}
            className="cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-base-elevated/50"
            title="Click to edit"
          >
            {columnKey === 'is_1ed' || columnKey === 'is_rev'
              ? rawValue === true
                ? '✓'
                : '—'
              : rawValue ?? '—'}
          </div>
        )
      }

      return rawValue ?? '—'
    },
    [editingCell, saveCell]
  )

  const columns: ColumnDef<RawCardRow>[] = [
    { accessorKey: 'id', header: 'ID', cell: (info) => info.getValue() ?? '—' },
    {
      accessorKey: 'card_name',
      header: 'Card',
      cell: ({ row, getValue }) => {
        const raw = getValue()
        const display = raw != null && typeof raw === 'string' ? raw : '—'
        if (onCardClick) {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onCardClick(row.original)
              }}
              className="cursor-pointer text-left text-blue-400 underline decoration-blue-400/50 underline-offset-1 transition-colors hover:text-blue-300 hover:decoration-blue-400"
            >
              {display}
            </button>
          )
        }
        return display
      },
    },
    {
      accessorKey: 'set_abbr',
      header: () => (
        <SortableHeader label="Set" field="set_abbr" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSortChange} />
      ),
      cell: ({ row }) => renderCell(row.original, 'set_abbr'),
    },
    {
      accessorKey: 'num',
      header: () => (
        <SortableHeader label="No." field="num" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSortChange} />
      ),
      cell: ({ row }) => renderCell(row.original, 'num'),
    },
    {
      accessorKey: 'lang',
      header: 'Lang',
      cell: ({ row }) => renderCell(row.original, 'lang'),
    },
    {
      accessorKey: 'currency',
      header: 'CCY',
      cell: ({ row }) => renderCell(row.original, 'currency'),
    },
    {
      accessorKey: 'purchase_price',
      header: () => (
        <SortableHeader
          label="Price"
          field="purchase_price"
          currentSortBy={sortBy}
          currentSortDir={sortDir}
          onSort={onSortChange}
        />
      ),
      cell: ({ row }) => renderCell(row.original, 'purchase_price'),
    },
    {
      accessorKey: 'exchange_rate',
      header: 'Exch',
      cell: ({ row }) => renderCell(row.original, 'exchange_rate'),
    },
    {
      accessorKey: 'cond',
      header: 'Cond',
      cell: ({ row }) => renderCell(row.original, 'cond'),
    },
    {
      accessorKey: 'seller',
      header: () => (
        <SortableHeader label="Seller" field="seller" currentSortBy={sortBy} currentSortDir={sortDir} onSort={onSortChange} />
      ),
      cell: ({ row }) => renderCell(row.original, 'seller'),
    },
    {
      accessorKey: 'purchase_date',
      header: () => (
        <SortableHeader
          label="Date"
          field="purchase_date"
          currentSortBy={sortBy}
          currentSortDir={sortDir}
          onSort={onSortChange}
        />
      ),
      cell: ({ row }) => renderCell(row.original, 'purchase_date'),
    },
    {
      accessorKey: 'note',
      header: 'Note',
      cell: ({ row }) => renderCell(row.original, 'note'),
    },
    {
      accessorKey: 'is_1ed',
      header: '1ed',
      cell: ({ row }) => renderCell(row.original, 'is_1ed'),
    },
    {
      accessorKey: 'is_rev',
      header: 'Rev',
      cell: ({ row }) => renderCell(row.original, 'is_rev'),
    },
  ]

  const table = useReactTable({
    data,
    columns,
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
        <div className="text-slate-500">Loading raw cards...</div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60 py-12 text-center text-slate-500">
        No raw cards found.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {saveError && (
        <div className="rounded-md border border-red-900/50 bg-red-950/30 px-4 py-2 text-xs text-red-400">
          {saveError}
        </div>
      )}
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
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-base-border/60">
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-base-elevated/50">
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
    </div>
  )
}
