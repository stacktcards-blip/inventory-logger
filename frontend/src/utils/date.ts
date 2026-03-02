const SYDNEY_TZ = 'Australia/Sydney'

/** Returns today's date in Sydney timezone as YYYY-MM-DD */
export function getTodaySydney(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: SYDNEY_TZ })
}
