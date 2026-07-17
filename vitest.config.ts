import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // Test-only value — never a real secret, just needs to satisfy the
      // >= 8 char config-presence check in lib/state-crypto.ts.
      STATE_ENCRYPTION_KEY: 'vitest-only-not-a-real-secret-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
