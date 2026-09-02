import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const FONT_SCALE = 1.1
const BUILD_SHA = process.env.GITHUB_SHA || process.env.VITE_BUILD_SHA || 'local-dev'

function scaleTripTypography() {
  return {
    name: 'tripos-font-scale',
    enforce: 'pre',
    transform(code, id) {
      if (
        !id.includes('/src/') ||
        !id.endsWith('.css') ||
        id.endsWith('/typography-safety.css')
      )
        return null
      const scaled = code.replace(
        /font-size\s*:\s*(\d*\.?\d+)px/gi,
        (_, raw) => {
          const value = Number(raw) * FONT_SCALE
          return `font-size:${Number(value.toFixed(2))}px`
        },
      )
      return scaled === code ? null : { code: scaled, map: null }
    },
  }
}

export default defineConfig({
  plugins: [react(), scaleTripTypography()],
  base: '/mumbai-trip/',
  define: {
    __TRIPOS_BUILD__: JSON.stringify(BUILD_SHA),
  },
  build: { sourcemap: true },
})
