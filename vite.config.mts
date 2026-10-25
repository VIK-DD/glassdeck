import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Must match DECK_PORT in electron/deckServer.ts.
const DECK_SERVER = 'http://localhost:4460';

export default defineConfig({
  // Relative asset paths: the phone page is served by the deck server, the config page over file://.
  base: './',
  plugins: [react()],
  build: {
    // Old Android phones run older Chrome builds.
    target: 'chrome87',
    rollupOptions: { input: { phone: 'phone.html', config: 'config.html' } },
  },
  // In dev the phone opens http://<pc-ip>:5173/phone.html; API calls go through to the Electron host.
  server: { host: true, port: 5173, strictPort: true, proxy: { '/api': DECK_SERVER } },
  test: { include: ['tests/**/*.test.ts'] },
});
