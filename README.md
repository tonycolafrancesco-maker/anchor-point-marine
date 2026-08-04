# Anchor Point Marine Group — marketing site

Public web presence for Anchor Point Marine Group: full-service yacht
management in Newport Harbor, California.

**Live URL:** https://tonycolafrancesco-maker.github.io/anchor-point-marine/

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Framework | [Astro](https://astro.build) 7 | Ships static HTML with zero client JS. Fast on marina wifi. |
| Styling | One hand-written CSS file | Four pages does not need a framework. |
| Hosting | GitHub Pages via GitHub Actions | Free, no separate account to hold, deploys on push to `main`. |
| Forms | [FormSubmit](https://formsubmit.co) | Emails the lead on submit. No backend to run. See `docs/LEAD-CAPTURE.md`. |
| CMS | None | Copy lives in `src/`. A CMS for four pages is overhead with no payoff. |

## Local development

```bash
npm install
npm run dev      # http://localhost:4321/anchor-point-marine
npm run build    # static output to dist/
npm run preview  # serve the built output
```

## Deploying

Push to `main`. `.github/workflows/deploy.yml` builds and publishes to GitHub
Pages. No manual step.

## Before this site goes public

The site currently emits `<meta name="robots" content="noindex,nofollow">` on
every page and `Disallow: /` in `robots.txt`. This is deliberate — the copy
contains unfilled placeholders and must not be indexed yet.

To open it up once the CEO has signed off:

1. Fill the values in `PENDING` in `src/config.ts`. Every `null` renders a
   visible `[PLACEHOLDER: ...]` chip on the page.
2. Set `COPY_APPROVED = true` in `src/config.ts`.
3. Replace the body of `public/robots.txt` with `User-agent: *` / `Allow: /`.
4. Push.

## Copy rules

Nothing on this site may assert a fact about Anchor Point that has not been
confirmed by the CEO — no years in business, client counts, certifications,
testimonials, awards, pricing, response-time promises, or vessel references.

Unconfirmed facts go in `PENDING` as `null` and render as a conspicuous
placeholder chip. They do not get guessed, and they do not get quietly dropped.

Service intervals and any marine-domain standard are owned by the CEO and the
Head of Marine Operations. This repo encodes them; it does not invent them.
