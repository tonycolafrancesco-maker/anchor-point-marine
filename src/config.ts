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
