import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// B6 test harness: jsdom environment with the React plugin, vitest globals
// (typed via tsconfig "types": ["vitest/globals"]), and a setup file that
// installs jest-dom matchers, fake-indexeddb and a Node Web Crypto shim
// (jsdom ships no crypto.subtle). Runs with `npm run test` / `test:run`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
