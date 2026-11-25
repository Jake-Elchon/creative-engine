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
`/invites/:inviteId` and `/studio/*`. Hosted deployments also need a same-origin
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

## API v1 limits

Studio can recover a storefront by known handle and use its ID for a write.
Ownership is enforced by the API. The product workspace uses IDs created in the
current Studio session or IDs entered by the creator, because API v1 provides no
private owner inventory.

The invitation landing page reads the link fragment. Decision submission uses
`CollaboratorIdentityContext` as the integration point for an approved
Supabase client with a confirmed phone. That integration is currently
unconfigured. The local test account cannot submit an invitation decision.

Checkout takes XAF only. The status view reports Fapshi collection. Pending
attempts can be reopened while the storefront page stays mounted. The guest
credential and payment contact details are kept in memory.
