import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const FONT_SCALE = 1.1

function scaleTripTypography() {
  return {
    name: 'tripos-font-scale',
    enforce: 'pre',
    transform(code, id) {
      if (!id.includes('/src/') || !id.endsWith('.css')) return null
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
  build: { sourcemap: true }
})
