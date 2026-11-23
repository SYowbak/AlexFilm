const CYRILLIC = /[\u0400-\u04FF]/
const UA_LETTERS = /[іїєґІЇЄҐ]/

export const hasCyrillic = (value) => CYRILLIC.test(value || '')
export const hasUkrainianLetters = (value) => UA_LETTERS.test(value || '')

// uk-UA-локалізація TMDB — канонічна. Альтернативи беруться лише тоді,
// коли її немає, і лише кириличні (не транслітерації типу "Biytsivsʹkyy klub").
export function resolveUkrainianTitle(localized, ...candidates) {
  if (hasUkrainianLetters(localized)) return localized
  for (const candidate of candidates) {
    if (!candidate?.trim() || !hasCyrillic(candidate)) continue
    if (hasUkrainianLetters(candidate) || !hasCyrillic(localized)) return candidate
  }
  return localized
}
