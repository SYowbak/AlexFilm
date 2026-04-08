<template>
  <div 
    class="relative group rounded-xl overflow-hidden bg-gray-800 border border-gray-700/50 hover:border-neon transition-all duration-300 shadow-lg hover:shadow-[0_0_20px_rgba(0,212,255,0.2)] cursor-pointer"
    @click="goToDetails"
  >
    <!-- Постер -->
    <div class="relative aspect-[2/3] overflow-hidden">
      <img 
        v-if="movie.poster_path"
        :src="tmdbApi.getImageUrl(movie.poster_path)" 
        :alt="movie.title"
        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      >
      <img 
        v-else
        src="/placeholder-movie.svg" 
        :alt="movie.title"
        class="w-full h-full object-cover opacity-50"
      >
      
      <!-- Оверлей при наведенні -->
      <div class="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <p class="text-sm text-gray-300 line-clamp-3 mb-2">{{ movie.overview || 'Опис відсутній...' }}</p>
        <button class="btn-neon py-2 text-xs w-full">Детальніше</button>
      </div>

      <!-- Рейтинг -->
      <div class="absolute top-2 right-2 bg-black/80 backdrop-blur-sm px-2 py-1 rounded-md border border-gray-700 flex items-center gap-1 shadow-lg">
        <svg class="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
        </svg>
        <span class="text-white text-sm font-bold">{{ movie.vote_average.toFixed(1) }}</span>
      </div>

      <!-- Улюблені -->
      <button 
        @click.stop="toggleFavorite"
        class="absolute top-2 left-2 w-8 h-8 rounded-full bg-black/80 backdrop-blur-sm border border-gray-700 flex items-center justify-center transition-colors hover:bg-gray-800 hover:border-red-500"
      >
        <svg 
          class="w-5 h-5 transition-colors"
          :class="isFavorite ? 'text-red-500 fill-current' : 'text-gray-400'"
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
        </svg>
      </button>
    </div>

    <!-- Інформація -->
    <div class="p-4">
      <h3 class="text-white font-semibold line-clamp-1 group-hover:text-neon transition-colors" :title="movie.title">
        {{ movie.title }}
      </h3>
      <div class="mt-2 flex items-center justify-between text-sm text-gray-400">
        <span>{{ new Date(movie.release_date).getFullYear() || 'Невідомо' }}</span>
        <span v-if="movie.genre_ids.length > 0" class="truncate ml-2 text-right opacity-70">
           <!-- У реальному додатку тут зазвичай мапинг id жанрів у назви, але для card це опціонально -->
           TMDB Фільм
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { tmdbApi } from '../api/tmdb'
import { useFavoritesStore } from '../stores/favorites'

const props = defineProps({
  movie: {
    type: Object,
    required: true
  }
})

const router = useRouter()
const favoritesStore = useFavoritesStore()

const isFavorite = computed(() => Object.keys(props.movie).length > 0 ? favoritesStore.isFavorite(props.movie.id) : false)

const goToDetails = () => {
  router.push(`/movie/${props.movie.id}`)
}

const toggleFavorite = () => {
  favoritesStore.toggleFavorite(props.movie)
}
</script>
