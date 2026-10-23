import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['react', 'react-dom/client', '@react-pdf/renderer', 'html-to-image', 'fflate'],
  },
  build: { target: 'es2022' },
});
