/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta do site WISE (wisecontingencia.com.br)
        bg: '#08090C',
        ink2: '#0C0D13',
        panel: '#14151C',
        panel2: '#181922',
        border: '#22232C',
        yellow: '#F5C53D', // dourado da marca (mantém a chave 'yellow' usada no app)
        gold: '#F5C53D',
        'gold-hi': '#FFE9A8',
        ivory: '#F6F5F2',
        gray: { DEFAULT: '#A0A0AC', muted: '#6A6A76' },
        confirmed: '#25D366', // verde WhatsApp (só confirmações)
        alert: '#EF4444',
      },
      fontFamily: {
        display: ['Sora', 'system-ui', 'sans-serif'],
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: { app: '480px' },
    },
  },
  plugins: [],
};
