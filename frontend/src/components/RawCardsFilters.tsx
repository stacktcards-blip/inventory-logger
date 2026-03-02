import { useState, useEffect } from 'react'
import type { RawCardsFilters as RawCardsFiltersType } from '../types/rawCards'

type RawCardsFiltersProps = {
  filters: RawCardsFiltersType
  onFiltersChange: (filters: RawCardsFiltersType) => void
}

const SEARCH_DEBOUNCE_MS = 300

export function RawCardsFilters({ filters, onFiltersChange }: RawCardsFiltersProps) {
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

  const handleSetAbbrChange = (value: string) => {
    onFiltersChange({ ...filters, setAbbr: value })
  }

  const handleNumChange = (value: string) => {
    onFiltersChange({ ...filters, num: value })
  }

  const handleLangChange = (value: string) => {
    onFiltersChange({ ...filters, lang: value })
  }

  const handleSellerChange = (value: string) => {
    onFiltersChange({ ...filters, seller: value })
  }

  const handleDateFromChange = (value: string) => {
    onFiltersChange({ ...filters, dateFrom: value })
  }

  const handleDateToChange = (value: string) => {
    onFiltersChange({ ...filters, dateTo: value })
  }

  const handleClear = () => {
    setSearchInput('')
    onFiltersChange({
      setAbbr: '',
      num: '',
      lang: '',
      seller: '',
      dateFrom: '',
      dateTo: '',
      searchText: '',
      sortBy: 'purchase_date',
      sortDir: 'desc',
    })
  }

  const hasActiveFilters =
    filters.setAbbr ||
    filters.num ||
    filters.lang ||
    filters.seller ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.searchText

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
          placeholder="Card name, set, num, seller..."
          className={`w-56 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="set-abbr" className={labelClass}>
          Set abbrev
        </label>
        <input
          id="set-abbr"
          type="text"
          value={filters.setAbbr}
          onChange={(e) => handleSetAbbrChange(e.target.value)}
          placeholder="e.g. 1ED"
          className={`w-24 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="num" className={labelClass}>
          Card num
        </label>
        <input
          id="num"
          type="text"
          value={filters.num}
          onChange={(e) => handleNumChange(e.target.value)}
          placeholder="e.g. 025"
          className={`w-24 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="lang" className={labelClass}>
          Lang
        </label>
        <input
          id="lang"
          type="text"
          value={filters.lang}
          onChange={(e) => handleLangChange(e.target.value)}
          placeholder="e.g. ENG"
          className={`w-20 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="seller" className={labelClass}>
          Seller
        </label>
        <input
          id="seller"
          type="text"
          value={filters.seller}
          onChange={(e) => handleSellerChange(e.target.value)}
          placeholder="Partial match"
          className={`w-28 ${inputClass}`}
        />
      </div>
      <div>
        <label htmlFor="date-from" className={labelClass}>
          Date from
        </label>
        <input
          id="date-from"
          type="date"
          value={filters.dateFrom}
          onChange={(e) => handleDateFromChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor="date-to" className={labelClass}>
          Date to
        </label>
        <input
          id="date-to"
          type="date"
          value={filters.dateTo}
          onChange={(e) => handleDateToChange(e.target.value)}
          className={inputClass}
        />
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
