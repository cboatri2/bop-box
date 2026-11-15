import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// On GitHub Pages the app lives at https://<user>.github.io/<repo>/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.BASE_PATH ?? '/bop-box/') : '/',
  plugins: [react()],
}))
