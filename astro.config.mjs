// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages project site. If a custom domain is attached later, change
// `site` to the custom domain and set `base` to '/'.
export default defineConfig({
  site: 'https://tonycolafrancesco-maker.github.io',
  base: '/anchor-point-marine',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
});
