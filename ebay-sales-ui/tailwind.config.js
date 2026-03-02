/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        base: {
          DEFAULT: '#0a0e17',
          surface: '#111827',
          elevated: '#1e293b',
          border: '#334155',
        },
      },
    },
  },
  plugins: [],
}
