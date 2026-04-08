const API_KEY = '0aae6e08fea10578e99f3da447ac2fcb'
const BASE_URL = 'https://api.themoviedb.org/3'
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p'

// Категорії настрою з відповідними жанрами та ключовими словами
export const MOOD_CATEGORIES = {
    'Хочу посміятися': { genres: [35], keywords: 'comedy,funny,humor' },
    'Для вечора з коханою людиною': { genres: [10749], keywords: 'romance,love,relationship' },
    'Щоб думати': { genres: [18, 9648], keywords: 'philosophy,psychological,thought-provoking' },
    'Адреналін': { genres: [28, 53], keywords: 'action,thriller,intense' },
    'Ностальгія': { genres: [], keywords: 'classic,retro,vintage', yearMax: 2000 },
    'Щось дивне': { genres: [14, 878], keywords: 'surreal,weird,strange' },
    'На вечір п\'ятниці': { genres: [35, 28], keywords: 'entertaining,light,fun' },
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
const translateToUkrainian = async (text) => {
    if (!text) return text;
    try {
        const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=uk&dt=t&q=${encodeURIComponent(text)}`);
        if (!response.ok) return text;
        const data = await response.json();
        return data[0].map(item => item[0]).join('');
    } catch (error) {
        console.error('Translation error:', error);
        return text;
    }
}

// Додатковий фільтр для боротьби з не-українськими перекладами
const sanitizeMovieLanguage = async (movie) => {
    if (!movie) return movie;
    const ruRegex = /[ыэъёЫЭЪЁ]/;
    
    // Перекладаємо назву, якщо вона містить російські літери 
    if (movie.title && ruRegex.test(movie.title)) {
        movie.title = await translateToUkrainian(movie.title);
    }
    
    // Перекладаємо опис
    if (movie.overview && ruRegex.test(movie.overview)) {
        movie.overview = await translateToUkrainian(movie.overview);
    }
    
    return movie;
}

export const tmdbApi = {
    // Пошук фільмів за категорією настрою
    async getMoviesByMood(mood, page = 1) {
        const category = MOOD_CATEGORIES[mood]
        if (!category) return []

        const params = new URLSearchParams({
            api_key: API_KEY,
            language: 'uk-UA',
            page: page.toString(),
            sort_by: 'popularity.desc',
            'vote_average.gte': '6',
            'vote_count.gte': '50'
        })

        if (category.genres.length > 0) {
            params.append('with_genres', category.genres.join(','))
        }

        if (category.yearMax) {
            params.append('primary_release_date.lte', `${category.yearMax}-12-31`)
        }

        const response = await fetch(`${BASE_URL}/discover/movie?${params}`, { headers })
        const data = await response.json()
        return await Promise.all((data.results || []).map(sanitizeMovieLanguage))
    },

    // Розширений фільтр
    async getFilteredMovies(filters, page = 1) {
        const params = new URLSearchParams({
            api_key: API_KEY,
            language: 'uk-UA',
            page: page.toString(),
            sort_by: filters.sortBy || 'popularity.desc',
            'vote_count.gte': '50'
        })

        if (filters.genre) {
            // Якщо передано масив жанрів (наприклад, з категорії), з'єднуємо через кому
            if (Array.isArray(filters.genre)) {
                if (filters.genre.length > 0) {
                    params.append('with_genres', filters.genre.join(','))
                }
            } else {
                params.append('with_genres', filters.genre)
            }
        }

        if (filters.rating) {
            params.append('vote_average.gte', filters.rating)
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

        const response = await fetch(`${BASE_URL}/discover/movie?${params}`, { headers })
        const data = await response.json()
        return await Promise.all((data.results || []).map(sanitizeMovieLanguage))
    },

    // Пошук за запитом
    async searchMovies(query, page = 1) {
        const params = new URLSearchParams({
            api_key: API_KEY,
            query,
            language: 'uk-UA',
            page: page.toString()
        })

        const response = await fetch(`${BASE_URL}/search/movie?${params}`, { headers })
        const data = await response.json()
        return await Promise.all((data.results || []).map(sanitizeMovieLanguage))
    },

    // Деталі фільму
    async getMovieDetails(movieId) {
        const response = await fetch(
            `${BASE_URL}/movie/${movieId}?api_key=${API_KEY}&language=uk-UA&append_to_response=videos,credits`,
            { headers }
        )
        const data = await response.json()
        return await sanitizeMovieLanguage(data)
    },

    // Популярні фільми
    async getPopularMovies(page = 1) {
        const response = await fetch(
            `${BASE_URL}/movie/popular?api_key=${API_KEY}&language=uk-UA&page=${page}`,
            { headers }
        )
        const data = await response.json()
        return await Promise.all((data.results || []).map(sanitizeMovieLanguage))
    },

    // Випадковий фільм
    async getRandomMovie() {
        let movies = []
        // Спробуємо знайти фільм з постером та описом (до 3 спроб)
        for (let i = 0; i < 3; i++) {
            const randomPage = Math.floor(Math.random() * 50) + 1
            movies = await this.getPopularMovies(randomPage)

            const validMovies = movies.filter(m => m.poster_path && m.overview && m.vote_average >= 5)
            if (validMovies.length > 0) {
                const randomMovie = validMovies[Math.floor(Math.random() * validMovies.length)]
                return await this.getMovieDetails(randomMovie.id)
            }
        }

        // Резервний варіант, якщо ідеальні фільми не знайдені
        if (movies.length > 0) {
            const randomMovie = movies[Math.floor(Math.random() * movies.length)]
            return await this.getMovieDetails(randomMovie.id)
        }
        return null
    },

    // Жанри
    async getGenres() {
        const response = await fetch(
            `${BASE_URL}/genre/movie/list?api_key=${API_KEY}&language=uk-UA`,
            { headers }
        )
        const data = await response.json()
        return data.genres || []
    },

    getImageUrl(path, size = 'w500') {
        return path ? `${IMAGE_BASE_URL}/${size}${path}` : '/placeholder-movie.svg'
    },

    getBackdropUrl(path) {
        return path ? `${IMAGE_BASE_URL}/original${path}` : ''
    }
}
