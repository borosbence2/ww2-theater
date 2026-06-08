import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the built site works when served from a sub-path
// (e.g. GitHub Pages project site at /ww2-theater/).
export default defineConfig({
  base: './',
  plugins: [react()],
});
