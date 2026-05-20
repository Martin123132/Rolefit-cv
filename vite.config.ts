import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleRolefitApi } from './server/rolefitApi'
import { handleScoutUrlImportApi } from './server/scoutUrlImport'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'rolefit-local-api',
      configureServer(server) {
        server.middlewares.use('/api/analyse', (request, response) => {
          void handleRolefitApi(request, response)
        })
        server.middlewares.use('/api/import-job-url', (request, response) => {
          void handleScoutUrlImportApi(request, response)
        })
      },
    },
  ],
})
