/**
 * Streaming Service - Інтеграція з реальними українськими джерелами
 * Підтримка: UAKino, UAfilm, WTCH, Wolf, Filmix, BWA, Collaps, VidSrc
 */

// Конфігурація відомих джерел
export const STREAMING_SOURCES = {
  // Офіційні/легальні джерела (пріоритет)
  official: {
    id: 'official',
    name: 'Офіційні джерела',
    priority: 1,
    requiresApiKey: true,
    supports: ['movie', 'series'],
    type: 'api',
    baseUrl: '',
    description: 'Офіційні ліцензовані джерела (потребує API ключ)'
  },

  // UAKino - український дубляж, 4K
  uakino: {
    id: 'uakino',
    name: 'UAKino',
    label: 'UAKino (UA дубляж 4K)',
    priority: 2,
    type: 'dle',
    baseUrl: 'https://uakino.ax',
    searchPath: '/engine/ajax/controller.php?mod=search',
    playerPath: '/engine/ajax/controller.php?mod=player',
    supports: ['movie', 'series'],
    quality: ['4K', '1080p', '720p'],
    languages: ['uk'],
    description: 'Популярний український балансер з дубляжем у 4K'
  },

  // UAfilm - український дубляж
  uafilm: {
    id: 'uafilm',
    name: 'UAfilm',
    label: 'UAfilm (UA дубляж)',
    priority: 3,
    type: 'dle',
    baseUrl: 'https://uaserials.net',
    searchPath: '/engine/ajax/controller.php?mod=search',
    playerPath: '/engine/ajax/controller.php?mod=player',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['uk'],
    description: 'Український балансер для серіалів та фільмів'
  },

  // WTCH - легкий онлайн плагін
  wtch: {
    id: 'wtch',
    name: 'WTCH',
    label: 'WTCH (Мульти-балансер)',
    priority: 4,
    type: 'json',
    baseUrl: 'https://wtch.cc',
    apiPath: '/api/v1',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['uk', 'ru', 'en'],
    description: 'Легкий мульти-балансер для швидкого старту'
  },

  // Wolf - перевірений розширення
  wolf: {
    id: 'wolf',
    name: 'Wolf',
    label: 'Wolf (Мульти-балансер)',
    priority: 5,
    type: 'json',
    baseUrl: 'https://wolf.stream',
    apiPath: '/api',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['uk', 'ru', 'en'],
    description: 'Перевірений мульти-балансер з високою якістю'
  },

  // Filmix - популярний джерело
  filmix: {
    id: 'filmix',
    name: 'Filmix',
    label: 'Filmix (Мульти-балансер)',
    priority: 6,
    type: 'dle',
    baseUrl: 'https://filmix.ac',
    searchPath: '/engine/ajax/controller.php?mod=search',
    playerPath: '/engine/ajax/controller.php?mod=player',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['uk', 'ru', 'en'],
    description: 'Популярне джерело з великою базою'
  },

  // BWA Cloud - хмарний проксі
  bwa: {
    id: 'bwa',
    name: 'BWA Cloud',
    label: 'BWA Cloud (Хмарний проксі)',
    priority: 7,
    type: 'json',
    baseUrl: 'https://bwa.cloud',
    apiPath: '/api/v2',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p', '4K'],
    languages: ['uk', 'ru', 'en'],
    description: 'Хмарний плагін-прокладка для обходу обмежень'
  },

  // Collaps - HLS потоки
  collaps: {
    id: 'collaps',
    name: 'Collaps',
    label: 'Collaps (HLS потоки)',
    priority: 8,
    type: 'hls',
    baseUrl: 'https://p.lumex.space',
    apiPath: '/api/imdb/{imdbId}',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['uk', 'ru', 'en'],
    description: 'HLS потоки через Lumex API'
  },

  // VidSrc - прямі посилання
  vidsrc: {
    id: 'vidsrc',
    name: 'VidSrc',
    label: 'VidSrc (Прямі посилання)',
    priority: 9,
    type: 'embed',
    baseUrl: 'https://vidsrc.me',
    moviePath: '/embed/movie/{tmdbId}',
    seriesPath: '/embed/tv/{tmdbId}/{season}/{episode}',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['en', 'ru'],
    description: 'Прямі embed посилання без API ключів'
  },

  // VidSrc PRO
  vidsrcpro: {
    id: 'vidsrcpro',
    name: 'VidSrc PRO',
    label: 'VidSrc PRO (Глобальний HD)',
    priority: 10,
    type: 'embed',
    baseUrl: 'https://vidsrc.pro',
    moviePath: '/embed/movie/{tmdbId}',
    seriesPath: '/embed/tv/{tmdbId}/{season}/{episode}',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p', '4K'],
    languages: ['en', 'ru', 'uk'],
    description: 'Покращена версія VidSrc з 4K'
  },

  // MultiEmbed - агрегатор
  multiembed: {
    id: 'multiembed',
    name: 'MultiEmbed',
    label: 'MultiEmbed (Агрегатор)',
    priority: 11,
    type: 'embed',
    baseUrl: 'https://multiembed.mov',
    moviePath: '/?video_id={tmdbId}&tmdb=1',
    seriesPath: '/?video_id={tmdbId}&tmdb=1&s={season}&e={episode}',
    supports: ['movie', 'series'],
    quality: ['1080p', '720p'],
    languages: ['en', 'ru'],
    description: 'Агрегатор кількох джерел'
  }
}

// Порядок джерел за пріоритетом - HLS та JSON API спочатку (повертають прямі посилання), потім DLE, потім embed
export const SOURCE_PRIORITY = [
  'collaps',      // HLS API - прямі m3u8 потоки
  'wtch',         // JSON API - прямі посилання
  'wolf',         // JSON API - прямі посилання
  'filmix',       // DLE - може повернути прямі посилання
  'uakino',       // DLE - український дубляж
  'uafilm',       // DLE - український дубляж
  'bwa',          // JSON API - хмарний проксі
  'vidsrcpro',    // Embed - iframe
  'vidsrc',       // Embed - iframe
  'multiembed'    // Embed - iframe
]

/**
 * Клас для роботи з потоками
 */
export class StreamingService {
  constructor() {
    this.cache = new Map()
    this.cacheTTL = 10 * 60 * 1000 // 10 хвилин
  }

  /**
   * Отримати доступні джерела для фільму/серіалу
   */
  async getSources(movie, options = {}) {
    const { tmdbId, imdbId, title, originalTitle, year, type = 'movie' } = movie
    const cacheKey = `sources:${type}:${tmdbId}:${imdbId}`
    const bustCache = options?.bustCache === true
    
    if (!bustCache && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)
      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data
      }
    }

    const sources = []

    // Пробуємо кожне джерело за пріоритетом
    for (const sourceId of SOURCE_PRIORITY) {
      const source = STREAMING_SOURCES[sourceId]
      if (!source || !source.supports.includes(type)) continue

      try {
        const streamData = await this.fetchFromSource(source, movie, options)
        if (streamData) {
          sources.push({
            sourceId: source.id,
            sourceName: source.name,
            label: source.label,
            priority: source.priority,
            quality: streamData.quality || source.quality,
            languages: streamData.languages || source.languages,
            urls: streamData.urls,
            embedUrl: streamData.embedUrl,
            hlsUrl: streamData.hlsUrl,
            manifestUrl: streamData.manifestUrl,
            headers: streamData.headers,
            drm: streamData.drm || false,
            description: source.description
          })
        }
      } catch (error) {
        console.warn(`Source ${source.id} failed:`, error.message)
        continue
      }
    }

    // Сортуємо за пріоритетом
    sources.sort((a, b) => a.priority - b.priority)

    this.cache.set(cacheKey, { data: sources, timestamp: Date.now() })
    return sources
  }

  /**
   * Отримати потік від конкретного джерела
   */
  async fetchFromSource(source, movie, options) {
    const { tmdbId, imdbId, title, originalTitle, year, type = 'movie', season, episode } = movie

    switch (source.type) {
      case 'dle':
        return await this.fetchFromDLE(source, movie, options)
      case 'json':
        return await this.fetchFromJSON(source, movie, options)
      case 'hls':
        return await this.fetchFromHLS(source, movie, options)
      case 'embed':
        return await this.fetchFromEmbed(source, movie, options)
      default:
        return null
    }
  }

  /**
   * DLE-балансери (UAKino, UAfilm, Filmix)
   */
  async fetchFromDLE(source, movie, options) {
    const { tmdbId, imdbId, title, originalTitle, year, type = 'movie' } = movie
    
    try {
      // Спочатку шукаємо ID на балансері
      const searchQuery = options.useOriginalTitle ? originalTitle : title
      const searchUrl = `${source.baseUrl}${source.searchPath}`
      
      const formData = new FormData()
      formData.append('do', 'search')
      formData.append('subaction', 'search')
      formData.append('story', searchQuery)

      const response = await fetch(searchUrl, {
        method: 'POST',
        body: formData,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': source.baseUrl
        }
      })

      if (!response.ok) return null

      const html = await response.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')

      // Знаходимо посилання на фільм/серіал
      const links = doc.querySelectorAll('a[href*="/film/"]')
      let targetUrl = null

      for (const link of links) {
        const href = link.getAttribute('href')
        if (href && (href.includes(imdbId?.replace('tt', '') || '') || 
            href.includes(tmdbId) || 
            link.textContent.toLowerCase().includes(title.toLowerCase()))) {
          targetUrl = href.startsWith('http') ? href : `${source.baseUrl}${href}`
          break
        }
      }

      if (!targetUrl) return null

      // Отримуємо плеєр
      const playerResponse = await fetch(targetUrl, {
        headers: { 'Referer': source.baseUrl }
      })
      const playerHtml = await playerResponse.text()
      const playerDoc = new DOMParser().parseFromString(playerHtml, 'text/html')

      // Знаходимо iframe або посилання на відео
      const iframes = playerDoc.querySelectorAll('iframe')
      for (const iframe of iframes) {
        const src = iframe.getAttribute('src')
        if (src && (src.includes('.m3u8') || src.includes('.mp4') || src.includes('player'))) {
          return {
            urls: [src],
            embedUrl: targetUrl,
            quality: ['1080p', '720p'],
            languages: ['uk']
          }
        }
      }

      // Шукаємо прямі посилання в скриптах
      const scripts = playerDoc.querySelectorAll('script')
      for (const script of scripts) {
        const content = script.textContent
        const m3u8Match = content.match(/https?:\/\/[^"']+\.m3u8[^"']*/)
        const mp4Match = content.match(/https?:\/\/[^"']+\.mp4[^"']*/)
        if (m3u8Match || mp4Match) {
          return {
            urls: [m3u8Match?.[0] || mp4Match[0]],
            hlsUrl: m3u8Match?.[0],
            embedUrl: targetUrl,
            quality: ['1080p', '720p'],
            languages: ['uk']
          }
        }
      }

      return null
    } catch (error) {
      console.warn(`DLE source ${source.id} error:`, error)
      return null
    }
  }

  /**
   * JSON API балансери (WTCH, Wolf, BWA)
   */
  async fetchFromJSON(source, movie, options) {
    const { tmdbId, imdbId, title, originalTitle, year, type = 'movie', season, episode } = movie

    try {
      const searchQuery = options.useOriginalTitle ? originalTitle : title
      const apiUrl = `${source.baseUrl}${source.apiPath}/search`
      
      const params = new URLSearchParams({
        query: searchQuery,
        type: type === 'series' ? 'tv' : 'movie',
        tmdb_id: tmdbId,
        imdb_id: imdbId,
        year: year
      })

      const response = await fetch(`${apiUrl}?${params}`, {
        headers: {
          'Accept': 'application/json',
          'Referer': source.baseUrl
        }
      })

      if (!response.ok) return null

      const data = await response.json()
      
      if (!data.results || !data.results.length) return null

      const result = data.results[0]
      const contentId = result.id || result.kinopoisk_id || result.tmdb_id

      // Отримуємо посилання на плеєр
      const playerParams = new URLSearchParams({
        id: contentId,
        type: type === 'series' ? 'tv' : 'movie'
      })

      if (type === 'series' && season && episode) {
        playerParams.append('season', season)
        playerParams.append('episode', episode)
      }

      const playerResponse = await fetch(`${source.baseUrl}${source.apiPath}/player?${playerParams}`, {
        headers: { 'Accept': 'application/json', 'Referer': source.baseUrl }
      })

      if (!playerResponse.ok) return null

      const playerData = await playerResponse.json()

      return {
        urls: playerData.urls || playerData.sources || [],
        hlsUrl: playerData.hls || playerData.m3u8,
        mp4Url: playerData.mp4,
        embedUrl: playerData.embed_url,
        quality: playerData.qualities || ['1080p', '720p'],
        languages: playerData.languages || ['uk', 'ru', 'en'],
        headers: playerData.headers
      }
    } catch (error) {
      console.warn(`JSON source ${source.id} error:`, error)
      return null
    }
  }

  /**
   * HLS джерела (Collaps/Lumex)
   */
  async fetchFromHLS(source, movie, options) {
    const { tmdbId, imdbId, title, originalTitle, year, type = 'movie' } = movie

    if (!imdbId) return null

    try {
      const apiUrl = `${source.baseUrl}${source.apiPath.replace('{imdbId}', imdbId)}`
      
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/json, application/vnd.apple.mpegurl',
          'Referer': source.baseUrl
        }
      })

      if (!response.ok) return null

      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        const data = await response.json()
        return {
          urls: [data.url, data.hls, data.m3u8].filter(Boolean),
          hlsUrl: data.hls || data.m3u8 || data.url,
          quality: data.qualities || ['1080p', '720p'],
          languages: data.languages || ['uk', 'ru', 'en']
        }
      } else if (contentType.includes('mpegurl') || contentType.includes('vnd.apple.mpegurl')) {
        const m3u8 = await response.text()
        return {
          hlsUrl: apiUrl,
          urls: [apiUrl],
          quality: ['1080p', '720p'],
          languages: ['uk', 'ru', 'en']
        }
      }

      return null
    } catch (error) {
      console.warn(`HLS source ${source.id} error:`, error)
      return null
    }
  }

  /**
   * Embed джерела (VidSrc, MultiEmbed, VidSrc PRO)
   */
  async fetchFromEmbed(source, movie, options) {
    const { tmdbId, imdbId, title, originalTitle, year, type = 'movie', season, episode } = movie

    try {
      let embedUrl

      if (type === 'series') {
        embedUrl = `${source.baseUrl}${source.seriesPath
          .replace('{tmdbId}', tmdbId)
          .replace('{season}', season || 1)
          .replace('{episode}', episode || 1)}`
      } else {
        embedUrl = `${source.baseUrl}${source.moviePath.replace('{tmdbId}', tmdbId)}`
      }

      // Для embed джерел повертаємо URL для iframe
      return {
        embedUrl,
        urls: [embedUrl],
        quality: ['1080p', '720p'],
        languages: ['en', 'ru', 'uk']
      }
    } catch (error) {
      console.warn(`Embed source ${source.id} error:`, error)
      return null
    }
  }

  /**
     * Отримати найкращий доступний потік
     */
    async getBestStream(movie, options = {}) {
      const sources = await this.getSources(movie, options)
    
      if (!sources.length) {
        console.warn('No sources found, using test stream fallback')
        return this.getTestStream()
      }
    
      // Фільтруємо за мовою (пріоритет українською)
      const preferredLang = options.language || 'uk'
      const langSources = sources.filter(s => s.languages.includes(preferredLang))
      const workingSources = langSources.length ? langSources : sources
    
      // Повертаємо перше робоче джерело
      for (const source of workingSources) {
        if (source.hlsUrl || source.urls?.length || source.embedUrl) {
          return {
            source,
            hlsUrl: source.hlsUrl,
            urls: source.urls,
            embedUrl: source.embedUrl,
            quality: source.quality,
            languages: source.languages
          }
        }
      }
    
      // Якщо жодне джерело не спрацювало - тестовий потік
      console.warn('All sources failed, using test stream fallback')
      return this.getTestStream()
    }

    /**
     * Тестовий потік для розробки (Big Buck Bunny)
     */
    getTestStream() {
      return {
        source: { id: 'test', label: 'Test Stream (Big Buck Bunny)' },
        hlsUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        urls: ['https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8'],
        quality: ['1080p', '720p', '480p'],
        languages: ['en']
      }
    }

  /**
   * Очистити кеш
   */
  clearCache() {
    this.cache.clear()
  }
}

// Експортуємо єдиний екземпляр
export const streamingService = new StreamingService()