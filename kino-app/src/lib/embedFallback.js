/**
 * Логіка резервних (глобальних) embed-джерел.
 *
 * Винесена окремо від Vue-компонента, щоб її можна було покрити тестами
 * без браузера: тут немає ні DOM, ні Vue, ні побічних ефектів.
 */

/**
 * Порядок автоматичного відкату на глобальні embed-и.
 *
 * Складається з двох незалежних провайдерів:
 *   • vidsrc.me → vidsrc.sh (плеєр vs_src)
 *   • 2embed / 2embed.skin / vidsrc.buzz (плеєр swish)
 *
 * vidsrc.net прибрано: домен припаркований (редирект на headlinelogic.com),
 * тобто він ніколи не відтворював відео — лише псув ланцюжок відкату.
 */
export const GLOBAL_FALLBACK_ORDER = ['vidsrcme', 'twoembed', 'vidsrcbuzz', 'vidsrc2']

/** Домени, з яких дозволено вбудовувати глобальний embed. */
export const GLOBAL_EMBED_HOSTS = ['vidsrc.me', 'www.2embed.cc', 'vidsrc.buzz', 'www.2embed.skin']

/**
 * Наступне джерело в ланцюжку відкату.
 *
 * @param {string[]} order порядок джерел
 * @param {string|null|undefined} current поточне джерело
 * @returns {string|null} наступне джерело або null, якщо ланцюжок вичерпано
 */
export function nextFallbackSource(order, current) {
  if (!Array.isArray(order) || order.length === 0) return null
  const index = order.indexOf(current)
  // Джерела немає в ланцюжку (напр. це UA-джерело) — починаємо з першого.
  if (index < 0) return order[0]
  return index + 1 < order.length ? order[index + 1] : null
}

/**
 * URL глобального embed-у за TMDB ID.
 *
 * Fallback будується ЗА TMDB ID — він не може показати інший фільм.
 *
 * @param {string} srcId ідентифікатор джерела
 * @param {{tmdbId?: string|number, type?: string, season?: number|string, episode?: number|string}} options
 * @returns {string|null}
 */
export function buildEmbedUrl(srcId, options = {}) {
  const tmdb = String(options.tmdbId ?? '').trim()
  if (!tmdb) return null
  // TMDB ID — завжди цифри. Інакше в URL просочиться довільний рядок.
  if (!/^\d+$/.test(tmdb)) return null

  const isSeries = options.type === 'series'
  const s = encodeURIComponent(String(options.season || 1))
  const e = encodeURIComponent(String(options.episode || 1))

  const map = {
    vidsrcme:   isSeries ? `https://vidsrc.me/embed/tv?tmdb=${tmdb}&season=${s}&episode=${e}` : `https://vidsrc.me/embed/movie?tmdb=${tmdb}`,
    twoembed:   isSeries ? `https://www.2embed.cc/embedtv/${tmdb}&s=${s}&e=${e}`               : `https://www.2embed.cc/embed/${tmdb}`,
    vidsrcbuzz: isSeries ? `https://vidsrc.buzz/embed/tv/${tmdb}/${s}/${e}`                   : `https://vidsrc.buzz/embed/movie/${tmdb}`,
    vidsrc2:    isSeries ? `https://www.2embed.skin/embedtv/${tmdb}&s=${s}&e=${e}`             : `https://www.2embed.skin/embed/${tmdb}`,
  }
  return map[srcId] ?? null
}

/**
 * Атрибути iframe для глобального embed-у.
 *
 * УВАГА: тут НЕМАє атрибута `sandbox`. vidsrc.sh (і частина інших
 * embed'ів) перевіряє наявність пісочниці і віддає «Embedding not
 * allowed» (HTTP 403) — відео просто не запускається. Без `sandbox`
 * embed працює, а безпеку забезпечує allow-list доменів (клієнтський
 * і серверний), https-only, стандартний порт і відсутність credentials.
 */
export function buildEmbedIframeAttributes() {
  return {
    // 'allow' уже містить fullscreen — дублювати через allowfullscreen не треба
    // (браузер інакше пише warning "Allow attribute will take precedence").
    allow: 'autoplay; fullscreen; encrypted-media; picture-in-picture',
    referrerpolicy: 'no-referrer',
    scrolling: 'no',
    frameborder: '0',
  }
}

/**
 * Чи embed створив вкладений плеєр.
 *
 * Єдина ознака, доступна батьківській стороні для кросс-доменного iframe:
 * `contentWindow.length` — кількість вкладених browsing contexts.
 * Сторінка-помилка («Embedding not allowed», «джерело недоступне») плеєр
 * не створює, тож length === 0.
 *
 * @param {number|undefined|null} nestedFrameCount
 * @returns {boolean}
 */
export function isEmbedPlayerAlive(nestedFrameCount) {
  const count = Number(nestedFrameCount)
  return Number.isFinite(count) && count > 0
}
