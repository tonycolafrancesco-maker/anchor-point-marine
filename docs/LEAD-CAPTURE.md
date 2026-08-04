# Lead capture — how it works and what it costs us

## The path a lead takes

1. Owner fills the form at `/contact`.
2. With JavaScript (essentially every real visitor): the page POSTs the fields
   as JSON to FormSubmit's `/ajax/` endpoint, retrying up to three times, then
   sends the browser to `/thank-you`. If all three attempts fail the owner sees
   an explicit error rather than a blank page.
3. Without JavaScript: the plain `<form>` POST goes to the same endpoint and
   FormSubmit issues a 302 to `/thank-you`.
4. Either way FormSubmit emails the submission to the destination inbox within
   seconds.

No database, no server, no cron. The lead lands in a human inbox or it does not
land at all — which is the failure mode we want, because a silent failure here
is a lost client.

## The UTF-8 bug — do not undo this

**FormSubmit's plain form-encoded endpoint returns HTTP 500 on any non-ASCII
byte**, in `_subject` or in any field value. Verified directly:

| Payload | Result |
| --- | --- |
| form-encoded, `_subject` with an ASCII hyphen | 302, delivered with all fields |
| form-encoded, `_subject` with an em dash | **500, lost** |
| form-encoded, em dash in the body | **500, lost** |
| JSON to `/ajax/`, ASCII only | 200, delivered with all fields |
| JSON to `/ajax/`, any non-ASCII | **200 "success", email arrives with EVERY FIELD STRIPPED** |

That last row is the dangerous one. The API reports success, an email lands, and
it contains no name, no email address, no vessel details — just a timestamp. We
would know somebody tried to reach us and have no way to reach them back. A
silent 500 is recoverable by a visitor who retries; this is not.

This is not an edge case. iOS turns a typed apostrophe into a curly one
automatically, so an owner writing "I'm looking for full management" on a phone
— exactly the scenario this site is built for — would have hit a 500 and their
inquiry would have vanished. Accented names (José, Renée) would fail the same
way.

### What we do about it

Because *neither* transport survives non-ASCII, the fix is not "pick the other
endpoint" — it is to normalise the input before it leaves the browser.
`toAscii()` in `src/pages/contact.astro`:

1. maps smart punctuation back to plain equivalents (`’`→`'`, `—`→`-`, `…`→`...`),
2. strips accents via NFD (`José`→`Jose`),
3. replaces anything still non-ASCII with a space,
4. and if a field reduces to nothing — a name written wholly in a non-Latin
   script — substitutes an explicit marker so the field is never silently blank.

Losing an accent from a name is a cosmetic loss we can apologise for. Losing the
lead is not recoverable.

Two things that are load-bearing and must not be "tidied up":

- **Do not put an em dash back in `_subject`.** It matches the house style used
  everywhere else on the site, which is exactly why someone will try.
- **Do not remove `toAscii()`** on the grounds that the JSON endpoint "supports
  UTF-8". It accepts it and then throws the data away.

Residual risk: a visitor with JavaScript disabled who types a non-ASCII
character still hits the 500, because no sanitising runs. That is a small
population, they get a visible error rather than silent loss, and it disappears
entirely when we move to our own Worker.

## Why this design

GitHub Pages serves static files only; it cannot run a form handler. The
options were:

- **A third-party form service** — chosen. No infrastructure, instant email.
- **A serverless function** (Cloudflare Workers / Vercel) — better long-term,
  but every provider needs an interactive OAuth login that could not be
  completed from the headless environment this was built in. No API token was
  available in the secrets store.
- **Self-hosted backend** — disproportionate for a contact form, and one more
  thing to keep alive.

FormSubmit was picked over Formspree/Web3Forms because it needs no account
signup — activation is a link in an email, which meant it could be set up and
end-to-end verified without a browser.

## Known limitations — read before scaling this

These are real and should be revisited, but none of them justified delaying
the revenue path:

1. **Lead data transits a third party.** Names, phone numbers, vessel details,
   and berth locations pass through FormSubmit's servers. Berth location for a
   high-net-worth client is sensitive. Their privacy policy governs retention;
   we have no contract with them.
2. **Delivery is to a personal Gmail account.** Should move to a company
   address (e.g. `inquiries@` on the real domain) so leads survive any one
   person's inbox.
3. **No copy of the lead is retained by us.** If the email is deleted, the lead
   is gone. There is no CRM behind this yet.
4. **Free tier, no SLA.** If FormSubmit goes down, submissions fail. There is
   no alerting on that.
5. **No rate limiting beyond a honeypot.** Spam volume is unknown so far.
6. **The service is visibly unreliable.** Beyond the UTF-8 bug above, their
   activation endpoint returned HTTP 500 for the first token we registered and
   never recovered; a second token registered minutes later activated fine. A
   provider that flaky sitting directly on the revenue path is the strongest
   argument for the migration below.

## Recommended migration path

Once a domain and a Cloudflare account exist, replace the endpoint with a
Cloudflare Worker that:

- writes the lead to a database we own (D1 or Postgres) — so leads survive,
- sends the notification via a transactional provider (Resend/Postmark),
- and keeps the same form field names so the markup barely changes.

That removes limitations 1–4 in one move. Only `FORM_ENDPOINT` in
`src/config.ts` needs to change on the front end.

## Changing the destination address

Edit `FORM_ENDPOINT` in `src/config.ts`. A new address must complete
FormSubmit's one-time activation: the first submission to a new address
triggers a confirmation email containing an activation link, and submissions
only start flowing after that link is opened.
