export function findNextSalesPackingScanKey(rowKeys: string[], currentKey: string): string | null {
  const currentIndex = rowKeys.indexOf(currentKey)
  const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1
  return rowKeys[nextIndex] ?? null
}
