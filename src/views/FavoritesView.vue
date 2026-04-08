<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    <div class="mb-12">
      <h1 class="text-4xl pr-4 font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-neon to-amber-500 mb-4 inline-block tracking-tight border-b-4 border-neon">Улюблені фільми</h1>
    </div>

    <div v-if="!authStore.user" class="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800/50">
      <h3 class="text-2xl text-slate-300 font-semibold mb-4">Ви не авторизовані 🔒</h3>
      <p class="text-slate-400 mb-6">Увійдіть у свій акаунт, щоб мати доступ до списку улюблених фільмів.</p>
      <router-link to="/login" class="btn-neon px-8 py-3 text-lg">Увійти</router-link>
    </div>

    <div v-else-if="favoritesStore.favorites.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      <MovieCard 
        v-for="movie in favoritesStore.favorites" 
        :key="movie.id" 
        :movie="movie" 
      />
    </div>

    <div v-else class="text-center py-20 bg-slate-900/50 rounded-2xl border border-slate-800/50">
      <h3 class="text-2xl text-slate-300 font-semibold mb-2">Список порожній 😔</h3>
      <p class="text-slate-400 mb-6">Шукайте фільми та додавайте їх до списку улюблених.</p>
      <router-link to="/" class="btn-outline-neon inline-block">На головну</router-link>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from '../stores/auth'
import { useFavoritesStore } from '../stores/favorites'
import MovieCard from '../components/MovieCard.vue'

const authStore = useAuthStore()
const favoritesStore = useFavoritesStore()
</script>
