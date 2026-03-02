import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRawCards } from '../hooks/useRawCards'
import { RawCardsFilters } from '../components/RawCardsFilters'
import { RawCardsTable } from '../components/RawCardsTable'
import { RawCardsPagination } from '../components/RawCardsPagination'
import { CardTallyPanel } from '../components/CardTallyPanel'
import { RawCardDetailModal } from '../components/RawCardDetailModal'
import type { RawCardsFilters as RawCardsFiltersType } from '../types/rawCards'

const DEFAULT_FILTERS: RawCardsFiltersType = {
  setAbbr: '',
  num: '',
  lang: '',
  seller: '',
  dateFrom: '',
  dateTo: '',
  searchText: '',
  sortBy: 'purchase_date',
  sortDir: 'desc',
}

export function RawCardsPage() {
  const [filters, setFilters] = useState<RawCardsFiltersType>(DEFAULT_FILTERS)
  const [page, setPage] = useState(1)
  const [selectedRawCardId, setSelectedRawCardId] = useState<number | null>(null)

  const { data, totalCount, loading, error, refetch } = useRawCards(filters, page)

  const handleFiltersChange = (newFilters: RawCardsFiltersType) => {
    setFilters(newFilters)
    setPage(1)
  }

  const handleSortChange = (field: RawCardsFiltersType['sortBy'], dir: RawCardsFiltersType['sortDir']) => {
    setFilters((f) => ({ ...f, sortBy: field, sortDir: dir }))
    setPage(1)
  }

  return (
    <div className="space-y-3">
      <h1 className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-300 bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
        Raw Cards Inventory
      </h1>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex-1 space-y-3">
          <div className="flex items-end justify-between gap-4">
            <RawCardsFilters filters={filters} onFiltersChange={handleFiltersChange} />
            <Link
              to="/raw-cards/add"
              className="rounded-md border border-base-border bg-base-elevated px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-base-elevated/80 hover:text-slate-100"
            >
              Add raw cards
            </Link>
          </div>
          <RawCardsTable
            data={data}
            loading={loading}
            error={error}
            onRetry={refetch}
            onSaved={refetch}
            onCardClick={(row) => setSelectedRawCardId(row.id)}
            sortBy={filters.sortBy}
            sortDir={filters.sortDir}
            onSortChange={handleSortChange}
          />
          <RawCardDetailModal
            rawCardId={selectedRawCardId}
            onClose={() => setSelectedRawCardId(null)}
            onSaved={refetch}
          />
          <RawCardsPagination
            page={page}
            totalCount={totalCount}
            onPageChange={(p) => setPage(p)}
          />
        </div>
        <div className="lg:w-80 lg:shrink-0">
          <CardTallyPanel className="rounded-lg border border-base-border/80 bg-gradient-to-b from-slate-800/40 to-slate-900/60" />
        </div>
      </div>
    </div>
  )
}
