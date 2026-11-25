export type SupportedCurrency = 'XAF' | 'EUR' | 'USD';

export type PaymentRailOption = 'auto' | 'mtn' | 'orange';
export type ResolvedPaymentRail = 'mtn' | 'orange';

export type ProductType = 'MUSIC' | 'VIDEO' | 'EBOOK' | 'TIP' | 'SHOUTOUT';

export interface ArtistSummary {
  storefrontId: string;
  handle: string;
  displayName: string;
  bio: string;
  storefrontUrl: string;
  genre?: string;
  city?: string;
  avatarUrl?: string;
  coverUrl?: string;
  accentTone?: 'terracotta' | 'gold' | 'forest' | 'indigo';
}

export interface DiscoveryArtistsResponse {
  items: ArtistSummary[];
  nextCursor: string | null;
}

export interface ProductPrice {
  currency: SupportedCurrency;
  amount: number;
  isDisplayOnly: boolean;
}

export interface StorefrontProduct {
  productId: string;
  title: string;
  description: string;
  type: ProductType;
  coverUrl?: string;
  previewAvailable: boolean;
  previewDurationSeconds?: number;
  xafPrice: number;
  displayPrices?: ProductPrice[];
  splitsComplete: boolean;
  isMockDemo?: boolean;
}

export interface StorefrontDetail {
  artist: ArtistSummary;
  products: StorefrontProduct[];
  nextCursor: string | null;
}

export type SplitInvitationStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface SplitInvitationDetail {
  inviteId: string;
  productTitle: string;
  creatorDisplayName: string;
  collaboratorName: string;
  sharePercentage: number;
  status: SplitInvitationStatus;
  expiresAt: string;
  requiresPhoneVerification: boolean;
  isMockDemo?: boolean;
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
