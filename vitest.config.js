import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Specify the environment, can be 'node' or 'jsdom' based on your needs
    environment: 'node',

    // Specify the file extensions and the files to include
    include: ['**/*.spec.js'],
  },
});
