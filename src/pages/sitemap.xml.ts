/**
 * sitemap.xml, generated from the ROUTES list in src/config.ts.
 *
 * Hand-rolled rather than using @astrojs/sitemap, for two reasons:
 *  1. It must emit URLs byte-identical to each page's canonical link. A
 *     canonical/sitemap mismatch is a silent, common cause of index bloat, and
 *     scripts/verify-seo.mjs asserts the two agree — easier to guarantee when the
 *     same list drives both.
 *  2. One fewer dependency on a site that is otherwise a plain static build.
 *
 * Adding a page means adding it to ROUTES. The verifier fails the build if a built
 * page is missing from that list, so it cannot be silently forgotten.
 */

import type { APIRoute } from 'astro';
import { ROUTES } from '../config';
import { absUrl } from '../lib/schema';

/**
 * Content-change date, not build date. A sitemap whose lastmod bumps on every
 * rebuild teaches Google to ignore the field. Update when the copy actually changes.
 */
const LASTMOD = '2026-08-05';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');

  const entries = ROUTES.map(
    (r) => `  <url>
    <loc>${absUrl(site, r.path, base)}</loc>
    <lastmod>${LASTMOD}</lastmod>
    <changefreq>${r.changefreq}</changefreq>
    <priority>${r.priority}</priority>
  </url>`
  ).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
