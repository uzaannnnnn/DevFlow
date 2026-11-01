/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: token('surface'),
        subtle: token('subtle'),
        line: { DEFAULT: token('line'), strong: token('line-strong') },
        ink: { DEFAULT: token('ink'), 2: token('ink-2') },
        muted: token('muted'),
        faint: token('faint'),
        overlay: token('overlay'),
        accent: { DEFAULT: token('accent'), strong: token('accent-strong'), soft: token('accent-soft') },
        danger: { DEFAULT: token('danger'), soft: token('danger-soft') },
        success: { DEFAULT: token('success'), soft: token('success-soft') },
        warning: { DEFAULT: token('warning'), soft: token('warning-soft') },
        info: { DEFAULT: token('info'), soft: token('info-soft') },
        review: { DEFAULT: token('review'), soft: token('review-soft') },
      },
      fontFamily: {
        sans: ['"Inter var"', 'Inter', 'ui-sans-serif', 'system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        pop: '0 1px 2px rgb(var(--ink) / 0.04), 0 8px 24px -6px rgb(var(--ink) / 0.12)',
        modal: '0 1px 3px rgb(var(--ink) / 0.06), 0 24px 48px -12px rgb(var(--ink) / 0.22)',
      },
    },
  },
  plugins: [],
};
