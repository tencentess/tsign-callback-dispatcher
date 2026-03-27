/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#38bdf8',
          light: '#7dd3fc',
          dark: '#0284c7',
        },
        // Dark theme surface colors
        surface: {
          DEFAULT: 'rgba(15, 23, 42, 0.6)',
          solid: '#0f172a',
          light: 'rgba(30, 41, 59, 0.5)',
          border: 'rgba(56, 189, 248, 0.1)',
        },
      },
      fontFamily: {
        sans: ['PingFang SC', 'Microsoft YaHei', 'sans-serif'],
      },
      backgroundImage: {
        'tech-gradient': 'linear-gradient(135deg, #0b1120 0%, #0f172a 40%, #0c1a2e 100%)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
