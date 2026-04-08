import { defineStore } from 'pinia'

export const useFavoritesStore = defineStore('favorites', {
  state: () => ({
    favorites: JSON.parse(localStorage.getItem('kino-favorites')) || []
  }),
  actions: {
    toggleFavorite(movie) {
      const index = this.favorites.findIndex(f => f.id === movie.id)
      if (index === -1) {
        this.favorites.push(movie)
      } else {
        this.favorites.splice(index, 1)
      }
      this.saveToLocal()
    },
    isFavorite(movieId) {
      return this.favorites.some(f => f.id === movieId)
    },
    saveToLocal() {
      localStorage.setItem('kino-favorites', JSON.stringify(this.favorites))
    }
  }
})
