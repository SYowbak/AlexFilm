<template>
  <div v-if="loading" class="min-h-screen flex items-center justify-center">
    <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-neon"></div>
  </div>

  <div v-else-if="movie" class="pb-20">
    <!-- Зображення бекдропу (тло) -->
    <div class="h-96 md:h-[500px] relative overflow-hidden">
        <img 
          :src="tmdbApi.getBackdropUrl(movie.backdrop_path)" 
          class="w-full h-full object-cover opacity-30 scale-105"
          alt=""
        />
        <div class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent"></div>
        
        <div class="absolute inset-0 flex items-center justify-center">
            <button v-if="trailerKey" @click="showTrailer = true" class="group relative flex flex-col items-center gap-4">
                <div class="w-20 h-20 bg-neon rounded-full flex items-center justify-center pl-1 shadow-[0_0_30px_rgba(255,204,0,0.6)] group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-slate-950" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                </div>
                <span class="text-white font-bold tracking-widest text-sm uppercase group-hover:text-neon transition-colors">Дивитися трейлер</span>
            </button>
        </div>

      <button @click="$router.push('/')" class="absolute top-6 left-6 z-20 btn-outline-neon bg-slate-900/50 backdrop-blur-md">
        &larr; На головну
      </button>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 relative -mt-32 md:-mt-48 z-10">
      <div class="flex flex-col md:flex-row gap-8">
        
        <!-- Постер -->
        <div class="w-full md:w-1/3 max-w-[300px] mx-auto md:mx-0 flex-shrink-0">
          <div class="relative rounded-2xl overflow-hidden shadow-2xl border-4 border-slate-800">
            <img 
              :src="tmdbApi.getImageUrl(movie.poster_path, 'w500')" 
              :alt="movie.title"
              class="w-full object-cover"
            >
            <button 
              @click="toggleFavorite"
              class="absolute top-4 right-4 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center transition-colors border border-slate-600 hover:border-red-500 hover:bg-slate-800"
            >
              <svg 
                class="w-7 h-7 transition-colors"
                :class="isFavorite ? 'text-red-500 fill-current' : 'text-white'"
                fill="none" viewBox="0 0 24 24" stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Інфо -->
        <div class="md:w-2/3 md:pt-16">
          <h1 class="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-neon to-yellow-500 mb-4 tracking-tight">{{ movie.title }}</h1>
          <p class="text-slate-400 text-lg mb-6" v-if="movie.tagline">{{ movie.tagline }}</p>

          <div class="flex flex-wrap items-center gap-4 text-sm mb-6">
            <span class="flex items-center gap-1 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
              <svg class="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
              </svg>
              <span class="font-bold text-white">{{ movie.vote_average.toFixed(1) }}</span>
            </span>
            <span class="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300 border border-gray-700">
              {{ new Date(movie.release_date).getFullYear() }}
            </span>
            <span class="bg-gray-800 px-3 py-1.5 rounded-lg text-gray-300 border border-gray-700">
              {{ formatRuntime(movie.runtime) }}
            </span>
          </div>

          <div class="flex flex-wrap gap-2 mb-8">
            <span 
              v-for="genre in movie.genres" 
              :key="genre.id"
              class="px-3 py-1 bg-neon/10 text-neon rounded-full text-sm border border-neon/30"
            >
              {{ genre.name }}
            </span>
          </div>

          <div class="mb-8">
            <h3 class="text-xl font-semibold text-white mb-3">Опис</h3>
            <p class="text-gray-300 leading-relaxed">{{ movie.overview || 'Опис українською мовою поки що відсутній.' }}</p>
          </div>

          <!-- Де подивитися -->
          <div class="mt-8 bg-gray-800/30 rounded-2xl p-6 border border-gray-700/50 backdrop-blur-sm">
            <h3 class="text-xl font-semibold text-white mb-3 border-l-4 border-neon pl-3">Шукати в українській озвучці</h3>
            
            <div class="mb-5 bg-black/40 p-3 rounded-lg border border-gray-700/50">
              <label class="flex items-center gap-3 text-sm text-gray-300 cursor-pointer hover:text-white transition-colors w-max">
                <input type="checkbox" v-model="useOriginalTitle" class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-neon focus:ring-neon focus:ring-offset-gray-900">
                <span>
                  Шукати за оригінальною назвою <span class="text-gray-400 ml-1">({{ movie.original_title }})</span>
                </span>
              </label>
              <p class="text-xs text-gray-500 mt-2 ml-7">Піратські кінотеатри часто краще знаходять фільми саме за англійською назвою, якщо офіційний переклад ще не вийшов.</p>
            </div>

            <div class="flex flex-wrap gap-3">
              <button @click="submitDleSearch('https://uakino.best/ua/')" class="btn-outline-neon flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на UAkino
              </button>
              <button @click="submitDleSearch('https://uaserials.net/')" class="btn-outline-neon flex items-center gap-2 text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на UASerials
              </button>
              <button @click="submitDleSearch('https://uafix.net/index.php')" class="btn-outline-neon flex items-center gap-2 text-green-400 border-green-400/50 hover:bg-green-400/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на UAFix
              </button>
            </div>
          </div>

        </div>
      </div>

      <!-- Актори -->
      <div v-if="cast.length > 0" class="mt-16">
        <h3 class="text-2xl font-bold text-white mb-6 border-l-4 border-neon pl-3">В головних ролях</h3>
        <div class="flex gap-4 overflow-x-auto pb-4 hide-scrollbar">
          <div v-for="actor in cast" :key="actor.id" class="w-32 flex-shrink-0 text-center">
            <div class="w-24 h-24 mx-auto rounded-full overflow-hidden mb-3 border-2 border-gray-700">
              <img :src="tmdbApi.getImageUrl(actor.profile_path, 'w185')" :alt="actor.name" class="w-full h-full object-cover">
            </div>
            <p class="text-gray-200 text-sm font-semibold truncate">{{ actor.name }}</p>
            <p class="text-gray-500 text-xs truncate">{{ actor.character }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Модальне вікно трейлера -->
    <TrailerModal 
      :show="showTrailer" 
      :videoKey="trailerKey" 
      :title="movie.title"
      @close="showTrailer = false" 
    />
  </div>

  <div v-else class="min-h-screen flex items-center justify-center text-white text-xl">
    Помилка завантаження фільму. <a href="/" class="text-neon ml-2 hover:underline">На головну</a>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { tmdbApi } from '../api/tmdb'
import { useFavoritesStore } from '../stores/favorites'
import TrailerModal from '../components/TrailerModal.vue'

const route = useRoute()
const router = useRouter()
const favoritesStore = useFavoritesStore()

const movie = ref(null)
const loading = ref(true)
const showTrailer = ref(false)
const useOriginalTitle = ref(true)

const isFavorite = computed(() => movie.value ? favoritesStore.isFavorite(movie.value.id) : false)

const toggleFavorite = () => {
  if (movie.value) favoritesStore.toggleFavorite(movie.value)
}

const submitDleSearch = (url) => {
  if (!movie.value) return
  
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = url
  form.target = '_blank'
  
  const doInput = document.createElement('input')
  doInput.type = 'hidden'
  doInput.name = 'do'
  doInput.value = 'search'
  form.appendChild(doInput)
  
  const subactionInput = document.createElement('input')
  subactionInput.type = 'hidden'
  subactionInput.name = 'subaction'
  subactionInput.value = 'search'
  form.appendChild(subactionInput)
  
  const storyInput = document.createElement('input')
  storyInput.type = 'hidden'
  storyInput.name = 'story'
  storyInput.value = useOriginalTitle.value ? movie.value.original_title : movie.value.title
  form.appendChild(storyInput)
  
  document.body.appendChild(form)
  form.submit()
  document.body.removeChild(form)
}

const loadMovieDetails = async () => {
  try {
    const data = await tmdbApi.getMovieDetails(route.params.id)
    movie.value = data
  } catch (error) {
    console.error('Помилка:', error)
  } finally {
    loading.value = false
  }
}

const trailerKey = computed(() => {
  if (!movie.value?.videos?.results) return null
  const trailer = movie.value.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube')
  return trailer ? trailer.key : movie.value.videos.results[0]?.key
})

const cast = computed(() => {
  return movie.value?.credits?.cast?.slice(0, 10).filter(actor => actor.profile_path) || []
})

const formatRuntime = (minutes) => {
  if (!minutes) return 'Невідомо'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h} год ${m} хв` : `${m} хв`
}

onMounted(() => {
  loadMovieDetails()
})
</script>

<style scoped>
.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
