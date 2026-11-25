import type {
  AuthSession,
  OtpRequestPayload,
  OtpRequestResponse,
  OtpVerifyPayload,
} from '@/types/auth';
import type {
  CheckoutInitiateRequest,
  CheckoutTransaction,
  DiscoveryArtistsResponse,
  SplitInvitationDetail,
  StorefrontDetail,
} from '@/types/models';

export interface DiscoverArtistsParams {
  q?: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface GetStorefrontParams {
  handle: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
}

export interface CheckoutInitiateParams {
  request: CheckoutInitiateRequest;
  idempotencyKey: string;
}

export interface IApiAdapter {
  readonly isMock: boolean;

  requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse>;
  verifyOtp(payload: OtpVerifyPayload): Promise<AuthSession>;

  discoverArtists(params?: DiscoverArtistsParams): Promise<DiscoveryArtistsResponse>;
  getPublicStorefront(params: GetStorefrontParams): Promise<StorefrontDetail>;

  initiateCheckout(params: CheckoutInitiateParams): Promise<CheckoutTransaction>;
  getCheckoutStatus(
    transactionId: string,
    guestSessionToken?: string,
    signal?: AbortSignal,
  ): Promise<CheckoutTransaction>;

  getSplitInvitation(inviteId: string, inviteToken: string): Promise<SplitInvitationDetail>;
  respondToSplitInvitation(
    inviteId: string,
    inviteToken: string,
    decision: 'ACCEPT' | 'REJECT',
  ): Promise<SplitInvitationDetail>;
}
