/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        felt: {
          dark: '#0a4d2e',
          DEFAULT: '#0d6636',
          light: '#0f7c40',
        },
        gold: {
          DEFAULT: '#d4af37',
          dark: '#b8941f',
        }
      }
    },
  },
  plugins: [],
}
