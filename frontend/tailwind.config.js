import defaultTheme from 'tailwindcss/defaultTheme';

// Bauhaus design tokens. Everything visual should come from here or the
// component classes in src/index.css, not from one-off hex values.
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    // Binary radii only: squares or circles, nothing in between.
    borderRadius: {
      none: '0px',
      full: '9999px',
    },
    extend: {
      colors: {
        ink: '#121212',
        canvas: '#F0F0F0',
        muted: '#E0E0E0',
        bh: {
          red: '#D02020',
          blue: '#1040C0',
          yellow: '#F0C020',
          cream: '#FFF9C4',
        },
      },
      fontFamily: {
        sans: ['Outfit', ...defaultTheme.fontFamily.sans],
      },
      boxShadow: {
        'hard-xs': '3px 3px 0px 0px #121212',
        'hard-sm': '4px 4px 0px 0px #121212',
        'hard-md': '6px 6px 0px 0px #121212',
        'hard-lg': '8px 8px 0px 0px #121212',
      },
      keyframes: {
        slam: {
          '0%': { transform: 'translateY(-12px)', opacity: '0' },
          '70%': { transform: 'translateY(2px)', opacity: '1' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: { slam: 'slam 300ms ease-out' },
    },
  },
  plugins: [],
};
