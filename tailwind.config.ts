import type { Config } from 'tailwindcss'

export default {
  // This is where the "purging" magic happens
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Scans all files in src with these extensions
  ],
  theme: {
    extend: {},
  },
  plugins: [],
} satisfies Config