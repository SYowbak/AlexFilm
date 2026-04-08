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
    <div class="flex flex-wrap gap-2 sm:gap-3 justify-center sm:justify-start pb-4">
      <button
        v-for="category in categories"
        :key="category"
        @click="$emit('select', category)"
        class="px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 border backdrop-blur-sm"
        :class="[
          selectedCategory === category 
            ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] scale-105' 
            : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:border-slate-500 hover:bg-slate-700'
        ]"
      >
        {{ category }}
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
