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

    <!-- Пагінація: перша й остання сторінка завжди видимі, між ними — вікно -->
    <nav v-if="totalPages > 1 && !loading && movies.length > 0" class="pager" aria-label="Сторінки фільмів">
      <button
        class="pager__arrow"
        :disabled="currentPage === 1"
        title="Попередня сторінка"
        @click="$emit('page-change', currentPage - 1)"
      >‹</button>

      <button
        v-for="item in pagerItems"
        :key="item.key"
        type="button"
        class="pager__page"
        :class="{ 'pager__page--current': item.value === currentPage, 'pager__page--gap': item.gap }"
        :disabled="item.gap || item.value === currentPage"
        :title="item.gap ? undefined : `Сторінка ${item.value}`"
        @click="$emit('page-change', item.value)"
      >{{ item.label }}</button>

      <button
        class="pager__arrow"
        :disabled="currentPage === totalPages"
        title="Наступна сторінка"
        @click="$emit('page-change', currentPage + 1)"
      >›</button>
    </nav>
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

// Перша і остання сторінка — завжди цифрою. між ними вікно ±2
// і многоточия, якщо є розрив.
const pagerItems = computed(() => {
  const total = Math.max(1, props.totalPages)
  const cur = Math.min(Math.max(1, props.currentPage), total)
  const items = []
  const push = (value, gap = false) => items.push({
    key: gap ? `gap-${items.length}` : value,
    value,
    label: gap ? '…' : String(value),
    gap,
  })

  push(1)
  const from = Math.max(2, cur - 2)
  const to = Math.min(total - 1, cur + 2)
  if (from > 2) push(0, true)
  for (let p = from; p <= to; p++) push(p)
  if (to < total - 1) push(0, true)
  if (total > 1) push(total)
  return items
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

.pager {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-top: 2.5rem;
}
.pager__page,
.pager__arrow {
  min-width: 38px;
  height: 38px;
  padding: 0 0.55rem;
  border-radius: 0.6rem;
  border: 1px solid #334155;
  background: #1e293b;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}
.pager__arrow {
  font-size: 1.25rem;
  line-height: 1;
  min-width: 34px;
}
.pager__page:hover:not(:disabled):not(.pager__page--gap),
.pager__arrow:hover:not(:disabled) {
  background: #334155;
  border-color: #64748b;
}
.pager__page--current {
  background: #ffcc00 !important;
  border-color: #ffcc00 !important;
  color: #020617 !important;
  box-shadow: 0 0 14px rgba(255, 204, 0, 0.38);
}
.pager__page--gap {
  border-color: transparent;
  background: transparent;
  color: #64748b;
  cursor: default;
  letter-spacing: -0.08em;
}
.pager__page:focus-visible,
.pager__arrow:focus-visible {
  outline: 2px solid #ffcc00;
  outline-offset: 2px;
}
.pager :disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (max-width: 480px) {
  .pager { gap: 0.22rem; margin-top: 1.75rem; }
  .pager__page, .pager__arrow { min-width: 32px; height: 32px; padding: 0 0.35rem; font-size: 0.78rem; }
}
</style>
