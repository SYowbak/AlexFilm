/**
 * Повертає базову адресу API залежно від оточення:
 * 1. Якщо задано VITE_API_URL (через змінні оточення) — використовує її.
 * 2. Якщо запущено локально через Vite dev-сервер (порти 5173..5200) — http://127.0.0.1:3001.
 * 3. У продакшені (наприклад, на Render, де сервер Express роздає фронтенд) — поточний window.location.origin.
 */
export function getApiOrigin() {
  if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/+$/, '')
  }
  if (typeof window !== 'undefined' && window.location) {
    const port = window.location.port
    const hostname = window.location.hostname
    // Локальна розробка: Vite на 5173..5200, проксі на 3001
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '3001') {
      return 'http://127.0.0.1:3001'
    }
    return window.location.origin
  }
  return 'http://127.0.0.1:3001'
}
