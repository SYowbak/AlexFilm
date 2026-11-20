/**
 * Юніт-тести глобального identity gate.
 * Запуск: npm test (proxy-server)
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const { scoreCandidate, findBestMatches, extractYears, titleSimilarity, stripNoise, parseYear, compareAlias } = require('../matcher')

const ODYSSEY_2026 = { title: 'Одіссея', origTitle: 'The Odyssey', year: '2026' }

// ─── Рік ──────────────────────────────────────────────────────────────
test('extractYears витягує всі релевантні роки', () => {
  assert.deepEqual(extractYears('Одіссея 2016 BDRip'), [2016])
  assert.deepEqual(extractYears('Movie (2001) / 2026'), [2001, 2026])
  assert.deepEqual(extractYears('без року'), [])
  assert.deepEqual(extractYears('рік 1685 — занадто далеко'), [])
})

// ─── Жорстка відмова за рік ───────────────────────────────────────────
test('чужий фільм з іншим роком відхиляється (Одіссея 2016 ≠ 2026)', () => {
  const v = scoreCandidate(
    { title: 'Одіссея', yearText: '2016', href: '/films/4793-odisseja.html' },
    ODYSSEY_2026
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'year_mismatch')
  assert.equal(v.score, 0)
})

test('точний рік проходить identity gate', () => {
  const v = scoreCandidate(
    { title: 'Одіссея', yearText: '2026', href: '/films/odyssey-2026.html' },
    ODYSSEY_2026
  )
  assert.equal(v.ok, true)
  assert.equal(v.verdict, 'exact')
  assert.ok(v.score >= 90)
})

test('різниця року ±1 допускається (фестивальний реліз)', () => {
  const v = scoreCandidate({ title: 'Одіссея', yearText: '2025' }, ODYSSEY_2026)
  assert.equal(v.ok, true)
  assert.equal(v.verdict, 'off_by_one')
})

test('різниця року > 1 відхиляється навіть при ідеальній назві', () => {
  const v = scoreCandidate({ title: 'Одіссея', yearText: '2011' }, ODYSSEY_2026)
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'year_mismatch')
})

// ─── Збіг назви ───────────────────────────────────────────────────────
test('схожі, але різні назви відхиляються', () => {
  // без року — відхилення має спрацювати саме на збігу назви
  const v = scoreCandidate({ title: 'Одіссея капітана Блада', yearText: '' }, ODYSSEY_2026)
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('різний рік і схожа назва — теж жорстка відмова', () => {
  const v = scoreCandidate({ title: 'Одіссея капітана Блада', yearText: '2011' }, ODYSSEY_2026)
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'year_mismatch')
})

test('"2001: Космічна Одіссея" не проходить для "Одіссея"', () => {
  const v = scoreCandidate({ title: '2001: Космічна Одіссея', yearText: '2001' }, ODYSSEY_2026)
  assert.equal(v.ok, false)
})

test('оригінальна назва збігається з українською локалізацією', () => {
  const v = scoreCandidate({ title: 'Одіссея / The Odyssey', yearText: '' }, ODYSSEY_2026)
  assert.equal(v.ok, true)
  assert.equal(v.bestSim, 1)
})

test('маркери якості не впливають на схожість назви', () => {
  assert.equal(titleSimilarity('Одіссея 1080p BDRip', 'Одіссея'), 1)
  assert.equal(titleSimilarity('The Matrix 1999', 'The Matrix'), 1)
})

test('різні назви з різних фільмів не проходять', () => {
  const v = scoreCandidate(
    { title: 'Людина-павук: Абсолютно новий день', yearText: '2026' },
    ODYSSEY_2026
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('назва, яка сама є роком, не зникає при нормалізації', () => {
  assert.equal(stripNoise('1917'), '1917')
  assert.equal(titleSimilarity('1917', '1917'), 1)
  const v = scoreCandidate({ title: '1917', yearText: '2019' }, { title: '1917', origTitle: '1917', year: '2019' })
  assert.equal(v.ok, true)
  assert.equal(v.verdict, 'exact')
})

test('числова назва зберігається', () => {
  assert.equal(titleSimilarity('1+1', '1+1'), 1)
  assert.equal(stripNoise('1+1'), '1+1')
})

// ─── Однослівні назви: fuzzy заборонено ───────────────────────────
// Регресія: стара перевірка `c2.includes(c1)` пропускала різні фільми
// з одним і тим самим роком — рік їх не розрізнить.
test('"Alien" не проходить для "Aliens" (обидва 1986)', () => {
  const v = scoreCandidate(
    { title: 'Aliens', yearText: '1986' },
    { title: 'Alien', origTitle: 'Alien', year: '1986' }
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('"Man" не проходить для "Woman"', () => {
  const v = scoreCandidate(
    { title: 'Woman', yearText: '' },
    { title: 'Man', origTitle: 'Man', year: '2026' }
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('"He" не проходить для "Her"', () => {
  const v = scoreCandidate(
    { title: 'Her', yearText: '' },
    { title: 'He', origTitle: 'He', year: '2026' }
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('однослівна назва з суфіксом відхиляється ("Хакер" ≠ "Хакери")', () => {
  const v = scoreCandidate(
    { title: 'Хакери', yearText: '1995' },
    { title: 'Хакер', origTitle: 'Hackers', year: '1995' }
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('багатослівна назва з відмінністю у формі слова проходить', () => {
  const v = scoreCandidate(
    { title: 'Дюна: Частина друга', yearText: '2024' },
    { title: 'Дюна: Частина другий', origTitle: 'Dune: Part Two', year: '2024' }
  )
  assert.equal(v.ok, true)
  assert.equal(v.bestKind, 'fuzzy')
  assert.ok(v.bestSim >= 0.82)
})

// ─── Рік не береться з назви ───────────────────────────────────────
test('рік у назві НЕ використовується як рік релізу', () => {
  // «2001: Космічна Одіссея» — це фільм 1968, а не 2001
  const v = scoreCandidate(
    { title: '2001: Космічна Одіссея', yearText: '' },
    { title: 'Одіссея', origTitle: 'The Odyssey', year: '2026' }
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
  assert.deepEqual(v.candYears, [])
})

test('структурований рік з картки береться', () => {
  const v = scoreCandidate(
    { title: 'Одіссея', yearText: '2026' },
    { title: 'Одіссея', origTitle: 'The Odyssey', year: '2026' }
  )
  assert.deepEqual(v.candYears, [2026])
  assert.equal(v.verdict, 'exact')
})

// ─── Аліаси ────────────────────────────────────────────────────────
test('alias «Одіссея / The Odyssey» збігається з обома назвами цілі', () => {
  const v = scoreCandidate(
    { title: 'Одіссея / The Odyssey', yearText: '' },
    { title: 'Одіссея', origTitle: 'The Odyssey', year: '2026' }
  )
  assert.equal(v.ok, true)
  assert.equal(v.bestSim, 1)
})

test('alias «Тихе місце 1 / A Quiet Place» збігається з оригінальною назвою', () => {
  const v = scoreCandidate(
    { title: 'Тихе місце 1 / A Quiet Place', yearText: '' },
    { title: 'Мовчазний пацієнт', origTitle: 'A Quiet Place', year: '2018' }
  )
  assert.equal(v.ok, true)
})

test('alias «Воно 1 / IT» збігається з оригінальною назвою', () => {
  const v = scoreCandidate(
    { title: 'Воно 1 / IT', yearText: '' },
    { title: 'Воно', origTitle: 'It', year: '2017' }
  )
  assert.equal(v.ok, true)
})

// ─── Підпис картки ≠ назва фільму ───────────────────────────────────
test('subtitle кандидата НЕ є title-аліасом', () => {
  // Регресія (HIGH): subtitle додавався до аліасів назви, тож будь-який
  // довільний підпис картки («2024 • BDRip», «The Odyssey») міг підкласти
  // назву іншого фільму й пройти identity gate.
  const v = scoreCandidate(
    { title: 'Definitely Another Film', subtitle: 'The Odyssey', yearText: '2026' },
    ODYSSEY_2026
  )
  assert.equal(v.ok, false)
  assert.equal(v.reason, 'title_mismatch')
})

test('структурований origTitle кандидата збігається з оригінальною назвою', () => {
  // origTitle — це справжня оригінальна назва релізу (напр. з Eneyida-підпису
  // «2024 • Dune: Prophecy»), тому вона ЛЕГІТИМНИЙ аліас.
  const v = scoreCandidate(
    { title: 'Дюна 2 частина', origTitle: 'Dune: Part Two', yearText: '2024' },
    { title: 'Дюна 2', origTitle: 'Dune: Part Two', year: '2024' }
  )
  assert.equal(v.ok, true)
})

test('oname кандидата (UASerials .th-title-oname) збігається з оригінальною назвою', () => {
  const v = scoreCandidate(
    { title: 'Матриця', oname: 'The Matrix', yearText: '' },
    { title: 'Матриця', origTitle: 'The Matrix', year: '1999' }
  )
  assert.equal(v.ok, true)
})

// ─── compareAlias ──────────────────────────────────────────────────
test('compareAlias повертає kind exact для однакових назв', () => {
  const r = compareAlias('Одіссея', 'Одіссея')
  assert.equal(r.kind, 'exact')
  assert.equal(r.sim, 1)
})

test('compareAlias повертає single_token_diff для різних однослівних назв', () => {
  const r = compareAlias('Aliens', 'Alien')
  assert.equal(r.kind, 'single_token_diff')
  assert.equal(r.sim, 0)
})

// ─── parseYear ─────────────────────────────────────────────────────
test('parseYear приймає коректний рік і відкидає сміття', () => {
  assert.equal(parseYear('2026'), 2026)
  assert.equal(parseYear(2019), 2019)
  assert.equal(parseYear('abc'), null)
  assert.equal(parseYear(''), null)
  assert.equal(parseYear(null), null)
  assert.equal(parseYear('1850'), null)
})

// ─── findBestMatches ──────────────────────────────────────────────────
test('findBestMatches повертає лише кандидатів, що пройшли gate', () => {
  const candidates = [
    { title: '2001: Космічна Одіссея', yearText: '', href: '/films/5820.html' },
    { title: 'Одіссея', yearText: '', href: '/films/4793.html' },
    { title: 'Одіссея капітана Блада', yearText: '', href: '/films/blad.html' }
  ]
  const matches = findBestMatches(candidates, ODYSSEY_2026, 5)
  assert.equal(matches.length, 1)
  assert.equal(matches[0].candidate.title, 'Одіссея')
})

test('findBestMatches повертає кілька кандидатів для post-fetch перевірки', () => {
  const candidates = [
    { title: 'Одіссея / The Odyssey', yearText: '', href: '/films/a.html' },
    { title: 'Одіссея / The Odyssey', yearText: '', href: '/films/b.html' }
  ]
  const matches = findBestMatches(candidates, ODYSSEY_2026, 4)
  assert.equal(matches.length, 2)
  assert.ok(matches[0].score >= matches[1].score)
})

test('порожній список кандидатів не ламає matcher', () => {
  assert.deepEqual(findBestMatches([], ODYSSEY_2026, 3), [])
  assert.deepEqual(findBestMatches(null, ODYSSEY_2026, 3), [])
})
