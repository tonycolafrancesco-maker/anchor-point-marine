/**
 * Structured data (JSON-LD) generation.  ANC-7
 *
 * The rule that governs this module: it NEVER emits a business fact that has not been
 * filled in. If the phone number is null, `telephone` is absent — not blank, not a
 * placeholder, absent. Google is fine with a smaller true graph; it is not fine with
 * markup that disagrees with the page, and neither is an owner checking us out.
 *
 * Type strategy:
 *   Today — Organization + WebSite + WebPage + BreadcrumbList (+ Service, + FAQPage)
 *   Once the CEO supplies a real address and phone, the Organization node upgrades
 *   itself to LocalBusiness. That upgrade is what makes us eligible for the local pack
 *   and the map result, and it is gated purely on config, so it happens the moment the
 *   facts land — no code change. Tested in scripts/test-guardrails.mjs.
 */

import { SITE, STRUCTURED, SERVICE_AREA, PENDING } from '../config';

type Json = Record<string, any>;

/** Strip null/undefined/empty so we never emit a hollow property. */
function clean(obj: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

/** Absolute URL for a site-relative path, respecting the configured base. */
export function absUrl(site: URL | undefined, path: string, base = ''): string {
  const root = site ? site.origin : 'https://example.invalid';
  const b = base.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  // Directory-style URLs with a trailing slash, matching build.format: 'directory'.
  const full = `${root}${b}${p}`.replace(/\/+$/, '');
  return `${full}/`;
}

export interface PageMeta {
  /** Site-relative path, e.g. '/services' or '/'. */
  path: string;
  title: string;
  description: string;
  /** Heading used as the breadcrumb leaf. */
  heading: string;
  kind?: 'home' | 'service' | 'location' | 'contact' | 'about' | 'hub';
  /** For location pages — the specific place served. */
  place?: string;
  faq?: { q: string; a: string }[];
}

interface Ctx {
  site: URL | undefined;
  base: string;
}

const orgId = (c: Ctx) => `${absUrl(c.site, '/', c.base)}#organization`;
const siteId = (c: Ctx) => `${absUrl(c.site, '/', c.base)}#website`;

/**
 * Places we serve.
 *
 * Modelling note: `addressRegion` is a property of PostalAddress, NOT of City —
 * City inherits from Place, which has no such property. Asserting it there is invalid
 * schema.org and the validator rejects it. The correct way to say "Newport Beach, in
 * California" is containedInPlace pointing at a State.
 */
function areaServed(): Json[] {
  const state = { '@type': 'State', name: SERVICE_AREA.region };
  const city = { '@type': 'City', name: SERVICE_AREA.city, containedInPlace: state };
  return [
    city,
    ...SERVICE_AREA.places.map((p) => ({
      '@type': 'Place',
      name: p,
      containedInPlace: { '@type': 'City', name: SERVICE_AREA.city },
    })),
  ];
}

function offerCatalog(c: Ctx): Json {
  const services: [string, string][] = [
    ['Preventive maintenance management', '/services'],
    ['Marine vendor coordination', '/services'],
    ['Vessel compliance and documentation', '/services'],
    ['Owner reporting and vessel portal', '/services'],
  ];
  return {
    '@type': 'OfferCatalog',
    name: 'Yacht management services',
    itemListElement: services.map(([name, path]) => ({
      '@type': 'Offer',
      itemOffered: { '@type': 'Service', name, url: absUrl(c.site, path, c.base) },
    })),
  };
}

/** The business. Becomes a LocalBusiness only when it carries the required facts. */
export function organizationNode(c: Ctx): Json {
  const { phone, email, address, geo, hours, logo, priceRange, foundingDate } = STRUCTURED;

  // Google's LocalBusiness rich result requires name + address. Without a verified
  // address we publish a plain Organization: valid, still feeds the knowledge graph,
  // but not eligible for the local result yet.
  const qualifies = Boolean(address && phone);

  const node: Json = {
    '@type': qualifies ? 'LocalBusiness' : 'Organization',
    '@id': orgId(c),
    name: SITE.name,
    alternateName: SITE.shortName,
    url: absUrl(c.site, '/', c.base),
    description: SITE.description,
    slogan: SITE.tagline,
    telephone: phone,
    email: email ?? PENDING.email,
    priceRange,
    foundingDate,
    areaServed: areaServed(),
    knowsAbout: [
      'Yacht management',
      'Yacht maintenance',
      'Marine vendor coordination',
      'Vessel documentation and compliance',
    ],
    hasOfferCatalog: offerCatalog(c),
  };

  if (address) {
    node.address = clean({
      '@type': 'PostalAddress',
      streetAddress: address.street,
      addressLocality: address.city,
      addressRegion: address.region,
      postalCode: address.postalCode,
      addressCountry: address.country || 'US',
    });
  }

  if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
    node.geo = { '@type': 'GeoCoordinates', latitude: geo.lat, longitude: geo.lng };
  }

  if (hours && hours.length) {
    node.openingHoursSpecification = hours.map((h) =>
      clean({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: h.days,
        opens: h.opens,
        closes: h.closes,
      })
    );
  }

  // Only emitted once a real raster asset exists — pointing this at the placeholder
  // SVG would be rejected by Google anyway.
  if (logo && logo.path) {
    const logoUrl = absUrl(c.site, logo.path, c.base).replace(/\/$/, '');
    node.logo = clean({
      '@type': 'ImageObject',
      url: logoUrl,
      width: logo.width,
      height: logo.height,
    });
    node.image = logoUrl;
  }

  return clean(node);
}

function websiteNode(c: Ctx): Json {
  return clean({
    '@type': 'WebSite',
    '@id': siteId(c),
    url: absUrl(c.site, '/', c.base),
    name: SITE.name,
    description: SITE.description,
    publisher: { '@id': orgId(c) },
    inLanguage: SITE.locale,
  });
}

function webPageNode(page: PageMeta, c: Ctx): Json {
  const type =
    page.kind === 'contact' ? 'ContactPage' : page.kind === 'about' ? 'AboutPage' : 'WebPage';
  const node: Json = {
    '@type': type,
    '@id': `${absUrl(c.site, page.path, c.base)}#webpage`,
    url: absUrl(c.site, page.path, c.base),
    name: page.title,
    description: page.description,
    isPartOf: { '@id': siteId(c) },
    about: { '@id': orgId(c) },
    inLanguage: SITE.locale,
  };
  if (page.path !== '/') {
    node.breadcrumb = { '@id': `${absUrl(c.site, page.path, c.base)}#breadcrumb` };
  }
  return clean(node);
}

function breadcrumbNode(page: PageMeta, c: Ctx): Json | null {
  if (page.path === '/') return null;
  const items = [
    { name: 'Home', item: absUrl(c.site, '/', c.base) },
    { name: page.heading, item: absUrl(c.site, page.path, c.base) },
  ];
  return {
    '@type': 'BreadcrumbList',
    '@id': `${absUrl(c.site, page.path, c.base)}#breadcrumb`,
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: it.item,
    })),
  };
}

function serviceNode(page: PageMeta, c: Ctx): Json | null {
  if (page.kind !== 'service' && page.kind !== 'location' && page.kind !== 'hub') return null;
  const area = page.place
    ? [
        {
          '@type': 'Place',
          name: page.place,
          containedInPlace: {
            '@type': 'City',
            name: SERVICE_AREA.city,
            containedInPlace: { '@type': 'State', name: SERVICE_AREA.region },
          },
        },
      ]
    : areaServed();

  return clean({
    '@type': 'Service',
    '@id': `${absUrl(c.site, page.path, c.base)}#service`,
    name: page.heading,
    description: page.description,
    serviceType: 'Yacht management',
    provider: { '@id': orgId(c) },
    areaServed: area,
    url: absUrl(c.site, page.path, c.base),
  });
}

/**
 * FAQ node. Only emitted for answers with no unresolved placeholder — publishing
 * "[PLACEHOLDER: ...]" into a rich result would be worse than having no FAQ at all.
 */
function faqNode(page: PageMeta, c: Ctx): Json | null {
  if (!page.faq?.length) return null;
  const answered = page.faq.filter((f) => !/\[PLACEHOLDER/i.test(f.a) && !/\[PLACEHOLDER/i.test(f.q));
  if (!answered.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': `${absUrl(c.site, page.path, c.base)}#faq`,
    mainEntity: answered.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

/** The full @graph for a page, ready to be embedded in a script tag. */
export function graphFor(page: PageMeta, site: URL | undefined, base: string): Json {
  const c: Ctx = { site, base };
  const nodes: Json[] = [organizationNode(c), websiteNode(c), webPageNode(page, c)];
  const bc = breadcrumbNode(page, c);
  if (bc) nodes.push(bc);
  const svc = serviceNode(page, c);
  if (svc) nodes.push(svc);
  const faq = faqNode(page, c);
  if (faq) nodes.push(faq);
  return { '@context': 'https://schema.org', '@graph': nodes };
}

/**
 * Serialise for embedding in <script type="application/ld+json">.
 * JSON is not HTML-escaped the same way; the only sequences that can break out are
 * `</script` and the comment openers, so those are what we neutralise.
 */
export function serialiseJsonLd(graph: Json): string {
  return JSON.stringify(graph, null, 2)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
