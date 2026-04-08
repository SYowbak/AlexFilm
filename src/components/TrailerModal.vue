<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm" @click.self="$emit('close')">
    <div class="bg-gray-900 rounded-2xl w-full max-w-4xl overflow-hidden border border-gray-700 shadow-2xl relative flex flex-col">
      <div class="flex justify-between items-center p-4 border-b border-gray-800">
        <h3 class="text-xl font-bold text-white">{{ title }}</h3>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div class="relative w-full aspect-video bg-black flex-1">
        <iframe 
          v-if="videoKey"
          :src="`https://www.youtube.com/embed/${videoKey}?autoplay=1`" 
          frameborder="0" 
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
          allowfullscreen
          class="absolute inset-0 w-full h-full"
        ></iframe>
        <div v-else class="absolute inset-0 flex items-center justify-center text-gray-500">
          <p>Трейлер не знайдено</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  show: {
    type: Boolean,
    default: false
  },
  videoKey: {
    type: String,
    default: ''
  },
  title: {
    type: String,
    default: 'Трейлер'
  }
})

defineEmits(['close'])
</script>
