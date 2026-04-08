<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4">
    <div class="bg-gray-800/80 backdrop-blur-md p-8 rounded-2xl border border-gray-700/50 shadow-2xl w-full max-w-md">
      <div class="text-center mb-8">
        <h2 class="text-3xl font-extrabold text-white mb-2">Створення акаунту</h2>
        <p class="text-gray-400">Приєднуйтесь до нас, щоб зберігати улюблені фільми</p>
      </div>

      <form @submit.prevent="handleRegister" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Ім'я користувача</label>
          <input 
            v-model="username" 
            required 
            minlength="3"
            type="text" 
            class="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:border-neon focus:ring-1 focus:ring-neon outline-none transition-colors"
            placeholder="Ваш логін"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Електронна пошта</label>
          <input 
            v-model="email" 
            required 
            type="email" 
            class="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:border-neon focus:ring-1 focus:ring-neon outline-none transition-colors"
            placeholder="email@example.com"
          >
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Пароль</label>
          <input 
            v-model="password" 
            required 
            minlength="6"
            type="password" 
            class="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:border-neon focus:ring-1 focus:ring-neon outline-none transition-colors"
            placeholder="Мінімум 6 символів"
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-300 mb-1">Підтвердження паролю</label>
          <input 
            v-model="confirmPassword" 
            required 
            minlength="6"
            type="password" 
            class="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:border-neon focus:ring-1 focus:ring-neon outline-none transition-colors"
            placeholder="Повторіть пароль"
          >
        </div>

        <div v-if="errorMessage" class="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded-lg border border-red-500/20">
          {{ errorMessage }}
        </div>

        <button type="submit" class="w-full btn-neon py-3 text-lg mt-2">
          Зареєструватися
        </button>
      </form>

      <div class="mt-6 text-center text-gray-400 text-sm">
        Вже маєте акаунт? 
        <router-link to="/login" class="text-neon hover:underline">Увійти</router-link>
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

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMessage = ref('')

const handleRegister = () => {
  errorMessage.value = ''
  
  if (password.value !== confirmPassword.value) {
    errorMessage.value = 'Паролі не збігаються!'
    return
  }

  const result = authStore.register(username.value, email.value, password.value)
  
  if (result.success) {
    router.push('/')
  } else {
    errorMessage.value = result.message
  }
}
</script>
