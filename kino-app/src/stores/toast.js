import { defineStore } from 'pinia'

let nextToastId = 1

export const useToastStore = defineStore('toast', {
    state: () => ({
        items: []
    }),
    actions: {
        show({ message, actionLabel = '', actionTo = null, timeout = 5000 }) {
            const id = nextToastId++
            this.items.push({ id, message, actionLabel, actionTo })
            if (timeout > 0) {
                setTimeout(() => this.dismiss(id), timeout)
            }
            return id
        },
        dismiss(id) {
            const index = this.items.findIndex(t => t.id === id)
            if (index !== -1) this.items.splice(index, 1)
        }
    }
})
