/**
 * Юніт-тести серверних гарантій: identity, якість, SSRF-захист.
 * Запуск: npm test (proxy-server)
 */

const test = require('node:test')
const assert = require('node:assert/strict')

const {
  app,
  pickBestStreamResult,
  ALLOWED_HLS_CONTENT_TYPES,
  extractPageYear,
  analyzeReleaseQuality,
  isSameRelease,
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
} = require('../server')

async function startTestServer(t) {
  const server = app.listen(0, '127.0.0.1')
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  t.after(() => new Promise(resolve => server.close(resolve)))
  return server
}

// ─── extractPageYear ───────────────────────────────────────────────
test('extractPageYear читає структуроване поле «Рік:» (UASerials/Eneyida)', () => {
  const html = `<html><head><title>Фільм «Одіссея» 2016 українською онлайн</title></head>
    <body><ul class="full_info" id="full_info">
      <li><span>Рік:</span> <a href="/xfsearch/year/2016/">2016</a></li>
      <li><span>Жанр:</span> фільм</li>
    </ul></body></html>`
  assert.equal(extractPageYear(html), 2016)
})

test('extractPageYear читає «Рік виходу:» (UAFLIX)', () => {
  const html = `<html><head><title>Одіссея (2026) дивитися онлайн</title></head>
    <body><ul class="finfo" id="finfo">
      <li class="vis"><span>Рік виходу:</span> <span itemprop="dateCreated" class="year">2026</span> / 172 хв</li>
    </ul></body></html>`
  assert.equal(extractPageYear(html), 2026)
})

test('extractPageYear НЕ бере рік з <title>/og:title (лише структуровані поля)', () => {
  // Регресія: раніше був fallback на першу паразитезовану групу в title —
  // «Одіссея (2016)» у заголовку проходило identity-gate без структурованого
  // підтвердження року. Тепер це заборонено (fail-closed).
  const html = '<html><head><title>Одіссея (2016) дивитися онлайн | UASerials 2026</title>' +
    '<meta property="og:title" content="Одіссея (2016)"></head><body></body></html>'
  assert.equal(extractPageYear(html), null)
})

test('extractPageYear читає «Рік:» БЕЗ class="year" (кирилиця + \\b не працює)', () => {
  // Регресія: /^Рік\\b/i не збігалось із «Рік:», бо \\b — ASCII word boundary
  const html = '<html><body><ul class="full_info"><li><span>Рік:</span> 2016</li></ul></body></html>'
  assert.equal(extractPageYear(html), 2016)
})

test('extractPageYear читає «Рік виходу:» без додаткової розмітки', () => {
  const html = '<html><body><ul class="finfo"><li><span>Рік виходу:</span> 2026 / 172 хв</li></ul></body></html>'
  assert.equal(extractPageYear(html), 2026)
})

test('extractPageYear читає xfsearch/year посилання', () => {
  const html = '<html><body><li><span>Рік:</span> <a href="/xfsearch/year/2021/">2021</a></li></body></html>'
  assert.equal(extractPageYear(html), 2021)
})

test('extractPageYear повертає null, якщо структурованого поля немає', () => {
  assert.equal(extractPageYear('<html><head><title>Фільм без року</title></head><body></body></html>'), null)
  assert.equal(extractPageYear(''), null)
  assert.equal(extractPageYear(null), null)
})

test('extractPageYear бере рік з поля «Рік:», а НЕ з року в назві', () => {
  // Регресія (HIGH): код читав ВЕСЬ текст батька і брав ПЕРШИЙ рік —
  // тобто 2001 з <h1>2001: A Space Odyssey</h1>, а не 1968 з поля «Рік:».
  const html = '<h1>2001: A Space Odyssey</h1><span>Рік:</span> 1968'
  assert.equal(extractPageYear(html), 1968)
})

test('extractPageYear не бере рік з назви, коли значення поля відсутнє', () => {
  // Значення поля нечитабельне → рік невідомий → fail-closed.
  const html = '<div class="film"><h1>2001: Космічна Одіссея</h1><span>Рік: невідомо</span></div>'
  assert.equal(extractPageYear(html), null)
})

test('extractPageYear ігнорує xfsearch/year у сайдбарі (поза блоком релізу)', () => {
  // На живих сторінках Eneyida у сайдбарі десятки чужих посилань на роки —
  // раніше перший знайдений домінував і міг підмінити рік релізу.
  const html = '<html><body><div class="sidebar">' +
    '<a href="/xfsearch/year/2024/">2024</a><a href="/xfsearch/year/2013/">2013</a>' +
    '<a href="/xfsearch/year/1984/">1984</a></div></body></html>'
  assert.equal(extractPageYear(html), null)
})

test('extractPageYear бере рік з xfsearch/year усередині блоку релізу', () => {
  const html = '<html><body><ul class="full_info" id="full_info">' +
    '<li><span>Рік:</span> <a href="/xfsearch/year/2021/">2021</a></li></ul></body></html>'
  assert.equal(extractPageYear(html), 2021)
})

test('extractPageYear бере рік, коли значення йде одразу після лейбла', () => {
  // Реальна розмітка UAFLIX: «Рік виходу: 2026 / 172 хв / 16+»
  const html = '<html><body><ul class="finfo" id="finfo">' +
    '<li class="vis"><span>Рік виходу:</span> <span itemprop="dateCreated" class="year">2026</span> / 172 хв / 16+</li>' +
    '</ul></body></html>'
  assert.equal(extractPageYear(html), 2026)
})

// ─── isSameRelease (fail-closed) ───────────────────────────────────
test('isSameRelease: точний рік проходить', () => {
  assert.equal(isSameRelease(2026, 2026), true)
})

test('isSameRelease: ±1 допускається, ±2 — ні', () => {
  assert.equal(isSameRelease(2025, 2026), true)
  assert.equal(isSameRelease(2027, 2026), true)
  assert.equal(isSameRelease(2024, 2026), false)
})

test('isSameRelease FAIL-CLOSED: невідомий рік на сторінці — відмова', () => {
  // Регресія: раніше `if (!targetYear || !pageYear) return true` →
  // неперевірений кандидат проходив як «перевірений»
  assert.equal(isSameRelease(null, 2026), false)
  assert.equal(isSameRelease(undefined, 2026), false)
})

test('isSameRelease FAIL-CLOSED: невідомий цільовий рік — відмова', () => {
  assert.equal(isSameRelease(2026, null), false)
  assert.equal(isSameRelease(2026, NaN), false)
})

// ─── analyzeReleaseQuality ─────────────────────────────────────────
test('CAMRip у URL перемагає BDRip-текст на сторінці', () => {
  // Регресія: pageHtml з «1080p BDRip» піднімало екранаку до «1080p BDRip»
  const q = analyzeReleaseQuality(
    'https://ashdi.vip/hls/camrip_720p.m3u8',
    '<div>1080p BDRip</div>',
    { width: 1280, height: 720 }
  )
  assert.equal(q.isCamrip, true)
  assert.equal(q.isHighQuality, false)
})

test('реальна роздільна здатність має пріоритет над текстовими маркерами', () => {
  // Сторінка каже 1080p, а маніфест реально 1280x532 → це 720p
  const q = analyzeReleaseQuality(
    'https://ashdi.vip/hls/index.m3u8',
    '<ul class="finfo"><li>1080p BDRip</li></ul>',
    { width: 1280, height: 532 }
  )
  assert.equal(q.qualityBadge, '720p BDRip')
  assert.equal(q.isHighQuality, true)
})

test('класифікація за ШИРИНОЮ (letterbox 1920x800 = 1080p, 3840x1600 = 4K)', () => {
  const q1080 = analyzeReleaseQuality('https://ashdi.vip/hls/i.m3u8', '', { width: 1920, height: 800 })
  assert.equal(q1080.qualityBadge, '1080p')
  assert.equal(q1080.isHighQuality, true)

  const q4k = analyzeReleaseQuality('https://ashdi.vip/hls/i.m3u8', '', { width: 3840, height: 1600 })
  assert.equal(q4k.qualityBadge, '4K UHD')
  assert.equal(q4k.qualityRank, 4)

  const q720 = analyzeReleaseQuality('https://ashdi.vip/hls/i.m3u8', '', { width: 1280, height: 532 })
  assert.equal(q720.qualityBadge, '720p')
})

test('якість нижче 720p не приймається', () => {
  const q = analyzeReleaseQuality('https://ashdi.vip/hls/i.m3u8', '', { width: 854, height: 354 })
  assert.equal(q.isHighQuality, false)
})

test('невідома якість (без маніфесту й без маркерів) не приймається', () => {
  const q = analyzeReleaseQuality('https://ashdi.vip/hls/i.m3u8', '<div>щось</div>', null)
  assert.equal(q.isHighQuality, false)
  assert.equal(q.qualityBadge, 'Невідомо')
})

test('маркери в URL дають якість, коли маніфест недоступний', () => {
  const web = analyzeReleaseQuality('https://ashdi.vip/hls/movie.2026.1080p.webrip.x264.m3u8', '', null)
  assert.equal(web.qualityBadge, '1080p WEBRip')

  const bd = analyzeReleaseQuality('https://ashdi.vip/hls/movie.bdrip_1080p.m3u8', '', null)
  assert.equal(bd.qualityBadge, '1080p BDRip')

  const remux = analyzeReleaseQuality('https://ashdi.vip/hls/movie_2023_bdremux_1080p.m3u8', '', null)
  assert.equal(remux.qualityBadge, '1080p BDRemux')
})

test('тип релізу НЕ вигадується: без маркера типу — лише реальна роздільність', () => {
  // Назва потоку без маркера типу («avatar_331») — тип невідомий,
  // але маніфест доводить реальну роздільність → приймаємо БЕЗ вигаданого «HD»
  const q = analyzeReleaseQuality('https://ashdi.vip/video15/1/films/avatar_331/hls/i.m3u8', '', { width: 1920, height: 800 })
  assert.equal(q.qualityBadge, '1080p')
  assert.equal(q.isHighQuality, true)
})

test('тип невідомий і маніфест недоступний → якість не доведена, відхиляємо', () => {
  const q = analyzeReleaseQuality('https://ashdi.vip/video15/1/films/avatar_331/hls/i.m3u8', '', null)
  assert.equal(q.isHighQuality, false)
})

test('BDRip/WEBRip уточнюють підпис, але не піднімають клас вище роздільної здатності', () => {
  const q = analyzeReleaseQuality(
    'https://ashdi.vip/hls/movie.2026.1080p.webrip.m3u8',
    '',
    { width: 1280, height: 532 }
  )
  assert.equal(q.qualityBadge, '720p WEBRip')
})

test('маркер типу в release-info з роздільністю з маніфесту', () => {
  const q = analyzeReleaseQuality(
    'https://ashdi.vip/hls/the_matrix_i_1999_rm_bdrip_1080p_h.265_ukr_eng_434/hls/i.m3u8',
    '',
    { width: 1920, height: 800 }
  )
  assert.equal(q.qualityBadge, '1080p BDRip')
})

test('CAMRip/TS ловиться і в release-info, і в HTML плеєра', () => {
  const infoTs = analyzeReleaseQuality(
    'https://ashdi.vip/hls/i.m3u8',
    '<ul class="finfo"><li>TS 1080p BDRip</li></ul>',
    { width: 1920, height: 800 }
  )
  assert.equal(infoTs.isCamrip, true)

  const fileTs = analyzeReleaseQuality(
    'https://ashdi.vip/hls/i.m3u8',
    '<ul class="finfo"><li>movie.ts 1080p BDRip</li></ul>',
    { width: 1920, height: 800 }
  )
  assert.equal(fileTs.isCamrip, true)

  const camUa = analyzeReleaseQuality(
    'https://ashdi.vip/hls/i.m3u8',
    '',
    { width: 1920, height: 800 },
    '<div>Екранка</div>'
  )
  assert.equal(camUa.isCamrip, true)

  const telesc = analyzeReleaseQuality(
    'https://ashdi.vip/hls/i.m3u8',
    '',
    { width: 1920, height: 800 },
    '<div>телесинх</div>'
  )
  assert.equal(telesc.isCamrip, true)
})

test('явно низькоякісний тип релізу (DVDRip/Screener) відхиляється', () => {
  const q = analyzeReleaseQuality(
    'https://ashdi.vip/hls/movie.dvdrip.1080p.m3u8',
    '',
    { width: 1920, height: 800 }
  )
  assert.equal(q.isHighQuality, false)
})

// ─── SSRF: safePageUrl ─────────────────────────────────────────────
test('safePageUrl приймає сторінку з домену джерела', () => {
  assert.equal(safePageUrl('/films/123.html', 'uaserials.fm'), 'https://uaserials.fm/films/123.html')
  assert.equal(safePageUrl('https://uaserials.fm/films/123.html', 'uaserials.fm'), 'https://uaserials.fm/films/123.html')
})

test('safePageUrl відхиляє чужі домени', () => {
  assert.equal(safePageUrl('https://evil.tld/films/123.html', 'uaserials.fm'), null)
  assert.equal(safePageUrl('//evil.tld/films/123.html', 'uaserials.fm'), null)
  assert.equal(safePageUrl('https://uaserials.fm.evil.tld/x', 'uaserials.fm'), null)
})

test('safePageUrl відхиляє не-http схеми', () => {
  assert.equal(safePageUrl('javascript:alert(1)', 'uaserials.fm'), null)
  assert.equal(safePageUrl('data:text/html,x', 'uaserials.fm'), null)
})

// ─── SSRF: safeEmbedUrl / hostAllowed ──────────────────────────────
test('safeEmbedUrl приймає лише дозволені домени плеєрів', () => {
  assert.equal(safeEmbedUrl('https://ashdi.vip/vod/1'), 'https://ashdi.vip/vod/1')
  assert.equal(safeEmbedUrl('https://s30.hdvbua.pro/media/hls/i.m3u8'), 'https://s30.hdvbua.pro/media/hls/i.m3u8')
  assert.equal(safeEmbedUrl('https://zetvideo.net/vod/1'), 'https://zetvideo.net/vod/1')
})

test('safeEmbedUrl відхиляє підміни домену та не-http схеми', () => {
  assert.equal(safeEmbedUrl('https://ashdi.vip.evil.tld/x'), null)
  assert.equal(safeEmbedUrl('http://169.254.169.254/latest/meta-data/'), null)
  assert.equal(safeEmbedUrl('http://127.0.0.1:8080/admin'), null)
  assert.equal(safeEmbedUrl('javascript:alert(1)'), null)
  assert.equal(safeEmbedUrl('data:text/html,<script>'), null)
  assert.equal(safeEmbedUrl(''), null)
  assert.equal(safeEmbedUrl(null), null)
})

test('hostAllowed допускає піддомени, але не «домен-суфікс»', () => {
  assert.equal(hostAllowed('ashdi.vip', ['ashdi.vip']), true)
  assert.equal(hostAllowed('s30.hdvbua.pro', ['hdvbua.pro']), true)
  assert.equal(hostAllowed('ashdi.vip.evil.tld', ['ashdi.vip']), false)
  assert.equal(hostAllowed('notashdi.vip', ['ashdi.vip']), false)
  assert.equal(hostAllowed('', ['ashdi.vip']), false)
})

// ─── SSRF: extractHlsUrl ───────────────────────────────────────────
test('extractHlsUrl бере плейлист лише з дозволеного домену', () => {
  const html = '<script>var u="https://ashdi.vip/video15/hls/index.m3u8";</script>'
  assert.equal(extractHlsUrl(html), 'https://ashdi.vip/video15/hls/index.m3u8')
})

test('extractHlsUrl ігнорує плейлист на чужому домені', () => {
  const html = '<script>var u="http://169.254.169.254/latest/meta-data/x.m3u8";</script>'
  assert.equal(extractHlsUrl(html), null)
})

test('extractHlsUrl повертає null, якщо плейлиста немає', () => {
  assert.equal(extractHlsUrl('<html><body>нічого</body></html>'), null)
  assert.equal(extractHlsUrl(''), null)
})

test('extractHlsUrl знаходить URL у JSON-escaped та без лапок', () => {
  // Регресія: старий скан по токенах вимагав, щоб токен ПОЧИНАВСЯ з http://,
  // тому реальні формати («file:"https:\/\/…"», «src=https://…») не знаходились
  // і плеєр мовчки падав у рекламний iframe.
  assert.equal(
    extractHlsUrl('<script>var c={"file":"https:\\/\\/ashdi.vip\\/hls\\/index.m3u8"};</script>'),
    'https://ashdi.vip/hls/index.m3u8'
  )
  assert.equal(
    extractHlsUrl('<source src=https://ashdi.vip/hls/index.m3u8>'),
    'https://ashdi.vip/hls/index.m3u8'
  )
  assert.equal(
    extractHlsUrl("<script>var f='https://zetvideo.net/vod/1/hls/index.m3u8';</script>"),
    'https://zetvideo.net/vod/1/hls/index.m3u8'
  )
})

test('safeEmbedUrl/safePageUrl відхиляють credentials у URL', () => {
  // Credentials потрапляють у логи й можуть підсилити запит (Basic-auth)
  // на allow-list-домені.
  assert.equal(safeEmbedUrl('https://user:pass@ashdi.vip/x.m3u8'), null)
  assert.equal(safeEmbedUrl('https://user@ashdi.vip/x.m3u8'), null)
  assert.equal(safePageUrl('https://user:pass@uaserials.fm/films/1.html', 'uaserials.fm'), null)
})

test('safeEmbedUrl відхиляє нестандартний порт', () => {
  assert.equal(safeEmbedUrl('https://ashdi.vip:8443/x.m3u8'), null)
})

// ─── HLS CORS proxy ─────────────────────────────────────────────────
test('buildHlsProxyUrl обгортає прямий HLS-URL локальним proxy', () => {
  const upstream = 'https://ashdi.vip/video15/2/films/film_1/hls/index.m3u8'
  const proxyUrl = buildHlsProxyUrl(upstream)
  const parsed = new URL(proxyUrl)

  assert.equal(parsed.origin, 'http://127.0.0.1:3001')
  assert.equal(parsed.pathname, '/api/hls')
  assert.equal(parsed.searchParams.get('url'), upstream)
})

test('buildHlsProxyUrl відхиляє URL поза allow-list', () => {
  assert.equal(buildHlsProxyUrl('https://evil.tld/stream.m3u8'), null)
  assert.equal(buildHlsProxyUrl('http://169.254.169.254/latest/meta-data'), null)
})

test('rewriteHlsManifest переписує URI рядки та URI-атрибути на proxy', () => {
  const baseUrl = 'https://ashdi.vip/video15/2/films/film_1/hls/master/index.m3u8'
  const manifest = [
    '#EXTM3U',
    '#EXT-X-STREAM-INF:BANDWIDTH=2128000',
    'https://ashdi.vip/video15/2/films/film_1/hls/1080/index.m3u8',
    '#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/en.m3u8"',
    '#EXT-X-KEY:METHOD=AES-128,URI="https://jk29.ashdi.vip/content/key.bin"',
    'segment1.ts',
  ].join('\n')

  const rewritten = rewriteHlsManifest(manifest, baseUrl)
  const lines = rewritten.split('\n')

  const variantProxy = new URL(lines[2])
  assert.equal(variantProxy.origin, 'http://127.0.0.1:3001')
  assert.equal(variantProxy.pathname, '/api/hls')
  assert.equal(
    variantProxy.searchParams.get('url'),
    'https://ashdi.vip/video15/2/films/film_1/hls/1080/index.m3u8'
  )

  const audioProxy = new URL(lines[3].match(/URI="([^"]+)"/)[1])
  assert.equal(
    audioProxy.searchParams.get('url'),
    'https://ashdi.vip/video15/2/films/film_1/hls/master/audio/en.m3u8'
  )

  const keyProxy = new URL(lines[4].match(/URI="([^"]+)"/)[1])
  assert.equal(
    keyProxy.searchParams.get('url'),
    'https://jk29.ashdi.vip/content/key.bin'
  )

  const segmentProxy = new URL(lines[5])
  assert.equal(
    segmentProxy.searchParams.get('url'),
    'https://ashdi.vip/video15/2/films/film_1/hls/master/segment1.ts'
  )
})

test('rewriteHlsManifest fail-closed для ресурсу з чужого домену', () => {
  assert.throws(
    () => rewriteHlsManifest('https://evil.tld/segment.ts', 'https://ashdi.vip/hls/index.m3u8'),
    /HLS/
  )
})

test('GET /api/hls без URL повертає 400', async (t) => {
  const server = await startTestServer(t)
  const { port } = server.address()

  const res = await fetch(`http://127.0.0.1:${port}/api/hls`)
  const body = await res.json()

  assert.equal(res.status, 400)
  assert.match(body.error, /url/i)
})

test('GET /api/hls відхиляє upstream URL поза allow-list', async (t) => {
  const server = await startTestServer(t)
  const { port } = server.address()

  const target = encodeURIComponent('https://evil.tld/stream.m3u8')
  const res = await fetch(`http://127.0.0.1:${port}/api/hls?url=${target}`)
  const body = await res.json()

  assert.equal(res.status, 400)
  assert.match(body.error, /URL|allow-list|домен/i)
})

// ─── /health ────────────────────────────────────────────────────────
test('GET /health віддає service-маркер (start.bat відрізняє наш проксі від чужого)', async (t) => {
  // Регресія: launcher бачив «порт 3001 зайнятий» і вирішував, що проксі
  // вже працює — навіть якщо це був зовсім інший процес. Маркер
  // дозволяє перевірити, що на порті саме наш сервер.
  const server = await startTestServer(t)
  const { port } = server.address()

  const res = await fetch(`http://127.0.0.1:${port}/health`)
  const body = await res.json()

  assert.equal(res.status, 200)
  assert.equal(body.status, 'ok')
  assert.equal(body.service, 'alexfilm-ua-proxy')
  // port — інформаційне поле (константа 3001), не порт тест-сервера.
  assert.equal(typeof body.port, 'number')
})

// ─── pickBestStreamResult ──────────────────────────────────────────
test('pickBestStreamResult обирає реліз із найвищим qualityRank', () => {
  const low = { sourceName: 'UASerials (Ashdi 720p WEBRip)', qualityRank: 3 }
  const high = { sourceName: 'UAFLIX (Zetvideo 1080p BDRemux)', qualityRank: 9 }
  const best = pickBestStreamResult([low, high])
  assert.equal(best, high)
})

test('pickBestStreamResult при однаковій якості бере джерело з вищим пріоритетом (перше в масиві)', () => {
  const first = { sourceName: 'UASerials (Ashdi 1080p)', qualityRank: 7 }
  const second = { sourceName: 'UAFLIX (Zetvideo 1080p)', qualityRank: 7 }
  assert.equal(pickBestStreamResult([first, second]), first)
})

test('pickBestStreamResult пропускає null (джерело впало / збігу немає)', () => {
  const only = { sourceName: 'Eneyida (HDVB 1080p)', qualityRank: 7 }
  assert.equal(pickBestStreamResult([null, undefined, only, null]), only)
})

test('pickBestStreamResult повертає null без кандидатів', () => {
  assert.equal(pickBestStreamResult([]), null)
  assert.equal(pickBestStreamResult([null, undefined]), null)
  assert.equal(pickBestStreamResult(null), null)
})

test('pickBestStreamResult з невідомим rank (0) програє відомому', () => {
  const unknown = { sourceName: 'X', qualityRank: undefined }
  const known = { sourceName: 'Y', qualityRank: 5 }
  assert.equal(pickBestStreamResult([unknown, known]), known)
})

// ─── Субтитри: relay пропускає WebVTT ─────────────────────────────
test('relay allow-list містить text/vtt та application/vtt (субтитри HLS)', () => {
  // Регресія: без цих типів relay віддав би 403 на .vtt сегменти —
  // і субтитри не працювали б, навіть коли джерело їх має.
  assert.ok(ALLOWED_HLS_CONTENT_TYPES.has('text/vtt'))
  assert.ok(ALLOWED_HLS_CONTENT_TYPES.has('application/vtt'))
})

// ─── Авторизація HLS-relay ─────────────────────────────────────────
test('buildHlsProxyUrl підписує target: relay приймає лише URL, виданий сервером', () => {
  const upstream = 'https://ashdi.vip/hls/index.m3u8'
  const parsed = new URL(buildHlsProxyUrl(upstream))
  const sig = parsed.searchParams.get('sig')

  assert.match(sig, /^[a-f0-9]{64}$/)
  assert.equal(verifyHlsTargetSignature(upstream, sig), true)
  assert.equal(verifyHlsTargetSignature(upstream, 'f'.repeat(64)), false)
  assert.equal(verifyHlsTargetSignature(upstream, ''), false)
  assert.equal(verifyHlsTargetSignature(upstream, undefined), false)
})

test('verifyHlsTargetSignature не приймає підміну target', () => {
  const upstream = 'https://ashdi.vip/hls/index.m3u8'
  const sig = signHlsTarget(upstream)

  assert.equal(verifyHlsTargetSignature('https://ashdi.vip/hls/evil.m3u8', sig), false)
  assert.equal(verifyHlsTargetSignature('https://evil.tld/hls/index.m3u8', sig), false)
})

test('GET /api/hls без серверного підпису повертає 400', async (t) => {
  const server = await startTestServer(t)
  const { port } = server.address()

  const target = encodeURIComponent('https://ashdi.vip/hls/index.m3u8')
  const res = await fetch(`http://127.0.0.1:${port}/api/hls?url=${target}`)
  const body = await res.json()

  assert.equal(res.status, 400)
  assert.match(body.error, /URL|allow-list|домен/i)
})

test('GET /api/hls з коректним підписом не падає з HTTP 500 (регресія TDZ)', async (t) => {
  const server = await startTestServer(t)
  const { port } = server.address()

  // Підписаний URL, але неіснуючий шлях: upstream поверне помилку або
  // не-HLS-контент. Важливо, що сервер НЕ падає (500) — а віддає JSON-помилку.
  // УВАГА: підпис прив'язаний до процесу, тому запит іде на порт ТЕСТОВОГО
  // сервера (у buildHlsProxyUrl зашитий порт 3001 — це не наш тест).
  const signed = new URL(buildHlsProxyUrl('https://ashdi.vip/__alexfilm-regression-test__.m3u8'))
  const query = `url=${encodeURIComponent(signed.searchParams.get('url'))}&sig=${signed.searchParams.get('sig')}`
  const res = await fetch(`http://127.0.0.1:${port}/api/hls?${query}`)
  const body = await res.json().catch(() => ({}))

  assert.notEqual(res.status, 500, 'relay не має віддавати 500')
  assert.ok(body && typeof body.error === 'string', 'очікуємо JSON-помилку, а не краш')
})

test('rewriteHlsManifest переписує URI-атрибут без лапок', () => {
  const baseUrl = 'https://ashdi.vip/hls/index.m3u8'
  const manifest = [
    '#EXTM3U',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100,URI=iframe.m3u8',
  ].join('\n')

  const rewritten = rewriteHlsManifest(manifest, baseUrl)
  const rawUri = rewritten.split('\n')[1].match(/URI=([^,]+)/)[1]
  const parsed = new URL(rawUri)

  assert.equal(parsed.origin, 'http://127.0.0.1:3001')
  assert.equal(parsed.searchParams.get('url'), 'https://ashdi.vip/hls/iframe.m3u8')
})

test('rewriteHlsManifest відхиляє маніфест із надто великою кількістю рядків', () => {
  const many = Array.from({ length: 20001 }, (_, i) => `segment${i}.ts`).join('\n')
  assert.throws(
    () => rewriteHlsManifest(many, 'https://ashdi.vip/hls/index.m3u8'),
    /HLS/
  )
})

test('isValidRangeHeader приймає лише простий byte-range', () => {
  assert.equal(isValidRangeHeader('bytes=0-1023'), true)
  assert.equal(isValidRangeHeader('bytes=-1024'), true)
  assert.equal(isValidRangeHeader('bytes=0-'), true)
  assert.equal(isValidRangeHeader('bytes=0-1,2-3'), false)
  assert.equal(isValidRangeHeader('items=0-1'), false)
  assert.equal(isValidRangeHeader('bytes=abc'), false)
  assert.equal(isValidRangeHeader(undefined), true)
})

// ─── TMDB proxy (ключ лишається на сервері) ─────────────────────────
test('isAllowedTmdbPath дозволяє лише потрібні read-only ендпоїнти', () => {
  assert.equal(isAllowedTmdbPath('/movie/969681'), true)
  assert.equal(isAllowedTmdbPath('/movie/969681/videos'), true)
  assert.equal(isAllowedTmdbPath('/movie/popular'), true)
  assert.equal(isAllowedTmdbPath('/discover/movie'), true)
  assert.equal(isAllowedTmdbPath('/search/movie'), true)
  assert.equal(isAllowedTmdbPath('/genre/movie/list'), true)

  assert.equal(isAllowedTmdbPath('/user/account_details'), false)
  assert.equal(isAllowedTmdbPath('/movie/969681/ratings'), false)
  assert.equal(isAllowedTmdbPath('/account'), false)
  assert.equal(isAllowedTmdbPath('/movie/../user'), false)
})

test('buildTmdbUpstreamUrl прибирає клієнтський api_key і додає серверний', () => {
  const url = buildTmdbUpstreamUrl('/movie/969681', { api_key: 'hacker', language: 'uk-UA' })
  const parsed = new URL(url)

  assert.equal(parsed.origin, 'https://api.themoviedb.org')
  assert.equal(parsed.pathname, '/3/movie/969681')
  assert.equal(parsed.searchParams.get('language'), 'uk-UA')
  assert.ok(parsed.searchParams.get('api_key'))
  assert.notEqual(parsed.searchParams.get('api_key'), 'hacker')
})

test('buildTmdbUpstreamUrl відсікає небезпечні query-параметри', () => {
  const url = buildTmdbUpstreamUrl('/search/movie', {
    query: 'dune',
    api_key: 'x',
    session_id: 'secret',
  })
  const parsed = new URL(url)

  assert.equal(parsed.searchParams.get('query'), 'dune')
  assert.equal(parsed.searchParams.get('session_id'), null)
})

test('GET /api/tmdb відхиляє недозволений шлях', async (t) => {
  const server = await startTestServer(t)
  const { port } = server.address()

  const res = await fetch(`http://127.0.0.1:${port}/api/tmdb/user/account_details`)
  const body = await res.json()

  assert.equal(res.status, 400)
  assert.match(body.error, /TMDB|шлях|path/i)
})

// ─── isAllowedOrigin (CORS для локального дев-сервера) ───────────────────────
// Регресія: Vite сам піднімається на наступному вільному порту (5174, 5175…),
// якщо 5173 зайнятий. Жорсткий allow-list лише на :5173 ламав усе:
// браузер отримував 403 без CORS-заголовків → «Failed to fetch».
test('isAllowedOrigin допускає будь-який порт локального Vite-дев-сервера', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173'), true)
  assert.equal(isAllowedOrigin('http://localhost:5174'), true)
  assert.equal(isAllowedOrigin('http://localhost:5187'), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:5174'), true)
  assert.equal(isAllowedOrigin('http://[::1]:5173'), true)
})

test('isAllowedOrigin допускає порт preview-сервера (vite preview)', () => {
  assert.equal(isAllowedOrigin('http://localhost:4173'), true)
  assert.equal(isAllowedOrigin('http://127.0.0.1:4180'), true)
})

test('isAllowedOrigin відкидає чужі домени та не-https схеми', () => {
  assert.equal(isAllowedOrigin('http://evil.com'), false)
  assert.equal(isAllowedOrigin('http://evil.com:5173'), false)
  assert.equal(isAllowedOrigin('http://localhost.evil.com:5173'), false)
  assert.equal(isAllowedOrigin('https://localhost:5173'), false)
  assert.equal(isAllowedOrigin('http://127.0.0.1:3001'), false)
  assert.equal(isAllowedOrigin('http://localhost:9999'), false)
  assert.equal(isAllowedOrigin(''), false)
  assert.equal(isAllowedOrigin(null), false)
})

test('GET /api/tmdb віддає CORS-заголовки для дев-порту, але не для чужого Origin', async (t) => {
  const server = await startTestServer(t)
  const { port } = server.address()

  const okRes = await fetch(`http://127.0.0.1:${port}/api/tmdb/movie/550`, {
    headers: { Origin: 'http://localhost:5174' },
  })
  assert.equal(okRes.status, 200)
  assert.equal(okRes.headers.get('access-control-allow-origin'), 'http://localhost:5174')

  const badRes = await fetch(`http://127.0.0.1:${port}/api/tmdb/movie/550`, {
    headers: { Origin: 'http://evil.com' },
  })
  assert.equal(badRes.status, 403)
  assert.equal(badRes.headers.get('access-control-allow-origin'), null)
})

// ─── sanitizeLog ───────────────────────────────────────────────────
test('sanitizeLog прибирає керуючі символи (log forging)', () => {
  assert.equal(sanitizeLog('фільм\nз підміною'), 'фільм з підміною')
  // ESC (0x1B) теж керуючий — замінюється пробілом
  assert.equal(sanitizeLog('a[31mred'), 'a [31mred')
  assert.ok(sanitizeLog('x'.repeat(500)).length <= 120)
})
