import type { AuthSession, AuthenticatedUser, OtpLoginPayload, OtpRequestPayload, OtpRequestResponse, OtpVerifyPayload } from '@/types/auth';
import { ApiClientError } from '@/types/api';
import type {
  ArtistSummary, CheckoutTransaction, CreatedProduct, PriceReplacement, ProductCreateRequest,
  ProductTypeCode, StorefrontProduct, StorefrontCreateRequest, StorefrontUpdateRequest, SupportedCurrency,
} from '@/types/models';
import type { CheckoutInitiateParams, DiscoverArtistsParams, GetStorefrontParams, IApiAdapter } from './types';
import { MOCK_ARTISTS } from '@/services/mock/artists.mock';
import { MOCK_PRODUCTS_BY_HANDLE } from '@/services/mock/products.mock';
import { MOCK_SPLIT_INVITATIONS } from '@/services/mock/splits.mock';
import { isValidEmail, isValidCameroonPhone, isValidFullName } from '@/utils/validation';
import { normalizeHandle } from '@/utils/url';

const typeCodes = { MUSIC: 'release', VIDEO: 'video', EBOOK: 'ebook', TIP: 'tip', SHOUTOUT: 'shoutout' } as const;
const typeNames: Record<ProductTypeCode, string> = {
  release: 'Music release', video: 'Video', ebook: 'E-book', tip: 'Tip', shoutout: 'Shoutout',
};

function error(status: number, code: string, kind: ApiClientError['kind']) {
  return new ApiClientError({ status, code, kind, message: code });
}

function paginate<T>(items: T[], cursor?: string, limit = 20) {
  const start = Number(cursor) || 0;
  const end = start + limit;
  return { items: items.slice(start, end), nextCursor: end < items.length ? String(end) : null };
}

function demoType(code: ProductTypeCode) {
  return { id: `demo-${code}`, code, name: typeNames[code] };
}

export class MockApiAdapter implements IApiAdapter {
  readonly isMock = true;
  private codes = new Map<string, { email: string; code: string; expiresAt: string }>();
  private profiles = new Map<string, AuthenticatedUser>();
  private refresh = new Set<string>();
  private storefronts: ArtistSummary[] = [...MOCK_ARTISTS];
  private demoProducts = new Map<string, CreatedProduct>();
  private demoMedia = new Map<string, File>();
  private prices = new Map<string, StorefrontProduct['prices']>();
  private transactions = new Map<string, { tx: CheckoutTransaction; polls: number }>();
  private attempts = new Map<string, { fingerprint: string; tx: CheckoutTransaction }>();

  private issueTokens() {
    const refreshToken = crypto.randomUUID();
    this.refresh.add(refreshToken);
    return { accessToken: crypto.randomUUID(), refreshToken };
  }

  async requestOtp({ phone, email }: OtpRequestPayload): Promise<OtpRequestResponse> {
    if (!isValidCameroonPhone(phone) || !isValidEmail(email)) throw error(400, 'INVALID_INPUT', 'VALIDATION_ERROR');
    const issued = { email, code: '012345', expiresAt: new Date(Date.now() + 300_000).toISOString() };
    this.codes.set(phone, issued);
    const profile = this.profiles.get(phone);
    return {
      code: issued.code,
      expiresAt: issued.expiresAt,
      nextAction: profile?.email?.toLowerCase() === email.toLowerCase() ? 'login' : 'register',
    };
  }

  private consumeCode({ phone, code, email }: OtpLoginPayload) {
    const issued = this.codes.get(phone);
    if (!issued || issued.code !== code || (email && email.toLowerCase() !== issued.email.toLowerCase()) ||
        Date.parse(issued.expiresAt) <= Date.now()) {
      throw error(422, 'INVALID_OR_EXPIRED_OTP', 'UNPROCESSABLE_ENTITY');
    }
    this.codes.delete(phone);
    return issued.email;
  }

  private async startSession(user: AuthenticatedUser): Promise<AuthSession> {
    const seed = await this.discoverArtists({ limit: 6 });
    return { ...this.issueTokens(), user, home: { status: 'ready', artists: seed.items, nextCursor: seed.nextCursor }, isMockDemo: true };
  }

  async verifyOtp(payload: OtpVerifyPayload): Promise<AuthSession> {
    const { phone, fullName, preferredLang } = payload;
    const email = this.consumeCode(payload);
    const profile = this.profiles.get(phone);
    if (profile) {
      if (profile.email?.toLowerCase() !== email.toLowerCase()) throw error(422, 'INVALID_OR_EXPIRED_OTP', 'UNPROCESSABLE_ENTITY');
      throw error(409, 'LOGIN_REQUIRED', 'CONFLICT');
    }
    if (!isValidFullName(fullName) || !preferredLang) throw error(400, 'INVALID_INPUT', 'VALIDATION_ERROR');
    const user = { id: crypto.randomUUID(), fullName, preferredLang, email, phone, registeredAt: new Date().toISOString() };
    this.profiles.set(phone, user);
    return this.startSession(user);
  }

  async login(payload: OtpLoginPayload): Promise<AuthSession> {
    const email = this.consumeCode(payload);
    const user = this.profiles.get(payload.phone);
    if (!user || user.email?.toLowerCase() !== email.toLowerCase()) {
      throw error(422, 'INVALID_OR_EXPIRED_OTP', 'UNPROCESSABLE_ENTITY');
    }
    return this.startSession(user);
  }

  async refreshSession(refreshToken: string) {
    if (!this.refresh.delete(refreshToken)) throw error(401, 'INVALID_TOKEN', 'UNAUTHORIZED');
    return this.issueTokens();
  }

  async discoverArtists({ limit, cursor, q, signal }: DiscoverArtistsParams = {}) {
    signal?.throwIfAborted();
    const needle = q?.trim().toLowerCase() || '';
    const artists = this.storefronts
      .filter((artist) => artist.displayName.toLowerCase().includes(needle) || artist.handle.includes(needle))
      .sort((a, b) => a.displayName.toLowerCase().localeCompare(b.displayName.toLowerCase()) || a.storefrontId.localeCompare(b.storefrontId))
      .map(({ storefrontId, handle, displayName, bio, storefrontUrl }) => ({
        storefrontId, handle, displayName, bio,
        storefrontUrl: typeof window === 'undefined' ? storefrontUrl : new URL(storefrontUrl).pathname,
      }));
    return paginate(artists, cursor, limit);
  }

  private publicProducts(handle: string, id: string, currency: SupportedCurrency): StorefrontProduct[] {
    const fixtures = (MOCK_PRODUCTS_BY_HANDLE[handle] ?? []).filter((product) => product.splitsComplete)
      .map((product) => ({
        productId: product.productId, description: product.description, type: demoType(typeCodes[product.type]),
        prices: this.prices.get(product.productId) ?? [
          { priceId: `${product.productId}-XAF`, currencyCode: 'XAF' as const, amountMinor: product.xafPrice },
          ...((product.displayPrices ?? []).map((price) => ({
            priceId: `${product.productId}-${price.currency}`, currencyCode: price.currency, amountMinor: Math.round(price.amount * 100),
          }))),
        ],
      }));
    const created = [...this.demoProducts.values()].filter((p) => p.storefrontId === id).map((p) => ({
      productId: p.productId, description: p.description, type: p.type, prices: this.prices.get(p.productId) ?? [],
    }));
    return [...fixtures, ...created].sort((a, b) => a.productId.localeCompare(b.productId)).map((product) => ({
      ...product,
      previewUrl: null,
      displayCurrency: product.prices.some((price) => price.currencyCode === currency) ? currency : 'XAF',
      checkoutAvailable: product.prices.some((price) => price.currencyCode === 'XAF'),
    }));
  }

  async getPublicStorefront({ handle, limit, cursor, signal, displayCurrency = 'XAF' }: GetStorefrontParams) {
    signal?.throwIfAborted();
    const storefront = this.storefronts.find((artist) => artist.handle === normalizeHandle(handle).toLowerCase());
    if (!storefront) throw error(404, 'STOREFRONT_NOT_FOUND', 'NOT_FOUND');
    const { items: products, nextCursor } = paginate(this.publicProducts(storefront.handle, storefront.storefrontId, displayCurrency), cursor, limit);
    return { storefront, products, nextCursor };
  }

  async createStorefront(request: StorefrontCreateRequest) {
    if (this.storefronts.some((item) => item.handle === request.handle)) throw error(409, 'HANDLE_TAKEN', 'CONFLICT');
    const storefront = {
      storefrontId: crypto.randomUUID(), handle: request.handle, displayName: request.displayName,
      bio: request.bio ?? null, storefrontUrl: new URL(`/@${request.handle}`, window.location.origin).href,
    };
    this.storefronts.push(storefront);
    return storefront;
  }

  async updateStorefront(id: string, request: StorefrontUpdateRequest) {
    const index = this.storefronts.findIndex((storefront) => storefront.storefrontId === id);
    const previous = this.storefronts[index];
    if (!previous) throw error(404, 'STOREFRONT_NOT_FOUND', 'NOT_FOUND');
    const updated = { ...previous, ...request };
    this.storefronts[index] = updated;
    return updated;
  }

  async uploadProfileImage(): ReturnType<IApiAdapter['uploadProfileImage']> {
    throw error(503, 'DEMO_UNAVAILABLE', 'SERVICE_UNAVAILABLE');
  }

  async removeProfileImage(): ReturnType<IApiAdapter['removeProfileImage']> {
    throw error(503, 'DEMO_UNAVAILABLE', 'SERVICE_UNAVAILABLE');
  }

  async getActiveSplit(): ReturnType<IApiAdapter['getActiveSplit']> {
    throw error(503, 'DEMO_UNAVAILABLE', 'SERVICE_UNAVAILABLE');
  }

  async createProduct(storefrontId: string, request: ProductCreateRequest) {
    if (!this.storefronts.some((item) => item.storefrontId === storefrontId)) throw error(404, 'STOREFRONT_NOT_FOUND', 'NOT_FOUND');
    if (request.videoPreviewFile) throw error(503, 'DEMO_UNAVAILABLE', 'SERVICE_UNAVAILABLE');
    const productId = crypto.randomUUID();
    if (request.videoFile) this.demoMedia.set(`${productId}/video`, request.videoFile);
    if (request.audioFile) this.demoMedia.set(`${productId}/audio`, request.audioFile);
    const product = {
      productId, storefrontId, type: demoType(request.typeCode), description: request.description ?? null,
      videoUrl: request.videoFile ? `/api/v1/products/${productId}/media/video` : null,
      audioUrl: request.audioFile ? `/api/v1/products/${productId}/media/audio` : null,
    };
    this.demoProducts.set(productId, product);
    return product;
  }

  async replacePrices(productId: string, { local, diaspora }: PriceReplacement) {
    const prior = this.prices.get(productId);
    const prices = (diaspora ? [local, diaspora] : [local]).map((price) => ({
      ...price, priceId: prior?.find((item) => item.currencyCode === price.currencyCode)?.priceId ?? crypto.randomUUID(),
    }));
    this.prices.set(productId, prices);
    return { productId, prices };
  }

  async getProductMedia(productId: string, kind: 'audio' | 'video') {
    const media = this.demoMedia.get(`${productId}/${kind}`);
    if (!media) throw error(404, 'MEDIA_NOT_FOUND', 'NOT_FOUND');
    return media;
  }

  async createSplit(): ReturnType<IApiAdapter['createSplit']> {
    throw error(503, 'INVITATION_UNAVAILABLE', 'SERVICE_UNAVAILABLE');
  }

  async initiateCheckout({ request, idempotencyKey }: CheckoutInitiateParams) {
    const fingerprint = JSON.stringify(request);
    const prior = this.attempts.get(idempotencyKey);
    if (prior) {
      if (prior.fingerprint !== fingerprint) throw error(409, 'IDEMPOTENCY_CONFLICT', 'CONFLICT');
      return prior.tx;
    }
    const tx: CheckoutTransaction = {
      transactionId: crypto.randomUUID(), currencyCode: 'XAF', amountMinor: request.expectedAmountMinor,
      createdAt: new Date().toISOString(), confirmedAt: null, isRegisteredBuyer: false, status: 'PENDING',
      rail: request.rail === 'orange' ? 'orange' : 'mtn', guestSessionToken: crypto.randomUUID(),
      guestSessionExpiresAt: new Date(Date.now() + 86_400_000).toISOString(), isMockDemo: true,
    };
    this.transactions.set(tx.transactionId, { tx, polls: 0 });
    this.attempts.set(idempotencyKey, { fingerprint, tx });
    return tx;
  }

  async getCheckoutStatus(id: string, guestSessionToken?: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    const entry = this.transactions.get(id);
    if (!entry) throw error(404, 'TRANSACTION_NOT_FOUND', 'NOT_FOUND');
    if (guestSessionToken !== entry.tx.guestSessionToken) throw error(401, 'UNAUTHENTICATED', 'UNAUTHORIZED');
    if (Date.parse(entry.tx.guestSessionExpiresAt ?? '') <= Date.now()) throw error(410, 'CHECKOUT_SESSION_EXPIRED', 'GONE');
    const { guestSessionToken: _token, guestSessionExpiresAt: _expiry, ...status } = entry.tx;
    return { ...status, status: ++entry.polls > 1 ? 'SUCCESS' as const : status.status };
  }

  async getSplitInvitation(id: string, inviteToken: string, signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (id === 'inv_expired_04' && inviteToken) throw error(410, 'INVITATION_EXPIRED', 'GONE');
    const invite = MOCK_SPLIT_INVITATIONS[id];
    if (!inviteToken || !invite) throw error(404, 'INVITATION_NOT_FOUND', 'NOT_FOUND');
    return invite;
  }

  async respondToSplitInvitation(): ReturnType<IApiAdapter['respondToSplitInvitation']> {
    throw error(401, 'UNAUTHENTICATED', 'UNAUTHORIZED');
  }
}
