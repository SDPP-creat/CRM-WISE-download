/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#050505',
        panel: '#101010',
        panel2: '#181818',
        border: '#242424',
        yellow: '#FFD400',
        gray: { DEFAULT: '#9CA3AF', muted: '#6B7280' },
        confirmed: '#22C55E',
        alert: '#EF4444',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      maxWidth: { app: '480px' },
    },
  },
  plugins: [],
};
