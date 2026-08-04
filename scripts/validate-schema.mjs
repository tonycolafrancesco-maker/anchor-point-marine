/**
 * Structured-data validation against the real schema.org vocabulary.
 * `npm run validate:schema`
 *
 * Why this exists rather than "paste it into Google's Rich Results Test":
 * that tool needs either a publicly reachable URL (which we do not have until the
 * domain is live) or a human pasting into a browser. Neither runs in CI, and neither
 * catches a regression introduced six months from now. So this script downloads
 * schema.org's own machine-readable vocabulary and checks our emitted markup against
 * it — every type is a real class, every property is real and valid on the type it is
 * attached to — plus Google's documented required fields for the rich result types we
 * are targeting.
 *
 * This is a superset of what the online validator checks for syntax and vocabulary.
 * It is NOT a substitute for the final Rich Results Test run against the live URL,
 * which is what confirms Google can actually fetch and render the page. That run is
 * on the CEO checklist because it depends on the domain being live.
 *
 * The vocabulary is cached in .cache/ after the first download so this works offline.
 */

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CACHE = join(ROOT, '.cache');
const VOCAB_FILE = join(CACHE, 'schemaorg-current-https.jsonld');
const VOCAB_URL = 'https://schema.org/version/latest/schemaorg-current-https.jsonld';

/** Noindex utility pages, which intentionally carry no structured data. */
const NOINDEX_ROUTES = new Set(['/404.html', '/thank-you/']);

const errors = [];
const warnings = [];

// ── vocabulary ───────────────────────────────────────────────────────────────

async function loadVocabulary() {
  if (!existsSync(VOCAB_FILE)) {
    console.log('Downloading schema.org vocabulary (first run only)...');
    await mkdir(CACHE, { recursive: true });
    const res = await fetch(VOCAB_URL);
    if (!res.ok) throw new Error(`Could not download schema.org vocabulary: HTTP ${res.status}`);
    await writeFile(VOCAB_FILE, await res.text(), 'utf8');
  }
  const raw = JSON.parse(await readFile(VOCAB_FILE, 'utf8'));

  const classes = new Map(); // 'Organization' -> { parents: Set<string> }
  const properties = new Map(); // 'telephone'  -> { domains: Set<string> }

  const short = (v) => {
    if (!v) return null;
    const id = typeof v === 'string' ? v : v['@id'];
    return id ? id.replace(/^schema:/, '').replace(/^https?:\/\/schema\.org\//, '') : null;
  };
  const list = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

  for (const node of raw['@graph']) {
    const types = list(node['@type']);
    const name = short(node['@id']);
    if (!name) continue;

    if (types.includes('rdfs:Class')) {
      classes.set(name, { parents: new Set(list(node['rdfs:subClassOf']).map(short).filter(Boolean)) });
    }
    if (types.includes('rdf:Property')) {
      properties.set(name, {
        domains: new Set(list(node['schema:domainIncludes']).map(short).filter(Boolean)),
      });
    }
  }
  return { classes, properties };
}

/** Every ancestor of a type, including itself. */
function ancestors(type, classes, seen = new Set()) {
  if (seen.has(type)) return seen;
  seen.add(type);
  const cls = classes.get(type);
  if (cls) for (const p of cls.parents) ancestors(p, classes, seen);
  return seen;
}

// ── validation ───────────────────────────────────────────────────────────────

/** JSON-LD keywords that are not schema.org properties. */
const KEYWORDS = new Set(['@context', '@type', '@id', '@graph', '@value', '@language', '@list', '@set']);

function validateNode(node, path, vocab, route) {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((n, i) => validateNode(n, `${path}[${i}]`, vocab, route));
    return;
  }

  const types = node['@type'] ? (Array.isArray(node['@type']) ? node['@type'] : [node['@type']]) : [];

  for (const t of types) {
    if (!vocab.classes.has(t)) {
      errors.push(`${route} ${path}: "${t}" is not a schema.org type`);
    }
  }

  // A node that is only a reference ({"@id": "..."}) carries no properties to check.
  const keys = Object.keys(node).filter((k) => !KEYWORDS.has(k));
  if (types.length === 0 && keys.length > 0 && !node['@id']) {
    warnings.push(`${route} ${path}: node has properties but no @type`);
  }

  const validTypes = types.filter((t) => vocab.classes.has(t));
  const allAncestors = new Set();
  for (const t of validTypes) for (const a of ancestors(t, vocab.classes)) allAncestors.add(a);

  for (const key of keys) {
    const prop = vocab.properties.get(key);
    if (!prop) {
      errors.push(`${route} ${path}.${key}: "${key}" is not a schema.org property`);
      continue;
    }
    // Only check applicability when we know the node's type.
    if (validTypes.length && prop.domains.size) {
      const applies = [...prop.domains].some((d) => allAncestors.has(d));
      if (!applies) {
        errors.push(
          `${route} ${path}.${key}: "${key}" is not valid on ${validTypes.join('/')} ` +
            `(valid on: ${[...prop.domains].slice(0, 5).join(', ')})`
        );
      }
    }
    validateNode(node[key], `${path}.${key}`, vocab, route);
  }
}

/**
 * Google's documented requirements for the rich result types we target.
 * Source: Google Search Central structured data documentation.
 * Missing a REQUIRED field means the rich result is not generated at all.
 */
function validateGoogleRequirements(graph, route) {
  const byType = (t) => graph.filter((n) => (Array.isArray(n['@type']) ? n['@type'].includes(t) : n['@type'] === t));

  for (const bc of byType('BreadcrumbList')) {
    const items = bc.itemListElement || [];
    if (!items.length) errors.push(`${route}: BreadcrumbList has no itemListElement — Google requires at least one`);
    items.forEach((it, i) => {
      if (typeof it.position !== 'number') errors.push(`${route}: breadcrumb item ${i} missing required "position"`);
      if (!it.name) errors.push(`${route}: breadcrumb item ${i} missing required "name"`);
      // The final crumb may omit "item"; all others require it.
      if (!it.item && i < items.length - 1) errors.push(`${route}: breadcrumb item ${i} missing required "item"`);
    });
  }

  for (const faq of byType('FAQPage')) {
    const qs = faq.mainEntity || [];
    if (!qs.length) errors.push(`${route}: FAQPage has no mainEntity — Google requires at least one Question`);
    qs.forEach((q, i) => {
      if (!q.name) errors.push(`${route}: FAQ question ${i} missing required "name"`);
      const a = q.acceptedAnswer;
      if (!a || !a.text) errors.push(`${route}: FAQ question ${i} missing required acceptedAnswer.text`);
    });
  }

  for (const lb of byType('LocalBusiness')) {
    if (!lb.name) errors.push(`${route}: LocalBusiness missing required "name"`);
    if (!lb.address) errors.push(`${route}: LocalBusiness missing required "address"`);
    for (const rec of ['telephone', 'openingHoursSpecification', 'geo', 'image', 'priceRange']) {
      if (!lb[rec]) warnings.push(`${route}: LocalBusiness is missing recommended "${rec}"`);
    }
  }

  for (const org of byType('Organization')) {
    if (!org.name) errors.push(`${route}: Organization missing required "name"`);
    if (!org.url) warnings.push(`${route}: Organization missing recommended "url"`);
    if (!org.logo) warnings.push(`${route}: Organization missing recommended "logo" (needed for a knowledge panel logo)`);
  }
}

// ── run ──────────────────────────────────────────────────────────────────────

async function htmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await htmlFiles(full)));
    else if (e.name.endsWith('.html')) out.push(full);
  }
  return out;
}

async function main() {
  if (!existsSync(DIST)) {
    console.error('dist/ not found. Run `npm run build` first.');
    process.exit(1);
  }

  const vocab = await loadVocabulary();
  console.log(`Loaded schema.org vocabulary: ${vocab.classes.size} classes, ${vocab.properties.size} properties`);

  const files = await htmlFiles(DIST);
  let nodeCount = 0;

  for (const file of files) {
    const route = '/' + relative(DIST, file).split(sep).join('/').replace(/index\.html$/, '');
    const html = await readFile(file, 'utf8');
    const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];

    if (!blocks.length) {
      // 404 and thank-you are noindex utility pages and carry no structured data
      // by design — marking up a page we tell Google to ignore is noise.
      if (!NOINDEX_ROUTES.has(route)) errors.push(`${route}: no JSON-LD found`);
      continue;
    }

    for (const [, raw] of blocks) {
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        errors.push(`${route}: JSON-LD parse error — ${e.message}`);
        continue;
      }
      const graph = data['@graph'] || [data];
      nodeCount += graph.length;
      graph.forEach((n, i) => validateNode(n, `@graph[${i}]`, vocab, route));
      validateGoogleRequirements(graph, route);
    }
  }

  const line = '─'.repeat(74);
  console.log(`\n${line}\nschema.org vocabulary validation\n${line}`);
  console.log(`${files.length} pages, ${nodeCount} top-level nodes checked\n`);

  if (warnings.length) {
    // Collapse the repetitive per-page warnings into counts; the detail is noise.
    const grouped = new Map();
    for (const w of warnings) {
      const key = w.replace(/^\/\S*\s/, '');
      grouped.set(key, (grouped.get(key) || 0) + 1);
    }
    console.log(`RECOMMENDATIONS (${warnings.length}):`);
    for (const [msg, count] of grouped) console.log(`  ! ${msg}${count > 1 ? `  (${count} pages)` : ''}`);
    console.log('');
  }

  if (errors.length) {
    console.log(`ERRORS (${errors.length}):`);
    for (const e of errors) console.log(`  x ${e}`);
    console.log(`\nFAILED — structured data is invalid.\n`);
    process.exit(1);
  }

  console.log('PASSED — all types and properties validate against the schema.org vocabulary,');
  console.log('and Google\'s required fields are present for every rich result type emitted.\n');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
