const SYDNEY_TZ = 'Australia/Sydney'

/**
 * Format an ISO date string for display in Sydney timezone.
 * Returns '—' if the input is null/undefined or invalid.
 */
export function formatDateSydney(
  isoDate: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!isoDate) return '—'
  try {
    const date = new Date(isoDate)
    if (Number.isNaN(date.getTime())) return isoDate
    return date.toLocaleString('en-AU', {
      timeZone: SYDNEY_TZ,
      dateStyle: 'short',
      timeStyle: 'short',
      ...options,
    })
  } catch {
    return isoDate
  }
}
