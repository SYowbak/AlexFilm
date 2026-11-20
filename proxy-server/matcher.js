/**
 * Глобальний строгий матчер ідентичності фільмів для UA-стрімінг джерел.
 *
 * Правила (навмисно жорсткі — краще «не знайдено», ніж показати чужий фільм):
 *
 *  1. Назва приймається лише як:
 *     - `exact`   — повний збіг нормалізованої назви (або її аліаса);
 *     - `fuzzy`   — Levenshtein-збіг ≥ 0.82 для НАЗВ ІЗ КІЛЬКОХ СЛІВ
 *                   (напр. «Дюна: Частина другий» ≈ «Дюна: Частина друга»).
 *     Для ОДНОСЛІВНИХ назв fuzzy заборонено: інакше «Alien» проходить
 *     для «Aliens», «Man» для «Woman», «Her» для «He» — а це різні фільми
 *     з одним і тим самим роком, і рік їх не розрізнить.
 *
 *  2. Рік релізу береться ТІЛЬКИ зі структурованого поля `yearText`
 *     (рік виходу з картки/сторінки), НІКОЛИ з назви чи URL-слагу:
 *     «2001: Космічна Одіссея» — це 1968, а «1917» — це 2019.
 *
 *  3. Різниця року більше ніж ±1 — ЖОРСТКА відмова (не штраф до score).
 *
 *  4. Фінальна (авторитетна) перевірка року виконується на сторінці фільму
 *     в server.js — і вона «fail-closed»: якщо рік на сторінці не вдалося
 *     встановити, кандидат відхиляється.
 */

const NOISE_TOKENS = /\b(2160p|1080p|720p|480p|360p|4k|uhd|bdrip|bdremux|bluray|blu-ray|remux|webdl|web-dl|webrip|hdtv|hdrip|dvdrip|camrip|telesync|hdts|screener|dvdscr|ukr|ukrainian|fre|french|eng|english|dub|dubbed|multi|sub|subbed|proper|repack|hurtom)\b/gi

// Мінімальна схожість, щоб кандидат взагалі дійшов до post-fetch перевірки
const MIN_TITLE_SIMILARITY = 0.55
// Поріг нечіткого (Levenshtein) збігу для багатослівних назв
const STRICT_FUZZY_MIN = 0.82
// Допустиме відхилення року (фестивальний реліз vs широкий реліз)
const YEAR_TOLERANCE = 1

function cleanText(text) {
  if (!text) return ''
  return String(text)
    .toLowerCase()
    .replace(/[«»""''„“”]/g, '')
    .replace(/[:.,!?;()\[\]\-\/\\|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripNoise(text) {
  if (!text) return ''
  const base = cleanText(text)

  // Назва може САМА бути роком («1917», «2012») — тоді її не можна викидати,
  // інакше similarity стає 0 і коректний фільм відкидається.
  const withoutYears = base.replace(/\b(19|20)\d{2}\b/g, ' ').replace(/\s+/g, ' ').trim()
  if (!withoutYears) return base

  const withoutNoise = withoutYears.replace(NOISE_TOKENS, ' ').replace(/\s+/g, ' ').trim()
  return withoutNoise || base
}

function extractYears(...parts) {
  const found = new Set()
  for (const part of parts) {
    if (!part) continue
    const s = String(part)
    const re = /\b(19[3-9]\d|20[0-4]\d)\b/g
    let m
    while ((m = re.exec(s)) !== null) {
      const y = parseInt(m[1], 10)
      if (y >= 1930 && y <= 2049) found.add(y)
    }
  }
  return [...found]
}

/**
 * Розбиває назву на аліаси. Сайти часто пишуть «Одіссея / The Odyssey»,
 * «Воно / Stephen King's It» — кожен аліас треба порівнювати окремо.
 */
function splitAliases(text) {
  if (!text) return []
  return String(text)
    .split(/\s*[|/]\s*/)
    .map(s => s.trim())
    .filter(Boolean)
}

/**
 * Токени, які несуть зміст (одно-літерні службові слова — «в», «у» — ігноруємо).
 */
function significantTokens(text) {
  return stripNoise(text)
    .split(' ')
    .filter(w => w.length > 1 || /\d/.test(w))
}

function levenshteinDistance(s1, s2) {
  const m = s1.length
  const n = s2.length
  if (m === 0) return n
  if (n === 0) return m

  // Ковзначий одномірний масив — O(n) пам'яті замість O(m*n)
  let prev = new Array(n + 1)
  let curr = new Array(n + 1)
  for (let j = 0; j <= n; j++) prev[j] = j

  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[n]
}

/**
 * Прибирає керуючі символи з користувацького/зовнішнього вводу перед логом
 * (захист від log forging / ANSI-послідовностей у терміналі).
 */
function sanitizeLog(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, 120)
}

/**
 * Порівнює один аліас кандидата з одним аліасом цілі.
 * kind: exact | fuzzy | single_token_diff | empty
 */
function compareAlias(candText, targetText) {
  const c = stripNoise(candText)
  const t = stripNoise(targetText)
  if (!c || !t) return { sim: 0, kind: 'empty' }
  if (c === t) return { sim: 1, kind: 'exact' }

  const cTokens = c.split(' ').filter(Boolean)
  const tTokens = t.split(' ').filter(Boolean)

  // Fuzzy дозволено ЛИШЕ для багатослівних назв.
  // Якщо хоч ОДНА сторона має менше ніж 2 токени — fuzzy заборонено:
  //   «Alien»/«Aliens», «Man»/«Woman», «Her»/«He» — різні фільми;
  //   «Interstellar» vs «Interstellar I» — теж різні релізи.
  // Рік у них може збігатися, тому такий збіг небезпечний.
  if (cTokens.length < 2 || tTokens.length < 2) {
    return { sim: 0, kind: 'single_token_diff' }
  }

  const cSig = significantTokens(c)
  const tSig = significantTokens(t)
  let common = 0
  const tSet = new Set(tSig)
  for (const w of cSig) if (tSet.has(w)) common++

  const maxLen = Math.max(c.length, t.length)
  const lev = 1 - (levenshteinDistance(c, t) / maxLen)

  // Нечіткий збіг — лише якщо є спільний змістовний токен
  // (інакше це просто випадкові слова схожої довжини).
  if (common === 0 && lev < 0.92) return { sim: lev, kind: 'fuzzy_no_common' }

  return { sim: lev, kind: 'fuzzy' }
}

/**
 * Схожість двох назв (0..1). Публічна функція — використовується тестами.
 */
function titleSimilarity(a, b) {
  return compareAlias(a, b).sim
}

function scoreCandidate(candidate, target) {
  // Аліаси кандидата — ТІЛЬКИ канонічні назви релізу:
  //   title    — назва на сайті (українська/місцева);
  //   origTitle — оригінальна назва (структурований «year • Original Title»);
  //   oname    — оригінальна назва з картки UASerials (.th-title-oname).
  //
  // ВАЖЛИВО: candidate.subtitle НЕ використовується як аліас назви.
  // Subtitle — довільний підпис картки («2024 • BDRip», «1080p WEB-DL»),
  // а не канонічна назва: додавання його дозволяло б підкласти назву
  // будь-якого іншого фільму й пройти identity gate.
  const candAliases = splitAliases([
    candidate.title,
    candidate.origTitle,
    candidate.oname,
  ].filter(Boolean).join(' / '))

  const targetAliases = splitAliases([target.title, target.origTitle].filter(Boolean).join(' / '))

  let bestSim = 0
  let bestPair = ''
  let bestKind = 'none'
  for (const ca of candAliases) {
    for (const ta of targetAliases) {
      const { sim, kind } = compareAlias(ca, ta)
      if (sim > bestSim) {
        bestSim = sim
        bestKind = kind
        bestPair = `${ca} ~ ${ta}`
      }
    }
  }

  const targetYr = Number.isInteger(target.year) ? target.year : parseYear(target.year)
  // Рік кандидата — ТІЛЬКИ зі структурованого поля yearText.
  // Назву та URL-слаг НЕ використовуємо: «2001: Космічна Одіссея» — це 1968.
  const candYears = extractYears(candidate.yearText)

  let yearScore = 0.3
  let yearVerdict = 'unknown'

  if (targetYr) {
    if (candYears.length > 0) {
      const exact = candYears.includes(targetYr)
      const near = candYears.some(y => Math.abs(y - targetYr) <= YEAR_TOLERANCE)
      if (exact) {
        yearScore = 1.0
        yearVerdict = 'exact'
      } else if (near) {
        yearScore = 0.6
        yearVerdict = 'off_by_one'
      } else {
        // ЖОРСТКА відмова — різні фільми з однаковою назвою
        return { ok: false, score: 0, reason: 'year_mismatch', bestSim, bestPair, bestKind, targetYr, candYears, verdict: yearVerdict }
      }
    }
    // Якщо структурованого року немає — не відмовляємо тут,
    // перевіримо авторитетно на сторінці фільму (fail-closed).
  } else {
    yearScore = 0.5
    yearVerdict = 'no_target_year'
  }

  // ЖОРСТКИЙ title gate
  const titleOk =
    bestKind === 'exact' ||
    (bestKind === 'fuzzy' && bestSim >= STRICT_FUZZY_MIN)

  if (!titleOk || bestSim < MIN_TITLE_SIMILARITY) {
    return { ok: false, score: 0, reason: 'title_mismatch', bestSim, bestPair, bestKind, targetYr, candYears, verdict: yearVerdict }
  }

  const score = Math.round(bestSim * 70 + yearScore * 30)
  return { ok: true, score, reason: 'match', bestSim, bestPair, bestKind, targetYr, candYears, verdict: yearVerdict }
}

/**
 * Парсить рік з довільного значення — повертає ціле число або null.
 */
function parseYear(value) {
  if (value === null || value === undefined || value === '') return null
  const m = String(value).match(/\b(19[3-9]\d|20[0-4]\d)\b/)
  if (!m) return null
  return parseInt(m[1], 10)
}

/**
 * Повертає топ-N кандидатів що пройшли строгий identity gate.
 * Використовується в server.js для ітерації та post-fetch верифікації року.
 */
function findBestMatches(candidates, target, limit = 3) {
  if (!candidates || !candidates.length) return []
  const results = []
  for (const c of candidates) {
    const verdict = scoreCandidate(c, target)
    if (verdict.ok) {
      results.push({ candidate: c, ...verdict })
    }
  }
  results.sort((a, b) => b.score - a.score)
  console.log(`[Matching] Target: "${sanitizeLog(target.title)}" (${target.year || '?'}) / orig "${sanitizeLog(target.origTitle || '')}" — ${candidates.length} raw, ${results.length} passed identity gate`)
  results.slice(0, 5).forEach(r => {
    console.log(`  -> Score: ${r.score} | years: [${r.candYears}] | "${sanitizeLog(r.candidate.title)}" ${sanitizeLog(r.candidate.yearText || '')} | sim=${r.bestSim.toFixed(2)} | ${r.bestKind} | ${r.verdict}`)
  })
  return results.slice(0, limit)
}

module.exports = {
  cleanText,
  stripNoise,
  extractYears,
  splitAliases,
  significantTokens,
  titleSimilarity,
  compareAlias,
  scoreCandidate,
  parseYear,
  findBestMatches,
  sanitizeLog,
  MIN_TITLE_SIMILARITY,
  STRICT_FUZZY_MIN,
  YEAR_TOLERANCE,
}
