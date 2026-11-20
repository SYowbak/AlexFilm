import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useFavoritesStore } from '../stores/favorites'
import { useToastStore } from '../stores/toast'

/**
 * Спільна логіка кнопки "в улюблені".
 * Додавати в улюблені можуть лише авторизовані користувачі.
 */
export function useFavorite() {
    const route = useRoute()
    const router = useRouter()
    const authStore = useAuthStore()
    const favoritesStore = useFavoritesStore()
    const toastStore = useToastStore()

    const requireAuth = () => {
        if (authStore.user) return true

        toastStore.show({
            message: 'Увійдіть, щоб додавати фільми до улюблених',
            actionLabel: 'Увійти',
            actionTo: { path: '/login', query: { redirect: route.fullPath } },
            timeout: 6000
        })
        return false
    }

    const toggleFavorite = (movie) => {
        if (!movie?.id) return
        if (!requireAuth()) return

        const result = favoritesStore.toggleFavorite(movie)
        if (!result.ok) return

        toastStore.show({
            message: result.added ? 'Додано до улюблених' : 'Видалено з улюблених',
            timeout: 2500
        })
    }

    const favoriteTitle = (isFavorite) => {
        if (!authStore.user) return 'Увійдіть, щоб додати в улюблені'
        return isFavorite ? 'Видалити з улюблених' : 'Додати в улюблені'
    }

    return { toggleFavorite, requireAuth, favoriteTitle }
}
