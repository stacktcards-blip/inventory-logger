import { useState, useEffect } from 'react'
import { useGradingOrders } from '../hooks/useGradingOrders'
import type { SlabsFilters as SlabsFiltersType } from '../types/slabs'

type SlabsFiltersProps = {
  filters: SlabsFiltersType
  onFiltersChange: (filters: SlabsFiltersType) => void
}

const SALES_STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'NOT LISTED', label: 'Not listed' },
  { value: 'LISTED', label: 'Listed' },
  { value: 'SOLD', label: 'Sold' },
]

const SLAB_ORIGIN_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'GRADED_BY_US', label: 'Graded by us' },
  { value: 'PURCHASED_SLAB', label: 'Purchased slab' },
  { value: 'UNKNOWN', label: 'Unknown' },
]

const GRADING_COMPANY_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PSA', label: 'PSA' },
  { value: 'CGC', label: 'CGC' },
  { value: 'BGS', label: 'BGS' },
  { value: 'CGA', label: 'CGA' },
  { value: 'TAG', label: 'TAG' },
]

const GRADE_OPTIONS = [
  { value: '', label: 'All' },
  ...['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10'].map((g) => ({ value: g, label: g })),
]

const SEARCH_DEBOUNCE_MS = 300

export function SlabsFilters({ filters, onFiltersChange }: SlabsFiltersProps) {
  const [searchInput, setSearchInput] = useState(filters.searchText)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== filters.searchText) {
        onFiltersChange({ ...filters, searchText: searchInput })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
  }

  const handleSalesStatusChange = (value: string) => {
    onFiltersChange({ ...filters, salesStatus: value })
  }

  const handleSlabOriginChange = (value: string) => {
    onFiltersChange({ ...filters, slabOrigin: value })
  }

  const handleGradingOrderChange = (value: string) => {
    onFiltersChange({ ...filters, gradingOrderId: value })
  }

  const handleGradingCompanyChange = (value: string) => {
    onFiltersChange({ ...filters, gradingCompany: value })
  }

  const handleGradeChange = (value: string) => {
    onFiltersChange({ ...filters, grade: value })
  }

  const handleClear = () => {
    setSearchInput('')
    onFiltersChange({
      salesStatus: '',
      slabOrigin: '',
      searchText: '',
      gradingOrderId: '',
      gradingCompany: '',
      grade: '',
      sortBy: 'submission_date',
      sortDir: 'desc',
    })
  }

  const { data: gradingOrders = [] } = useGradingOrders()
  const hasActiveFilters =
    filters.salesStatus ||
    filters.slabOrigin ||
    filters.searchText ||
    filters.gradingOrderId ||
    filters.gradingCompany ||
    filters.grade

  const inputClass =
    'rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500'
  const labelClass = 'mb-0.5 block text-2xs font-medium uppercase tracking-wider text-slate-500'

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label htmlFor="search" className={labelClass}>
          Search
        </label>
        <input
          id="search"
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Card name, SKU, cert, set..."
          className={`w-56 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="sales-status" className={labelClass}>
          Sales status
        </label>
        <select
          id="sales-status"
          value={filters.salesStatus}
          onChange={(e) => handleSalesStatusChange(e.target.value)}
          className={inputClass}
        >
          {SALES_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="slab-origin" className={labelClass}>
          Slab origin
        </label>
        <select
          id="slab-origin"
          value={filters.slabOrigin}
          onChange={(e) => handleSlabOriginChange(e.target.value)}
          className={inputClass}
        >
          {SLAB_ORIGIN_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="grading-company" className={labelClass}>
          Grader
        </label>
        <select
          id="grading-company"
          value={filters.gradingCompany}
          onChange={(e) => handleGradingCompanyChange(e.target.value)}
          className={inputClass}
        >
          {GRADING_COMPANY_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="grade" className={labelClass}>
          Grade
        </label>
        <select
          id="grade"
          value={filters.grade}
          onChange={(e) => handleGradeChange(e.target.value)}
          className={inputClass}
        >
          {GRADE_OPTIONS.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="grading-order" className={labelClass}>
          Grading order
        </label>
        <select
          id="grading-order"
          value={filters.gradingOrderId}
          onChange={(e) => handleGradingOrderChange(e.target.value)}
          className={inputClass}
        >
          <option value="">All</option>
          {gradingOrders.map((go) => (
            <option key={go.id} value={String(go.id)}>
              {go.order_number ?? go.id} ({go.slabs_total} slabs)
            </option>
          ))}
        </select>
      </div>
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClear}
          className="rounded-md border border-base-border bg-base-elevated px-3 py-1.5 text-xs text-slate-400 hover:bg-base-elevated/80 hover:text-slate-200"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
