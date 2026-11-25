import type {
  CheckoutInitiateParams,
  DiscoverArtistsParams,
  GetStorefrontParams,
  IApiAdapter,
} from '@/services/api/adapters/types';
import { MOCK_ARTISTS } from '@/services/mock/artists.mock';
import { MOCK_PRODUCTS_BY_HANDLE } from '@/services/mock/products.mock';
import { MOCK_SPLIT_INVITATIONS } from '@/services/mock/splits.mock';
import { ApiClientError } from '@/types/api';
import type {
  AuthSession,
  OtpRequestPayload,
  OtpRequestResponse,
  OtpVerifyPayload,
} from '@/types/auth';
import type {
  CheckoutTransaction,
  DiscoveryArtistsResponse,
  SplitInvitationDetail,
  StorefrontDetail,
} from '@/types/models';
import { normalizeHandle } from '@/utils/url';
import {
  isValidCameroonPhone,
  isValidEmail,
  isValidOtpCode,
  isValidXafAmountMinor,
  MAX_SEARCH_QUERY_LENGTH,
} from '@/utils/validation';

function waitWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    const timer = window.setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      window.clearTimeout(timer);
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    };

    const cleanup = () => {
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const mockTransactions = new Map<
  string,
  { tx: CheckoutTransaction; pollCount: number }
>();

export class MockApiAdapter implements IApiAdapter {
  public readonly isMock = true;

  async requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse> {
    await waitWithAbort(240);
    if (!isValidCameroonPhone(payload.phone)) {
      throw new ApiClientError({
        message: 'Invalid Cameroonian phone number format. Expected +237XXXXXXXXX.',
        code: 'INVALID_INPUT',
        status: 400,
        kind: 'VALIDATION_ERROR',
      });
    }

    return {
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      isMockDemo: true,
    };
  }

  async verifyOtp(payload: OtpVerifyPayload): Promise<AuthSession> {
    await waitWithAbort(280);
    if (!isValidCameroonPhone(payload.phone) || !isValidOtpCode(payload.code)) {
      throw new ApiClientError({
        message: 'Invalid or expired verification code.',
        code: 'INVALID_OR_EXPIRED_OTP',
        status: 422,
        kind: 'UNPROCESSABLE_ENTITY',
      });
    }

    return {
      accessToken: `mock_access_${Date.now()}`,
      refreshToken: `mock_refresh_${Date.now()}`,
      user: {
        id: 'usr_mock_01',
        email: payload.email?.trim() || null,
        fullName: payload.fullName?.trim() || 'Amina N.',
        preferredLang: payload.preferredLang || 'en',
        registeredAt: new Date().toISOString(),
        phone: payload.phone,
      },
      home: {
        status: 'ready',
        artists: MOCK_ARTISTS.slice(0, 4),
        nextCursor: '4',
      },
      isMockDemo: true,
    };
  }

  async discoverArtists(
    params: DiscoverArtistsParams = {},
  ): Promise<DiscoveryArtistsResponse> {
    await waitWithAbort(220, params.signal);

    const trimmedQuery = params.q?.trim() ?? '';
    if (trimmedQuery.length > MAX_SEARCH_QUERY_LENGTH) {
      throw new ApiClientError({
        message: 'Search query exceeds maximum of 80 characters.',
        code: 'INVALID_INPUT',
        status: 400,
        kind: 'VALIDATION_ERROR',
      });
    }

    const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
    const offset = params.cursor ? Number.parseInt(params.cursor, 10) || 0 : 0;

    let pool = MOCK_ARTISTS;
    if (trimmedQuery.length > 0) {
      const needle = trimmedQuery.toLowerCase();
      pool = MOCK_ARTISTS.filter(
        (artist) =>
          artist.displayName.toLowerCase().includes(needle) ||
          artist.handle.toLowerCase().includes(needle) ||
          artist.bio.toLowerCase().includes(needle) ||
          (artist.genre && artist.genre.toLowerCase().includes(needle)) ||
          (artist.city && artist.city.toLowerCase().includes(needle)),
      );
    }

    const slice = pool.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    const nextCursor = nextOffset < pool.length ? String(nextOffset) : null;

    return {
      items: slice,
      nextCursor,
    };
  }

  async getPublicStorefront(params: GetStorefrontParams): Promise<StorefrontDetail> {
    await waitWithAbort(200, params.signal);

    const cleanHandle = normalizeHandle(params.handle).toLowerCase();
    const artist = MOCK_ARTISTS.find(
      (item) => item.handle.toLowerCase() === cleanHandle,
    );

    if (!artist) {
      throw new ApiClientError({
        message: `Storefront @${cleanHandle} was not found.`,
        code: 'STOREFRONT_NOT_FOUND',
        status: 404,
        kind: 'NOT_FOUND',
      });
    }

    const allPublishedProducts = (MOCK_PRODUCTS_BY_HANDLE[artist.handle] ?? []).filter(
      (p) => p.splitsComplete,
    );

    const limit = Math.min(Math.max(params.limit ?? 12, 1), 50);
    const offset = params.cursor ? Number.parseInt(params.cursor, 10) || 0 : 0;
    const slice = allPublishedProducts.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;

    return {
      artist,
      products: slice,
      nextCursor: nextOffset < allPublishedProducts.length ? String(nextOffset) : null,
    };
  }

  async initiateCheckout(params: CheckoutInitiateParams): Promise<CheckoutTransaction> {
    await waitWithAbort(320);
    const { request } = params;

    if (
      !isValidCameroonPhone(request.buyerPhone) ||
      !isValidEmail(request.buyerEmail) ||
      !isValidXafAmountMinor(request.expectedAmountMinor)
    ) {
      throw new ApiClientError({
        message: 'Invalid checkout details.',
        code: 'INVALID_INPUT',
        status: 400,
        kind: 'VALIDATION_ERROR',
      });
    }

    const resolvedRail = request.rail === 'orange' ? 'orange' : 'mtn';
    const txId = `mock_tx_${Date.now()}`;
    const tx: CheckoutTransaction = {
      transactionId: txId,
      currencyCode: 'XAF',
      amountMinor: request.expectedAmountMinor,
      createdAt: new Date().toISOString(),
      confirmedAt: null,
      isRegisteredBuyer: false,
      status: 'PENDING',
      rail: resolvedRail,
      guestSessionToken: `mock_guest_${Date.now()}`,
      guestSessionExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      isMockDemo: true,
    };

    mockTransactions.set(txId, { tx, pollCount: 0 });
    return tx;
  }

  async getCheckoutStatus(
    transactionId: string,
    _guestSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<CheckoutTransaction> {
    await waitWithAbort(220, signal);
    const entry = mockTransactions.get(transactionId);
    if (!entry) {
      throw new ApiClientError({
        message: 'Transaction not found.',
        code: 'TRANSACTION_NOT_FOUND',
        status: 404,
        kind: 'NOT_FOUND',
      });
    }

    entry.pollCount += 1;
    if (entry.pollCount >= 2 && entry.tx.status === 'PENDING') {
      entry.tx = {
        ...entry.tx,
        status: 'SUCCESS',
        confirmedAt: new Date().toISOString(),
      };
    }

    return { ...entry.tx };
  }

  async getSplitInvitation(
    inviteId: string,
    inviteToken: string,
  ): Promise<SplitInvitationDetail> {
    await waitWithAbort(200);
    if (!inviteToken) {
      throw new ApiClientError({
        message: 'Missing X-Invite-Token header.',
        code: 'MISSING_INVITE_TOKEN',
        status: 401,
        kind: 'UNAUTHORIZED',
      });
    }

    const found = MOCK_SPLIT_INVITATIONS[inviteId];
    if (!found) {
      throw new ApiClientError({
        message: 'Split invitation not found.',
        code: 'INVITE_NOT_FOUND',
        status: 404,
        kind: 'NOT_FOUND',
      });
    }
    return { ...found };
  }

  async respondToSplitInvitation(
    inviteId: string,
    inviteToken: string,
    decision: 'ACCEPT' | 'REJECT',
  ): Promise<SplitInvitationDetail> {
    await waitWithAbort(250);
    if (!inviteToken) {
      throw new ApiClientError({
        message: 'Missing X-Invite-Token header.',
        code: 'MISSING_INVITE_TOKEN',
        status: 401,
        kind: 'UNAUTHORIZED',
      });
    }

    const found = MOCK_SPLIT_INVITATIONS[inviteId];
    if (!found) {
      throw new ApiClientError({
        message: 'Split invitation not found.',
        code: 'INVITE_NOT_FOUND',
        status: 404,
        kind: 'NOT_FOUND',
      });
    }

    const updated: SplitInvitationDetail = {
      ...found,
      status: decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED',
    };
    MOCK_SPLIT_INVITATIONS[inviteId] = updated;
    return updated;
  }
}
