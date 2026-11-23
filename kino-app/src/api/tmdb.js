import { getApiOrigin } from '../utils/config'

// TMDB-ключ НЕ живе в клієнті: запити йдуть через proxy-сервер,
// який додає api_key на сервері. Інакше ключ потрапляє в бандл і його
// можна скопіювати та витратити квоту.
const BASE_URL = `${getApiOrigin()}/api/tmdb`
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

// Fetch with timeout wrapper. Одна повторна спроба при 429 — короткі
// спалахи rate-limit на проксі/ TMDB зазвичай минають менше ніж за секунду.
const fetchWithTimeout = async (url, options = {}, timeout = 8000) => {
    const attempt = async () => {
        const controller = new AbortController()
        const externalSignal = options.signal
        const abortFromCaller = () => controller.abort()

        if (externalSignal?.aborted) {
            controller.abort()
        } else {
            externalSignal?.addEventListener('abort', abortFromCaller, { once: true })
        }

        const id = setTimeout(() => controller.abort(), timeout)
        try {
            return await fetch(url, { ...options, signal: controller.signal })
        } finally {
            clearTimeout(id)
            externalSignal?.removeEventListener('abort', abortFromCaller)
        }
    }

    const response = await attempt()
    if (response.status !== 429) return response
    await new Promise(resolve => setTimeout(resolve, 700))
    return attempt()
}

// Категорії настрою з відповідними жанрами та ключовими словами
const DEFAULT_SORT = 'primary_release_date.desc'
const today = () => new Date().toISOString().slice(0, 10)

export const MOOD_CATEGORIES = {
    'Різдвяний': { genres: [], withKeywords: [207317], sortBy: 'popularity.desc' },
    'Прилюдія': { genres: [], withKeywords: [256466, 170827, 156777], includeAdult: true, minRating: 5, minVotes: 50, sortBy: 'popularity.desc' },
    'Убойні комедії': { genres: [35], withKeywords: [383021, 10123], sortBy: 'primary_release_date.desc' },
    'З половникою': { genres: [10749], keywords: 'romance,love,relationship' },
    'Щоб думати': { genres: [18, 9648], keywords: 'philosophy,psychological,thought-provoking' },
    'Адреналін': { genres: [28, 53], keywords: 'action,thriller,intense' },
    'Ностальгія': { genres: [], keywords: 'classic,retro,vintage', yearMax: 2000 },
    'Щось дивне': { genres: [14, 878], keywords: 'surreal,weird,strange' },
        "На вечір п'ятниці": { genres: [35, 28], keywords: 'entertaining,light,fun' },
        'Для перегляду з друзями': { genres: [28, 12, 35], keywords: 'adventure,blockbuster,group' },
    'Моторошно': { genres: [27, 53], keywords: 'horror,scary,thriller' },
    'Натхнення': { genres: [18, 99], keywords: 'inspiring,true-story,biography' },
    'Космос та майбутнє': { genres: [878], keywords: 'space,future,sci-fi' },
    'Історичне': { genres: [36, 10752], keywords: 'history,war,period' },
    'Детектив': { genres: [80, 9648], keywords: 'mystery,detective,investigation' },
    'Музичне': { genres: [10402], keywords: 'music,musical,concert' },
    'Анімація': { genres: [16], keywords: 'animation,cartoon,family' },
    'Документальне': { genres: [99], keywords: 'documentary,real,educational' }
}

const headers = {
    'Content-Type': 'application/json'
}

// Функція безкоштовного перекладу через Google Translate
const translateToUkrainian = async (text, signal) => {
    if (!text) return text
    try {
        const response = await fetchWithTimeout(
            `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=${encodeURIComponent(text)}`,
            { signal }
        )
        if (!response.ok) return text
        const data = await response.json()
        return data[0].map(item => item[0]).join('')
    } catch (error) {
        console.error('Translation error:', error)
        return text
    }
}

// Додатковий фільтр для перекладу назв та описів, які залишилися англійською або російською
const sanitizeMovieLanguage = async (movie, signal) => {
    if (!movie) return movie
    
    const hasRu = /[ыэъёЫЭЪЁ]/
    const hasEn = /[a-zA-Z]/
    const hasUa = /[а-яА-ЯіїєґІЇЄҐ]/
    
    const needsTranslation = (text) => {
        if (!text) return false
        if (hasRu.test(text)) return true
        if (!hasUa.test(text) && hasEn.test(text)) return true
        return false
    }
    
    if (needsTranslation(movie.title)) {
        movie.title = await translateToUkrainian(movie.title, signal)
    }
    
    if (needsTranslation(movie.overview)) {
        movie.overview = await translateToUkrainian(movie.overview, signal)
    }
    
    return movie
}

export const tmdbApi = {
    async getMoviesByMood(mood, page = 1) {
        const category = MOOD_CATEGORIES[mood]
        if (!category) return { results: [], totalPages: 0 }
        
        const params = new URLSearchParams({
            language: 'uk-UA',
            page: page.toString(),
            sort_by: category.sortBy || DEFAULT_SORT
        })
        if (category.includeAdult) params.append('include_adult', 'true')
        params.append('vote_average.gte', String(category.minRating ?? 6))
        params.append('vote_count.gte', String(category.minVotes ?? 50))
        
        if (category.genres?.length > 0) {
            params.append('with_genres', category.genres.join(','))
        }
        
        if (category.withKeywords?.length) {
            params.append('with_keywords', category.withKeywords.join('|'))
        }
        
        if (category.yearMax) {
            params.append('primary_release_date.lte', `${category.yearMax}-12-31`)
        }
        if (!params.has('primary_release_date.lte')) {
            params.append('primary_release_date.lte', today())
        }
        
        const response = await fetchWithTimeout(`${BASE_URL}/discover/movie?${params}`, { headers })
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`)
        const data = await response.json()
        const results = await Promise.all((data.results || []).map(movie => sanitizeMovieLanguage(movie)))
        return { results, totalPages: data.total_pages || 0 }
    },

    async getFilteredMovies(filters, page = 1) {
        const params = new URLSearchParams({
            language: 'uk-UA',
            page: page.toString(),
            sort_by: filters.sortBy || DEFAULT_SORT
        })
        if (filters.includeAdult) {
            params.append('include_adult', 'true')
            params.append('vote_count.gte', String(filters.minVotes ?? 50))
            // Дефолтний поріг 6 — не вибір користувача; для дорослих
            // він відсікає якісну еротику з оцінками 5–6.
            const rating = filters.rating && filters.rating !== '6'
                ? filters.rating
                : String(filters.minRating ?? 5)
            params.append('vote_average.gte', rating)
        } else {
            params.append('vote_count.gte', '50')
            if (filters.rating) {
                params.append('vote_average.gte', filters.rating)
            }
        }
        if (filters.withKeywords?.length) {
            params.append('with_keywords', filters.withKeywords.join('|'))
        }
        
        if (filters.genre) {
            if (Array.isArray(filters.genre)) {
                if (filters.genre.length > 0) {
                    params.append('with_genres', filters.genre.join(','))
                }
            } else {
                params.append('with_genres', filters.genre)
            }
        }
        
        if (filters.year) {
            if (filters.year === 'older') {
                params.append('primary_release_date.lte', '1999-12-31')
            } else if (filters.year === '2000s') {
                params.append('primary_release_date.gte', '2000-01-01')
                params.append('primary_release_date.lte', '2009-12-31')
            } else if (filters.year === '2010s') {
                params.append('primary_release_date.gte', '2010-01-01')
                params.append('primary_release_date.lte', '2019-12-31')
            } else {
                params.append('primary_release_year', filters.year)
            }
        }
        if (!params.has('primary_release_date.lte')) {
            params.append('primary_release_date.lte', today())
        }
        
        const response = await fetchWithTimeout(`${BASE_URL}/discover/movie?${params}`, { headers })
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`)
        const data = await response.json()
        const results = await Promise.all((data.results || []).map(movie => sanitizeMovieLanguage(movie)))
        return { results, totalPages: data.total_pages || 0 }
    },

    async searchMovies(query, page = 1) {
        const params = new URLSearchParams({
            query,
            language: 'uk-UA',
            page: page.toString()
        })
        
        const response = await fetchWithTimeout(`${BASE_URL}/search/movie?${params}`, { headers })
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`)
        const data = await response.json()
        const results = await Promise.all((data.results || []).map(movie => sanitizeMovieLanguage(movie)))
        return { results, totalPages: data.total_pages || 0 }
    },

    async getMovieDetails(movieId, { signal } = {}) {
        try {
            const response = await fetchWithTimeout(
                `${BASE_URL}/movie/${movieId}?language=uk-UA`,
                { headers, signal }
            )
            if (!response.ok) {
                throw new Error(`TMDB API error: ${response.status}`)
            }
            const data = await response.json()
            // TMDB для невідомого ID повертає JSON-помилку, а не фільм.
            // Без перевірки такий об'єкт потрапив би у шаблон і впав би
            // на movie.vote_average.toFixed().
            if (!data || !Number.isFinite(Number(data.id))) {
                throw new Error('Invalid TMDB movie payload')
            }
            if (!Array.isArray(data.genres)) data.genres = []
            if (!Number.isFinite(Number(data.vote_average))) data.vote_average = 0

            try {
                const [videosRes, creditsRes, externalIdsRes, releaseDatesRes, altTitlesRes] = await Promise.all([
                    fetchWithTimeout(`${BASE_URL}/movie/${movieId}/videos?language=uk-UA`, { headers, signal }),
                    fetchWithTimeout(`${BASE_URL}/movie/${movieId}/credits?language=uk-UA`, { headers, signal }),
                    fetchWithTimeout(`${BASE_URL}/movie/${movieId}/external_ids`, { headers, signal }),
                    fetchWithTimeout(`${BASE_URL}/movie/${movieId}/release_dates`, { headers, signal }),
                    fetchWithTimeout(`${BASE_URL}/movie/${movieId}/alternative_titles`, { headers, signal })
                ])

                const parseOrEmpty = async (res, fallback) => {
                    if (!res.ok) return fallback
                    try { return await res.json() } catch (e) { return fallback }
                }

                data.videos = await parseOrEmpty(videosRes, { results: [] })
                data.credits = await parseOrEmpty(creditsRes, { cast: [] })
                data.external_ids = await parseOrEmpty(externalIdsRes, { imdb_id: null })
                const releaseDatesData = await parseOrEmpty(releaseDatesRes, { results: [] })
                const altTitlesData = await parseOrEmpty(altTitlesRes, { titles: [] })

                // Багаторівневий пошук офіційної української прокатної чи альтернативної назви
                const uaRelease = releaseDatesData?.results?.find(r => r.iso_3166_1 === 'UA')
                const uaCinemaTitle = uaRelease?.release_dates?.find(d => d.title && d.title.trim() !== '')?.title
                
                const uaAlt = altTitlesData?.titles?.find(t => (t.iso_3166_1 === 'UA' || t.iso_639_1 === 'uk') && t.title && t.title.trim() !== '')?.title

                if (uaCinemaTitle) {
                    data.title = uaCinemaTitle
                } else if (uaAlt) {
                    data.title = uaAlt
                }
            } catch (e) {
                if (e?.name === 'AbortError') throw e
                console.warn('Не вдалося завантажити додаткові дані:', e)
                data.videos = { results: [] }
                data.credits = { cast: [] }
                data.external_ids = { imdb_id: null }
            }
            
            if (!data.overview || data.overview.trim() === '') {
                try {
                    const enResponse = await fetchWithTimeout(
                        `${BASE_URL}/movie/${movieId}?language=en-US`,
                        { headers, signal }
                    )
                    const enData = enResponse.ok ? await enResponse.json() : null
                    if (enData?.overview) data.overview = enData.overview
                    if (!data.tagline && enData?.tagline) data.tagline = enData.tagline
                } catch (e) {
                    if (e?.name !== 'AbortError') {
                        console.error('Помилка отримання англійських даних:', e)
                    }
                }
            }
            
            return await sanitizeMovieLanguage(data, signal)
        } catch (error) {
            if (error?.name !== 'AbortError') {
                console.error('getMovieDetails error:', error)
            }
            throw error
        }
    },

    async getPopularMovies(page = 1) {
        const response = await fetchWithTimeout(
            `${BASE_URL}/movie/popular?language=uk-UA&page=${page}`,
            { headers }
        )
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`)
        const data = await response.json()
        return await Promise.all((data.results || []).map(movie => sanitizeMovieLanguage(movie)))
    },

    async getNewestMovies(page = 1) {
        const params = new URLSearchParams({
            language: 'uk-UA',
            page: String(page),
            sort_by: DEFAULT_SORT,
            'vote_count.gte': '50',
            'primary_release_date.lte': today()
        })
        const response = await fetchWithTimeout(`${BASE_URL}/discover/movie?${params}`, { headers })
        if (!response.ok) throw new Error(`TMDB API error: ${response.status}`)
        const data = await response.json()
        const results = await Promise.all((data.results || []).map(movie => sanitizeMovieLanguage(movie)))
        return { results, totalPages: data.total_pages || 0 }
    },

    async getRandomMovie() {
        let movies = []
        for (let i = 0; i < 3; i++) {
            const randomPage = Math.floor(Math.random() * 50) + 1
            movies = await this.getPopularMovies(randomPage)
            
            const validMovies = movies.filter(m => m.poster_path && m.overview && m.vote_average >= 5)
            if (validMovies.length > 0) {
                const randomMovie = validMovies[Math.floor(Math.random() * validMovies.length)]
                return await this.getMovieDetails(randomMovie.id)
            }
        }
        
        if (movies.length > 0) {
            const randomMovie = movies[Math.floor(Math.random() * movies.length)]
            return await this.getMovieDetails(randomMovie.id)
        }
        return null
    },

    async getGenres() {
        try {
            const response = await fetchWithTimeout(
                `${BASE_URL}/genre/movie/list?language=uk-UA`,
                { headers }
            )
            if (!response.ok) return []
            const data = await response.json()
            return data.genres || []
        } catch (error) {
            console.error('getGenres error:', error)
            return []
        }
    },
    
    getImageUrl(path, size = 'w500') {
        return path ? `${IMAGE_BASE_URL}/${size}${path}` : '/placeholder-movie.svg'
    },
    
    getBackdropUrl(path) {
        return path ? `${IMAGE_BASE_URL}/original${path}` : ''
    }
}