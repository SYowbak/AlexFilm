<template>
  <div class="min-h-screen bg-slate-950 text-gray-100 flex flex-col font-sans selection:bg-neon/30">
    <header class="border-b border-gray-800 bg-slate-950/80 backdrop-blur-md sticky top-0 z-40 shadow-sm">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <router-link to="/" class="flex items-center gap-2 group">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-neon to-yellow-600 flex items-center justify-center shadow-[0_0_15px_rgba(255,204,0,0.4)] group-hover:shadow-[0_0_25px_rgba(255,204,0,0.6)] transition-shadow">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </div>
          <span class="text-2xl font-black tracking-wider text-white group-hover:text-neon transition-colors">ALEX<span class="text-neon">FILM</span></span>
        </router-link>

        <nav class="hidden md:flex items-center gap-6">
          <router-link to="/" class="text-gray-300 hover:text-neon font-medium transition-colors" active-class="text-neon border-b-2 border-neon pb-1">Головна</router-link>
          <router-link to="/favorites" class="text-gray-300 hover:text-neon font-medium transition-colors" active-class="text-neon border-b-2 border-neon pb-1">Улюблені</router-link>
        </nav>

        <div class="flex items-center gap-4">
          <template v-if="authStore.user">
            <span class="text-gray-400 text-sm hidden sm:inline-block">Вітаємо, <strong class="text-white">{{ authStore.user.username }}</strong>!</span>
            <button @click="authStore.logout()" class="btn-outline-neon text-sm py-1.5">Вийти</button>
          </template>
          <template v-else>
            <router-link to="/login" class="btn-neon px-4 py-2 text-sm">Увійти</router-link>
          </template>
        </div>
      </div>
      
      <!-- Мобільне меню -->
      <nav class="md:hidden flex justify-center gap-6 pb-3 px-4 border-t border-gray-800 pt-3">
          <router-link to="/" class="text-gray-400 hover:text-neon font-medium text-sm transition-colors" active-class="text-neon font-bold">Головна</router-link>
          <router-link to="/favorites" class="text-gray-400 hover:text-neon font-medium text-sm transition-colors" active-class="text-neon font-bold">Улюблені</router-link>
      </nav>
    </header>

    <main class="flex-1">
      <router-view />
    </main>

    <footer class="border-t border-gray-800 bg-slate-950 py-8 text-center text-gray-500 text-sm">
      <div class="max-w-7xl mx-auto px-4">
        <p class="mb-2">&copy; {{ new Date().getFullYear() }} AlexFilm. Всі права захищено.</p>
        <p>Дані надані <a href="https://www.themoviedb.org/" target="_blank" class="text-neon hover:underline">TMDB API</a>.</p>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { useAuthStore } from './stores/auth'

const authStore = useAuthStore()
</script>
