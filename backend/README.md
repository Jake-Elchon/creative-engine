# CIMFEST backend

Run these PowerShell commands from the repository root with Docker Desktop running.

If the project-local CLI is missing, install [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and use `supabase` in place of the executable path.

```powershell
& ./.tools/bin/supabase.exe start
& ./.tools/bin/supabase.exe migration up
& ./.tools/bin/supabase.exe status -o env
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

On a fresh checkout, fill in `.env` using the local CLI status output. Map `API_URL` to `SUPABASE_URL` and `DB_URL` to `DATABASE_URL`. Use `PUBLISHABLE_KEY` and `SECRET_KEY` for the corresponding Supabase keys.

Install the Python dependencies and start FastAPI.

```powershell
py -m venv .venv
& ./.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
& ./.venv/Scripts/python.exe -m uvicorn backend.main:app --reload
```

The [database design](../documentation/ERD.md) describes the tables and relationships created by the migration.

- API docs at http://127.0.0.1:8000/docs
- API health at http://127.0.0.1:8000/health
- PostgreSQL health at http://127.0.0.1:8000/health/db
- Supabase Studio at http://127.0.0.1:54323

## Storefront, checkout and sheet invitations

The routes implement the C4 storefront, checkout and sheet invitation flows
using the API Design contracts. The collaborator decision routes complete
the invitation flow. Registration, discovery, products, and prices are
documented below. Payment confirmation and ledger allocation are outside
the C4 endpoint list.

Apply the migrations with the setup command above. Protected routes accept
Bearer tokens for Supabase users and local OTP profiles. Invitation decisions
require a Supabase user with a confirmed phone. Catalog fixtures need a product,
a product type, and an XAF price. Checkout
also needs an MTN or Orange payment method on the storefront creator's account.

| Method and path under `/api/v1` | Inputs | Result |
| --- | --- | --- |
| `POST /storefronts` | Bearer token, `handle`, `displayName`, optional `bio` | 201 with profile and public route in `Location` |
| `PATCH /storefronts/{storefrontId}` | Owner's Bearer token, `displayName` or `bio` | 200 with updated profile. `bio: null` clears the bio. |
| `GET /storefront/{handle}` | Optional `displayCurrency` (XAF, EUR, USD), `cursor`, and `limit` (1–50, default 20) | 200 with `storefront`, `products`, and `nextCursor` |
| `POST /checkout/initiate` | `Idempotency-Key`, optional Bearer token, `productId`, `buyerPhone`, `buyerEmail`, `expectedAmountMinor`, optional `rail` | 202 with pending transaction, status URL in `Location`, and a guest token and expiry for guests |
| `GET /checkout/{transactionId}` | Buyer's Bearer token or `X-Checkout-Token` for guests | 200 with the current recorded transaction status |
| `POST /products/{productId}/splits` | Owner's Bearer token, `Idempotency-Key`, `splits` entries with `phone` and `shareBps`, optional `groupId` | 201 with split version, completion flag, and invitation states |
| `GET /split-invitations/{inviteId}/decision` | `X-Invite-Token` | 200 with proposed share and current state |
| `POST /split-invitations/{inviteId}/decision` | `X-Invite-Token`, verified invitee's Bearer token, `decision` of `accept` or `reject` | 200 with the recorded decision |

Responses include `requestId` and either `data` or an `error` object with
`code` and `message`. Checkout and invitation responses use
`Cache-Control: no-store`. Use unpredictable idempotency keys, such as a
fresh UUID for each new operation. Retries with the same key and input replay
the original data and get a new request ID. Changed inputs return
`IDEMPOTENCY_CONFLICT`.

### Implementation steps

1. Storefront creation reserves the handle through the existing unique index.
   Updates apply only supplied fields and match the creator in the same SQL
   statement. The public read uses product IDs for cursor pagination, exposes
   preview URLs when configured, and includes only products with an XAF price
   and either a complete active split or no split. The selected currency falls
   back to XAF per product.
2. Checkout serializes retries by key and locks the product before reading the
   price and active split. It checks the displayed XAF amount against the live
   price and saves the pending purchase, line item, and frozen beneficiary
   shares together. With no split, the creator receives 10,000 basis points.
   Guest status access requires the token returned by initiation and expires
   after 24 hours. Signed-in status access is limited to the authenticated buyer.
3. Split creation validates Cameroonian phones and an exact total of 10,000
   basis points. It checks group founder status when a group is supplied and
   locks the product before checking for pending or successful sales. It
   supersedes the old version, accepts the creator's own share immediately,
   and saves pending invitations, delivery jobs, and replay data together.
4. Invitation reads validate the token hash and expiry. A decision also
   checks the caller's verified phone. It reacquires the invitation under
   the product lock and records the decision, beneficiary mapping, and sheet
   completion in one transaction. Repeating the same decision is safe.
   Superseded or expired invitations return 410.

### Configuration and integration boundaries

- Set `CIMFEST_TOKEN_SECRET` to a stable, randomly generated secret of at least
  32 bytes. The API derives purpose-specific tokens from random resource IDs
  and stores only token hashes. The same key is needed across API and worker
  instances. Changing it prevents regenerating previously issued guest tokens
  and undelivered invitation links. Set `CIMFEST_INVITATION_TTL_HOURS` from 1
  to 8760 hours (default 168).
- `CIMFEST_PUBLIC_URL` sets the storefront and invitation landing-page origin.
  Configure `CIMFEST_PREVIEW_BASE_URL` for public previews. Master file keys
  stay private.
- For local operator routing, configure `CIMFEST_MTN_PREFIXES` and
  `CIMFEST_ORANGE_PREFIXES` with verified, comma-separated three-digit
  subscriber prefixes. If the prefix appears in both lists or neither, the
  caller must choose `mtn` or `orange` explicitly. The payment provider
  adapter belongs after checkout commits. It should use the transaction UUID
  as its stable provider reference. Until a provider and confirmation flow
  are connected, checkouts stay pending and prevent split replacement.
- Invitation jobs are persisted and only become visible after commit. The
  future SMS or WhatsApp worker can join `invitation_delivery_jobs` to
  `split_invitations` and `split_sheets` and send only active, unexpired,
  pending invitations. It can derive the link using
  `opaque_token("invitation", invitation_id)` and the format
  `/invite/{inviteId}#token={token}`, then record `delivered_at` after delivery.
  The existing API queues jobs and requires a worker to send the messages.
- For preexisting split sheets, the migration selects one active version per
  product, preferring a completed sheet. It uses UUID order for ties because
  the baseline schema has no split creation timestamp.

## Registration, artist discovery and catalog writes

| Method and path under `/api/v1` | Inputs | Result |
| --- | --- | --- |
| `POST /auth/otp/request` | Cameroonian `phone` and `email` | 202 with `data.code` and `data.expiresAt`. |
| `POST /auth/otp/verify` | `phone` and the six-digit string `code`. First registration requires `fullName` and `preferredLang` (`en` or `fr`). If supplied, `email` must match the request. | 200 with local access and refresh tokens, the user profile, and `home` containing up to six artist cards. |
| `POST /auth/refresh` | `refreshToken` from local verification or a previous refresh | 200 with a new access and refresh token pair. |
| `GET /artists` | Optional `q`, `limit` (1–50, default 20), and `cursor` | 200 with `items` and `nextCursor`. Search matches the handle or display name by case-insensitive substring. |
| `POST /storefronts/{storefrontId}/products` | Owner's Bearer token, `typeCode`, optional `description`, `masterFileKey`, and `previewFileKey` | 201 with the product ID, storefront ID, description, and type. |
| `PUT /products/{productId}/prices` | Owner's Bearer token, `local` with XAF, optional `diaspora` with EUR or USD | 200 with the saved price set. Omit `diaspora` or send `null` to clear it. |

To enable OTP on a private localhost backend, apply the migrations, set
`CIMFEST_LOCAL_OTP_ENABLED=true` in `.env`, and start FastAPI with one worker.
The HTTP response gives the caller the code directly, so use this flow with
development accounts only. The in-memory cache holds up to 1,024 phone numbers
and clears on reload. Each phone can request three codes per ten minutes. Each
code expires in five minutes and allows up to five failed guesses. A new
request replaces the previous code. Successful verification consumes it.
A 429 includes `Retry-After`.

First registration saves the email from the code request. Returning users
request a code with their registered phone and email. Access tokens expire
after one hour and refresh tokens expire after 30 days. Refresh rotates both
tokens. The catalog seed runs after the profile commit with a 250 ms statement
timeout. The app can retry `GET /artists?limit=6` if `home.status` is `unavailable`.

Artist discovery includes every storefront with its public handle, including
storefronts that are still setting up a catalog. A cursor continues a specific
search in normalized display-name and UUID order. Start a new page sequence
when `q` changes. The database indexes the sort order and both search fields.

The product request takes a `typeCode` because the API Design lists types
without naming a type-selector field. Supported seed codes are `release`,
`video`, `ebook`, `tip`, and `shoutout`. Releases, videos, and e-books require
a master file. An asset key must already be approved for the owner and for
the role `master` or `preview` in `cimfest.catalog_assets`. Asset upload and
approval happen before calling this route. A product appears in the public
catalog after it has an XAF price and any active split is complete.

Price amounts are positive integers up to 2,147,483,647. Use francs for XAF
and cents for EUR or USD. A full price-set replacement preserves IDs for
retained currencies and takes the same product lock as checkout, so checkout
sees one complete price set. Checkout charges XAF.

### Manual test sequence

1. In `/docs`, submit `phone` and `email` to `POST /api/v1/auth/otp/request`.
   Copy `data.code` from the 202 response.
2. Submit the code with the same phone to `POST /api/v1/auth/otp/verify`, then
   use the returned access token as
   `Authorization: Bearer <token>` on creator routes. Create a storefront and
   start with a `tip` product to test catalog and pricing without media setup.
   For a media product, use an approved key from your upload workflow. For a
   Studio fixture, insert the existing object's key, creator UUID, kind, and
   approval timestamp in `cimfest.catalog_assets`.
3. Set the price to XAF 1000 and EUR 300, request the public storefront with
   `displayCurrency=EUR`, then replace the prices with XAF only and check that
   display falls back to XAF. Use a second creator's token to check that the
   product and price writes return 404 for a non-owner.
4. Create several storefronts and compare `GET /artists?limit=6` with
   `GET /artists?q=<substring>&limit=6`. Follow `nextCursor` with the same
   query and check for duplicated or missing cards. For timing, repeat calls
   with a warm server and record the dataset size.
