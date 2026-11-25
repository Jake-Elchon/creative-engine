import { httpRequest } from '@/services/api/client';
import { API_ENDPOINTS } from '@/services/api/endpoints';
import type {
  CheckoutInitiateParams,
  DiscoverArtistsParams,
  GetStorefrontParams,
  IApiAdapter,
} from '@/services/api/adapters/types';
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

export class HttpApiAdapter implements IApiAdapter {
  public readonly isMock = false;

  requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse> {
    return httpRequest<OtpRequestResponse>(API_ENDPOINTS.AUTH_OTP_REQUEST, {
      method: 'POST',
      body: payload,
      noStore: true,
      omitAuth: true,
    });
  }

  verifyOtp(payload: OtpVerifyPayload): Promise<AuthSession> {
    return httpRequest<AuthSession>(API_ENDPOINTS.AUTH_OTP_VERIFY, {
      method: 'POST',
      body: payload,
      noStore: true,
      omitAuth: true,
    });
  }

  discoverArtists(params: DiscoverArtistsParams = {}): Promise<DiscoveryArtistsResponse> {
    return httpRequest<DiscoveryArtistsResponse>(API_ENDPOINTS.ARTISTS_DISCOVERY, {
      method: 'GET',
      query: {
        q: params.q,
        cursor: params.cursor,
        limit: params.limit,
      },
      signal: params.signal,
    });
  }

  getPublicStorefront(params: GetStorefrontParams): Promise<StorefrontDetail> {
    const cleanHandle = normalizeHandle(params.handle);
    return httpRequest<StorefrontDetail>(API_ENDPOINTS.STOREFRONT_PUBLIC(cleanHandle), {
      method: 'GET',
      query: {
        cursor: params.cursor,
        limit: params.limit,
      },
      signal: params.signal,
    });
  }

  initiateCheckout(params: CheckoutInitiateParams): Promise<CheckoutTransaction> {
    return httpRequest<CheckoutTransaction>(API_ENDPOINTS.CHECKOUT_INITIATE, {
      method: 'POST',
      body: params.request,
      headers: {
        'Idempotency-Key': params.idempotencyKey,
      },
      noStore: true,
    });
  }

  getCheckoutStatus(
    transactionId: string,
    guestSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<CheckoutTransaction> {
    const headers: Record<string, string> = {};
    if (guestSessionToken) {
      headers['X-Checkout-Token'] = guestSessionToken;
    }

    return httpRequest<CheckoutTransaction>(
      API_ENDPOINTS.CHECKOUT_STATUS(transactionId),
      {
        method: 'GET',
        headers,
        signal,
        noStore: true,
        omitAuth: Boolean(guestSessionToken),
      },
    );
  }

  getSplitInvitation(
    inviteId: string,
    inviteToken: string,
  ): Promise<SplitInvitationDetail> {
    return httpRequest<SplitInvitationDetail>(
      API_ENDPOINTS.SPLIT_INVITE_DECISION(inviteId),
      {
        method: 'GET',
        headers: {
          'X-Invite-Token': inviteToken,
        },
        noStore: true,
      },
    );
  }

  respondToSplitInvitation(
    inviteId: string,
    inviteToken: string,
    decision: 'ACCEPT' | 'REJECT',
  ): Promise<SplitInvitationDetail> {
    return httpRequest<SplitInvitationDetail>(
      API_ENDPOINTS.SPLIT_INVITE_DECISION(inviteId),
      {
        method: 'POST',
        body: { decision },
        headers: {
          'X-Invite-Token': inviteToken,
        },
        noStore: true,
      },
    );
  }
}
