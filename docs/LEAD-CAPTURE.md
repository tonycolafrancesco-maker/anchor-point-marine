# Lead capture — how it works and what it costs us

## The path a lead takes

1. Owner fills the form at `/contact`.
2. Browser POSTs directly to `https://formsubmit.co/wheresjoe@gmail.com`.
3. FormSubmit emails the submission to that address within seconds.
4. Browser is redirected to `/thank-you`.

No database, no server, no cron. The lead lands in a human inbox or it does not
land at all — which is the failure mode we want, because a silent failure here
is a lost client.

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
