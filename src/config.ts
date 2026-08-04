/**
 * Single source of truth for site-wide settings and for every piece of copy
 * that needs CEO sign-off before it can be called final.
 *
 * PLACEHOLDER POLICY
 * ------------------
 * Nothing in this file may assert a fact about Anchor Point that has not been
 * confirmed by the CEO. Unconfirmed facts are `null` and render on-page as a
 * clearly-marked [PLACEHOLDER: ...] chip. Fill the value in here and the
 * placeholder chip disappears automatically.
 */

export const SITE = {
  name: 'Anchor Point Marine Group',
  shortName: 'Anchor Point',
  tagline: 'Full-service yacht management in Newport Harbor.',
  description:
    'Anchor Point Marine Group provides full-service yacht management for owners in Newport Harbor, California — preventive maintenance, vendor coordination, compliance and documentation, and transparent owner reporting.',
  locale: 'en-US',
} as const;

/**
 * Set to true only after the CEO has signed off on every line of copy and
 * filled the placeholders below.
 *
 * While false, every page emits <meta name="robots" content="noindex,nofollow">
 * so an unfinished site cannot be indexed. Newport Harbor is a small community;
 * a half-written page ranking for our own name is worse than no page at all.
 */
export const COPY_APPROVED = false;

/**
 * Where the lead form posts. See docs/LEAD-CAPTURE.md for how this is wired
 * and how to move it in-house later.
 *
 * This is FormSubmit's alias for the destination inbox, not a naked email
 * address — the address must stay out of the page source or it gets harvested
 * for spam. The alias currently resolves to wheresjoe+leads@gmail.com.
 * Activated and verified end to end on 2026-08-05.
 */
export const FORM_ENDPOINT =
  'https://formsubmit.co/7d58a0f5f470f069012c4877e66224ec';

/**
 * Unverified facts. `null` renders a placeholder chip on the page.
 * Every null here is listed for the CEO in the ANC-2 completion comment.
 */
export const PENDING: Record<string, string | null> = {
  // Contact details
  phone: null,
  email: null,
  address: null,
  hours: null,
  responseTime: null,
  serviceArea: null,

  // Company / credibility — nothing here may be guessed
  yearsOperating: null,
  ownerName: null,
  credentials: null,
  insurance: null,

  // Commercial terms
  pricing: null,
  terms: null,
  spendThreshold: null,

  // Marine-domain content — CEO / Head of Marine Operations owns these
  intervals: null,
  intervalSource: null,
  complianceScope: null,

  // Process detail
  onboardTiming: null,
  reportDelivery: null,
  portalTiming: null,

  // Legal
  privacy: null,
};

/** Resolve a pending fact, or return null so the caller can render a chip. */
export function pending(key: keyof typeof PENDING | string): string | null {
  return PENDING[key] ?? null;
}

/** Prefix a path with the configured base so links work under /anchor-point-marine. */
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${base}${clean}` || '/';
}

export const NAV = [
  { label: 'Services', href: '/services' },
  { label: 'How It Works', href: '/how-it-works' },
  { label: 'Contact', href: '/contact' },
] as const;

/* ══════════════════════════════════════════════════════════════════════════
   SEO AND DISCOVERABILITY  (ANC-7)
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Machine-readable versions of the facts in PENDING.
 *
 * PENDING holds display strings for humans. Structured data needs the same facts
 * broken into fields — Google cannot parse "123 Main St, Newport Beach CA" into a
 * PostalAddress reliably, and a wrong address in markup is worse than none.
 *
 * The same rule applies here as everywhere else: `null` means unknown, and anything
 * null is omitted from the markup entirely rather than guessed. Fill these in
 * alongside the matching PENDING entry.
 */
export const STRUCTURED: {
  /** E.164, e.g. '+1-949-555-0100'. Google matches this against the Business Profile. */
  phone: string | null;
  email: string | null;
  address: {
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  } | null;
  /** Business location, not the harbour centroid. */
  geo: { lat: number; lng: number } | null;
  hours: { days: string[]; opens: string; closes: string }[] | null;
  /** Knowledge-panel logo. Must be raster (PNG/JPG), min 112x112 — Google rejects SVG. */
  logo: { path: string; width: number; height: number } | null;
  priceRange: string | null;
  foundingDate: string | null;
} = {
  phone: null,
  email: null,
  address: null,
  geo: null,
  hours: null,
  logo: null,
  priceRange: null,
  foundingDate: null,
};

/**
 * Where we work. These are geographic facts about Newport Harbor rather than claims
 * about the business, so they are safe to publish. The CEO should still confirm we
 * are willing to take work in each one.
 */
export const SERVICE_AREA = {
  city: 'Newport Beach',
  region: 'CA',
  country: 'US',
  places: [
    'Newport Harbor',
    'Balboa Island',
    'Lido Isle',
    'Balboa Peninsula',
    'Linda Isle',
    'Bayshores',
    'Corona del Mar',
    'Newport Coast',
  ],
} as const;

/**
 * Analytics and Search Console. Every value is null until the CEO creates the
 * accounts; the layout simply omits the tags, so there is nothing to break and no
 * third-party request until we actually want one.
 *
 * See docs/CEO-CHECKLIST.md for what to create and where to paste it.
 */
export const ANALYTICS: {
  /** Plausible: privacy-first, ~1KB, no cookie banner obligation. Recommended. */
  plausibleDomain: string | null;
  /** GA4 measurement ID, e.g. 'G-XXXXXXXXXX'. Optional; both can run together. */
  ga4MeasurementId: string | null;
  /** Google Search Console HTML-tag verification — the content="" value only. */
  googleSiteVerification: string | null;
  /** Bing Webmaster Tools. */
  bingSiteVerification: string | null;
} = {
  plausibleDomain: null,
  ga4MeasurementId: null,
  googleSiteVerification: null,
  bingSiteVerification: null,
};

/**
 * Every indexable route, with its sitemap metadata.
 *
 * This is the single list the sitemap is generated from, so a new page cannot be
 * silently left out of it. `scripts/verify-seo.mjs` fails the build if a built page
 * is missing here, or if a sitemap entry does not match that page's canonical URL.
 */
export const ROUTES: { path: string; priority: string; changefreq: string }[] = [
  { path: '/', priority: '1.0', changefreq: 'weekly' },
  { path: '/yacht-management-newport-beach', priority: '0.9', changefreq: 'monthly' },
  { path: '/yacht-maintenance-newport-harbor', priority: '0.9', changefreq: 'monthly' },
  { path: '/services', priority: '0.8', changefreq: 'monthly' },
  { path: '/boat-management-balboa-island', priority: '0.8', changefreq: 'monthly' },
  { path: '/boat-management-lido-isle', priority: '0.8', changefreq: 'monthly' },
  { path: '/how-it-works', priority: '0.7', changefreq: 'monthly' },
  { path: '/contact', priority: '0.8', changefreq: 'yearly' },
];
