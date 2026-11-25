import type { AuthSession, OtpLoginPayload, OtpRequestPayload, OtpRequestResponse, OtpVerifyPayload, SessionTokens } from '@/types/auth';
import type {
  ArtistSummary, CheckoutInitiateRequest, CheckoutTransaction, CreatedProduct,
  DiscoveryArtistsResponse, PriceReplacement, ProductCreateRequest, ProductPricesResponse,
  SplitCreateRequest, SplitCreateResponse, SplitDecision, SplitInvitationDetail,
  StorefrontCreateRequest, StorefrontDetail, StorefrontUpdateRequest, SupportedCurrency,
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
  displayCurrency?: SupportedCurrency;
  noStore?: boolean;
  signal?: AbortSignal;
}

export interface CheckoutInitiateParams {
  request: CheckoutInitiateRequest;
  idempotencyKey: string;
}

export interface MediaOptions {
  range?: string;
  signal?: AbortSignal;
}

/** Supplied only by the approved collaborator identity integration after phone confirmation. */
export interface VerifiedCollaboratorSession {
  accessToken: string;
  phoneConfirmed: true;
}

export interface IApiAdapter {
  readonly isMock: boolean;
  requestOtp(payload: OtpRequestPayload): Promise<OtpRequestResponse>;
  verifyOtp(payload: OtpVerifyPayload): Promise<AuthSession>;
  login(payload: OtpLoginPayload): Promise<AuthSession>;
  refreshSession(refreshToken: string): Promise<SessionTokens>;
  discoverArtists(params?: DiscoverArtistsParams): Promise<DiscoveryArtistsResponse>;
  getPublicStorefront(params: GetStorefrontParams): Promise<StorefrontDetail>;
  createStorefront(request: StorefrontCreateRequest): Promise<ArtistSummary>;
  updateStorefront(id: string, request: StorefrontUpdateRequest): Promise<ArtistSummary>;
  uploadProfileImage(id: string, file: File): Promise<ArtistSummary>;
  removeProfileImage(id: string): Promise<ArtistSummary>;
  createProduct(storefrontId: string, request: ProductCreateRequest): Promise<CreatedProduct>;
  replacePrices(productId: string, request: PriceReplacement): Promise<ProductPricesResponse>;
  getProductMedia(productId: string, kind: 'audio' | 'video', options?: MediaOptions): Promise<Blob>;
  getActiveSplit(productId: string, signal?: AbortSignal): Promise<SplitCreateResponse | null>;
  createSplit(productId: string, request: SplitCreateRequest, idempotencyKey: string): Promise<SplitCreateResponse>;
  initiateCheckout(params: CheckoutInitiateParams): Promise<CheckoutTransaction>;
  getCheckoutStatus(id: string, guestSessionToken?: string, signal?: AbortSignal): Promise<CheckoutTransaction>;
  getSplitInvitation(id: string, inviteToken: string, signal?: AbortSignal): Promise<SplitInvitationDetail>;
  respondToSplitInvitation(id: string, inviteToken: string, decision: SplitDecision, session: VerifiedCollaboratorSession): Promise<SplitInvitationDetail>;
}
