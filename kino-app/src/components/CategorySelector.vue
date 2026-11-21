<template>
  <div class="w-full">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-semibold text-white">Який настрій сьогодні?</h2>
      
      <button 
        @click="$emit('random')"
        class="hidden sm:flex items-center gap-2 btn-neon px-4 py-2"
        title="Випадковий класний фільм"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
        <span>Випадковий фільм</span>
      </button>
    </div>

    <!-- Список категорій -->
    <div class="mood-grid notranslate" translate="no">
      <button
        v-for="category in categories"
        :key="category"
        @click="$emit('select', category)"
        class="mood-chip"
        :class="{ 'mood-chip--active': selectedCategory === category }"
        :aria-pressed="selectedCategory === category"
      >
        <span class="notranslate" translate="no">{{ category }}</span>
      </button>
    </div>

    <!-- Модифікована кнопка для мобільних -->
    <button 
      @click="$emit('random')"
      class="sm:hidden w-full flex justify-center items-center gap-2 btn-neon px-4 py-3 mt-4 mb-2"
    >
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
      <span>Випадковий фільм</span>
    </button>
  </div>
</template>

<script setup>
import { MOOD_CATEGORIES } from '../api/tmdb'

defineProps({
  selectedCategory: {
    type: String,
    default: ''
  }
})

defineEmits(['select', 'random'])

const categories = Object.keys(MOOD_CATEGORIES)
</script>

<style scoped>
.mood-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.55rem;
  padding-bottom: 0.5rem;
}
.mood-chip {
  min-height: 42px;
  padding: 0.55rem 0.9rem;
  border-radius: 0.75rem;
  border: 1px solid #334155;
  background: rgba(30, 41, 59, 0.72);
  color: #e2e8f0;
  font-size: 0.84rem;
  font-weight: 600;
  line-height: 1.25;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}
.mood-chip:hover {
  background: rgba(51, 65, 85, 0.9);
  border-color: #64748b;
  color: #fff;
  transform: translateY(-1px);
}
.mood-chip--active {
  background: #f59e0b;
  border-color: #f59e0b;
  color: #020617;
  box-shadow: 0 0 14px rgba(245, 158, 11, 0.35);
}
.mood-chip:focus-visible {
  outline: 2px solid #ffcc00;
  outline-offset: 2px;
}
@media (max-width: 480px) {
  .mood-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
  }
  .mood-chip {
    font-size: 0.78rem;
    padding: 0.5rem 0.55rem;
  }
}
</style>
