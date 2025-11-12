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
        fr-orange-dim: '#d86210',
        freiraum: {
          bg: "#0b0b0b",
          panel: "rgba(255,255,255,0.05)",
          glass: "rgba(255,255,255,0.06)",
          stroke: "rgba(255,255,255,0.12)",
          orange: "#FF7300",
          orangeSoft: "#ff8a2a",
          text: "#e9e9e9",
          sub: "#b9b9b9"
        }
      },
      boxShadow: {
        fr_glow: '0 0 40px rgba(255,122,26,0.15)',
        fr_soft: '0 8px 24px rgba(0,0,0,0.25)',
        glass: "0 8px 24px rgba(0,0,0,0.45), inset 0 1px rgba(255,255,255,0.08)",
        glow: "0 0 0 2px rgba(255,115,0,0.18), 0 8px 30px rgba(255,115,0,0.08)"
      },
      backdropBlur: {
        xs: '2px'
      },
      borderRadius: {
        xl2: '1.25rem',
        xl3: '1.75rem'
      },
      fontFamily: {
        inter: ['Inter', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif']
      }
    }
  },
  plugins: [],
};
