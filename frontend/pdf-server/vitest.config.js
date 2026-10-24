import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: './pdf-server/vitestEnvironment.js',
      include: ['pdf-server/**/*.spec.js'],
      globalSetup: './tests/globalSetup.js',
    },
  })
)
