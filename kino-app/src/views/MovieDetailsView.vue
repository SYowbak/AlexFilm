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
              @click="toggleFavorite(movie)"
              class="absolute top-4 right-4 w-12 h-12 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center transition-colors border border-slate-600 hover:border-red-500 hover:bg-slate-800"
              :title="favoriteTitle(isFavorite)"
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
            <span class="bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
              {{ releaseYear || '—' }}
            </span>
            <span class="bg-slate-800 px-3 py-1.5 rounded-lg text-slate-300 border border-slate-700">
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
            <p class="text-slate-300 leading-relaxed">{{ movie.overview || 'Опис українською мовою поки що відсутній.' }}</p>
          </div>

          <!-- Де подивитися -->
          <div class="mt-8 bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 backdrop-blur-sm">
            <h3 class="text-xl font-semibold text-white mb-3 border-l-4 border-neon pl-3">Шукати в українській озвучці</h3>
            
            <div class="mb-5 bg-black/40 p-3 rounded-lg border border-slate-800/50">
              <label class="flex items-center gap-3 text-sm text-slate-300 cursor-pointer hover:text-white transition-colors w-max">
                <input type="checkbox" v-model="useOriginalTitle" class="w-4 h-4 rounded border-slate-600 bg-slate-700 text-neon focus:ring-neon focus:ring-offset-slate-950">
                <span>
                  Шукати за оригінальною назвою <span class="text-slate-400 ml-1">({{ movie.original_title }})</span>
                </span>
              </label>
              <p class="text-xs text-slate-500 mt-2 ml-7">Піратські кінотеатри часто краще знаходять фільми саме за англійською назвою, якщо офіційний переклад ще не вийшов.</p>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <button @click="openUaSearch('uaserials')" class="btn-outline-neon flex items-center gap-2 text-yellow-400 border-yellow-400/50 hover:bg-yellow-400/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на UASerials
              </button>
              <button @click="openUaSearch('uafix')" class="btn-outline-neon flex items-center gap-2 text-orange-400 border-orange-400/50 hover:bg-orange-400/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на UAFLIX (uafix.net)
              </button>
              <button @click="openUaSearch('uakino')" class="btn-outline-neon flex items-center gap-2 text-white border-slate-600 hover:bg-white/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на UAkino
              </button>
              <button @click="openUaSearch('eneyida')" class="btn-outline-neon flex items-center gap-2 text-blue-400 border-blue-400/50 hover:bg-blue-400/10">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Шукати на Eneyida
              </button>
              <button @click="copySearchTitle" class="px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 transition-colors flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {{ copyNotice || 'Скопіювати назву' }}
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
            <div class="w-24 h-24 mx-auto rounded-full overflow-hidden mb-3 border-2 border-slate-700">
              <img :src="tmdbApi.getImageUrl(actor.profile_path, 'w185')" :alt="actor.name" class="w-full h-full object-cover">
            </div>
            <p class="text-slate-200 text-sm font-semibold truncate">{{ actor.name }}</p>
            <p class="text-slate-500 text-xs truncate">{{ actor.character }}</p>
          </div>
        </div>
      </div>

      <!-- Вбудований плеєр у стилі LAMPA -->
      <div class="mt-16 bg-slate-900/50 rounded-2xl p-6 border border-slate-800/50 backdrop-blur-sm">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <h3 class="text-2xl font-bold text-white border-l-4 border-neon pl-3">Онлайн-плеєр LAMPA</h3>
            <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neon/15 text-neon border border-neon/30">Вбудований</span>
          </div>
          <span class="text-xs text-slate-400 hidden sm:inline-block">Автономний відеоплеєр у фірмовому стилі</span>
        </div>

        <LampaPlayer
          :title="movie.title"
          :originalTitle="movie.original_title || ''"
          :year="releaseYear"
          :subtitle="movie.tagline || playerSubtitle"
          :backdrop="tmdbApi.getBackdropUrl(movie.backdrop_path)"
          :tmdbId="movie.id"
          type="movie"
        />

        <p class="text-xs text-slate-500 mt-4 leading-relaxed">
          * Власний HTML5/HLS плеєр у стилістиці <strong>LAMPA</strong>: адаптивний таймлайн, перемикання якостей, регулювання гучності та повноекранний режим. Український дубляж — без реклами.
        </p>
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
import { ref, onBeforeUnmount, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { tmdbApi } from '../api/tmdb'
import { useFavoritesStore } from '../stores/favorites'
import { useFavorite } from '../composables/useFavorite'
import TrailerModal from '../components/TrailerModal.vue'
import LampaPlayer from '../components/LampaPlayer.vue'

const route = useRoute()
const favoritesStore = useFavoritesStore()
const { toggleFavorite, favoriteTitle } = useFavorite()

const movie = ref(null)
const loading = ref(true)
const showTrailer = ref(false)
const useOriginalTitle = ref(true)

const isFavorite = computed(() => movie.value ? favoritesStore.isFavorite(movie.value.id) : false)

const copyNotice = ref('')

const openUaSearch = (site) => {
  if (!movie.value) return
  
  const query = useOriginalTitle.value && movie.value.original_title 
    ? movie.value.original_title 
    : movie.value.title

  // Копіюємо в буфер обміну для швидкої вставки
  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(query).then(() => {
      copyNotice.value = `«${query}» скопійовано!`
      setTimeout(() => { copyNotice.value = '' }, 3500)
    }).catch(() => {})
  }

  if (site === 'uaserials') {
    // Швидкий прямий GET пошук на UASerials
    const url = `https://uaserials.fm/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  } else if (site === 'uafix') {
    // Швидкий прямий GET пошук на UAFLIX (uafix.net)
    const url = `https://uafix.net/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  } else if (site === 'uakino') {
    // Форма пошуку для UAkino
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = 'https://uakino.best/ua/'
    form.target = '_blank'
    form.rel = 'noopener noreferrer'
    
    const fields = {
      do: 'search',
      subaction: 'search',
      story: query,
    }

    for (const [name, val] of Object.entries(fields)) {
      const input = document.createElement('input')
      input.type = 'hidden'
      input.name = name
      input.value = val
      form.appendChild(input)
    }
    
    document.body.appendChild(form)
    form.submit()
    setTimeout(() => form.remove(), 1000)
  } else if (site === 'eneyida') {
    const url = `https://eneyida.tv/index.php?do=search&subaction=search&story=${encodeURIComponent(query)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }
}

const copySearchTitle = () => {
  if (!movie.value) return
  const query = useOriginalTitle.value && movie.value.original_title 
    ? movie.value.original_title 
    : movie.value.title

  if (navigator?.clipboard?.writeText) {
    navigator.clipboard.writeText(query).then(() => {
      copyNotice.value = `«${query}» скопійовано!`
      setTimeout(() => { copyNotice.value = '' }, 3500)
    })
  }
}

let detailsRequestId = 0
let detailsController = null

const loadMovieDetails = async (movieId, signal) => {
  const requestId = ++detailsRequestId
  try {
    const data = await tmdbApi.getMovieDetails(movieId, { signal })
    // Відповідь старого route-param не має права замінити новий фільм.
    if (requestId !== detailsRequestId) return
    movie.value = data
  } catch (error) {
    if (requestId !== detailsRequestId || error?.name === 'AbortError') return
    console.error('Помилка завантаження фільму:', error?.message || error)
  } finally {
    if (requestId === detailsRequestId) loading.value = false
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

// Рік беремо з перших чотирьох символів release_date, а не через Date:
// новий Date('YYYY-MM-DD') у деяких timezone-ах зміщує рік на 1.
const releaseYear = computed(() => {
  const match = String(movie.value?.release_date || '').match(/^(\d{4})/)
  return match ? Number(match[1]) : null
})

const playerSubtitle = computed(() => {
  if (!movie.value) return ''
  return `${releaseYear.value || '—'} • ${formatRuntime(movie.value.runtime)}`
})

// Vue Router перев reuse-компонента на іншому /movie/:id. Спостерігаємо
// за route.params.id, скасовуємо попередній запит і ігноруємо stale-відповідь.
watch(
  () => route.params.id,
  (movieId) => {
    detailsController?.abort()
    detailsController = null
    loading.value = true
    movie.value = null

    if (!movieId) {
      loading.value = false
      return
    }

    const controller = new AbortController()
    detailsController = controller
    loadMovieDetails(String(movieId), controller.signal)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  detailsRequestId++
  detailsController?.abort()
  detailsController = null
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
