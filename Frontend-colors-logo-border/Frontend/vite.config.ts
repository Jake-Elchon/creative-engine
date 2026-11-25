import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig(({ command, mode }) => {
  const { ZIBI_LOCAL_API_PROXY } = loadEnv(mode, import.meta.dirname, 'ZIBI_');
  return {
    define: { __ZIBI_STATIC_BUILD__: JSON.stringify(command === 'build') },
    server: ZIBI_LOCAL_API_PROXY ? {
      proxy: {
        '/api/v1': {
          target: ZIBI_LOCAL_API_PROXY,
          changeOrigin: true,
          bypass(request) {
            const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
            if (!loopback.includes(request.socket.remoteAddress ?? '')) return false;
          },
        },
      },
    } : undefined,
    plugins: [react()],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router')) {
              return 'vendor';
            }
            if (id.includes('node_modules/lucide-react')) return 'icons';
          },
        },
      },
    },
  };
});
