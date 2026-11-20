<template>
  <div>
    <!-- Перемикач кількості колонок для Smart TV / великих екранів -->
    <div v-if="!loading && movies.length > 0" class="flex justify-end items-center mb-3 text-xs notranslate" translate="no">
      <div class="flex items-center gap-1 bg-slate-900/90 px-2.5 py-1 rounded-lg border border-slate-800 text-slate-400 shadow-sm select-none">
        <span class="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">Сітка:</span>
        <button 
          v-for="c in [0, 3, 4, 5]" 
          :key="c"
          @click="setCols(c)"
          class="px-2 py-0.5 rounded text-xs font-bold transition-all"
          :class="userCols === c ? 'bg-amber-500 text-slate-950 font-bold shadow-sm' : 'text-slate-400 hover:text-white hover:bg-slate-800'"
          :title="c === 0 ? 'Автоматична адаптація' : `${c} колонки`"
        >
          {{ c === 0 ? 'Авто' : c }}
        </button>
      </div>
    </div>

    <!-- Основна сітка: 5 колонок на десктопі, щоб 20 фільмів ділились рівно без 4 пустих місць -->
    <div 
      v-if="!loading && movies.length > 0" 
      class="movie-grid-container grid gap-4 sm:gap-6"
      :class="gridColsClass"
    >
      <MovieCard 
        v-for="movie in movies" 
        :key="movie.id" 
        :movie="movie" 
      />
    </div>

    <!-- Завантаження -->
    <div v-else-if="loading" class="flex justify-center items-center py-20">
      <div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-amber-500"></div>
    </div>

    <!-- Пустий стан -->
    <div v-else class="text-center py-20">
      <h3 class="text-2xl text-slate-400 font-semibold mb-2">Фільмів не знайдено 😔</h3>
      <p class="text-slate-500">Спробуйте змінити критерії пошуку або обрати іншу категорію настрою.</p>
    </div>

    <!-- Пагінація -->
    <div v-if="totalPages > 1 && !loading && movies.length > 0" class="mt-10 sm:mt-12 flex justify-center items-center gap-1 sm:gap-2 select-none">
      <button 
        @click="$emit('page-change', currentPage - 1)"
        :disabled="currentPage === 1"
        class="flex-shrink-0 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg bg-slate-800 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 transition whitespace-nowrap"
      >
        <span class="hidden sm:inline">Попередня</span>
        <span class="sm:hidden">←</span>
      </button>
      
      <div class="flex gap-1 overflow-x-auto max-w-[200px] sm:max-w-md hide-scrollbar flex-shrink-0">
        <button 
          v-for="page in visiblePages" 
          :key="page"
          @click="$emit('page-change', page)"
          class="flex-shrink-0 min-w-[32px] sm:min-w-[40px] h-8 sm:h-10 text-xs sm:text-sm rounded-lg flex items-center justify-center transition-colors font-medium"
          :class="currentPage === page ? 'bg-neon text-slate-950 font-bold' : 'bg-slate-800 text-white hover:bg-slate-700'"
        >
          {{ page }}
        </button>
      </div>
      <button 
        @click="$emit('page-change', currentPage + 1)"
        :disabled="currentPage === totalPages"
        class="flex-shrink-0 px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg bg-slate-800 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700 transition whitespace-nowrap"
      >
        <span class="hidden sm:inline">Наступна</span>
        <span class="sm:hidden">→</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
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

// Ручний вибір колонок або автоматична сітка
const userCols = ref(0)
onMounted(() => {
  try {
    const saved = localStorage.getItem('alexfilm_grid_cols')
    if (saved !== null) {
      userCols.value = Number(saved)
    }
  } catch (_) {}
})

const setCols = (cols) => {
  userCols.value = cols
  try {
    if (cols === 0) {
      localStorage.removeItem('alexfilm_grid_cols')
    } else {
      localStorage.setItem('alexfilm_grid_cols', String(cols))
    }
  } catch (_) {}
}

const gridColsClass = computed(() => {
  if (userCols.value === 3) return 'cols-override-3'
  if (userCols.value === 4) return 'cols-override-4'
  if (userCols.value === 5) return 'cols-override-5'
  return 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5'
})

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
.cols-override-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
}
.cols-override-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
}
.cols-override-5 {
  grid-template-columns: repeat(5, minmax(0, 1fr)) !important;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
