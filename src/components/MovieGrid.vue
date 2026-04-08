<template>
  <div>
    <!-- Основна сітка -->
    <div v-if="!loading && movies.length > 0" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
      <MovieCard 
        v-for="movie in movies" 
        :key="movie.id" 
        :movie="movie" 
      />
    </div>

    <!-- Завантаження -->
    <div v-else-if="loading" class="flex justify-center items-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-neon"></div>
    </div>

    <!-- Пустий стан -->
    <div v-else class="text-center py-20">
      <h3 class="text-2xl text-gray-400 font-semibold mb-2">Фільмів не знайдено 😔</h3>
      <p class="text-gray-500">Спробуйте змінити критерії пошуку або обрати іншу категорію настрою.</p>
    </div>

    <!-- Пагінація -->
    <div v-if="totalPages > 1 && !loading && movies.length > 0" class="mt-12 flex justify-center items-center gap-2 flex-wrap">
      <button 
        @click="$emit('page-change', currentPage - 1)"
        :disabled="currentPage === 1"
        class="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition"
      >
        Попередня
      </button>
      
      <div class="flex gap-1 overflow-x-auto max-w-[200px] sm:max-w-md hide-scrollbar">
        <button 
          v-for="page in visiblePages" 
          :key="page"
          @click="$emit('page-change', page)"
          class="min-w-[40px] h-10 rounded-lg flex items-center justify-center transition-colors"
          :class="currentPage === page ? 'bg-neon text-gray-900 font-bold' : 'bg-gray-800 text-white hover:bg-gray-700'"
        >
          {{ page }}
        </button>
      </div>

      <button 
        @click="$emit('page-change', currentPage + 1)"
        :disabled="currentPage === totalPages"
        class="px-4 py-2 rounded-lg bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-700 transition"
      >
        Наступна
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MovieCard from './MovieCard.vue'

const props = defineProps({
  movies: {
    type: Array,
    required: true
  },
  loading: {
    type: Boolean,
    default: false
  },
  currentPage: {
    type: Number,
    default: 1
  },
  totalPages: {
    type: Number,
    default: 1
  }
})

defineEmits(['page-change'])

// Логіка для відображення обмеженої кількості сторінок (якщо їх 50)
const visiblePages = computed(() => {
  const maxVisible = 5
  let start = Math.max(1, props.currentPage - Math.floor(maxVisible / 2))
  let end = Math.min(props.totalPages, start + maxVisible - 1)
  
  if (end - start + 1 < maxVisible) {
    start = Math.max(1, end - maxVisible + 1)
  }
  
  const pages = []
  for (let i = start; i <= end; i++) {
    pages.push(i)
  }
  return pages
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
