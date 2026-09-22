# Stack and tool evaluation

Decided 2026-09-22, at Gate 2, before any application code. Each choice names what it was
chosen over and why. The governing constraint is roughly three days of build time, solo,
on free tiers — so "boring and already known" beats "better in principle" nearly
everywhere below.

---

## Database — **Postgres**

**Over:** SQLite, MySQL, MongoDB.

**Why:** decided by the spike, not by preference. The booking guarantee in
`discovery/spike-result.md` is implemented as a Postgres exclusion constraint
(`EXCLUDE USING gist (spot_id WITH =, window_at WITH &&)` plus `btree_gist`). SQLite has no
exclusion constraints, so the same guarantee would have to move into application code as a
lock-and-retry — more code, easy to get subtly wrong, and untestable by hand. MySQL has no
equivalent either. Mongo is the wrong shape entirely for a relational booking problem.

**Cost:** a real database to host rather than a file. Accepted.

## Host for the database — **Neon** (free tier)

**Over:** Supabase, Railway, local-only.

**Why:** both Neon and Supabase are on the programme's approved free-tier list and both
support `btree_gist`. Neon is chosen for being *just Postgres* — Supabase brings auth,
storage and realtime that this project does not use, and unused surface is still surface
to configure. Cold starts on Neon's free tier are a known cost and are budgeted in
`design/nfr.md`.

**Verification owed:** the spike ran against local Postgres 18. Confirming `btree_gist` on
the hosted instance is a phase 3 task, not an assumption.

## Application — **Next.js (App Router) on Node**

**Over:** separate React SPA + Express API, Remix, SvelteKit, plain Express + templates.

**Why:** one deployable, one language, one repo, server-side data fetching without a
separate API layer to design, and route handlers where an API contract is genuinely needed.
A split SPA/API doubles the deploy and CORS surface for no benefit at this size. Remix and
SvelteKit are defensible; Next is chosen because it is the one I will not lose hours to.

**Cost:** more framework than a seven-screen app strictly needs.

## Hosting — **Vercel** (free tier)

**Over:** Netlify, Render, Fly.io, Cloudflare Pages.

**Why:** on the approved list, first-class for Next.js, environment variables in the host's
settings rather than the repo (required by the programme's hosting rule), and a live URL a
judge can open without my laptop. Render and Fly are fine and cost more setup time.

## Maps — **Leaflet + OpenStreetMap tiles**

**Over:** Google Maps, Mapbox.

**Why:** no API key, no billing account, no credit card, no key to leak in a public repo.
Google Maps and Mapbox are both better products and both require a billing relationship;
on a free-tier-only build that is a hard stop, not a preference. OSM tiles are adequate for
showing a handful of pins.

**Cost:** no autocomplete geocoding — which is partly why areas are a fixed list rather
than free-text search. A constraint turned into a scope decision.

## Payments — **simulated, clearly labelled**

**Over:** Razorpay test mode, Stripe test mode.

**Why:** real money needs KYC, a settlement account and a refund policy, none of which
exist. Razorpay *test* mode was the original plan and was cut at Gate 2 — it adds webhook
verification and a gateway round-trip to the critical path for a flow that still cannot
take a rupee. The seam is modelled honestly instead: amounts are integer paise end to end,
a `payments` row is created and transitions state, and the UI says plainly that no money
moves.

**Cost:** the demo cannot claim a working checkout. Stated rather than implied.

## Tests — **Vitest + Playwright**

**Over:** Jest, Cypress.

**Why:** Vitest for unit and contract tests; Playwright for the one end-to-end run through
the real flow, which is what the exit condition for phase 6 requires ("no mocks anywhere in
the path"). Both already on this machine.

## Money — **integer paise, always**

Not a library choice but a rule, recorded here because it is the kind of thing that is
cheap now and expensive later. Every amount is an integer in paise in the database, in the
API and in application logic. Formatting to `₹` happens once, at the edge, at render time.
No floats anywhere near money.

## Language — **TypeScript**, strict

**Over:** JavaScript.

**Why:** the booking window logic has enough range-and-timezone edges that types earn their
keep, and the test strategy leans on contract tests where shared types remove a class of
error outright.

---

## Rejected wholesale

| Considered | Rejected because |
|---|---|
| Auth provider (Clerk / Auth0 / NextAuth) | v1 has no accounts — see `plan/scope.md`. Adding auth would be scope, not safety. |
| ORM (Prisma / Drizzle) | The exclusion constraint and range types are the core of the schema, and both are easiest to express — and to *read* — in plain SQL. An ORM would abstract exactly the part that carries the guarantee. Using `pg` with hand-written SQL and migrations. |
| Docker Compose for local dev | Not available on this machine, and a local Postgres already runs. Would only add a prerequisite to the fresh-clone test, which Gate 6 grades. |
| A component library (MUI / Chakra) | Seven screens. Hand-rolled CSS with tokens is smaller and faster than learning a library's opinions. |
