import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Primary accent — teal (trust/verified/patient)
        teal: {
          50: '#E1F5EE',
          100: '#9FE1CB',
          200: '#5DCAA5',
          400: '#1D9E75',
          600: '#0F6E56',
          800: '#085041',
          900: '#04342C',
        },
        // Secondary accent — navy/blue (clinical/institutional)
        navy: {
          50: '#E6F1FB',
          100: '#B5D4F4',
          200: '#85B7EB',
          400: '#378ADD',
          600: '#185FA5',
          800: '#0C447C',
          900: '#042C53',
        },
        // Warning / revoked — amber (never red)
        amber: {
          600: '#BA7517',
          800: '#854F0B',
        },
        // Danger / access-denied only — red
        red: {
          600: '#A32D2D',
          800: '#791F1F',
        },
      },
      borderRadius: {
        DEFAULT: '8px',
        card: '12px',
      },
      borderWidth: {
        hairline: '0.5px',
      },
    },
  },
  plugins: [],
};

export default config;

