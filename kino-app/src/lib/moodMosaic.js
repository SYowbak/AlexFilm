// Підбираємо кількість колонок, яка ділить кількість настроїв без залишку,
// щоб усі кнопки були однакової ширини й жоден рядок не мав порожніх клітин.
export function columnsForEvenRows(total, width, gap, isMobile = false, minChip = 150, minComfort = 130) {
  if (isMobile) return Math.min(2, total)
  if (!width || total < 2) return 2

  const ideal = Math.max(2, Math.floor((width + gap) / (minChip + gap)))
  const candidates = []
  for (let columns = 2; columns <= Math.min(total, ideal + 1); columns++) {
    if (total % columns !== 0) continue
    const chipWidth = (width - (columns - 1) * gap) / columns
    if (chipWidth < minComfort) continue
    candidates.push(columns)
  }
  if (!candidates.length) return ideal
  return candidates.sort((a, b) => Math.abs(a - ideal) - Math.abs(b - ideal))[0]
}
