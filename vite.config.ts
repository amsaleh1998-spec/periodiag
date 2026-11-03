import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Relative base so the build works from any sub-path (GitHub Pages) or a local folder.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
