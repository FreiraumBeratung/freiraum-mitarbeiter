/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fr-black: '#0b0b0d',
        fr-panel: 'rgba(255,255,255,0.04)',
        fr-border: 'rgba(255,255,255,0.12)',
        fr-text: '#f5f7fb',
        fr-muted: '#9aa3b2',
        fr-orange: '#ff7a1a',
        fr-orange-dim: '#d86210'
      },
      boxShadow: {
        fr_glow: '0 0 40px rgba(255,122,26,0.15)',
        fr_soft: '0 8px 24px rgba(0,0,0,0.25)'
      },
      backdropBlur: {
        xs: '2px'
      },
      borderRadius: {
        xl2: '1.25rem'
      },
      fontFamily: {
        inter: ['Inter', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: [],
};
