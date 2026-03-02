/**
 * Format grading company + grade as a combined display string (e.g. "PSA 10").
 */
export function formatGrade(
  company: string | null | undefined,
  grade: string | null | undefined
): string {
  const parts = [company, grade].filter(Boolean)
  return parts.length ? parts.join(' ') : '—'
}
