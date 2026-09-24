import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  clean: true,
  sourcemap: true,
  // Shared is consumed as TypeScript source, so bundle it in.
  noExternal: ['@magic-potion/shared'],
});
