import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const FONT_SCALE = 1.1
const BUILD_SHA =
  process.env.GITHUB_SHA ||
  process.env.VITE_BUILD_SHA ||
  'local-dev'

const PWA_ICONS = [
  ['icon-180.png', 'scripts/pwa-icons/icon-180.png.b64'],
  ['icon-192.png', 'scripts/pwa-icons/icon-192.png.b64'],
  ['icon-512.png', 'scripts/pwa-icons/icon-512.png.b64'],
]

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

function stampTripBuild() {
  return {
    name: 'tripos-build-stamp',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist')
      if (!fs.existsSync(dist)) return

      for (const [outputName, sourceName] of PWA_ICONS) {
        const encoded = fs.readFileSync(path.resolve(sourceName), 'utf8').replace(/\s+/g, '')
        fs.writeFileSync(path.join(dist, outputName), Buffer.from(encoded, 'base64'))
      }

      fs.writeFileSync(
        path.join(dist, 'version.json'),
        JSON.stringify({ version: BUILD_SHA, builtAt: new Date().toISOString() }),
      )

      const swPath = path.join(dist, 'sw.js')
      if (fs.existsSync(swPath)) {
        const sw = fs
          .readFileSync(swPath, 'utf8')
          .replaceAll('__TRIPOS_BUILD_SHA__', BUILD_SHA)
        fs.writeFileSync(swPath, sw)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), scaleTripTypography(), stampTripBuild()],
  base: '/mumbai-trip/',
  define: {
    __TRIPOS_BUILD__: JSON.stringify(BUILD_SHA),
  },
  build: { sourcemap: false },
})
