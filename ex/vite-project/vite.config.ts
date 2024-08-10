import fs from 'fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    https: {
      key: fs.readFileSync('certs/localhost+3-key.pem'),
      cert: fs.readFileSync('certs/localhost+3.pem'),
    },
  }
})
