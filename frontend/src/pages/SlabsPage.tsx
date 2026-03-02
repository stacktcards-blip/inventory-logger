import { useState, useMemo, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSlabs } from '../hooks/useSlabs'
import { SlabsFilters } from '../components/SlabsFilters'
import { SlabsStatsCards } from '../components/SlabsStatsCards'
import { useSlabsStats } from '../hooks/useSlabsStats'
import { exportSlabsToCsv, downloadCsv } from '../utils/exportSlabs'
import { getTodaySydney } from '../utils/date'
import { SlabsTable } from '../components/SlabsTable'
import { SlabsPagination } from '../components/SlabsPagination'
import { SlabsBulkActions } from '../components/SlabsBulkActions'
import { SlabDetailModal } from '../components/SlabDetailModal'
import { supabase } from '../lib/supabase'
import type { SlabsFilters as SlabsFiltersType } from '../types/slabs'
import type { RowSelectionState } from '@tanstack/react-table'

const DEFAULT_FILTERS: SlabsFiltersType = {
  salesStatus: '',
  slabOrigin: '',
  searchText: '',
  gradingOrderId: '',
  gradingCompany: '',
  grade: '',
  sortBy: 'submission_date',
  sortDir: 'desc',
}

export function SlabsPage() {
  const [searchParams] = useSearchParams()
  const gradingOrderIdFromUrl = searchParams.get('grading_order_id') ?? ''
  const [filters, setFilters] = useState<SlabsFiltersType>({
    ...DEFAULT_FILTERS,
    gradingOrderId: gradingOrderIdFromUrl,
  })

  useEffect(() => {
    if (gradingOrderIdFromUrl) {
      setFilters((f) => ({ ...f, gradingOrderId: gradingOrderIdFromUrl }))
    }
  }, [gradingOrderIdFromUrl])
  const [page, setPage] = useState(1)
  const [selectedSlabId, setSelectedSlabId] = useState<string | null>(null)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

  const { data, totalCount, loading, error, refetch } = useSlabs(filters, page)
  const { stats, loading: statsLoading, refetch: refetchStats } = useSlabsStats()

  const selectedRows = useMemo(() => {
    return data.filter((_, i) => rowSelection[i] === true)
  }, [data, rowSelection])

  const handleBulkMarkListed = async (ids: string[]) => {
    const today = getTodaySydney()
    await supabase.from('slabs').update({ listed_date: today }).in('id', ids)
    setRowSelection({})
    refetch()
    refetchStats()
  }

  const handleBulkMarkSold = async (ids: string[]) => {
    const today = getTodaySydney()
    await supabase.from('slabs').update({ sold_date: today }).in('id', ids)
    setRowSelection({})
    refetch()
    refetchStats()
  }

  const handleFiltersChange = (newFilters: SlabsFiltersType) => {
    setFilters(newFilters)
    setPage(1)
  }

  const handleStatusClick = (status: string) => {
    handleFiltersChange({ ...filters, salesStatus: status })
  }

  const handleExport = async () => {
    try {
      const csv = await exportSlabsToCsv(filters)
      const date = getTodaySydney()
      downloadCsv(csv, `slabs-${date}.csv`)
    } catch (e) {
      console.error('Export failed:', e)
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
        Slabs Inventory
      </h1>
      <SlabsStatsCards
            stats={stats}
            loading={statsLoading}
            onStatusClick={handleStatusClick}
          />
          <div className="flex items-end justify-between gap-4">
            <SlabsFilters
              filters={filters}
              onFiltersChange={handleFiltersChange}
            />
            <button
              onClick={handleExport}
              className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 hover:bg-base-elevated/80 hover:text-slate-100"
            >
              Export CSV
            </button>
          </div>
          {selectedRows.length > 0 && (
            <SlabsBulkActions
              selectedRows={selectedRows}
              onClearSelection={() => setRowSelection({})}
              onMarkListed={handleBulkMarkListed}
              onMarkSold={handleBulkMarkSold}
            />
          )}
          <SlabsTable
            data={data}
            loading={loading}
            error={error}
            onRetry={refetch}
            onRowClick={(row) => setSelectedSlabId(row.id)}
            rowSelection={rowSelection}
            onRowSelectionChange={(updater) =>
              setRowSelection((prev) =>
                typeof updater === 'function' ? updater(prev) : updater
              )
            }
            sortBy={filters.sortBy}
            sortDir={filters.sortDir}
            onSortChange={(field, dir) => {
              handleFiltersChange({ ...filters, sortBy: field, sortDir: dir })
              setPage(1)
            }}
          />
          <SlabDetailModal
            slabId={selectedSlabId}
            onClose={() => setSelectedSlabId(null)}
            onSaved={() => {
              refetch()
              refetchStats()
            }}
          />
          <SlabsPagination
            page={page}
            totalCount={totalCount}
            onPageChange={(p) => setPage(p)}
          />
    </div>
  )
}
