import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true },
  build: {
    rollupOptions: {
      output: {
        // Firebase SDK — отдельным файлом: он меняется реже кода приложения и лучше кэшируется
        manualChunks: (id) => (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase') ? 'firebase' : undefined),
      },
    },
    chunkSizeWarningLimit: 1000, // ExcelJS (~940 КБ) грузится только при выгрузке отчёта
  },
});
