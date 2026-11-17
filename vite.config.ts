import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({ root: 'client', plugins: [react()], server: { port: 5174, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3002' } }, build: { outDir: 'dist', emptyOutDir: true } });
