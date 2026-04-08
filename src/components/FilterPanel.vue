<template>
  <div class="bg-gray-800/50 rounded-xl p-4 sm:p-6 backdrop-blur-sm border border-gray-700/50 mt-6">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-neon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        Розширений пошук
      </h3>
      <button 
        @click="resetFilters"
        v-if="hasActiveFilters"
        class="text-sm text-gray-400 hover:text-red-400 transition-colors flex items-center gap-1"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Скинути
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <!-- Жанр -->
      <div class="space-y-1">
        <label class="block text-sm font-medium text-gray-400">Жанр</label>
        <select 
          v-model="filters.genre"
          @change="applyFilters"
          class="w-full bg-gray-900 border-gray-700 rounded-lg text-white text-sm focus:ring-neon focus:border-neon p-2.5 outline-none transition-colors border"
        >
          <option value="">Будь-який</option>
          <option v-for="genre in genres" :key="genre.id" :value="genre.id">
            {{ genre.name }}
          </option>
        </select>
      </div>

      <!-- Рік -->
      <div class="space-y-1">
        <label class="block text-sm font-medium text-gray-400">Рік випуску</label>
        <select 
          v-model="filters.year"
          @change="applyFilters"
          class="w-full bg-gray-900 border-gray-700 rounded-lg text-white text-sm focus:ring-neon focus:border-neon p-2.5 outline-none transition-colors border"
        >
          <option value="">Будь-який</option>
          <option value="2026">2026</option>
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
          <option value="2022">2022</option>
          <option value="2021">2021</option>
          <option value="2020">2020</option>
          <option value="2010s">2010-ті</option>
          <option value="2000s">2000-ні</option>
          <option value="older">До 2000 року</option>
        </select>
      </div>

      <!-- Рейтинг -->
      <div class="space-y-1">
        <label class="block text-sm font-medium text-gray-400">Рейтинг від</label>
        <select 
          v-model="filters.rating"
          @change="applyFilters"
          class="w-full bg-gray-900 border-gray-700 rounded-lg text-white text-sm focus:ring-neon focus:border-neon p-2.5 outline-none transition-colors border"
        >
          <option value="5">5.0+</option>
          <option value="6">6.0+ (Добре)</option>
          <option value="7">7.0+ (Дуже добре)</option>
          <option value="8">8.0+ (Чудово)</option>
          <option value="9">9.0+ (Шедевр)</option>
        </select>
      </div>

      <!-- Сортування -->
      <div class="space-y-1">
        <label class="block text-sm font-medium text-gray-400">Сортувати за</label>
        <select 
          v-model="filters.sortBy"
          @change="applyFilters"
          class="w-full bg-gray-900 border-gray-700 rounded-lg text-white text-sm focus:ring-neon focus:border-neon p-2.5 outline-none transition-colors border"
        >
          <option value="popularity.desc">Популярністю</option>
          <option value="primary_release_date.desc">Новизною (Спочатку нові)</option>
          <option value="primary_release_date.asc">Новизною (Спочатку старі)</option>
          <option value="vote_average.desc">Рейтингом</option>
          <option value="title.asc">Назвою (А-Я)</option>
        </select>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { tmdbApi } from '../api/tmdb'

const props = defineProps({
  initialFilters: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['filter-change'])

const genres = ref([])
const filters = ref({
  genre: '',
  year: '',
  rating: '6', // Значення за замовчуванням з API
  sortBy: 'popularity.desc'
})

// Синхронізуємо зі зовнішнім станом, якщо він змінюється
watch(() => props.initialFilters, (newVals) => {
  if (Object.keys(newVals).length === 0) {
    resetFilters()
  }
}, { deep: true })

const hasActiveFilters = computed(() => {
  return filters.value.genre !== '' || 
         filters.value.year !== '' || 
         filters.value.rating !== '6' ||
         filters.value.sortBy !== 'popularity.desc'
})

const loadGenres = async () => {
  try {
    genres.value = await tmdbApi.getGenres()
  } catch (error) {
    console.error('Помилка завантаження жанрів:', error)
  }
}

const applyFilters = () => {
  // Передаємо копію, щоб уникнути мутацій до підтвердження
  emit('filter-change', { ...filters.value })
}

const resetFilters = () => {
  filters.value = {
    genre: '',
    year: '',
    rating: '6',
    sortBy: 'popularity.desc'
  }
  emit('filter-change', { ...filters.value })
}

onMounted(() => {
  loadGenres()
  // Якщо є початкові фільтри, встановлюємо їх
  if (Object.keys(props.initialFilters).length > 0) {
    filters.value = { ...filters.value, ...props.initialFilters }
  }
})
</script>
