<template>
  <div class="min-h-[80vh] flex items-center justify-center px-4">
    <div class="max-w-md w-full px-4">
      <div class="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl">
        <h2 class="text-3xl font-bold text-white mb-6 text-center">Авторизація</h2>
        
        <form @submit.prevent="handleLogin" class="space-y-6">
          <div>
            <label class="block text-slate-400 text-sm mb-2">Email</label>
            <input 
              v-model="email" 
              type="email" 
              required
              class="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-neon transition-all"
              placeholder="alex@example.com"
            />
          </div>
          
          <div>
            <label class="block text-slate-400 text-sm mb-2">Пароль</label>
            <input 
              v-model="password" 
              type="password" 
              required
              class="w-full bg-slate-800 border-none rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-neon transition-all"
              placeholder="••••••••"
            />
          </div>

          <div v-if="errorMessage" class="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded-lg border border-red-500/20">
            {{ errorMessage }}
          </div>

          <button 
            type="submit" 
            class="w-full bg-neon hover:bg-yellow-500 text-slate-950 font-bold py-3 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg shadow-neon/20"
          >
            Увійти
          </button>
        </form>

        <p class="mt-6 text-center text-slate-400 text-sm">
          Немає акаунту? 
          <router-link to="/register" class="text-neon hover:underline font-bold">Зареєструватися</router-link>
        </p>
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

const email = ref('')
const password = ref('')
const errorMessage = ref('')

const handleLogin = () => {
  errorMessage.value = ''
  
  const result = authStore.login(email.value, password.value)
  if (result.success) {
    router.push('/')
  } else {
    errorMessage.value = result.message
  }
}
</script>
