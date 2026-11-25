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
documented below. Ledger allocation is outside
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
| `POST /webhooks/fapshi` | Fapshi's `x-wh-secret` header and JSON notification | 200 acknowledgment after checking Fapshi's API for a matching payment |
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
   products with a complete active split or no active split. Unpriced products
   have an empty `prices` array. An XAF price enables checkout and any audio
   preview for products in the listing. The selected currency falls back to
   XAF per product.
2. Checkout serializes retries by key and locks the product before reading the
   price and active split. It checks the displayed XAF amount against the live
   price and saves the pending purchase, line item, and frozen beneficiary
   shares together before dispatching the Fapshi prompt. With no split, the
   creator receives 10,000 basis points.
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
  The API serves audio previews and limits video access to the storefront owner.
- For local operator routing, configure `CIMFEST_MTN_PREFIXES` and
  `CIMFEST_ORANGE_PREFIXES` with verified, comma-separated three-digit
  subscriber prefixes. If the prefix appears in both lists or neither, the
  caller must choose `mtn` or `orange` explicitly. A pending checkout prevents
  split replacement until its payment outcome is known.
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

### Fapshi sandbox checkout

Fill `FAPSHI_API_USER` and `FAPSHI_API_KEY` in `.env` with the sandbox
collection service credentials from the dashboard. Set the same
`FAPSHI_WEBHOOK_SECRET` in the app and on that service. For callback delivery,
configure the service with an HTTPS URL that reaches `/api/v1/webhooks/fapshi`.
The buyer's checkout status route can also reconcile payments during localhost
testing.

- Direct Pay requires at least 100 XAF. The API sends the Cameroonian phone
  without `+237` and passes the selected operator to Fapshi.
- CIMFEST commits one provider attempt per checkout, then sends Direct Pay once.
  Both Fapshi references carry the checkout UUID so a lost response can be
  recovered with the provider's transaction lookup. Retrying the same checkout
  key replays its initial response. An ambiguous dispatch stays pending while
  reads reconcile it. An empty lookup requires manual review before creating a
  new attempt, since Fapshi does not guarantee idempotent dispatch.
- A valid webhook is a notification to confirm status against Fapshi's
  authenticated API. The handler checks the provider reference, amount, and
  operator before recording a terminal state. The buyer status route also
  performs a rate-limited status check for pending payments.
- `SUCCESS` indicates verified collection. `confirmedAt` stays null until
  ledger allocation, which is outside this scope. The integration contacts
  the sandbox host only. Live Direct Pay is subject to Fapshi's approval and
  availability restrictions.

For the demo, send an MTN checkout with `+237670000000` and a fresh
`Idempotency-Key`, record the 202 response, replay with that same key, then
read the status URL with the original buyer credential. For a guest, use
`X-Checkout-Token` from the initiation response. With an HTTPS webhook
configured, check the callback acknowledgment and the resulting final state.
Repeat with `+237670000001` and a fresh key for the documented failed-payment
scenario. See [Direct Pay](https://docs.fapshi.com/en/api-reference/endpoint/direct-pay),
[webhooks](https://docs.fapshi.com/en/api-reference/endpoint/webhook), and
[sandbox numbers](https://docs.fapshi.com/en/api-reference/preliminary-knowledge/environment).

## Registration, login, artist discovery and catalog writes

The [Word API design](../documentation/KamerPay_Studio_API_Design%20-%20Create%20Account%20and%20Log%20In.docx)
includes the Create account and Log in page states, endpoint errors and shared home response.

| Method and path under `/api/v1` | Inputs | Result |
| --- | --- | --- |
| `POST /auth/otp/request` | Cameroonian `phone` and `email` | 202 with `data.code`, `data.expiresAt` and `data.nextAction` (`register` or `login`). |
| `POST /auth/otp/verify` | `phone`, six-digit string `code`, `fullName` and `preferredLang` (`en` or `fr`). Optional `email` must match the OTP request. | 200 with a session, profile and home seed for a new account. A matching existing account returns 409 `LOGIN_REQUIRED`. |
| `POST /auth/login` | `phone` and six-digit string `code`. Optional `email` must match the OTP request. | 200 with a session, the existing database profile and the same home seed as registration. |
| `POST /auth/refresh` | `refreshToken` from registration, login or a previous refresh | 200 with a new access and refresh token pair. |
| `GET /artists` | Optional `q`, `limit` (1–50, default 20), and `cursor` | 200 with `items` and `nextCursor`. Search matches the handle or display name by case-insensitive substring. |
| `POST /storefronts/{storefrontId}/products` | Owner's Bearer token, `typeCode`, optional `description`, and multipart files `videoFile` and `audioFile` | 201 with the product ID, type, and URLs for uploaded media. Media-free requests also accept JSON. |
| `GET /products/{productId}/media/video` | Owner's Bearer token and optional `Range` header | The uploaded video. |
| `GET /products/{productId}/media/audio` | Optional `Range` header | The uploaded audio for a public product with an XAF price. |
| `PUT /products/{productId}/prices` | Owner's Bearer token, `local` with XAF, optional `diaspora` with EUR or USD | 200 with the saved price set. Omit `diaspora` or send `null` to clear it. |

To enable OTP on a private localhost backend, apply the migrations, set
`CIMFEST_LOCAL_OTP_ENABLED=true` in `.env`, and start FastAPI with one worker.
The HTTP response gives the caller the code directly, so use this flow with
development accounts only. The in-memory cache holds up to 1,024 phone numbers
and clears on reload. The limit of three code requests per phone per ten minutes
is paused until 25 January 2027 at 01:00 Douala time (00:00 UTC). Each code
expires in five minutes and allows up to five failed guesses. A new
request replaces the previous code. Successful verification consumes it.
A 429 includes `Retry-After`.

First registration saves the email from the code request. Returning users
request a code with their registered phone and email. When `nextAction` is
`login`, prompt for the OTP and submit it to `/auth/login`. If verification
returns `LOGIN_REQUIRED`, switch to login and request a fresh code. Access
tokens expire after one hour and refresh tokens expire after 30 days. Refresh
rotates both tokens. The catalog seed runs after the session commit with a
250 ms statement timeout. The app can retry `GET /artists?limit=6` if
`home.status` is `unavailable`.

Artist discovery includes every storefront with its public handle, including
storefronts that are still setting up a catalog. A cursor continues a specific
search in normalized display-name and UUID order. Start a new page sequence
when `q` changes. The database indexes the sort order and both search fields.

For media uploads in Thunder Client, select **Body → Form**. Add `typeCode`
and `description` as text fields. A `video` or `release` product requires
at least one file. Send `videoFile`, `audioFile`, or both. The client generates
the multipart boundary. An `ebook`, `tip`, or `shoutout` can also be created
with metadata only.

Video accepts MP4, WebM, and MOV up to 32 MiB. Audio accepts MP3, WAV, Ogg
(including Opus), FLAC, and M4A up to 8 MiB. The API checks the file format
and size before saving the bytes in PostgreSQL in the product transaction.
A public product's `previewUrl` serves the entire uploaded audio file. Upload
a clip if the preview should contain only an excerpt. The audio URL becomes
public once the product has an XAF price and any active split is complete.

The migration preserves the previous storage references for existing products.
Populating the new media table for those products requires the original files.

Price amounts are positive integers up to 2,147,483,647. Use francs for XAF
and cents for EUR or USD. A full price-set replacement preserves IDs for
retained currencies and takes the same product lock as checkout, so checkout
sees one complete price set. Checkout charges XAF.

### Manual test sequence

1. In `/docs`, submit a new `phone` and `email` to `POST /api/v1/auth/otp/request`.
   Check for `nextAction: register` and copy `data.code`.
2. Submit the code, same phone, name and language to `POST /api/v1/auth/otp/verify`.
   Request a fresh code with the same phone and email and check for `nextAction: login`.
   Post the new code and phone to `POST /api/v1/auth/login` and compare the returned profile.
3. Use the access token as `Authorization: Bearer <token>` on creator routes.
   Create a storefront and a `tip` product to test pricing. For a media product,
   attach the file directly in the multipart request.
4. Set the price to XAF 1000 and EUR 300, request the public storefront with
   `displayCurrency=EUR`, then replace the prices with XAF only and check that
   display falls back to XAF. Use a second creator's token to check that the
   product and price writes return 404 for a non-owner.
5. Create several storefronts and compare `GET /artists?limit=6` with
   `GET /artists?q=<substring>&limit=6`. Follow `nextCursor` with the same
   query and check for duplicated or missing cards. For timing, repeat calls
   with a warm server and record the dataset size.


## Creator Studio inventory, video previews and split status

These additions extend API v1 in the Studio design document. Existing installs
keep the applied `20261125040000_add_storefront_images_and_video_previews.sql`
migration. Profile-picture routes and response fields have been retired. The
historical table and any existing image bytes remain private in PostgreSQL.

### Read creator inventory

`GET /api/v1/me/studio` requires a Bearer access token. The server derives the
creator from the session and filters both storefronts and products by that
owner. Responses use the standard `data` / `requestId` envelope and
`Cache-Control: no-store`. The fields in `data` are:

- `storefronts`: all storefronts for this creator, in handle order. Each has
  `storefrontId`, `handle`, `displayName`, nullable `bio` and `storefrontUrl`.
- `products`: this page of owned products. Each has `productId`, `storefrontId`,
  nullable `description`, `type` (`id`, `code`, `name`), a `prices` array
  (`priceId`, `currencyCode`, `amountMinor`), and nullable `videoUrl`,
  `audioUrl`, and `videoPreviewUrl`. A media URL indicates an uploaded file.
  Media endpoints still apply their own access rules.
- `nextCursor`: the opaque continuation token, or null. Products are ordered by
  product UUID. Repeat the request with `cursor` to advance. `limit` defaults
  to 20, with an allowed range of 1–50.

For an exact product link, pass `productId` instead of `cursor`. This returns
one product and the same owned storefront list. A missing or other creator's
product returns 404 `PRODUCT_NOT_FOUND`. Invalid query values return 400
`INVALID_QUERY`. Missing or invalid credentials return 401 `UNAUTHENTICATED`.

### Public previews

Product creation also accepts optional multipart `videoPreviewFile` up to
16 MiB in MP4, WebM, or MOV. The existing required-file rules still apply.
`GET /api/v1/products/{productId}/media/video-preview` serves the separate
preview after XAF pricing and completion of any active split. It supports
single byte ranges. The existing `/media/video` remains owner-only.

### Agreement lifecycle

`GET /api/v1/products/{productId}/splits` requires an owner Bearer token and
returns the active sheet and its current statuses (`PENDING`, `ACCEPTED`,
`REJECTED`, `EXPIRED`) or `data: null`. Unowned products return 404.

The existing split POST saves the allocation, creates invitations, and queues
pending recipients in one idempotent operation. Send `If-None-Match: *` when
creating the first sheet, or `If-Match: "<splitId>"` when replacing the reviewed
active version. If another submission changed the active version, the server
returns 412 `SPLIT_VERSION_CHANGED`. The owner should reload and review the
current state before retrying. Exact idempotent replays are checked first.
Calls without either precondition retain the legacy behavior.

Invitation delivery requires an outbox worker. The existing fragment-token
invite URL and Supabase-confirmed phone requirements remain in effect.

### Public artist directory

`GET /api/v1/artists` lists every storefront, including storefronts without
products. The storefront is the current public artist record. An account with
no storefront has no public handle or artist record. The public directory
provides no popularity ranking.
