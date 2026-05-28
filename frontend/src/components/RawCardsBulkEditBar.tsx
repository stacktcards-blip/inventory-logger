import { useMemo, useState } from 'react'
import {
  buildRawCardBulkEditPayload,
  getRawCardBulkEditField,
  listRawCardBulkEditFields,
  type RawCardBulkEditFieldKey,
} from '../lib/rawCardBulkEdit'

type RawCardsBulkEditBarProps = {
  selectedCount: number
  applying: boolean
  onApply: (payload: Record<string, unknown>, summary: string) => Promise<void>
  onClearSelection: () => void
}

export function RawCardsBulkEditBar({
  selectedCount,
  applying,
  onApply,
  onClearSelection,
}: RawCardsBulkEditBarProps) {
  const fields = useMemo(() => listRawCardBulkEditFields(), [])
  const [fieldKey, setFieldKey] = useState<RawCardBulkEditFieldKey>('seller')
  const [value, setValue] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  const field = getRawCardBulkEditField(fieldKey)

  const builtPayload = useMemo(() => {
    try {
      return buildRawCardBulkEditPayload(fieldKey, value)
    } catch (e) {
      return null
    }
  }, [fieldKey, value])

  const preview = builtPayload && field
    ? `Apply ${field.label} = ${builtPayload.displayValue} to ${selectedCount} selected raw cards`
    : `${selectedCount} selected raw cards`

  const handleApply = async () => {
    try {
      const result = buildRawCardBulkEditPayload(fieldKey, value)
      setValidationError(null)
      await onApply(result.payload, preview)
    } catch (e) {
      setValidationError(e instanceof Error ? e.message : 'Invalid bulk edit value')
    }
  }

  return (
    <div className="rounded-lg border border-blue-800/50 bg-gradient-to-r from-blue-950/70 to-slate-950/70 p-3 shadow-lg shadow-black/20">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <div>
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-blue-300">
              Bulk edit
            </div>
            <div className="text-xs text-slate-300">{selectedCount} selected</div>
          </div>

          <label className="block">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">
              Field
            </span>
            <select
              value={fieldKey}
              onChange={(e) => {
                setFieldKey(e.target.value as RawCardBulkEditFieldKey)
                setValue('')
                setValidationError(null)
              }}
              className="min-w-[10rem] rounded-md border border-base-border bg-base-elevated px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {fields.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-slate-500">
              Value
            </span>
            {field?.inputType === 'boolean' ? (
              <select
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setValidationError(null)
                }}
                className="min-w-[8rem] rounded-md border border-base-border bg-base-elevated px-2 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Choose...</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <input
                type={field?.inputType === 'date' ? 'date' : 'text'}
                inputMode={field?.inputType === 'number' ? 'decimal' : undefined}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value)
                  setValidationError(null)
                }}
                placeholder="Blank clears the field"
                className="min-w-[13rem] rounded-md border border-base-border bg-base-elevated px-2 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            )}
          </label>

          <div className="max-w-lg text-xs text-slate-400">{preview}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleApply}
            disabled={applying || !builtPayload}
            className="rounded-md border border-blue-600/50 bg-blue-600/20 px-3 py-1.5 text-xs font-medium text-blue-200 transition-colors hover:bg-blue-600/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {applying ? 'Applying...' : 'Apply edit'}
          </button>
          <button
            type="button"
            onClick={onClearSelection}
            disabled={applying}
            className="text-xs text-slate-400 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Clear selection
          </button>
        </div>
      </div>
      {validationError && (
        <div className="mt-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
          {validationError}
        </div>
      )}
    </div>
  )
}
