export function columnsForWidth(width, gap, isMobile = false, minChip = 150) {
  if (isMobile) return 2
  if (!width) return 1
  return Math.max(1, Math.floor((width + gap) / (minChip + gap)))
}

// Останній рядок заповнюємо повністю: його елементи отримують span
// floor(columns / remainder) або +1 для перших `extra` плиток.
export function computeMoodSpans(total, columns) {
  const spans = new Array(total).fill(1)
  if (!columns || columns < 1 || total <= columns) return spans
  const remainder = total % columns
  if (remainder === 0) return spans

  const base = Math.floor(columns / remainder)
  const extra = columns % remainder
  const firstOfLastRow = total - remainder
  for (let i = 0; i < remainder; i++) {
    spans[firstOfLastRow + i] = base + (i < extra ? 1 : 0)
  }
  return spans
}
