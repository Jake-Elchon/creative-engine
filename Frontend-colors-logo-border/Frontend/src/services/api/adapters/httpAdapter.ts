import { httpRequest, httpMediaRequest } from '@/services/api/client';
import { API_ENDPOINTS as routes } from '@/services/api/endpoints';
import { normalizeHandle } from '@/utils/url';
import type { AuthSession, OtpLoginPayload, OtpRequestPayload, OtpRequestResponse, OtpVerifyPayload, SessionTokens } from '@/types/auth';
import type {
  ArtistSummary, CheckoutTransaction, CreatedProduct, DiscoveryArtistsResponse, PriceReplacement,
  ProductCreateRequest, ProductPricesResponse, SplitCreateRequest, SplitCreateResponse,
  SplitDecision, SplitInvitationDetail, StorefrontCreateRequest, StorefrontDetail, StorefrontUpdateRequest, StudioInventory,
} from '@/types/models';
import type {
  CheckoutInitiateParams, DiscoverArtistsParams, GetStorefrontParams, GetStudioInventoryParams, IApiAdapter, MediaOptions,
  VerifiedCollaboratorSession,
} from './types';

export class HttpApiAdapter implements IApiAdapter {
  readonly isMock = false;

  requestOtp(body: OtpRequestPayload) {
    return httpRequest<OtpRequestResponse>(routes.AUTH_OTP_REQUEST, { method: 'POST', body, noStore: true, omitAuth: true });
  }

  verifyOtp(body: OtpVerifyPayload) {
    return httpRequest<AuthSession>(routes.AUTH_OTP_VERIFY, { method: 'POST', body, noStore: true, omitAuth: true });
  }

  login(body: OtpLoginPayload) {
    return httpRequest<AuthSession>(routes.AUTH_LOGIN, { method: 'POST', body, noStore: true, omitAuth: true });
  }

  refreshSession(refreshToken: string) {
    return httpRequest<SessionTokens>(routes.AUTH_REFRESH, {
      method: 'POST', body: { refreshToken }, noStore: true, omitAuth: true,
    });
  }

  discoverArtists({ q, cursor, limit, signal }: DiscoverArtistsParams = {}) {
    return httpRequest<DiscoveryArtistsResponse>(routes.ARTISTS_DISCOVERY, {
      query: { q, cursor, limit }, signal, omitAuth: true,
    });
  }

  getPublicStorefront({ handle, cursor, limit, displayCurrency, noStore, signal }: GetStorefrontParams) {
    return httpRequest<StorefrontDetail>(routes.STOREFRONT_PUBLIC(normalizeHandle(handle)), {
      query: { cursor, limit, displayCurrency }, signal, noStore, omitAuth: true,
    });
  }

  createStorefront(body: StorefrontCreateRequest) {
    return httpRequest<ArtistSummary>(routes.STOREFRONTS_CREATE, { method: 'POST', body });
  }

  updateStorefront(id: string, body: StorefrontUpdateRequest) {
    return httpRequest<ArtistSummary>(routes.STOREFRONTS_UPDATE(id), { method: 'PATCH', body });
  }

  getStudioInventory({ cursor, limit, productId, signal }: GetStudioInventoryParams = {}) {
    return httpRequest<StudioInventory>(routes.STUDIO_INVENTORY, {
      query: { cursor, limit, productId }, signal, noStore: true,
    });
  }

  createProduct(storefrontId: string, { typeCode, description, videoFile, audioFile, videoPreviewFile }: ProductCreateRequest) {
    let body: FormData | { typeCode: string; description?: string } = { typeCode, description };
    if (videoFile || audioFile || videoPreviewFile) {
      body = new FormData();
      body.append('typeCode', typeCode);
      if (description !== undefined) body.append('description', description);
      if (videoFile) body.append('videoFile', videoFile);
      if (videoPreviewFile) body.append('videoPreviewFile', videoPreviewFile);
      if (audioFile) body.append('audioFile', audioFile);
    }
    return httpRequest<CreatedProduct>(routes.STOREFRONT_PRODUCTS_CREATE(storefrontId), {
      method: 'POST', body, timeoutMs: 120_000,
    });
  }

  replacePrices(productId: string, body: PriceReplacement) {
    return httpRequest<ProductPricesResponse>(routes.PRODUCT_PRICES_PUT(productId), { method: 'PUT', body });
  }

  getProductMedia(productId: string, kind: 'audio' | 'video', { range, signal }: MediaOptions = {}) {
    return httpMediaRequest(routes.PRODUCT_MEDIA(productId, kind), {
      headers: range ? { Range: range } : undefined, signal,
      omitAuth: kind === 'audio', noStore: kind === 'video', timeoutMs: 60_000,
    });
  }

  getActiveSplit(productId: string, signal?: AbortSignal) {
    return httpRequest<SplitCreateResponse | null>(routes.PRODUCT_SPLITS(productId), { signal, noStore: true });
  }

  createSplit(productId: string, body: SplitCreateRequest, idempotencyKey: string, expectedSplitId?: string | null) {
    const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
    if (expectedSplitId === null) headers['If-None-Match'] = '*';
    if (expectedSplitId) headers['If-Match'] = `"${expectedSplitId}"`;
    return httpRequest<SplitCreateResponse>(routes.PRODUCT_SPLITS(productId), {
      method: 'POST', body, headers, noStore: true,
    });
  }

  initiateCheckout({ request, idempotencyKey }: CheckoutInitiateParams) {
    return httpRequest<CheckoutTransaction>(routes.CHECKOUT_INITIATE, {
      method: 'POST', body: request, headers: { 'Idempotency-Key': idempotencyKey }, noStore: true,
    });
  }

  getCheckoutStatus(id: string, guestSessionToken?: string, signal?: AbortSignal) {
    return httpRequest<CheckoutTransaction>(routes.CHECKOUT_STATUS(id), {
      headers: guestSessionToken ? { 'X-Checkout-Token': guestSessionToken } : undefined,
      signal, noStore: true, omitAuth: Boolean(guestSessionToken),
    });
  }

  getSplitInvitation(id: string, inviteToken: string, signal?: AbortSignal) {
    return httpRequest<SplitInvitationDetail>(routes.SPLIT_INVITE_DECISION(id), {
      headers: { 'X-Invite-Token': inviteToken }, signal, noStore: true, omitAuth: true,
    });
  }

  respondToSplitInvitation(id: string, inviteToken: string, decision: SplitDecision, session: VerifiedCollaboratorSession, signal?: AbortSignal) {
    return httpRequest<SplitInvitationDetail>(routes.SPLIT_INVITE_DECISION(id), {
      method: 'POST', body: { decision }, signal, noStore: true, omitAuth: true,
      headers: { 'X-Invite-Token': inviteToken, Authorization: `Bearer ${session.accessToken}` },
    });
  }
}
