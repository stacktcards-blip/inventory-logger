/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      colors: {
        base: {
          DEFAULT: '#0a0e17',
          surface: '#111827',
          elevated: '#1e293b',
          border: '#334155',
          'border-muted': '#1e293b',
        },
        accent: {
          green: '#6EFF00',
          'green-dim': '#5ce600',
          'green-glow': 'rgba(110, 255, 0, 0.2)',
        },
        card: {
          dark: '#1A1E20',
          panel: '#272C2F',
          elevated: '#2C3135',
        },
        slate: {
          850: '#172033',
          950: '#0c1222',
        },
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-mesh': 'linear-gradient(135deg, #0a0e17 0%, #0f172a 50%, #0a0e17 100%)',
        'gradient-header': 'linear-gradient(180deg, rgba(15,23,42,0.98) 0%, rgba(15,23,42,0.95) 100%)',
        'gradient-card': 'linear-gradient(135deg, rgba(30,41,59,0.6) 0%, rgba(15,23,42,0.8) 100%)',
        'gradient-accent': 'linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)',
        'gradient-accent-hover': 'linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%)',
      },
    },
  },
  plugins: [],
}
