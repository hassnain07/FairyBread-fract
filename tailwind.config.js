/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#23312f',
        muted: '#75817d',
        line: '#e9eeea',
        paper: '#fffdf9',
        pink: { DEFAULT: '#e85a91', soft: '#fff0f5' },
        yellow: { DEFAULT: '#f6ca42', soft: '#fff8df' },
        teal: { DEFAULT: '#44b7bd', soft: '#e9f8f6' },
        orange: { DEFAULT: '#f48a50', soft: '#fff0e9' },
        green: { DEFAULT: '#5ab77f', soft: '#edf9ef' },
        magenta: '#c9489a',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        serif: ['Fraunces', 'serif'],
      },
      boxShadow: {
        card: '0 16px 40px rgba(36,55,49,.08)',
      },
      borderRadius: {
        card: '16px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
