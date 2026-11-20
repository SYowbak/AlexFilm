<template>
  <div class="relative max-w-3xl mx-auto w-full">
    <div class="relative flex items-center w-full h-14 rounded-2xl focus-within:shadow-lg bg-slate-900 border-2 border-slate-700/50 focus-within:border-neon transition-colors overflow-hidden ring-1 ring-slate-900/5 hover:border-slate-600">
      <div class="grid place-items-center h-full w-14 text-slate-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        v-model="query"
        @keyup.enter="onSearch"
        class="peer h-full w-full outline-none text-base text-gray-100 bg-transparent placeholder-slate-500 pr-2"
        type="text"
        id="search"
        placeholder="Пошук фільмів..." 
      />
      
      <button 
        v-if="query" 
        @click="clearSearch"
        class="grid place-items-center h-full w-12 text-slate-400 hover:text-white transition"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div class="px-2" v-if="query">
         <button @click="onSearch" class="btn-neon px-4 py-1.5 rounded-xl h-9">
            Шукати
         </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['search', 'clear'])
const query = ref('')

const onSearch = () => {
  if (query.value.trim()) {
    emit('search', query.value.trim())
  }
}

const clearSearch = () => {
  query.value = ''
  emit('clear')
}
</script>
