<template>
  <div class="max-w-7xl mx-auto px-4 sm:px-6 py-8">
    
    <!-- Hero секція з пошуком -->
    <div class="text-center mb-12">
      <h1 class="text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-neon to-blue-500 mb-4 tracking-tight">AlexFilm</h1>
      <p class="text-gray-400 mb-8 max-w-2xl mx-auto text-lg">Знайди ідеальний фільм під свій настрій або скористайся розширеним пошуком</p>
      
      <SearchBar @search="handleSearch" @clear="handleClearSearch" />
    </div>

    <!-- Вибір настрою -->
    <div class="mb-8">
      <CategorySelector 
        @select="handleCategorySelect" 
        @random="handleRandomMovie" 
        :selectedCategory="selectedCategory" 
      />
    </div>

    <!-- Розширені фільтри -->
    <FilterPanel 
      @filter-change="handleAdvancedFilter"
      :initialFilters="activeFilters"
    />

    <!-- Заголовок результатів та власне сітка -->
    <div class="mt-12">
      <h2 class="text-2xl font-bold text-white mb-6 border-l-4 border-neon pl-3">{{ getTitle() }}</h2>
      
      <MovieGrid 
        :movies="movies" 
        :loading="loading" 
        :currentPage="currentPage" 
        :totalPages="totalPages"
        @page-change="loadMovies" 
      />
    </div>

    <!-- Модалка випадкового фільму -->
    <div v-if="loadingRandom" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div class="flex flex-col items-center">
        <div class="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-neon mb-4"></div>
        <p class="text-neon font-bold animate-pulse text-xl">Шукаємо щось особливе...</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { tmdbApi, MOOD_CATEGORIES } from '../api/tmdb'
import CategorySelector from '../components/CategorySelector.vue'
import SearchBar from '../components/SearchBar.vue'
import MovieGrid from '../components/MovieGrid.vue'
import FilterPanel from '../components/FilterPanel.vue'

const router = useRouter()

const movies = ref([])
const loading = ref(false)
const currentPage = ref(1)
const totalPages = ref(1)
const selectedCategory = ref('')
const searchMode = ref(false)
const searchQuery = ref('')
const filterMode = ref(false)
const activeFilters = ref({})
const loadingRandom = ref(false)

const getTitle = () => {
  if (searchMode.value) return `Результати пошуку: "${searchQuery.value}"`
  if (filterMode.value && selectedCategory.value) {
    return `${selectedCategory.value} (з фільтрами)`
  }
  if (filterMode.value) return 'Фільми за вашими критеріями'
  return selectedCategory.value || 'Популярні фільми'
}

const loadMovies = async (page = 1) => {
  loading.value = true
  try {
    let results
    if (searchMode.value) {
      results = await tmdbApi.searchMovies(searchQuery.value, page)
      movies.value = results
      totalPages.value = 10 
    } else if (filterMode.value) {
      const currentFilters = { ...activeFilters.value }
      
      if (selectedCategory.value) {
        const moodData = MOOD_CATEGORIES[selectedCategory.value]
        if (moodData) {
           if (!currentFilters.genre && moodData.genres && moodData.genres.length > 0) {
             currentFilters.genre = moodData.genres
           }
           if (!currentFilters.year && moodData.yearMax) {
              currentFilters.year = 'older' 
           }
        }
      }
      
      results = await tmdbApi.getFilteredMovies(currentFilters, page)
      movies.value = results
      totalPages.value = 50
    } else if (selectedCategory.value) {
      results = await tmdbApi.getMoviesByMood(selectedCategory.value, page)
      movies.value = results
      totalPages.value = 20
    } else {
      results = await tmdbApi.getPopularMovies(page)
      movies.value = results
      totalPages.value = 50
    }
    currentPage.value = page
  } catch (error) {
    console.error('Помилка завантаження фільмів:', error)
  } finally {
    loading.value = false
  }
}

const handleCategorySelect = (category) => {
  if (selectedCategory.value === category) {
      selectedCategory.value = ''
      if (!filterMode.value) loadMovies(1)
  } else {
      selectedCategory.value = category
      searchMode.value = false
      searchQuery.value = ''
      loadMovies(1)
  }
}

const handleSearch = (query) => {
  searchQuery.value = query
  searchMode.value = true
  selectedCategory.value = ''
  filterMode.value = false
  activeFilters.value = {}
  loadMovies(1)
}

const handleClearSearch = () => {
  searchMode.value = false
  searchQuery.value = ''
  loadMovies(1)
}

const handleAdvancedFilter = (filters) => {
  const hasActiveFilters = filters.genre !== '' || filters.year !== '' || filters.rating !== '6' || filters.sortBy !== 'popularity.desc'
  
  if (hasActiveFilters || filterMode.value) {
    activeFilters.value = filters
    filterMode.value = true
    searchMode.value = false
    loadMovies(1)
  } else {
    filterMode.value = false
    loadMovies(1)
  }
}

const handleRandomMovie = async () => {
  loadingRandom.value = true
  try {
    const movie = await tmdbApi.getRandomMovie()
    if (movie) {
      // Затримка для анімації "Шукаємо..." для вау-ефекту
      setTimeout(() => {
        router.push(`/movie/${movie.id}`)
      }, 1000)
    }
  } catch (e) {
    console.error('Помилка випадкового фільму', e)
    loadingRandom.value = false
  }
}

onMounted(() => {
  loadMovies(1)
})
</script>
