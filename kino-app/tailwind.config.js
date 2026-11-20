/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        neon: '#FFCC00',
        gold: {
          light: '#FFD700',
          DEFAULT: '#FFCC00',
          dark: '#B8860B'
        }
      },
    },
  },
  plugins: [],
}
