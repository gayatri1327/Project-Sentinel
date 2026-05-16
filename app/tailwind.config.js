/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#02060f",
          900: "#060d1f",
          800: "#0a1530",
          700: "#0f2044",
          600: "#162b5c",
        },
        cyan: {
          sentinel: "#00e5ff",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      animation: {
        "pulse-fast": "pulse 0.8s cubic-bezier(0.4,0,0.6,1) infinite",
        "spin-slow":  "spin 8s linear infinite",
        "spin-rev":   "spin 5s linear infinite reverse",
        "slide-up":   "slideUp 0.35s ease both",
        "glow":       "glow 4s ease-in-out infinite",
        "ripple":     "ripple 1.5s ease-in-out infinite",
        "scan":       "scan 3s ease-in-out infinite",
      },
      keyframes: {
        slideUp: {
          from: { opacity: 0, transform: "translateY(16px)" },
          to:   { opacity: 1, transform: "translateY(0)" },
        },
        glow: {
          "0%,100%": { textShadow: "0 0 8px currentColor" },
          "50%":     { textShadow: "0 0 24px currentColor, 0 0 48px currentColor" },
        },
        ripple: {
          "0%":   { transform: "scale(1)",   opacity: 0.7 },
          "100%": { transform: "scale(2.5)", opacity: 0 },
        },
        scan: {
          "0%,100%": { opacity: 0.3 },
          "50%":     { opacity: 1 },
        },
      },
      boxShadow: {
        "cyan-glow":  "0 0 20px rgba(0,229,255,0.25)",
        "red-glow":   "0 0 20px rgba(255,23,68,0.3)",
        "card":       "0 4px 24px rgba(0,0,0,0.5)",
      },
    },
  },
  plugins: [],
};
