import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // three.js 单独打包：体积大但几乎不变，利于长期缓存
        manualChunks: { three: ['three'] },
      },
    },
  },
});
