import { defineStore } from 'pinia'

// Ініціалізація бази користувачів з localStorage
const getLocalUsers = () => {
  const users = localStorage.getItem('kino-users-db')
  return users ? JSON.parse(users) : []
}

const saveLocalUsers = (users) => {
  localStorage.setItem('kino-users-db', JSON.stringify(users))
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: JSON.parse(localStorage.getItem('kino-user')) || null,
    usersDb: getLocalUsers()
  }),
  actions: {
    register(username, email, password) {
      // Перевірка чи існує такий користувач
      const existingUser = this.usersDb.find(u => u.username === username || u.email === email)
      if (existingUser) {
        return { success: false, message: 'Користувач з таким іменем або email вже існує' }
      }

      const newUser = {
        id: Date.now().toString(),
        username,
        email,
        password // Пароль зберігається в чистому вигляді лише для цілей цієї Front-end симуляції!
      }

      this.usersDb.push(newUser)
      saveLocalUsers(this.usersDb)
      
      // Автоматичний логін після реєстрації
      this.setSession(newUser)
      
      return { success: true }
    },
    
    login(identifier, password) {
      const user = this.usersDb.find(
        u => (u.username === identifier || u.email === identifier) && u.password === password
      )

      if (user) {
        this.setSession(user)
        return { success: true }
      }
      
      return { success: false, message: 'Невірний логін, email або пароль' }
    },

    setSession(user) {
      const sessionData = { id: user.id, username: user.username, email: user.email }
      this.user = sessionData
      localStorage.setItem('kino-user', JSON.stringify(sessionData))
    },
    
    logout() {
      this.user = null
      localStorage.removeItem('kino-user')
    }
  }
})
