/**
 * Tests the publication guardrails.  `npm run test:guardrails`
 *
 * These protect a company boundary rather than a technical invariant: unapproved copy,
 * unverified business facts and invented claims must not reach production. A guardrail
 * nobody tests is a guardrail that quietly stops working, so these assert the FAILURE
 * paths, not the happy one.
 *
 * Everything runs against the built output, and the COPY_APPROVED flip is exercised by
 * temporarily rewriting src/config.ts and restoring it. The restore runs in a finally
 * block so an assertion failure cannot leave the repo approved.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const CONFIG = join(ROOT, 'src', 'config.ts');

let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`  ok   ${name}`);
  else {
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

const run = (cmd, args) =>
  spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' });

const build = () => run('npx', ['astro', 'build']);
const verify = () => run('node', ['scripts/verify-seo.mjs']);

const read = (p) => readFileSync(p, 'utf8');

console.log('\nGuardrail tests\n');

const originalConfig = read(CONFIG);

try {
  // ── 1. Unapproved copy must be non-indexable ──────────────────────────────
  console.log('unapproved state (COPY_APPROVED = false)');
  build();

  const home = read(join(DIST, 'index.html'));
  const robots = read(join(DIST, 'robots.txt'));

  check('every page is noindex', /<meta name="robots" content="noindex,nofollow">/.test(home));
  check('robots.txt disallows all crawling', /^Disallow: \/$/m.test(robots));
  check('robots.txt does not advertise the sitemap', !/Sitemap:/.test(robots));
  check('verify passes while unapproved', verify().status === 0);

  // ── 2. Placeholders must never reach the structured data ──────────────────
  console.log('\nstructured data safety');
  const ld = home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  check('home page emits JSON-LD', Boolean(ld));

  let graph = null;
  if (ld) {
    try {
      graph = JSON.parse(ld[1]);
      check('JSON-LD parses', true);
    } catch (e) {
      check('JSON-LD parses', false, e.message);
    }
  }

  if (graph) {
    const raw = JSON.stringify(graph);
    check('no placeholder chips in JSON-LD', !/\[PLACEHOLDER/i.test(raw));
    check('no null values in JSON-LD', !/:null/.test(raw));
    check('no phone leaked before it is supplied', !/"telephone"/.test(raw));
    check('no address leaked before it is supplied', !/"address"/.test(raw));
    check(
      'publishes as Organization, not LocalBusiness, without an address',
      graph['@graph'].some((n) => n['@type'] === 'Organization') &&
        !graph['@graph'].some((n) => n['@type'] === 'LocalBusiness')
    );
  }

  check('placeholder chips are visible in the HTML for the team', /\[PLACEHOLDER:/.test(home));

  // Utility pages must be excluded from search entirely.
  const thanks = read(join(DIST, 'thank-you', 'index.html'));
  check('thank-you is noindex', /content="noindex,nofollow"/.test(thanks));
  check('thank-you carries no structured data', !/application\/ld\+json/.test(thanks));
  check('sitemap excludes thank-you', !read(join(DIST, 'sitemap.xml')).includes('/thank-you/'));

  // ── 3. Approving copy while placeholders remain must be blocked ───────────
  console.log('\napproving copy while placeholders remain is blocked');
  writeFileSync(CONFIG, originalConfig.replace('export const COPY_APPROVED = false;', 'export const COPY_APPROVED = true;'), 'utf8');
  check('test rewrote COPY_APPROVED', read(CONFIG).includes('COPY_APPROVED = true'));

  build();
  const approvedRobots = read(join(DIST, 'robots.txt'));
  check('robots.txt opens up when approved', !/^Disallow: \/$/m.test(approvedRobots));
  check('robots.txt advertises the sitemap when approved', /Sitemap:/.test(approvedRobots));

  const approvedVerify = verify();
  check('verify FAILS when approved with placeholders outstanding', approvedVerify.status === 1, `exit ${approvedVerify.status}`);
  check('failure names the unresolved placeholders', /unresolved \[PLACEHOLDER/.test(approvedVerify.stdout));
  check('failure says DO NOT DEPLOY', /DO NOT DEPLOY/.test(approvedVerify.stdout));
  check('failure flags the missing phone number', /no published phone number/.test(approvedVerify.stdout));
} finally {
  // ── 4. Restore, always ────────────────────────────────────────────────────
  writeFileSync(CONFIG, originalConfig, 'utf8');
  build();
  const restored = existsSync(join(DIST, 'robots.txt')) ? read(join(DIST, 'robots.txt')) : '';
  check('config and build restored to unapproved', /^Disallow: \/$/m.test(restored));
  check('sitemap still present', existsSync(join(DIST, 'sitemap.xml')));
}

console.log(failures === 0 ? '\nAll guardrail tests passed.\n' : `\n${failures} guardrail test(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
