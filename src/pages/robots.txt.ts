/**
 * robots.txt, generated from COPY_APPROVED.
 *
 * This replaces the previous static public/robots.txt, which had to be edited by hand
 * in step 3 of a written procedure. That is exactly the kind of manual step that gets
 * missed — and missing it means either an unapproved site gets indexed, or an approved
 * one stays invisible. Now it follows COPY_APPROVED automatically, so there is one
 * switch instead of two things to keep in sync.
 */

import type { APIRoute } from 'astro';
import { COPY_APPROVED } from '../config';
import { absUrl } from '../lib/schema';

export const GET: APIRoute = ({ site }) => {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const sitemapUrl = `${absUrl(site, '/', base).replace(/\/$/, '')}/sitemap.xml`;

  const body = COPY_APPROVED
    ? `# Anchor Point Marine Group
User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`
    : `# Anchor Point Marine Group
#
# The site is intentionally closed to crawlers until the CEO has signed off on
# copy and filled the placeholders in src/config.ts. Setting COPY_APPROVED = true
# opens the site up and adds the sitemap reference here automatically.
User-agent: *
Disallow: /
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
