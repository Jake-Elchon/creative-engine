export type SupportedCurrency = 'XAF' | 'EUR' | 'USD';
export type PaymentRailOption = 'auto' | 'mtn' | 'orange';
export type ResolvedPaymentRail = 'mtn' | 'orange';
export type ProductTypeCode = 'release' | 'video' | 'ebook' | 'tip' | 'shoutout';

export interface ArtistSummary {
  storefrontId: string;
  handle: string;
  displayName: string;
  bio: string | null;
  storefrontUrl: string;
  profileImageUrl?: string | null;
}

export interface DiscoveryArtistsResponse {
  items: ArtistSummary[];
  nextCursor: string | null;
}

export interface StorefrontCreateRequest {
  handle: string;
  displayName: string;
  bio?: string;
}

export interface StorefrontUpdateRequest {
  displayName?: string;
  bio?: string | null;
}

export interface ProductType {
  id: string;
  code: ProductTypeCode;
  name: string;
}

export interface ProductPrice {
  priceId: string;
  currencyCode: SupportedCurrency;
  amountMinor: number;
}

export interface StorefrontProduct {
  productId: string;
  description: string | null;
  type: ProductType;
  previewUrl: string | null;
  videoPreviewUrl?: string | null;
  prices: ProductPrice[];
  displayCurrency: SupportedCurrency;
  checkoutAvailable: boolean;
}

export interface StorefrontDetail {
  storefront: ArtistSummary;
  products: StorefrontProduct[];
  nextCursor: string | null;
}

export interface ProductCreateRequest {
  typeCode: ProductTypeCode;
  description?: string;
  videoFile?: File;
  videoPreviewFile?: File;
  audioFile?: File;
}

export interface CreatedProduct {
  productId: string;
  storefrontId: string;
  description: string | null;
  type: ProductType;
  videoUrl: string | null;
  videoPreviewUrl?: string | null;
  audioUrl: string | null;
}

export interface PriceReplacement {
  local: { currencyCode: 'XAF'; amountMinor: number };
  diaspora?: { currencyCode: 'EUR' | 'USD'; amountMinor: number } | null;
}

export interface ProductPricesResponse {
  productId: string;
  prices: ProductPrice[];
}

export type SplitInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type SplitStatus = SplitInvitationStatus | 'EXPIRED';
export type SplitDecision = 'accept' | 'reject';

export interface SplitShare {
  phone: string;
  shareBps: number;
}

export interface SplitCreateRequest {
  splits: SplitShare[];
  groupId?: string;
}

export interface SplitCreateResponse {
  splitId: string;
  productId: string;
  groupId: string | null;
  completed: boolean;
  invitations: (SplitShare & {
    inviteId: string;
    status: SplitStatus;
    collaboratorId: string | null;
  })[];
}

export interface SplitInvitationDetail {
  inviteId: string;
  splitId: string;
  productId: string;
  shareBps: number;
  status: SplitInvitationStatus;
}

export type CheckoutStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface CheckoutInitiateRequest {
  productId: string;
  buyerPhone: string;
  buyerEmail: string;
  expectedAmountMinor: number;
  rail?: PaymentRailOption;
}

export interface CheckoutTransaction {
  transactionId: string;
  currencyCode: 'XAF';
  amountMinor: number;
  createdAt: string;
  confirmedAt: string | null;
  isRegisteredBuyer: boolean;
  status: CheckoutStatus;
  rail: ResolvedPaymentRail;
  guestSessionToken?: string;
  guestSessionExpiresAt?: string;
  isMockDemo?: boolean;
}
