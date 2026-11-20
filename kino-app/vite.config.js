import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    target: ['chrome69', 'firefox68', 'safari13', 'edge79'],
    cssTarget: ['chrome69', 'firefox68', 'safari13', 'edge79'],
  }
})
