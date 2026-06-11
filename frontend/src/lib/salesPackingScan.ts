export function findNextSalesPackingScanKey(rowKeys: string[], currentKey: string): string | null {
  const currentIndex = rowKeys.indexOf(currentKey)
  const nextIndex = currentIndex === -1 ? 0 : currentIndex + 1
  return rowKeys[nextIndex] ?? null
}

export function findPreviousSalesPackingScanKey(rowKeys: string[], currentKey: string): string | null {
  const currentIndex = rowKeys.indexOf(currentKey)
  if (currentIndex === -1) {
    return rowKeys[rowKeys.length - 1] ?? null
  }
  if (currentIndex <= 0) return null
  return rowKeys[currentIndex - 1] ?? null
}
