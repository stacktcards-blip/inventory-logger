export type RawCardBulkEditFieldKey =
  | 'set_abbr'
  | 'num'
  | 'lang'
  | 'currency'
  | 'purchase_price'
  | 'exchange_rate'
  | 'cond'
  | 'seller'
  | 'purchase_date'
  | 'note'
  | 'is_1ed'
  | 'is_rev'

export type RawCardBulkEditInputType = 'text' | 'number' | 'date' | 'boolean'

export type RawCardBulkEditField = {
  key: RawCardBulkEditFieldKey
  label: string
  inputType: RawCardBulkEditInputType
}

export type RawCardBulkEditPayload = {
  payload: Partial<Record<RawCardBulkEditFieldKey, string | number | boolean | null>>
  displayValue: string
}

const RAW_CARD_BULK_EDIT_FIELDS: RawCardBulkEditField[] = [
  { key: 'set_abbr', label: 'Set', inputType: 'text' },
  { key: 'num', label: 'Number', inputType: 'text' },
  { key: 'lang', label: 'Language', inputType: 'text' },
  { key: 'currency', label: 'Currency', inputType: 'text' },
  { key: 'purchase_price', label: 'Purchase price', inputType: 'number' },
  { key: 'exchange_rate', label: 'Exchange rate', inputType: 'number' },
  { key: 'cond', label: 'Condition', inputType: 'text' },
  { key: 'seller', label: 'Seller', inputType: 'text' },
  { key: 'purchase_date', label: 'Purchase date', inputType: 'date' },
  { key: 'note', label: 'Note', inputType: 'text' },
  { key: 'is_1ed', label: '1st edition', inputType: 'boolean' },
  { key: 'is_rev', label: 'Reverse holo', inputType: 'boolean' },
]

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export function listRawCardBulkEditFields(): RawCardBulkEditField[] {
  return RAW_CARD_BULK_EDIT_FIELDS
}

export function getRawCardBulkEditField(fieldKey: string): RawCardBulkEditField | undefined {
  return RAW_CARD_BULK_EDIT_FIELDS.find((field) => field.key === fieldKey)
}

export function buildRawCardBulkEditPayload(
  fieldKey: string,
  rawValue: string
): RawCardBulkEditPayload {
  const field = getRawCardBulkEditField(fieldKey)
  if (!field) throw new Error(`${fieldKey} is not bulk editable`)

  const trimmed = rawValue.trim()

  if (field.inputType === 'number') {
    if (trimmed === '') {
      return { payload: { [field.key]: null }, displayValue: 'blank' }
    }
    const parsed = Number(trimmed)
    if (!Number.isFinite(parsed)) {
      throw new Error(`${field.label} must be a valid number`)
    }
    return { payload: { [field.key]: parsed }, displayValue: trimmed }
  }

  if (field.inputType === 'date') {
    if (trimmed === '') {
      return { payload: { [field.key]: null }, displayValue: 'blank' }
    }
    if (!DATE_RE.test(trimmed)) {
      throw new Error(`${field.label} must use YYYY-MM-DD`)
    }
    return { payload: { [field.key]: trimmed }, displayValue: trimmed }
  }

  if (field.inputType === 'boolean') {
    if (trimmed !== 'true' && trimmed !== 'false') {
      throw new Error(`${field.label} must be Yes or No`)
    }
    const value = trimmed === 'true'
    return { payload: { [field.key]: value }, displayValue: value ? 'Yes' : 'No' }
  }

  return {
    payload: { [field.key]: trimmed === '' ? null : trimmed },
    displayValue: trimmed === '' ? 'blank' : trimmed,
  }
}
