/**
 * AlexFilm UA Streaming & CORS Proxy Server
 *
 * Надає прямий парсинг з українських площадок:
 * 1. UASerials.fm -> витягує високоякісний Ashdi (1080p BDRip, 4K, 3+ аудіодоріжки) та HDVB
 * 2. UAFLIX / uafix.net -> витягує Zetvideo (1080p BDRemux Hurtom)
 * 3. Eneyida.tv -> витягує HDVB потік
 *
 * Інтелектуальний матчер (matcher.js):
 * - Levenshtein distance + Jaccard token similarity
 * - ЖОРСТКИЙ identity gate: назва + рік. Різниця року > ±1 = відмова.
 * - Post-fetch верифікація року з actual сторінки фільму (авторитетне джерело).
 * - Quality gate: CAMRip / TS / кінотеатральні записи не повертаються.
 *
 * Ключова гарантія: плеєр ніколи не показує фільм, який не відноситься до постера.
 *
 * GET /api/stream/ua?title=...&orig=...&year=...&type=movie|series
 */

const path = require('path')
const fs = require('fs')
const express = require('express')
const cors = require('cors')
const fetch = require('node-fetch')
const cheerio = require('cheerio')
const crypto = require('crypto')
const { AsyncLocalStorage } = require('async_hooks')
const { pipeline } = require('stream/promises')
const { once } = require('events')
const { findBestMatches, parseYear, YEAR_TOLERANCE, sanitizeLog } = require('./matcher')

const app = express()
app.set('trust proxy', 1)

const PORT = Number(process.env.PORT) || 3001
const HOST = process.env.HOST || '0.0.0.0'

// TTL кешу — 30 хвилин, щоб застарілі посилання на плеєри не залишались назавжди
const CACHE_TTL_MS = 30 * 60 * 1000
// Максимум записів у кеші (інакше Map ростиме безмежно)
const MAX_CACHE_ENTRIES = 200

// Ліміти на вхідні дані та відповіді
const MAX_TITLE_LEN = 120
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_REDIRECTS = 3
const MAX_SCAN_BYTES = 512 * 1024 // скільки байт HTML/плейлиста реально скануємо
// Ліміти для локального HLS-relay. Плейлисти невеликі, а 4K-сегменти
// можуть бути по десятки мегабайт — але unbounded streaming не допускаємо.
const MAX_HLS_PLAYLIST_BYTES = 2 * 1024 * 1024
const MAX_HLS_SEGMENT_BYTES = 128 * 1024 * 1024
// Публічна адреса локального або хмарного relay.
const DEFAULT_HLS_PROXY_ORIGIN = (process.env.PUBLIC_URL || `http://127.0.0.1:${PORT}`).replace(/\/+$/, '')

function getHlsProxyOrigin() {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '')
  }
  const store = requestContext.getStore()
  if (store && store.origin) {
    return store.origin
  }
  return DEFAULT_HLS_PROXY_ORIGIN
}

function getReqOrigin(req) {
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '')
  }
  if (req) {
    const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim()
    if (host) {
      const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim()
      return `${proto}://${host}`
    }
  }
  return DEFAULT_HLS_PROXY_ORIGIN
}
// Relay приймає ТІЛЬКИ ті upstream-URL, які сам сервер видав: підпис
// HMAC-ом прив'язує запит до конкретного потоку. Без цього /api/hls був
// би open-proxy для будь-якого шляху на трьох дозволених доменах.
const HLS_RELAY_SECRET = crypto.randomBytes(32)
// Ліміти relay-а (окремо від пошуку): HLS.js завантажує сотні сегментів,
// тому тут потрібен м'який, але реальний ліміт.
const MAX_HLS_INFLIGHT_PER_CLIENT = 8
const MAX_HLS_REQUESTS_PER_MINUTE = 900
const MAX_HLS_BYTES_PER_MINUTE = 1536 * 1024 * 1024
// Межі переписаного маніфеста: кожен URI стає довшим (proxy-URL + підпис),
// тому без окремих лімітів 2 МБ входу могли б роздутися у десятки разів.
const MAX_HLS_MANIFEST_LINES = 20000
const MAX_HLS_REWRITTEN_BYTES = 8 * 1024 * 1024
// Типи контенту, які relay має право віддавати як медіаресурс.
// Усе інше (HTML/JS/тощо) блокуємо — інакше upstream-сторінка могла б
// виконати скрипт у нашому локальному origin.
const ALLOWED_HLS_CONTENT_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'video/mp2t',
  'video/mp4',
  'video/webm',
  'audio/mp4',
  'audio/aac',
  'audio/mpeg',
  'text/plain',
  // Субтитрові доріжки HLS (#EXT-X-MEDIA:TYPE=SUBTITLES → .vtt сегменти).
  // Без них relay віддав би 403 на vtt — і субтитри не працювали б,
  // навіть коли джерело їх має.
  'text/vtt',
  'application/vtt',
])
// TMDB-ключ живе ТІЛЬКИ на сервері: клієнт більше не містить його у бандлі.
const TMDB_API_KEY = process.env.TMDB_API_KEY || '0aae6e08fea10578e99f3da447ac2fcb'
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
// Read-only ендпоїнти TMDB, які реально використовує застосунок.
const TMDB_ALLOWED_PATHS = [
  /^\/movie\/(popular|random)$/,
  /^\/movie\/\d+$/,
  /^\/movie\/\d+\/(videos|credits|external_ids|release_dates|alternative_titles)$/,
  /^\/discover\/movie$/,
  /^\/search\/movie$/,
  /^\/genre\/movie\/list$/,
]
// Дозволені query-параметри TMDB (все інше — зокрема session_id — відсікаємо).
const TMDB_ALLOWED_QUERY_KEYS = new Set([
  'language', 'page', 'query', 'sort_by', 'with_genres', 'with_keywords', 'with_original_language',
  'vote_average.gte', 'vote_count.gte', 'primary_release_date.gte',
  'primary_release_date.lte', 'primary_release_year', 'include_adult',
  'include_video', 'region', 'year',
])
// Максимум HLS-кандидатів, які перевіряємо в одному HTML.
// Обмежує worst-case: скан одного й того самого «хвоста» не повторюється
// безкінечно (інакше adversarial-сторінка могла б роздути час пошуку).
const MAX_HLS_CANDIDATES = 50

// Домени, з яких дозволено завантажувати плеєр та HLS-потік.
// Сторінки фільмів живуть на інших доменах — вони мають власний allow-list нижче.
const ALLOWED_EMBED_HOSTS = ['ashdi.vip', 'zetvideo.net', 'hdvbua.pro']

// CORS: дозволяємо лише локальний дев-сервер фронтенду.
//
// Порт Vite НЕ фіксуємо: якщо 5173 зайнятий, Vite сам піднімається на
// 5174, 5175… (strictPort=false). Жорсткий allow-list лише на :5173 ламав
// весь застосунок: проксі відповідав 403 без CORS-заголовків, а браузер
// показував «Failed to fetch». Тому фіксуємо loopback-хост + dev-діапазон
// портів, а не конкретний порт.
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
])

// Хости, з яких прийнятний локальний дев-трафік.
const DEV_ORIGIN_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Діапазони портів: vite dev та vite preview.
const DEV_ORIGIN_PORT_RANGES = [
  [5173, 5200],
  [4173, 4200],
]

// Додаткові Origin через змінну оточення (через кому), якщо потрібен
// нестандартний порт або публічний домен:
// DEV_ORIGINS="http://localhost:8080,https://my-app.vercel.app"
const EXTRA_ALLOWED_ORIGINS = new Set(
  String(process.env.DEV_ORIGINS || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
)

/**
 * Чи можна Origin'у звертатися до проксі.
 *
 * @param {string|null|undefined} origin значення Origin-заголовка
 * @param {object} [req] об'єкт Express-запиту (опціонально)
 * @returns {boolean}
 */
function isAllowedOrigin(origin, req) {
  if (!origin || typeof origin !== 'string') return false
  if (ALLOWED_ORIGINS.has(origin)) return true
  if (EXTRA_ALLOWED_ORIGINS.has(origin)) return true
  if (process.env.PUBLIC_URL && origin === process.env.PUBLIC_URL.replace(/\/+$/, '')) return true

  // Якщо запит надійшов із того самого хоста (Same-origin у продакшені на хмарі)
  if (req) {
    const host = (req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim()
    if (host) {
      const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim()
      if (origin === `${proto}://${host}` || origin === `http://${host}` || origin === `https://${host}`) {
        return true
      }
    }
  }

  let parsed
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  // Локальний дев-сервер — це http (https на loopback не піднімаємо).
  if (parsed.protocol !== 'http:') return false
  if (!DEV_ORIGIN_HOSTS.has(parsed.hostname.toLowerCase())) return false

  const port = parsed.port ? Number(parsed.port) : 80
  return DEV_ORIGIN_PORT_RANGES.some(([from, to]) => port >= from && port <= to)
}

// ─────────────────────────────────────────────────────────────
// Захист upstream-майданчиків від локального DoS
//
// Один пошук = десятки вихідних HTTP-запитів до UASerials/UAFLIX/Eneyida
// (пошук × 2 джерела + сторінки кандидатів + iframe + маніфест).
// Без ліміту локальний скрипт або вкладка з чужого сайту міг би
// «забанити» наш IP на цих майданчиках. Тому:
//   • rate-limit — 10 пошуків/хв на клієнта;
//   • in-flight cap — не більше 2 одночасних пошуків;
//   • AbortSignal — клієнт закрив з'єднання → сервер припиняє робити
//     upstream-запити (через AsyncLocalStorage, без ручної передачі
//     сигналу в кожну допоміжну функцію).
// ─────────────────────────────────────────────────────────────
const RATE_LIMIT_WINDOW_MS = 60 * 1000
const RATE_LIMIT_MAX = 10
const MAX_INFLIGHT_SEARCHES = 2

const requestContext = new AsyncLocalStorage()
const rateBuckets = new Map()
let inflightSearches = 0

function clientKey(req) {
  try {
    return String(req.ip || (req.socket && req.socket.remoteAddress) || 'unknown')
  } catch (e) {
    return 'unknown'
  }
}

/**
 * Перевіряє rate-limit. Повертає { allowed, retryAfter }.
 */
function rateLimitHit(req) {
  const now = Date.now()
  const key = clientKey(req)
  let bucket = rateBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    rateBuckets.set(key, bucket)
  }
  bucket.count++
  return {
    allowed: bucket.count <= RATE_LIMIT_MAX,
    retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  }
}

// Прибирання прострочених rate-бакетів (інакше Map ростиме безмежно)
const rateSweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key)
  }
}, 5 * 60 * 1000)
rateSweeper.unref?.()

// CORS — це політика читання для браузера, а не авторизація. Запит без
// дозволеного Origin все одно виконувався б (його не можна «прочитати»,
// але можна запустити). Тому недозволений Origin відкидаємо outright (403).
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin && !isAllowedOrigin(origin, req)) {
    return res.status(403).json({ error: 'Origin не дозволено' })
  }
  next()
})

app.use((req, res, next) => {
  cors({
    origin(origin, cb) {
      // Без Origin (curl, server-to-server, health-check) — пропускаємо
      if (!origin) return cb(null, true)
      if (isAllowedOrigin(origin, req)) return cb(null, true)
      // Без CORS-заголовків браузер заблокує запит — сторонні сайти не зможуть
      // використовувати proxy як SSRF-проксі
      return cb(null, false)
    },
    methods: ['GET', 'HEAD', 'OPTIONS'],
  })(req, res, next)
})

// Кеш: query -> { data, expiresAt }
const streamCache = new Map()

/**
 * Кеш з жорстким лімітом: старий запис витісняється, прострочені — чистяться.
 * Без ліміту Map міг би рости безмежно (DoS через різні query-рядки).
 */
function setCache(key, data) {
  if (streamCache.size >= MAX_CACHE_ENTRIES) {
    // Видаляємо найстаріший запис (Map зберігає порядок вставки)
    const oldest = streamCache.keys().next()
    if (!oldest.done) streamCache.delete(oldest.value)
  }
  streamCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS })
}

// Періодичне прибирання прострочених записів
const cacheSweeper = setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of streamCache) {
    if (entry.expiresAt <= now) streamCache.delete(key)
  }
}, 5 * 60 * 1000)
cacheSweeper.unref?.()

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7',
}

/**
 * Перевіряє hostname за allow-list (точний збіг або піддомен).
 */
function hostAllowed(hostname, allowedHosts) {
  if (!hostname || !Array.isArray(allowedHosts) || !allowedHosts.length) return false
  const host = String(hostname).toLowerCase()
  return allowedHosts.some(h => host === h || host.endsWith('.' + h))
}

/**
 * Перевіряє, що URL безпечний для виходу в мережу:
 * лише HTTPS (без cleartext) і лише стандартний порт.
 * Нестандартний порт на дозволеному домені — це потенційно
 * адміністративний сервіс, а не плеєр → відхиляємо.
 */
function safeTransport(parsed) {
  if (parsed.protocol !== 'https:') return false
  if (parsed.port) return false
  return true
}

/**
 * Нормалізує посилання на сторінку фільму і перевіряє, що воно веде
 * на той самий домен, що й джерело. Захист від запиту довільних URL
 * (SSRF), які могли б прийти з результатів пошуку.
 */
function safePageUrl(href, allowedHost) {
  if (!href) return null
  let url
  try {
    url = new URL(href, `https://${allowedHost}`)
  } catch (e) {
    return null
  }
  if (!safeTransport(url)) return null
  // Credentials у URL відкидаємо: вони потрапляють у логи й можуть
  // підсилити запит (Basic-auth) на allow-list-домені.
  if (url.username || url.password) return null
  if (!hostAllowed(url.hostname, [allowedHost])) {
    console.warn(`[Security] Відхилено сторінку з чужого домену: ${sanitizeLog(url.href)}`)
    return null
  }
  return url.href
}

/**
 * Перевіряє URL плеєра/потоку: лише http(s) і лише з allow-list доменів.
 * Використовується і для серверного fetch, і для URL, які повертаються клієнту.
 */
function safeEmbedUrl(url, allowedHosts = ALLOWED_EMBED_HOSTS) {
  if (!url) return null
  let parsed
  try {
    parsed = new URL(url)
  } catch (e) {
    return null
  }
  if (!safeTransport(parsed)) return null
  if (parsed.username || parsed.password) return null
  if (!hostAllowed(parsed.hostname, allowedHosts)) {
    console.warn(`[Security] Відхилено плеєр з чужого домену: ${sanitizeLog(parsed.href)}`)
    return null
  }
  return parsed.href
}

/**
 * Підписує upstream-URL, щоб relay приймав лише ті адреси, які сам видав.
 *
 * Секрет жив лише в пам'яті процесу: після перезапуску proxy всі старі
 * посилання стають недійсними, а зовнішній сайт не може підкласти
 * довільний шлях на ashdi/zetvideo/hdvbua.
 */
function signHlsTarget(targetUrl) {
  return crypto
    .createHmac('sha256', HLS_RELAY_SECRET)
    .update(String(targetUrl))
    .digest('hex')
}

/**
 * Перевіряє підпис HMAC-ом (constant-time порівняння).
 */
function verifyHlsTargetSignature(targetUrl, signature) {
  if (!targetUrl || typeof signature !== 'string' || !/^[a-f0-9]{64}$/.test(signature)) {
    return false
  }
  const expected = Buffer.from(signHlsTarget(targetUrl), 'hex')
  const provided = Buffer.from(signature, 'hex')
  if (expected.length !== provided.length) return false
  return crypto.timingSafeEqual(expected, provided)
}

/**
 * Перевіряє, що Range — простий byte-range. Мульти-диапазони та
 * нестандартні одиниці ігноруємо (вони не потрібні для HLS.js).
 */
function isValidRangeHeader(value) {
  if (value === undefined || value === null || value === '') return true
  if (typeof value !== 'string' || value.length > 100) return false
  return /^bytes=\d*-\d*$/.test(value.trim())
}

/**
 * Будує локальне посилання на HLS-relay.
 *
 * Upstream-сервери віддають сегменти з `Access-Control-Allow-Origin:
 * https://ashdi.vip`, тому браузер із `http://localhost:5173` блокує їх
 * навіть із правильним HLS-манифестом. Relay переписує маніфест і віддає
 * всі ресурси через дозволений локальний origin.
 *
 * URL підписується HMAC-ом — інакше relay був би open-proxy.
 */
function buildHlsProxyUrl(upstreamUrl, customOrigin) {
  const safe = safeEmbedUrl(upstreamUrl, ALLOWED_EMBED_HOSTS)
  if (!safe) return null
  const sig = signHlsTarget(safe)
  const base = customOrigin || getHlsProxyOrigin()
  return `${base}/api/hls?url=${encodeURIComponent(safe)}&sig=${sig}`
}

/**
 * Розв'язування відносного HLS-URI та fail-closed перевірка хоста.
 * Кожен ресурс (варіант, сегмент, ключ шифрування, subtitle) проходить
 * ту саму allow-list, що й сам потік — інакше relay перетворився б на
 * SSRF-проксі для довільних URL.
 */
function resolveHlsResourceUrl(uri, baseUrl) {
  if (!uri || typeof uri !== 'string') {
    throw new Error('HLS manifest містить порожній URI')
  }

  let resolved
  try {
    resolved = new URL(uri, baseUrl)
  } catch (e) {
    throw new Error('HLS manifest містить некоректний URI')
  }

  const safe = safeEmbedUrl(resolved.href, ALLOWED_EMBED_HOSTS)
  if (!safe) {
    throw new Error('HLS resource URL поза allow-list')
  }
  return safe
}

/**
 * Переписує HLS-манифест так, щоб усі ресурси йшли через локальний relay.
 *
 * Переписуємо:
 *  - окремі URI-рядки (variant playlist, media segment);
 *  - URI-атрибути тегів (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA тощо) —
 *    як у лапках, так і без них.
 * Відносні URI розуміються відносно upstream-манифесту, а не відносно
 * сторінки AlexFilm.
 *
 * Fail-closed: будь-який URI поза allow-list або непарний URI-атрибут
 * відкидає ВЕСЬ маніфест — краще чорний екран, ніж потік із чужого CDN.
 */
function rewriteHlsManifest(text, baseUrl, customOrigin) {
  if (!text) return ''
  const safeBase = safeEmbedUrl(baseUrl, ALLOWED_EMBED_HOSTS)
  if (!safeBase) throw new Error('HLS manifest base URL поза allow-list')

  const lines = String(text).split(/\r?\n/)
  if (lines.length > MAX_HLS_MANIFEST_LINES) {
    throw new Error(`HLS manifest має надто багато рядків: ${lines.length}`)
  }

  // URI= має бути з лапками або без них. Якщо знайшли «URI=», але не
  // розібрали значення — маніфест небезпечний (fail-closed).
  const URI_ATTR_RE = /URI=(?:"([^"]*)"|'([^']*)'|([^,\s]+))/gi

  const rewritten = lines.map((line) => {
    const trimmed = line.trim()
    if (!trimmed) return line

    if (trimmed.startsWith('#')) {
      const hasUriAttr = /(^|[,;])URI=/i.test(trimmed)
      let replaced = false
      const out = line.replace(URI_ATTR_RE, (_match, dq, sq, bare) => {
        replaced = true
        const uri = dq !== undefined ? dq : (sq !== undefined ? sq : bare)
        const safeUri = resolveHlsResourceUrl(uri, safeBase)
        const proxyUrl = buildHlsProxyUrl(safeUri, customOrigin)
        if (dq !== undefined) return `URI="${proxyUrl}"`
        if (sq !== undefined) return `URI='${proxyUrl}'`
        return `URI=${proxyUrl}`
      })
      if (hasUriAttr && !replaced) {
        throw new Error('HLS manifest містить некоректний URI-атрибут')
      }
      return out
    }

    const safeUri = resolveHlsResourceUrl(trimmed, safeBase)
    return buildHlsProxyUrl(safeUri, customOrigin)
  })

  const result = rewritten.join('\n')
  if (Buffer.byteLength(result, 'utf8') > MAX_HLS_REWRITTEN_BYTES) {
    throw new Error('HLS manifest після переписування завеликий')
  }
  return result
}

/**
 * Безпечний HTTP GET:
 *  - обмежує розмір відповіді (node-fetch `size`);
 *  - переходить по редиректах вручну і перевіряє хост КОЖНОГО кроку
 *    (авто-перехід node-fetch обходив би allow-list);
 *  - обмежує кількість редиректів;
 *  - підтримує AbortSignal — клієнт може закрити з'єднання, і тоді
 *    сервер припиняє витрачати ресурси на upstream-запити.
 */
async function httpGet(url, { allowedHosts, headers, timeout = 9000, referer, maxBytes = MAX_RESPONSE_BYTES, method = 'GET', body, signal } = {}) {
  // Якщо сигнал не передано явно — беремо його з контексту поточного
  // запиту (див. requestContext). Так усі вкладені httpGet() автоматично
  // припиняють роботу, коли клієнт закрив з'єднання.
  const abortSignal = signal || (requestContext.getStore() && requestContext.getStore().signal)
  let current = url

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = new URL(current)
    if (!safeTransport(parsed)) {
      throw new Error(`Недозволена схема або порт: ${sanitizeLog(parsed.protocol)}//${sanitizeLog(parsed.host)}`)
    }
    if (allowedHosts && !hostAllowed(parsed.hostname, allowedHosts)) {
      throw new Error(`Хост не дозволено: ${sanitizeLog(parsed.hostname)}`)
    }

    const res = await fetch(current, {
      method,
      body,
      headers: {
        ...BROWSER_HEADERS,
        ...(referer ? { Referer: referer } : {}),
        ...(headers || {}),
      },
      timeout,
      redirect: 'manual',
      size: maxBytes,
      ...(abortSignal ? { signal: abortSignal } : {}),
    })

    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location')
      // Дренуємо тіло редиректу, щоб не тримати з'єднання відкритим
      await res.text().catch(() => {})
      if (!location) throw new Error('Редирект без Location')

      let next
      try {
        next = new URL(location, current)
      } catch (e) {
        throw new Error('Редирект на некоректний URL')
      }
      // Credentials у редиректі — так само небезпечні, як і в початковому URL.
      if (next.username || next.password) throw new Error('Редирект містить credentials')
      if (!safeTransport(next)) throw new Error('Редирект на недозволену схему або порт')
      if (allowedHosts && !hostAllowed(next.hostname, allowedHosts)) {
        throw new Error(`Редирект на недозволений хост: ${sanitizeLog(next.hostname)}`)
      }
      current = next.href
      // POST не переносимо на інший метод — повторюємо як GET.
      // HEAD зберігаємо: інакше ми б читали тіло GET-відповіді й не
      // звільняли з'єднання.
      if (method === 'POST') { method = 'GET'; body = undefined }
      continue
    }

    return res
  }

  throw new Error('Забагато редиректів')
}

/**
 * Витягує URL HLS-плейлиста з HTML і одразу перевіряє його хост.
 * Скануємо лише перші N КБ, щоб не витрачати CPU на гігантських сторінках.
 *
 * УВАГА: тут НЕ використовується «жадібний» regex на кшталт
 *   https?:\/\/[^\s"'<>]+\.m3u8 — жадібний «+» перед
 *   літералом робив скан квадратичним (512 КБ hostile HTML ≈ 2.3 с
 *   блокування event loop). Натомість — лінійний скан по межах URL.
 *
 * Шукаємо МЕЖІ протоколу, а не початок токена: у реальних сторінках
 * HLS-URL трапляється у форматах
 *   file:'https://ashdi.vip/....m3u8'      (у лапках)
 *   file:"https:\/\/ashdi.vip\/...m3u8"    (JSON-escaped)
 *   src=https://ashdi.vip/....m3u8         (без лапок)
 * Раніше перші два випадки з першою формою знаходились, а «без лапок» —
 * ні, тому потік мовчки не знаходився і користувач бачив аварійний iframe.
 */
// UAFLIX (і деякі інші DLE-сайти) віддають IP-залежний HTML: з дата-центру
// сервер показує сторінку лише з YouTube-трейлером, а не з плеєром. Публічний
// relay бачить повну версію — використовуємо його ТІЛЬКИ як другий шанс
// для сторінки фільму (відео й надалі йде через наш /api/hls).
const CORS_RELAY_ORIGIN = (process.env.UA_PAGE_RELAY || 'https://apx.lme.isroot.in/destination/').replace(/\/+$/, '') + '/'

async function httpGetViaRelay(url, { headers, timeout = 9000 } = {}) {
  const target = new URL(url)
  if (!safeTransport(target)) throw new Error('Недозволена схема запиту до relay')
  const abortSignal = requestContext.getStore() && requestContext.getStore().signal
  return fetch(CORS_RELAY_ORIGIN + encodeURIComponent(target.href), {
    headers: { ...BROWSER_HEADERS, ...(headers || {}) },
    timeout,
    redirect: 'manual',
    size: MAX_RESPONSE_BYTES,
    ...(abortSignal ? { signal: abortSignal } : {}),
  })
}

function extractHlsUrl(text, allowedHosts = ALLOWED_EMBED_HOSTS) {
  if (!text) return null
  const slice = text.slice(0, MAX_SCAN_BYTES)
  const lower = slice.toLowerCase()

  let idx = 0
  let candidates = 0

  while (idx < lower.length && candidates < MAX_HLS_CANDIDATES) {
    // Знайти найближчу схему
    const atHttps = lower.indexOf('https:', idx)
    const atHttp = lower.indexOf('http:', idx)
    let at = -1
    let scheme = ''
    if (atHttps !== -1) { at = atHttps; scheme = 'https' }
    if (atHttp !== -1 && (at === -1 || atHttp < at)) { at = atHttp; scheme = 'http' }
    if (at === -1) break

    // Після «https:» мають бути дві слеші (звичайні «//» або JSON-escaped «\/»)
    let i = at + scheme.length + 1
    let slashes = 0
    while (i < slice.length && slashes < 2) {
      if (slice[i] === '/') { slashes++; i++ }
      else if (slice[i] === '\\' && slice[i + 1] === '/') { slashes++; i += 2 }
      else break
    }
    if (slashes < 2) { idx = at + 1; continue }

    // Кінець URL-а: перша «не URL»-символ
    let end = i
    while (end < slice.length) {
      const ch = slice[end]
      if (ch === '\\' && slice[end + 1] === '/') { end += 2; continue } // escaped slash
      if (ch === '\\' || ch === '"' || ch === "'" || ch === '<' || ch === '>' ||
          ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' ||
          ch === '(' || ch === ')' || ch === '[' || ch === ']' ||
          ch === '{' || ch === '}' || ch === ',' || ch === ';') break
      end++
    }

    const raw = slice.slice(at, end).replace(/\\\//g, '/')
    idx = at + 1
    if (!raw.toLowerCase().includes('.m3u8')) continue

    candidates++
    const candidate = safeEmbedUrl(raw, allowedHosts)
    if (candidate) return candidate
  }

  return null
}


/**
 * Блок технічної інформації про реліз на сторінці фільму.
 * Тільки всередині нього шукаємо «спеціальні» розмітки року
 * (class="year", itemprop, xfsearch/year) — у сайдбарі Eneyida
 * десятки чужих посилань на інші роки.
 */
const RELEASE_INFO_BLOCK_SELECTOR =
  'ul.finfo, #finfo, ul.full_info, #full_info, .film-info, .film_info, .video-info, .full-info, .fullinfo, .info-block'

// Чистий 4-значний рік (1900–2049)
const YEAR_ONLY_RE = /^(19[3-9]\d|20[0-4]\d)$/
// Рік у початку рядка (значення одразу після лейбла «Рік:»)
const YEAR_LEAD_RE = /^(19[3-9]\d|20[0-4]\d)(?!\d)/

/**
 * Текст, який йде ПІСЛЯ вузла-лейбла в межах його батька.
 *
 * Це ключова деталь: ми читаємо ТІЛЬКИ те, що слідує за «Рік:».
 * Назва з роком у заголовку (<h1>2001: Космічна Одіссея</h1>) стоїть
 * ПЕРЕД лейблом і ніколи не потрапляє в результат.
 */
function textAfterNode($, label) {
  const parent = label.parent()
  if (!parent.length) return ''
  const labelNode = label[0]
  let after = ''
  let seen = false
  parent.contents().each((_, node) => {
    if (!seen) {
      if (node === labelNode) seen = true
      return
    }
    after += $(node).text()
  })
  return seen ? after.replace(/\s+/g, ' ') : ''
}

/**
 * Витягує рік релізу зі сторінки фільму.
 *
 * ДОЗВОЛЕНО лише структуровані поля DLE:
 *   <li><span>Рік:</span> 2016</li>                       (UASerials, Eneyida)
 *   <span>Рік виходу:</span><span class="year">2026</span> (UAFLIX)
 *   <a href=".../xfsearch/year/2021/">2021</a>            (Eneyida)
 *
 * Назву та <title>/og:title НЕ використовуємо НІКОЛИ:
 *   «2001: Космічна Одіссея» — це назва (фільм 1968), а не 2001-й рік;
 *   хвости на кшталт «| UASerials 2026» не мають отношения до релізу.
 * Якщо структурованого поля немає — рік НЕВІДОМИЙ (fail-closed).
 */
function extractPageYear(pHtml) {
  if (!pHtml) return null

  const $ = cheerio.load(pHtml)

  // 1) Структуроване поле «Рік: …» / «Рік виходу: …»
  //    УВАГА: \b — це ASCII word boundary, він НЕ працює з кирилицею,
  //    тому /^Рік\b/ ніколи не збігалось із «Рік:». Явна межа замість нього.
  const labels = $('span, label, b, strong, dt').filter((i, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim()
    return /^Рік(?:\s|:|$)/iu.test(t) && t.length < 30
  })

  for (let i = 0; i < labels.length; i++) {
    const label = labels.eq(i)
    const parent = label.parent()
    const parentIsRoot = !parent.length || parent[0].tagName === 'body' || parent[0].tagName === 'html'
    const after = textAfterNode($, label)
    const trimmedAfter = after.trim()

    // Значення, безпосередньо наступне за лейблом:
    //   «<span>Рік:</span> 2016»
    //   «<span>Рік виходу:</span><span class="year">2026</span>»
    if (YEAR_ONLY_RE.test(trimmedAfter)) return parseInt(trimmedAfter, 10)

    // У ліворуч від лейбла в тому ж контейнері може лежати назва з роком
    // (<h1>2001: Космічна Одіссея</h1>). Тому зону «після лейбла» читаємо
    // обережно: якщо контейнер — це корінь сторінки, вимагаємо, щоб значення
    // було ВИКЛЮЧНО роком (інакше ми б «витягли» перший-ліпший рік).
    if (!parentIsRoot) {
      const m = trimmedAfter.match(YEAR_LEAD_RE)
      if (m) return parseInt(m[1], 10)
    }

    // Значення може бути всередині самого лейбла («Рік: 2016»).
    const own = label.text().replace(/\s+/g, ' ').trim().replace(/^Рік[^0-9]*/iu, '').trim()
    if (YEAR_ONLY_RE.test(own)) return parseInt(own, 10)
  }

  // 2) Спеціальні розмітки DLE (class="year", itemprop, xfsearch/year) —
  //    ТІЛЬКИ в блоці технічної інформації про реліз.
  const scope = $(RELEASE_INFO_BLOCK_SELECTOR).first()
  if (scope.length) {
    const structured = scope.find('span.year, .year, [itemprop="dateCreated"], a[href*="xfsearch/year"], link[itemprop="dateCreated"]').first()
    if (structured.length) {
      const t = structured.text().replace(/\s+/g, ' ').trim()
      if (YEAR_ONLY_RE.test(t)) return parseInt(t, 10)
    }
  }

  // 3) Структурованого поля немає → рік невідомий → кандидат відхилиться
  //    на post-fetch верифікації (fail-closed).
  return null
}

/**
 * Точно визначає роздільну здатність з master-playlist (.m3u8).
 * Це авторитетне джерело якості — краще за здогадки за назвою файлу.
 * Максимальний варіант обираємо за ШИРИНОЮ (1920 = 1080p, 3840 = 4K),
 * бо потоки часто letterboxed (1920x800 — це повноцінне 1080p).
 */
/**
 * Живість потоку + роздільність за ОДИН прохід по маніфестах.
 *
 * ГАРАНТІЯ «ФІЛЬМ НА ПЛАТФОРМІ Є → У НАС ВАНТАЖИТЬСЯ»: перш ніж повернути
 * потік клієнту, сервер сам завантажує master-маніфест і ПЕРШИЙ варіант,
 * перевіряючи, що там справді є сегменти (#EXTINF). Мертвий потік
 * (404/403, порожній маніфест, битий варіант) відхиляється ще на етапі
 * пошуку — клієнт отримує лише URL, які реально відкриваються.
 *
 * Повертає { live, resolution, reason }:
 *   live       — потік можна віддавати клієнту
 *   resolution — {width, height} найкращого варіанта (для quality gate)
 *   reason     — причина відмови (для логів)
 */
async function probeStreamHls(hlsUrl) {
  if (!hlsUrl) return { live: false, resolution: null, reason: 'no url' }
  const manifestHeaders = {
    'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
    'Range': 'bytes=0-65535',
  }
  try {
    const masterRes = await httpGet(hlsUrl, {
      allowedHosts: ALLOWED_EMBED_HOSTS,
      headers: manifestHeaders,
      timeout: 6000,
      maxBytes: 256 * 1024,
    })
    if (!masterRes.ok) return { live: false, resolution: null, reason: `master ${masterRes.status}` }
    const master = (await masterRes.text()).slice(0, MAX_SCAN_BYTES)
    if (!/#EXTM3U/i.test(master)) return { live: false, resolution: null, reason: 'master не є плейлистом' }

    const resolutions = [...master.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)].map(m => ({
      width: parseInt(m[1], 10),
      height: parseInt(m[2], 10),
    }))
    const resolution = resolutions.length
      ? resolutions.reduce((max, r) => (r.width > max.width ? r : max))
      : null

    // Перший не-коментарний рядок master-плейлиста — URL варіанта.
    const firstLine = master.split('\n').map(s => s.trim()).find(l => l && !l.startsWith('#'))
    if (firstLine) {
      let variantUrl
      try {
        variantUrl = new URL(firstLine, hlsUrl).href
      } catch (e) {
        return { live: false, resolution, reason: 'битий URL варіанта' }
      }
      // SSRF-гейт: варіант має жити на тому самому allow-list хостів.
      const variantHost = new URL(variantUrl).hostname
      if (!hostAllowed(variantHost, ALLOWED_EMBED_HOSTS)) {
        return { live: false, resolution, reason: `варіант на недозволеному хості ${variantHost}` }
      }
      const variantRes = await httpGet(variantUrl, {
        allowedHosts: ALLOWED_EMBED_HOSTS,
        headers: manifestHeaders,
        timeout: 6000,
        maxBytes: 256 * 1024,
      })
      if (!variantRes.ok) return { live: false, resolution, reason: `варіант ${variantRes.status}` }
      const variant = (await variantRes.text()).slice(0, MAX_SCAN_BYTES)
      if (!/#EXTM3U/i.test(variant)) return { live: false, resolution, reason: 'варіант не є плейлистом' }
      if (!/#EXTINF/i.test(variant)) return { live: false, resolution, reason: 'варіант без сегментів' }
    }

    return { live: true, resolution, reason: null }
  } catch (e) {
    // Помилка мережі = потік мертвий для клієнта (якість не вигадується).
    if (e && (e.name === 'AbortError' || e.type === 'aborted')) throw e
    return { live: false, resolution: null, reason: sanitizeLog(e && e.message ? e.message : 'error') }
  }
}

/**
 * Обирає НАЙКРАЩИЙ результат із кількох UA-джерел.
 *
 * Універсальне правило (замість каскаду «перший збіг виграє»):
 *   1. максимальний qualityRank (роздільність + тип релізу);
 *   2. однакова якість → джерело з ВИЩИМ пріоритетом, тобто те, що
 *      стоїть раніше у масиві результатів (порядок виклику = пріоритет).
 *
 * Джерела, що впали (network timeout тощо), участі не беруть: одне
 * мертве джерело не ламає пошук.
 */
function pickBestStreamResult(results) {
  if (!Array.isArray(results)) return null
  let best = null
  for (const r of results) {
    if (!r) continue
    if (!best) { best = r; continue }
    const rRank = Number(r.qualityRank) || 0
    const bRank = Number(best.qualityRank) || 0
    if (rRank > bRank) best = r
  }
  return best
}

async function fetchStreamResolution(hlsUrl) {
  if (!hlsUrl) return null
  try {
    const res = await httpGet(hlsUrl, {
      allowedHosts: ALLOWED_EMBED_HOSTS,
      headers: {
        'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
        'Range': 'bytes=0-65535',
      },
      timeout: 6000,
      maxBytes: 256 * 1024,
    })
    if (!res.ok) return null
    const text = (await res.text()).slice(0, MAX_SCAN_BYTES)
    const resolutions = [...text.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)].map(m => ({
      width: parseInt(m[1], 10),
      height: parseInt(m[2], 10)
    }))
    if (!resolutions.length) return null
    return resolutions.reduce((max, r) => (r.width > max.width ? r : max))
  } catch (e) {
    // Скасування клієнтом — прокидаємо наверх, щоб пошук зупинився,
    // а не пішов далі робити ще десятки upstream-запитів.
    if (e && (e.name === 'AbortError' || e.type === 'aborted')) throw e
    return null
  }
}

/**
 * Витягує ВУЗЬКИЙ блок технічної інформації про реліз.
 * Ми НЕ скануємо всю сторінку: в описі фільму можуть згадуватися чужі
 * релізи («1080p BDRip» у тексті синопсису), що ламає quality-гейт.
 */
function extractReleaseInfoText(pageHtml) {
  if (!pageHtml) return ''
  const $ = cheerio.load(pageHtml)
  const block = $('ul.finfo, #finfo, ul.full_info, #full_info, .film-info, .film_info, .video-info').first()
  if (block.length) return block.text().replace(/\s+/g, ' ').slice(0, 2000)
  return ''
}

// ── Маркери якості ────────────────────────────────────────────────
// ВАЖЛИВО: межа — «не літера/цифра», а НЕ \b. \b — це ASCII word boundary:
//   1) він не працює з кирилицею («екранка» ніколи не збігалась);
//   2) «_» вважається word-char, тому «the_matrix_bdrip» не збігалось.
// Використовуємо lookbehind (?<!...), який Node підтримує.
const LATIN = 'a-z'
const CYR = 'а-яёіїєґ'
const NOT_LETTER = `(?<![${LATIN}${CYR}0-9])`
const NOT_LETTER_END = `(?![${LATIN}${CYR}0-9])`

// Сильні маркери кінотеатрального / низькоякісного запису
const CAM_MARKER_RE = new RegExp(
  `${NOT_LETTER}(camrip|cam[\\s._-]?rip|telesync|telesynch|ts[\\s._-]?rip|hdts|dvdscr|dvdrip|screener|екранка|телесинх)${NOT_LETTER_END}`,
  'iu'
)

// Окремий «TS» — окреме слово або файл «.ts». Перевіряється лише у
// ВУЗЬКОМУ release-info та URL потоку, НЕ у всьому HTML сторінки
// (у HTML плеєра повно технічних рядків і рекламних URL — хибні спрацювання).
const TS_MARKER_RE = new RegExp(`${NOT_LETTER}ts${NOT_LETTER_END}|\\.ts(?:$|[?#.])`, 'iu')

// Тип релізу. Порядок важливий: BDRemux перевіряється перед BDRip,
// WEB-DL — перед WEBRip, інакше «bdremux» підійде під «bdrip».
const SOURCE_MARKERS = [
  { name: 'BDRemux', re: new RegExp(`${NOT_LETTER}(bdremux|blu-?ray-?remux|remux)${NOT_LETTER_END}`, 'i'), rank: 3 },
  { name: 'BDRip',  re: new RegExp(`${NOT_LETTER}bdrip${NOT_LETTER_END}`, 'i'), rank: 3 },
  { name: 'BluRay', re: new RegExp(`${NOT_LETTER}(bluray|blu-?ray)${NOT_LETTER_END}`, 'i'), rank: 3 },
  { name: 'WEB-DL', re: new RegExp(`${NOT_LETTER}(web-?dl|web\\.dl)${NOT_LETTER_END}`, 'i'), rank: 2 },
  { name: 'WEBRip', re: new RegExp(`${NOT_LETTER}webrip${NOT_LETTER_END}`, 'i'), rank: 2 },
  { name: 'HDTV',   re: new RegExp(`${NOT_LETTER}hdtv${NOT_LETTER_END}`, 'i'), rank: 2 },
]

// Явно низька якість — такий реліз відхиляємо, навіть якщо роздільність висока
const BAD_SOURCE_RE = new RegExp(
  `${NOT_LETTER}(dvdrip|dvdscr|dvd-?r|hdrip|tvrip|screener|workprint|uncut)${NOT_LETTER_END}`,
  'iu'
)

const UHD_MARKER_RE = new RegExp(`${NOT_LETTER}(2160p|4k|uhd)${NOT_LETTER_END}`, 'i')
const P1080_MARKER_RE = new RegExp(`${NOT_LETTER}1080p${NOT_LETTER_END}`, 'i')
const P720_MARKER_RE = new RegExp(`${NOT_LETTER}720p${NOT_LETTER_END}`, 'i')

// Клас роздільної здатності за ШИРИНОЮ з реального master-playlist.
// Ширина, а не висота: потоки часто letterboxed (1920x800 — це повноцінне 1080p).
const RESOLUTION_CLASSES = [
  { minWidth: 3800, label: '4K UHD', short: '4K', rank: 4 },
  { minWidth: 1800, label: '1080p',   short: '1080p', rank: 3 },
  { minWidth: 1200, label: '720p',    short: '720p', rank: 1 },
]

/**
 * Клас роздільної здатності з реального маніфесту (авторитетне джерело).
 * Повертає null для SD/невідомої — такий реліз не приймаємо.
 */
function resolutionClassFromWidth(width) {
  if (!width || width <= 0) return null
  return RESOLUTION_CLASSES.find(c => width >= c.minWidth) || null
}

/**
 * Клас роздільної здатності з текстових маркерів.
 * Використовується ТІЛЬКИ якщо маніфест недоступний.
 */
function resolutionClassFromText(text) {
  if (UHD_MARKER_RE.test(text)) return RESOLUTION_CLASSES[0]
  if (P1080_MARKER_RE.test(text)) return RESOLUTION_CLASSES[1]
  if (P720_MARKER_RE.test(text)) return RESOLUTION_CLASSES[2]
  return null
}

/**
 * Визначає тип релізу (BDRip/BDRemux/BluRay/WEB-DL/WEBRip/HDTV).
 * Повертає null, якщо тип невідомий (напр. просто «avatar_331»).
 */
function detectSourceClass(text) {
  for (const m of SOURCE_MARKERS) {
    if (m.re.test(text)) return m
  }
  return null
}

/**
 * Аналіз якості релізу.
 *
 * Роздільна здатність і тип релізу визначаються НЕЗАЛЕЖНО:
 *   - resolutionClass — з РЕАЛЬНОГО master-playlist (RESOLUTION за шириною),
 *     а лише якщо маніфест недоступний — з текстових маркерів;
 *   - sourceClass — з маркерів типу релізу (URL потоку + info-блок + HTML плеєра).
 *
 * Приймаємо реліз лише коли:
 *   1) клас роздільної здатності відомий і ≥ 720p;
 *   2) немає жодного маркера CAMRip/TS/екранки/телесинху;
 *   3) тип релізу НЕ є явно низькоякісним (DVDRip/Screener тощо).
 *
 * Тип релізу, якого немає в даних (напр. назва потоку «avatar_331»),
 * НЕ вигадується: бейдж показує лише реальну роздільність («1080p»),
 * а не вигаданий «HD». Такі релізи приймаються лише коли реальна
 * роздільність підтверджена маніфестом; якщо і маніфест недоступний —
 * якість невідома → відхиляємо (fail-closed).
 */
function analyzeReleaseQuality(hlsUrl, pageHtml = '', resolution = null, iframeHtml = '') {
  const urlLower = (hlsUrl || '').toLowerCase()
  const infoText = extractReleaseInfoText(pageHtml).toLowerCase()
  const iframeText = (iframeHtml || '').slice(0, MAX_SCAN_BYTES).toLowerCase()
  const combined = `${urlLower} ${infoText}`

  const base = { resolution: resolution || null }
  const reject = (qualityBadge, description) => ({
    ...base,
    quality: qualityBadge,
    qualityBadge,
    isCamrip: false,
    isHighQuality: false,
    qualityRank: 0,
    description,
  })

  // ─── 1. CAMRip / TS — перевіряємо ПЕРШИМ ─────────────────────────
  // CAM-маркери дивимося у вузьких даних (URL потоку + release-info)
  // і в HTML плеєра. Окреме слово «TS» шукаємо ЛИШЕ у вузьких даних —
  // у повному HTML плеєра є технічні рядки, які дають хибні спрацювання.
  if (CAM_MARKER_RE.test(combined) || CAM_MARKER_RE.test(iframeText)) {
    return {
      ...base,
      quality: 'CAMRip / TS',
      qualityBadge: 'CAMRip',
      isCamrip: true,
      isHighQuality: false,
      qualityRank: 0,
      description: 'Кінотеатральний запис — якість не прийнятна'
    }
  }
  if (TS_MARKER_RE.test(combined) || /\.ts(?:$|[?#.])/i.test(urlLower)) {
    return {
      ...base,
      quality: 'CAMRip / TS',
      qualityBadge: 'CAMRip',
      isCamrip: true,
      isHighQuality: false,
      qualityRank: 0,
      description: 'Кінотеатральний запис (TS) — якість не прийнятна'
    }
  }

  // ─── 2. Роздільна здатність (авторитетне джерело — маніфест) ────
  const streamWidth = resolution?.width || 0
  const hasManifest = streamWidth > 0
  const resClass = hasManifest
    ? resolutionClassFromWidth(streamWidth)
    : resolutionClassFromText(combined)

  // Роздільність невідома або нижча за 720p — не приймаємо (fail-closed)
  if (!resClass) {
    return reject(
      hasManifest ? 'SD' : 'Невідомо',
      hasManifest
        ? 'Якість нижче за 720p — не приймається'
        : 'Не вдалося підтвердити роздільність релізу'
    )
  }

  // ─── 3. Тип релізу (незалежно від роздільності) ─────────────────
  const source = detectSourceClass(combined) || detectSourceClass(iframeText)

  if (BAD_SOURCE_RE.test(combined) || BAD_SOURCE_RE.test(iframeText)) {
    return reject(`${resClass.label} (низька якість)`, 'Явно низькоякісний тип релізу — не приймається')
  }

  // Тип невідомий і маніфест недоступний → якість не доведена → відхиляємо
  if (!source && !hasManifest) {
    return reject(resClass.label, 'Не вдалося підтвердити тип релізу')
  }

  const badge = source ? `${resClass.label} ${source.name}` : resClass.label
  const rank = source ? Math.max(resClass.rank, source.rank) : resClass.rank

  return {
    ...base,
    quality: badge,
    qualityBadge: badge,
    isCamrip: false,
    isHighQuality: true,
    qualityRank: rank,
    description: source
      ? `Офіційний реліз ${resClass.label} (${source.name}) з українським дубляжем`
      : `Офіційний реліз ${resClass.label} з українським дубляжем`,
  }
}

/**
 * Перевіряє, що сторінка кандидата відноситься до того самого фільму, що й постер.
 * Рік зі сторінки — авторитетне джерело identity.
 *
 * FAIL-CLOSED: якщо рік не вдалося встановити ЗА ДЖОДНОЮ СТОРОНОЮ —
 * кандидат відхиляється. Раніше тут було `return true`, що дозволяло
 * неперевіреному результату виглядати як перевірений.
 */
function isSameRelease(pageYear, targetYear) {
  if (!Number.isInteger(pageYear) || !Number.isInteger(targetYear)) return false
  return Math.abs(pageYear - targetYear) <= YEAR_TOLERANCE
}

/**
 * Перевіряє, що тип контенту кандидата збігається з запитом
 * (фільм ≠ серіал — щоб не показати сторінку серіалу для фільму).
 */
function isSameMediaType(href, mediaType) {
  if (!mediaType || !href) return true
  if (mediaType === 'movie' && /\/serials\//.test(href)) return false
  if (mediaType === 'series' && /\/films\//.test(href)) return false
  return true
}

/**
 * 1. Парсинг UASerials.fm (Пріоритет #1: Ashdi 1080p/4K BDRip)
 */
async function searchUASerials(title, origTitle, year, mediaType) {
  const queries = [title, origTitle].filter(Boolean)
  const targetYr = year ? parseInt(String(year), 10) : null

  for (const q of queries) {
    try {
      const body = new URLSearchParams({ do: 'search', subaction: 'search', story: q })
      const res = await httpGet('https://uaserials.fm/index.php?do=search', {
        method: 'POST',
        body: body.toString(),
        allowedHosts: ['uaserials.fm'],
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        referer: 'https://uaserials.fm/',
        timeout: 9000,
      })

      if (!res.ok) continue
      const html = await res.text()
      const $ = cheerio.load(html)
      const candidates = []

      $('article, .short-item, .uas-card, a.uas-card').each((i, el) => {
        const a = $(el).is('a') ? $(el) : $(el).find('a').first()
        // Ліміт довжини — Levenshtein O(m×n): 2 МБ назви = ~1 с на пару.
        const t = ($(el).find('.uas-card__title, .th-title, h2').text().trim() || a.text().trim()).slice(0, MAX_TITLE_LEN)
        // Оригінальна назва — ОКРЕМЕ структуроване поле (.th-title-oname).
        const oname = $(el).find('.th-title-oname').first().text().trim().slice(0, MAX_TITLE_LEN)
        const rawYear = $(el).find('.uas-card__year, .year').first().text().trim()
        // Рік приймаємо ТІЛЬКИ якщо це чистий рік — інакше це не структуроване поле
        const yearText = /^\s*(19[3-9]\d|20[0-4]\d)\s*$/.test(rawYear) ? rawYear : ''
        const href = a.attr('href')
        if (href && (href.includes('/films/') || href.includes('/serials/'))) {
          candidates.push({ title: t, oname, href, yearText })
        }
      })

      if (!candidates.length) continue

      // Строгий identity gate: лише кандидати зі збігом назви та без суперечності року
      const matches = findBestMatches(candidates, { title, origTitle, year }, 3)
      if (!matches.length) continue

      for (const m of matches) {
        const match = m.candidate
        const pageUrl = safePageUrl(match.href, 'uaserials.fm')
        if (!pageUrl) continue
        const pRes = await httpGet(pageUrl, {
          allowedHosts: ['uaserials.fm'],
          referer: 'https://uaserials.fm/',
          timeout: 9000,
        })

        if (!pRes.ok) continue
        const pHtml = await pRes.text()
        const $p = cheerio.load(pHtml)

        // ─── ЖОРСТКА ВЕРИФІКАЦІЯ IDENTITY ───
        // Рік зі сторінки — авторитетне джерело. Якщо він суперечить постеру —
        // це інший фільм, пропускаємо кандидата повністю.
        const pageYear = extractPageYear(pHtml)
        if (!isSameRelease(pageYear, targetYr)) {
          console.log(`  [UASerials] REJECT "${sanitizeLog(match.title)}" — рік на сторінці ${pageYear} ≠ постер ${targetYr}`)
          continue
        }
        if (!isSameMediaType(match.href, mediaType)) continue

        let ashdiIframe = null
        let hdvbIframe = null

        $p('iframe').each((i, el) => {
          const src = $p(el).attr('src') || $p(el).attr('data-src')
          if (!src) return
          const normalized = src.startsWith('//') ? 'https:' + src : src
          // Перевіряємо ХОСТ, а не підрядок у рядку — інакше
          // «https://ashdi.vip.evil.tld/» пройшов би перевірку.
          const host = (() => { try { return new URL(normalized).hostname.toLowerCase() } catch (e) { return '' } })()
          if (host === 'ashdi.vip' || host.endsWith('.ashdi.vip')) {
            ashdiIframe = safeEmbedUrl(normalized, ['ashdi.vip'])
          } else if (host === 'hdvbua.pro' || host.endsWith('.hdvbua.pro')) {
            hdvbIframe = safeEmbedUrl(normalized, ['hdvbua.pro'])
          }
        })

        if (ashdiIframe) {
          let hlsUrl = null
          let frameHtml = ''

          try {
            const aRes = await httpGet(ashdiIframe, {
              allowedHosts: ALLOWED_EMBED_HOSTS,
              referer: 'https://uaserials.fm/',
              timeout: 8000,
            })
            if (aRes.ok) {
              frameHtml = await aRes.text()
              hlsUrl = extractHlsUrl(frameHtml)
            }
          } catch (e) {
            console.warn('[Ashdi fetch error]:', sanitizeLog(e.message))
          }

          // ГАРАНТІЯ ВІДТВОРЮВАНОСТІ: мертвий потік тут же пропускаємо
          // і пробуємо наступного кандидата (наступна сторінка того ж
          // сайту → інші сайти), замість віддавати клієнту 404-маніфест.
          const probe = await probeStreamHls(hlsUrl)
          if (hlsUrl && !probe.live) {
            console.log(`  [Stream] SKIP "${sanitizeLog(match.title)}" — потік недоступний (${probe.reason})`)
            continue
          }
          const qualityInfo = analyzeReleaseQuality(hlsUrl, pHtml, probe.resolution, frameHtml)

          // Quality gate: CAMRip/TS та невідома/низька якість не показуємо
          if (qualityInfo.isCamrip || !qualityInfo.isHighQuality) {
            console.log(`  [UASerials] SKIP "${sanitizeLog(match.title)}" — якість не прийнятна (${qualityInfo.qualityBadge})`)
            continue
          }

          return {
            sourceName: `UASerials (Ashdi ${qualityInfo.qualityBadge})`,
            title: match.title,
            matchedYear: pageYear,
            pageUrl,
            iframeUrl: ashdiIframe,
            ashdiIframe,
            hdvbIframe,
            hlsUrl,
            ...qualityInfo,
            language: 'Українська (Багатоголосий дубляж)'
          }
        }

        if (hdvbIframe) {
          let hlsUrl = null
          let frameHtml = ''
          try {
            const hRes = await httpGet(hdvbIframe, {
              allowedHosts: ALLOWED_EMBED_HOSTS,
              referer: 'https://uaserials.fm/',
              timeout: 8000,
            })
            if (hRes.ok) {
              frameHtml = await hRes.text()
              hlsUrl = extractHlsUrl(frameHtml)
            }
          } catch (e) {}

          // ГАРАНТІЯ ВІДТВОРЮВАНОСТІ: мертвий потік тут же пропускаємо
          // і пробуємо наступного кандидата (наступна сторінка того ж
          // сайту → інші сайти), замість віддавати клієнту 404-маніфест.
          const probe = await probeStreamHls(hlsUrl)
          if (hlsUrl && !probe.live) {
            console.log(`  [Stream] SKIP "${sanitizeLog(match.title)}" — потік недоступний (${probe.reason})`)
            continue
          }
          const qualityInfo = analyzeReleaseQuality(hlsUrl, pHtml, probe.resolution, frameHtml)

          if (qualityInfo.isCamrip || !qualityInfo.isHighQuality) {
            console.log(`  [UASerials] SKIP "${sanitizeLog(match.title)}" — якість не прийнятна (${qualityInfo.qualityBadge})`)
            continue
          }

          return {
            sourceName: `UASerials (HDVB ${qualityInfo.qualityBadge})`,
            title: match.title,
            matchedYear: pageYear,
            pageUrl,
            iframeUrl: hdvbIframe,
            hdvbIframe,
            hlsUrl,
            ...qualityInfo,
            language: 'Українська (Дубляж)'
          }
        }
      }
    } catch (err) {
      // Скасування клієнтом — не «м'яка» помилка, а припинення пошуку.
      if (err && (err.name === 'AbortError' || err.type === 'aborted')) throw err
      console.warn(`[UASerials query "${sanitizeLog(q)}" failed]:`, sanitizeLog(err.message))
    }
  }

  return null
}

/**
 * 2. Парсинг UAFLIX / uafix.net (Пріоритет #2: Zetvideo 1080p BDRemux Hurtom)
 */
async function searchUafix(title, origTitle, year, mediaType) {
  const queries = [title, origTitle].filter(Boolean)
  const targetYr = year ? parseInt(String(year), 10) : null

  for (const q of queries) {
    try {
      const url = `https://uafix.net/index.php?do=search&subaction=search&story=${encodeURIComponent(q)}`
      const res = await httpGet(url, {
        allowedHosts: ['uafix.net'],
        referer: 'https://uafix.net/',
        timeout: 9000,
      })

      if (!res.ok) continue
      const html = await res.text()
      const $ = cheerio.load(html)
      const candidates = []

      $('.sres-wrap, article, .short-item').each((i, el) => {
        const h2 = $(el).find('h2')
        const a = h2.find('a').length ? h2.find('a') : $(el).find('a').first()
        const fullTitle = (h2.text().trim() || a.text().trim()).slice(0, 120)
        const href = a.attr('href') || h2.closest('a').attr('href')

        if (href && (href.includes('/films/') || href.includes('/serials/'))) {
          // Рік у картці пошуку НЕ беремо: «Назва (2026)» — це текст назви,
          // а не структуроване поле. Рік підтверджується ТІЛЬКИ на сторінці
          // фільму через extractPageYear (структуроване поле).
          candidates.push({
            title: fullTitle,
            href,
            yearText: ''
          })
        }
      })

      if (!candidates.length) continue

      const matches = findBestMatches(candidates, { title, origTitle, year }, 4)
      if (!matches.length) continue

      for (const m of matches) {
        const match = m.candidate
        const pageUrl = safePageUrl(match.href, 'uafix.net')
        if (!pageUrl) continue
        const pRes = await httpGet(pageUrl, {
          allowedHosts: ['uafix.net'],
          referer: 'https://uafix.net/',
          timeout: 9000,
        })

        if (!pRes.ok) continue
        let pHtml = await pRes.text()
        let $p = cheerio.load(pHtml)

        // ─── ЖОРСТКА ВЕРИФІКАЦІЯ IDENTITY ───
        const pageYear = extractPageYear(pHtml)
        if (!isSameRelease(pageYear, targetYr)) {
          console.log(`  [UAFLIX] REJECT "${sanitizeLog(match.title)}" — рік на сторінці ${pageYear} ≠ постер ${targetYr}`)
          continue
        }
        if (!isSameMediaType(match.href, mediaType)) continue

        const collectIframe = () => {
          let found = null
          $p('iframe').each((i, el) => {
            const src = $p(el).attr('src') || $p(el).attr('data-src')
            if (!src) return
            const normalized = src.startsWith('//') ? 'https:' + src : src
            // Тільки з allow-list доменів плеєрів — інакше це SSRF
            const safe = safeEmbedUrl(normalized, ALLOWED_EMBED_HOSTS)
            if (!safe) return
            // Пропускаємо YouTube-трейлери
            if (safe.includes('youtube.com') || safe.includes('youtu.be')) return
            found = safe
            return false
          })
          return found
        }

        let iframeUrl = collectIframe()
        if (!iframeUrl) {
          // Прямий запит із хостингу може повернути «легку» сторінку лише з
          // трейлером. Пробуємо той самий URL через relay (перевіряємо рік,
          // щоб не підмінити інший реліз).
          try {
            const relayRes = await httpGetViaRelay(pageUrl, { referer: 'https://uafix.net/' })
            if (relayRes.ok) {
              const relayHtml = await relayRes.text()
              if (isSameRelease(extractPageYear(relayHtml), targetYr)) {
                pHtml = relayHtml
                $p = cheerio.load(pHtml)
                iframeUrl = collectIframe()
              }
            }
          } catch (e) {
            console.warn('[UAFLIX] relay недоступний:', sanitizeLog(e.message))
          }
        }

        if (iframeUrl) {
          let hlsUrl = null
          let frameHtml = ''
          try {
            const ifrRes = await httpGet(iframeUrl, {
              allowedHosts: ALLOWED_EMBED_HOSTS,
              referer: 'https://uafix.net/',
              timeout: 8000,
            })
            if (ifrRes.ok) {
              frameHtml = await ifrRes.text()
              hlsUrl = extractHlsUrl(frameHtml)
            }
            if (!hlsUrl) {
              const relayIfr = await httpGetViaRelay(iframeUrl, { referer: 'https://uafix.net/' })
              if (relayIfr.ok) {
                const relayFrame = await relayIfr.text()
                if (extractHlsUrl(relayFrame)) {
                  frameHtml = relayFrame
                  hlsUrl = extractHlsUrl(frameHtml)
                }
              }
            }
          } catch (e) {}

          // ГАРАНТІЯ ВІДТВОРЮВАНОСТІ: мертвий потік тут же пропускаємо
          // і пробуємо наступного кандидата (наступна сторінка того ж
          // сайту → інші сайти), замість віддавати клієнту 404-маніфест.
          let probe = await probeStreamHls(hlsUrl)
          if (hlsUrl && !probe.live) {
            // Хостинг може бачити CDN інакше, ніж relay — пробуємо
            // підтвердити потік через relay перед відмовою.
            try {
              const relayMaster = await httpGetViaRelay(hlsUrl)
              if (relayMaster.ok) {
                const master = await relayMaster.text()
                if (/#EXTM3U/i.test(master)) {
                  const res = [...master.matchAll(/RESOLUTION=(\d+)x(\d+)/gi)].map(m => ({
                    width: parseInt(m[1], 10), height: parseInt(m[2], 10),
                  }))
                  probe = { live: true, resolution: res.length ? res.reduce((a, b) => b.width > a.width ? b : a) : null, reason: null }
                }
              }
            } catch (e) {}
          }
          if (hlsUrl && !probe.live) {
            console.log(`  [Stream] SKIP "${sanitizeLog(match.title)}" — потік недоступний (${probe.reason})`)
            continue
          }
          const qualityInfo = analyzeReleaseQuality(hlsUrl, pHtml, probe.resolution, frameHtml)

          if (qualityInfo.isCamrip || !qualityInfo.isHighQuality) {
            console.log(`  [UAFLIX] SKIP "${sanitizeLog(match.title)}" — якість не прийнятна (${qualityInfo.qualityBadge})`)
            continue
          }

          return {
            sourceName: `UAFLIX (Zetvideo ${qualityInfo.qualityBadge})`,
            title: match.title,
            matchedYear: pageYear,
            pageUrl,
            iframeUrl,
            hlsUrl,
            ...qualityInfo,
            language: 'Українська (Hurtom / Дубляж)'
          }
        }
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.type === 'aborted')) throw err
      console.warn(`[Uafix query "${sanitizeLog(q)}" failed]:`, sanitizeLog(err.message))
    }
  }

  return null
}

/**
 * 3. Парсинг Eneyida.tv (Пріоритет #3: HDVB)
 */
async function searchEneyida(title, origTitle, year, mediaType) {
  const queries = [title, origTitle].filter(Boolean)
  const targetYr = year ? parseInt(String(year), 10) : null

  for (const q of queries) {
    try {
      const body = new URLSearchParams({ do: 'search', subaction: 'search', story: q })
      const res = await httpGet('https://eneyida.tv/index.php?do=search', {
        method: 'POST',
        body: body.toString(),
        allowedHosts: ['eneyida.tv'],
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        referer: 'https://eneyida.tv/',
        timeout: 9000,
      })

      if (!res.ok) continue
      const html = await res.text()
      const $ = cheerio.load(html)
      const candidates = []

      $('article').each((i, el) => {
        const a = $(el).find('a').first()
        const t = $(el).find('.short_title, h2').text().trim().slice(0, MAX_TITLE_LEN)
        const sub = $(el).find('.short_subtitle').text().trim().slice(0, MAX_TITLE_LEN)
        const href = a.attr('href')
        if (href) {
          // Підпис картки має вигляд «2024 • Dune: Prophecy»:
          //   «2024»            — рік релізу;
          //   «Dune: Prophecy»  — оригінальна назва.
          // Це структуроване поле картки, тому розбираємо його окремо
          // (і НЕ передаємо як безukiйний subtitle — інакше він був би
          //  дозволеним title-аліасом і підмикав би identity gate).
          const m = sub.match(/^\s*(19[3-9]\d|20[0-4]\d)\s*[•·|–—-]\s*(.+?)\s*$/)
          const yearText = m
            ? m[1]
            : (/^\s*(19[3-9]\d|20[0-4]\d)\s*$/.test(sub) ? sub.trim() : '')
          const origTitle = m ? m[2].slice(0, MAX_TITLE_LEN) : ''
          candidates.push({ title: t, origTitle, href, yearText })
        }
      })

      if (!candidates.length) continue

      const matches = findBestMatches(candidates, { title, origTitle, year }, 3)
      if (!matches.length) continue

      for (const m of matches) {
        const match = m.candidate
        const pageUrl = safePageUrl(match.href, 'eneyida.tv')
        if (!pageUrl) continue
        const pRes = await httpGet(pageUrl, {
          allowedHosts: ['eneyida.tv'],
          referer: 'https://eneyida.tv/',
          timeout: 9000,
        })

        if (!pRes.ok) continue
        const pHtml = await pRes.text()
        const $p = cheerio.load(pHtml)

        // ─── ЖОРСТКА ВЕРИФІКАЦІЯ IDENTITY ───
        const pageYear = extractPageYear(pHtml)
        if (!isSameRelease(pageYear, targetYr)) {
          console.log(`  [Eneyida] REJECT "${sanitizeLog(match.title)}" — рік на сторінці ${pageYear} ≠ постер ${targetYr}`)
          continue
        }
        if (!isSameMediaType(match.href, mediaType)) continue

        let iframeUrl = null

        $p('iframe').each((i, el) => {
          const src = $p(el).attr('src') || $p(el).attr('data-src')
          if (!src) return
          const normalized = src.startsWith('//') ? 'https:' + src : src
          // Пропускаємо трейлери (?tr=1) і YouTube
          if (normalized.includes('?tr=1')) return
          const safe = safeEmbedUrl(normalized, ALLOWED_EMBED_HOSTS)
          if (!safe) return
          if (safe.includes('youtube.com') || safe.includes('youtu.be')) return
          iframeUrl = safe
          return false
        })

        if (iframeUrl) {
          let hlsUrl = null
          let frameHtml = ''
          try {
            const ifrRes = await httpGet(iframeUrl, {
              allowedHosts: ALLOWED_EMBED_HOSTS,
              referer: pageUrl,
              timeout: 8000,
            })
            if (ifrRes.ok) {
              frameHtml = await ifrRes.text()
              hlsUrl = extractHlsUrl(frameHtml)
            }
          } catch (e) {}

          // ГАРАНТІЯ ВІДТВОРЮВАНОСТІ: мертвий потік тут же пропускаємо
          // і пробуємо наступного кандидата (наступна сторінка того ж
          // сайту → інші сайти), замість віддавати клієнту 404-маніфест.
          const probe = await probeStreamHls(hlsUrl)
          if (hlsUrl && !probe.live) {
            console.log(`  [Stream] SKIP "${sanitizeLog(match.title)}" — потік недоступний (${probe.reason})`)
            continue
          }
          const qualityInfo = analyzeReleaseQuality(hlsUrl, pHtml, probe.resolution, frameHtml)

          if (qualityInfo.isCamrip || !qualityInfo.isHighQuality) {
            console.log(`  [Eneyida] SKIP "${sanitizeLog(match.title)}" — якість не прийнятна (${qualityInfo.qualityBadge})`)
            continue
          }

          return {
            sourceName: `Eneyida (HDVB ${qualityInfo.qualityBadge})`,
            title: match.title,
            matchedYear: pageYear,
            pageUrl: pageUrl,
            iframeUrl,
            hlsUrl,
            ...qualityInfo,
            language: 'Українська (Офіційний дубляж)'
          }
        }
      }
    } catch (err) {
      if (err && (err.name === 'AbortError' || err.type === 'aborted')) throw err
      console.warn(`[Eneyida query "${sanitizeLog(q)}" failed]:`, sanitizeLog(err.message))
    }
  }

  return null
}

// ───────────────────────────────────────────────
// GET /api/stream/ua?title=...&orig=...&year=...&type=movie|series
// ───────────────────────────────────────────────
app.get('/api/stream/ua', async (req, res) => {
  // ── Валідація входу ────────────────────────────────────────────
  // Заголовки запиту можуть бути масивами (повторюваний параметр) —
  // беремо лише рядкові значення.
  const rawTitle = typeof req.query.title === 'string' ? req.query.title.trim() : ''
  const rawOrig = typeof req.query.orig === 'string' ? req.query.orig.trim() : ''
  const rawYear = typeof req.query.year === 'string' ? req.query.year.trim() : ''
  const rawType = typeof req.query.type === 'string' ? req.query.type.trim() : 'movie'

  const title = rawTitle.slice(0, MAX_TITLE_LEN)
  const orig = rawOrig.slice(0, MAX_TITLE_LEN)

  if (!title && !orig) {
    return res.status(400).json({ error: 'Потрібно вказати title або orig' })
  }

  // Рік ОБОВ'ЯЗКОВИЙ: без нього identity-гейт не працює (рік — головний
  // дискримінатор для однойменних фільмів, напр. «Воно» 1990 vs 2017).
  const year = parseYear(rawYear)
  if (!year) {
    return res.status(400).json({ error: 'Потрібно вказати коректний year (напр. 2026)' })
  }

  const type = (rawType === 'series' || rawType === 'movie') ? rawType : null
  if (!type) {
    return res.status(400).json({ error: 'type має бути movie або series' })
  }

  // Ключ кешу — JSON масив, щоб «a_b» + «c» не зливалися з «a» + «b_c»
  const cacheKey = JSON.stringify([title, orig, year, type])
  const cached = streamCache.get(cacheKey)
  if (cached) {
    if (cached.expiresAt > Date.now()) {
      return res.json(cached.data)
    }
    streamCache.delete(cacheKey)
  }

  // ── Rate-limit ───────────────────────────────────────────────────
  // Кешований відповідь не витрачає бюджет (він не йде в мережу).
  const rl = rateLimitHit(req)
  if (!rl.allowed) {
    res.set('Retry-After', String(rl.retryAfter))
    console.warn(`[Rate Limit] Відхилено запит для ${clientKey(req)} — перевищено ${RATE_LIMIT_MAX}/хв`)
    return res.status(429).json({ error: 'Забагато запитів пошуку. Спробуйте за хвилину.' })
  }

  // ── In-flight cap ────────────────────────────────────────────────
  if (inflightSearches >= MAX_INFLIGHT_SEARCHES) {
    console.warn('[Rate Limit] Відхилено запит — досягнуто ліміту одночасних пошуків')
    return res.status(429).json({ error: 'Забагато одночасних пошуків. Спробуйте за мить.' })
  }
  inflightSearches++

  // Клієнт закрив з'єднання → припиняємо всі upstream-запити.
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) {
      try { controller.abort() } catch (e) {}
    }
  })

  console.log(`\n[Stream Search] Шукаємо напряму для: "${sanitizeLog(title || orig)}" (рік: ${year})...`)

  const reqOrigin = getReqOrigin(req)
  try {
    // Усі вкладені httpGet() підхоплять signal із контексту.
    const result = await requestContext.run({ signal: controller.signal, origin: reqOrigin }, async () => {
      // УНІВЕРСАЛЬНИЙ ПОШУК: усі джерела ПАРАЛЕЛЬНО, потім обираємо
      // найкращий реліз за якістю (pickBestStreamResult). Раніше був
      // каскад «перший збіг виграє»: UASerials із 720p WEBRip перебивав
      // UAFLIX із 1080p BDRemux, і користувач системно отримував гіршу
      // якість, ніж була на платформах.
      //
      // Джерело, що впало (timeout/DNS), участі у виборі не бере —
      // одне мертве джерело не ламає пошук і не сповільнює інші.
      const settled = await Promise.allSettled([
        searchUASerials(title, orig, year, type),
        searchUafix(title, orig, year, type),
        searchEneyida(title, orig, year, type),
      ])

      const candidates = []
      for (const s of settled) {
        if (s.status === 'fulfilled') {
          if (s.value) candidates.push(s.value)
          continue
        }
        // Скасування клієнтом має пробити всі шари — інакше 499
        // перетворюється на звичайне «не знайдено».
        const err = s.reason
        if (err && (err.name === 'AbortError' || err.type === 'aborted')) throw err
        console.warn('[Stream Search] джерело недоступне:', sanitizeLog(err && err.message ? err.message : String(err)))
      }

      return pickBestStreamResult(candidates)
    })

    if (result) {
      // Клієнт ніколи не отримує прямий upstream HLS: усі маніфести й
      // сегменти йдуть через локальний relay, щоб не залежати від CORS
      // стороннього плеєра.
      const clientHlsUrl = result.hlsUrl ? buildHlsProxyUrl(result.hlsUrl, reqOrigin) : null
      const responseData = {
        success: true,
        ...result,
        hlsUrl: clientHlsUrl,
        requestedTitle: title || orig,
        requestedYear: year
      }
      setCache(cacheKey, responseData)
      console.log(`[Stream Found] Точний збіг: "${sanitizeLog(result.title)}" (${result.matchedYear || '?'}) [${result.qualityBadge}] -> ${result.sourceName}`)
      return res.json(responseData)
    }

    console.log('[Stream Not Found] Точний реліз не знайдено (відхилено за невідповідністю назви/року або низькою якістю)')
    return res.json({
      success: false,
      message: 'Фільм не знайдено або результати пошуку не відповідають назві, року та якості'
    })
  } catch (err) {
    if (err && (err.name === 'AbortError' || err.type === 'aborted')) {
      console.warn('[Stream Search] Запит скасовано клієнтом — upstream-роботу припинено')
      return res.status(499).json({ error: 'Запит скасовано' })
    }
    console.error('[Stream Search Error]:', sanitizeLog(err && err.message ? err.message : String(err)))
    // Не віддаємо внутрішні деталі (URL-и, DNS-помилки) назовні
    return res.status(500).json({ error: 'Внутрішня помилка пошуку джерела' })
  } finally {
    inflightSearches--
  }
})

// ───────────────────────────────────────────────
// GET /api/hls?url=<upstream HLS URL>&sig=<HMAC>
//
// Локальний relay для HLS. Потрібен, бо upstream-сегменти мають CORS,
// який дозволяє лише origin самого плеєра (напр. https://ashdi.vip), а
// AlexFilm працює з http://localhost:5173. Relay переписує маніфест і
// віддає сегменти через дозволений локальний origin.
//
// Relay НЕ є open-proxy: кожен URL підписано HMAC-ом (секрет живе тільки
// в пам'яті процесу), а для клієнта діють окремі ліміти на кількість
// запитів, одночасних з'єднань і сумарний обсяг трафіку.
// ───────────────────────────────────────────────

// Стан relay-лімітів per client (ключ — IP).
const hlsClientState = new Map()

function hlsClientBucket(key) {
  const now = Date.now()
  let bucket = hlsClientState.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { requests: 0, bytes: 0, inflight: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    hlsClientState.set(key, bucket)
  }
  return bucket
}

/**
 * Резервує «слот» для HLS-запиту. Повертає false, якто кліент уже
 * вичерпав ліміт запитів або має забагато одночасних з'єднань.
 */
function acquireHlsSlot(key) {
  const bucket = hlsClientBucket(key)
  bucket.requests++
  if (bucket.requests > MAX_HLS_REQUESTS_PER_MINUTE) return false
  if (bucket.inflight >= MAX_HLS_INFLIGHT_PER_CLIENT) return false
  bucket.inflight++
  return true
}

/**
 * Повертає слот і враховує переданий обсяг у хвилинному бюджеті.
 */
function releaseHlsSlot(key, bytes = 0) {
  const bucket = hlsClientBucket(key)
  if (bucket.inflight > 0) bucket.inflight--
  bucket.bytes += bytes
}

/**
 * Чи не перевищено хвилинний бюджет трафіку для клієнта.
 */
function hlsBudgetExceeded(key) {
  return hlsClientBucket(key).bytes > MAX_HLS_BYTES_PER_MINUTE
}

/**
 * Читає тіло відповіді з жорстким лімітом (буфер у пам'яті).
 */
async function readBodyLimited(response, maxBytes) {
  if (!response.body) return Buffer.alloc(0)
  const chunks = []
  let total = 0
  for await (const chunk of response.body) {
    const buf = Buffer.from(chunk)
    total += buf.length
    if (total > maxBytes) throw new Error('HLS-ресурс перевищує ліміт розміру')
    chunks.push(buf)
  }
  return Buffer.concat(chunks, total)
}

app.get('/api/hls', async (req, res) => {
  const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : ''
  const signature = typeof req.query.sig === 'string' ? req.query.sig.trim() : ''
  if (!rawUrl) {
    return res.status(400).json({ error: 'Потрібно вказати HLS URL' })
  }

  // Авторизація: relay приймає лише URL, який сам сервер видав і підписав.
  // Без перевірки підпису /api/hls був би open-proxy для довільних шляхів
  // на дозволених доменах.
  if (!verifyHlsTargetSignature(rawUrl, signature)) {
    return res.status(400).json({ error: 'HLS URL поза allow-list або небезпечний' })
  }

  // SSRF: лише HTTPS, стандартний порт, без credentials і лише з
  // allow-list доменів плеєрів.
  const upstreamUrl = safeEmbedUrl(rawUrl, ALLOWED_EMBED_HOSTS)
  if (!upstreamUrl) {
    return res.status(400).json({ error: 'HLS URL поза allow-list або небезпечний' })
  }

  let upstreamParsed
  try {
    upstreamParsed = new URL(upstreamUrl)
  } catch (e) {
    return res.status(400).json({ error: 'Некоректний HLS URL' })
  }

  // Ліміти relay-а (окремо від пошуку): HLS.js завантажує сотні сегментів.
  // Назва змінної НЕ clientKey: локальний const перекривав би функцію
  // clientKey(req) і ми отримували б ReferenceError (TDZ) → HTTP 500.
  const hlsClientId = clientKey(req)
  if (!acquireHlsSlot(hlsClientId)) {
    res.set('Retry-After', '2')
    return res.status(429).json({ error: 'Забагато паралельних HLS-запитів' })
  }
  let released = false
  let sentBytes = 0
  const release = () => {
    if (released) return
    released = true
    releaseHlsSlot(hlsClientId, sentBytes)
  }

  // Upstream очікує Referer кореневого домену плеєра. Для сегментів на
  // піддомені (jk29….ashdi.vip) саме корінь ashdi.vip є правильним
  // Referer і не змінює allow-list відповіді.
  const refererRoot = ALLOWED_EMBED_HOSTS.find(h => hostAllowed(upstreamParsed.hostname, [h]))
  const referer = `https://${refererRoot || upstreamParsed.hostname}/`
  const reqOrigin = getReqOrigin(req)

  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) {
      try { controller.abort() } catch (e) {}
    }
  })

  // Relay ніколи не віддає HTML/JS з upstream — лише медіа.
  res.set('X-Content-Type-Options', 'nosniff')
  res.set('Cross-Origin-Resource-Policy', 'cross-origin')

  const looksLikeManifest = /\.m3u8$/i.test(upstreamParsed.pathname)
  const requestHeaders = {
    'Accept': 'application/vnd.apple.mpegurl, application/x-mpegURL, video/mp2t, */*',
  }
  // Range має сенс лише для сегментів: частковий маніфест переписувати небезпечно.
  if (!looksLikeManifest && isValidRangeHeader(req.headers.range)) {
    requestHeaders['Range'] = String(req.headers.range).slice(0, 100)
  }

  try {
    const upstreamRes = await httpGet(upstreamUrl, {
      allowedHosts: ALLOWED_EMBED_HOSTS,
      headers: requestHeaders,
      referer,
      timeout: 15000,
      maxBytes: looksLikeManifest ? MAX_HLS_PLAYLIST_BYTES : MAX_HLS_SEGMENT_BYTES,
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      signal: controller.signal,
    })

    const rawContentType = upstreamRes.headers.get('content-type') || ''
    const contentType = rawContentType.split(';')[0].trim().toLowerCase()
    const declaredManifest = looksLikeManifest || /mpegurl|m3u8/i.test(contentType)

    if (!upstreamRes.ok) {
      // Не віддаємо тіло upstream- помилки (може бути HTML) — тільки JSON.
      await upstreamRes.text().catch(() => '')
      release()
      const status = upstreamRes.status >= 400 && upstreamRes.status < 600 ? upstreamRes.status : 502
      return res.status(status).json({ error: 'Upstream HLS-потік недоступний' })
    }

    // Базовий URL для відносних URI — фінальний URL після редиректів.
    const finalBase = safeEmbedUrl(upstreamRes.url || upstreamUrl, ALLOWED_EMBED_HOSTS) || upstreamUrl

    const sendManifest = (manifestText) => {
      // Fail-closed: маніфест визначається ЗА ВМІСТОМ (#EXTM3U), а не лише
      // за розширенням/content-type. Якщо upstream віддав HTML або будь-який
      // інший текст — ми НЕ переписуємо його й не віддаємо браузеру.
      const normalized = String(manifestText).replace(/^\uFEFF/, '').trimStart()
      if (!normalized.startsWith('#EXTM3U')) {
        throw new Error('Upstream віддав не HLS-маніфест')
      }
      const rewritten = rewriteHlsManifest(normalized, finalBase, reqOrigin)
      res.removeHeader('content-length')
      res.removeHeader('content-range')
      res.removeHeader('accept-ranges')
      res.set('Content-Type', 'application/vnd.apple.mpegurl')
      res.status(200).send(rewritten)
    }

    if (declaredManifest) {
      const manifest = await readBodyLimited(upstreamRes, MAX_HLS_PLAYLIST_BYTES)
      sentBytes = manifest.length
      sendManifest(manifest.toString('utf8'))
      release()
      return
    }

    if (!ALLOWED_HLS_CONTENT_TYPES.has(contentType || 'application/octet-stream')) {
      await upstreamRes.text().catch(() => '')
      release()
      return res.status(502).json({ error: 'Upstream повернув недопустимий тип контенту' })
    }

    // Копіюємо лише потрібні для HLS.js заголовки. Upstream CORS не
    // пересилаємо — локальний Express-CORS виставляє правильний origin.
    const passthroughHeaders = ['cache-control', 'etag', 'last-modified']
    for (const name of passthroughHeaders) {
      const value = upstreamRes.headers.get(name)
      if (value) res.set(name, value)
    }

    res.set('Content-Type', contentType || 'application/octet-stream')
    res.status(upstreamRes.status)

    if (req.method === 'HEAD' || !upstreamRes.body) {
      release()
      res.end()
      return
    }

    // Потік: читаємо перший чанк, щоб визначити тип контенту ЗА ЗНАЧЕННЯМ.
    // Маніфест без розширення .m3u8 (octet-stream) інакше «проскочив» би
    // повз переписування — і його внутрішні URI пішли б напряму в браузер.
    const iterator = upstreamRes.body[Symbol.asyncIterator]()
    let chunk = await iterator.next()

    if (chunk.done) {
      release()
      res.end()
      return
    }

    const head = Buffer.from(chunk.value)
    const headText = head.subarray(0, 64).toString('utf8').replace(/^\uFEFF/, '').trimStart()
    if (headText.startsWith('#EXTM3U')) {
      const chunks = [head]
      let total = head.length
      chunk = await iterator.next()
      while (!chunk.done) {
        const buf = Buffer.from(chunk.value)
        total += buf.length
        if (total > MAX_HLS_PLAYLIST_BYTES) throw new Error('HLS manifest завеликий')
        chunks.push(buf)
        chunk = await iterator.next()
      }
      sentBytes = total
      sendManifest(Buffer.concat(chunks, total).toString('utf8'))
      release()
      return
    }

    // Звичайний медіа-сегмент — стрімимо з урахуванням backpressure.
    const writeChunk = async (buf) => {
      sentBytes += buf.length
      if (hlsBudgetExceeded(hlsClientId)) {
        throw new Error('Перевищено хвилинний бюджет HLS-трафіку')
      }
      if (!res.write(buf)) {
        await once(res, 'drain')
      }
    }

    await writeChunk(head)
    chunk = await iterator.next()
    while (!chunk.done) {
      await writeChunk(Buffer.from(chunk.value))
      chunk = await iterator.next()
    }
    release()
    res.end()
  } catch (err) {
    release()
    if (res.headersSent) {
      try { res.destroy(err) } catch (e) {}
      return
    }
    if (err && (err.name === 'AbortError' || err.type === 'aborted')) {
      if (!res.writableEnded) res.status(499).json({ error: 'Запит скасовано' })
      return
    }
    console.warn('[HLS Proxy Error]:', sanitizeLog(err && err.message ? err.message : String(err)))
    res.status(502).json({ error: 'Не вдалося завантажити HLS-ресурс' })
  }
})

// ───────────────────────────────────────────────
// GET /api/tmdb/<tmdb-path>
//
// Проксі для TMDB, щоб API-ключ лишався на сервері і не потрапляв у
// клієнтський бандл. Дозволені лише read-only ендпоїнти каталогу.
// ───────────────────────────────────────────────
const tmdbBuckets = new Map()

// Один і той самий discover/detail-запит не має йти upstream щоразу —
// саме повторні запити з нашого Render-IP і викликали 429 від TMDB.
const TMDB_CACHE_TTL_MS = 10 * 60 * 1000
const TMDB_CACHE_MAX = 400
const tmdbCache = new Map()
const tmdbInflight = new Map()

function tmdbCacheGet(url) {
  const entry = tmdbCache.get(url)
  if (!entry) return null
  tmdbCache.delete(url)
  tmdbCache.set(url, entry)
  return entry
}

function tmdbCacheSet(url, body) {
  if (tmdbCache.size >= TMDB_CACHE_MAX) {
    const oldest = tmdbCache.keys().next()
    if (!oldest.done) tmdbCache.delete(oldest.value)
  }
  tmdbCache.set(url, { body, expiresAt: Date.now() + TMDB_CACHE_TTL_MS })
}

const tmdbWait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

async function fetchTmdbUpstream(url, signal) {
  let status = 502
  let body = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    const upstreamRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8',
      },
      timeout: 10000,
      redirect: 'manual',
      size: MAX_RESPONSE_BYTES,
      signal,
    })
    status = upstreamRes.status
    body = await upstreamRes.text()
    if (status !== 429 || signal?.aborted) break
    const retryAfter = Number(upstreamRes.headers.get('retry-after'))
    await tmdbWait(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 3000) : 400 * (attempt + 1))
    if (signal?.aborted) break
  }
  return { status, body }
}

function tmdbRateLimitHit(req) {
  const now = Date.now()
  const key = clientKey(req)
  let bucket = tmdbBuckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS }
    tmdbBuckets.set(key, bucket)
  }
  bucket.count++
  return bucket.count <= 240
}

/**
 * Дозволені лише read-only шляхи TMDB, які використовує застосунок.
 */
function isAllowedTmdbPath(path) {
  if (!path || typeof path !== 'string' || !path.startsWith('/')) return false
  if (path.includes('..')) return false
  const clean = path.replace(/\/+$/, '') || '/'
  return TMDB_ALLOWED_PATHS.some(re => re.test(clean))
}

/**
 * Будує upstream-URL TMDB: клієнтські query-параметри фільтруються,
  а api_key додається серверний (клієнтський ігнорується).
 */
function buildTmdbUpstreamUrl(path, query = {}) {
  const clean = String(path).replace(/\/+$/, '') || '/'
  const url = new URL(`${TMDB_BASE_URL}${clean}`)
  for (const [key, value] of Object.entries(query || {})) {
    if (!TMDB_ALLOWED_QUERY_KEYS.has(key)) continue
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item))
    } else if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value))
    }
  }
  url.searchParams.set('api_key', TMDB_API_KEY)
  return url.href
}

app.use('/api/tmdb', async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Метод не підтримується' })
  }

  const path = req.path || String(req.url || '').split('?')[0]
  if (!isAllowedTmdbPath(path)) {
    return res.status(400).json({ error: 'Недозволений TMDB шлях' })
  }

  const upstreamUrl = buildTmdbUpstreamUrl(path, req.query)
  const cached = tmdbCacheGet(upstreamUrl)
  const sendCached = (entry) => {
    res.status(200)
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.set('Cache-Control', 'public, max-age=300')
    res.send(entry.body)
  }

  if (cached && cached.expiresAt > Date.now()) return sendCached(cached)

  // Ліміт рахуємо лише для реальних upstream-запитів: кешовані відповіді
  // не витрачають квоту, тому 429 від нашого проксі тепер майже неможливий.
  if (!tmdbRateLimitHit(req)) {
    if (cached) return sendCached(cached)
    res.set('Retry-After', '10')
    return res.status(429).json({ error: 'Забагато запитів до TMDB' })
  }

  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) {
      try { controller.abort() } catch (e) {}
    }
  })

  let pending = tmdbInflight.get(upstreamUrl)
  if (!pending) {
    pending = fetchTmdbUpstream(upstreamUrl, controller.signal)
    tmdbInflight.set(upstreamUrl, pending)
    const started = pending
    pending.finally(() => {
      if (tmdbInflight.get(upstreamUrl) === started) tmdbInflight.delete(upstreamUrl)
    }).catch(() => {})
  }

  try {
    const result = await pending
    if (result.status === 200) {
      tmdbCacheSet(upstreamUrl, result.body)
    } else if (cached) {
      // TMDB тимчасово віддає 429/5xx — краще старі дані, ніж помилка в UI
      return sendCached(cached)
    }
    res.status(result.status)
    res.set('Content-Type', 'application/json; charset=utf-8')
    res.send(result.body)
  } catch (err) {
    if (cached && !(err && (err.name === 'AbortError' || err.type === 'aborted'))) {
      return sendCached(cached)
    }
    if (err && (err.name === 'AbortError' || err.type === 'aborted')) {
      if (!res.writableEnded) res.status(499).json({ error: 'Запит скасовано' })
      return
    }
    console.warn('[TMDB Proxy Error]:', sanitizeLog(err && err.message ? err.message : String(err)))
    res.status(502).json({ error: 'Не вдалося отримати дані TMDB' })
  }
})

// ───────────────────────────────────────────────
// GET /health
// ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  // `service` — це маркер, за яким start.bat відрізняє НАШ проксі від
  // будь-якого іншого процесу, що випадково слухає 3001. Без нього
  // батник не міг би зрозуміти, чи можна перезапускати сервер.
  res.json({ status: 'ok', service: 'alexfilm-ua-proxy', port: PORT })
})

// ───────────────────────────────────────────────
// Роздача зібраного фронтенду (kino-app/dist)
// ───────────────────────────────────────────────
const distPath = path.resolve(__dirname, '../kino-app/dist')
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath, {
    setHeaders: (res, filePath) => {
      // no-cache = завжди ревалідувати (нові релізи підхоплюються одразу),
      // але НЕ no-store: інакше Chromium вимикає bfcache і Samsung при
      // повороті екрана у повному екрані перезавантажує вкладку замість
      // відновлення.
      if (filePath.endsWith('index.html')) {
        res.setHeader('Cache-Control', 'no-cache')
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
      }
    }
  }))
  // Fallback для SPA (Vue Router HTML5 history mode) у Express 5
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/') && req.path !== '/health') {
      res.setHeader('Cache-Control', 'no-cache')
      return res.sendFile(path.join(distPath, 'index.html'))
    }
    next()
  })
}

// Сервер піднімається лише при прямому запуску (node server.js),
// щоб юніт-тести могли require() модуль без відкриття порту.
if (require.main === module) {
  const server = app.listen(PORT, HOST, () => {
    console.log(`\nAlexFilm UA Stream Server працює на http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`)
    console.log('   Парсинг UASerials.fm (Ashdi) + UAFLIX (Zetvideo) + Eneyida.tv (HDVB)')
    console.log('   Строгий identity gate: назва + рік (з перевіркою на сторінці), CAMRip відсікається')
    console.log(`   Слухає на ${HOST}:${PORT}\n`)
  })

  // Зрозуміла помилка замість стектрейсу: найчастіше порт уже займає
  // інший екземпляр сервера (напр. запущений раніше).
  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`\n[Помилка] Порт ${PORT} уже зайнятий іншим процесом.`)
      console.error('         Можливо, сервер уже запущено в іншому вікні — перевірте,')
      console.error(`         або звільніть порт:  netstat -ano | findstr :${PORT}\n`)
    } else {
      console.error('\n[Помилка] Не вдалося запустити сервер:', err && err.message, '\n')
    }
    process.exit(1)
  })
}

// Експорт чистих функцій — для юніт-тестів (сервер не піднімається при require)
module.exports = {
  app,
  probeStreamHls,
  pickBestStreamResult,
  ALLOWED_HLS_CONTENT_TYPES,
  extractPageYear,
  analyzeReleaseQuality,
  extractReleaseInfoText,
  isSameRelease,
  isSameMediaType,
  safePageUrl,
  safeEmbedUrl,
  hostAllowed,
  extractHlsUrl,
  buildHlsProxyUrl,
  rewriteHlsManifest,
  signHlsTarget,
  verifyHlsTargetSignature,
  isValidRangeHeader,
  isAllowedTmdbPath,
  buildTmdbUpstreamUrl,
  sanitizeLog,
  isAllowedOrigin,
}
