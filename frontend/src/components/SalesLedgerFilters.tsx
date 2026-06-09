import type { Dispatch, SetStateAction } from 'react'

type LedgerFilters = {
  startDate: string
  endDate: string
  matchStatus: string
  fulfillmentStatus: string
  search: string
}

type Props = {
  value: LedgerFilters
  onChange: Dispatch<SetStateAction<LedgerFilters>>
}

const matchOptions = [
  { value: '', label: 'All matches' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'MATCHED', label: 'Matched' },
  { value: 'MANUAL_REVIEW', label: 'Needs review' },
]

const fulfillmentOptions = [
  { value: '', label: 'All fulfillment' },
  { value: 'NOT_STARTED', label: 'Awaiting postage' },
  { value: 'IN_PROGRESS', label: 'Packing in progress' },
  { value: 'FULFILLED', label: 'Fulfilled' },
]

export function SalesLedgerFilters({ value, onChange }: Props) {
  const update = (patch: Partial<LedgerFilters>) => {
    onChange((current) => ({ ...current, ...patch }))
  }

  return (
    <div className="flex flex-wrap gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-4">
      <div className="flex flex-col text-xs text-slate-400">
        <label htmlFor="ledger-start">Start date</label>
        <input
          id="ledger-start"
          type="date"
          value={value.startDate}
          onChange={(event) => update({ startDate: event.target.value })}
          className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
        />
      </div>
      <div className="flex flex-col text-xs text-slate-400">
        <label htmlFor="ledger-end">End date</label>
        <input
          id="ledger-end"
          type="date"
          value={value.endDate}
          onChange={(event) => update({ endDate: event.target.value })}
          className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
        />
      </div>
      <div className="flex flex-col text-xs text-slate-400">
        <label htmlFor="ledger-match">Match status</label>
        <select
          id="ledger-match"
          value={value.matchStatus}
          onChange={(event) => update({ matchStatus: event.target.value })}
          className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
        >
          {matchOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col text-xs text-slate-400">
        <label htmlFor="ledger-fulfillment">Fulfillment</label>
        <select
          id="ledger-fulfillment"
          value={value.fulfillmentStatus}
          onChange={(event) => update({ fulfillmentStatus: event.target.value })}
          className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
        >
          {fulfillmentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col text-xs text-slate-400">
        <label htmlFor="ledger-search">Search title / cert / SKU</label>
        <input
          id="ledger-search"
          type="search"
          value={value.search}
          onChange={(event) => update({ search: event.target.value })}
          placeholder="e.g. Pikachu, 12345678, ENG"
          className="rounded-lg border border-slate-800 bg-slate-900/80 px-3 py-2 text-sm text-slate-100"
        />
      </div>
    </div>
  )
}
