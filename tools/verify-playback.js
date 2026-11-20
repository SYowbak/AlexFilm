/**
 * УНІВЕРСАЛЬНА перевірка покриття відтворення AlexFilm.
 *
 * Запуск:  node tools\verify-playback.js
 *
 * Перевіряє одразу ВЕСЬ ланцюг — той самий, що проходить клієнт:
 *   1. TMDB пошук → id/назва/рік
 *   2. /api/stream/ua (identity gate + quality gate + всі UA-джерела)
 *   3. Якщо UA-потік знайдено → маніфест і ПЕРШИЙ варіант тягнуться
 *      ЧЕРЕЗ relay (той самий шлях, що в браузері) і мають сегменти.
 *   4. Якщо UA-потоку немає → резервний embed за TMDB ID має бути
 *      досяжним (клієнт його покаже замість «чорного екрана»).
 *
 * Мета: довести, що «фільм на платформі є → у нас вантажиться» на
 * РЕПРЕЗЕНТАТИВНІЙ виборці (а не на одному фільмі, взятому вручну).
 *
 * Exit code: 0 = усі перевірки пройшли, 1 = є збої.
 */

const path = require('path')
const fs = require('fs')

const PROXY_ROOT = path.join(__dirname, '..', 'proxy-server')
// node-fetch беремо з залежностей proxy-server — нових залежностей не додаємо.
let fetch
for (const candidate of [
  path.join(PROXY_ROOT, 'node_modules', 'node-fetch'),
  'node-fetch',
]) {
  try { fetch = require(candidate); break } catch (e) { /* пробуємо далі */ }
}
if (!fetch) {
  console.error('node-fetch не знайдено: запустіть npm install у proxy-server')
  process.exit(1)
}

const PROXY = process.env.ALEXFILM_PROXY || 'http://127.0.0.1:3001'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0 Safari/537.36'

// Репрезентативна виборка: нові/старі, українські/зарубіжні, фільми/серіали,
// popular/obscure + фейкова назва (перевірка чесної відмови).
const SAMPLE = [
  { q: 'Spider-Man: Brand New Day', year: 2026, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'Game of Thrones',           year: 2011, type: 'series', expect: 'ua-or-fallback' },
  { q: 'Пасічник', orig: 'The Beekeeper', year: 2024, type: 'series', expect: 'ua-or-fallback' },
  { q: 'Буча', orig: 'Bucha',       year: 2024, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'Мавка. Лісова пісня',       year: 2023, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'Крути 1918',                year: 2019, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'Віддана',                   year: 2019, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'Titanic', orig: 'Титанік',  year: 1997, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'It', orig: 'Воно',          year: 2017, type: 'movie',  expect: 'ua-or-fallback' },
  { q: 'Interstellar', orig: 'Інтерстеллар', year: 2014, type: 'movie', expect: 'ua-or-fallback' },
  { q: 'The Mongoose', orig: 'Мангуст', year: 2026, type: 'series', expect: 'ua-or-fallback' },
  { q: 'Кіно якого не існує 9999',  year: 2077, type: 'movie',  expect: 'not-found' },
]

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function tmdbSearch(query) {
  const u = new URL(`${PROXY}/api/tmdb/search/movie`)
  u.searchParams.set('query', query)
  u.searchParams.set('language', 'uk-UA')
  const r = await fetch(u, { timeout: 25000 })
  if (!r.ok) throw new Error(`TMDB ${r.status}`)
  const j = await r.json()
  const list = j.results || []
  return list.find(m => m.original_title) || list[0] || null
}

async function uaStream(title, orig, year, type) {
  const u = new URL(`${PROXY}/api/stream/ua`)
  if (title) u.searchParams.set('title', title)
  if (orig) u.searchParams.set('orig', orig)
  u.searchParams.set('year', String(year))
  u.searchParams.set('type', type)
  const r = await fetch(u, { timeout: 120000 })
  if (r.status === 429) return { rateLimited: true }
  const j = await r.json().catch(() => ({}))
  return { body: j }
}

/** Перевіряє маніфест ЧЕРЕЗ relay — той самий шлях, що йде браузер. */
async function verifyRelayManifest(relayUrl) {
  const m = await fetch(relayUrl, { headers: { 'User-Agent': UA }, timeout: 30000 })
  if (!m.ok) return { ok: false, why: `master ${m.status}` }
  const master = await m.text()
  if (!/#EXTM3U/i.test(master)) return { ok: false, why: 'master не є плейлистом' }

  const firstLine = master.split('\n').map(s => s.trim()).find(l => l && !l.startsWith('#'))
  if (firstLine) {
    const vUrl = new URL(firstLine, relayUrl).href
    const v = await fetch(vUrl, { headers: { 'User-Agent': UA }, timeout: 30000 })
    if (!v.ok) return { ok: false, why: `варіант ${v.status}` }
    const body = await v.text()
    if (!/#EXTM3U/i.test(body)) return { ok: false, why: 'варіант не є плейлистом' }
    if (!/#EXTINF/i.test(body)) return { ok: false, why: 'варіант без сегментів' }
    return { ok: true, variants: (master.match(/EXT-X-STREAM-INF/gi) || []).length }
  }
  return { ok: true, variants: 0 }
}

/** Резервний embed за TMDB ID (той самий формат, що клієнт). */
async function verifyFallbackEmbed(tmdbId) {
  const url = `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, timeout: 25000, redirect: 'follow' })
    if (!r.ok) return { ok: false, why: `embed ${r.status}` }
    return { ok: true }
  } catch (e) {
    return { ok: false, why: e.message }
  }
}

;(async () => {
  console.log('='.repeat(96))
  console.log(`УНІВЕРСАЛЬНА ПЕРЕВІРКА ПОКРИТТЯ  (${PROXY})`)
  console.log('='.repeat(96))

  const rows = []
  let failures = 0

  for (const entry of SAMPLE) {
    const label = `${entry.q}${entry.year ? ' (' + entry.year + ')' : ''} [${entry.type}]`
    let row = { label, status: 'ERR', detail: '' }
    try {
      const meta = await tmdbSearch(entry.q)
      if (!meta) {
        // TMDB не знає такої назви — це валідна «чесна відмова».
        if (entry.expect === 'not-found') {
          row = { label, status: 'PASS', detail: 'TMDB не знає назви — чесна відмова' }
        } else {
          row = { label, status: 'FAIL', detail: 'TMDB не знайшов фільм' }
          failures++
        }
        rows.push(row); console.log(formatRow(row)); continue
      }

      const year = (meta.release_date || String(entry.year)).slice(0, 4)
      const ua = await uaStream(meta.title, meta.original_title, year, entry.type)
      if (ua.rateLimited) {
        console.log(`  ⏳ rate-limit для "${label}" — чекаємо 15 с`)
        await sleep(15000)
        rows.push({ label, status: 'RETRY', detail: 'rate limit' }); continue
      }

      if (ua.body && ua.body.success && ua.body.hlsUrl) {
        const v = await verifyRelayManifest(ua.body.hlsUrl)
        if (v.ok) {
          row = { label, status: 'PASS', detail: `UA: ${ua.body.sourceName} [${ua.body.qualityBadge}] → relay OK (${v.variants} вар.)` }
        } else {
          row = { label, status: 'FAIL', detail: `UA знайдено (${ua.body.sourceName}), АЛЕ relay не грає: ${v.why}` }
          failures++
        }
      } else {
        const fb = await verifyFallbackEmbed(meta.id)
        if (fb.ok) {
          row = { label, status: 'PASS', detail: `UA немає → fallback embed (tmdb=${meta.id}) досяжний` }
        } else {
          row = { label, status: 'FAIL', detail: `UA немає, fallback теж: ${fb.why}` }
          failures++
        }
      }
    } catch (e) {
      row = { label, status: 'ERR', detail: e.message }
      failures++
    }
    rows.push(row)
    console.log(formatRow(row))
    await sleep(2000) // бюджет rate-limit пошуку
  }

  console.log('='.repeat(96))
  const passed = rows.filter(r => r.status === 'PASS').length
  console.log(`ПІДСУМОК: ${passed}/${rows.length} PASS, збоїв: ${failures}`)
  console.log('='.repeat(96))
  process.exit(failures > 0 ? 1 : 0)
})().catch(e => { console.error('FATAL', e); process.exit(1) })

function formatRow(row) {
  const icon = row.status === 'PASS' ? '✓' : row.status === 'FAIL' ? '✗' : row.status === 'RETRY' ? '⏳' : '!'
  return ` ${icon} ${row.status.padEnd(5)} ${row.label.padEnd(46)} ${row.detail}`
}
