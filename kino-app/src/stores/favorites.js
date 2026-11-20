import { defineStore } from 'pinia'

// Список улюблених зберігається окремо для кожного акаунта:
// ключ вигляду "alex-film-favorites:<userId>"
const STORAGE_PREFIX = 'alex-film-favorites:'
const SESSION_KEY = 'alex-film-user'

const getSessionUserId = () => {
    try {
        const session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
        return session?.id || null
    } catch {
        return null
    }
}

const readFavorites = (userId) => {
    if (!userId) return []
    try {
        const raw = localStorage.getItem(STORAGE_PREFIX + userId)
        const parsed = raw ? JSON.parse(raw) : []
        return Array.isArray(parsed) ? parsed : []
    } catch {
        return []
    }
}

// Зберігаємо лише потрібні поля — повний об'єкт деталей фільму
// (трейлери, актори, тощо) забив би localStorage без користі.
const toSlimMovie = (movie) => ({
    id: movie.id,
    title: movie.title,
    original_title: movie.original_title || '',
    overview: movie.overview || '',
    poster_path: movie.poster_path || '',
    backdrop_path: movie.backdrop_path || '',
    release_date: movie.release_date || '',
    vote_average: movie.vote_average ?? 0,
    vote_count: movie.vote_count ?? 0,
    genre_ids: Array.isArray(movie.genre_ids) ? movie.genre_ids : []
})

export const useFavoritesStore = defineStore('favorites', {
    state: () => {
        const userId = getSessionUserId()
        return {
            userId,
            favorites: readFavorites(userId)
        }
    },
    getters: {
        // Чи можна зараз користуватися улюбленими
        isAuthenticated: (state) => !!state.userId
    },
    actions: {
        // Викликається при вході/виході — перемикає список на потрібного користувача
        syncUser(userId) {
            const nextId = userId || null
            if (nextId === this.userId) return
            this.userId = nextId
            this.favorites = readFavorites(nextId)
        },

        toggleFavorite(movie) {
            if (!this.userId || !movie?.id) {
                return { ok: false, reason: 'auth' }
            }

            const index = this.favorites.findIndex(f => f.id === movie.id)
            if (index === -1) {
                this.favorites.push(toSlimMovie(movie))
            } else {
                this.favorites.splice(index, 1)
            }
            this.saveToLocal()

            return { ok: true, added: index === -1 }
        },

        isFavorite(movieId) {
            return this.favorites.some(f => f.id === movieId)
        },

        saveToLocal() {
            if (!this.userId) return
            localStorage.setItem(STORAGE_PREFIX + this.userId, JSON.stringify(this.favorites))
        }
    }
})
