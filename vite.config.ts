import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleRolefitApi } from './server/rolefitApi'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rolefit-local-api',
      configureServer(server) {
        server.middlewares.use('/api/analyse', (request, response) => {
          void handleRolefitApi(request, response)
        })
      },
    },
  ],
})
