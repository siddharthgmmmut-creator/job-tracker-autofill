/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter', 'ui-sans-serif', 'system-ui', '-apple-system',
          'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"',
          'Arial', 'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo',
          'Monaco', 'Consolas', 'monospace',
        ],
      },
      colors: {
        // Surface tokens
        surface: {
          DEFAULT: 'rgb(var(--surface) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          sunken: 'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--ink) / <alpha-value>)',
          muted: 'rgb(var(--ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--ink-faint) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--line) / <alpha-value>)',
          strong: 'rgb(var(--line-strong) / <alpha-value>)',
        },
        accent: {
          DEFAULT: '#4F46E5',
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          900: '#312E81',
        },
        // Keep brand alias for any leftover usage
        brand: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          900: '#312E81',
        },
      },
      boxShadow: {
        // Refined shadow scale — Linear/Vercel feel
        'xs':    '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'sm':    '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 1px 0 rgb(0 0 0 / 0.02)',
        'card':  '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 0 0 1px rgb(0 0 0 / 0.04)',
        'pop':   '0 12px 32px -8px rgb(0 0 0 / 0.12), 0 4px 12px -4px rgb(0 0 0 / 0.08)',
        'inset-line': 'inset 0 0 0 1px rgb(0 0 0 / 0.06)',
      },
      letterSpacing: {
        'tightest': '-0.03em',
        'tighter':  '-0.02em',
        'tight':    '-0.01em',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],   // 11px
      },
      borderRadius: {
        'xl':  '0.75rem',  // 12px
        '2xl': '1rem',     // 16px
      },
      animation: {
        'fade-in':    'fade-in 0.18s ease-out',
        'slide-down': 'slide-down 0.15s ease-out',
        'slide-up':   'slide-up 0.18s ease-out',
      },
    },
  },
  plugins: [],
};
