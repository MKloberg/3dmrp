import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import pkg from './package.json'

function getAppVersion(): string {
  // During Docker builds, git is unavailable — version is injected via APP_VERSION build arg.
  if (process.env.APP_VERSION) return process.env.APP_VERSION.replace(/^v/, '')
  try {
    return execSync('git describe --tags --abbrev=0').toString().trim().replace(/^v/, '')
  } catch {
    return pkg.version
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
