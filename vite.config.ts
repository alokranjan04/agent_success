import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    envPrefix: 'VITE_',
    server: {
        port: 3005,
        proxy: {
            '/api': {
                target: 'http://localhost:5007',
                changeOrigin: true,
            }
        }
    }
})
