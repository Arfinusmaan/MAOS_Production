/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#050505", // Deep Matte Black
        foreground: "#FAFAFA",
        card: "#0a0a0a",      // Slightly lighter matte
        border: "#1a1a1a",    // Ghost Border (Very subtle)
        accent: "#f97316",    // Keeping the orange but used sparingly
        silver: "#a1a1aa",    // Elegant text
        muted: "#262626",
      },
      fontFamily: {
        sans: ['Inter Tight', 'Inter', 'sans-serif'],
        mono: ['Geist Mono', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'elite': '0 0 20px rgba(0,0,0,0.5)',
      }
    },
  },
  plugins: [],
}
