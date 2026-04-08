<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4">
    <div class="bg-gray-800/80 backdrop-blur-md p-8 rounded-2xl border border-gray-700/50 shadow-2xl w-full max-w-md">
      <div class="text-center mb-8">
        <h2 class="text-3xl font-extrabold text-white mb-2">Вхід</h2>
        <p class="text-gray-400">З поверненням до світла неону!</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Логін або Email</label>
          <input 
            v-model="identifier" 
            required 
            type="text" 
            class="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:border-neon focus:ring-1 focus:ring-neon outline-none transition-colors"
            placeholder="Логін чи email"
          >
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Пароль</label>
          <input 
            v-model="password" 
            required 
            type="password" 
            class="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:border-neon focus:ring-1 focus:ring-neon outline-none transition-colors"
            placeholder="••••••••"
          >
        </div>

        <div v-if="errorMessage" class="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded-lg border border-red-500/20">
          {{ errorMessage }}
        </div>

        <button type="submit" class="w-full btn-neon py-3 text-lg mt-4">
          Увійти
        </button>
      </form>

      <div class="mt-6 text-center text-gray-400 text-sm">
        Ще не зареєстровані? 
        <router-link to="/register" class="text-neon hover:underline">Створити акаунт</router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const identifier = ref('')
const password = ref('')
const errorMessage = ref('')

const handleLogin = () => {
  errorMessage.value = ''
  
  const result = authStore.login(identifier.value, password.value)
  if (result.success) {
    router.push('/')
  } else {
    errorMessage.value = result.message
  }
}
</script>
