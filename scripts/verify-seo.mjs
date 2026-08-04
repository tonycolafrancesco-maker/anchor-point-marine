/**
 * SEO + publication-safety verifier.  `npm run verify`  (run after `npm run build`)
 *
 * Two jobs:
 *
 *  1. Catch the SEO mistakes that are cheap to make and expensive to find later —
 *     missing canonical, duplicate titles, a page missing from the sitemap, a
 *     canonical that disagrees with its sitemap entry, a broken internal link.
 *
 *  2. Enforce the publication boundary. Marketing claims, credentials, pricing and
 *     service guarantees need CEO sign-off, and no claim we cannot verify may ship.
 *     Rather than trusting everyone to remember that, this fails the build if draft
 *     copy or an invented claim would go live. It is a lint rule for a company policy.
 *
 * It validates the BUILT OUTPUT rather than the source, so what is checked is exactly
 * what would be deployed. Approval state is read from the generated robots.txt for the
 * same reason.
 *
 * Exit 0 = safe. Exit 1 = do not deploy.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

/** Utility pages that must never be indexed and must never appear in the sitemap. */
const NOINDEX_ROUTES = new Set(['/404.html', '/thank-you/']);

const errors = [];
const warnings = [];
const notes = [];

// ── helpers ──────────────────────────────────────────────────────────────────

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

const routeOf = (file) => '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '');

const grab = (html, re) => {
  const m = html.match(re);
  return m ? m[1] : null;
};

/** Strip markup and machine-readable blocks to get the visible prose. */
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

// ── checks ───────────────────────────────────────────────────────────────────

/**
 * Guards the specific failure mode the engineering role boundary calls out: a
 * plausible-sounding but invented number reaching production. Service intervals,
 * credentials and experience claims belong to the CEO and Marine Operations.
 */
function checkInventedClaims(html, route, approved) {
  const text = visibleText(html);

  const patterns = [
    [/\bevery\s+\d+\s*(days?|weeks?|months?|years?|hours?)\b/i, 'a specific maintenance interval'],
    [/\b\d+[- ]?(hour|hr)\s+(service|interval|check)\b/i, 'an hours-based service interval'],
    [/\b\d+\+?\s*years?\s+(of\s+)?(experience|in business|serving)\b/i, 'a years-in-business claim'],
    [/\b(over|more than)\s+\d+\s+(vessels?|boats?|yachts?|clients?|owners?)\b/i, 'a client or vessel count'],
    [/\b(certified|licensed|accredited|insured)\s+(by|through)\b/i, 'a credential claim'],
    [/\bUSCG[- ]?(licensed|certified|approved)\b/i, 'a USCG credential claim'],
    [/\bABYC[- ]?(certified|master)\b/i, 'an ABYC credential claim'],
    [/\bwe\s+guarantee\b/i, 'a guarantee'],
    [/\bwithin\s+\d+\s*(minutes?|hours?)\b/i, 'a response-time promise'],
    [/\$\s?\d/, 'a price'],
    [/\b(award[- ]winning|best in|#1|number one|top[- ]rated)\b/i, 'a superlative marketing claim'],
  ];

  for (const [re, what] of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const msg = `${route}: contains ${what} — "${m[0].trim()}". Needs CEO verification before publication.`;
    approved ? errors.push(msg) : warnings.push(msg);
  }
}

/** Unresolved placeholder chips must not be published. */
function checkPlaceholders(html, route, approved) {
  const count = (html.match(/\[PLACEHOLDER:/g) || []).length;
  if (!count) return 0;
  if (approved) {
    errors.push(
      `${route}: ${count} unresolved [PLACEHOLDER: ...] chip(s) while COPY_APPROVED is true. Fill them in src/config.ts or remove them before launch.`
    );
  } else {
    notes.push(`${route}: ${count} item(s) awaiting CEO input`);
  }
  return count;
}

function checkHead(html, route, seen, approved) {
  const title = grab(html, /<title>([\s\S]*?)<\/title>/);
  const desc = grab(html, /<meta name="description" content="([^"]*)"/);
  const canonical = grab(html, /<link rel="canonical" href="([^"]*)"/);
  const robots = grab(html, /<meta name="robots" content="([^"]*)"/);
  const h1s = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/g) || [];
  const isUtility = NOINDEX_ROUTES.has(route);

  if (!title) errors.push(`${route}: missing <title>`);
  else {
    if (seen.titles.has(title)) errors.push(`${route}: duplicate <title> (also on ${seen.titles.get(title)})`);
    else seen.titles.set(title, route);
    // Not a hard limit — Google measures pixels — but this brackets the range that
    // reliably renders without truncation.
    if (title.length > 65) warnings.push(`${route}: title is ${title.length} chars, likely truncated — "${title}"`);
  }

  if (!desc) errors.push(`${route}: missing meta description`);
  else {
    if (seen.descs.has(desc)) errors.push(`${route}: duplicate meta description (also on ${seen.descs.get(desc)})`);
    else seen.descs.set(desc, route);
    if (desc.length > 160) warnings.push(`${route}: meta description is ${desc.length} chars, will be truncated`);
    if (desc.length < 70 && !isUtility) warnings.push(`${route}: meta description is only ${desc.length} chars — thin`);
  }

  if (!canonical) errors.push(`${route}: missing canonical link`);

  if (!robots) errors.push(`${route}: missing robots meta`);
  else if (isUtility && !/noindex/.test(robots))
    errors.push(`${route}: utility page must be noindex but is "${robots}"`);
  else if (!isUtility && !approved && !/noindex/.test(robots))
    errors.push(`${route}: copy is not approved but robots is "${robots}" — draft copy would be indexable`);
  else if (!isUtility && approved && /noindex/.test(robots))
    errors.push(`${route}: copy is approved but page is still noindex`);

  if (h1s.length === 0) errors.push(`${route}: no <h1>`);
  if (h1s.length > 1) errors.push(`${route}: ${h1s.length} <h1> elements — there must be exactly one`);

  if (!/<html lang="en">/.test(html)) errors.push(`${route}: missing lang on <html>`);
  if (!/<meta name="viewport"/.test(html)) errors.push(`${route}: missing viewport meta`);
  if (!/property="og:title"/.test(html)) warnings.push(`${route}: missing og:title`);
  if (!/property="og:url"/.test(html)) warnings.push(`${route}: missing og:url`);
  if (!/property="og:image"/.test(html)) warnings.push(`${route}: missing og:image`);

  return canonical;
}

function checkStructuredData(html, route) {
  const isUtility = NOINDEX_ROUTES.has(route);
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

  if (!blocks.length) {
    // Utility pages intentionally carry no structured data.
    if (!isUtility) errors.push(`${route}: no JSON-LD structured data`);
    return;
  }
  if (isUtility) {
    warnings.push(`${route}: noindex utility page is emitting structured data`);
  }

  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      errors.push(`${route}: JSON-LD does not parse — ${e.message}`);
      continue;
    }

    if (data['@context'] !== 'https://schema.org') errors.push(`${route}: JSON-LD @context is not https://schema.org`);

    const graph = data['@graph'];
    if (!Array.isArray(graph) || !graph.length) {
      errors.push(`${route}: JSON-LD has no @graph nodes`);
      continue;
    }

    const types = graph.map((n) => n['@type']);
    if (!types.includes('Organization') && !types.includes('LocalBusiness'))
      errors.push(`${route}: JSON-LD missing the Organization/LocalBusiness node`);
    if (!types.includes('WebSite')) errors.push(`${route}: JSON-LD missing the WebSite node`);
    if (!types.some((t) => /Page$/.test(t))) errors.push(`${route}: JSON-LD missing the WebPage node`);

    // Nothing in the graph may be null, empty, or a leaked placeholder.
    const walk = (node, path) => {
      if (node === null) return errors.push(`${route}: JSON-LD null value at ${path}`);
      if (typeof node === 'string') {
        if (!node.trim()) errors.push(`${route}: JSON-LD empty string at ${path}`);
        if (/\[PLACEHOLDER/i.test(node)) errors.push(`${route}: JSON-LD leaked a placeholder at ${path}`);
        if (/\b(TODO|TBD|XXX|lorem ipsum)\b/i.test(node))
          errors.push(`${route}: JSON-LD contains a placeholder at ${path} — "${node.slice(0, 60)}"`);
        return;
      }
      if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${path}[${i}]`));
      if (typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
    };
    graph.forEach((n, i) => walk(n, `@graph[${i}]`));

    // Breadcrumb positions must be 1-based and contiguous or Google drops the result.
    const bc = graph.find((n) => n['@type'] === 'BreadcrumbList');
    if (bc) {
      const got = bc.itemListElement.map((i) => i.position);
      const want = got.map((_, i) => i + 1);
      if (JSON.stringify(got) !== JSON.stringify(want))
        errors.push(`${route}: BreadcrumbList positions are ${got.join(',')} — must be ${want.join(',')}`);
    }
  }
}

async function checkSitemap(canonicalByRoute, approved) {
  let xml;
  try {
    xml = await readFile(join(DIST, 'sitemap.xml'), 'utf8');
  } catch {
    errors.push('sitemap.xml was not generated');
    return;
  }

  if (!xml.includes('http://www.sitemaps.org/schemas/sitemap/0.9'))
    errors.push('sitemap.xml: wrong or missing urlset namespace — Search Console will reject it');

  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  for (const loc of locs) {
    if (!loc.endsWith('/')) errors.push(`sitemap.xml: ${loc} has no trailing slash — must match the canonical exactly`);
  }

  // Every indexable page must be listed, and its canonical must match byte for byte.
  for (const [route, canonical] of canonicalByRoute) {
    if (NOINDEX_ROUTES.has(route)) {
      if (canonical && locs.includes(canonical))
        errors.push(`sitemap.xml lists ${canonical}, but ${route} is a noindex utility page`);
      continue;
    }
    if (!canonical) continue;
    if (!locs.includes(canonical))
      errors.push(`sitemap.xml is missing ${canonical} (page ${route} is indexable but not listed)`);
  }

  // And nothing may be listed that we did not build.
  const canonicals = new Set([...canonicalByRoute.values()].filter(Boolean));
  for (const loc of locs) {
    if (!canonicals.has(loc)) errors.push(`sitemap.xml lists ${loc}, which is not a built page`);
  }

  const robots = await readFile(join(DIST, 'robots.txt'), 'utf8').catch(() => null);
  if (!robots) return errors.push('robots.txt was not generated');

  if (approved) {
    if (/^Disallow: \/$/m.test(robots)) errors.push('robots.txt disallows everything while copy is approved');
    if (!/Sitemap:/.test(robots)) errors.push('robots.txt does not reference the sitemap');
  } else if (!/^Disallow: \/$/m.test(robots)) {
    errors.push('copy is not approved but robots.txt does not disallow crawling');
  }
}

function checkInternalLinks(html, route, routes, base) {
  const hrefs = [...html.matchAll(/href="([^"#?]*)"/g)].map((m) => m[1]);
  for (const href of hrefs) {
    if (!href.startsWith('/')) continue; // external or relative
    if (/\.(svg|xml|txt|png|jpg|jpeg|webp|ico|css|js|avif)$/.test(href)) continue;
    // Normalise to a built route: strip the base prefix, ensure a trailing slash.
    let path = href.startsWith(base) ? href.slice(base.length) : href;
    if (!path.startsWith('/')) path = '/' + path;
    if (!path.endsWith('/')) path += '/';
    if (!routes.includes(path)) errors.push(`${route}: internal link to "${href}" which is not a built route`);
  }
}

async function checkWeight(files) {
  const BUDGET = 80 * 1024;
  for (const f of files) {
    const { size } = await stat(f);
    if (size > BUDGET)
      warnings.push(`${routeOf(f)}: ${(size / 1024).toFixed(1)}KB exceeds the ${BUDGET / 1024}KB page budget`);
  }
}

/** Launch-readiness facts, read from the built markup rather than the TS source. */
function checkLaunchReadiness(homeHtml, approved) {
  const ld = homeHtml.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const raw = ld ? ld[1] : '';

  if (!/"telephone"/.test(raw)) notes.push('structured data: no phone number — an owner who finds us cannot call');
  if (!/"address"/.test(raw))
    notes.push(
      "structured data: publishing as Organization, not LocalBusiness. Google's local result needs a verified address and phone. Upgrades automatically once both are set."
    );
  if (!/"logo"/.test(raw)) notes.push('structured data: no logo — needed for a knowledge-panel logo (raster, min 112x112)');

  if (!/plausible\.io|googletagmanager\.com/.test(homeHtml))
    notes.push('no analytics configured — we cannot see what is working');
  if (!/google-site-verification/.test(homeHtml))
    notes.push('no Google Search Console verification token — search performance data is unavailable');

  if (approved && !/"telephone"/.test(raw))
    errors.push('copy is approved but there is still no published phone number');
}

// ── run ──────────────────────────────────────────────────────────────────────

async function main() {
  let files;
  try {
    files = await htmlFiles(DIST);
  } catch {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const robotsTxt = await readFile(join(DIST, 'robots.txt'), 'utf8').catch(() => '');
  // The built artifact is the source of truth for approval state.
  const approved = !/^Disallow: \/$/m.test(robotsTxt);

  // Derive the deployed base path from a canonical so this keeps working if the site
  // moves to a custom domain.
  const homeFile = files.find((f) => routeOf(f) === '/');
  const homeHtml = homeFile ? await readFile(homeFile, 'utf8') : '';
  const homeCanonical = grab(homeHtml, /<link rel="canonical" href="([^"]*)"/) || '';
  const base = homeCanonical ? new URL(homeCanonical).pathname.replace(/\/$/, '') : '';

  const routes = files.map(routeOf);
  const seen = { titles: new Map(), descs: new Map() };
  const canonicalByRoute = new Map();
  let placeholders = 0;

  for (const file of files) {
    const html = await readFile(file, 'utf8');
    const route = routeOf(file);
    placeholders += checkPlaceholders(html, route, approved);
    checkInventedClaims(html, route, approved);
    canonicalByRoute.set(route, checkHead(html, route, seen, approved));
    checkStructuredData(html, route);
    checkInternalLinks(html, route, routes, base);
  }

  await checkSitemap(canonicalByRoute, approved);
  await checkWeight(files);
  checkLaunchReadiness(homeHtml, approved);

  const line = '─'.repeat(76);
  console.log(`\n${line}\nSEO + publication verification — COPY_APPROVED: ${approved}\n${line}`);
  console.log(`${files.length} pages checked, base "${base || '/'}"\n`);

  if (notes.length) {
    console.log(`AWAITING CEO INPUT (${notes.length})${approved ? ':' : ' — expected before launch:'}`);
    for (const n of notes) console.log(`  · ${n}`);
    console.log('');
  }
  if (warnings.length) {
    console.log(`WARNINGS (${warnings.length}):`);
    for (const w of warnings) console.log(`  ! ${w}`);
    console.log('');
  }
  if (errors.length) {
    console.log(`ERRORS (${errors.length}) — DO NOT DEPLOY:`);
    for (const e of errors) console.log(`  x ${e}`);
    console.log(`\nFAILED — ${errors.length} error(s).\n`);
    process.exit(1);
  }

  if (placeholders) console.log(`${placeholders} copy item(s) awaiting CEO confirmation across the site.\n`);
  console.log(
    approved
      ? 'PASSED — safe to deploy.\n'
      : 'PASSED — technically sound. Site is correctly held non-indexable until the CEO checklist is complete.\n'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
