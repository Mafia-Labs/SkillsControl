import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  // Tauri expects 1420; PORT lets tooling (browser preview) pick a free port.
  server: { port: Number(process.env.PORT) || 1420, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: ['es2020', 'chrome100', 'safari13'] },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts']
  }
})
