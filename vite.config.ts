import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true, watch: { ignored: ['**/.local/**', '**/test-results/**', '**/playwright-report/**', '**/exports/**', '**/dist/**'] }, proxy: { '/api': 'http://127.0.0.1:3000', '/auth': 'http://127.0.0.1:3000' } },
  build: { outDir: 'dist/web' },
});
