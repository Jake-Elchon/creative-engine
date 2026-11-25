# ZIBI frontend

This package is the React and TypeScript frontend for KamerPay Studio API v1. The tooling supports Node.js 22.18 or Node.js 24.11 and later.

```sh
npm ci
npm run dev
npm run typecheck
npm run lint
npm test
npm run build
```

## API environments

Production builds always use the HTTP adapter. Set `VITE_API_BASE_URL` to
the deployment API base and `VITE_PUBLIC_DOMAIN` to the public site origin.
The host must serve `index.html` for client routes such as `/@handle`,
`/invites/:inviteId`, `/artists/:slug`, and `/studio/*`. Hosted deployments also need a same-origin
API proxy or an API with CORS configured for the site origin.

Vite development uses the real localhost API by default. Start KamerPay on
`127.0.0.1:8000` with `CIMFEST_LOCAL_OTP_ENABLED=true`. Vite proxies `/api/v1`
to that backend for loopback clients. Override `ZIBI_LOCAL_API_PROXY` in `.env.local` if your
backend uses another loopback port.

Open `/create-account` or `/login` on localhost. Submit a phone number and email, then follow the
form selected by the API's `nextAction` value. Returning users use the code-only
login endpoint. First-time users also enter their name and preferred language.
The local form shows the response-delivered test code. Tokens stay in memory
and rotate through the documented refresh endpoint. Signing out clears the
local session, and a page reload requires sign-in again. API v1 does not
document a hosted sign-in or server logout route.

Use `VITE_USE_MOCK_API=true` in `.env.local` only for an explicit UI demo.
Its catalog and payment states are simulated. Split submission and verified
decisions need the real service.

## Studio and API limits

Studio reads its storefronts and paginated owner inventory from
`GET /api/v1/me/studio`. The server derives ownership from the Bearer session.
The selected storefront handle is remembered for the account on this browser.

The invitation landing page reads the link fragment. Decision submission uses
`CollaboratorIdentityContext` as the integration point for an approved
Supabase client with a confirmed phone. That integration is currently
unconfigured. The local test account cannot submit an invitation decision.

Checkout takes XAF only. The status view reports Fapshi collection. Pending
attempts can be reopened while the storefront page stays mounted. The guest
credential and payment contact details are kept in memory.

## Editorial artist content

The supplied editorial catalog lives in `src/features/discovery/curatedArtists.ts`.
It powers Upcoming Artists, Popular Artists, and the genre-grouped Explore All
Artists. The source filename and web asset are recorded together for each artist.
The supplied JPEGs live under `public/assets/artists/`; the two original archives
remain the source copies. Portraits use centered or upper framing, while cover
art and posters are displayed in full.

Curated profile links use `/artists/:slug`. The registered storefront directory
continues to use the paginated `GET /api/v1/artists` endpoint and real
`/@handle` storefront links. Explore uses the existing `?q=` parameter to
search both collections. Curated slugs identify editorial profiles; do not
assign them as storefront handles. Only add a storefront link when the
association is confirmed. No database seed or artist-account creation is
required.
